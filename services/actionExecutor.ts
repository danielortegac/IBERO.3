
import { AppContextType, ChatMessage } from '../types';
import { auth } from '../firebaseConfig';

export interface ActionResponse {
    success: boolean;
    message: string;
    data?: any;
    actionType: string;
}

const getHeaders = async () => {
    const token = await auth.currentUser?.getIdToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
};

export const extractActions = (text: string): any[] => {
    const actions: any[] = [];
    
    // Función auxiliar para parsear con limpieza extrema
    const safeParse = (str: string) => {
        let cleaned = str.trim();
        // Si viene envuelto en comillas por error del modelo
        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
            cleaned = cleaned.substring(1, cleaned.length - 1);
        }
        // Buscar el primer { y el último }
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            cleaned = cleaned.substring(start, end + 1);
            try {
                return JSON.parse(cleaned);
            } catch (e) {
                console.warn("[ACTION PARSER] Error parsing content inside braces:", e);
                // Intentar reemplazos comunes de errores de escape
                try {
                    const fixed = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    return JSON.parse(fixed);
                } catch (e2) {
                    return null;
                }
            }
        }
        return null;
    };

    // 1. Intentar con formato preferido <<<ACTION:{...}>>>
    const actionRegex = /<<<ACTION:([\s\S]*?)>>>/g;
    let match;
    while ((match = actionRegex.exec(text)) !== null) {
        const json = safeParse(match[1]);
        if (json && (json.ACTION || json.type)) {
            actions.push(json);
        }
    }

    // 2. Fallback si no hay tags: buscar bloques json markdown
    const markdownRegex = /```json\s*([\s\S]*?)\s*```/g;
    while ((match = markdownRegex.exec(text)) !== null) {
        const json = safeParse(match[1]);
        if (json && (json.ACTION || json.type)) {
            if (!actions.some(a => JSON.stringify(a) === JSON.stringify(json))) {
                actions.push(json);
            }
        }
    }

    // 3. Fallback extremo: buscar cualquier cosa que parezca un objeto JSON con ACTION
    if (actions.length === 0) {
        const rawJsonRegex = /\{\s*"ACTION":\s*"[^"]+"[\s\S]*?\}/g;
        const rawMatches = text.match(rawJsonRegex);
        if (rawMatches) {
            rawMatches.forEach(m => {
                const json = safeParse(m);
                if (json && !actions.some(a => JSON.stringify(a) === JSON.stringify(json))) {
                    actions.push(json);
                }
            });
        }
    }

    return actions;
};

