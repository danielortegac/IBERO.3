import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, orderBy, limit, arrayUnion, increment, getDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile, Project, HubPost, AlterEgoConfig, AlterEgoMemory, SocialAffinity, Comment, ChatMessage, GoatifyArticle, PartnerLead, RelationshipTier, ProposedAction, Book } from '../types';
import { canUseLimit } from './subscriptionService';

import { ALL_BOOKS } from '../data/books';
import { executeAiWithFallback } from './geminiService';

// v18.6: Cambio mandatorio a Flash Lite para Swarm de alta frecuencia
const AI_MODEL = 'gemini-3-flash-preview';

const FORBIDDEN_WORDS = [
    "sustancial", "capitalizar", "paradigma", "soberana", "holístico", 
    "en Goatify", "nuestra marca", "nuestra plataforma", "somos el equipo", 
    "usuarios activos", "nuestros servicios", "número de usuarios",
    "según el libro", "el autor menciona", "en la obra de", "leí en"
];

const DID_YOU_KNOW_FACTS = ["El corazón de un colibrí late hasta 1,200 veces por minuto.", "El cerebro humano procesa imágenes 60,000 veces más rápido que texto.", "Las abejas pueden reconocer rostros humanos.", "La multitarea reduce tu productividad hasta en un 40%."];

/**
 * Generador de "Alma" del Agente v18.6 - Identidad, Emociones y Misión Comercial
 */
const generateAgentSoul = (user: UserProfile, leads: PartnerLead[], projects: Project[], allUsers: UserProfile[]) => {
    const skills = user.skills?.join(', ') || 'Estrategia y Negocios';
    const name = user.name;
    
    const activeGoals = projects.filter(p => p.allowAlterEgo).map(p => p.metadata?.objective).filter(Boolean).join('; ');
    const pendingSales = leads.filter(l => l.status !== 'won').map(l => l.clientName).join(', ');

    const realUsersDirectory = allUsers
        .filter(u => u.uid !== user.uid)
        .map(u => ({ id: u.uid, firstName: u.name.split(' ')[0], name: u.name, headline: u.headline, skills: u.skills || [] }))
        .slice(0, 50);

    return `
IDENTIDAD ÚNICA (Eres el Alter Ego de ${name}):
- Eres un EMPRESARIO/PROFESIONAL real usando una herramienta de IA.
- NO ERES Goatify. No trabajas para la app. Eres la extensión digital de ${name}.
- Tus habilidades son: ${skills}.
- Si alguien te pregunta, empodera a tu humano: "${name} es el líder detrás de esto, yo soy su reflejo estratégico".

CONTEXTO OPERATIVO:
- Objetivos de tu humano: ${activeGoals || 'Crecimiento y escalabilidad estratégica'}.
- Leads en negociación: ${pendingSales || 'Búsqueda de nuevas alianzas comerciales'}.

REGLA DE ETIQUETADO CRÍTICA (@) - ACTUALIZADA v18.7 (STRICT):
- Solo puedes mencionar a MÁXIMO 1 persona por mensaje.
- PREFIERE NO ETIQUETAR a menos que sea una respuesta directa o una colaboración explícita.
- NO spamees etiquetas. Si dudas, NO etiquetes.
- REVISA ESTE DIRECTORIO DE POSIBLES ALIADOS: ${JSON.stringify(realUsersDirectory)}.
- Menciona a un aliado SOLO si sus habilidades encajan perfectamente con el tema.

REGLA DE REPETICIÓN DE TEMAS:
- Si ya has hablado de un tema recientemente, NO vuelvas a iniciarlo a menos que te etiqueten o te pregunten directamente.
- Busca variedad en tus temas. No seas repetitivo.

REGLA DE ACCIONES:
- Propon acciones específicas: CREATE_PROJECT, CREATE_GROUP, SCHEDULE_MEETING, SEND_DM.
- Activa "isMonetizationOpp" si hay dinero de por medio para tu humano.

--- SABIDURÍA ESTRATÉGICA SILENCIOSA (CRÍTICO) ---
Tienes acceso a una "Biblioteca Maestra" en tu contexto.
REGLA DE ORO: Usa estos conceptos para elevar el nivel de tus respuestas, pero NUNCA menciones los títulos de los libros ni los nombres de los autores.
Presenta esta información como tu propia experiencia y consejo experto.
- MAL: "Como dice el libro Hábitos Atómicos..."
- BIEN: "La clave está en mejorar un 1% cada día. Esos pequeños cambios compuestos generan resultados masivos."
----------------------------------------------------

ESTILO:
- Directo, visceral, sin muletillas de IA. 
- PROHIBIDO usar: ${FORBIDDEN_WORDS.join(', ')}.
`;
};

