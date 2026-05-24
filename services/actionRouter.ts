
import { AppContextType } from '../types';

export interface ActionIntent {
    type: 'CREATE_TASK' | 'CREATE_PROJECT' | 'CREATE_MEETING' | 'GENERATE_ARTIFACT' | 'GENERATE_CHART';
    params: any;
}

export const detectActionIntent = (text: string): ActionIntent | null => {
    const t = text.toLowerCase();
    const now = new Date();
    
    // 1. CREATE_TASK
    const taskKeywords = ['tarea', 'pendiente', 'recordarme', 'pon una tarea', 'crea una tarea', 'añade una tarea', 'recordatorio', 'anota una tarea', 'agendame una tarea'];
    if (taskKeywords.some(k => t.includes(k)) || (t.includes('crea') && t.includes('tarea'))) {
        // Extraer título - busca después de palabras clave
        let titleMatch = text.match(/(?:llamada|asunto|llamado|titulada|de|asunsnto|asunto TRIPEO)[:\s]+([^.?!,]+)/i) || 
                          text.match(/(?:crea|añade|pon|recordarme)(?: una)? tarea (?:de|sobre|llamada)[:\s]+([^.?!,]+)/i) ||
                          text.match(/tarea (?:de|sobre|para)[:\s]+([^.?!,]+)/i);
        
        // Si no hay match específico, intentar tomar lo que queda después de "tarea" o "recordarme"
        let title = 'Nueva Tarea IA';
        if (titleMatch) {
            title = titleMatch[1].trim();
        } else {
            const taskIdx = t.indexOf('tarea');
            if (taskIdx !== -1) {
                const rest = text.slice(taskIdx + 5).trim();
                if (rest.length > 2) title = rest.split(/[.?!,]/)[0].trim();
            }
        }

        let dueDate = new Date();
        // Timezone adjustment (mocking America/Guayaquil -5)
        // In a real app we'd use user context
        
        if (t.includes('mañana')) dueDate.setDate(dueDate.getDate() + 1);
        if (t.includes('viernes')) {
            const days = (5 - now.getDay() + 7) % 7;
            dueDate.setDate(now.getDate() + (days === 0 ? 7 : days));
        }
        if (t.includes('lunes')) {
            const days = (1 - now.getDay() + 7) % 7;
            dueDate.setDate(now.getDate() + (days === 0 ? 7 : days));
        }

        const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(pm|am|p\.m|a\.m)/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const ampm = timeMatch[3].toLowerCase().replace(/\./g, '');
            if (ampm === 'pm' && hours < 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;
            dueDate.setHours(hours, minutes, 0, 0);
        } else if (t.includes(' tarde')) {
            dueDate.setHours(15, 0, 0, 0);
        } else {
            dueDate.setHours(9, 0, 0, 0);
        }

        return {
            type: 'CREATE_TASK',
            params: {
                title: title.charAt(0).toUpperCase() + title.slice(1),
                dueDate: dueDate.toISOString(),
                priority: t.includes('urgente') || t.includes('importante') || t.includes('ya') ? 'high' : 'medium',
                status: 'todo'
            }
        };
    }

    // 2. CREATE_PROJECT
    if ((t.includes('proyecto') || t.includes('pryecto') || t.includes('pruecto')) && (t.includes('crea') || t.includes('nuevo') || t.includes('inicia'))) {
        const nameMatch = text.match(/(?:proyecto|pryecto|pruecto|llamado|que se llame|titulado)[:\s]+([^.?!,]+)/i);
        let name = nameMatch ? nameMatch[1].trim() : '';
        if (!name) {
            const projIdx = t.indexOf('proyecto');
            if (projIdx !== -1) {
                const rest = text.slice(projIdx + 8).trim();
                name = rest.split(/[.?!,]/)[0].replace(/^llamado|^que se llame|^titulado/i, '').trim();
            }
        }
        
        return {
            type: 'CREATE_PROJECT',
            params: {
                name: name || 'Nuevo Proyecto IA',
                description: ''
            }
        };
    }

    // 3. CREATE_MEETING
    if (t.includes('reunión') || t.includes('meeting') || t.includes('cita') || t.includes('agenda reu') || t.includes('agendame una reu')) {
        const titleMatch = text.match(/(?:reunión|cita|con|sobre)[:\s]+([^.?!,]+)/i);
        const startDate = new Date();
        if (t.includes('mañana')) startDate.setDate(startDate.getDate() + 1);
        if (t.includes('viernes')) {
            const days = (5 - now.getDay() + 7) % 7;
            startDate.setDate(now.getDate() + (days === 0 ? 7 : days));
        }

        const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(pm|am|p\.m|a\.m)/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const ampm = timeMatch[3].toLowerCase().replace(/\./g, '');
            if (ampm === 'pm' && hours < 12) hours += 12;
            startDate.setHours(hours, minutes, 0, 0);
        } else {
            startDate.setHours(10, 0, 0, 0);
        }

        const endDate = new Date(startDate.getTime() + 30 * 60000);

        return {
            type: 'CREATE_MEETING',
            params: {
                title: titleMatch ? `Reunión: ${titleMatch[1].trim()}` : 'Reunión Agendada',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                videoCall: true,
                attendees: []
            }
        };
    }

    // 4. GENERATE_ARTIFACT
    if (t.includes('pdf') || t.includes('excel') || t.includes('word') || t.includes('descargable') || t.includes('exporta')) {
        let type = 'pdf';
        if (t.includes('excel') || t.includes('xlsx') || t.includes('hoja')) type = 'xlsx';
        if (t.includes('word') || t.includes('docx')) type = 'docx';
        
        const titleMatch = text.match(/(?:sobre|de|titulado|resumen)[:\s]+([^.?!,]+)/i);
        
        return {
            type: 'GENERATE_ARTIFACT',
            params: {
                type,
                title: titleMatch ? titleMatch[1].trim() : 'Documento IA',
                content: text // Será usado para generar contexto
            }
        };
    }

    return null;
};
