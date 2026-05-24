import * as XLSX from 'xlsx';
import { Project, UserProfile, AspectRatio, ChatMessage, WebDevMessage, Document, SocialPost, PresentationSlide, TtsVoice, ProjectClient, FinancialState, ProjectMetadata, PartnerLead, GoatifyArticle, AiFinanceReport, AiTask, AIModule } from '../types';
import { db, auth } from '../firebaseConfig';
import { doc, getDoc, setDoc, collection, query, where, limit, getDocs, updateDoc } from 'firebase/firestore';
import { getModuleTokenCap, computeBudgetMode, recordUsageTelemetry, pickModel, checkAndConsumeLimit } from './subscriptionService';
import { searchWithPerplexity } from './perplexityService';
import { ALL_BOOKS } from '../data/books';

// Mock for Type from @google/genai to avoid deep refactoring
export const Type: any = {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    ARRAY: 'ARRAY',
    BOOLEAN: 'BOOLEAN'
};

// Logo oficial de la aplicación
const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";

const getAiChatResponse = async (prompt: string, config?: any) => {
    return await executeAiWithFallback(prompt, config?.systemInstruction || "Eres Shivo.", false, null, 'chat');
};

// --- CONFIGURACIÓN DE ORQUESTACIÓN PRIORIZANDO ESTABILIDAD 3 ---
const MODELS_FALLBACK = ['gemini-3-flash-preview', 'gemini-2.0-flash-lite-preview-02-05'];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getAuthenticatedJsonHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
        const token = await auth.currentUser?.getIdToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch (error) {
        console.warn('[AI AUTH] No se pudo obtener Firebase ID token:', error);
    }
    return headers;
};


// Herramienta de búsqueda para Live API (Mocked for frontend types consistency if needed by shared code)
const searchInternetFunction: any = {
    name: 'search_internet',
    parameters: {
        type: 'OBJECT',
        description: 'Busca información actualizada en internet cuando el usuario hace preguntas de actualidad, noticias o precios.',
        properties: {
            query: {
                type: 'STRING',
                description: 'La consulta de búsqueda precisa para internet.',
            },
        },
        required: ['query'],
    },
};

// CACHE SETTINGS
const CACHE_COLLECTION = 'grounding_cache';
const CONTEXT_CACHE_COLLECTION = 'context_caches';
// UMBRAL OPERATIVO / GUARDRAIL: Tokens mínimos para intentar caching explícito de Gemini (ai.google.dev)
const CACHE_TOKEN_THRESHOLD = 32768; 

/**
 * Obtiene o crea un Context Cache para documentos grandes.
 * Implementado como Guardrail Operativo: Si el cacheo falla o el TTL expira, 
 * el sistema hace fallback a request estándar sin cache.
 */
const getOrUpdateContextCache = async (userId: string, fileId: string, content: string, modelFamily: string): Promise<string | null> => {
    // Estimación rápida de tokens (palabras * 1.3)
    const estimatedTokens = content.split(/\s+/).length * 1.3;
    if (estimatedTokens < CACHE_TOKEN_THRESHOLD) return null;

    try {
        const cacheKey = `${userId}_${fileId}_${modelFamily}`;
        const cacheRef = doc(db, CONTEXT_CACHE_COLLECTION, cacheKey);
        const snap = await getDoc(cacheRef);

        if (snap.exists()) {
            const data = snap.data();
            // TTL por defecto: 1 hora según documentación oficial si no se define
            if (new Date(data.ttlExpiresAt) > new Date()) {
                return data.cacheId;
            }
        }

        // Simulación de rastro de cache (Explicit Caching de Gemini)
        const ttlHours = 24; 
        const cacheId = `cache-${Date.now()}`;
        
        await setDoc(cacheRef, {
            cacheId,
            userId,
            fileId,
            modelFamily,
            ttlExpiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
            content: content.substring(0, 1000) // Solo rastro para debugging
        });

        return cacheId;
    } catch (e) {
        console.warn("Context caching guardrail triggered - Falling back to normal request", e);
        return null;
    }
};

export const parseSpreadsheet = (base64: string): string => {
    try {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const workbook = XLSX.read(bytes, { type: 'array' });
        let fullText = "";
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            fullText += `\n--- HOJA: ${sheetName} ---\n${csv}\n`;
        });
        return fullText;
    } catch (e) {
        console.error("Error al procesar el archivo Excel:", e);
        return "[Error al extraer contenido del archivo Excel]";
    }
};

const normalizePrompt = (text: string): string => {
    return text.toLowerCase()
        .trim()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s{2,}/g, " ");
};

const containsPII = (text: string): boolean => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(\+?\d{1,3}[]?)?\(?\d{3}\)?[]?\d{3}[]?\d{4}/g;
    const idRegex = /\d{7,13}/g; // Common ID/TaxID lengths
    return emailRegex.test(text) || phoneRegex.test(text) || idRegex.test(text);
};

/**
 * Obtiene respuesta cacheada incluyendo dimensiones de región, moneda y tiempo.
 */
const getGroundingCache = async (normalizedPrompt: string, locale: string, currency: string = 'USD', units: string = 'metric') => {
    try {
        // TIME BUCKET: Agrupamos por hora para asegurar veracidad en datos volátiles (clima, precios)
        const timeBucket = new Date().toISOString().substring(0, 13); // YYYY-MM-DDTHH
        const cacheKey = `${normalizedPrompt}_${locale}_${currency}_${units}_${timeBucket}`;
        const cacheRef = doc(db, CACHE_COLLECTION, cacheKey);
        const snap = await getDoc(cacheRef);
        
        if (snap.exists()) {
            const data = snap.data();
            if (new Date(data.ttlExpiresAt) > new Date()) {
                return data;
            }
        }
    } catch (e) { console.warn("Cache read error", e); }
    return null;
};

/**
 * Guarda en el caché compartido de grounding.
 * Incluye dimensiones de contexto para evitar respuestas incorrectas entre regiones.
 */
const saveToGroundingCache = async (prompt: string, locale: string, response: any, currency: string = 'USD', units: string = 'metric') => {
    if (containsPII(prompt)) return; // Don't cache private data

    try {
        const normalized = normalizePrompt(prompt);
        const timeBucket = new Date().toISOString().substring(0, 13);
        const cacheKey = `${normalized}_${locale}_${currency}_${units}_${timeBucket}`;
        
        // Dynamic TTL: 15 mins for volatile queries, 12h for static ones
        const isVolatile = prompt.includes('precio') || prompt.includes('hoy') || prompt.includes('ahora') || prompt.includes('clima');
        const ttlMs = isVolatile ? 15 * 60 * 1000 : 12 * 60 * 60 * 1000;
        
        await setDoc(doc(db, CACHE_COLLECTION, cacheKey), {
            prompt: normalized,
            locale,
            currency,
            units,
            text: response.text,
            groundingMetadata: response.candidates?.[0]?.groundingMetadata || null,
            createdAt: new Date().toISOString(),
            ttlExpiresAt: new Date(Date.now() + ttlMs).toISOString()
        });
    } catch (e) { console.warn("Cache write error", e); }
};

// Helper genérico para ejecutar promesas de IA con paracaídas (Llamada al backend)
export async function executeAiWithFallback(prompt: string, systemInstruction: string, isJson: boolean = false, schema?: any, module: AIModule = 'chat', fileId?: string, overrideTokenCap?: number) {
    // IDEMPOTENCY KEY GENERATION
    const requestId = crypto.randomUUID();

    // Obtener contexto de usuario para caps
    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const plan = userProfile?.plan || 'free';
    const userId = userProfile?.uid;
    
    // V3.3: PERMITIR GENERACIÓN EN ONBOARDING SIN USUARIO LOGUEADO
    const isProjectOnboarding = module === 'summaries' && (prompt.includes('estructura de proyecto JSON') || prompt.includes('Estrategia de lanzamiento'));
    if (!userId && !isProjectOnboarding) return "Debes iniciar sesión para realizar esta acción.";

    // V9: el consumo de ai_chat se valida y descuenta en el backend.
    // El frontend conserva la UX y los límites visuales, pero la ley final vive en Cloud Run.
    
    // Hard Caps de Tokens
    let tokenCap = overrideTokenCap || getModuleTokenCap(plan, module);
    
    // Budget Guardrails
    let budgetMode: 'normal' | 'saving' | 'panic' = 'normal';
    if (userId) {
        const usageD = await getDoc(doc(db, "user_usage", userId));
        budgetMode = computeBudgetMode(usageD.exists() ? (usageD.data() as any) : null);
    }
    
    if (budgetMode === 'saving' && !overrideTokenCap) tokenCap = Math.floor(tokenCap * 0.7);
    if (budgetMode === 'panic' && (module === 'web' || module === 'contracts')) {
        return "El presupuesto mensual de IA para estas funciones ha sido alcanzado. Espera al próximo ciclo o contacta a soporte.";
    }

    // Routing inteligente explícito por Plan
    const targetModel = pickModel(plan, module, budgetMode, userProfile?.subscriptionStatus);

    try {
        const response = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                history: typeof prompt === 'string' ? [{ role: 'user', parts: [{ text: prompt }] }] : prompt,
                systemInstruction,
                model: targetModel,
                module,
                config: {
                    maxOutputTokens: tokenCap,
                    responseMimeType: isJson ? "application/json" : "text/plain",
                    responseSchema: schema
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.details || "Error en el servidor de IA");
        }

        const data = await response.json();
        
        if (data.text) {
            if (userId) {
                recordUsageTelemetry(userId, module, targetModel, data.usageMetadata, requestId);
            }
            return data.text;
        }
    } catch (error: any) {
        console.error(`Error llamando al backend de IA:`, error);
        return "Esta función no está disponible en tu plan o configuración actual.";
    }
    return "";
}

