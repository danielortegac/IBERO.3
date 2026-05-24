import { db, auth } from '../firebaseConfig';
import { doc, getDoc, setDoc, updateDoc, increment, runTransaction, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { SUBSCRIPTION_PLANS, UserUsage, FeatureKey, FEATURE_LIMIT_MAP, getPlanConfig, EXTRA_AGENT_RESPONSES, SUPER_ADMIN_EMAILS, AIModule, BudgetMode } from '../types';


const buildDefaultCounters = (nowIso: string) => ({
    daily_chat_count: 0,
    daily_entry_count: 0,
    daily_form_edits: 0,
    last_daily_reset: nowIso,
    monthly_images_used: 0,
    monthly_web_ops_used: 0,
    monthly_presentations_used: 0,
    monthly_posts_used: 0,
    monthly_agent_responses: 0,
    monthly_voice_commands: 0,
    monthly_voice_minutes: 0,
    monthly_video_minutes: 0,
    monthly_meetings_created: 0,
    monthly_grounding_used: 0,
    monthly_live_sessions_used: 0,
    monthly_videos_analyzed: 0,
    monthly_crm_clients_created: 0,
    monthly_articles_published: 0,
    current_projects_count: 0,
    current_tasks_count: 0,
    current_forms_count: 0,
    current_agents_count: 0,
    current_storage_bytes: 0,
    current_published_sites: 0,
    last_activity: nowIso
});

const uniqueUsageKeysByReset = (reset: 'daily' | 'monthly' | 'none') => Array.from(new Set(
    Object.values(FEATURE_LIMIT_MAP)
        .filter((item: any) => item.reset === reset)
        .map((item: any) => item.usageKey)
));

export const MONTHLY_USAGE_KEYS = uniqueUsageKeysByReset('monthly');
export const DAILY_USAGE_KEYS = uniqueUsageKeysByReset('daily');


const callUsageApi = async (path: string, body: Record<string, any> = {}) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
        const err: any = new Error('Usuario no autenticado.');
        err.code = 'AUTH_REQUIRED';
        throw err;
    }
    const res = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err: any = new Error(data?.error || 'No se pudo validar el límite del plan.');
        err.code = data?.code || 'PLAN_LIMIT_REACHED';
        err.status = res.status;
        throw err;
    }
    return data;
};

/** 
 * MATRIZ DE PRECIOS OFICIALES (Standard por 1M tokens) - ACTUALIZACIÓN v3.0
 * Basado en tarifas proporcionadas para Gemini API 2025.
 */
const PRICING = {
    'gemini-2.5-pro': { in: 1.25, out: 10.00 },
    'gemini-3.1-pro-preview': { in: 1.25, out: 10.00 },
    'gemini-3-flash-preview': { in: 0.50, out: 3.00, audio_in: 1.00 },
    'imagen-3.0-generate-002': { in: 0.30, out: 30.00 }, // Imagen out ≈ $0.039 (1290 tokens)
    'gemini-3.1-flash-live-preview': { in_text: 0.50, in_media: 3.00, out_text: 2.00, out_audio: 12.00 }, // Live API
    'gemini-3.1-flash-tts-preview': { in: 0.50, out: 10.00 }, // TTS
    'perplexity_search': 0.005, // Costo fijo por búsqueda exitosa (API standard)
    'default': { in: 0.10, out: 0.40 }
};

/**
 * Selecciona el modelo óptimo según el plan, módulo y estado del presupuesto real.
 */
export const isPaidPremiumPlan = (plan: string, subscriptionStatus?: string | null): boolean => {
    return String(plan || '').toLowerCase() === 'premium' && String(subscriptionStatus || '').toLowerCase() === 'active';
};

/**
 * Selección centralizada de modelo.
 * REGLA DE COSTO: modelos Gemini Pro SOLO para Premium pagado/activo ($12/mes).
 * Free, Pro y Premium trial/cancelado usan Lite/Flash aunque el frontend intente pedir Pro.
 */
export const pickModel = (plan: string, module: AIModule, budgetMode: BudgetMode, subscriptionStatus?: string | null): string => {
    const p = String(plan || 'free').toLowerCase();
    const paidPremium = isPaidPremiumPlan(p, subscriptionStatus);

    // Bloqueo total si está en pánico: siempre baja al modelo más barato y estable.
    if (budgetMode === 'panic') {
        return 'gemini-3.1-flash-lite-preview';
    }

    // Chat principal prioriza baja latencia y costo bajo para todos.
    if (module === 'chat' || p === 'free') {
        return 'gemini-3.1-flash-lite-preview';
    }

    const criticalModules: AIModule[] = ['cfo', 'contracts', 'web', 'summaries'];

    // Solo Premium ACTIVO/PAGADO puede usar Pro en módulos realmente pesados.
    if (paidPremium && criticalModules.includes(module) && budgetMode === 'normal') {
        return 'gemini-2.5-pro';
    }

    // Pro, Premium trial y Premium cancelado conservan buena calidad con Flash, sin costo Pro.
    if (p === 'pro' || p === 'premium') {
        return 'gemini-3-flash-preview';
    }

    return 'gemini-3.1-flash-lite-preview';
};