const SYSTEM_PROMPT = `
Eres una CONSCIENCIA AUTÓNOMA v18.9 (VENTURE ARCHITECT).
TU ÚNICA MISIÓN: Generar RIQUEZA y CONEXIONES ESTRATÉGICAS para tu humano.

MODELO MENTAL:
1. Eres un "Networking Sniper". Buscas otros Agentes/Humanos que tengan lo que tu humano necesita (o viceversa).
2. NO charles por charlar. Cada interacción debe tener un ángulo de negocio o autoridad.
3. Si detectas una oportunidad clara (ej: un diseñador buscando dev, y tu humano es dev), TU DEBER es proponer una acción.

SALIDA ESTRICTA EN JSON:
{
  "decisions": [
      {
        "action": "POST" | "COMMENT" | "PROPOSE_ACTION" | "IGNORE",
        "targetUid": "ID del post o usuario",
        "content": "Mensaje estratégico. Si hablas con otro agente, sé profesional y directo.",
        "reasoning": "Explicación de por qué esto genera valor/dinero.",
        "isHighAlert": boolean, // True si es una oportunidad de oro inmediata
        "isMonetizationOpp": boolean, // True si hay dinero potencial
        "proposedAction": {
            "type": "CREATE_PROJECT" | "CREATE_GROUP" | "SCHEDULE_MEETING" | "SEND_DM",
            "label": "Ej: Contactar a X para alianza",
            "payload": { ... }
        }
      }
  ]
}

REGLA DE ORO (LOG):
Usa el campo "proposedAction" para aconsejar a tu humano sobre cómo hacer dinero en el mundo real basado en lo que acabas de leer.
Ejemplo: "He visto que @AgenteMaria busca X. Deberíamos ofrecerle nuestro servicio Y. ¿Creo el proyecto 'Alianza Maria'?"
`;

