
import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import type { Project, ProjectMetadata } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../firebaseConfig';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import Card from './ui/Card';
import Icon from './Icon';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import Modal from './ui/Modal';

import { generateProjectValueProposition } from '../services/geminiService';
import { checkAndConsumeLimit } from '../services/subscriptionService';

interface ProjectInfoViewProps {
    project: Project;
}

const ProjectInfoView: React.FC<ProjectInfoViewProps> = ({ project }) => {
    const { updateProject, setToastNotification, getProjectNotes } = useContext(AppContext);
    const [metadata, setMetadata] = useState<ProjectMetadata>(project.metadata || {
        industry: '',
        objective: '',
        targetAudience: '',
        valueProposition: '',
        currentStage: 'Idea'
    });

    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showAiContext, setShowAiContext] = useState(false);
    const [aiContext, setAiContext] = useState('');
    const [allowAlterEgo, setAllowAlterEgo] = useState(!!project.allowAlterEgo);
    const [endDate, setEndDate] = useState(project.endDate || '');
    const [stage, setStage] = useState(project.stage || 'Anteproyecto');
    const [roles, setRoles] = useState(project.roles || { director: [], socios: [], colaboradores: [], clientes: [] });
    const [newRoleInput, setNewRoleInput] = useState({ 
        director: { name: '', email: '' }, 
        socios: { name: '', email: '' }, 
        colaboradores: { name: '', email: '' }, 
        clientes: { name: '', email: '' } 
    });
    const [logoUrl, setLogoUrl] = useState(project.logoUrl || '');

    const [showPublicLinkModal, setShowPublicLinkModal] = useState(false);
    const [publicLinkConfig, setPublicLinkConfig] = useState(project.publicLinkConfig || { enabled: false, includedSections: [] });
    const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
    const [projectNotes, setProjectNotes] = useState<any[]>([]);

    useEffect(() => {
        if (project.metadata) setMetadata(project.metadata);
        setAllowAlterEgo(!!project.allowAlterEgo);
        setEndDate(project.endDate || '');
        setStage(project.stage || 'Anteproyecto');
        setRoles(project.roles || { director: [], socios: [], colaboradores: [], clientes: [] });
        setLogoUrl(project.logoUrl || '');
        setPublicLinkConfig(project.publicLinkConfig || { enabled: false, includedSections: [] });
    }, [project]);

    // Fetch notes from subcollection for the config view
    useEffect(() => {
        const fetchNotes = async () => {
            if (project.id) {
                try {
                    const notes = await getProjectNotes(project.id);
                    
                    // Merge with legacy notes to ensure all are visible
                    const legacyNotes = project.notes || [];
                    const fetchedNoteIds = new Set(notes.map(n => n.id));
                    const missingLegacyNotes = legacyNotes.filter(n => !fetchedNoteIds.has(n.id));
                    const combinedNotes = [...notes, ...missingLegacyNotes];
                    
                    // Sort by date desc
                    combinedNotes.sort((a, b) => {
                        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                        return dateB - dateA;
                    });
                    setProjectNotes(combinedNotes);
                } catch (e) {
                    console.error("Error fetching notes for config", e);
                }
            }
        };
        fetchNotes();
    }, [project.id, getProjectNotes, project.notes]);

    const handleConfirmGenerateAi = async () => {
        if (!project.name || !metadata.industry) {
            setToastNotification({
                title: "Faltan Datos",
                message: "Asegúrate de tener el nombre del proyecto y la industria definidos.",
                icon: "help"
            });
            return;
        }

        setIsGenerating(true);
        try {
            // Consumir 1 crédito

            const result = await generateProjectValueProposition(project.name, metadata.industry, aiContext);
            
            setShowAiContext(false);
            setAiContext('');
            
            setMetadata(prev => ({
                ...prev,
                valueProposition: result.valueProposition,
                objective: result.objective
            }));

            setToastNotification({
                title: "IA Generada",
                message: "Propuesta y objetivo generados con éxito.",
                icon: "brain"
            });
        } catch (e: any) {
            if (e.code === "PLAN_LIMIT_REACHED") {
                setToastNotification({
                    title: "Límite Alcanzado",
                    message: "No tienes suficientes créditos de IA.",
                    icon: "lock"
                });
            } else {
                console.error(e);
                setToastNotification({
                    title: "Error",
                    message: "No se pudo generar la información con IA.",
                    icon: "close"
                });
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateProject(project.id, { metadata, allowAlterEgo, endDate, stage, roles, logoUrl, publicLinkConfig });
            setToastNotification({
                title: "Información Actualizada",
                message: "Los datos estratégicos se han guardado correctamente.",
                icon: "check"
            });
        } catch (e) {
            setToastNotification({
                title: "Error",
                message: "No se pudo guardar la información.",
                icon: "close"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsSaving(true);
            try {
                const userId = auth.currentUser?.uid || project.ownerId || 'anonymous';
                const { url } = await uploadWithQuotaCheck({
                    userId,
                    data: file,
                    path: safeStoragePath('project-logos', project.id, `${Date.now()}_${file.name}`),
                    sizeBytes: file.size,
                    metadata: { contentType: file.type || 'image/*' }
                });
                setLogoUrl(url);
                setToastNotification({
                    title: "Logo Subido",
                    message: "El logo se ha subido correctamente. Recuerda guardar los cambios.",
                    icon: "check"
                });
            } catch (error) {
                console.error("Error uploading logo:", error);
                setToastNotification({
                    title: "Error",
                    message: "No se pudo subir el logo.",
                    icon: "close"
                });
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleChange = (field: keyof ProjectMetadata, value: string) => {
        setMetadata(prev => ({ ...prev, [field]: value }));
    };

    const handleStageChange = (newStage: string) => {
        setStage(newStage as any);
        if (newStage === 'Cierre') {
            setEndDate(new Date().toISOString().split('T')[0]);
        }
    };

    const handleAddRole = (roleType: keyof typeof roles) => {
        const roleData = newRoleInput[roleType];
        if (!roleData.name.trim()) return;
        setRoles(prev => ({
            ...prev,
            [roleType]: [...(prev[roleType] as any[] || []), { name: roleData.name.trim(), email: roleData.email.trim() }]
        }));
        setNewRoleInput(prev => ({ ...prev, [roleType]: { name: '', email: '' } }));
    };

    const handleRemoveRole = (roleType: keyof typeof roles, index: number) => {
        setRoles(prev => ({
            ...prev,
            [roleType]: (prev[roleType] || []).filter((_, i) => i !== index)
        }));
    };

    const [availableSections, setAvailableSections] = useState<any[]>([]);

    useEffect(() => {
        const base = [
            { id: 'info', label: 'Información General' },
            { id: 'notas_adicionales', label: 'Notas Adicionales (Principal)' },
            { id: 'miembros', label: 'Miembros' },
            { id: 'tareas', label: 'Tareas' },
            { id: 'pizarra', label: 'Pizarra' },
            { id: 'docs', label: 'Documentos' },
            { id: 'tablas', label: 'Tablas' },
            { id: 'crm', label: 'CRM de Proyecto' },
            { id: 'finanzas', label: 'Finanzas' },
            { id: 'fidelizacion', label: 'Programa de Fidelización' },
            { id: 'agendamiento', label: 'Agendamiento de Citas' }
        ];

        const custom = (project.publicLinkConfig?.customSections || []).map(s => ({
            id: s.id,
            label: s.title || 'Nota Pública',
            type: 'custom',
            data: s
        }));

        const notes = (projectNotes || []).map(n => ({
            id: `note_${n.id}`,
            label: `Nota: ${n.title}`,
            type: 'note',
            data: n
        }));

        let all = [...base, ...custom, ...notes];

        const savedOrder = publicLinkConfig.includedSections || [];
        if (savedOrder.length > 0) {
            all.sort((a, b) => {
                const indexA = savedOrder.indexOf(a.id);
                const indexB = savedOrder.indexOf(b.id);
                if (indexA === -1 && indexB === -1) return 0;
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });
        }

        setAvailableSections(all);
    }, [publicLinkConfig, projectNotes]);

    const handleAddCustomSection = () => {
        const newId = `custom_${Date.now()}`;
        const newSection = {
            id: newId,
            title: 'Nueva Nota Pública',
            content: '',
            color: 'neutral'
        };

        setPublicLinkConfig(prev => ({
            ...prev,
            customSections: [...(prev.customSections || []), newSection],
            includedSections: [newId, ...prev.includedSections] // Add to top by default
        }));
    };

    const handleUpdateCustomSection = (id: string, field: string, value: string) => {
        setPublicLinkConfig(prev => ({
            ...prev,
            customSections: (prev.customSections || []).map(s => 
                s.id === id ? { ...s, [field]: value } : s
            )
        }));
    };

    const handleDeleteCustomSection = (id: string) => {
        setPublicLinkConfig(prev => ({
            ...prev,
            customSections: (prev.customSections || []).filter(s => s.id !== id),
            includedSections: prev.includedSections.filter(sid => sid !== id)
        }));
    };

    const moveSection = (index: number, direction: 'up' | 'down') => {
        setAvailableSections(prev => {
            const newSections = [...prev];
            if (direction === 'up' && index > 0) {
                [newSections[index - 1], newSections[index]] = [newSections[index], newSections[index - 1]];
            } else if (direction === 'down' && index < newSections.length - 1) {
                [newSections[index + 1], newSections[index]] = [newSections[index], newSections[index + 1]];
            }
            
            setPublicLinkConfig(config => {
                const newOrder = newSections.map(s => s.id).filter(id => config.includedSections.includes(id));
                return { ...config, includedSections: newOrder };
            });
            
            return newSections;
        });
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedSectionIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        if (draggedSectionIndex === null || draggedSectionIndex === dropIndex) return;

        setAvailableSections(prev => {
            const newSections = [...prev];
            const [draggedItem] = newSections.splice(draggedSectionIndex, 1);
            newSections.splice(dropIndex, 0, draggedItem);
            
            setPublicLinkConfig(config => {
                const newOrder = newSections.map(s => s.id).filter(id => config.includedSections.includes(id));
                return { ...config, includedSections: newOrder };
            });
            
            return newSections;
        });
        setDraggedSectionIndex(null);
    };

    const handleToggleSection = (section: string) => {
        setPublicLinkConfig(prev => {
            let included = prev.includedSections.includes(section)
                ? prev.includedSections.filter(s => s !== section)
                : [...prev.includedSections, section];
            
            // Re-sort included based on current availableSections order
            included = availableSections.map(s => s.id).filter(id => included.includes(id));
            
            return { ...prev, includedSections: included };
        });
    };

    const handleToggleImportant = (section: string) => {
        setPublicLinkConfig(prev => {
            const important = prev.importantSections || [];
            const newImportant = important.includes(section)
                ? important.filter(s => s !== section)
                : [...important, section];
            return { ...prev, importantSections: newImportant };
        });
    };

    const handleToggleNote = (noteId: string) => {
        setPublicLinkConfig(prev => {
            const included = prev.includedNotes || [];
            const newIncluded = included.includes(noteId)
                ? included.filter(id => id !== noteId)
                : [...included, noteId];
            return { ...prev, includedNotes: newIncluded };
        });
    };

    const handleGenerateLink = async () => {
        let urlId = publicLinkConfig.urlId;
        if (!urlId) {
            // Generate slug from project name
            urlId = project.name
                .toLowerCase()
                .normalize('NFD') // Descompone caracteres con tildes
                .replace(/[\u0300-\u036f]/g, '') // Elimina las tildes
                .trim()
                .replace(/\s+/g, '-') // Espacios por guiones
                .replace(/[^\w-]+/g, '') // Quita caracteres especiales
                .replace(/--+/g, '-'); // Evita guiones dobles

            // Fallback si el nombre queda vacío por caracteres no soportados
            if (!urlId) {
                urlId = Math.random().toString(36).substring(2, 10);
            }
        }
        const newConfig = { ...publicLinkConfig, enabled: true, urlId };
        setPublicLinkConfig(newConfig);
        
        // Sync back to loyaltyConfig if enabled
        const updates: Partial<Project> = { publicLinkConfig: newConfig };
        if (newConfig.loyaltyProgram?.enabled) {
            updates.loyaltyConfig = {
                enabled: true,
                rewardName: newConfig.loyaltyProgram.rewardName,
                targetVisits: newConfig.loyaltyProgram.requiredVisits
            };
        }

        await updateProject(project.id, updates);
        
        const link = `${window.location.origin}/#/p/${urlId}`;
        navigator.clipboard.writeText(link);
        setToastNotification({
            title: "Link Generado",
            message: "El link público se ha copiado al portapapeles.",
            icon: "link"
        });
        setShowPublicLinkModal(false);
    };

    const renderRoleSection = (title: string, roleType: keyof typeof roles) => (
        <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block ml-1">{title}</label>
            <div className="flex flex-col sm:flex-row gap-2">
                <Input 
                    value={newRoleInput[roleType].name} 
                    onChange={e => setNewRoleInput(prev => ({ ...prev, [roleType]: { ...prev[roleType], name: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddRole(roleType)}
                    placeholder={`Nombre del ${title.toLowerCase()}`}
                    className="!rounded-xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-10 font-medium text-sm flex-1"
                />
                <Input 
                    type="email"
                    value={newRoleInput[roleType].email} 
                    onChange={e => setNewRoleInput(prev => ({ ...prev, [roleType]: { ...prev[roleType], email: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddRole(roleType)}
                    placeholder={'Correo (opcional)'}
                    className="!rounded-xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-10 font-medium text-sm flex-1"
                />
                <Button onClick={() => handleAddRole(roleType)} className="px-4 rounded-xl bg-brand-primary text-white hover:bg-brand-primary/90 h-10">
                    <Icon name="plus" className="w-4 h-4" />
                </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
                {(roles[roleType] || []).map((person, idx) => {
                    const name = typeof person === 'string' ? person : person.name;
                    const email = typeof person === 'object' && person.email ? person.email : null;
                    return (
                        <div key={idx} className="flex flex-col bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-xl text-xs font-medium border border-transparent hover:border-neutral-200 transition-colors group relative">
                            <div className="flex items-center justify-between gap-3">
                                <span>{name}</span>
                                <button onClick={() => handleRemoveRole(roleType, idx)} className="text-neutral-400 hover:text-red-500 opacity-50 group-hover:opacity-100 transition-opacity">
                                    <Icon name="close" className="w-3 h-3" />
                                </button>
                            </div>
                            {email && <span className="text-[10px] text-neutral-500 mt-0.5">{email}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const colorOptions = [
        { value: 'blue', class: 'bg-blue-500' },
        { value: 'red', class: 'bg-red-500' },
        { value: 'yellow', class: 'bg-yellow-500' },
        { value: 'green', class: 'bg-green-500' },
        { value: 'purple', class: 'bg-purple-500' },
        { value: 'neutral', class: 'bg-neutral-500' }
    ];

    return (
        <div className="animate-fade-in space-y-8 max-w-4xl mx-auto pb-12">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-2">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shadow-sm border border-brand-primary/20">
                            <Icon name="help" className="w-6 h-6"/>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tighter uppercase">Información del Proyecto</h2>
                            <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Define el ADN estratégico para Shivo IA</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="secondary" 
                            onClick={() => setShowAiContext(!showAiContext)} 
                            disabled={isGenerating}
                            className="rounded-xl flex items-center gap-2 bg-brand-accent/20 text-brand-primary border-brand-primary/30"
                        >
                            {isGenerating ? <Spinner className="w-4 h-4 text-brand-primary" /> : <Icon name="ai" className="w-4 h-4" />}
                            Generar IA
                        </Button>
                        {publicLinkConfig.enabled && publicLinkConfig.urlId && (
                        <Button 
                            variant="outline"
                            onClick={() => window.open(`/#/p/${publicLinkConfig.urlId}`, '_blank')} 
                            className="rounded-xl flex items-center gap-2"
                        >
                            <Icon name="externalLink" className="w-4 h-4" />
                            Abrir Link
                        </Button>
                    )}
                    <Button onClick={() => setShowPublicLinkModal(true)} className="rounded-xl flex items-center gap-2 bg-neutral-900 text-white hover:bg-neutral-800">
                        <Icon name="link" className="w-4 h-4" />
                        Configurar Link Público
                    </Button>
                </div>
            </div>

            {showAiContext && (
                <div className="px-6 py-5 bg-white dark:bg-dark-surface rounded-3xl shadow-lg border border-neutral-100 dark:border-neutral-800 animate-fade-in mx-2">
                    <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block mb-3 ml-1">Contexto adicional (Opcional)</label>
                    <Textarea 
                        value={aiContext}
                        onChange={(e) => setAiContext(e.target.value)}
                        placeholder="Ej: Quiero crear una marca de ropa, hacer campañas en redes para subir las ventas..."
                        className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none font-medium mb-4"
                        rows={2}
                    />
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setShowAiContext(false)} className="rounded-xl font-bold">Cancelar</Button>
                        <Button onClick={handleConfirmGenerateAi} disabled={isGenerating} className="rounded-xl bg-brand-primary text-white shadow-md hover:bg-brand-primary/90 font-bold px-6">
                            {isGenerating ? <Spinner className="w-4 h-4 text-white" /> : <Icon name="ai" className="w-4 h-4" />}
                            🪄 Generar Propuesta
                        </Button>
                    </div>
                </div>
            )}

            <Card className="p-8 space-y-8 bg-white dark:bg-dark-surface shadow-xl border border-neutral-100 dark:border-neutral-800 rounded-[2.5rem]">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="w-full md:w-1/3 flex flex-col items-center gap-4">
                        <div className="w-32 h-32 rounded-3xl bg-neutral-100 dark:bg-neutral-800 border-2 border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center overflow-hidden relative group">
                            {logoUrl ? (
                                <img src={logoUrl} alt="Logo del Proyecto" className="w-full h-full object-contain" />
                            ) : (
                                <Icon name="image" className="w-8 h-8 text-neutral-400" />
                            )}
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-white text-xs font-bold uppercase tracking-widest">Cambiar</span>
                            </div>
                            <input 
                                type="file" 
                                accept="image/png, image/jpeg" 
                                onChange={handleLogoUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] font-black uppercase text-brand-primary tracking-widest">Logo del Proyecto</p>
                            <p className="text-[10px] text-neutral-500 mt-1">PNG o JPG (Max 2MB)</p>
                            {logoUrl && (
                                <button onClick={() => setLogoUrl('')} className="text-[10px] text-red-500 font-bold uppercase mt-2 hover:underline">
                                    Eliminar Logo
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="w-full md:w-2/3 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block ml-1">Industria del Proyecto</label>
                                <Input 
                                    value={metadata.industry} 
                                    onChange={e => handleChange('industry', e.target.value)} 
                                    placeholder="Ej: E-commerce de moda, Consultoría Tech..."
                                    className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-12 font-bold"
                                />
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block ml-1">Etapa Actual</label>
                                <select 
                                    value={stage} 
                                    onChange={e => handleStageChange(e.target.value)}
                                    className="w-full h-12 px-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border-none font-bold text-sm focus:ring-2 focus:ring-brand-primary shadow-sm outline-none"
                                >
                                    <option value="Anteproyecto">Anteproyecto</option>
                                    <option value="Inicio">Inicio</option>
                                    <option value="Planificación">Planificación</option>
                                    <option value="Ejecución">Ejecución</option>
                                    <option value="Seguimiento y control">Seguimiento y control</option>
                                    <option value="Cierre">Cierre</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block ml-1">Fecha de Creación</label>
                                <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-900 rounded-2xl text-sm font-bold text-neutral-600 dark:text-neutral-400">
                                    {project.createdAt ? new Date(project.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : 'No registrada'}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block ml-1">Fecha Fin</label>
                                <Input 
                                    type="date"
                                    value={endDate} 
                                    onChange={e => setEndDate(e.target.value)} 
                                    className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-12 font-bold"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block ml-1">Propuesta de Valor Única</label>
                    <Input 
                        value={metadata.valueProposition} 
                        onChange={e => handleChange('valueProposition', e.target.value)} 
                        placeholder="¿Por qué elegirían tu proyecto?"
                        className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-12 font-bold"
                    />
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block ml-1">Objetivo Estratégico</label>
                    <Textarea 
                        value={metadata.objective} 
                        onChange={e => handleChange('objective', e.target.value)} 
                        placeholder="Describe qué quieres lograr exactamente con este proyecto..."
                        rows={3}
                        className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none font-medium"
                    />
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest block ml-1">Público Objetivo (Avatar)</label>
                    <Input 
                        value={metadata.targetAudience} 
                        onChange={e => handleChange('targetAudience', e.target.value)} 
                        placeholder="Ej: Dueños de PYMES de 30-50 años..."
                        className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-12 font-bold"
                    />
                </div>

                <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-black uppercase tracking-widest mb-6">Roles del Proyecto</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderRoleSection('Director', 'director')}
                        {renderRoleSection('Socios', 'socios')}
                        {renderRoleSection('Colaboradores', 'colaboradores')}
                        {renderRoleSection('Clientes', 'clientes')}
                    </div>
                </div>

                <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="bg-brand-primary/5 p-6 rounded-3xl border border-brand-primary/10 flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-brand-primary/10 rounded-xl text-brand-primary">
                                <Icon name="ai" className="w-6 h-6 animate-pulse" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-brand-primary">Sincronización con Shivo IA</p>
                                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">Al completar esta información, Shivo entenderá el contexto profundo de tu negocio para darte auditorías financieras y recomendaciones mucho más precisas.</p>
                            </div>
                        </div>
                        
                        <label className="flex items-center justify-between p-4 bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 transition-all">
                            <div className="flex flex-col">
                                <span className="text-sm font-black uppercase text-neutral-800 dark:text-white">Permitir uso para Alter Ego</span>
                                <span className="text-[10px] text-neutral-500">El agente autónomo usará los objetivos de este proyecto para interactuar en el Hub.</span>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={allowAlterEgo} 
                                onChange={e => setAllowAlterEgo(e.target.checked)}
                                className="w-6 h-6 rounded text-brand-primary focus:ring-brand-primary"
                            />
                        </label>
                    </div>
                </div>

                <Button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="w-full py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-brand-primary/20 transform hover:scale-[1.02] active:scale-95 transition-all"
                >
                    {isSaving ? <Spinner className="w-4 h-4 text-white" /> : "Guardar Información Estratégica"}
                </Button>
            </Card>

            <Modal isOpen={showPublicLinkModal} onClose={() => setShowPublicLinkModal(false)} title="Configurar Link Público" className="max-w-3xl">
                <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2 hide-scrollbar">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                            Selecciona, ordena y destaca qué secciones del proyecto quieres que sean visibles en el sitio web público.
                        </p>
                        <Button onClick={handleAddCustomSection} size="sm" className="bg-brand-primary text-white">
                            <Icon name="plus" className="w-4 h-4 mr-1" />
                            Nueva Nota Pública
                        </Button>
                    </div>
                    <div className="space-y-3">
                        {availableSections.map((section, index) => (
                            <div 
                                key={section.id} 
                                className={`flex flex-col gap-2 transition-all ${draggedSectionIndex === index ? 'opacity-50 scale-95' : ''}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={() => setDraggedSectionIndex(null)}
                            >
                                <div className="flex items-center gap-3 p-3 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 shadow-sm cursor-grab active:cursor-grabbing hover:border-brand-primary/30 transition-colors">
                                    <div className="flex flex-col gap-1 text-neutral-400 cursor-grab active:cursor-grabbing">
                                        <Icon name="hamburger" className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col gap-1 ml-1 mr-2">
                                        <button 
                                            onClick={() => moveSection(index, 'up')}
                                            disabled={index === 0}
                                            className="p-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded disabled:opacity-30 text-neutral-500"
                                            title="Mover arriba"
                                        >
                                            <Icon name="chevronUp" className="w-3 h-3" />
                                        </button>
                                        <button 
                                            onClick={() => moveSection(index, 'down')}
                                            disabled={index === availableSections.length - 1}
                                            className="p-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded disabled:opacity-30 text-neutral-500"
                                            title="Mover abajo"
                                        >
                                            <Icon name="chevronDown" className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                                        <input 
                                            type="checkbox" 
                                            checked={publicLinkConfig.includedSections.includes(section.id)}
                                            onChange={() => handleToggleSection(section.id)}
                                            className="w-5 h-5 rounded text-brand-primary focus:ring-brand-primary"
                                        />
                                        <span className="text-sm font-bold truncate flex-1 min-w-0">
                                            <span className="text-neutral-400 mr-2">{(index + 1).toString().padStart(2, '0')}.</span>
                                            {section.type === 'custom' ? (section.data.title || 'Nueva Nota') : section.label}
                                        </span>
                                        {section.type === 'custom' && <span className="text-[10px] bg-purple-100 text-purple-600 px-3 py-1 rounded-full font-bold uppercase whitespace-nowrap">Personalizado</span>}
                                        {section.type === 'note' && <span className="text-[10px] bg-yellow-100 text-yellow-600 px-3 py-1 rounded-full font-bold uppercase whitespace-nowrap">Nota Proyecto</span>}
                                    </label>
                                    <button 
                                        onClick={() => handleToggleImportant(section.id)}
                                        className={`p-2 rounded-lg transition-colors ${publicLinkConfig.importantSections?.includes(section.id) ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-500' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
                                        title="Marcar como Destacado"
                                    >
                                        <Icon name="star" className="w-5 h-5" />
                                    </button>
                                </div>
                                
                                {/* Custom Section Editor */}
                                {section.type === 'custom' && publicLinkConfig.includedSections.includes(section.id) && (
                                    <div className="ml-12 pl-4 border-l-2 border-neutral-200 dark:border-neutral-700 space-y-3 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-r-xl">
                                        <Input 
                                            value={section.data.title} 
                                            onChange={e => handleUpdateCustomSection(section.id, 'title', e.target.value)}
                                            placeholder="Título de la nota pública"
                                            className="!bg-white dark:!bg-neutral-900"
                                        />
                                        <Textarea 
                                            value={section.data.content} 
                                            onChange={e => handleUpdateCustomSection(section.id, 'content', e.target.value)}
                                            placeholder="Escribe el contenido visible para el público..."
                                            rows={3}
                                            className="!bg-white dark:!bg-neutral-900"
                                        />
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-neutral-500 uppercase">Color:</span>
                                                <div className="flex gap-2">
                                                    {colorOptions.map(color => (
                                                        <button
                                                            key={color.value}
                                                            onClick={() => handleUpdateCustomSection(section.id, 'color', color.value)}
                                                            className={`w-6 h-6 rounded-full ${color.class} ${section.data.color === color.value ? 'ring-2 ring-offset-2 ring-brand-primary dark:ring-offset-neutral-900' : 'opacity-50 hover:opacity-100'} transition-all`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <button onClick={() => handleDeleteCustomSection(section.id)} className="text-red-500 text-xs font-bold hover:underline uppercase tracking-wider">
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700 space-y-4">
                        <h3 className="text-lg font-black uppercase tracking-widest text-brand-primary flex items-center gap-2">
                            <Icon name="user" className="w-5 h-5" />
                            Información de Contacto
                        </h3>
                        <p className="text-xs text-neutral-500">
                            Define los datos de contacto que verán tus clientes. Si los dejas vacíos, se usarán los de soporte por defecto.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-neutral-500 mb-1 ml-1">Email de Contacto</label>
                                <Input 
                                    value={publicLinkConfig.contactEmail || ''}
                                    onChange={(e) => setPublicLinkConfig(prev => ({ ...prev, contactEmail: e.target.value }))}
                                    placeholder="ejemplo@correo.com"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-neutral-500 mb-1 ml-1">WhatsApp (con código)</label>
                                <Input 
                                    value={publicLinkConfig.contactWhatsapp || ''}
                                    onChange={(e) => setPublicLinkConfig(prev => ({ ...prev, contactWhatsapp: e.target.value }))}
                                    placeholder="521234567890"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-neutral-500 mb-1 ml-1">Link de Reunión</label>
                                <Input 
                                    value={publicLinkConfig.meetingLink || ''}
                                    onChange={(e) => setPublicLinkConfig(prev => ({ ...prev, meetingLink: e.target.value }))}
                                    placeholder="goatify.ia/#/s/tu-usuario"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-widest text-brand-primary flex items-center gap-2">
                                    <Icon name="star" className="w-5 h-5" />
                                    Programa de Fidelización
                                </h3>
                                <p className="text-xs text-neutral-500 mt-1">
                                    Permite a tus clientes registrar visitas y ganar recompensas desde tu sitio web.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={publicLinkConfig.loyaltyProgram?.enabled || false}
                                    onChange={(e) => setPublicLinkConfig(prev => ({
                                        ...prev,
                                        loyaltyProgram: {
                                            ...(prev.loyaltyProgram || { rewardName: 'Café Gratis', requiredVisits: 5, icon: 'coffee' }),
                                            enabled: e.target.checked
                                        }
                                    }))}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-primary"></div>
                            </label>
                        </div>

                        {publicLinkConfig.loyaltyProgram?.enabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-brand-primary/5 p-4 rounded-xl border border-brand-primary/10">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Premio / Recompensa</label>
                                    <Input 
                                        value={publicLinkConfig.loyaltyProgram.rewardName}
                                        onChange={(e) => setPublicLinkConfig(prev => ({
                                            ...prev,
                                            loyaltyProgram: { ...prev.loyaltyProgram!, rewardName: e.target.value }
                                        }))}
                                        placeholder="Ej. Un café gratis, 10% de descuento..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Visitas Necesarias</label>
                                    <Input 
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={publicLinkConfig.loyaltyProgram.requiredVisits}
                                        onChange={(e) => setPublicLinkConfig(prev => ({
                                            ...prev,
                                            loyaltyProgram: { ...prev.loyaltyProgram!, requiredVisits: parseInt(e.target.value) || 1 }
                                        }))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-widest text-brand-primary flex items-center gap-2">
                                    <Icon name="calendar" className="w-5 h-5" />
                                    Agendador Nativo (Goatify Scheduler)
                                </h3>
                                <p className="text-xs text-neutral-500 mt-1">
                                    Permite a tus clientes agendar reuniones directamente desde tu sitio web sin usar links externos.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={publicLinkConfig.schedulingConfig?.enabled || false}
                                    onChange={(e) => setPublicLinkConfig(prev => ({
                                        ...prev,
                                        schedulingConfig: {
                                            ...(prev.schedulingConfig || { workingDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00', slotDuration: 30 }),
                                            enabled: e.target.checked
                                        }
                                    }))}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-primary"></div>
                            </label>
                        </div>

                        {publicLinkConfig.schedulingConfig?.enabled && (
                            <div className="space-y-6 bg-brand-primary/5 p-6 rounded-2xl border border-brand-primary/10">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black uppercase text-neutral-500 ml-1">Hora de Inicio</label>
                                        <Input 
                                            type="time"
                                            value={publicLinkConfig.schedulingConfig.startTime}
                                            onChange={(e) => setPublicLinkConfig(prev => ({
                                                ...prev,
                                                schedulingConfig: { ...prev.schedulingConfig!, startTime: e.target.value }
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black uppercase text-neutral-500 ml-1">Hora de Fin</label>
                                        <Input 
                                            type="time"
                                            value={publicLinkConfig.schedulingConfig.endTime}
                                            onChange={(e) => setPublicLinkConfig(prev => ({
                                                ...prev,
                                                schedulingConfig: { ...prev.schedulingConfig!, endTime: e.target.value }
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black uppercase text-neutral-500 ml-1">Duración (minutos)</label>
                                        <select 
                                            value={publicLinkConfig.schedulingConfig.slotDuration}
                                            onChange={(e) => setPublicLinkConfig(prev => ({
                                                ...prev,
                                                schedulingConfig: { ...prev.schedulingConfig!, slotDuration: parseInt(e.target.value) }
                                            }))}
                                            className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                                        >
                                            <option value={15}>15 min</option>
                                            <option value={30}>30 min</option>
                                            <option value={45}>45 min</option>
                                            <option value={60}>60 min</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-[10px] font-black uppercase text-neutral-500 ml-1">Días Laborales</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day, idx) => {
                                            const isSelected = publicLinkConfig.schedulingConfig?.workingDays.includes(idx);
                                            return (
                                                <button
                                                    key={day}
                                                    onClick={() => {
                                                        const currentDays = publicLinkConfig.schedulingConfig?.workingDays || [];
                                                        const newDays = isSelected 
                                                            ? currentDays.filter(d => d !== idx)
                                                            : [...currentDays, idx].sort();
                                                        setPublicLinkConfig(prev => ({
                                                            ...prev,
                                                            schedulingConfig: { ...prev.schedulingConfig!, workingDays: newDays }
                                                        }));
                                                    }}
                                                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isSelected ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200'}`}
                                                >
                                                    {day}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800 sticky bottom-0 bg-white dark:bg-dark-surface pb-2">
                        <Button variant="outline" onClick={() => setShowPublicLinkModal(false)}>Cancelar</Button>
                        <Button onClick={handleGenerateLink} className="flex items-center gap-2">
                            <Icon name="link" className="w-4 h-4" />
                            Generar y Copiar Link
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ProjectInfoView;