export const cleanTextFromActions = (text: string): string => {
    let cleaned = text;
    
    // Remover etiquetas <<<ACTION: ... >>>
    cleaned = cleaned.replace(/<<<ACTION:[\s\S]*?>>>/g, '');
    
    // Remover bloques markdown que contengan ACTION
    cleaned = cleaned.replace(/```json\s*\{[\s\S]*?"ACTION":[\s\S]*?\}\s*```/g, '');
    
    // Remover cualquier objeto JSON suelto que tenga "ACTION": "..."
    cleaned = cleaned.replace(/\{\s*"ACTION":\s*"[^"]+"[\s\S]*?\}/g, '');
    
    // Limpiar restos de "Entendido", "He registrado", etc.
    cleaned = cleaned.replace(/He registrado la tarea[\s\S]*?\./gi, '');
    cleaned = cleaned.replace(/He creado el proyecto[\s\S]*?\./gi, '');
    cleaned = cleaned.replace(/He agendado la reunión[\s\S]*?\./gi, '');
    cleaned = cleaned.replace(/Entendido, PATRON\.?/gi, '');
    
    return cleaned.trim();
};

export async function executeAssistantActions(
    actions: any[], 
    context: AppContextType,
    chatId: string
): Promise<ActionResponse[]> {
    const results: ActionResponse[] = [];
    console.log("[ACTION EXECUTOR] Processing actions:", actions.length);

    for (const action of actions) {
        const type = action.ACTION || action.type || action.actionType;
        console.log("[ACTION EXECUTOR] Starting action:", type);
        
        try {
            let result: ActionResponse;
            switch (type) {
                case 'GENERATE_ARTIFACT':
                    result = await handleGenerateArtifact(action, context, chatId);
                    break;
                case 'CREATE_TASK':
                    result = await handleCreateTask(action, context);
                    break;
                case 'CREATE_MEETING':
                case 'CREATE_EVENT':
                    result = await handleCreateEvent(action, context);
                    break;
                case 'CREATE_PROJECT':
                    result = await handleCreateProject(action, context);
                    break;
                case 'SEND_EMAIL':
                    result = await handleSendEmail(action, context);
                    break;
                case 'SAVE_DRAFT':
                case 'CREATE_DRAFT':
                    result = await handleSaveDraft(action, context);
                    break;
                case 'LIST_EMAILS':
                    result = await handleListEmails(action, context);
                    break;
                case 'LIST_CONTACTS':
                    result = await handleListContacts(action, context);
                    break;
                case 'GENERATE_CHART':
                    result = { 
                        success: true, 
                        message: `Gráfica "${action.title}" generada.`,
                        actionType: 'GENERATE_CHART',
                        data: action
                    };
                    break;
                default:
                    console.warn("[ACTION EXECUTOR] Unknown action type:", type);
                    result = { success: false, message: `Acción desconocida: ${type}`, actionType: type || 'UNKNOWN' };
            }
            console.log("[ACTION EXECUTOR] Action success:", type, result.success);
            results.push(result);
        } catch (e: any) {
            console.error(`[ACTION EXECUTOR] Failed ${type}:`, e);
            results.push({ 
                success: false, 
                message: `Error: ${e.message}`,
                actionType: type || 'ERROR' 
            });
        }
    }

    return results;
}

async function handleGenerateArtifact(action: any, context: AppContextType, chatId: string): Promise<ActionResponse> {
    const headers = await getHeaders();
    const res = await fetch('/api/artifacts/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            artifactType: action.type || 'pdf',
            title: action.title || 'Documento IA',
            content: action.content || '',
            structuredData: action.structuredData,
            saveToDrive: true, // Siempre intentamos guardar en Drive desde chat
            chatId: chatId,
            sourcePrompt: action.sourcePrompt || '',
            requestedFormat: action.type || 'pdf'
        })
    });

    const data = await res.json();
    if (data.ok) {
        return {
            success: true,
            message: `Archivo "${data.fileName}" generado con éxito.`,
            actionType: 'GENERATE_ARTIFACT',
            data: {
                id: data.artifactId || `art-${Date.now()}`,
                artifactId: data.artifactId,
                name: data.fileName,
                type: data.mimeType,
                downloadUrl: data.downloadUrl || `data:${data.mimeType};base64,${data.base64Data}`,
                sizeBytes: data.sizeBytes,
                driveSaved: data.driveSaved,
                drivePath: data.drivePath,
                driveError: data.driveError,
                primaryFormat: data.primaryFormat,
                variants: data.variants,
                content: action.content // Preservar el contenido original
            }
        };
    } else {
        throw new Error(data.error || "Error en el servidor de artifacts");
    }
}

async function handleCreateTask(action: any, context: AppContextType): Promise<ActionResponse> {
    const { title, description, dueDate, priority, status, hours, tags, assignedTo } = action;
    const headers = await getHeaders();
    
    // Si no viene projectId, intentar usar el proyecto seleccionado o el primero disponible
    const finalProjectId = action.projectId || context.selectedProjectId || (context.projects.length > 0 ? context.projects[0].id : null);

    // Intentar usar el backend para persistencia robusta
    const res = await fetch('/api/tasks/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            title,
            description,
            dueDate,
            priority: priority || 'medium',
            status: status || 'todo',
            hours: hours || null,
            tags: tags || [],
            assignedTo: assignedTo || [],
            projectId: finalProjectId
        })
    });

    const data = await res.json();
    if (data.ok) {
        return {
            success: true,
            message: `Tarea "${title}" creada correctamente.`,
            actionType: 'CREATE_TASK',
            data: data.task
        };
    } else {
        throw new Error(data.error || "Error al crear la tarea en el servidor");
    }
}