function estimatedIsLarge(text: string): boolean {
    return text.length > 100000; // ~25k tokens approx
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Fixed undefined 'len' variable in decode function
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const getCurrentDateLong = () => {
    return new Date().toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

const getCurrentTime = () => {
    return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

export const cleanTextForSpeech = (text: string): string => {
    return text
        .replace(/```[\s\S]*?```/g, 'bloque de código')
        .replace(/###|##|#/g, '')
        .replace(/ \*\*/g, '')
        .replace(/\|.*?\|/g, 'tabla de datos')
        .replace(/<<<ACTION:[\s\S]*?>>>/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{2328}\u{2049}\u{203C}\u{2000}-\u{200F}\u{2028}\u{202F}\u{231A}\u{231B}\u{23E9}-\u{23EF}\u{23F0}\u{23F3}]/gu, '');
};

const shouldUseWebSearch = (userMessage: string): boolean => {
    const lower = userMessage.toLowerCase();
    const keywords = [
        "noticias", "hoy", "actualidad", "actual", "reciente", "última hora",
        "buscar", "busca", "investiga", "internet", "web", "googlea",
        "analiza esta página", "analiza este link", "url", "http", "https", "www.",
        "qué pasó", "qué hay de nuevo", "tendencias", "precios actuales",
        "datos actuales", "clima político actual", "lanzamiento reciente",
        "fecha actual", "información actualizada", "clima de hoy", "pronóstico de hoy",
        "qué está pasando", "precio del", "valor de", "cotización de"
    ];
    
    // Detectar si hay palabras clave
    const hasKeyword = keywords.some(k => lower.includes(k));
    
    // Detectar si hay URLs
    const urlRegex = /https?:\/\/\b(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    const hasUrl = urlRegex.test(userMessage);

    return hasKeyword || hasUrl;
};

const extractUrls = (userMessage: string): string[] => {
    const urlRegex = /https?:\/\/\b(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    return userMessage.match(urlRegex) || [];
};

export const getAiChatResponseStream = async (history: ChatMessage[], config?: any) => {
    // IDEMPOTENCY KEY GENERATION FOR STREAM
    const requestId = crypto.randomUUID();

    // Obtener contexto de usuario para caps
    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    
    const userId = config?.billingUserId || userProfile?.uid;
    const plan = config?.userPlan || userProfile?.plan || 'free';
    const module: AIModule = config?.forAgent ? 'agent' : 'chat';
    
    // Budget Guardrails
    let budgetMode: 'normal' | 'saving' | 'panic' = 'normal';
    if (userId) {
        const usageDStream = await getDoc(doc(db, "user_usage", userId));
        budgetMode = computeBudgetMode(usageDStream.exists() ? (usageDStream.data() as any) : null);
    }
    
    // Hard Caps
    let tokenCap = getModuleTokenCap(plan, module);
    
    const lastUserMsg = history[history.length - 1]?.text || "";
    // Increase token cap for document generation requests
    if ((lastUserMsg.toLowerCase().includes('pdf') || lastUserMsg.toLowerCase().includes('word') || lastUserMsg.toLowerCase().includes('excel') || lastUserMsg.toLowerCase().includes('documento')) && plan !== 'free') {
        tokenCap = Math.max(tokenCap, 4096);
    }

    if (budgetMode === 'saving') tokenCap = Math.floor(tokenCap * 0.7);

    // --- INTEGRACIÓN DE BÚSQUEDA WEB (PERPLEXITY) ---
    let webContext = "";
    let webSources: string[] = [];
    let webSearchAttempted = false;
    let webSearchFailed = false;

    if (module === 'chat' && shouldUseWebSearch(lastUserMsg)) {
        webSearchAttempted = true;
        try {
            const urls = extractUrls(lastUserMsg);
            const res = await searchWithPerplexity(lastUserMsg); // Podríamos pasar URLs específicas si el backend lo soporta, por ahora query global
            
            if (res && res.text && !res.text.includes("No se pudo completar la búsqueda")) {
                webContext = res.text;
                webSources = res.citations || [];
            } else {
                webSearchFailed = true;
            }
        } catch (e) {
            console.error("Error in Perplexity Search:", e);
            webSearchFailed = true;
        }
    }
    
    // Convertir historial a formato Gemini
    const geminiHistory = await Promise.all(history.map(async (msg, idx) => {
        const parts: any[] = [];
        let textToSend = msg.text;

        // Inyectar contexto web en el último mensaje antes de procesar
        if (idx === history.length - 1 && webContext) {
            textToSend = `[WEB_CONTEXT_FROM_PERPLEXITY]\n${webContext}\n\n[SOURCES]\n${webSources.map((s, i) => `[${i+1}] ${s}`).join('\n')}\n\n[USER_MESSAGE]\n${textToSend}`;
        } else if (idx === history.length - 1 && webSearchAttempted && webSearchFailed) {
            textToSend = `[WEB_SEARCH_FAILED_SIGNAL] No se pudo obtener información actual de internet. Por favor informa al usuario que no pudiste verificar actualidad.\n\n[USER_MESSAGE]\n${textToSend}`;
        }

        if (textToSend) parts.push({ text: textToSend });
        
        // 1. PROCESAR IMÁGENES DE HUD / SCREEN SHARING
        if (msg.imageUrl) { 
            const b64 = msg.imageUrl.startsWith('data:') ? msg.imageUrl.split('base64,')[1] : null;
            if (b64 && b64.length > 20) {
                parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } }); 
            }
        }
        
        // 2. PROCESAR ARCHIVOS ADJUNTOS (MULTIMODAL + EXTRACCIÓN SERVIDOR)
        if (msg.files && msg.files.length > 0) {
            for (const file of msg.files) {
                if (!file.base64Data) continue;

                const mime = file.type.toLowerCase();
                const isImage = mime.startsWith('image/');
                const isPdf = mime === 'application/pdf';
                const isExcel = mime.includes('spreadsheet') || mime.includes('excel') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
                const isAudio = mime.startsWith('audio/');
                const isVideo = mime.startsWith('video/');
                const isWord = mime.includes('wordprocessingml') || file.name.endsWith('.docx');
                const isZip = mime.includes('zip') || file.name.endsWith('.zip');

                if (isImage || isPdf || isAudio || isVideo) {
                    // Soporte nativo para Gemini 1.5 Flash (Visión y Documentos)
                    parts.push({ 
                        inlineData: { 
                            mimeType: isImage ? (mime.includes('gif') ? 'image/gif' : mime) : (isPdf ? 'application/pdf' : mime), 
                            data: file.base64Data 
                        } 
                    });
                } else if (isExcel || isWord || isZip) {
                    // LLAMAR AL EXTRACTOR BACKEND PARA COMPLEJOS
                    try {
                        let headers: any = { 'Content-Type': 'application/json' };
                        if (auth.currentUser) {
                            const token = await auth.currentUser.getIdToken();
                            headers['Authorization'] = `Bearer ${token}`;
                        } else {
                            throw new Error('Usuario no autenticado');
                        }

                        const res = await fetch('/api/files/extract', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64Data: file.base64Data })
                        });
                        const data = await res.json();
                        if (data.ok) {
                            textToSend += `\n\n[CONTENIDO EXTRAÍDO DEL REGISTRO ADJUNTO: ${file.name}]\n${data.extractedText}`;
                            console.log(`[FILES] Extracción backend exitosa: ${file.name}`);
                        }
                    } catch (e) {
                        console.error("Error en extracción backend:", e);
                        // Fallback local si es excel simple
                        if (isExcel) {
                            const excelText = parseSpreadsheet(file.base64Data);
                            textToSend += `\n\n[CONTENIDO EXCEL ADJUNTO (FALLBACK): ${file.name}]\n${excelText}`;
                        }
                    }
                } else {
                    // Fallback para archivos de texto, CSV, código, etc.
                    try {
                        const binary = decode(file.base64Data);
                        const textContent = new TextDecoder().decode(binary);
                        if (textContent && textContent.length > 0) {
                            textToSend += `\n\n[TEXTO EXTRAÍDO DE ARCHIVO: ${file.name}]\n${textContent.slice(0, 80000)}`;
                        }
                    } catch (e) {
                        console.warn(`No se pudo leer el texto de ${file.name}`, e);
                    }
                }
            }
            
            // Actualizar el primer part (texto) si ha crecido con las extracciones
            if (parts[0]?.text) parts[0].text = textToSend;
        }
        
        if (parts.length === 0) parts.push({ text: " " });
        return { role: msg.role === 'model' ? 'model' : 'user', parts };
    }));

    let systemInstruction = config?.systemInstruction || 'Eres Shivo, asistente avanzado.';
    
    // REGLA PARA VISIÓN Y ARCHIVOS
    if (history.some(m => (m.files && m.files.length > 0) || m.imageUrl)) {
        systemInstruction += `\n\n[MULTIMODAL_CAPABILITY] Tienes acceso a archivos o imágenes adjuntas. Si el usuario adjuntó archivos de texto, Office o ZIP, el contenido ha sido extraído y está disponible en etiquetas [CONTENIDO]. Si son imágenes o PDFs, los has recibido como entrada multimodal. Analízalos con profundidad.`;
    }
    
    // REGLA PARA ACCIONES INTEGRADAS (ARTIFACTS, TASKS, MEETINGS, CHARTS, PROJECTS)
    systemInstruction += `\n\n[ACTION_SYSTEM_v4.0]
Como núcleo de Goatify, tienes la capacidad de EJECUTAR ACCIONES REALES. Cuando el usuario pida algo operativo (crear tarea, proyecto, reunión o archivo), DEBES responder con una confirmación natural breve y LUEGO incluir el bloque de acción en este formato exacto:
<<<ACTION:{
  "ACTION": "ACTION_NAME",
  ...params
}>>>

FORMATOS DISPONIBLES (dentro de <<<ACTION: ... >>>):

1. CREAR TAREAS:
{ "ACTION": "CREATE_TASK", "title": "...", "description": "...", "dueDate": "ISO_DATETIME", "priority": "low|medium|high|critical" }

2. CREAR PROYECTOS:
{ "ACTION": "CREATE_PROJECT", "name": "...", "description": "..." }

3. AGENDAR REUNIONES / EVENTOS:
{ "ACTION": "CREATE_MEETING", "title": "...", "startDate": "ISO_DATETIME", "endDate": "ISO_DATETIME", "videoCall": true }

4. ENVIAR EMAILS (ACTION: SEND_EMAIL):
{ "ACTION": "SEND_EMAIL", "to": "email@ejemplo.com", "subject": "...", "body": "...", "accountId": "ID_OPCIONAL" }
- Si el usuario pide un "diseño pro", usa código HTML elegante con colores de marca, bordes redondeados y tipografía limpia.
- REGLA DE ORO: Si el usuario pide un color específico, aplícalo al diseño. Si no, usa el estilo "Goatify Premium" (fondos oscuros elegantes o blancos minimalistas con acentos en azul/violeta).

5. GUARDAR BORRADORES (ACTION: SAVE_DRAFT):
{ "ACTION": "SAVE_DRAFT", "to": "...", "subject": "...", "body": "..." }

6. ANALIZAR BANDEJA DE ENTRADA (ACTION: LIST_EMAILS):
{ "ACTION": "LIST_EMAILS", "limit": 10 }
- Úsalo cuando el usuario diga "resume mis correos" o "¿qué tengo de nuevo?".

7. ACCEDER A CONTACTOS (ACTION: LIST_CONTACTS):
{ "ACTION": "LIST_CONTACTS" }

8. GENERAR ARCHIVOS (PDF, Excel, Word, CSV, TXT, MD, JSON):
{ "ACTION": "GENERATE_ARTIFACT", "type": "pdf|docx|xlsx|csv|txt|md|json", "title": "Nombre", "content": "Contenido textual completo ya redactado y maquetado. Debe ser extenso y real.", "structuredData": [] }
- NO RESPONDAS CON PROMESAS FALSAS. Si solicitan generar o modificar un documento (PDF, Word, Excel, CSV), DEBES usar siempre ACTION: GENERATE_ARTIFACT.
- NUNCA inventes datos privados (agenda, ventas, finanzas, tareas). Usa EXCLUSIVAMENTE el contexto real proporcionado arriba en "CONEXIÓN VITAL AL CONTEXTO". Si el usuario pide un PDF de su agenda o Excel de sus ventas, y el contexto no los contiene, dile "No tienes eventos/tareas registradas hoy" o "No hay datos de ventas", y no muestres datos falsos.
- CONTENIDO COMPLETO: El campo "content" debe contener LA REDACCIÓN COMPLETA del documento. NO lo dejes en blanco, NO envíes resúmenes cortos. Si el usuario pide 3 folios de historia, redacta un documento largo. Para tablas o Excel, envía datos consistentes en "structuredData".
- Si el usuario adjunta un PDF/DOCX/XLSX y pide editarlo, LEE y USA el contenido extraído del archivo. Si es PDF y pide PDF corregido, genera un ACTION: GENERATE_ARTIFACT de tipo pdf con el contenido modificado. Si pide conservar diseño visual exacto, responde que regeneras todo el contenido textual nuevo, pero no garantizas preservar formatos visuales milimétricos al carecer de OCR/Layout engine.

5. GENERAR GRÁFICAS VISUALES:
{ "ACTION": "GENERATE_CHART", "chartType": "pie|bar|line", "title": "...", "data": [{ "name": "A", "value": 10 }], "analysis": "..." }

REGLAS DE ORO:
- OCULTAMIENTO TOTAL: NUNCA muestres el JSON crudo fuera de <<<ACTION: ... >>>. El sistema lo ocultará automáticamente.
- NO FINGIR: No digas "He creado la tarea" si no vas a enviar el bloque ACTION.
- FECHAS: Usa la FECHA/HORA ACTUAL (${new Date().toLocaleString()}) para calcular fechas relativas como "mañana" o "el lunes".
- ACCIÓN REAL: Si el usuario pide crear algo, TU ÚNICA FORMA DE HACERLO es enviando el bloque ACTION.
`;
    
    // REGLA ANTI-INVENCIÓN Y MARCA PARA BÚSQUEDAS WEB
    if (webSearchAttempted) {
        const webSearchRules = `
[WEB_MODE_ACTIVE]
REGLAS CRÍTICAS DE ACTUALIDAD:
1. Usa el contenido de WEB_CONTEXT_FROM_PERPLEXITY como tu única fuente de verdad sobre hechos recientes, noticias o análisis de links.
2. Si WEB_CONTEXT_FROM_PERPLEXITY está vacío o recibes WEB_SEARCH_FAILED_SIGNAL, di claramente: "No pude verificar información actual en internet en este momento. Intenta de nuevo o pásame un link específico." NO INVENTES NOTICIAS NI DATOS.
3. No uses tu conocimiento interno previo como si fuera noticia actual si no está en el contexto web proporcionado.
4. Cita las fuentes usando el formato [1], [2], etc., basándote en la lista proporcionada.
5. ISOLATION DE MARCA: No menciones productos de Goatify, planes, precios ni módulos de venta a menos que el usuario lo pregunte específicamente. Enfócate exclusivamente en la información solicitada.
6. Sé ejecutivo, preciso y objetivo.
`;
        systemInstruction += webSearchRules;
    }

    const targetModel = pickModel(plan, module, budgetMode, userProfile?.subscriptionStatus);

    try {
        const response = await fetch('/api/gemini/stream', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                history: geminiHistory,
                systemInstruction,
                model: targetModel,
                config: { maxOutputTokens: tokenCap },
                module: module
            })
        });

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        return (async function* () {
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        if (dataStr === '[DONE]') break;
                        try {
                            const data = JSON.parse(dataStr);
                            yield data;
                        } catch (e) {}
                    }
                }
            }
        })();
    } catch (e) {
        console.error("Stream fetch error:", e);
        return (async function* () {
            yield { text: "Esta función no está disponible en tu plan o configuración actual." };
        })();
    }
};

export const buildPersonalizedSystemInstruction = (user: UserProfile, base: string, context: any, language: string = 'es', isScreenSharing: boolean = false) => {
    const prefName = user.modelInstructions?.preferredName || user.name;
    const modelStyle = user.modelInstructions?.modelStyle || 'Professional';
    const customInstructions = user.modelInstructions?.customInstructions || '';
    
    // DATOS DE TIEMPO EXACTO
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

    let styleInstruction = "";
    switch(modelStyle) {
        case 'Friendly':
            styleInstruction = "Tu tono debe ser amistoso, cercano y casual, usando emojis ocasionalmente.";
            break;
        case 'Detailed':
            styleInstruction = "Tus respuestas deben ser exhaustivas, académicas y muy detalladas, profundizando en cada punto.";
            break;
        case 'Creative':
            styleInstruction = "Sé creativo, entusiasta y propón ideas fuera de lo común. Tu lenguaje debe ser inspirador.";
            break;
        case 'Professional':
        default:
            styleInstruction = "Tu estilo es profesional, ejecutivo y conciso. Directo al punto.";
            break;
    }

    let instr = `IDENTIDAD: Shivo, núcleo de Goatify. Usuario: "${prefName}".
ESTILO: ${styleInstruction}
MEMORIAS Y CONTEXTO DEL USUARIO: ${customInstructions}

[CALIDAD DE DOCUMENTOS Y ARCHIVOS]
Cuando el usuario pida generar un archivo (Excel, CSV, PDF, Documento), asegúrate de que el contenido sea profesional, bien estructurado y visualmente impecable. 
En Excel, usa encabezados claros y datos organizados. En documentos, mantén un tono ejecutivo y profesional.

[REGLA DE ORO DE CONDUCTA]
SOLO ejecuta acciones (crear tareas, proyectos, eventos, etc.) cuando el usuario lo pida EXPLÍCITAMENTE. 
NUNCA crees algo de forma proactiva basándote en la conversación a menos que el usuario te dé una orden clara.
Si detectas una necesidad pero el usuario no ha pedido crearla, sugiérelo verbalmente pero NO envíes el bloque <<<ACTION: ... >>>.

TIEMPO ACTUAL: Hoy es ${dateStr} y son exactamente las ${timeStr}.\n`;
    
    if (context.meetings) {
        instr += `\nREUNIONES AGENDADAS (Goatify Meets):\n${JSON.stringify(context.meetings)}\n`;
    }

    if (context.calendarContent) {
        instr += `\nEVENTOS Y TAREAS EN CALENDARIO (No son reuniones de video, son hitos/tareas):\n${JSON.stringify(context.calendarContent)}\n`;
    }
    
    if (context.leads) {
        instr += `\nPROSPECTOS CRM (Socios):\n${JSON.stringify(context.leads.map((l: any) => ({ cliente: l.clientName, estado: l.status, valor: l.estimatedValue, servicio: l.serviceType })))}\n`;
    }

    if (context.projects) {
        instr += `\nMIS PROYECTOS ACTIVOS Y FINANZAS:\n${JSON.stringify(context.projects.map((p: any) => ({ 
            id: p.id, 
            nombre: p.name,
            finanzas: {
                ingresos: p.finances?.income,
                egresos: p.finances?.expenses,
                healthScore: p.finances?.healthScore,
                transacciones: p.finances?.transactions?.slice(0, 5)
            }
        })))}\n`;
    }

    if (context.accounts) {
        instr += `\nCUENTAS DE CORREO CONFIGURADAS:\n${JSON.stringify(context.accounts.map((a: any) => ({ id: a.id, email: a.email, provider: a.provider })))}\n`;
    }

    if (context.mailLists) {
        instr += `\nGRUPOS DE CORREO (Goatify Mail Campaigns):\n${JSON.stringify(context.mailLists.map((l: any) => ({ nombre: l.name, correos: l.emails })))}\n`;
    }

    if (context.mailContacts) {
        instr += `\nCONTACTOS DE CORREO GUARDADOS:\n${JSON.stringify(context.mailContacts.map((c: any) => ({ nombre: c.name, email: c.email })))}\n`;
    }

    if (user.mailSignatures && user.mailSignatures.length > 0) {
        instr += `\nFIRMAS DE CORREO DISPONIBLES:\n${JSON.stringify(user.mailSignatures.map((s: any) => ({ nombre: s.name, activa: s.isActive, tipo: s.type })))}\n`;
        const activeSig = user.mailSignatures.find((s: any) => s.isActive);
        if (activeSig) {
            instr += `\nFIRMA ACTIVA DEL USUARIO (Inyéctala al final de los correos si es apropiado):\n${activeSig.content}\n`;
        }
    }

    instr += `\n[REGLA DE LECTURA DE EMAILS]
Cuando el usuario te pregunte por sus correos, qué le han enviado, o quiera ver su bandeja de entrada, DEBES usar obligatoriamente la acción de listado:
<<<ACTION: {"ACTION": "LIST_EMAILS", "folder": "inbox", "limit": 10} >>>
Esto te devolverá los 10 correos más recientes con su remitente, asunto y resumen para que puedas responder con detalle. No inventes correos.

[REGLA DE BORRADORES]
Cuando el usuario te pida redactar, escribir o preparar un correo, DEBES generar el contenido y usar la acción de guardado automático: 
<<<ACTION: {"ACTION": "SAVE_DRAFT", "to": "...", "subject": "...", "body": "..."} >>> 
Esto permitirá que el usuario abra el borrador en el editor de Goatify Mail inmediatamente con un botón especial. Siempre intenta detectar el destinatario y el asunto. SIEMPRE usa HTML profesional si el contexto lo requiere o si pide diseño.

[DISEÑO DE CORREOS PRO]
Si el usuario solicita un correo con "diseño pro", "super pro", "formato elegante" o similar, DEBES generar un cuerpo de mensaje en HTML (usando etiquetas <table>, <div>, <p>, <span>) con estilos inline.
Ejemplo de estructura Pro (REGLAS OBLIGATORIAS):
1. Usa tablas HTML para toda la estructura principal.
2. El contenedor principal del email debe ocupar todo el ancho disponible en móvil (width:100%; max-width:100% en móvil). En escritorio max-width: 680px.
3. El body debe tener margin:0; padding:0; width:100%; background:#f3f4f6 o similar.
4. NO uses un contenedor interno angosto dentro de otro contenedor. NO uses max-width de 520px, 560px o similares en el bloque principal.
5. El padding lateral en móvil debe ser mínimo o cero (preferencia móvil: 0px a 12px máximo). No pongas una "tarjeta dentro de otra tarjeta".
6. El contenido principal debe ir directo dentro del contenedor principal, sin wrappers adicionales innecesarios.
7. Agrega un bloque <style> con media query para resetear paddings y forzar anchos en móviles: @media (max-width: 640px) { ... }

<style>
@media (max-width: 640px) {
  .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
  .email-pad { padding-left: 10px !important; padding-right: 10px !important; }
}
</style>
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; margin: 0; padding: 0;">
  <tr>
    <td align="center">
      <table class="email-container" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 680px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); font-family: 'Inter', Arial, sans-serif;">
        <tr>
          <td class="email-pad" style="background: #000; color: #fff; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Título Impactante</h1>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding: 40px 30px; color: #374151; line-height: 1.6; font-size: 16px;">
            Contenido del mensaje...
            <div style="margin-top: 20px;">
              <a href="#" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Acción Principal</a>
            </div>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb;">
            © 2026 Tu Empresa.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;

    instr += `\nINSTRUCCIONES ESTRATÉGICAS:\n${base}\n${customInstructions}\n`;
    return instr;
};

const sendEmailFunction: any = {
    name: 'send_email',
    description: 'Envía un correo electrónico real. Úsalo si el usuario te lo pide.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            to: { type: Type.STRING, description: 'Email del destinatario' },
            subject: { type: Type.STRING, description: 'Asunto del correo' },
            body: { type: Type.STRING, description: 'Cuerpo del mensaje (puedes usar HTML)' }
        },
        required: ['to', 'subject', 'body']
    }
};

const createDraftFunction: any = {
    name: 'create_draft',
    description: 'Guarda un borrador de correo para que el usuario lo revise después.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            to: { type: Type.STRING, description: 'Email del destinatario' },
            subject: { type: Type.STRING, description: 'Asunto del correo' },
            body: { type: Type.STRING, description: 'Cuerpo del mensaje' }
        },
        required: ['to', 'subject', 'body']
    }
};

export const startLiveSession = (callbacks: any, systemInstruction: string, voiceName: TtsVoice = 'Kore'): Promise<any> => {
    return new Promise(async (resolve, reject) => {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        const wsUrl = `${protocol}://${window.location.host}/api/live-proxy${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        
        console.log("[LIVE FRONTEND] connecting to", wsUrl.replace(/token=[^&]+/, 'token=***'));
        const ws = new WebSocket(wsUrl);

        const session = {
            sendRealtimeInput(input: any) {
                if (ws.readyState === WebSocket.OPEN) {
                    console.log("[LIVE FRONTEND] audio/video sent");
                    ws.send(JSON.stringify({
                        type: "realtimeInput",
                        realtimeInput: input
                    }));
                }
            },
            sendToolResponse(response: any) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "toolResponse",
                        toolResponse: response
                    }));
                }
            },
            close() {
                console.log("[LIVE FRONTEND] closing websocket manually");
                ws.close();
            }
        };

        ws.onopen = () => {
            console.log("[LIVE FRONTEND] websocket open");
            ws.send(JSON.stringify({
                type: "setup",
                systemInstruction,
                voiceName
            }));
            if (callbacks.onopen) callbacks.onopen();
            resolve(session);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Si el backend envía un objeto con error, lo reportamos a la UI
                if (data.error) {
                    console.error("[LIVE FRONTEND] Error en la sesión:", data.error);
                    if (callbacks.onerror) callbacks.onerror(data.error);
                    return;
                }
                if (callbacks.onmessage) callbacks.onmessage(data);
            } catch (e) {
                console.error("[LIVE FRONTEND] error parsing message", e);
            }
        };

        ws.onerror = (event) => {
            console.error("[LIVE FRONTEND] websocket error", event);
            if (callbacks.onerror) callbacks.onerror(event);
            reject(event);
        };

        ws.onclose = (event) => {
            console.log("[LIVE FRONTEND] websocket closed", event.code, event.reason);
            if (callbacks.onclose) callbacks.onclose(event);
        };
    });
};