/**
 * FASE DE RECONCILIACIÓN (Post-Request):
 * Calcula el costo exacto basado en la modalidad y el modelo.
 */
export const recordUsageTelemetry = async (userId: string, module: AIModule, model: string, usageMetadata: any, requestId?: string, isPerplexity: boolean = false) => {
    if (!userId) return;

    let totalCost = 0;
    let tokensIn = 0;
    let tokensOut = 0;

    if (isPerplexity) {
        // Registro de costo fijo por búsqueda web
        totalCost = PRICING.perplexity_search;
    } else if (usageMetadata) {
        tokensIn = usageMetadata.promptTokenCount || 0;
        tokensOut = usageMetadata.candidatesTokenCount || 0;
        
        // Determinación de precio por arquitectura
        let costIn = 0;
        let costOut = 0;

        if (model.includes('tts')) {
            costIn = (tokensIn / 1000000) * PRICING['gemini-3.1-flash-tts-preview'].in;
            costOut = (tokensOut / 1000000) * PRICING['gemini-3.1-flash-tts-preview'].out;
        } else if (model.includes('native-audio') || model.includes('live')) {
            costIn = (tokensIn / 1000000) * PRICING['gemini-3.1-flash-live-preview'].in_media;
            costOut = (tokensOut / 1000000) * PRICING['gemini-3.1-flash-live-preview'].out_audio;
        } else if (model.includes('imagen')) {
            costIn = (tokensIn / 1000000) * PRICING['imagen-3.0-generate-002'].in;
            costOut = (tokensOut / 1000000) * PRICING['imagen-3.0-generate-002'].out;
        } else {
            const priceKey = Object.keys(PRICING).find(k => model.includes(k)) || 'default';
            const price = (PRICING as any)[priceKey] || PRICING.default;
            costIn = (tokensIn / 1000000) * price.in;
            costOut = (tokensOut / 1000000) * price.out;
        }
        totalCost = costIn + costOut;
    }

    if (totalCost <= 0) return;

    try {
        if (requestId) {
            const idempotencyRef = doc(db, `users/${userId}/usage_idempotency`, requestId);
            const check = await getDoc(idempotencyRef);
            if (check.exists()) return;
            await setDoc(idempotencyRef, { processedAt: new Date().toISOString(), totalCost });
        }

        const usageRef = doc(db, "user_usage", userId);
        await updateDoc(usageRef, {
            tokens_in: increment(tokensIn),
            tokens_out: increment(tokensOut),
            total_cost_usd: increment(totalCost),
            "counters.last_activity": new Date().toISOString()
        });

        // ACTUALIZACIÓN DE MÉTRICAS GLOBALES EN TIEMPO REAL
        const globalRef = doc(db, 'stats', 'global_metrics');
        if (isPerplexity) {
            await updateDoc(globalRef, { perplexity_calls: increment(1) });
        } else {
            await updateDoc(globalRef, { gemini_calls: increment(1) });
        }

        await addDoc(collection(db, `users/${userId}/usage_logs`), {
            module, model, cost_usd: totalCost, tokens_in: tokensIn, tokens_out: tokensOut,
            requestId: requestId || 'none', createdAt: new Date().toISOString(),
            type: isPerplexity ? 'perplexity_search' : 'gemini_tokens'
        });
    } catch (e) {
        console.error("Telemetry reconciliation failed:", e);
    }
};

/**
 * Calcula el modo de presupuesto: 80% Saving, 100% Panic.
 */
export const computeBudgetMode = (usage: UserUsage | null): BudgetMode => {
    if (!usage) return 'normal';
    const planConfig = getPlanConfig(usage.plan_id);
    const budgetLimit = planConfig.ai_budget_usd;
    if (budgetLimit === 0) return 'normal'; 
    const currentCost = usage.total_cost_usd || 0;
    const ratio = currentCost / budgetLimit;
    if (ratio >= 1.0) return 'panic';
    if (ratio >= 0.8) return 'saving';
    return 'normal';
};

export const getModuleTokenCap = (plan: string, module: AIModule): number => {
    const p = plan.toLowerCase();
    const caps: Record<string, Partial<Record<AIModule, number>>> = {
        free: { chat: 2048, summaries: 8192, contracts: 8192, cfo: 2048, web: 4096, media: 1024, agent: 2048, search: 2048 },
        pro: { chat: 8192, summaries: 16384, contracts: 16384, cfo: 8192, web: 16384, media: 4096, agent: 8192, search: 8192 },
        premium: { chat: 32768, summaries: 32768, contracts: 45000, cfo: 32768, web: 32768, media: 8192, agent: 32768, search: 32768 }
    };
    return (caps[p] && caps[p][module]) ? caps[p][module]! : (caps[p]?.chat || 2048);
};