async function handleCreateEvent(action: any, context: AppContextType): Promise<ActionResponse> {
    const { title, description, startDate, endDate, attendees, location, videoCall } = action;
    const headers = await getHeaders();
    
    const res = await fetch('/api/calendar/events/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            title,
            description,
            startDate,
            endDate,
            attendees,
            location,
            videoCall: !!videoCall,
            projectId: action.projectId
        })
    });

    const data = await res.json();
    if (data.ok) {
        return {
            success: true,
            message: `Evento "${title}" agendado con éxito.`,
            actionType: 'CREATE_EVENT',
            data: data.event
        };
    } else {
        throw new Error(data.error || "Error al agendar el evento");
    }
}

async function handleSendEmail(action: any, context: AppContextType): Promise<ActionResponse> {
    const { to, subject, body, fromContext } = action;
    
    // Si el asistente especifica una cuenta, intentar usarla, sino usar la primaria
    const accountId = action.accountId || context.userProfile?.primaryEmailAccountId;
    
    // Inyectar firma si existe y está activa
    let finalBody = body;
    const activeSignature = context.userProfile?.mailSignatures?.find((s: any) => s.active);
    if (activeSignature && !body.includes('data-signature-id')) {
        let sigHtml = '';
        if (activeSignature.type === 'plain') {
            sigHtml = `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6; color: #4b5563; font-family: sans-serif; font-size: 14px; line-height: 1.5;">${activeSignature.content.replace(/\n/g, '<br/>')}</div>`;
        } else if (activeSignature.type === 'image') {
            sigHtml = `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;"><img src="${activeSignature.content}" style="max-width: 400px; border-radius: 8px;" alt="Firma" /></div>`;
        } else {
            sigHtml = `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">${activeSignature.content}</div>`;
        }
        finalBody += sigHtml;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('goatify_token')}`
    };

    const res = await fetch('/api/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            to,
            subject,
            body: finalBody,
            accountId,
            senderName: fromContext || 'Asistente IA Goatify'
        })
    });
    
    const data = await res.json();
    if (data.success || data.ok) {
        return { 
            success: true, 
            message: `Email enviado a ${to} con éxito.`, 
            actionType: 'SEND_EMAIL', 
            data: { to, subject } 
        };
    } else {
        throw new Error(data.error || "No se pudo enviar el email");
    }
}

async function handleSaveDraft(action: any, context: AppContextType): Promise<ActionResponse> {
    const { to, subject, body } = action;
    const accountId = action.accountId || context.userProfile?.primaryEmailAccountId;
    
    // Inyectar firma si existe y está activa
    let finalBody = body;
    const activeSignature = context.userProfile?.mailSignatures?.find((s: any) => s.active);
    if (activeSignature && typeof body === 'string' && !body.includes('data-signature-id')) {
        let sigHtml = '';
        if (activeSignature.type === 'plain') {
            sigHtml = `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6; color: #4b5563; font-family: sans-serif; font-size: 14px; line-height: 1.5;">${activeSignature.content.replace(/\n/g, '<br/>')}</div>`;
        } else if (activeSignature.type === 'image') {
            sigHtml = `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;"><img src="${activeSignature.content}" style="max-width: 400px; border-radius: 8px;" alt="Firma" /></div>`;
        } else {
            sigHtml = `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">${activeSignature.content}</div>`;
        }
        finalBody += sigHtml;
    }

    if (context.setMailDraft && context.setCurrentView) {
        context.setMailDraft({ to: to || '', subject: subject || '', htmlBody: finalBody || '', accountId });
        context.setCurrentView('mail');
        return { 
            success: true, 
            message: `Borrador "${subject}" generado y abierto en Goatify Mail.`, 
            actionType: 'SAVE_DRAFT', 
            data: { to, subject, body: finalBody } 
        };
    } else {
        throw new Error("No se pudo abrir el compositor de borradores");
    }
}