export const generateAiQuotation = async (clientName: string, serviceType: string, notes: string, estimatedValue: number, userName: string, issuerInfo?: any, businessDescription?: string) => {
    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const currency = userProfile?.currency || 'USD';
    const applyTax = issuerInfo?.applyTax === true;
    const taxPercentage = applyTax ? (parseFloat(issuerInfo?.taxPercentage) || 0) : 0;
    const taxValue = estimatedValue * (taxPercentage / 100);
    const totalValue = estimatedValue + taxValue;

    const sys = `Eres un Venture Architect de Élite. Redactas propuestas comerciales de ALTO NIVEL para directivos C-LEVEL. 
    REGLA DE MARCA: El emisor de esta propuesta es "${issuerInfo?.brandName || userName}". 
    NO menciones a Goatify a menos que sea estrictamente necesario para describir la infraestructura técnica.
    La identidad visual y legal debe pertenecer exclusivamente al emisor proporcionado.
    REGLA DE FORMATO CRÍTICA: NO USES SÍMBOLOS DE HASHTAG (###) PARA LOS TÍTULOS. En su lugar, utiliza MAYÚSCULAS EN NEGRITA para las secciones.
    ASEGÚRATE DE QUE LA PROPUESTA SEA EXTENSA, DETALLADA Y COMPLETA. NO RESUMAS.`;
    
    const prompt = `FECHA: ${getCurrentDateLong()}. Genera una ESTRATEGIA COMERCIAL DE ALTO IMPACTO para el cliente ${clientName}. 
    GIRO DE NEGOCIO DEL CLIENTE: ${businessDescription}. 
    NECESIDAD DETECTADA Y ANÁLISIS: ${notes}. 
    SERVICIOS SOLICITADOS: ${serviceType}. 
    VALOR DE INVERSIÓN (Subtotal): ${estimatedValue.toLocaleString()} ${currency}. 
    ${applyTax ? `IMPUESTOS (${taxPercentage}%): ${taxValue.toLocaleString()} ${currency}.` : 'IMPUESTOS: NO APLICA (0%).'}
    VALOR TOTAL: ${totalValue.toLocaleString()} ${currency}.
    CONSULTOR / EMISOR: ${issuerInfo?.providerName || userName}.
    
    ESTRUCTURA EXTENSA:
    1. ANÁLISIS SITUACIONAL (Contexto profundo basado en el análisis).
    2. SOLUCIÓN TÉCNICA PROPUESTA (Cómo la tecnología resuelve el problema de raíz).
    3. ROADMAP DE IMPLEMENTACIÓN (Fases detalladas semana a semana).
    4. ROI PROYECTADO Y ESCALAMIENTO (Impacto financiero a 6 y 12 meses).
    5. RESUMEN FINANCIERO (ESTRICTO ORDEN):
       - TOTAL GENERAL (Destacado y en grande).
       - TABLA DE CONCEPTOS (Desglose de servicios manuales: ${JSON.stringify(issuerInfo?.services || [])}).
       - TABLA DE TOTALES (Subtotal, Impuestos - solo si aplica (${applyTax}), Total Final).
       - BOX DE ANTICIPOS (Solo si aplica: ${issuerInfo?.enableAdvances ? `Anticipo del ${issuerInfo.advancePercentage}% al inicio y el resto al final` : 'No aplica'}).
    
    REQUISITOS:
    - Tono Corporativo AAA, serio, disruptivo y directo.
    - PROHIBIDO USAR ###.
    - REDACCIÓN PROFUNDA Y EXTENSA.
    - EMISOR LEGAL: ${issuerInfo?.providerName || userName} ${issuerInfo?.providerTaxId ? `- RUC/TAX: ${issuerInfo.providerTaxId}` : ''}.
    - MONEDA: ${currency}.
    ${!applyTax ? '- IMPORTANTE: No menciones el IVA ni impuestos en ninguna parte de la propuesta, ya que no aplican.' : ''}
    
    INSTRUCCIONES DE PAGOS:
    1. El campo "SERVICIOS SOLICITADOS" ya contiene la distinción entre "PAGOS ÚNICOS" y "PAGOS RECURRENTES". ÚSALO LITERALMENTE.
    2. Crea una tabla o sección específica para "PAGOS ÚNICOS" y otra tabla o sección específica para "PAGOS MENSUALES RECURRENTES" o "PAGOS ANUALES" según corresponda.
    3. Si hay anticipos habilitados, detalla el monto inicial y final claramente.`;

    return await executeAiWithFallback(prompt, sys, false, null, 'contracts');
};

export const investigateClientWithAi = async (clientName: string, businessType?: string, currentNotes?: string) => {
    const prompt = currentNotes?.trim()
        ? `El usuario (Emisor) ha proporcionado este contexto y notas iniciales sobre el prospecto/cliente "${clientName}" (${businessType || 'Giro desconocido'}):
"${currentNotes}"

Acción: Toma toda esta información y conviértela en un Briefing Estratégico súper estructurado y profesional, completándolo con tu propio análisis de la industria.

REGLA DE VIDA O MUERTE: ¡PROHIBIDO USAR MARKDOWN!. El texto irá dentro de un <textarea> plano.
- CERO asteriscos (**)
- CERO almohadillas (###)
- USA EXCLUSIVAMENTE texto limpio, saltos de línea y guiones (-) para listas.
- NINGÚN símbolo raro de programación.`
        : `Realiza un análisis estratégico rápido estilo Brief sobre el mercado del cliente "${clientName}" (${businessType || 'Giro desconocido'}).

REGLA DE VIDA O MUERTE: ¡PROHIBIDO USAR MARKDOWN!. El texto irá dentro de un <textarea> plano.
- CERO asteriscos (**)
- CERO almohadillas (###)
- USA EXCLUSIVAMENTE texto limpio, saltos de línea y guiones (-) para listas.
- NINGÚN símbolo raro de programación.`;
    const sys = "Eres un Analista Senior de Mercados. REDACTAS ÚNICAMENTE EN TEXTO PLANO. JAMAS usas Markdown.";
    return await executeAiWithFallback(prompt, sys, false, null, 'summaries');
};

export const analyzeUrl = async (url: string, language: string = 'es') => {
    const prompt = `Realiza un análisis estratégico profundo de la URL: ${url}. 
    ESTRUCTURA OBLIGATORIA:
    - Título Principal con #.
    - Subtítulos con ###.
    - Resumen Ejecutivo.
    - Puntos clave en lista.
    - Conclusión estratégica.
    Responde en idioma: ${language}. Usa Markdown enriquecido.`;
    return await executeAiWithFallback(prompt, "Estratega Digital Senior.", false, null, 'summaries');
};

export const analyzeFinancesStrategically = async (finances: FinancialState, user: UserProfile, projectName: string, metadata?: ProjectMetadata) => {
    const prompt = `Auditoría financiera proyecto ${projectName}. Datos: ${JSON.stringify(finances)}.`;
    const schema = { type: Type.OBJECT, properties: { healthScore: { type: Type.INTEGER }, report: { type: Type.STRING }, dnaAdvice: { type: Type.STRING } }, required: ["healthScore", "report", "dnaAdvice"] };
    const res = await executeAiWithFallback(prompt, "CFO de Élite.", true, schema, 'cfo');
    return JSON.parse(res || '{"healthScore": 50, "report": "Error", "dnaAdvice": "Revisar datos."}');
};

export const generateFullArticleDraft = async (topic: string, language: string = 'es') => {
    const prompt = `Artículo sobre: ${topic}. Idioma: ${language}.`;
    const schema = { type: Type.OBJECT, properties: { title: { type: Type.STRING }, summary: { type: Type.STRING }, content: { type: Type.STRING }, category: { type: Type.STRING }, goatifyTakeaway: { type: Type.STRING } }, required: ["title", "summary", "content", "category", "goatifyTakeaway"] };
    const res = await executeAiWithFallback(prompt, "Redactor Senior Tech.", true, schema, 'summaries');
    return JSON.parse(res || '{}');
};

export const regenerateSlideContent = async (slide: PresentationSlide, prompt: string, theme: any) => {
    const sys = `Eres un Diseñador de Presentaciones Experto y Desarrollador Frontend Senior. 
    Tu tarea es REGENERAR o MODIFICAR una diapositiva específica basada en la petición exacta del usuario.
    
    REGLAS DE ORO:
    1. Si es una diapositiva estándar, mejora el texto y propón un diseño impactante.
    2. Si el usuario pide algo complejo o la diapositiva ya es una "Masterpiece" (tiene HTML), genera CÓDIGO HTML Y TAILWIND CSS EXCEPCIONAL.
    3. El código debe ser limpio, moderno, con animaciones suaves (usando clases de Tailwind o animate.css si fuera necesario, pero prefiere Tailwind standard).
    4. La diapositiva debe ser visualmente IMPACTANTE y profesional.
    5. NO incluyas etiquetas <html> o <body>, solo el contenido del <div> principal.
    6. Asegúrate de que los colores armonicen con el tema: ${theme.name}.`;

    const instructions = `DIAPOSITIVA ACTUAL: 
    Título: ${slide.title}
    Contenido: ${slide.bullets.join(', ')}
    ¿Es Masterpiece (HTML)?: ${!!slide.customHtml ? 'SÍ' : 'NO'}
    Código HTML actual (si existe): ${slide.customHtml || 'N/A'}
    
    TEMA ELEGIDO: ${JSON.stringify(theme)}
    
    PETICIÓN DEL USUARIO (SÍGUELA AL PIE DE LA LETRA): ${prompt}
    
    Genera un objeto JSON con la estructura:
    {
        "title": "Nuevo Título mejorado",
        "bullets": ["Nueva viñeta 1", "Nueva viñeta 2"],
        "htmlContent": "Código HTML enriquecido con Tailwind que siga exactamente lo que pidió el usuario",
        "aiNotes": "Explicación de por qué este diseño cumple con lo pedido"
    }`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
            htmlContent: { type: Type.STRING },
            aiNotes: { type: Type.STRING }
        },
        required: ["title", "bullets", "htmlContent"]
    };

    const res = await executeAiWithFallback(instructions, sys, true, schema, 'web');
    return JSON.parse(res || '{}');
};