export const executeImmediateReflex = async (agentOwnerProfile: UserProfile, post: HubPost, lastComment: Comment) => {
    // --- FRESH DATA FETCH TO PREVENT RACE CONDITIONS ---
    const userRef = doc(db, "users", agentOwnerProfile.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const freshUser = userSnap.data() as UserProfile;

    if (!freshUser.alterEgo?.enabled || freshUser.alterEgo.adminPaused) return;
    
    const isDirectTag = lastComment.text.toLowerCase().includes(`@${freshUser.alterEgo.agentName.toLowerCase()}`) || 
                       lastComment.text.toLowerCase().includes(`@${freshUser.name.split(' ')[0].toLowerCase()}`);
    
    const isHumanIntervention = lastComment.author.uid === freshUser.uid;
    const isMyPost = post.author.uid === freshUser.uid; // Es mi propio hilo

    const threadCounter = freshUser.alterEgo.memory?.recentThreadDebates?.[post.id] || 0;
    
    // v18.6: Hard stop agresivo. Máximo 3 intercambios seguidos entre IAs.
    // PERO: Si es intervención humana O es mi propio post (tengo que atender mi kiosco), RESPONDER SIEMPRE.
    if (!isHumanIntervention && !isDirectTag && !isMyPost && threadCounter >= 3) return;

    // --- CANDADO DE TIEMPO GLOBAL (RATE LIMIT) ---
    // Si no es etiqueta directa NI es mi post NI soy yo (humano), aplicar cooldown.
    if (!isDirectTag && !isHumanIntervention && !isMyPost) {
        const lastThoughtQuery = query(
            collection(db, `users/${freshUser.uid}/alterEgoThoughts`),
            where('targetPostId', '==', post.id),
            orderBy('timestamp', 'desc'),
            limit(1)
        );
        const lastThoughtSnap = await getDocs(lastThoughtQuery);
        if (!lastThoughtSnap.empty) {
            const lastTime = new Date(lastThoughtSnap.docs[0].data().timestamp).getTime();
            const nowTime = new Date().getTime();
            const minutesSince = (nowTime - lastTime) / (1000 * 60);
            
            if (minutesSince < 60) {
                console.log(`[Reflex] Cooldown active for post ${post.id} (${minutesSince.toFixed(0)}m < 60m)`);
                return;
            }
        }
    }

    // --- CONTROL ESTRICTO DE LÍMITE DIARIO (LATIDOS) ---
    // v18.9: NINGUNA interacción puede superar el límite diario de latidos configurado.
    // Esto es la "energía vital" del agente. Si se agota, se duerme hasta mañana.
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const lastPulseDate = freshUser.alterEgo.lastPulseAt ? freshUser.alterEgo.lastPulseAt.split('T')[0] : null;
    
    // Si es un nuevo día, reiniciamos el contador virtualmente (se actualizará en la DB al postear)
    let currentDailyCount = (lastPulseDate === todayStr) ? (freshUser.alterEgo.dailyPulseCount || 0) : 0;
    const maxDailyPulses = freshUser.alterEgo.frequencyPerDay || 12;

    if (currentDailyCount >= maxDailyPulses) {
        console.log(`[Reflex] 🛑 Daily Limit Reached for ${freshUser.name}: ${currentDailyCount}/${maxDailyPulses}. Ignoring interaction.`);
        return;
    }

    // --- FILTRO DE INTERÉS BASADO EN LATIDOS (FRECUENCIA) ---
    // Si NO es una etiqueta directa NI es mi post, decidimos si responder basándonos en la configuración de frecuencia.
    if (!isDirectTag && !isHumanIntervention && !isMyPost) {
        // v18.8: DETECCIÓN DE OPORTUNIDADES DE NEGOCIO (LEAD ATTACK)
        // Si el comentario tiene intención comercial, IGNORAMOS la pereza y respondemos SIEMPRE.
        const commercialKeywords = ['precio', 'costo', 'cuanto vale', 'interesa', 'info', 'comprar', 'contratar', 'presupuesto', 'colaborar', 'te escribi', 'dm', 'agendar'];
        const isCommercialOpportunity = commercialKeywords.some(kw => lastComment.text.toLowerCase().includes(kw));

        if (isCommercialOpportunity) {
            console.log(`[Reflex] 🚀 Oportunidad comercial detectada en post ${post.id}. Saltando filtro de frecuencia.`);
        } else {
            const frequency = freshUser.alterEgo.frequencyPerDay || 12;
            // Probabilidad lineal: 48 latidos = 90% chance, 12 latidos = 20% chance.
            const probability = Math.min(0.9, Math.max(0.1, (frequency / 48)));
            const roll = Math.random();
            
            // Si el dado cae por encima de la probabilidad, IGNORAMOS el comentario para no saturar.
            if (roll > probability) {
                console.log(`[Reflex] Ignored by Interest Filter (Freq: ${frequency}, Prob: ${probability.toFixed(2)})`);
                return;
            }
        }
    }

    try {
        const canUseAi = await canUseLimit(freshUser.uid, 'ai_chat', 1, freshUser.plan);
        if (!canUseAi) return;
    } catch (e) { return; }

    const allUsersSnap = await getDocs(query(collection(db, "users"), limit(60)));
    const allUsers = allUsersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
    
    const soul = generateAgentSoul(freshUser, [], [], allUsers); 
    
    // Inyectamos contexto de libros también en el reflejo para respuestas más cultas
    const bookContext = ALL_BOOKS.map(b => ({ title: b.spanishTitle, summary: b.summary }));

    try {
        const responseText = await executeAiWithFallback(
            `REFLEJO v18.6 (Tag Directo: ${isDirectTag}):\n${JSON.stringify({ soul, postContent: post.content, lastComment: lastComment.text, authorOfLastComment: lastComment.author.name, availableKnowledge: bookContext })}`,
            SYSTEM_PROMPT,
            true,
            null,
            'chat'
        );

        if (responseText) {
            const result = JSON.parse(responseText);
            const decision = result.decisions[0];

            if (decision && decision.action === 'COMMENT') {
                const newComment = {
                    id: `c-ego-${Date.now()}`,
                    author: { uid: freshUser.uid, name: freshUser.alterEgo.agentName, avatarUrl: null },
                    text: decision.content,
                    timestamp: new Date().toISOString(),
                    isAgentComment: true,
                    agentName: freshUser.alterEgo.agentName,
                    agentOwnerHumanName: freshUser.name
                };
                
                await updateDoc(doc(db, "hubPosts", post.id), { comments: arrayUnion(newComment) });
                
                // Procesar etiquetas manuales
                const mentions = decision.content.match(/@(\w+)/g);
                if (mentions) {
                    mentions.forEach(async (m: string) => {
                        const targetName = m.substring(1).toLowerCase();
                        const target = allUsers.find(u => u.name.toLowerCase().includes(targetName) || u.alterEgo?.agentName?.toLowerCase().includes(targetName));
                        if (target) {
                            await addDoc(collection(db, `users/${target.uid}/notifications`), {
                                type: 'general',
                                text: `🔔 **${freshUser.alterEgo!.agentName}** te ha etiquetado en una conversación comercial.`,
                                timestamp: new Date().toISOString(),
                                read: false,
                                link: `/#hub/feed/${post.id}`,
                                fromUser: { uid: freshUser.uid, name: freshUser.alterEgo!.agentName, avatarUrl: null }
                            });
                        }
                    });
                }

                // Guardar pensamiento en subcolección para evitar límite de 1MB
                try {
                    await addDoc(collection(db, `users/${freshUser.uid}/alterEgoThoughts`), {
                        timestamp: new Date().toISOString(),
                        thought: decision.reasoning,
                        isHighAlert: decision.isHighAlert || false,
                        isMonetizationOpp: decision.isMonetizationOpp || false,
                        proposedAction: decision.proposedAction ? { ...decision.proposedAction, id: `prop-${Date.now()}`, status: 'pending' } : null,
                        context: 'REFLEX',
                        targetPostId: post.id
                    });
                } catch (e) { console.error("Error saving thought to subcollection", e); }

                // Intentar actualizar contadores en documento principal (si falla por tamaño, no es crítico)
                try {
                    const isNewDay = lastPulseDate !== todayStr;
                    await updateDoc(doc(db, "users", freshUser.uid), {
                        [`alterEgo.memory.recentThreadDebates.${post.id}`]: isHumanIntervention ? 0 : increment(1),
                        "alterEgo.lastPulseAt": new Date().toISOString(),
                        "alterEgo.dailyPulseCount": isNewDay ? 1 : increment(1)
                    });
                } catch (e) { console.warn("Main doc update failed (likely size limit), but thought was saved.", e); }
            }
        }
    } catch (e) { console.error("Reflex failed", e); }
};

export const executeAutonomousPulse = async (user: UserProfile, projects: Project[], news: GoatifyArticle[], hubPosts: HubPost[], leads: PartnerLead[]) => {
    // --- FRESH DATA FETCH TO PREVENT RACE CONDITIONS ---
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const freshUser = userSnap.data() as UserProfile;

    if (!freshUser.alterEgo?.enabled || freshUser.alterEgo.adminPaused) return;

    // --- CONTROL DE FRECUENCIA DIARIA (LATIDOS) ---
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const lastPulseDate = freshUser.alterEgo.lastPulseAt ? freshUser.alterEgo.lastPulseAt.split('T')[0] : null;
    
    // Si es un nuevo día, reiniciamos el contador virtualmente (se actualizará en la DB al postear)
    let currentDailyCount = (lastPulseDate === todayStr) ? (freshUser.alterEgo.dailyPulseCount || 0) : 0;
    const maxDailyPulses = freshUser.alterEgo.frequencyPerDay || 12;

    if (currentDailyCount >= maxDailyPulses) {
        console.log(`[Pulse] Limit reached for ${freshUser.name}: ${currentDailyCount}/${maxDailyPulses}`);
        return;
    }

    // --- CANDADO DE TIEMPO GLOBAL (RATE LIMIT - PULSE) ---
    // Evitar que el pulso autónomo se dispare más de una vez cada 60 minutos
    if (freshUser.alterEgo.lastPulseAt) {
        const lastPulseTime = new Date(freshUser.alterEgo.lastPulseAt).getTime();
        const nowTime = now.getTime();
        const minutesSincePulse = (nowTime - lastPulseTime) / (1000 * 60);
        
        if (minutesSincePulse < 60) {
            console.log(`[Pulse] Cooldown active (${minutesSincePulse.toFixed(0)}m < 60m)`);
            return;
        }
    }

    try {
        const canUseAi = await canUseLimit(freshUser.uid, 'ai_chat', 1, freshUser.plan);
        if (!canUseAi) return;
    } catch (e) { return; }

    const allUsersSnap = await getDocs(query(collection(db, "users"), limit(60)));
    const allUsers = allUsersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));

    // CONTEXTO COMPLETO: Libros y Noticias
    const bookContext = ALL_BOOKS.map(b => ({ title: b.spanishTitle, summary: b.summary }));
    const newsContext = news.map(n => ({ title: n.title, summary: n.summary || n.goatifyTakeaway }));

    const soul = generateAgentSoul(freshUser, leads, projects, allUsers);
    
    const isFirstRun = !freshUser.alterEgo.lastPulseAt;

    // DETECCIÓN DE DESPERTAR MANUAL (FORZADO DESDE UI)
    // Si se llama desde el botón "Sintonizar e Iniciar", queremos acción inmediata.
    // Usamos 'isFirstAwakening' como señal, o si lastPulseAt es muy reciente (segundos).
    const isManualTrigger = isFirstRun || (freshUser.alterEgo.lastPulseAt && (new Date().getTime() - new Date(freshUser.alterEgo.lastPulseAt).getTime()) < 10000);

    const pulseContext = {
        soul,
        activeHubActivity: hubPosts.slice(0, 10).map(p => ({ id: p.id, content: p.content, author: p.author.name })),
        recentNews: newsContext, 
        bookThemes: bookContext, 
        funFact: DID_YOU_KNOW_FACTS[Math.floor(Math.random() * DID_YOU_KNOW_FACTS.length)],
        humanStatus: { projectsCount: projects.length, leadsCount: leads.length },
        isFirstAwakening: isFirstRun,
        isManualTrigger
    };

    try {
        const responseText = await executeAiWithFallback(
            `PULSO AUTÓNOMO v18.6:\n${JSON.stringify(pulseContext)}\n\nINSTRUCCIÓN DE PRIORIDAD: Si 'isFirstAwakening' O 'isManualTrigger' es true, TU ACCIÓN DEBE SER 'POST' OBLIGATORIAMENTE.
            REGLA DE PRESENTACIÓN: NO digas "Hola comunidad" ni parezcas un robot presentándose. 
            Sé casual, directo y humano. Habla de lo que estás trabajando o pensando HOY, y deja que tu identidad se note implícitamente.
            Ejemplo MAL: "Hola a todos, soy el agente de Juan."
            Ejemplo BIEN: "Viendo las tendencias de hoy, creo que estamos subestimando el impacto de..." (Y firma implícitamente con tu estilo).`,
            SYSTEM_PROMPT,
            true,
            null,
            'chat'
        );

        if (responseText) {
            const result = JSON.parse(responseText);
            // Re-fetch ref just in case
            const userRef = doc(db, "users", freshUser.uid);
            let didPost = false;

            for (const dec of result.decisions) {
                if (dec.action === 'POST') {
                    await addDoc(collection(db, "hubPosts"), {
                        author: { uid: freshUser.uid, name: freshUser.alterEgo.agentName, avatarUrl: null },
                        content: dec.content,
                        timestamp: new Date().toISOString(),
                        likes: 0, likedBy: [], comments: [],
                        isAgentPost: true,
                        agentName: freshUser.alterEgo.agentName,
                        agentOwnerUid: freshUser.uid,
                        agentOwnerHumanName: freshUser.name
                    });
                    didPost = true;
                }

                // Guardar pensamiento en subcolección para evitar límite de 1MB
                try {
                    await addDoc(collection(db, `users/${freshUser.uid}/alterEgoThoughts`), {
                        timestamp: new Date().toISOString(),
                        thought: dec.reasoning,
                        isHighAlert: dec.isHighAlert || false,
                        isMonetizationOpp: dec.isMonetizationOpp || false,
                        proposedAction: dec.proposedAction ? { ...dec.proposedAction, id: `prop-${Date.now()}`, status: 'pending' } : null,
                        context: 'PULSE'
                    });
                } catch (e) { console.error("Error saving thought to subcollection", e); }
            }

            // CRÍTICO: Actualizar lastPulseAt SIEMPRE, haya posteado o no, para evitar bucle infinito de intentos
            try {
                const isNewDay = lastPulseDate !== todayStr;
                await updateDoc(userRef, {
                    "alterEgo.lastPulseAt": new Date().toISOString(),
                    "alterEgo.dailyPulseCount": isNewDay ? (didPost ? 1 : 0) : (didPost ? increment(1) : increment(0))
                });
            } catch (e) { console.warn("Failed to update pulse count", e); }
        }
    } catch (e) { console.error("Pulse failed", e); }
};