const stripHtml = (html: string) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

async function handleListEmails(action: any, context: AppContextType): Promise<ActionResponse> {
    const accountId = action.accountId || context.userProfile?.primaryEmailAccountId || 'all';
    const limit = action.limit || 10;
    const folder = action.folder || 'inbox';
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('goatify_token')}`
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const res = await fetch(`/api/emails?folder=${folder}&accountId=${accountId}&limit=${limit}`, {
            method: 'GET',
            headers,
            signal: controller.signal
        });
        
        const data = await res.json();
        clearTimeout(timeout);

        if (data.emails) {
            // Enriquecer la data con el mapeo correcto del backend de Goatify Mail
            const formattedEmails = data.emails.map((e: any) => ({
                id: e.id,
                accountId: e.accountId,
                accountEmail: e.accountEmail,
                from: e.sender?.name
                  ? `${e.sender.name} <${e.sender.email || ''}>`
                  : (e.sender?.email || e.from || 'Desconocido'),
                subject: e.subject || '(Sin asunto)',
                date: e.date || e.displayDate || new Date().toISOString(),
                summary: e.snippet || stripHtml(e.body || e.text || '').slice(0, 300) || 'Sin vista previa disponible',
                read: e.read !== undefined ? e.read : true,
                hasAttachments: !!e.hasAttachments || (e.attachments && e.attachments.length > 0),
                attachmentsCount: e.attachments?.length || 0,
                important: /urgente|pago|factura|reunión|deadline|vencimiento|propuesta|cliente|contrato/i.test((e.subject || '') + (e.snippet || ''))
            }));

            return { 
                success: true, 
                message: `Se encontraron ${formattedEmails.length} correos recientes en ${folder}.`, 
                actionType: 'LIST_EMAILS', 
                data: formattedEmails 
            };
        } else {
            throw new Error(data.error || "No se pudieron listar los correos");
        }
    } catch (error: any) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error("No pude leer los correos porque la conexión tardó demasiado. Intenta revisar una sola cuenta o verifica la conexión de Goatify Mail.");
        }
        throw error;
    }
}

async function handleListContacts(action: any, context: AppContextType): Promise<ActionResponse> {
    // Los contactos ya suelen estar en el context, pero si el AI pide refrescar o buscar específico:
    const contacts = context.mailContacts || [];
    const groups = context.mailLists || [];
    
    return {
        success: true,
        message: `Acceso a ${contacts.length} contactos y ${groups.length} listas de correo.`,
        actionType: 'LIST_CONTACTS',
        data: { contacts, groups }
    };
}

async function handleSendDM(action: any, context: AppContextType): Promise<ActionResponse> {
    // Para DM necesitamos interactuar directamente con el context si es posible
    if (context.sendDirectMessage && action.recipient && action.message) {
        const targetUser = context.allUsers?.find(u => 
            u.name.toLowerCase().includes(action.recipient.toLowerCase()) || 
            u.email?.toLowerCase() === action.recipient.toLowerCase()
        );
        if (targetUser) {
            await context.sendDirectMessage(targetUser, action.message);
            return { success: true, message: `DM enviado a ${targetUser.name}`, actionType: 'SEND_DM', data: action };
        }
    }
    throw new Error("No se pudo enviar el mensaje directo: usuario no encontrado o capacidad deshabilitada.");
}

async function handleCreateProject(action: any, context: AppContextType): Promise<ActionResponse> {
    const headers = await getHeaders();
    const name = action.name || action.title || 'Nuevo Proyecto';
    const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...action, name })
    });
    const data = await res.json();
    if (data.ok) {
        return { success: true, message: `Proyecto "${name}" creado.`, actionType: 'CREATE_PROJECT', data: data.project };
    }
    throw new Error(data.error || "Error al crear proyecto");
}