export const generateGoatifyNews = async (language: string = 'es') => {
    // 1. Obtener contexto en vivo usando el motor de búsqueda existente de Perplexity
    let liveContext = "";
    let isWebFallback = false;
    try {
        const query = `Top latest news in Artificial Intelligence, Technology Startups, and Digital Marketing today April 29, 2026. Include specific sources, URLs, and key details.`;
        const res = await searchWithPerplexity(query);
        if (res && res.text && !res.text.includes("No se pudo completar la búsqueda")) {
            liveContext = `News: ${res.text}\n\nSources: ${res.citations?.join(', ')}`;
        } else {
            throw new Error("Empty or invalid perplexity response");
        }
    } catch (e) {
        console.warn("Error fetching live news context, falling back to strategic knowledge:", e);
        isWebFallback = true;
        liveContext = "No se pudo obtener información en vivo de internet en este instante. ACTIVAR PLAN B: Genera 6 piezas de inteligencia de alto nivel (noticias y consejos) basadas en tu conocimiento actualizado al año 2026 sobre: Inteligencia Artificial Aplicada, Estrategias de Negocio Exponenciales, Marketing Digital de Próxima Generación y Emprendimiento Tecnológico. No inventes hechos aleatorios, sino tendencias y consejos tácticos reales disfrazados de actualidad del 2026.";
    }

    const sys = `Eres el Director Editorial Senior de Goatify IA. Estamos en el año 2026. Tu misión es proporcionar inteligencia crítica y noticias actualizadas.
    
    REGLAS DE TEMPOREIDAD:
    - TODO lo que escribas debe referirse al **AÑO 2026** como el presente. Jamás menciones años anteriores como si fueran el presente.
    
    REGLAS DE CONTENIDO (ESTRICTAS):
    1. TEMAS PROHIBIDOS: Política partidista, religión, desastres naturales o medio ambiente.
    2. TEMAS OBLIGATORIOS: Lanzamientos de IA, Startups de alto impacto, Innovación tecnológica, Emprendimiento, Dinero/Inversiones, Tendencias de Marketing Digital, Redes Sociales y Aplicaciones.
    3. REGLA DE TITULARES: 
       - El campo "title" DEBE ser exclusivamente el titular atractivo. 
       - NO incluyas caracteres Markdown (SIN ###, SIN **, SIN #). 
       - El titular debe ser limpio, directo y profesional. No inventes noticias amarillistas, sino inteligentes.
    4. EXTENSIÓN Y PROFUNDIDAD (Campo "content"):
       - Cada artículo DEBE tener EXACTAMENTE 8 párrafos sustanciales.
       - Cada párrafo debe tener una extensión de 4 a 5 líneas máximo. No más.
       - Explica el "Por qué" y el "Qué significa" con profundidad y un análisis de lectura más profesional.
       - Uso obligatorio de negritas (**) para resaltar datos, cifras y conceptos clave.
       - Usa subtítulos descriptivos internos (con ###) para estructurar la lectura (máximo 3 subtítulos por artículo).
       - DEBE haber un doble salto de línea (\n\n) entre cada párrafo y subtítulo.
       - Sección final obligatoria: "### CONCLUSIÓN ESTRATÉGICA" con un análisis reflexivo sobre el impacto para el usuario, dando un consejo útil y aplicable al final de cada tema.
       - Sección final obligatoria: "### FUENTES RECOMENDADAS" con al menos 2 enlaces. Si tienes fuentes de Perplexity, úsalas. Si no las tienes, usa enlaces reales como www.goatify.app o fuentes de autoridad general del sector.
    
    ESTRATEGIA PARA CONSEJOS (Plan B / Publicidad Subliminal):
    - Genera siempre 6 piezas. Si no hay noticias suficientes en el contexto web, las piezas restantes deben ser "Noticias de Tendencia" basadas en consejos reales de:
        a) Negocios y Emprendimiento 2026.
        b) Marketing y Ventas con IA.
        c) Optimización de Procesos con IA.
    - Camufla menciones a Goatify como la solución recomendada.
    - NUNCA menciones marcas competidoras.
    
    MIX DE CONTENIDO: Genera exactamente 6 elementos.
    IDIOMA: ${language}.`;

    const prompt = `Genera las 6 piezas de inteligencia para hoy 29 de Abril de 2026. 
    Asegúrate de que cada una sea única, real en su utilidad y perfectamente estructurada.
    
    <<< CONTEXTO EN VIVO / PLAN B >>>
    ${liveContext}
    <<< FIN DEL CONTEXTO >>>
    
    INSTRUCCIONES EXTRA:
    - Si el contexto en vivo está disponible, usa las 4 noticias más relevantes de allí.
    - Si no hay contexto o es insuficiente para llegar a 6 piezas, completa con artículos de inteligencia técnica y estratégica sobre IA y Negocios (Plan B) actualizados a 2026.
    - No inventes fechas ni fuentes falsas. Si no hay una fuente externa real, usa www.goatify.app como fuente de inteligencia editorial propia.
    - Mantén los párrafos de máximo 5 líneas. Total 8 párrafos por artículo.`;

    const schema = { 
        type: Type.OBJECT, 
        properties: { 
            articles: { 
                type: Type.ARRAY, 
                items: { 
                    type: Type.OBJECT, 
                    properties: { 
                        title: { type: Type.STRING, description: "Título impactante en texto plano. SIN caracteres especiales ni prefijos." }, 
                        summary: { type: Type.STRING, description: "Un resumen ejecutivo detallado de 3 líneas." }, 
                        content: { type: Type.STRING, description: "Contenido de EXACTAMENTE 8 párrafos de 4-5 líneas con subtítulos ###, negritas, conclusión reflexiva y fuentes reales." }, 
                        category: { type: Type.STRING, description: "Categoría: IA, Negocios, Marketing, etc." }, 
                        source: { type: Type.STRING, description: "Nombre del portal fuente principal o 'Editorial Goatify'." }, 
                        goatifyTakeaway: { type: Type.STRING, description: "El valor táctico resumido para el usuario en 2026." } 
                    }, 
                    required: ["title", "summary", "content", "category", "source", "goatifyTakeaway"] 
                } 
            } 
        }, 
        required: ["articles"] 
    };

    // Forzamos el uso del modelo más rápido y barato (Lite) para noticias
    const res = await executeAiWithFallback(prompt, sys, true, schema, 'summaries', undefined, 8192);
    
    try {
        return JSON.parse(res || '{"articles": []}');
    } catch (e) {
        console.error("Error parsing news JSON, attempting to repair:", e);
        // Basic repair for truncated JSON array of objects
        if (res && res.trim().startsWith('{')) {
            let repaired = res;
            const openBraces = (repaired.match(/\{/g) || []).length;
            const closeBraces = (repaired.match(/\}/g) || []).length;
            const openBrackets = (repaired.match(/\[/g) || []).length;
            const closeBrackets = (repaired.match(/\]/g) || []).length;
            
            // If it ends with a quote, close it
            if ((repaired.match(/"/g) || []).length % 2 !== 0) {
                repaired += '"';
            }
            
            // Close missing braces and brackets
            for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
            for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
            
            try {
                return JSON.parse(repaired);
            } catch (e2) {
                console.error("Repair failed", e2);
            }
        }
        return { articles: [] };
    }
};

export const generateProjectTemplate = async (industry: string, name: string, language: string = 'es', details: string = '') => {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Genera una estructura de proyecto JSON para "${name}" en la industria "${industry}".
    Idioma: ${language}.
    
    ${details ? `INSTRUCCIONES ESPECÍFICAS DEL USUARIO (MÁXIMA PRIORIDAD):
    ${details}
    REGLA DE ORO: Si el usuario pidió un número específico de tareas (ej: "5 tareas"), debes generar EXACTAMENTE ese número. No generes más ni menos.
    Si especificó una duración (ej: "1 mes"), distribuye las tareas estrictamente en ese periodo.` : ''}

    REGLAS CRÍTICAS PARA TAREAS:
    1. Genera una estructura completa y profesional adaptada a la industria.
    2. FECHAS: Asigna una fecha "date" a CADA tarea en formato YYYY-MM-DD.
    3. Si el usuario no especificó duración, distribuye las tareas a lo largo de las próximas 4 semanas desde HOY (${today}).
    4. Asegura que las tareas tengan títulos accionables y estratégicos.`;
    
    const schema = { 
        type: Type.ARRAY, 
        items: { 
            type: Type.OBJECT, 
            properties: { 
                name: { type: Type.STRING }, 
                folders: { 
                    type: Type.ARRAY, 
                    items: { 
                        type: Type.OBJECT, 
                        properties: { 
                            id: { type: Type.STRING }, 
                            name: { type: Type.STRING }, 
                            tasks: { 
                                type: Type.ARRAY, 
                                items: { 
                                    type: Type.OBJECT, 
                                    properties: { 
                                        title: { type: Type.STRING }, 
                                        date: { type: Type.STRING, description: "Format YYYY-MM-DD" } 
                                    }, 
                                    required: ["title", "date"] 
                                } 
                            } 
                        }, 
                        required: ["id", "name", "tasks"] 
                    } 
                } 
            }, 
            required: ["name", "folders"] 
        } 
    };
    
    const res = await executeAiWithFallback(prompt, "Project Manager AI Expert.", true, schema, 'summaries');
    return JSON.parse(res || '[]');
};

export const generateProjectProposal = async (name: string, industry: string, language: string = 'es') => {
    const prompt = `Estrategia de lanzamiento para ${name}. Idioma: ${language}.`;
    return await executeAiWithFallback(prompt, "Venture Architect.", false, null, 'summaries');
};

export const generateProjectValueProposition = async (name: string, industry: string, context: string = '', language: string = 'es') => {
    const contextText = context ? `\n\nCONTEXTO PROPORCIONADO POR EL USUARIO (MÁXIMA PRIORIDAD): ${context}\nUsa esto como la base principal para redactar la propuesta de valor y el objetivo estratégico.` : '';
    const prompt = `Genera una propuesta de valor y un objetivo estratégico para el proyecto "${name}" en la industria "${industry}".${contextText}
    
    REQUISITOS:
    - Propuesta de Valor: Máximo 150 caracteres. Impactante, precisa y diferenciadora.
    - Objetivo Estratégico: Máximo 200 caracteres. Claro, medible y ambicioso.
    - Idioma: ${language}.
    - Formato: JSON.`;
    
    const schema = {
        type: Type.OBJECT,
        properties: {
            valueProposition: { type: Type.STRING },
            objective: { type: Type.STRING }
        },
        required: ["valueProposition", "objective"]
    };
    
    const res = await executeAiWithFallback(prompt, "Estratega de Negocios Senior.", true, schema, 'summaries');
    return JSON.parse(res || '{"valueProposition": "", "objective": ""}');
};

export const generatePresentationCode = async (topic: string, plan: string = 'free', contextFiles: { data: string, mimeType: string }[] = [], numSlides: number = 8, referenceUrl?: string) => {
    let perplexityContext = "";
    const safeNumSlides = Math.min(30, Math.max(1, Number(numSlides) || 8));
    
    const sourceUrl = referenceUrl || topic.match(/https?:\/\/[^\s]+/i)?.[0];
    const requiresSearch = sourceUrl || /analiza|busca|investiga|resumen de(l)? (enlace|link|art[ií]culo|página|web)|noticias|tendencias|mercado|competencia|benchmark/i.test(topic) || /hoy|actual|reciente|2025|2026/i.test(topic);

    if (requiresSearch) {
        try {
            const pQuery = sourceUrl 
                ? `NAVEGACIÓN OBLIGATORIA: Analiza a fondo el contenido de este enlace: ${sourceUrl}. Extrae datos, cifras, estructura, claims, tono, hallazgos, oportunidades, riesgos y puntos clave para crear una presentación profesional sobre "${topic}".`
                : `Busca en internet información actualizada, datos verificables, tendencias, contexto de mercado, cifras y puntos clave sobre: ${topic}. Devuelve un briefing ejecutivo detallado para crear una presentación profesional.`;
            
            const pResult = await searchWithPerplexity(pQuery);
            if (pResult && pResult.text) {
                perplexityContext = `\n\n[BRIEFING ACTUALIZADO / FUENTES WEB]:\n${pResult.text}\n\nUsa este briefing como contexto obligatorio. No inventes cifras si no aparecen aquí; si falta un dato, formula el punto sin número específico.\n\n`;
            }
        } catch(e) { console.error("Perplexity error:", e); }
    }

    const systemInstruction = `Eres CHIEF PRESENTATION OFFICER + DIRECTOR CREATIVO SENIOR + CONSULTOR ESTRATÉGICO.
Tu tarea es crear una presentación CINEMÁTICA MASTERPIECE de nivel agencia premium sobre: "${topic}".
${perplexityContext}

SALIDA ESTRICTA:
- Responde SOLO JSON válido. Nada de markdown, nada de explicaciones.
- Estructura exacta: { "title": "...", "slides": [ { "title": "...", "customHtml": "..." } ] }
- Genera EXACTAMENTE ${safeNumSlides} diapositivas.
- TODO el texto visible debe estar en ESPAÑOL, salvo que el usuario haya pedido otro idioma.

NIVEL DE CONTENIDO:
- No hagas slides genéricas. Cada slide debe tener lógica, tesis clara, datos/ideas accionables y narrativa conectada.
- Construye arco profesional: portada brutal, contexto, problema, insight, marco estratégico, solución/propuesta, beneficios, evidencia, implementación, cierre.
- Si el tema es educativo, enseña con profundidad; si es negocio, vende con estructura; si es reporte, sintetiza con precisión.
- Títulos cortos y potentes. Subtítulos útiles. Bullets concretos. Evita relleno.
- Incluye microcopy estratégico: etiquetas, métricas, pasos, timelines, matrices, comparativas, mini dashboards o callouts cuando aporten.

NIVEL DE DISEÑO:
- Cada customHtml debe ser un fragmento HTML autocontenido para una diapositiva 16:9, listo para insertarse dentro de un canvas.
- Usa clases Tailwind y CSS inline cuando sea necesario. NO uses <script>. NO uses iframes. NO uses estilos globales peligrosos.
- El bloque raíz de cada slide debe ocupar w-full h-full, tener overflow-hidden, border radius visual, composición premium y responsive.
- Diseño tipo Apple/Linear/Stripe keynote: jerarquía fuerte, mucho aire, cards elegantes, gradientes sobrios, glassmorphism moderado, sombras suaves, detalles finos.
- La tipografía debe escalar con unidades cqw/cqh o clases fluidas para que se vea bien en miniatura, editor, presentación y PDF.
- Asegura contraste AAA. Nunca pongas texto ilegible sobre fondos cargados.
- Varía layouts entre: portada cinematográfica, split editorial, dashboard, matriz 2x2, timeline, cards, big-number, roadmap, comparación antes/después, cierre CTA.
- Usa iconografía como elementos visuales con emoji o lucide-like simple si no hay componente real. No dependas de librerías externas.
- Puedes usar imágenes remotas solo como fondos decorativos con URLs estables tipo https://images.unsplash.com/... o https://picsum.photos/seed/...; si no aportan, usa shapes/gradientes.

CALIDAD OBLIGATORIA:
- La presentación debe sentirse terminada, no boceto.
- Ninguna slide debe repetir exactamente el mismo layout.
- No cortes texto. No generes párrafos enormes. No uses listas interminables.
- Cada slide debe tener al menos 3 niveles visuales: headline, contenido principal, detalle/callout.
- El JSON debe poder parsearse directamente con JSON.parse.`;

    const history: any[] = [
        { 
            role: 'user', 
            parts: [
                { text: `GENERA EXACTAMENTE ${safeNumSlides} DIAPOSITIVAS MASTERPIECE EN JSON SOBRE: "${topic}". Usa los archivos adjuntos como contexto obligatorio si existen. Cada customHtml debe ser código HTML premium, cinemático, lógico y completamente renderizable.` },
                ...contextFiles.map(f => ({ inlineData: { data: f.data, mimeType: f.mimeType } }))
            ] 
        }
    ];

    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const safePlan = plan || userProfile?.plan || 'free';
    const subscriptionStatus = userProfile?.subscriptionStatus;
    let budgetMode: 'normal' | 'saving' | 'panic' = 'normal';
    if (userProfile?.uid) {
        try {
            const usageD = await getDoc(doc(db, "user_usage", userProfile.uid));
            budgetMode = computeBudgetMode(usageD.exists() ? (usageD.data() as any) : null);
        } catch (e) { console.warn("No se pudo leer presupuesto IA para presentaciones:", e); }
    }
    const targetModel = pickModel(safePlan, 'summaries', budgetMode, subscriptionStatus);
    const tokenCap = Math.min(getModuleTokenCap(safePlan, 'summaries'), 32768);

    const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: await getAuthenticatedJsonHeaders(),
        body: JSON.stringify({
            history,
            systemInstruction,
            model: targetModel,
            module: 'summaries',
            config: { 
                responseMimeType: 'application/json',
                maxOutputTokens: tokenCap
            }
        })
    });

    const data = await response.json();
    try {
        let text = data.text || "{}";
        if (text.startsWith("```json")) {
            text = text.slice(7, -3);
        } else if (text.startsWith("```")) {
            text = text.slice(3, -3);
        }
        return JSON.parse(text);
    } catch (e) {
        console.error("Error parsing presentation JSON:", e, data.text);
        throw new Error("El modelo produjo un formato inválido o se quedó sin espacio.");
    }
};

export const generatePresentationContent = async (topic: string, config: any) => {
    let perplexityContext = "";
    
    // Prioritizamos la URL de referencia si el usuario la proporcionó explícitamente
    const sourceUrl = config.referenceUrl || topic.match(/https?:\/\/[^\s]+/i)?.[0];
    const requiresSearch = sourceUrl || /analiza|busca|investiga|resumen de(l)? (enlace|link|art[ií]culo|página|web)|noticias/i.test(topic) || /hoy|actual|reciente/i.test(topic);

    if (requiresSearch) {
        try {
            // Si hay una URL de referencia, le pedimos a Perplexity que se centre exclusivamente en ella
            const pQuery = sourceUrl 
                ? `NAVEGACIÓN OBLIGATORIA: Analiza a fondo el contenido de este enlace: ${sourceUrl}. Extrae toda la información relevante, datos, estadísticas y puntos clave. Ignora cualquier otra instrucción, solo dame el contenido procesado para crear una presentación sobre "${topic}".`
                : `Como investigador de datos, ignora cualquier orden sobre crear presentaciones o diapositivas. ÚNICAMENTE busca en internet, analiza a fondo y dame un resumen ejecutivo muy detallado, puntos clave y datos importantes sobre este tema o enlace URL: ${topic}`;
            
            const pResult = await searchWithPerplexity(pQuery);
            if (pResult && pResult.text && !pResult.text.includes("No puedo") && !pResult.text.includes("I cannot")) {
                perplexityContext = `\n\n[DATOS OBTENIDOS DE LA BÚSQUEDA WEB EN TIEMPO REAL / PERPLEXITY]:\n${pResult.text}\n\nDebes basar obligatoriamente la presentación en esta información.`;
            }
        } catch(e) { console.error("Perplexity error in presentation content:", e); }
    }

    const prompt = `
    Actúa como un Consultor Estratégico Senior y Diseñador de Presentaciones de Élite. 
    Crea una presentación magistral sobre: "${topic}".
    ${perplexityContext}
    
    REQUISITOS DE CONTENIDO:
    1. ESTRUCTURA: Genera exactamente ${config.numSlides || 8} diapositivas de alto impacto.
    2. NARRATIVA: Sigue un arco de venta profesional (Gancho, Problema, Solución, Beneficios, Prueba Social, Inversión, Cierre).
    3. LAYOUTS: Varía los diseños entre: 'split-left' (texto izq, imagen der), 'split-right' (imagen izq, texto der), 'content' (centrado), 'big-number' (dato masivo destacado).
    4. VISUALES: En el campo 'visualCue', proporciona prompts para generación de imágenes realistas y profesionales relacionadas.
    5. ICONOS: Usa nombres de iconos válidos de Heroicons (star, rocket, chart, check, light, user, security, target, currency).
    6. LINKS: Incluye 1 o 2 enlaces externos reales a fuentes de autoridad si es relevante.

    REQUISITOS TÉCNICOS Y ESTÉTICOS:
    - PALETA DE COLORES: Sugiere un 'backgroundColor' profesional (gradientes sobrios, no aleatorios) and un 'textColor' ('white' o 'black') que garantice legibilidad AAA.
    - Asegura que los 'bullets' sean concisos (máximo 15 palabras por punto).

    IDIOMA (CRÍTICO): 
    - Debes generar TODO el texto (títulos, subtítulos, bullets) ESTRICTAMENTE en ESPAÑOL.
    - ÚNICA EXCEPCIÓN: Si en el tema/prompt ("${topic}") se exige explícitamente hacerlo en otro idioma. De lo contrario, ESPAÑOL OBLIGATORIO.
    `;

    const schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            slides: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Título impactante y corto." },
                        subtitle: { type: Type.STRING, description: "Subtítulo descriptivo de soporte." },
                        bullets: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "Máximo 4 puntos clave potentes."
                        },
                        layout: { 
                            type: Type.STRING, 
                            enum: ['split-left', 'split-right', 'content', 'big-number'],
                            description: "Layout visual de la diapositiva." 
                        },
                        visualCue: { type: Type.STRING, description: "Prompt detallado para la imagen de fondo or lateral." },
                        icon: { type: Type.STRING, description: "Icono representativo de la idea." },
                        type: { type: Type.STRING, enum: ['content', 'video'], default: 'content' },
                        backgroundColor: { type: Type.STRING, description: "Clase de gradiente Tailwind sugerida." },
                        textColor: { type: Type.STRING, enum: ['white', 'black'], description: "Color de texto para contraste." },
                        externalLinks: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    text: { type: Type.STRING },
                                    url: { type: Type.STRING }
                                }
                            }
                        }
                    },
                    required: ["title", "subtitle", "bullets", "layout", "visualCue", "icon", "type", "backgroundColor", "textColor"]
                }
            }
        },
        required: ["title", "slides"]
    };

    const result = await executeAiWithFallback(prompt, "Designer Elite Expert.", true, schema, 'summaries');
    try {
        return JSON.parse(result || '{}');
    } catch (e) {
        console.error("Error parsing presentation JSON in generatePresentationContent:", e, result);
        throw new Error("El modelo produjo un formato inválido o de contenido.");
    }
};

