import React, { useState, useContext, useEffect, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { generateFormCode } from '../services/geminiService';
import Button from './ui/Button';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import Modal from './ui/Modal';
import { useTranslation } from '../hooks/useTranslation';
import jsPDF from 'jspdf';
import { getPlanConfig, Form } from '../types';

interface FormField {
    id: string;
    label: string;
    html: string;
    fullMatch: string;
}

const FormBuilder: React.FC = () => {
    const { t } = useTranslation();
    const context = useContext(AppContext);
    
    // Garantizamos acceso seguro a las funciones del contexto para evitar "is not a function"
    const { 
        forms, addForm, updateForm, deleteForm, setToastNotification, 
        checkFormLimit, loadFormResponses, formResponses, sendFormResponsesToProject, 
        addHubPost, projects, userProfile, userUsage, currentUser, 
        checkAndConsumeLimit, setProModalOpen, setMailDraft, setCurrentView
    } = context;
    
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [newFormName, setNewFormName] = useState('');
    const [newFormPrompt, setNewFormPrompt] = useState('');
    const [formToDelete, setFormToDelete] = useState<string | null>(null);
    
    const [viewingResponsesFor, setViewingResponsesFor] = useState<string | null>(null);
    const [projectToSendTo, setProjectToSendTo] = useState<string>(projects[0]?.id || '');
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

    // Estado para el editor de formularios
    const [editingForm, setEditingForm] = useState<Form | null>(null);
    const [editFormName, setEditFormName] = useState('');
    const [editFormCode, setEditFormCode] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [showCode, setShowCode] = useState(false);

    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).active_forms || 1;
    const used = userUsage?.counters?.current_forms_count || 0;

    // Lógica para detectar campos en el código HTML (IA y Manuales)
    const detectedFields = useMemo(() => {
        if (!editFormCode) return [];
        // Detectar bloques de campos con la estructura modular generada por IA
        const regex = /<div class="form-field-container mb-6">([\s\S]*?)<\/div>/g;
        const matches: FormField[] = [];
        let match;
        while ((match = regex.exec(editFormCode)) !== null) {
            const innerHtml = match[1];
            // Extraer el texto del label
            const labelMatch = innerHtml.match(/<label.*?>([\s\S]*?)<\/label>/i);
            const label = labelMatch ? labelMatch[1].trim() : "Campo sin título";
            matches.push({
                id: `field-${Math.random().toString(36).substr(2, 5)}`,
                label,
                html: innerHtml,
                fullMatch: match[0]
            });
        }
        return matches;
    }, [editFormCode]);

    const handleGenerate = async () => {
        if (!newFormPrompt.trim() || !newFormName.trim() || !currentUser) return;
        
        try {

            const isFormBlocked = await checkFormLimit();
            if (isFormBlocked) return;
        } catch (e: any) {
            if (e.code === "PLAN_LIMIT_REACHED") {
                setProModalOpen(true);
            }
            return;
        }

        setCreateModalOpen(false);
        setToastNotification({ 
            title: 'Generando formulario...', 
            message: 'Tu formulario premium se está creando. (-2 créditos chat)', 
            icon: 'studio', 
            isLoading: true 
        });

        const currentPrompt = newFormPrompt;
        const currentName = newFormName;
        setNewFormName(''); 
        setNewFormPrompt('');

        try {
            let htmlCode = await generateFormCode(currentPrompt);
            // Limpieza extra por si acaso
            htmlCode = htmlCode.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

            await addForm({ name: currentName, description: currentPrompt, htmlCode: htmlCode });
            setToastNotification({ 
                title: '¡Formulario Listo!', 
                message: `"${currentName}" se ha creado correctamente.`, 
                icon: 'check' 
            });
        } catch (error) {
            console.error(error);
            setToastNotification({ title: 'Error', message: 'No se pudo generar.', icon: 'close' });
        }
    };
    
    const handleDelete = (formId: string) => { deleteForm(formId); setFormToDelete(null); };
    const copyLink = (form: Form) => { 
        const slug = (form as any).slug || encodeURIComponent(form.name.trim().replace(/\s+/g, '-').toLowerCase());
        const url = `${window.location.origin}/#/form/${slug}`; 
        navigator.clipboard.writeText(url); 
        setToastNotification({ title: 'Link Copiado', message: 'Enlace público copiado.', icon: 'copy' }); 
    };
    const handleViewResponses = (formId: string) => { loadFormResponses(formId); setViewingResponsesFor(formId); };

    const handleOpenEdit = (form: Form) => {
        setEditingForm(form);
        setEditFormName(form.name);
        setEditFormCode(form.htmlCode);
        setShowCode(false);
    };

    const generateSlug = (name: string) => {
        return name.trim().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
            .replace(/^-+|-+$/g, ''); // Trim hyphens
    };

    const handleSaveEdit = async () => {
        if (!editingForm || !currentUser || !updateForm) {
            console.error("Missing requirements for save:", { editingForm: !!editingForm, currentUser: !!currentUser, updateForm: !!updateForm });
            return;
        }
        setIsSavingEdit(true);
        try {
            // Llamada robusta a la función de actualización del contexto
            await updateForm(editingForm.id, {
                name: editFormName,
                htmlCode: editFormCode,
                slug: generateSlug(editFormName)
            });
            setToastNotification({ title: "Formulario Guardado", message: "Los cambios se han sincronizado correctamente.", icon: "check" });
            setEditingForm(null);
        } catch (e) {
            console.error("Error saving form:", e);
            setToastNotification({ title: "Error", message: "No se pudo actualizar el formulario. Intenta de nuevo.", icon: "close" });
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleEditFieldLabel = (oldFullMatch: string, newLabel: string) => {
        // Reemplazar solo el texto dentro del tag label
        const field = detectedFields.find(f => f.fullMatch === oldFullMatch);
        if (!field) return;
        const newHtml = oldFullMatch.replace(/(<label.*?>)([\s\S]*?)(<\/label>)/i, `$1${newLabel}$3`);
        setEditFormCode(prev => prev.replace(oldFullMatch, newHtml));
    };

    const handleMoveField = (index: number, direction: 'up' | 'down') => {
        const fields = [...detectedFields];
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        if (targetIdx < 0 || targetIdx >= fields.length) return;

        const currentField = fields[index];
        const targetField = fields[targetIdx];

        // Intercambio de bloques HTML usando placeholders para evitar colisiones
        let newCode = editFormCode;
        const p1 = "##F1_MOVE##";
        const p2 = "##F2_MOVE##";

        newCode = newCode.replace(currentField.fullMatch, p1);
        newCode = newCode.replace(targetField.fullMatch, p2);
        newCode = newCode.replace(p1, targetField.fullMatch);
        newCode = newCode.replace(p2, currentField.fullMatch);

        setEditFormCode(newCode);
    };

    const handleDeleteField = (fullMatch: string) => {
        if (!window.confirm("¿Eliminar esta pregunta?")) return;
        setEditFormCode(prev => prev.replace(fullMatch, ''));
    };

    const addFieldToCode = (type: 'text' | 'email' | 'select' | 'radio') => {
        const fieldName = prompt("Nombre de la pregunta:") || "Nueva Pregunta";
        const placeholder = prompt("Placeholder:") || "Escribe aquí...";
        
        let newHtml = "";
        if (type === 'text') {
            newHtml = `<div class="form-field-container mb-6">\n  <label class="block text-sm font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-widest mb-2">${fieldName}</label>\n  <input type="text" name="${fieldName.toLowerCase().replace(/\s+/g, '_')}" placeholder="${placeholder}" class="w-full p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl focus:ring-4 focus:ring-brand-primary/20 outline-none transition-all shadow-sm">\n</div>`;
        } else if (type === 'email') {
            newHtml = `<div class="form-field-container mb-6">\n  <label class="block text-sm font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-widest mb-2">${fieldName}</label>\n  <input type="email" name="email" placeholder="ejemplo@correo.com" class="w-full p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl focus:ring-4 focus:ring-brand-primary/20 outline-none transition-all shadow-sm" required>\n</div>`;
        } else if (type === 'select') {
            newHtml = `<div class="form-field-container mb-6">\n  <label class="block text-sm font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-widest mb-2">${fieldName}</label>\n  <select name="${fieldName.toLowerCase().replace(/\s+/g, '_')}" class="w-full p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl focus:ring-4 focus:ring-brand-primary/20 outline-none transition-all shadow-sm">\n    <option value="opcion1">Opción 1</option>\n    <option value="opcion2">Opción 2</option>\n  </select>\n</div>`;
        } else if (type === 'radio') {
            newHtml = `<div class="form-field-container mb-6">\n  <p class="block text-sm font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-widest mb-2">${fieldName}</p>\n  <div class="flex gap-6">\n    <label class="flex items-center gap-2 cursor-pointer font-bold"><input type="radio" name="radio_group" value="si" class="w-5 h-5 text-brand-primary focus:ring-brand-primary"> Si</label>\n    <label class="flex items-center gap-2 cursor-pointer font-bold"><input type="radio" name="radio_group" value="no" class="w-5 h-5 text-brand-primary focus:ring-brand-primary"> No</label>\n  </div>\n</div>`;
        }

        // INSERCIÓN INTELIGENTE: Buscar el inicio de las políticas de privacidad o el botón de envío
        const privacyIndex = editFormCode.toLowerCase().indexOf('https://www.goatify.app/privacidad/');
        const submitBtnIndex = editFormCode.toLowerCase().indexOf('type="submit"');
        const formCloseIndex = editFormCode.toLowerCase().lastIndexOf('</form>');
        
        let insertionPoint = formCloseIndex !== -1 ? formCloseIndex : editFormCode.length;
        if (privacyIndex !== -1) {
            // Buscar el div contenedor de la privacidad
            const privacyContainerStart = editFormCode.lastIndexOf('<div', privacyIndex);
            if (privacyContainerStart !== -1) insertionPoint = privacyContainerStart;
        } else if (submitBtnIndex !== -1) {
             const btnContainerStart = editFormCode.lastIndexOf('<div', submitBtnIndex);
             if (btnContainerStart !== -1) insertionPoint = btnContainerStart;
        }

        const newCode = editFormCode.slice(0, insertionPoint) + newHtml + "\n" + editFormCode.slice(insertionPoint);
        setEditFormCode(newCode);
        setToastNotification({ title: "Pregunta Añadida", message: `Se ha insertado "${fieldName}" correctamente.`, icon: "plus" });
    };

    const viewingForm = forms.find(f => f.id === viewingResponsesFor);
    const responses = viewingResponsesFor ? (formResponses[viewingResponsesFor] || []) : [];
    
    const allKeys: string[] = useMemo(() => {
        if (!viewingForm) return [];
        
        // 1. Obtener llaves de las respuestas existentes
        const responseKeys = responses.flatMap((r: any) => Object.keys(r.data || {}));
        
        // 2. Extraer llaves directamente del código HTML del formulario para asegurar que todas las preguntas sean columnas
        const htmlKeys: string[] = [];
        // Regex más específica para capturar names de inputs, selects y textareas
        const nameRegex = /<(?:input|select|textarea|p)[^>]*name=["']([^"']+)["']/gi;
        let match;
        while ((match = nameRegex.exec(viewingForm.htmlCode)) !== null) {
            const name = match[1];
            if (name !== 'privacidad' && !htmlKeys.includes(name)) {
                htmlKeys.push(name);
            }
        }
        
        return Array.from(new Set([...htmlKeys, ...responseKeys]));
    }, [responses, viewingForm]);

    const downloadCSV = () => {
        if (responses.length === 0) return;
        const headers = allKeys;
        const csvContent = [ headers.join(','), ...responses.map(res => headers.map((key: string) => { const val = res.data[key]; return JSON.stringify(Array.isArray(val) ? val.join('; ') : val || ''); }).join(',')) ].join('\n');
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${viewingForm?.name || 'responses'}.csv`;
        link.click();
    };

    const downloadPDF = () => {
        if (responses.length === 0 || !viewingForm) return;
        const doc = new jsPDF(); doc.setFontSize(18); doc.text(`Respuestas: ${viewingForm.name}`, 14, 20); doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);
        let y = 40; const margin = 14; const lineHeight = 7;
        responses.forEach((resp, i) => { if (y > 270) { doc.addPage(); y = 20; } doc.setFont('helvetica', 'bold'); doc.text(`Respuesta #${i + 1} - ${new Date(resp.submittedAt).toLocaleString()}`, margin, y); y += lineHeight; doc.setFont('helvetica', 'normal');
            allKeys.forEach((key: string) => { if (y > 280) { doc.addPage(); y = 20; } const value = resp.data[key]; const valStr = Array.isArray(value) ? value.join(', ') : String(value || '---'); const line = `${key}: ${valStr}`; const splitTitle = doc.splitTextToSize(line, 180); doc.text(splitTitle, margin + 5, y); y += lineHeight * splitTitle.length; }); y += 5;
        });
        doc.save(`${viewingForm.name}_Responses.pdf`);
    };
    
    const handleShareToFeed = () => {
        if (!viewingForm) return;
        const slug = (viewingForm as any).slug || encodeURIComponent(viewingForm.name.trim().replace(/\s+/g, '-').toLowerCase());
        const content = `📊 **Resumen de Formulario: ${viewingForm.name}**\n\nHe recolectado **${responses.length}** respuestas en mi formulario "${viewingForm.name}".\n\n[Ver formulario](${window.location.origin}/#/form/${slug})`;
        addHubPost(content);
        setToastNotification({ title: 'Compartido', message: 'Publicado en el Feed.', icon: 'check' });
    };

    return (
        <div className="p-4 sm:p-6 h-full overflow-y-auto custom-scrollbar">
            <Modal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} title="Manual Maestro: Creador de Formularios" className="max-w-4xl h-[80vh]">
                <div className="space-y-8 p-1 overflow-y-auto custom-scrollbar">
                    <div className="bg-brand-primary/10 p-6 rounded-[2rem] border border-brand-primary/20 flex items-center gap-6">
                         <div className="w-16 h-16 bg-brand-primary text-white rounded-2xl flex items-center justify-center shadow-lg"><Icon name="form" className="w-10 h-10"/></div>
                         <div>
                             <h3 className="text-2xl font-black text-brand-primary uppercase tracking-tighter leading-none">Captura de Datos Inteligente</h3>
                             <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 font-medium">Convierte ideas en formularios profesionales y gestiona respuestas como un experto.</p>
                         </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="bg-neutral-50 dark:bg-neutral-800 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-700">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-3 flex items-center gap-2"><div className="w-5 h-5 bg-brand-primary text-white rounded-md flex items-center justify-center text-[10px]">1</div> Generación IA</h4>
                                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">Shivo creará la estructura modular automáticamente. Los campos aparecerán organizados antes de las políticas de privacidad.</p>
                            </div>
                            <div className="bg-neutral-50 dark:bg-neutral-800 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-700">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-3 flex items-center gap-2"><div className="w-5 h-5 bg-brand-primary text-white rounded-md flex items-center justify-center text-[10px]">2</div> Edición No-Code</h4>
                                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">En el editor visual, puedes renombrar preguntas y cambiar su orden simplemente presionando las flechas. El diseño se mantendrá premium.</p>
                            </div>
                        </div>
                    </div>
                    <Button onClick={() => setIsHelpModalOpen(false)} className="w-full py-3 font-black uppercase text-[10px] tracking-widest shadow-xl">Entendido</Button>
                </div>
            </Modal>

            {/* MODAL DE EDICIÓN DE FORMULARIO v3.5 - ACTUALIZADO: NO-CODE EXPERIENCE */}
            {editingForm && (
                <Modal isOpen={!!editingForm} onClose={() => setEditingForm(null)} title={`Constructor Visual: ${editingForm.name}`} className="max-w-[95vw] lg:max-w-7xl h-[90vh]" noPadding>
                    <div className="flex flex-col h-full bg-neutral-100 dark:bg-[#050505] overflow-hidden">
                        <div className="flex flex-col md:flex-row justify-between items-center p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 gap-4 flex-none z-20 shadow-sm">
                            <div className="flex-grow w-full md:w-auto">
                                <label className="text-[9px] font-black uppercase text-neutral-400 mb-1 block">Nombre del Formulario</label>
                                <Input value={editFormName} onChange={e => setEditFormName(e.target.value)} className="!mt-0 font-bold" />
                            </div>
                            
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
                                    <button onClick={() => setShowCode(false)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!showCode ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500'}`}>Visual</button>
                                    <button onClick={() => setShowCode(true)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showCode ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500'}`}>Código</button>
                                </div>
                                <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="h-10 px-8 font-black uppercase text-[10px] tracking-widest shadow-lg">
                                    {isSavingEdit ? <Spinner className="w-4 h-4 text-white" /> : "Guardar Cambios"}
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                            {/* Panel Izquierdo: Gestión de Campos */}
                            <div className="w-full md:w-80 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 p-4 overflow-y-auto custom-scrollbar flex-none">
                                <h4 className="text-[10px] font-black uppercase text-brand-primary mb-4 tracking-widest border-b pb-2 border-brand-primary/10">Lista de Preguntas</h4>
                                <div className="space-y-2 mb-8">
                                    {detectedFields.length > 0 ? detectedFields.map((field, idx) => (
                                        <div key={field.id} className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 group shadow-sm transition-all hover:border-brand-primary/50">
                                            <div className="flex justify-between items-center gap-2">
                                                <input 
                                                    value={field.label} 
                                                    onChange={(e) => handleEditFieldLabel(field.fullMatch, e.target.value)}
                                                    className="bg-transparent border-none focus:ring-0 text-xs font-black text-neutral-800 dark:text-neutral-200 p-0 w-full" 
                                                    placeholder="Título de la pregunta"
                                                />
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleMoveField(idx, 'up')} disabled={idx === 0} className="p-1 text-neutral-400 hover:text-brand-primary disabled:opacity-0"><Icon name="chevronLeft" className="w-3 h-3 rotate-90"/></button>
                                                    <button onClick={() => handleMoveField(idx, 'down')} disabled={idx === detectedFields.length - 1} className="p-1 text-neutral-400 hover:text-brand-primary disabled:opacity-0"><Icon name="chevronDown" className="w-3 h-3"/></button>
                                                    <button onClick={() => handleDeleteField(field.fullMatch)} className="p-1 text-neutral-400 hover:text-red-500"><Icon name="trash" className="w-3 h-3"/></button>
                                                </div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center py-6 border-2 border-dashed border-neutral-100 dark:border-neutral-800 rounded-2xl">
                                            <p className="text-[10px] text-neutral-400 font-bold uppercase">Sin preguntas</p>
                                        </div>
                                    )}
                                </div>

                                <h4 className="text-[10px] font-black uppercase text-brand-primary mb-4 tracking-widest border-b pb-2 border-brand-primary/10">Añadir Componentes</h4>
                                <div className="grid grid-cols-1 gap-2 mb-8">
                                    <button onClick={() => addFieldToCode('text')} className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-brand-primary transition-all flex items-center gap-3 group text-left shadow-sm">
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors"><Icon name="plus" className="w-4 h-4"/></div>
                                        <div><p className="text-xs font-black uppercase tracking-tighter">Texto Corto</p><p className="text-[9px] text-neutral-400">Preguntas abiertas.</p></div>
                                    </button>
                                    <button onClick={() => addFieldToCode('email')} className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-brand-primary transition-all flex items-center gap-3 group text-left shadow-sm">
                                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg group-hover:bg-green-500 group-hover:text-white transition-colors"><Icon name="mail" className="w-4 h-4"/></div>
                                        <div><p className="text-xs font-black uppercase tracking-tighter">Email</p><p className="text-[9px] text-neutral-400">Captura de contacto.</p></div>
                                    </button>
                                    <button onClick={() => addFieldToCode('select')} className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-brand-primary transition-all flex items-center gap-3 group text-left shadow-sm">
                                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg group-hover:bg-purple-500 group-hover:text-white transition-colors"><Icon name="list" className="w-4 h-4"/></div>
                                        <div><p className="text-xs font-black uppercase tracking-tighter">Desplegable</p><p className="text-[9px] text-neutral-400">Múltiples opciones.</p></div>
                                    </button>
                                </div>
                            </div>

                            {/* Panel Derecho: Previsualización o Código */}
                            <div className="flex-1 bg-neutral-200 dark:bg-black/40 overflow-y-auto custom-scrollbar flex flex-col items-center p-4 sm:p-10 relative">
                                {showCode ? (
                                    <div className="w-full h-full min-h-[500px] bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl relative">
                                        <div className="absolute top-2 right-2 flex gap-1 z-10">
                                            <button onClick={() => { navigator.clipboard.writeText(editFormCode); setToastNotification({title:"Copiado", message:"Código en portapapeles", icon:"copy"}) }} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"><Icon name="copy" className="w-4 h-4"/></button>
                                        </div>
                                        <Textarea 
                                            value={editFormCode} 
                                            onChange={e => setEditFormCode(e.target.value)} 
                                            className="w-full h-full !bg-transparent border-none focus:ring-0 font-mono text-[11px] p-8 text-green-400 !min-h-[500px]"
                                            spellCheck={false}
                                        />
                                    </div>
                                ) : (
                                    <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-[2.5rem] shadow-2xl overflow-hidden ring-1 ring-black/5 animate-fade-in flex flex-col min-h-[600px] mb-20">
                                         <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/50 flex items-center justify-between">
                                            <span className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Live Preview</span>
                                            <div className="flex gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400"></div><div className="w-2 h-2 rounded-full bg-yellow-400"></div><div className="w-2 h-2 rounded-full bg-green-400"></div></div>
                                         </div>
                                         <div className="flex-1 bg-white dark:bg-neutral-900 p-4 sm:p-10">
                                             <div className="w-full h-full overflow-y-auto custom-scrollbar">
                                                 <iframe 
                                                    title="preview"
                                                    srcDoc={`
                                                        <html>
                                                            <head>
                                                                <script src="https://cdn.tailwindcss.com"></script>
                                                                <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap" rel="stylesheet">
                                                                <style>
                                                                    body { 
                                                                        background: transparent; 
                                                                        font-family: 'Plus Jakarta Sans', sans-serif; 
                                                                        display: flex; 
                                                                        align-items: center; 
                                                                        justify-content: center; 
                                                                        min-height: 100vh; 
                                                                        margin: 0; 
                                                                        padding: 20px; 
                                                                    }
                                                                    input, select, textarea { border-radius: 1rem !important; }
                                                                </style>
                                                            </head>
                                                            <body>
                                                                <div class="w-full max-w-md bg-white dark:bg-neutral-800 rounded-[2.5rem] shadow-2xl border border-neutral-100 dark:border-neutral-700 overflow-hidden">
                                                                    <div class="p-10">
                                                                        <div class="mb-10 text-center">
                                                                            <h1 class="text-3xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter leading-none mb-2">${editFormName}</h1>
                                                                            <p class="text-xs text-neutral-500 font-bold uppercase tracking-widest opacity-60 italic">Vista Previa Premium</p>
                                                                        </div>
                                                                        ${editFormCode.includes('<form') ? editFormCode : `<form class="space-y-4">${editFormCode}</form>`}
                                                                    </div>
                                                                </div>
                                                            </body>
                                                        </html>
                                                    `} 
                                                    className="w-full min-h-[600px] border-none pointer-events-none"
                                                 />
                                             </div>
                                         </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {formToDelete && (
                <Modal isOpen={!!formToDelete} onClose={() => setFormToDelete(null)} title="Eliminar Formulario">
                    <p>¿Estás seguro de que quieres eliminar este formulario? Esta acción es permanente.</p>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="secondary" onClick={() => setFormToDelete(null)}>Cancelar</Button>
                        <Button onClick={() => handleDelete(formToDelete)} className="bg-red-50 hover:bg-red-600 text-white">Eliminar</Button>
                    </div>
                </Modal>
            )}
            
            {viewingResponsesFor && (
                <Modal isOpen={!!viewingResponsesFor} onClose={() => setViewingResponsesFor(null)} title={`Respuestas: ${viewingForm?.name}`} className="max-w-5xl">
                    <div className="flex flex-wrap gap-2 mb-4 border-b border-neutral-200 dark:border-neutral-700 pb-4">
                        <Button onClick={downloadCSV} size="sm" variant="secondary"><Icon name="table" className="w-4 h-4"/> Excel/CSV</Button>
                        <Button onClick={downloadPDF} size="sm" variant="secondary"><Icon name="image" className="w-4 h-4"/> PDF</Button>
                        <Button onClick={handleShareToFeed} size="sm" variant="secondary"><Icon name="share" className="w-4 h-4"/> Compartir Resumen</Button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {responses.length === 0 ? ( <p className="text-center p-8 text-neutral-500">No hay respuestas aún.</p> ) : (
                            <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800 z-10">
                                    <tr>
                                        <th className="p-3 font-semibold border-b border-neutral-300 dark:border-neutral-600">Fecha</th>
                                        {allKeys.map((key: string) => ( <th key={key} className="p-3 font-semibold capitalize border-b border-neutral-300 dark:border-neutral-600">{key.replace(/_/g, ' ')}</th> ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                                    {responses.map((resp) => ( <tr key={resp.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800"> <td className="p-3 whitespace-nowrap text-neutral-500">{new Date(resp.submittedAt).toLocaleString()}</td> {allKeys.map((key: string) => ( <td key={key} className="p-3"> {resp.data[key] ? ( Array.isArray(resp.data[key]) ? resp.data[key].join(', ') : String(resp.data[key]) ) : '---'} </td> ))} </tr> ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <div className="flex justify-end mt-4"><Button onClick={() => setViewingResponsesFor(null)}>Cerrar</Button></div>
                </Modal>
            )}
            
            <Modal isOpen={isCreateModalOpen} onClose={() => setCreateModalOpen(false)} title="Crear Nuevo Formulario">
                 <div className="space-y-4">
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Describe el formulario que quieres construir y la IA generará el código premium y la lógica por ti. (-2 créditos chat)</p>
                    <div><label className="font-semibold text-sm">Nombre del Formulario</label><Input value={newFormName} onChange={e => setNewFormName(e.target.value)} placeholder="Ej: Encuesta de Satisfacción" required/></div>
                    <div><label className="font-semibold text-sm">Descripción / Prompt</label><Textarea value={newFormPrompt} onChange={e => setNewFormPrompt(e.target.value)} rows={4} placeholder="Ej: Un formulario de contacto..." required/></div>
                    <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" onClick={() => setCreateModalOpen(false)}>Cancelar</Button><Button onClick={handleGenerate} disabled={!newFormName || !newFormPrompt}>Generar Formulario</Button></div>
                </div>
            </Modal>

            <div className="flex justify-between items-center mb-6">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold uppercase tracking-tighter">Constructor de Formularios</h1>
                        <button onClick={() => setIsHelpModalOpen(true)} className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-neutral-500 hover:text-brand-primary transition-colors"><Icon name="help" className="w-5 h-5"/></button>
                    </div>
                    <div className="bg-brand-primary/5 px-3 py-1 rounded-lg border border-brand-primary/10 flex items-center gap-2 w-fit">
                        <span className="text-[10px] font-black uppercase text-brand-primary tracking-widest">Activos: {used} de {limit === 999999 ? '∞' : limit}</span>
                    </div>
                </div>
                <Button onClick={() => setCreateModalOpen(true)} className="shadow-lg px-8 font-black uppercase text-[10px] tracking-widest h-12"><Icon name="plus" className="w-4 h-4"/> <span className="hidden sm:inline">Nuevo Formulario</span></Button>
            </div>

            {forms.length === 0 ? (
                <div className="text-center p-12 bg-light-surface dark:bg-dark-surface rounded-xl border border-dashed border-light-border dark:border-dark-border">
                    <Icon name="list-ol" className="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-3" />
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">No has creado formularios aún.</p>
                    <Button onClick={() => setCreateModalOpen(true)} variant="secondary" className="mt-4">Crear mi primer formulario</Button>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {forms.map(form => (
                        <div key={form.id} className="bg-light-surface dark:bg-dark-surface p-4 sm:p-6 rounded-xl shadow-md border border-light-border dark:border-dark-border flex flex-col h-full hover:border-brand-primary transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-sm sm:text-xl font-bold truncate pr-2 w-full" title={form.name}>{form.name}</h3>
                                <div className="flex gap-1 flex-shrink-0">
                                     <button onClick={() => {
                                         const slug = (form as any).slug || encodeURIComponent(form.name.trim().replace(/\s+/g, '-').toLowerCase());
                                         const url = `${window.location.origin}/#/form/${slug}`;
                                         setMailDraft({
                                            to: '',
                                            subject: `Por favor completa: ${form.name}`,
                                            htmlBody: `Hola,<br/><br/>Te invito a completar el siguiente formulario de manera segura.<br/><br/><b>Formulario:</b> ${form.name}<br/><br/><a href="${url}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px;">Llenar Formulario</a><br/><br/>Gracias por tu tiempo.`
                                         });
                                         setCurrentView('mail');
                                     }} className="p-1.5 sm:p-2 hover:bg-brand-primary/10 text-brand-primary rounded-full" title="Enviar por Mail"><Icon name="mail" className="w-4 h-4" /></button>
                                     <button onClick={() => copyLink(form)} className="p-1.5 sm:p-2 hover:bg-light-bg dark:hover:bg-dark-bg rounded-full" title="Copiar Enlace Público"><Icon name="copy" className="w-4 h-4" /></button>
                                     <button onClick={() => handleOpenEdit(form)} className="p-1.5 sm:p-2 hover:bg-brand-accent/20 text-brand-primary rounded-full" title="Editar Estructura"><Icon name="edit" className="w-4 h-4" /></button>
                                     <button onClick={() => setFormToDelete(form.id)} className="p-1.5 sm:p-2 hover:bg-red-50/10 text-red-500 rounded-full" title="Eliminar"><Icon name="trash" className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <p className="text-xs sm:text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4 line-clamp-3 flex-grow">{form.description}</p>
                            <div className="mt-auto flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm mb-4 gap-1">
                                <span className="font-semibold bg-brand-accent/20 text-brand-primary px-2 py-1 rounded-md w-fit">{form.responseCount} Respuestas</span>
                                <span className="text-neutral-400">{new Date(form.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="pt-4 border-t border-light-border dark:border-dark-border grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Button size="sm" variant="secondary" onClick={() => {
                                    const slug = (form as any).slug || encodeURIComponent(form.name.trim().replace(/\s+/g, '-').toLowerCase());
                                    window.open(`/#/form/${slug}`, '_blank')
                                }} className="text-xs sm:text-sm"><Icon name="externalLink" className="w-3 h-3 sm:w-4 sm:h-4"/> Ver</Button>
                                <Button size="sm" variant="primary" onClick={() => handleViewResponses(form.id)} className="text-xs sm:text-sm"><Icon name="list" className="w-3 h-3 sm:w-4 sm:h-4"/> Respuestas</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FormBuilder;