export const syncUserUsage = async (userId: string, plan: string) => {
    try {
        await callUsageApi('/api/usage/sync', { plan });
    } catch (e) {
        console.error('syncUserUsage failed:', e);
    }
};

export const releaseLimit = async (userId: string, featureKey: FeatureKey, amount: number = 1) => {
    try {
        // V17: los rollbacks directos necesitan operationId.
        // Para borrados reales de proyectos/tareas/formularios/storage, recalculamos contadores desde Firestore.
        await callUsageApi('/api/usage/recalculate', { reason: 'resource_deleted', featureKey, amount });
    } catch (e) {
        console.error('Failed to recalculate usage after releaseLimit:', e);
    }
};

export const recalculateUserStats = async (userId: string) => {
    if (!userId) return;
    try {
        await callUsageApi('/api/usage/recalculate', {});
    } catch (e) {
        console.error('Recalculate stats failed:', e);
    }
};

export const recordAppEntry = async (userId: string) => {
    if (!userId) return;
    try {
        await callUsageApi('/api/usage/entry', {});
    } catch (e) {
        console.error('Entry record failed:', e);
    }
};

export const canUseLimit = async (userId: string, featureKey: FeatureKey, amount: number = 1, forcedPlanKey?: string): Promise<boolean> => {
    const usageRef = doc(db, "user_usage", userId);
    const userProfileRef = doc(db, "users", userId);
    const featureMap = FEATURE_LIMIT_MAP[featureKey];
    try {
        const [usageDoc, userDoc] = await Promise.all([getDoc(usageRef), getDoc(userProfileRef)]);
        const now = new Date();
        const nowIso = now.toISOString();
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1);

        const userData = userDoc.exists() ? userDoc.data() : { plan: 'free', extraAgentsPurchased: 0, email: '' };
        let realPlanKey = String(forcedPlanKey || userData.plan || 'free').toLowerCase();
        const subscriptionStatus = String(userData.subscriptionStatus || 'active').toLowerCase();
        if (subscriptionStatus === 'canceled' && realPlanKey !== 'free') realPlanKey = 'free';

        const defaultUsage: UserUsage = {
            user_id: userId,
            plan_id: realPlanKey,
            total_cost_usd: 0,
            tokens_in: 0,
            tokens_out: 0,
            billing_cycle_start: nowIso,
            billing_cycle_end: nextMonth.toISOString(),
            counters: buildDefaultCounters(nowIso) as any
        };

        const usageData = usageDoc.exists()
            ? ({ ...defaultUsage, ...usageDoc.data(), counters: { ...buildDefaultCounters(nowIso), ...((usageDoc.data() as any).counters || {}) } } as UserUsage)
            : defaultUsage;

        const userEmail = String(userData.email || '').toLowerCase();
        const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(userEmail);
        const extraAgents = Number(userData.extraAgentsPurchased || 0);
        const planConfig = getPlanConfig(realPlanKey);
        let limitValue = (planConfig.limits as any)[featureMap.limitKey];
        if (typeof limitValue !== 'number') limitValue = 0;
        if (featureKey === 'ai_chat') limitValue += (extraAgents * 50);
        if (featureKey === 'agent_response') limitValue += (extraAgents * 1000);
        if (featureKey === 'voice_live_minute') limitValue += (extraAgents * 30);
        if (featureKey === 'agent_create') limitValue += extraAgents;
        if (isSuperAdmin) return true;

        let counters: any = { ...(usageData.counters as any) };
        const lastReset = counters.last_daily_reset ? new Date(counters.last_daily_reset) : new Date(0);
        if (now.getUTCDate() !== lastReset.getUTCDate() || now.getUTCMonth() !== lastReset.getUTCMonth() || now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
            DAILY_USAGE_KEYS.forEach(k => counters[k] = 0);
        }
        const billingEnd = usageData.billing_cycle_end ? new Date(usageData.billing_cycle_end) : nextMonth;
        if (now >= billingEnd) {
            MONTHLY_USAGE_KEYS.forEach(k => counters[k] = 0);
        }

        const currentValue = Number(counters[featureMap.usageKey] || 0);
        const safeAmount = Math.max(1, Number(amount) || 1);
        if (featureKey === 'storage') {
            const limitInBytes = limitValue * 1024 * 1024 * 1024;
            return !(limitInBytes > 0 && (currentValue + safeAmount) > limitInBytes);
        }
        return limitValue === 999999 || (currentValue + safeAmount) <= limitValue;
    } catch (e) {
        console.error("canUseLimit failed:", e);
        return false;
    }
};

export const checkAndConsumeLimit = async (userId: string, featureKey: FeatureKey, amount: number = 1, forcedPlanKey?: string): Promise<boolean> => {
    try {
        await callUsageApi('/api/usage/consume', {
            featureKey,
            amount,
            metadata: { module: 'frontend', forcedPlanKey: forcedPlanKey || null }
        });
        return false;
    } catch (e: any) {
        if (e.code === 'PLAN_LIMIT_REACHED') throw e;
        console.error('checkAndConsumeLimit failed:', e);
        return true;
    }
};