export const generateFormCode = async (prompt: string) => {
    const sys = "Designer Elite Expert.";
    const fullPrompt = `Actúa como un Diseñador de Interfaces Senior de clase mundial. Genera código HTML/CSS con Tailwind para un formulario de ALTA GAMA basado en este requerimiento: "${prompt}".
        
        REQUISITOS DE DISEÑO Y ESTRUCTURA (EXTREMADAMENTE IMPORTANTES):
        1. CENTRADO TOTAL: El formulario DEBE estar envuelto en un contenedor flex que lo centre perfectamente en pantalla (h-screen items-center justify-center).
        2. ESTÉTICA PREMIUM: Usa sombras profundas (shadow-2xl), bordes muy redondeados (rounded-[2.5rem]), y espaciado generoso.
        3. ESTRUCTURA MODULAR: CADA campo (label + input/select/textarea) DEBE estar dentro de un div con la clase EXACTA: "form-field-container mb-6". Esto es vital para que el usuario lo edite después.
        4. ATRIBUTO NAME ÚNICO: CADA elemento de entrada (input, select, textarea) DEBE tener obligatoriamente un atributo 'name' único y descriptivo (ej: 'nombre_completo', 'correo', 'comentarios'). SIN ATRIBUTO NAME, LOS DATOS NO SE GUARDARÁN.
        5. INPUTS DE OPCIÓN: Para radio buttons o checkboxes, DEBES incluir siempre el atributo 'value' (valor real) y estar envueltos en un <label> con texto descriptivo para que el usuario sepa qué está marcando.
        6. POLÍTICAS DE PRIVACIDAD: Antes del botón de envío, DEBES incluir obligatoriamente un checkbox de aceptación con el texto: "Acepto las <a href='https://www.goatify.app/privacidad/' target='_blank' class='text-brand-primary underline'>Políticas de Privacidad</a>". Su atributo 'name' debe ser 'privacidad'.
        7. BOTÓN DE ENVÍO: Debe ser el ÚLTIMO elemento del formulario, con diseño elegante y clase "submit-button-container".
        8. NO IMPRIMIR EL PROMPT: Bajo ninguna circunstancia debes incluir el texto introductorio o el requerimiento del usuario como un párrafo descriptivo en el formulario final. Si necesitas una descripción corta, inventa una profesional, o no pongas ninguna.
        9. SALIDA: Devuelve solo el código HTML/CSS dentro de un bloque markdown html. No incluyas explicaciones externas.`;

    const res = await executeAiWithFallback(fullPrompt, sys, false, null, 'chat');
    return (res || "").replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
};

export const generateWebCodeStream = async (
    history: WebDevMessage[], 
    currentCode: string, 
    plan: string = 'free',
    projectType: 'web' | 'app' = 'web',
    allFiles: { name: string, code: string }[] = [],
    urlContext?: string
) => {
    let contextStr = '';
    if (allFiles && allFiles.length > 0) {
        contextStr = "\nCONTEXTO DE OTROS ARCHIVOS DEL PROYECTO:\n" + allFiles.map(f => `--- ${f.name} ---\n${f.code}`).join('\n\n') + "\n(Usa estos archivos como referencia de diseño y lógica si se pide una nueva pestaña/página).";
    }

    const contents = history.map((msg, index) => {
        let text = msg.text;
        if (msg.file) {
            text = `CÓDIGO ACTUAL:\n${msg.file.content}\n\nINSTRUCCIÓN:\n${text}`;
        }
        if (index === history.length - 1 && contextStr) {
            text += `\n\n${contextStr}`;
        }
        return {
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text }]
        };
    });

    const currentYear = new Date().getFullYear();
    const systemInstruction = `Eres Shivo, un Senior Full-Stack Developer. Tienes un contexto enorme y eres rápido.
Primero, explica brevemente qué vas a hacer en 1 a 3 líneas. Tu explicación debe estar rodeada por las etiquetas [EXPLANATION] y [/EXPLANATION].
Luego, genera el código HTML/JS/CSS completo en un solo archivo.
El código DEBE empezar directamente con la etiqueta \`<!DOCTYPE html>\` (o \`<html\`) y terminar con \`</html>\`.
No uses Markdown para envolver el código.
Respeta TODOS los requerimientos del usuario. Usa frameworks modernos si lo piden, o HTML clásico con Tailwind/React vía unpkg.
Asegúrate de SIEMPRE devolver el código completo sin omisiones.
REGLA IMPORTANTE DE FIRMA: Siempre debes incluir al final del contenido visible de la página (en el footer o parte inferior) la firma: "© ${currentYear} - Sitio desarrollado en ia.goatify.app" o similar.`;

    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const safePlan = plan || userProfile?.plan || 'free';
    const targetModel = pickModel(safePlan, 'web', 'normal', userProfile?.subscriptionStatus);

    const response = await fetch('/api/gemini/stream', {
        method: 'POST',
        headers: await getAuthenticatedJsonHeaders(),
        body: JSON.stringify({
            history: contents,
            systemInstruction,
            model: targetModel,
            module: 'web',
            config: { maxOutputTokens: Math.min(getModuleTokenCap(safePlan, 'web'), 32768) }
        })
    });

    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
        async *[Symbol.asyncIterator]() {
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') return;
                        if (!dataStr) continue;
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.error) throw new Error(data.error);
                            if (data.text) yield { text: data.text };
                        } catch (e) {
                            // ignore parse error if incomplete
                        }
                    }
                }
            }
        }
    };
};

export const generateWebCode = async (
    history: WebDevMessage[], 
    currentCode: string, 
    plan: string = 'free',
    projectType: 'web' | 'app' = 'web',
    allFiles: { name: string, code: string }[] = []
) => {
    let contextStr = '';
    if (allFiles && allFiles.length > 0) {
        contextStr = "\nCONTEXTO DE OTROS ARCHIVOS DEL PROYECTO:\n" + allFiles.map(f => `--- ${f.name} ---\n${f.code}`).join('\n\n') + "\n(Usa estos archivos como referencia de diseño y lógica si se pide una nueva pestaña/página).";
    }

    const contents = history.map((msg, index) => {
        let text = msg.text;
        if (msg.file) {
            text = `CÓDIGO ACTUAL:\n${msg.file.content}\n\nINSTRUCCIÓN:\n${text}`;
        }
        if (index === history.length - 1 && contextStr) {
            text += `\n\n${contextStr}`;
        }
        return {
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text }]
        };
    });
    
    const currentYear = new Date().getFullYear();
    const systemInstruction = `Eres Shivo, Senior Full-Stack Developer.
Genera el código HTML/JS/CSS solicitado de forma COMPLETA y profesional.

Tu respuesta DEBE seguir este formato:
[EXPLANATION]
...explicación breve...
[/EXPLANATION]
[CODE]
<!DOCTYPE html>
...código completo...
</html>
[/CODE]

No uses markdown. El código debe ser funcional e incluir todos los estilos y scripts necesarios para que funcione standalone.
REGLA IMPORTANTE DE FIRMA: Siempre debes incluir al final del contenido visible de la página (en el footer o parte inferior) la firma: "© ${currentYear} - Sitio desarrollado en ia.goatify.app" o similar.`;
    
    const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: await getAuthenticatedJsonHeaders(),
        body: JSON.stringify({
            history: contents,
            systemInstruction,
            model: 'gemini-3-flash-preview'
        })
    });
    const data = await response.json();
    return data.text || "";
};

export const generatePartnerClientSiteHtml = async (lead: PartnerLead, userName: string, partnerCode: string, country: string, taxPercentage: number = 0) => {
    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const currency = userProfile?.currency || 'USD';

    const formatForHtml = (text: string = "") => {
        if (!text) return "";
        const tableRegex = /\|(.+)\|[\r\n]+\|([-: |]+)\|[\r\n]+((?:\|.*\|[\r\n]*)+)/g;
        let processedText = text.replace(tableRegex, (match, header, separator, body) => {
            const headers = header.split('|').filter(h => h.trim() !== '').map(h => `<th class="px-6 py-4 font-black text-white uppercase text-[10px] tracking-widest bg-purple-600 border-none">${h.trim()}</th>`).join('');
            const rows = body.trim().split('\n').map(row => {
                const cells = row.split('|').filter(c => c.trim() !== '').map(c => `<td class="px-6 py-4 text-sm text-neutral-700 border-b border-neutral-100">${c.trim()}</td>`).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            // REMOVIDO OVERFLOW-X-AUTO Y SHADOW SEGÚN SOLICITUD DE "SIN SCROLL" EN MÓVIL v2.5
            return `<div class="my-8 rounded-2xl border border-neutral-200"><table class="w-full text-left border-collapse"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
        });

        return processedText
            .replace(/### (.*)/g, '<h3 class="text-2xl font-black text-purple-600 mt-12 mb-6 uppercase tracking-tighter border-l-8 border-purple-600 pl-4">$1</h3>')
            .replace(/## (.*)/g, '<h2 class="text-3xl font-black text-neutral-900 mt-16 mb-8 uppercase tracking-tighter border-b-2 border-neutral-100 pb-4">$2</h2>')
            .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-neutral-800">$1</strong>')
            .replace(/^\* (.*)/gm, '<li class="flex items-start gap-3 mb-3 text-neutral-700 font-medium"><span class="w-2 h-2 rounded-full bg-purple-500 mt-2 flex-shrink-0"></span><span>$1</span></li>')
            .replace(/\n\n/g, '</p><p class="mb-6 leading-relaxed">')
            .trim();
    };

    const cleanProposal = formatForHtml(lead.proposalText || "");
    const cleanContract = formatForHtml(lead.contractEcuText || lead.contractLatText || "");
    const cleanPreInvoice = formatForHtml(lead.preInvoiceEcuText || lead.preInvoiceLatText || "");
    const finalValue = lead.finalValue || lead.estimatedValue || 0;
    const taxValue = finalValue * (taxPercentage / 100);
    const totalWithTax = finalValue + taxValue;
    const advance = totalWithTax / 2;

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Sales Room Elite | ${lead.clientName}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@1,700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #050505; color: #fff; scroll-behavior: smooth; }
        .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
        .step-content { display: none; }
        .step-content.active { display: block; animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .shine-btn { position: relative; overflow: hidden; }
        .shine-btn::after { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: linear-gradient(45deg, transparent, rgba(255,255,255,0.15), transparent); transform: rotate(45deg); transition: 0.6s; }
        .shine-btn:hover::after { left: 100%; top: 100%; }
        
        /* CORRECCIÓN RESPONSIVA DE PADDING v25.0: FULL WIDTH EN MÓVIL */
        .doc-viewer { 
            background: #fff; 
            color: #111; 
            border-radius: 0; /* Full width en móvil por defecto */
            padding: 0; 
            box-shadow: none; 
            overflow: hidden;
            width: 100%;
        }
        .doc-viewer .prose { padding: 1.25rem; } 

        @media (min-width: 640px) {
            .doc-viewer {
                padding: 4rem;
                border-radius: 3rem;
                box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.7); 
            }
            .doc-viewer .prose { padding: 0; }
        }

        .signed-stamp { display: none; font-family: 'Playfair Display', serif; }
        .signed-stamp.active { display: flex; animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes scaleIn { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media print { .no-print, nav, #progress-container, #footer-actions, .cta-btn, #change-request-trigger { display: none !important; } .doc-viewer { box-shadow: none; border: none; padding: 0; } body { background: white; color: black; } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes glowPulse { 0% { filter: shadow(0 0 10px rgba(139, 92, 246, 0.4)); } 50% { filter: shadow(0 0 25px rgba(139, 92, 246, 0.8)); } 100% { filter: shadow(0 0 10px rgba(139, 92, 246, 0.4)); } }
        .animate-glow { animation: glowPulse 2s infinite ease-in-out; }
        .social-strip { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1); }
        .spatial-bar { background: linear-gradient(135deg, #1a0b2e 0%, #311557 50%, #1a0b2e 100%); border: 1px solid rgba(255,255,255,0.1); }
        .bg-brand-primary { background-color: #4c1d95; }
        @media (max-width: 640px) {
            nav div.flex.gap-3 { font-size: 8px !important; white-space: nowrap; overflow-x: auto; padding-bottom: 5px; }
            #next-btn { font-size: 10px; padding: 0.75rem 1rem; }
            #prev-btn, #pdf-btn { padding: 0.75rem; }
            #footer-actions { padding: 0.75rem; }
        }
    </style>
</head>
<body class="min-h-screen flex flex-col text-center items-center overflow-x-hidden">

    <nav class="fixed top-0 left-0 right-0 z-[100] glass px-4 py-3 flex justify-between items-center border-b border-white/10 no-print">
        <div class="flex items-center gap-2">
            <img src="${LOGO_URL}" class="h-6 sm:h-8 w-auto" alt="Goatify">
            <div class="h-4 w-px bg-white/20"></div>
            <span class="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">Sales Room</span>
        </div>
        <div class="flex gap-3 sm:gap-4 items-center overflow-x-auto no-scrollbar max-w-[70vw]">
            <a href="https://www.goatify.app/inicio" target="_blank" class="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Inicio</a>
            <a href="https://www.goatify.app/portafolio/" target="_blank" class="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Portafolio</a>
            <a href="https://www.goatify.app/pricing/" target="_blank" class="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Precios</a>
            <a href="https://www.goatify.app/socios/" target="_blank" class="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Socios</a>
            <a href="https://www.goatify.app/fundadores/" target="_blank" class="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Fundadores</a>
            <a href="https://www.goatify.app/social-media/" target="_blank" class="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Social Media</a>
            <a href="https://www.goatify.app/automatizaciones/" target="_blank" class="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Vendedores IA</a>
        </div>
    </nav>

    <div id="progress-container" class="mt-28 sm:mt-32 px-4 sm:px-6 w-full no-print flex justify-center">
        <div class="flex justify-between items-center relative w-full max-w-sm mx-auto">
            <div class="absolute top-1/2 left-[18px] right-[18px] sm:left-6 sm:right-6 h-1 bg-white/10 -translate-y-1/2 z-0 rounded-full">
                <div id="progress-bar" class="absolute top-0 left-0 h-full bg-brand-primary rounded-full transition-all duration-700" style="width: 0%"></div>
            </div>
            <div id="dot-1" class="relative z-10 w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-neutral-800 flex items-center justify-center text-[9px] sm:text-xs font-black border-4 border-black transition-all text-center">1</div>
            <div id="dot-2" class="relative z-10 w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-neutral-800 flex items-center justify-center text-[9px] sm:text-xs font-black border-4 border-black transition-all text-center">2</div>
            <div id="dot-3" class="relative z-10 w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-neutral-800 flex items-center justify-center text-[9px] sm:text-xs font-black border-4 border-black transition-all text-center">3</div>
            <div id="dot-4" class="relative z-10 w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-neutral-800 flex items-center justify-center text-[9px] sm:text-xs font-black border-4 border-black transition-all text-center">4</div>
        </div>
    </div>

    <main class="flex-1 max-w-6xl mx-auto w-full pt-8 pb-24 sm:pb-48 px-0 sm:px-6 flex flex-col items-center">
        
        <div id="step-1" class="step-content active w-full">
            <div class="mb-12 text-center animate-fade-in px-4">
                <span class="text-[11px] font-black text-purple-500 uppercase tracking-[0.5em] mb-4 block">Propuesta Oficial</span>
                <h1 class="text-3xl sm:text-6xl font-black tracking-tighter uppercase leading-[0.9] mb-6 text-center">Soluciones Inteligentes<br/> <span class="text-purple-500 italic">& Transformación IA</span></h1>
                <p class="text-neutral-500 font-bold text-sm sm:text-base uppercase tracking-[0.2em] text-center">Exclusivo para: ${lead.clientName}</p>
            </div>
            <div class="doc-viewer font-sans mb-12 w-full">
                <div class="prose max-w-none text-justify leading-relaxed"><p class="text-neutral-400 text-[10px] mb-12 uppercase font-black tracking-[0.3em] border-b pb-4 text-center">Expediente ID: ${lead.id.slice(-10).toUpperCase()}</p>${cleanProposal}</div>
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12 no-print w-full px-4">
                <button onclick="window.open('https://www.goatify.app/portafolio/', '_blank')" class="p-6 glass rounded-3xl text-center group hover:bg-white/5 transition-all">
                    <p class="text-[10px] font-black uppercase text-neutral-400 mb-2">Casos de Éxito</p>
                    <p className="text-sm font-black text-white group-hover:text-purple-400">Ver Portafolio</p>
                </button>
                <button onclick="window.open('https://www.goatify.app/pricing/', '_blank')" class="p-6 glass rounded-3xl text-center group hover:bg-white/5 transition-all">
                    <p class="text-[10px] font-black uppercase text-neutral-400 mb-2">Transparencia</p>
                    <p className="text-sm font-black text-white group-hover:text-emerald-400">Ver Catálogo</p>
                </button>
                <button onclick="window.open('https://ia.goatify.app/#partners', '_blank')" class="p-6 glass rounded-3xl text-center group hover:bg-white/5 transition-all">
                    <p class="text-[10px] font-black uppercase text-neutral-400 mb-2">Plan de Ganancias</p>
                    <p className="text-sm font-black text-white group-hover:text-blue-400">Plan de Socios</p>
                </button>
            </div>

            <div class="social-strip no-print py-8 mb-12 text-center rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md w-full max-w-[90vw] mx-auto">
                <p class="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-purple-300 px-4 text-center">¡Únete a la vanguardia! Subimos contenido diario sobre IA y Tecnología en nuestras redes.</p>
            </div>
        </div>

        <div id="step-2" class="step-content w-full">
            <div class="mb-12 text-center animate-fade-in px-4">
                <span class="text-[11px] font-black text-emerald-500 uppercase tracking-[0.5em] mb-4 block">Transparencia Operativa</span>
                <h1 class="text-3xl sm:text-7xl font-black tracking-tighter uppercase leading-[0.9] mb-6 text-center">Modelo de <br/> <span class="text-emerald-500 italic">Inversión</span></h1>
            </div>
            <div class="glass p-8 sm:p-24 rounded-3xl sm:rounded-[4rem] shadow-3xl text-center mb-12 border border-emerald-500/20 relative overflow-hidden w-full px-4">
                <div class="mb-16">
                    <p class="text-[11px] font-black text-neutral-500 uppercase tracking-widest mb-4">Inversión Integral del Proyecto (Incl. IVA)</p>
                    <p class="text-4xl sm:text-9xl font-black tracking-tighter text-white drop-shadow-2xl">${totalWithTax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="text-xl sm:text-2xl text-neutral-600 font-bold tracking-normal ml-2">${currency}</span></p>
                    ${taxPercentage > 0 ? `<p class="text-xs sm:text-sm font-bold text-neutral-500 mt-2">Subtotal: ${finalValue.toLocaleString()} + IVA (${taxPercentage}%): ${taxValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>` : ''}
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-8 text-left max-w-3xl mx-auto">
                    <div class="p-8 bg-white/5 rounded-[2rem] border border-white/10 shadow-inner group hover:bg-emerald-500/10 transition-all cursor-default">
                        <p class="text-[10px] font-black text-purple-400 uppercase mb-3 tracking-widest">Anticipo de Activación (50%)</p>
                        <p class="text-3xl sm:text-4xl font-black text-white">${advance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        <p class="text-[9px] text-neutral-500 font-bold mt-2 uppercase">Incluye IVA</p>
                    </div>
                    <div class="p-8 bg-white/5 rounded-[2rem] border border-white/10 shadow-inner group hover:bg-white/10 transition-all cursor-default">
                        <p class="text-[10px] font-black text-neutral-400 uppercase mb-3 tracking-widest">Liquidación Final (50%)</p>
                        <p class="text-3xl sm:text-4xl font-black text-white">${advance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        <p class="text-[9px] text-neutral-500 font-bold mt-2 uppercase">Incluye IVA</p>
                    </div>
                </div>
            </div>
            <div class="doc-viewer font-sans mb-12 w-full">
                <div class="prose max-w-none text-justify">${cleanPreInvoice}</div>
                
                <!-- Payment Methods -->
                <div class="mt-12 p-8 bg-neutral-50 border border-neutral-200 rounded-3xl">
                    <h3 class="text-xl font-black text-neutral-900 uppercase mb-6">Métodos de Pago</h3>
                    <div class="grid grid-cols-1 ${taxPercentage > 0 ? 'md:grid-cols-2' : ''} gap-8 text-left">
                        ${taxPercentage > 0 ? `
                        <div>
                            <p class="font-bold text-neutral-800 mb-2">Transferencia Bancaria (Ecuador)</p>
                            <p class="text-sm text-neutral-600 leading-relaxed">
                                <strong>Banco Bolivariano</strong><br>
                                Cuenta Corriente: 5015025433<br>
                                RUC: 1793199203001<br>
                                Razón Social: Centro Iberoamericano de Educación
                            </p>
                        </div>
                        ` : ''}
                        <div>
                            <p class="font-bold text-neutral-800 mb-2">Tarjetas de Crédito / Débito</p>
                            <p class="text-sm text-neutral-600 leading-relaxed">
                                Aceptamos todas las tarjetas de crédito y débito.
                                ${!taxPercentage ? '<br><br><strong>El link de pago será enviado manualmente por su asesor.</strong>' : ''}
                                <br><br>
                                <span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold">NOTA IMPORTANTE:</span><br>
                                Los <strong>pagos recurrentes</strong> (suscripciones mensuales o anuales) se procesan automáticamente mediante tarjeta registrada en la plataforma.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Billing Form -->
                ${taxPercentage > 0 ? `
                <div class="mt-8 p-8 bg-white border-2 border-dashed border-neutral-300 rounded-3xl text-left">
                    <h3 class="text-xl font-black text-neutral-900 uppercase mb-6 flex items-center gap-3">
                        <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        Datos de Facturación
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-neutral-500 uppercase mb-1">Razón Social / Nombre</label>
                            <input type="text" id="billing-name" class="w-full bg-neutral-50 border border-neutral-200 p-3 rounded-xl text-sm font-medium focus:border-purple-500 outline-none" placeholder="Ej: Empresa S.A.">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-neutral-500 uppercase mb-1">RUC / CI</label>
                            <input type="text" id="billing-ruc" class="w-full bg-neutral-50 border border-neutral-200 p-3 rounded-xl text-sm font-medium focus:border-purple-500 outline-none" placeholder="Ej: 1799999999001">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-neutral-500 uppercase mb-1">Dirección</label>
                            <input type="text" id="billing-address" class="w-full bg-neutral-50 border border-neutral-200 p-3 rounded-xl text-sm font-medium focus:border-purple-500 outline-none" placeholder="Dirección completa">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-neutral-500 uppercase mb-1">Email Facturación</label>
                            <input type="email" id="billing-email" class="w-full bg-neutral-50 border border-neutral-200 p-3 rounded-xl text-sm font-medium focus:border-purple-500 outline-none" placeholder="contabilidad@empresa.com">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-neutral-500 uppercase mb-1">Teléfono</label>
                            <input type="tel" id="billing-phone" class="w-full bg-neutral-50 border border-neutral-200 p-3 rounded-xl text-sm font-medium focus:border-purple-500 outline-none" placeholder="+593 99 999 9999">
                        </div>
                    </div>
                    <p class="text-[10px] text-neutral-400 mt-4 italic">* Estos datos serán utilizados para generar su factura electrónica.</p>
                </div>
                ` : ''}
            </div>
        </div>

        <div id="step-3" class="step-content w-full">
             <div class="mb-12 text-center animate-fade-in px-4">
                <span class="text-[11px] font-black text-blue-500 uppercase tracking-[0.5em] mb-4 block text-center">Alianza Estratégica Digital</span>
                <h1 class="text-3xl sm:text-7xl font-black tracking-tighter uppercase leading-[0.9] mb-6 text-center">Convenio de <br/> <span class="text-blue-500 italic">Servicios</span></h1>
            </div>
            <div class="doc-viewer mb-12 font-sans w-full">
                <div class="prose max-w-none text-justify">${cleanContract}
                    <div class="mt-24 grid grid-cols-1 sm:grid-cols-2 gap-12 sm:gap-16 pt-16 border-t-2 border-neutral-100">
                        <div>
                            <p class="text-[11px] font-black uppercase text-neutral-400 mb-8 tracking-widest text-center">Aprobación del Cliente</p>
                            <div id="signature-input-container" class="flex flex-col items-center">
                                <input type="text" id="client-name-input" placeholder="Nombre completo..." class="w-full bg-neutral-50 border-2 border-neutral-100 p-5 rounded-2xl font-bold focus:border-purple-500 outline-none transition-all shadow-inner text-lg text-center text-black">
                                <button id="btn-sign-main" onclick="signDocument()" class="w-full mt-6 bg-purple-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shine-btn shadow-2xl">Validar Firma Digital</button>
                                <p class="text-[9px] text-neutral-400 font-bold mt-4 text-center uppercase tracking-widest opacity-60 px-4">Revisa bien los documentos, la firma es final y vinculante.</p>
                            </div>
                            <div id="signature-result" class="signed-stamp hidden flex-col p-8 bg-green-50 border-2 border-green-500 rounded-[2rem] relative items-center">
                                <p class="text-[10px] font-black text-green-700 uppercase tracking-[0.3em] mb-4">Firmado Digitalmente</p>
                                <p id="signed-name" class="text-3xl font-serif italic text-neutral-900 border-b-2 border-green-500/30 pb-2 text-center"></p>
                                <p class="text-[9px] text-green-600 mt-6 uppercase font-black tracking-tighter text-center">Validado por Goatify Protocol v2.5</p>
                            </div>
                        </div>
                        <div class="flex flex-col items-center">
                            <p class="text-[11px] font-black uppercase text-neutral-400 mb-8 tracking-widest text-center">Por la Empresa</p>
                            <div class="flex flex-col p-8 bg-neutral-50 border-2 border-neutral-200 rounded-[2rem] relative overflow-hidden group items-center w-full">
                                <p class="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-4">Sello Digital Corporativo</p>
                                <img src="${LOGO_URL}" class="w-16 h-16 mb-4 filter group-hover:scale-110 transition-transform duration-500" />
                                <p class="text-2xl font-black text-neutral-900 uppercase tracking-tighter">GOATIFY IA</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="step-4" class="step-content w-full">
             <div class="text-center py-16 sm:py-24 animate-fade-in flex flex-col items-center w-full px-4">
                <div className="relative inline-block mb-12">
                    <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                    <div className="w-20 h-20 bg-green-500 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-[0_20px_50px_rgba(34,197,94,0.4)] relative z-10">
                        <svg class="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                </div>
                <div class="space-y-6 max-w-3xl mx-auto">
                    <h2 class="text-4xl sm:text-7xl font-black uppercase text-white tracking-tighter leading-none italic text-center">¡Misión Iniciada!</h2>
                    <p class="text-neutral-400 text-lg sm:text-2xl font-medium leading-relaxed text-center px-4">Hemos recibido su validación integral. Nuestro equipo técnico iniciará el despliegue de inmediato.</p>
                </div>
                <div class="pt-12 flex flex-col sm:flex-row gap-4 justify-center w-full max-w-lg px-6">
                     <button class="flex-1 px-8 py-4 bg-brand-primary text-white shadow-2xl text-[10px] font-black uppercase tracking-widest rounded-2xl transform hover:scale-105 transition-all flex items-center justify-center gap-3" onclick="window.open('https://ia.goatify.app/', '_blank')">
                        Ir al Dashboard
                     </button>
                </div>
            </div>
        </div>

        <!-- APP PROMO SPATIAL BAR - REDISEÑO v3.0 (Logo más grande) -->
        <section class="spatial-bar mt-12 py-10 sm:py-16 px-6 sm:px-12 rounded-[2rem] sm:rounded-[4rem] shadow-3xl relative overflow-hidden group no-print w-[92vw] sm:w-full border border-white/10 max-w-5xl mx-auto">
            <div class="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] -mr-48 -mt-48 animate-pulse"></div>
            <div class="relative z-10 flex flex-col md:flex-row items-center gap-8 sm:gap-12">
                <div class="w-24 h-24 sm:w-44 sm:h-44 bg-white rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-7 shadow-2xl flex-shrink-0 animate-glow">
                    <img src="${LOGO_URL}" class="w-full h-full object-contain" alt="App">
                </div>
                <div class="flex-1 text-center md:text-left">
                    <h3 class="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-none mb-4">Sube de Nivel con <span class="text-purple-400">Goatify APP IA</span></h3>
                    <div class="text-[11px] sm:text-base text-purple-100 font-medium mb-6 leading-relaxed max-w-xl mx-auto md:mx-0">
                        Inicia sesión hoy y obtén <strong class="text-white">30 días GRATIS de suscripción Premium</strong>. <br/>
                        Gestión profesional de clientes, herramientas IA avanzada y proyectos ilimitados. <br/>
                        ¡Únete a la economía circular y genera comisiones de alto valor refiriendo servicios de élite!
                    </div>
                    <button onclick="window.open('https://ia.goatify.app/', '_blank')" class="px-8 sm:px-12 py-3.5 sm:py-5 bg-white text-black rounded-2xl sm:rounded-3xl font-black uppercase text-[10px] sm:text-xs tracking-widest shadow-2xl hover:scale-105 hover:bg-purple-50 transition-all transform active:scale-95">Comenzar Paraíso Premium</button>
                </div>
            </div>
        </section>

        <!-- CTA BUTTONS GRID -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-12 w-[92vw] sm:w-full max-w-5xl no-print px-2">
            <button onclick="window.open('https://www.goatify.app/inicio', '_blank')" class="py-3 px-2 glass rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all">Goatify Inicio</button>
            <button onclick="window.open('https://www.goatify.app/productividad', '_blank')" class="py-3 px-2 glass rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all">Productividad</button>
            <button onclick="window.open('https://www.goatify.app/automatizaciones/', '_blank')" class="py-3 px-2 glass rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all">Vendedores IA</button>
            <button onclick="window.open('https://www.goatify.app/social-media/', '_blank')" class="py-3 px-2 glass rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all">Social Media</button>
        </div>

        <!-- CONTACT SUPPORT BUTTON -->
        <div class="mt-12 no-print w-full flex justify-center px-4">
             <a href="mailto:info@goatify.app?subject=Consulta%20Estrategica%20-%20Sales%20Room&body=Hola,%20estoy%20revisando%20mi%20Sales%20Room%20y%20tengo%20una%20duda%20estrat%C3%A9gica." class="w-full max-w-sm py-4 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-3xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-blue-600/30 transition-all">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                Contactar Especialista VIP
             </a>
        </div>

    </main>

    <div id="change-request-card" class="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md hidden items-center justify-center p-4 animate-fade-in no-print">
         <div class="bg-white rounded-[2.5rem] sm:rounded-[3rem] p-8 sm:p-14 w-full max-w-2xl shadow-2xl relative animate-scale-in">
             <button onclick="closeChangeRequest()" class="absolute top-6 right-6 sm:top-8 sm:right-8 text-neutral-400 hover:text-black transition-colors"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
             <div class="text-center mb-10">
                <h3 class="text-2xl sm:text-3xl font-black text-neutral-900 uppercase tracking-tighter text-center">Módulo de Ajustes</h3>
                <p class="text-neutral-500 text-xs sm:text-sm mt-3 text-center">Describe el ajuste deseado para esta sección y Shivo lo procesará de inmediato.</p>
             </div>
             <textarea id="change-desc" class="w-full bg-neutral-50 border-2 border-neutral-100 rounded-2xl sm:rounded-3xl p-6 text-sm sm:text-base font-bold focus:border-blue-500 outline-none transition-all h-40 sm:h-48 mb-8 text-black" placeholder="Ej: Cambiar plazos de entrega..."></textarea>
             <button onclick="confirmChangeRequest()" class="w-full py-4 sm:py-5 bg-blue-600 text-white rounded-xl sm:rounded-2xl font-black uppercase text-[10px] sm:text-xs tracking-[0.3em] shadow-2xl">Enviar a Revisión Estratégica</button>
         </div>
    </div>

    <div id="change-request-trigger" class="fixed bottom-28 right-6 z-[110] no-print">
         <button id="btn-adjustments" onclick="openChangeRequest()" class="px-5 py-3 sm:px-6 sm:py-4 bg-blue-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all border-2 border-white/20 flex items-center gap-2 sm:gap-3">
            <svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            <span class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest">Solicitar Ajuste</span>
         </button>
    </div>

    <div id="footer-actions" class="fixed bottom-0 left-0 right-0 p-3 sm:p-6 glass border-t border-white/10 z-[100] flex flex-col items-center gap-4 no-print">
        <div class="flex justify-center items-center gap-3 sm:gap-4 w-full max-w-3xl">
            <button id="prev-btn" onclick="prevStep()" class="p-2 sm:p-5 bg-neutral-800/40 text-white rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[10px] tracking-widest border border-white/10 opacity-0 pointer-events-none transition-all">Atrás</button>
            <button id="next-btn" onclick="nextStep()" class="flex-1 max-w-2xl py-3 sm:p-5 bg-purple-600 text-white rounded-xl sm:rounded-2xl font-black uppercase text-[11px] sm:text-sm tracking-[0.2em] shadow-2xl shine-btn text-center">Aprobar Estrategia</button>
            <button id="pdf-btn" onclick="window.print()" class="p-2 sm:p-5 bg-white/10 text-white rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[10px] tracking-widest border border-white/10">PDF</button>
        </div>
    </div>

    <!-- FOOTER ENRIQUECIDO -->
    <footer class="w-full bg-[#030303] py-16 sm:py-20 px-6 no-print border-t border-white/5 flex flex-col items-center">
        <img src="${LOGO_URL}" class="h-8 sm:h-10 w-auto mb-10 opacity-60" alt="Goatify">
        
        <div class="grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-4 sm:gap-8 mb-12 max-w-4xl text-center">
             <a href="https://www.goatify.app/inicio" target="_blank" class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Inicio</a>
             <a href="https://www.goatify.app/portafolio/" target="_blank" class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Portafolio</a>
             <a href="https://www.goatify.app/pricing/" target="_blank" class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Precios</a>
             <a href="https://www.goatify.app/socios/" target="_blank" class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Socios</a>
             <a href="https://www.goatify.app/fundadores/" target="_blank" class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Fundadores</a>
             <a href="https://www.goatify.app/social-media/" target="_blank" class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Social Media</a>
             <a href="https://www.goatify.app/automatizaciones/" target="_blank" class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Vendedores IA</a>
        </div>

        <div class="flex justify-center gap-6 mb-12">
            <a href="https://www.tiktok.com/@goatify.ia" target="_blank" class="text-white/30 hover:text-white transition-all transform hover:scale-110"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v6.16c0 2.52-1.12 4.89-2.91 6.52-1.43 1.31-3.3 2.05-5.24 2.22-1.94.19-3.9-.23-5.62-1.09-3.17-1.59-5.37-4.91-5.66-8.47-.29-3.55 1.35-7.07 4.26-9.22 1.45-1.07 3.23-1.7 5.01-1.77v4.03c-1.61.15-3.12.88-4.21 1.98-1.43 1.43-1.92 3.57-1.26 5.51.67 1.94 2.33 3.39 4.37 3.81 2.04.42 4.18-.11 5.81-1.46 1.63-1.35 2.57-3.38 2.57-5.48V0h-1.02z"/></svg></a>
            <a href="https://www.facebook.com/profile.php?id=61574864266396" target="_blank" class="text-white/30 hover:text-white transition-all transform hover:scale-110"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"></path></svg></a>
            <a href="https://www.instagram.com/goatify.ia/" target="_blank" class="text-white/30 hover:text-white transition-all transform hover:scale-110"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.162 6.162-2.759 6.162-6.163-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"></path></svg></a>
            <a href="https://www.linkedin.com/company/goatify-ia/" target="_blank" class="text-white/30 hover:text-white transition-all transform hover:scale-110"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"></path></svg></a>
            <a href="https://www.youtube.com/@goatify_ia" target="_blank" class="text-white/30 hover:text-white transition-all transform hover:scale-110"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path></svg></a>
        </div>

        <a href="https://www.goatify.app/privacidad/" target="_blank" class="text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white transition-colors mb-4">Política de Privacidad</a>
        <p class="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">© 2026 Goatify IA Solutions - División CIE S.A.S.</p>
    </footer>

    <script>
        let currentStep = 1;
        let isAlreadySigned = ${lead.contractSigned || false};
        let clientSignature = "${lead.clientRepresentative || ""}";

        function updateUI() {
            document.querySelectorAll('.step-content').forEach(s => s.classList.remove('active'));
            document.getElementById('step-' + currentStep).classList.add('active');
            
            const bar = document.getElementById('progress-bar');
            bar.style.width = ((currentStep - 1) * 33.33) + '%';
            
            document.querySelectorAll('[id^="dot-"]').forEach((dot, idx) => {
                const stepNum = idx + 1;
                if (stepNum <= currentStep) {
                    dot.classList.add('bg-brand-primary', 'text-white', 'border-brand-primary');
                    dot.classList.remove('bg-neutral-800', 'border-black');
                } else {
                    dot.classList.remove('bg-brand-primary', 'text-white', 'border-brand-primary');
                    dot.classList.add('bg-neutral-800', 'border-black');
                }
            });
            
            const prev = document.getElementById('prev-btn');
            const next = document.getElementById('next-btn');
            const pdf = document.getElementById('pdf-btn');
            const trigger = document.getElementById('change-request-trigger');
            
            if(currentStep > 1) { prev.classList.add('opacity-100', 'pointer-events-auto'); } else { prev.classList.remove('opacity-100', 'pointer-events-auto'); }

            if(currentStep === 4) {
                next.style.display = 'none';
                trigger.style.display = 'none';
                pdf.style.display = 'none';
            } else {
                next.style.display = 'block';
                pdf.style.display = 'block';
                if(isAlreadySigned) {
                    trigger.style.display = 'none';
                } else {
                    trigger.style.display = 'flex';
                }

                if(currentStep === 1) next.innerText = 'Aprobar Estrategia';
                if(currentStep === 2) next.innerText = 'Validar Inversión';
                if(currentStep === 3) next.innerText = isAlreadySigned ? 'Finalizar Misión' : 'Firmar y Comenzar Desarrollo';
            }
            
            if(isAlreadySigned) {
                const container = document.getElementById('signature-input-container');
                if(container) container.style.display = 'none';
                const result = document.getElementById('signature-result');
                if(result) { 
                    result.classList.remove('hidden'); 
                    result.classList.add('active');
                    result.style.display = 'flex';
                    document.getElementById('signed-name').innerText = clientSignature;
                }
            }
            window.scrollTo({top: 0, behavior: 'smooth'});
        }

        function nextStep() {
            if(currentStep === 2) {
                const nameInput = document.getElementById('billing-name');
                if (nameInput) {
                    const name = nameInput.value;
                    const ruc = document.getElementById('billing-ruc').value;
                    const email = document.getElementById('billing-email').value;
                    
                    if(!name || !ruc || !email) { 
                        alert("Por favor complete los datos de facturación obligatorios (Nombre, RUC, Email)."); 
                        return; 
                    }
                    
                    window.parent.postMessage({ 
                        type: 'BILLING_INFO_UPDATE', 
                        leadId: '${lead.id}', 
                        data: { 
                            name, 
                            ruc, 
                            address: document.getElementById('billing-address').value, 
                            email, 
                            phone: document.getElementById('billing-phone').value 
                        } 
                    }, '*');
                }
            }

            if(currentStep === 3) {
                if(!isAlreadySigned) { alert("Nombre requerido para validez digital."); return; }
                currentStep = 4;
                updateUI();
                return;
            }
            if(currentStep < 4) { currentStep++; updateUI(); }
        }

        function prevStep() { if(currentStep > 1) { currentStep--; updateUI(); } }

        function signDocument() {
            const name = document.getElementById('client-name-input').value;
            if(!name || name.length < 5) { alert("Nombre completo requerido."); return; }
            clientSignature = name; 
            isAlreadySigned = true;
            window.parent.postMessage({ type: 'CLIENT_SITE_FINAL_APPROVAL', leadId: '${lead.id}', signature: name }, '*');
            updateUI();
        }

        function openChangeRequest() { document.getElementById('change-request-card').classList.replace('hidden', 'flex'); }
        function closeChangeRequest() { document.getElementById('change-request-card').classList.replace('flex', 'hidden'); }
        
        function confirmChangeRequest() {
            const section = currentStep === 1 ? 'Estrategia' : (currentStep === 2 ? 'Inversión' : 'Contrato');
            const comment = document.getElementById('change-desc').value;
            if(comment) {
                window.parent.postMessage({ type: 'LEAD_CHANGE_REQUEST', leadId: '${lead.id}', section, comment }, '*');
                alert("Solicitud enviada.");
                closeChangeRequest();
            }
        }

        updateUI();
    </script>
</body>
</html>`.trim();
};

export const generatePartnerPreInvoice = async (lead: PartnerLead, userName: string, region: string, taxPercentage: number = 0) => {
    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const currency = userProfile?.currency || 'USD';
    const baseValue = lead.finalValue || lead.estimatedValue || 0;
    const taxValue = baseValue * (taxPercentage / 100);
    const totalValue = baseValue + taxValue;
    const currentDate = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    const sys = "Generas prefacturas digitales de alta fidelidad. REGLA DE FORMATO CRÍTICA: NO USES SÍMBOLOS DE HASHTAG (###) PARA LOS TÍTULOS. En su lugar, utiliza MAYÚSCULAS EN NEGRITA para las secciones.";
    const prompt = `Genera una PREFACTURA DIGITAL PROFESIONAL para ${lead.clientName}. 
    GIRO: ${lead.notes}. 
    Emitida por: Centro Iberoamericano S.A.S. - División Goatify IA. RUC: 1793199203001. 
    Región: ${region}. 
    Fecha de Emisión: ${currentDate}.
    Valor Subtotal: ${baseValue} ${currency}.
    Impuestos (${taxPercentage}%): ${taxValue.toFixed(2)} ${currency}.
    Valor TOTAL: ${totalValue.toFixed(2)} ${currency}.
    Servicios: ${lead.serviceType}. 
    Consultor: ${userName}. 
    
    INSTRUCCIONES CRÍTICAS DE PAGOS:
    1. Explica claramente que la inversión única se divide en dos pagos: 50% de Anticipo y 50% Contra Entrega.
    2. Indica que CADA pago (Anticipo y Final) genera su propia factura y se le debe sumar el IVA correspondiente (${taxPercentage}%).
    3. El campo "Servicios" ya contiene la distinción entre "PAGOS ÚNICOS" y "PAGOS RECURRENTES". ÚSALO LITERALMENTE para crear las secciones correspondientes.
    4. Explica que los pagos recurrentes se gestionan directamente desde la plataforma con cobro automático mensual.
    5. Usa tablas Markdown para el desglose detallado de valores.`;
    
    return await executeAiWithFallback(prompt, sys, false, null, 'contracts', 'gemini-3-flash-preview');
};

export const generatePartnerContract = async (lead: PartnerLead, userName: string, region: string) => {
    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const currency = userProfile?.currency || 'USD';

    const sys = `Eres un Abogado Senior. Redactas convenios corporativos extensos.
    REGLA DE MARCA: El emisor de este contrato es "${lead.partnerName}". 
    NO menciones a Goatify a menos que sea estrictamente necesario para describir la infraestructura técnica del servicio.
    La identidad legal debe pertenecer exclusivamente al emisor.
    REGLA DE FORMATO CRÍTICA: NO USES SÍMBOLOS DE HASHTAG (###) PARA LOS TÍTULOS. En su lugar, utiliza MAYÚSCULAS EN NEGRITA para las secciones.
    ASEGÚRATE DE QUE EL CONTRATO SEA EXTENSO, LEGALMENTE ROBUSTO Y COMPLETO. NO RESUMAS.`;
    
    const prompt = `Redacta un CONTRATO MAESTRO DE SERVICIOS DIGITALES EXTENSO para ${lead.clientName}. 
    GIRO: ${lead.notes}. Emisor: ${lead.partnerName}. Región: ${region}. Valor: ${lead.finalValue || lead.estimatedValue} ${currency}. Servicios: ${lead.serviceType}. Consultor: ${userName}. 
    
    INSTRUCCIONES DE PAGOS:
    1. El campo "Servicios" ya contiene la distinción entre "PAGOS ÚNICOS" y "PAGOS RECURRENTES". ÚSALO LITERALMENTE para estipular las cláusulas de pago diferenciadas.
    2. Crea cláusulas o secciones separadas para detallar los Pagos Únicos vs. Pagos Recurrentes.
    3. Los Pagos Únicos se dividen en 50% Anticipo y 50% Contra Entrega, más IVA.
    4. Los Pagos Recurrentes son mensuales (o anuales según corresponda) y se debitan automáticamente vía plataforma.
    
    Mínimo 15 cláusulas legales completas, formal, títulos claros EN MAYÚSCULAS NEGRITA, sin asteriscos decorativos. El lenguaje debe ser altamente técnico y corporativo. PROHIBIDO USAR ###.`;
    
    return await executeAiWithFallback(prompt, sys, false, null, 'contracts', 'gemini-3-flash-preview');
};

export const improveBioText = async (bio: string) => {
    return await executeAiWithFallback(`Mejora biografía corporativa: "${bio}"`, "Editor de perfiles.", false, null, 'summaries');
};

export const generateProfessionalCV = async (user: UserProfile) => {
    const prompt = `CV profesional: ${JSON.stringify(user)}.`;
    const schema = { type: Type.OBJECT, properties: { fullName: { type: Type.STRING }, headline: { type: Type.STRING }, bio: { type: Type.STRING }, experience: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: { type: Type.STRING }, company: { type: Type.STRING }, duration: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["role", "company", "duration", "description"] } }, education: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { degree: { type: Type.STRING }, school: { type: Type.STRING }, year: { type: Type.STRING } }, required: ["degree", "school", "year"] } } }, required: ["fullName", "headline", "bio", "experience", "education"] };
    const res = await executeAiWithFallback(prompt, "Experto en HR.", true, schema, 'summaries');
    try { return JSON.parse(res || '{}'); } catch { return null; }
};

export const generateShivoCommentResponse = async (postContent: string, commentText: string, mediaUrl?: string) => {
    return await executeAiWithFallback(`Responde: ${postContent}\nComentario: ${commentText}`, "Analista Shivo.", false, null, 'chat');
};

export const detectContentSensitivity = async (text: string, imageBase64?: string, mimeType?: string) => {
    const prompt = `Responde solo TRUE si es sensible o FALSE si es seguro: "${text}"`;
    const res = await executeAiWithFallback(prompt, "Moderador de seguridad.", false, null, 'chat');
    return res.trim().toUpperCase() === 'TRUE';
};

/**
 * Genera un guion de ventas persuasivo.
 */
export const generateSalesClosingScript = async (service: string, targetPersona: string) => {
    const prompt = `Genera un guion de ventas persuasivo para el servicio: "${service}". El público objetivo es: "${targetPersona}". Usa técnicas de cierre de ventas modernas.`;
    return await executeAiWithFallback(prompt, "Experto en Cierre de Ventas.", false, null, 'chat');
};

/**
 * Genera una imagen utilizando imagen-4.0-generate-001 (Familia Imagen Clásica) vía backend.
 */
export const generateImage = async (prompt: string, aspectRatio: AspectRatio): Promise<string> => {
    try {
        const response = await fetch('/api/gemini/images', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                prompt,
                aspectRatio
            })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(
                errorData?.details ||
                errorData?.error ||
                "Error generando imagen."
            );
        }
        const data = await response.json();
        return data.imageUrl; // data:image/png;base64,...
    } catch (e: any) {
        throw new Error(e.message || "Error de generación de imagen");
    }
};

/**
 * Edita una imagen utilizando modelos de generación de imagen de Gemini (vía backend).
 */
export const editImage = async (prompt: string, image: { mimeType: string, data: string }): Promise<string> => {
    const history = [
        {
            role: 'user',
            parts: [
                { inlineData: { data: image.data, mimeType: image.mimeType } },
                { text: prompt + "\nRESPONDE EXCLUSIVAMENTE CON LA IMAGEN EDITADA." }
            ]
        }
    ];

    try {
        const response = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                history,
                systemInstruction: "Editor de imágenes profesional.",
                model: 'gemini-3.1-flash-image-preview',
                config: {
                    responseModalities: ["TEXT", "IMAGE"]
                }
            })
        });

        if (!response.ok) throw new Error("Error en edición de imagen");
        const data = await response.json();
        
        if (data.parts) {
            for (const part of data.parts) {
                if (part.inlineData) {
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    return `data:${mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
    } catch (e) {
        console.error("Error en editImage backend:", e);
    }
    throw new Error("No se recibió imagen editada.");
};

/**
 * Intenta extraer el nombre de un usuario de un texto.
 */
export const attemptNameExtraction = async (text: string, persona: string) => {
    const prompt = `Del siguiente texto del usuario, extrae su nombre si lo menciona de forma clara. Si no lo menciona o no hay un nombre nuevo, responde null. Si lo encuentras, responde SOLO el objeto JSON: {"name": "valor"}. Persona del agente: "${persona}". Texto: "${text}"`;
    const schema = { 
        type: Type.OBJECT, 
        properties: { 
            name: { type: Type.STRING, description: "El nombre extraído o null" } 
        }, 
        required: ["name"] 
    };
    try {
        const res = await executeAiWithFallback(prompt, "Extractor de nombres de élite.", true, schema, 'chat');
        if (!res) return null;
        // Limpiar posible markdown
        const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) { 
        console.warn("Error en extracción de nombre:", e);
        return null; 
    }
};

/**
 * Transcribe un archivo de audio a texto (vía backend).
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(audioBlob);
    });
    
    try {
        const response = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                history: [
                    { role: 'user', parts: [{ inlineData: { data: base64, mimeType: audioBlob.type } }, { text: "Transcribe meticulosamente este archivo de audio a texto, preservando todos los detalles e idiomas. Omite descripciones del entorno, solo transcribe lo que se habla o canta y el contenido útil. De forma altamente precisa." }] }
                ],
                model: 'gemini-3-flash-preview',
                module: 'media'
            })
        });
        if (!response.ok) return "No se pudo transcribir el audio, el archivo podría ser muy grande o estar corrupto.";
        const data = await response.json();
        return data.text || "";
    } catch (e) {
        return "Error al conectarse para transcribir.";
    }
};

/**
 * Analiza el contenido de un video (vía backend).
 */
export const analyzeVideoData = async (base64Data: string, mimeType: string, mode: string, language: string) => {
    const prompt = mode === 'transcription' 
        ? "Transcribe el audio de este video de forma precisa." 
        : "Realiza un análisis detallado del contenido visual y auditivo de este video.";
        
    const finalPrompt = `${prompt} 
    ESTRUCTURA DE RESPUESTA:
    - Usa # para el Título Principal.
    - Usa ### para subtítulos de sección.
    - Usa listas con * para puntos clave.
    - Resalta términos técnicos en **negrita**.
    Idioma de respuesta: ${language}.`;

    try {
        const response = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                history: [
                    { role: 'user', parts: [{ inlineData: { data: base64Data, mimeType } }, { text: finalPrompt }] }
                ],
                model: 'gemini-3-flash-preview'
            })
        });
        if (!response.ok) return "";
        const data = await response.json();
        return data.text || "";
    } catch (e) {
        return "";
    }
};

/**
 * Genera voz a partir de texto (TTS vía backend).
 */
export const generateSpeech = async (text: string, voice: TtsVoice): Promise<string> => {
    try {
        const response = await fetch('/api/gemini/tts', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                text: cleanTextForSpeech(text),
                voice
            })
        });
        if (!response.ok) throw new Error("TTS failed");
        const data = await response.json();
        return data.audioData; // Base64
    } catch (e) {
        throw e;
    }
};

/**
 * Crea un Blob compatible con el formato PCM de la Live API.
 */
export function createPcmBlob(data: Float32Array): any {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

/**
 * Analiza un recibo o factura y extrae datos estructurados.
 */
export const analyzeInventoryFile = async (base64: string, mimeType: string, category: string) => {
    const prompt = `Analiza este documento (puede ser una lista de precios, menú, inventario, etc.) y extrae los productos o servicios. Asigna la categoría "${category}" si no se especifica una. Extrae nombre, precio (como número) y cantidad/stock si existe (por defecto 10).`;
    const schema = { 
        type: Type.OBJECT, 
        properties: { 
            items: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        stock: { type: Type.NUMBER },
                        category: { type: Type.STRING }
                    },
                    required: ["name", "price"]
                }
            }
        }, 
        required: ["items"] 
    };

    const history = [
        { parts: [{ inlineData: { data: base64, mimeType } }, { text: prompt }] }
    ];

    const res = await executeAiWithFallback(prompt, "Analista de inventarios pro.", true, schema, 'chat', undefined, 2048);
    // Nota: analyzeInventoryFile original usaba contents con inlineData. 
    // executeAiWithFallback actualmente no soporta inlineData en el prompt simple.
    // Debería refactorizar executeAiWithFallback para aceptar contents complejos o usar fetch directo aquí.
    
    // FETCH DIRECTO PARA SOPORTE MULTIMODAL
    try {
        const response = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                history,
                model: 'gemini-3-flash-preview',
                config: { responseMimeType: "application/json", responseSchema: schema }
            })
        });
        if (!response.ok) return { items: [] };
        const data = await response.json();
        return JSON.parse(data.text || '{}');
    } catch (e) {
        return { items: [] };
    }
};

export const analyzeReceipt = async (base64: string, mimeType: string, country: string) => {
    const prompt = `Analiza este recibo/factura para un negocio en ${country}. Extrae: monto total (sin tax), monto de impuesto, descripción, fecha (YYYY-MM-DD), proveedor y RUC/TaxID si existe.`;
    const schema = { 
        type: Type.OBJECT, 
        properties: { 
            amount: { type: Type.NUMBER }, 
            taxAmount: { type: Type.NUMBER }, 
            description: { type: Type.STRING }, 
            date: { type: Type.STRING }, 
            providerTaxId: { type: Type.STRING } 
        }, 
        required: ["amount", "description", "date"] 
    };

    const history = [
        { parts: [{ inlineData: { data: base64, mimeType } }, { text: prompt }] }
    ];

    try {
        const response = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: await getAuthenticatedJsonHeaders(),
            body: JSON.stringify({
                history,
                model: 'gemini-3-flash-preview',
                config: { responseMimeType: "application/json", responseSchema: schema }
            })
        });
        if (!response.ok) return {};
        const data = await response.json();
        return JSON.parse(data.text || '{}');
    } catch (e) {
        return {};
    }
};

/**
 * Reescribe y mejora profesionalmente un texto.
 */
export const rewriteText = async (text: string, language: string = 'es') => {
    const prompt = `Actúa como un editor experto. Tu única tarea es reescribir el siguiente texto para mejorar su claridad, gramática y estructura profesional.
    
    REGLAS ESTRICTAS:
    1. NO agregues saludos, ni explicaciones, ni "Aquí tienes el texto".
    2. NO des opciones. Devuelve UNA sola versión final pulida.
    3. Usa formato Markdown para estructurar: # Títulos, ## Subtítulos, **Negritas** para énfasis.
    4. Mantén el idioma: ${language}.
    5. Devuelve SOLAMENTE el contenido reescrito.

    Texto a reescribir: "${text}"`;
    return await executeAiWithFallback(prompt, "Editor corporativo senior.", false, null, 'chat');
};

/**
 * Analiza un conjunto de documentos.
 */
export const analyzeDocuments = async (documents: Document[], language: string) => {
    const combinedContent = documents.map(d => `ARCHIVO: ${d.name}\nCONTENIDO:\n${d.content}`).join('\n\n---\n\n');
    const prompt = `Analiza los siguientes documentos y genera un informe estratégico consolidado. Idioma: ${language}\n\n${combinedContent}`;
    return await executeAiWithFallback(prompt, "Analista de inteligencia documental.", false, null, 'summaries');
};

/**
 * Genera contenido para redes sociales.
 */

export const generateSocialContent = async (params: {
    description: string;
    objective: string;
    offer?: string;
    tone: string;
    networks: string[];
    audience?: string;
    industry?: string;
    campaignMode?: string;
    campaignLength?: string;
    budget?: string;
    brandVoice?: string;
    contentUniverse?: string;
}) => {
    const prompt = `Actúa como Chief Social Media Strategist, Creative Director, Performance Marketer y Copywriter senior para 2026.

OBJETIVO: generar una campaña social de alto nivel, útil, accionable y lista para operar dentro de Goatify Social Media Studio.

CONTEXTO DE MARCA / PRODUCTO:
${params.description}

OBJETIVO COMERCIAL:
${params.objective}

OFERTA / CTA / LINK / PROMO:
${params.offer || 'No especificado'}

AUDIENCIA:
${params.audience || 'No especificado'}

INDUSTRIA:
${params.industry || 'General'}

MODO DE CAMPAÑA:
${params.campaignMode || 'Campaña orgánica + venta suave'}

DURACIÓN / INTENSIDAD:
${params.campaignLength || '7 días'}

PRESUPUESTO O PAUTA:
${params.budget || 'Sin presupuesto definido'}

BRAND VOICE:
${params.brandVoice || params.tone}

UNIVERSO DE CONTENIDO DEL USUARIO:
${params.contentUniverse || 'Sin memoria adicional.'}

REDES A GENERAR:
${params.networks.join(', ')}

REGLAS DE CALIDAD:
1. No recicles el mismo copy en todas las redes. Cada plataforma debe tener psicología, estructura y CTA propio.
2. Instagram/Facebook deben servir para Meta Business Suite: copy claro, CTA, idea visual y pauta.
3. TikTok/Reels debe incluir hook de 3 segundos, escenas, texto en pantalla, caption y CTA.
4. LinkedIn debe sonar profesional, útil, humano y con autoridad.
5. X debe ser breve, opinable, fuerte y compartible; si aplica, sugiere mini hilo.
6. El imagePrompt/photoPrompt debe ser MUY PRO: composición, luz, estilo, cámara, ambiente, emociones, elementos visuales, calidad comercial, sin texto ilegible dentro de imagen.
7. El videoBrief debe ser operativo: escena por escena, duración sugerida, ritmo, texto en pantalla y CTA.
8. Si hay pauta, agrega adBrief y targetingSuggestion: objetivo, audiencia, presupuesto sugerido, testing A/B, métrica a mirar.
9. Agrega abVariants con variaciones de copy útiles.
10. El contenido debe estar actualizado a 2026: IA, automatización, ventas, atención, comunidad, contenido corto y embudos conversacionales.

Devuelve SOLO un array JSON válido. Cada objeto debe tener estos campos:
platform, format, hook, content, hashtags, cta, imagePrompt, photoPrompt, videoPrompt, videoBrief, shotList, visualCues, adBrief, targetingSuggestion, publishingChecklist, calendarSuggestion, qualityScore, abVariants.`;
    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                platform: { type: Type.STRING },
                format: { type: Type.STRING },
                hook: { type: Type.STRING },
                content: { type: Type.STRING },
                hashtags: { type: Type.STRING },
                cta: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
                photoPrompt: { type: Type.STRING },
                videoPrompt: { type: Type.STRING },
                videoBrief: { type: Type.STRING },
                shotList: { type: Type.ARRAY, items: { type: Type.STRING } },
                visualCues: { type: Type.STRING },
                adBrief: { type: Type.STRING },
                targetingSuggestion: { type: Type.STRING },
                publishingChecklist: { type: Type.STRING },
                calendarSuggestion: { type: Type.STRING },
                qualityScore: { type: Type.NUMBER },
                abVariants: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["platform", "content", "hashtags", "imagePrompt", "visualCues"]
        }
    };
    const res = await executeAiWithFallback(prompt, "Chief Social Media Strategist 2026. Genera JSON válido, accionable, premium y sin relleno.", true, schema, 'chat');
    try {
        const parsed = JSON.parse(res);
        return Array.isArray(parsed) ? parsed : (parsed?.posts || []);
    } catch {
        const match = String(res).match(/\[[\s\S]*\]/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { return []; }
        }
        return [];
    }
};

/**
 * Analiza comandos de voz para ejecutar acciones en la aplicación.
 */
export const analyzeVoiceCommand = async (text: string, context: any) => {
    const prompt = `Analiza the siguiente comando de voz del usuario: "${text}". 
    Considera el contexto del sistema: ${JSON.stringify(context)}. 
    Identifica la intención (intent) y las entidades necesarias. 
    Intenciones válidas: navigate, create_task, create_project, schedule_meeting, get_agenda, list_projects, answer.
    Responde estrictamente con un objeto JSON: { intent, entities: { view, title, date, time, projectName, content }, confirmationText, needsMoreInfo }.`;
    const schema = {
        type: Type.OBJECT,
        properties: {
            intent: { type: Type.STRING },
            entities: { 
                type: Type.OBJECT, 
                properties: { 
                    view: { type: Type.STRING }, 
                    title: { type: Type.STRING }, 
                    date: { type: Type.STRING }, 
                    time: { type: Type.STRING }, 
                    projectName: { type: Type.STRING },
                    content: { type: Type.STRING }
                } 
            },
            confirmationText: { type: Type.STRING },
            needsMoreInfo: { type: Type.BOOLEAN }
        },
        required: ["intent", "confirmationText"]
    };
    const res = await executeAiWithFallback(prompt, "Intérprete de comandos Shivo Voice.", true, schema, 'chat');
    try { return JSON.parse(res); } catch { return null; }
};

/**
 * Genera un acuerdo formal para un cliente de CRM.
 */
export const generateClientAgreement = async (client: any, userName: string) => {
    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const currency = userProfile?.currency || 'USD';

    const prompt = `Redacta un convenio maestro de servicios profesionales para el cliente ${client.name}. 
    Emisor (Consultor): ${client.providerName || userName}. 
    REGLA DE MARCA: NO menciones a Goatify. El emisor es "${client.brandName || client.providerName || userName}".
    Valor pactado: ${client.value} ${currency}. 
    Plazo estimado: ${client.deliveryTime}. 
    Detalles adicionales y análisis de negocio: ${client.businessNotes || client.notes}. 
    Giro de negocio del emisor: ${client.businessDescription || 'Servicios Tecnológicos'}.
    REGLA DE FORMATO CRÍTICA: NO USES SÍMBOLOS DE HASHTAG (###) PARA LOS TÍTULOS. En su lugar, utiliza MAYÚSCULAS EN NEGRITA para las secciones.
    ASEGÚRATE DE QUE EL CONTRATO SEA EXTENSO, LEGALMENTE ROBUSTO Y COMPLETO. NO RESUMAS.
    Incluye cláusulas de confidencialidad, propiedad intelectual y pagos.`;
    return await executeAiWithFallback(prompt, "Asesor Legal Corporativo.", false, null, 'contracts');
};

/**
 * Genera una prefactura digital para un cliente de CRM.
 */
export const generateClientPreInvoice = async (client: any, userName: string, issuerInfo: any) => {
    const cachedProfile = localStorage.getItem('goatify_user_profile');
    const userProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
    const currency = userProfile?.currency || 'USD';
    const baseValue = client.value || 0;
    const applyTax = client.applyTax === true;
    const taxPercentage = applyTax ? (parseFloat(client.taxPercentage) || 0) : 0;
    const taxValue = baseValue * (taxPercentage / 100);
    const totalValue = baseValue + taxValue;
    const currentDate = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    const sys = "Generas prefacturas digitales de alta fidelidad. REGLA DE FORMATO CRÍTICA: NO USES SÍMBOLOS DE HASHTAG (###) PARA LOS TÍTULOS. En su lugar, utiliza MAYÚSCULAS EN NEGRITA para las secciones.";
    const prompt = `Genera una PREFACTURA DIGITAL PROFESIONAL para ${client.name}. 
    Emitida por: ${issuerInfo.providerName || issuerInfo.brandName || userName}. 
    Contacto Emisor: ${issuerInfo.providerContact || issuerInfo.issuerEmail || ''}.
    Fecha de Emisión: ${currentDate}.
    Valor Subtotal: ${baseValue.toLocaleString()} ${currency}.
    ${applyTax ? `Impuestos (${taxPercentage}%): ${taxValue.toLocaleString()} ${currency}.` : 'Impuestos: NO APLICA (0%).'}
    Valor TOTAL: ${totalValue.toLocaleString()} ${currency}.
    Concepto/Servicios: ${client.businessNotes || client.notes || 'Servicios Profesionales'}. 
    
    ESTRUCTURA DE RESUMEN FINANCIERO (ESTRICTO ORDEN):
    1. TOTAL GENERAL (Destacado y en negrita).
    2. TABLA DE CONCEPTOS (Desglose de servicios manuales: ${JSON.stringify(client.services || [])}).
    3. TABLA DE TOTALES (Subtotal, Impuestos - solo si aplica (${applyTax}), Total Final).
    4. BOX DE ANTICIPOS (Solo si aplica (${client.enableAdvances}): Anticipo del ${client.advancePercentage}% al inicio y el resto al final).
    
    REQUISITOS ADICIONALES:
    - Encabezado con "PREFACTURA DIGITAL", fecha y número de documento (generado aleatoriamente).
    - Datos del Emisor y del Cliente.
    - Términos de pago y validez.
    - Moneda: ${currency}.
    ${!applyTax ? '- IMPORTANTE: No incluyas ninguna línea de IVA o Impuestos en el desglose final, ya que no aplican.' : ''}
    
    Usa formato Markdown limpio. Usa tablas Markdown para el desglose detallado de valores y resumen financiero.`;
    return await executeAiWithFallback(prompt, sys, false, null, 'contracts');
};
