import React, { useState, useContext, useEffect, useRef, useMemo } from 'react';
import type { Task, ProjectSubView, Folder, UserProfile, Project, Note, CallSession } from '../types';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import { useTranslation } from '../hooks/useTranslation';
import CalendarView from './CalendarView';
import Icon from './Icon';
import FinancialsView from './FinancialsView';
import Card from './ui/Card';
import Button from './ui/Button';
import ListView from './ListView';
import ProjectOverview from './ProjectOverview';
import ProjectInfoView from './ProjectInfoView';
import Notepad from './Notepad';
import DrawingPad from './DrawingPad';
import ProjectChat from './ProjectChat';
import TableView from './TableView';
import KanbanView from './KanbanView';
import DocumentsView from './DocumentsView';
import ProjectCrmView from './ProjectCrmView';
import ErrorBoundary from './ErrorBoundary';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import type { Translations } from '../localization/en';
import SpreadsheetView from './SpreadsheetView';
import { generateProjectTemplate, generateProjectProposal } from '../services/geminiService';
import { formatMarkdownToHtmlForNotepad } from '../utils/formatUtils';
import Spinner from './ui/Spinner';
import { SUBSCRIPTION_PLANS, getPlanConfig } from '../types';
import { collection, onSnapshot, query, where, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import LoyaltySettingsView from './LoyaltySettingsView';

const projectColors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f97316', '#eab308',
];

const getProjectHexColor = (projectId: string) => {
    if (!projectId) return projectColors[0];
    let hash = 0;
    for (let i = 0; i < projectId.length; i++) {
        hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % projectColors.length);
    return projectColors[index];
};

const CreateProjectModal: React.FC<{ isOpen: boolean, onClose: () => void }> = ({ isOpen, onClose }) => {
    const { t, language } = useTranslation();
    const { projects, addProject, updateProject, userProfile, setSelectedProjectId, setToastNotification, setCurrentView, addActivityLog, setProModalOpen } = useContext(AppContext);
    const [projectName, setProjectName] = useState('');
    const [industry, setIndustry] = useState('Productividad Personal');
    const [projectDetails, setProjectDetails] = useState('');
    const [customIndustry, setCustomIndustry] = useState('');
    const industries = [ "Tecnología (General)", "E-commerce", "Desarrollo de Software", "Agencia de Marketing", "Creación de Contenido", "Consultoría", "Finanzas y Contabilidad", "Educación", "Salud y Bienestar", "Productividad Personal", "Otro" ];
    const [isCreating, setIsCreating] = useState(false);
    
    const activeCount = projects.filter(p => !p.isLocked).length;
    const planConfig = getPlanConfig(userProfile.plan);
    const limitValue = (planConfig.limits as any).active_projects || 3;
    const isAtLimit = activeCount >= limitValue && limitValue !== 999999;

    const handleCreate = async (withAI: boolean) => {
        const finalIndustry = industry === 'Otro' ? customIndustry : industry;
        if (!projectName.trim() || !finalIndustry.trim()) return;
        
        setIsCreating(true);
        
        try {
            let newProjectData: Omit<Project, 'id'>;
            if (withAI) {
                setToastNotification({ title: 'Creando...', message: 'La IA está diseñando tu proyecto...', icon: 'studio', isLoading: true });
                
                const template = await generateProjectTemplate(finalIndustry, projectName, language, projectDetails);
                
                if (!template || template.length === 0) {
                     newProjectData = { 
                        name: projectName, 
                        ownerId: userProfile.uid, 
                        members: [userProfile], 
                        memberIds: [userProfile.uid], 
                        folders: [{id: `folder-${Date.now()}`, name: 'Planificación', tasks: []}], 
                        documents: [], notes: [], drawings: [], chats: [], spreadsheets: [], 
                        finances: { 
                            income: 0, 
                            expenses: 0, 
                            transactions: [],
                            adn: 'independent',
                            fiscalCountry: userProfile.country === 'Ecuador' ? 'EC' : userProfile.country === 'Mexico' ? 'MX' : 'OTHER'
                        }, 
                        statuses: [],
                        clients: [],
                        createdAt: new Date().toISOString()
                    };
                } else {
                    const { id, ...generatedProjectData } = template[0];
                    if (generatedProjectData.folders) {
                        generatedProjectData.folders.forEach((f: any) => {
                            if (f.tasks) {
                                f.tasks.forEach((t: any) => {
                                    t.status = 'Por Hacer';
                                    if (!t.id) t.id = `task-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
                                    if (!t.tags || t.tags.length === 0) t.tags = ['Prioridad', 'IA'];
                                    if (!t.hours) t.hours = 2;
                                    
                                    // FIX: Ensure valid date for calendar visibility
                                    if (!t.date || isNaN(Date.parse(t.date))) {
                                        const today = new Date();
                                        // Distribute tasks over next 14 days
                                        const randomDays = Math.floor(Math.random() * 14);
                                        const taskDate = new Date(today);
                                        taskDate.setDate(today.getDate() + randomDays);
                                        t.date = taskDate.toISOString().split('T')[0];
                                    }
                                });
                            }
                        });
                    }
                    newProjectData = {
                         folders: [], documents: [], notes: [], drawings: [], chats: [], spreadsheets: [],
                         finances: { 
                             income: 0, 
                             expenses: 0, 
                             transactions: [],
                             adn: 'independent',
                             fiscalCountry: userProfile.country === 'Ecuador' ? 'EC' : userProfile.country === 'Mexico' ? 'MX' : 'OTHER'
                         },
                         statuses: [
                             { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true },
                             { id: 'status-inprogress', name: 'En Pregreso', color: '#3B82F6', isFixed: true },
                             { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true }
                         ],
                         clients: [], ...generatedProjectData,
                         name: generatedProjectData.name || projectName,
                         ownerId: userProfile.uid, members: [userProfile], memberIds: [userProfile.uid],
                         metadata: { industry: finalIndustry },
                         createdAt: new Date().toISOString()
                    };
                }
            } else {
                newProjectData = { 
                    name: projectName, 
                    ownerId: userProfile.uid, 
                    members: [userProfile], 
                    memberIds: [userProfile.uid], 
                    folders: [{id: `folder-${Date.now()}`, name: 'General', tasks: []}], 
                    documents: [], notes: [], drawings: [], 
                    chats: [{ id: `chat-${Date.now()}`, name: 'General Chat', history: [], updatedAt: new Date().toISOString() }], 
                    spreadsheets: [], 
                    finances: { 
                        income: 0, 
                        expenses: 0, 
                        transactions: [],
                        adn: 'independent',
                        fiscalCountry: userProfile.country === 'Ecuador' ? 'EC' : userProfile.country === 'Mexico' ? 'MX' : 'OTHER'
                    }, 
                    statuses: [ 
                        { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true }, 
                        { id: 'status-inprogress', name: 'En Pregreso', color: '#3B82F6', isFixed: true }, 
                        { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true }, 
                    ], 
                    clients: [],
                    metadata: { industry: finalIndustry },
                    createdAt: new Date().toISOString()
                };
            }
            const newProjectId = await addProject(newProjectData);
            if (withAI) {
                 generateProjectProposal(newProjectData.name, finalIndustry)
                    .then(async (proposal) => {
                         const formattedProposal = formatMarkdownToHtmlForNotepad(proposal);
                         const strategyNote: Note = { id: `note-strategy-${Date.now()}`, title: '🚀 Estrategia & Roadmap', content: formattedProposal, createdAt: new Date().toISOString() };
                         const currentProj = await getDoc(doc(db, "projects", newProjectId));
                         if (currentProj.exists()) {
                             const existingNotes = currentProj.data().notes || [];
                             await updateProject(newProjectId, { notes: [strategyNote, ...existingNotes] });
                         }
                         setToastNotification({ title: 'Estrategia Generada', message: 'Se ha añadido una nota con el plan estratégico.', icon: 'brain' });
                    })
                    .catch(err => console.error("Proposal generation failed", err));
            }
            addActivityLog('project_created', `Creaste el proyecto: "${newProjectData.name}"`, newProjectId);
            setToastNotification({ title: 'Proyecto Creado', message: `"${newProjectData.name}" está listo.`, icon: 'check', onClick: () => { setCurrentView('projects'); setSelectedProjectId(newProjectId); } });
            onClose();
            setProjectName(''); setIndustry('Productividad Personal'); setCustomIndustry(''); setProjectDetails('');
        } catch (error) { 
            console.error(error);
            if (!(error instanceof Error && error.message === "PLAN_LIMIT_REACHED")) {
                setToastNotification({ title: 'Error', message: 'No se pudo crear el proyecto.', icon: 'close' }); 
            }
        } finally { setIsCreating(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Crear Nuevo Proyecto">
            <div className="space-y-4">
                {isAtLimit && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30 mb-4 flex items-start gap-2">
                        <Icon name="lock" className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-[10px] sm:text-xs font-bold text-amber-600 dark:text-amber-400">
                            Has alcanzado el límite de proyectos de tu plan. Este proyecto se creará <span className="underline">BLOQUEADO</span> hasta que mejores tu plan o elimes otros proyectos.
                        </p>
                    </div>
                )}
                <div><label className="font-semibold text-sm">Nombre del Proyecto</label><Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Ej: Campaña de Marketing Q4" disabled={isCreating} /></div>
                <div><label className="font-semibold text-sm">Industria / Tipo</label><select value={industry} onChange={e => setIndustry(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1" disabled={isCreating}>{industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}</select></div>
                {industry === 'Otro' && ( <div><label className="font-semibold text-sm">Describe tu industria</label><Input value={customIndustry} onChange={e => setCustomIndustry(e.target.value)} placeholder="Ej: Consultoría de Energías Renovables" disabled={isCreating} /></div>)}
                <div>
                    <label className="font-semibold text-sm flex items-center justify-between">
                        <span>Detalles adicionales (Opcional)</span>
                        <span className="text-[10px] text-brand-primary font-bold uppercase tracking-tight opacity-70">
                            * Solo se aplican al generar con IA
                        </span>
                    </label>
                    <Textarea 
                        value={projectDetails} 
                        onChange={e => setProjectDetails(e.target.value)} 
                        placeholder="Ej: Proyecto de 1 mes con 5 tareas críticas..." 
                        rows={3}
                        disabled={isCreating}
                        className="mt-1"
                    />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="secondary" onClick={() => handleCreate(false)} disabled={isCreating}>En Blanco</Button>
                    <Button variant="primary" onClick={() => handleCreate(true)} disabled={isCreating}>
                        {isCreating ? (
                            <>
                                <Spinner showText={false} size="sm" className="text-white" />
                                <span>Creando...</span>
                            </>
                        ) : (
                            <>
                                <Icon name="ai" className="w-4 h-4" />
                                Crear con IA
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}

const AllProjectsView: React.FC = () => {
    const { projects, setSelectedProjectId, deleteProject, updateProject, userProfile, setProModalOpen } = useContext(AppContext);
    const { t } = useTranslation();
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [isDeleteModalOpen, setDeleteModalOpen] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

    const handleStartEdit = (project: (typeof projects)[0]) => { setIsEditing(project.id); setEditingName(project.name); };
    const handleSave = (projectId: string) => { updateProject(projectId, { name: editingName }); setIsEditing(null); };
    const handleDeleteConfirm = () => { if (isDeleteModalOpen) { deleteProject(isDeleteModalOpen); setDeleteModalOpen(null); } };

    const planConfig = getPlanConfig(userProfile.plan);
    const projectLimit = (planConfig.limits as any).active_projects || 3;
    const activeProjectsCount = projects.filter(p => !p.isLocked).length;

    const sortedProjects = useMemo(() => {
        const list = [...projects];
        if (sortBy === 'name') {
            return list.sort((a, b) => a.name.localeCompare(b.name));
        }
        // MODIFICACIÓN v18.0: Ordenamiento explícito Descendente (Más nuevo primero)
        return list.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });
    }, [projects, sortBy]);

    return (
        <div className="lg:pl-8">
            <CreateProjectModal isOpen={isCreateModalOpen} onClose={() => setCreateModalOpen(false)} />
            {isDeleteModalOpen && ( <Modal isOpen={!!isDeleteModalOpen} onClose={() => setDeleteModalOpen(null)} title="Eliminar Proyecto"><p>¿Estás seguro de que quieres eliminar este proyecto? Si eres el dueño, se borrará para todos. Si eres invitado, solo saldrás de él.</p><div className="flex justify-end gap-2 mt-4"><Button variant="secondary" onClick={() => setDeleteModalOpen(null)}>Cancelar</Button><Button onClick={handleDeleteConfirm} className="bg-red-50 hover:bg-red-600 text-white">Confirmar</Button></div></Modal> )}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold">{t('projects')}</h1>
                    <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">
                        Uso: {activeProjectsCount} de {projectLimit === 999999 ? '∞' : projectLimit} activos
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
                        <button onClick={() => setSortBy('date')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${sortBy === 'date' ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-black dark:text-neutral-400'}`}>Fecha</button>
                        <button onClick={() => setSortBy('name')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${sortBy === 'name' ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-black dark:text-neutral-400'}`}>Nombre</button>
                    </div>
                    <Button onClick={() => setCreateModalOpen(true)}><Icon name="plus" className="w-4 h-4" /><span>{t('createProject')}</span></Button>
                </div>
            </div>
            {sortedProjects.length > 0 ? ( 
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6"> 
                {sortedProjects.map((project, index) => { 
                    const isLocked = !!(project as any).isLocked;
                    // FIX: Securización de flatMap para evitar crashes
                    const projectTasks = (project.folders || []).flatMap(f => f.tasks || []) || []; 
                    const completed = projectTasks.filter(t => t.status === 'Hecho').length; 
                    const totalTasks = projectTasks.length; 
                    const progress = totalTasks > 0 ? (completed / totalTasks) * 100 : 0; 
                    const upcomingTasks = projectTasks.filter(t => t.status !== 'Hecho').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 
                    const nextDueDate = upcomingTasks.length > 0 ? new Date(upcomingTasks[0].date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A'; 
                    const projectColor = getProjectHexColor(project.id); 
                    return ( 
                    <Card key={project.id} className={`p-0 flex flex-col transition-all duration-300 ${isLocked ? 'opacity-70' : 'hover:shadow-xl hover:-translate-y-1'} group relative overflow-hidden`} style={{ borderTop: `4px solid ${isLocked ? '#999' : projectColor}` }}> 
                        {isLocked && ( <div className="absolute inset-0 bg-gray-100/80 dark:bg-black/80 backdrop-blur-[1px] z-50 flex flex-col items-center justify-center text-center p-4"> <div className="bg-white dark:bg-neutral-800 p-3 rounded-full shadow-lg mb-2"> <Icon name="lock" className="w-6 h-6 text-neutral-500"/> </div> <p className="text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-2">Límite de Plan: Bloqueado</p> <Button size="sm" onClick={() => setProModalOpen(true)} className="text-[10px] py-1">Ampliar Plan</Button> </div> )}
                        <div className="flex-1 flex flex-col p-6 cursor-pointer" onClick={() => !isLocked && isEditing !== project.id && setSelectedProjectId(project.id)}> 
                        {isEditing !== project.id && !isLocked && ( <div className="absolute top-3 right-3 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"> <button onClick={(e) => { e.stopPropagation(); handleStartEdit(project); }} className="p-2 bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-sm rounded-full hover:bg-light-border dark:hover:bg-dark-border"><Icon name="edit" className="w-4 h-4"/></button> <button onClick={(e) => { e.stopPropagation(); setDeleteModalOpen(project.id); }} className="p-2 bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-sm rounded-full hover:bg-red-500/20"><Icon name="trash" className="w-4 h-4 text-red-500"/></button> </div> )} 
                        <div className="flex-grow"> {isEditing === project.id ? ( <div className="mb-4"> <Input value={editingName} onChange={e => setEditingName(e.target.value)} onClick={e => e.stopPropagation()} onKeyDown={e => e.key === 'Enter' && handleSave(project.id)} autoFocus /> <div className="flex gap-2 mt-2"> <Button size="sm" onClick={(e) => { e.stopPropagation(); handleSave(project.id); }}>Guardar</Button> <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setIsEditing(null); }}>Cancelar</Button> </div> </div> ) : ( <h2 className="text-lg font-bold mb-2 line-clamp-2 text-light-text-primary dark:text-dark-text-primary">{project.name}</h2> )} </div> 
                        <div className="flex justify-between text-sm my-4"> <div> <p className="text-light-text-secondary dark:text-dark-text-secondary">Tareas</p> <p className="font-bold">{completed}/{totalTasks}</p> </div> <div className="text-right"> <p className="text-light-text-secondary dark:text-dark-text-secondary">Entrega</p> <p className="font-bold">{nextDueDate}</p> </div> </div> <div className="space-y-1"> <div className="flex justify-between items-center text-xs text-light-text-secondary dark:text-dark-text-secondary"> <span>Progreso</span> <span className="font-semibold">{progress.toFixed(0)}%</span> </div> <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden"> <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: projectColor }}></div> </div> </div> <div className="flex items-center -space-x-2 mt-6"> {(project.members || []).slice(0, 3).map((member) => ( <img key={member.email || member.name} src={member.avatarUrl || `https://ui-avatars.com/api/?name=${(member.name || 'User').replace(' ', '+')}&background=random`} alt={member.name || 'User'} className="w-8 h-8 rounded-full border-2 border-light-surface dark:border-dark-surface object-contain" /> ))} {project.members && project.members.length > 3 && ( <div className="w-8 h-8 rounded-full bg-light-bg dark:bg-dark-bg flex items-center justify-center text-xs font-bold border-2 border-light-surface dark:border-dark-surface"> +{project.members.length - 3} </div> )} </div> </div> </Card> 
                    )})} </div> 
            ) : ( <Card className="text-center p-12"> <Icon name="projects" className="w-16 h-16 mx-auto text-neutral-400" /> <h3 className="text-xl font-bold mt-4">{t('noProjectsFound')}</h3> <p className="text-light-text-secondary dark:text-dark-text-secondary">{t('createProjectToStart')}</p> </Card> )}
        </div>
    );
}

const ProjectDetailView: React.FC<{ project: Project }> = ({ project }) => {
    const { t, language } = useTranslation();
    const { updateProject, setSelectedProjectId, setNewTaskModalOpen, setNewTaskModalDate, updateTask, reorderOrMoveTask, setTaskEditModalOpen, setEditingTask, deepLinkTarget, setDeepLinkTarget, userProfile, inviteUserToProject, collapsedFolderIds, toggleFolderCollapse, isDrawingPadFullScreen, setViewingProfile, setCurrentView, currentUser, removeProjectMember, allUsers, addHubGroup, setToastNotification, setActiveHubView, userUsage, isFullScreenActive, setIsFullScreenActive, setMailDraft } = useContext(AppContext);
    const { joinMeeting } = useContext(CallContext);
    const { scheduleMeeting } = useContext(CallContext);
    
    const [activeSubView, setActiveSubView] = useState<ProjectSubView>('overview');
    const [isEditingProjectName, setIsEditingProjectName] = useState(false);
    const [newProjectName, setNewProjectName] = useState(project.name);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [isSubMenuCollapsed, setIsSubMenuCollapsed] = useState(false);
    
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editingFolderName, setEditingFolderName] = useState('');
    const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [isProjectMeetingModalOpen, setProjectMeetingModalOpen] = useState(false);
    const [pMeetingTitle, setPMeetingTitle] = useState('');
    const [pMeetingDate, setPMeetingDate] = useState('');
    const [pMeetingTime, setPMeetingTime] = useState('');
    const [pMeetingNotes, setPMeetingNotes] = useState('');
    const [isPMeetingSaving, setIsPMeetingSaving] = useState(false);

    const [isMobileSubMenuOpen, setMobileSubMenuOpen] = useState(false);
    const subMenuRef = useRef<HTMLElement>(null);
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
    const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
    const isOwner = currentUser?.uid === project.ownerId;

    useEffect(() => {
        const handleInteraction = (event: any) => {
            if (event.detail?.open !== undefined) {
                setMobileSubMenuOpen(event.detail.open);
            }
        };
        window.addEventListener('toggleSubmenu', handleInteraction);
        return () => window.removeEventListener('toggleSubmenu', handleInteraction);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { 
            /* Fix: Changed lowercase submenuRef to subMenuRef and lowered its z-index significantly to avoid fighting with modals */
            if (window.innerWidth < 1024 && subMenuRef.current && !subMenuRef.current.contains(event.target as Node)) { 
                setMobileSubMenuOpen(false); 
            } 
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (deepLinkTarget && typeof deepLinkTarget === 'object' && deepLinkTarget.view) {
            if (['notes', 'drawings', 'overview', 'info', 'tasks', 'documents', 'spreadsheet', 'financials', 'chat', 'crm'].includes(deepLinkTarget.view)) { setActiveSubView(deepLinkTarget.view as ProjectSubView); }
             if (deepLinkTarget.view === 'task') { const task = (project.folders || []).flatMap(f => f.tasks || []).find(t => t.id === deepLinkTarget.id); if (task) { setEditingTask(task); setTaskEditModalOpen(true); } }
            setDeepLinkTarget(null);
        }
    }, [deepLinkTarget, setDeepLinkTarget, project.folders]);

    const handleUpdateProjectName = () => { updateProject(project.id, { name: newProjectName }); setIsEditingProjectName(false); };
    const handleAddFolder = () => { if (!newFolderName.trim()) return; const newFolder: Folder = { id: `folder-${Date.now()}`, name: newFolderName, tasks: [] }; updateProject(project.id, { folders: [...(project.folders || []), newFolder] }); setNewFolderName(''); };
    const handleSaveFolderName = (folderId: string) => { if (!editingFolderName.trim()) return; const updatedFolders = (project.folders || []).map(f => f.id === folderId ? { ...f, name: editingFolderName } : f); updateProject(project.id, { folders: updatedFolders }); setEditingFolderId(null); setEditingFolderName(''); };
    const handleDeleteFolderConfirm = () => { if (!deletingFolderId) return; if (project.folders && project.folders.length <= 1) { alert("Debes tener al menos una carpeta."); setDeletingFolderId(null); return; } const updatedFolders = (project.folders || []).filter(f => f.id !== deletingFolderId); updateProject(project.id, { folders: updatedFolders }); setDeletingFolderId(null); };
    
    const handleInviteClick = () => { setIsInviteModalOpen(true); setInviteEmail(''); setSuggestedUsers([]); }
    
    const handleInviteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInviteEmail(val);
        if (val.length > 0) {
            const lowerVal = val.toLowerCase();
            const matches = allUsers.filter(u => 
                u.uid !== currentUser?.uid && 
                !project.memberIds.includes(u.uid) && 
                (u.name.toLowerCase().includes(lowerVal) || u.email.toLowerCase().includes(lowerVal))
            ).slice(0, 5);
            setSuggestedUsers(matches);
            setShowSuggestions(true);
        } else { setSuggestedUsers([]); setShowSuggestions(false); }
    };

    const handleSelectUser = (user: UserProfile) => { setInviteEmail(user.email); setShowSuggestions(false); };
    const handleSendInvite = () => { if (inviteEmail) { inviteUserToProject(project.id, inviteEmail); } setIsInviteModalOpen(false); setInviteEmail(''); setShowSuggestions(false); };
    const handleRemoveMember = async (uid: string) => { if(confirm("¿Seguro que deseas eliminar a este miembro del proyecto?")) { await removeProjectMember(project.id, uid); } }

    const handleOpenProjectMeeting = () => {
        setPMeetingTitle(`Reunión: ${project.name}`);
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30);
        setPMeetingDate(now.toISOString().split('T')[0]);
        setPMeetingTime(now.toTimeString().slice(0, 5));
        setProjectMeetingModalOpen(true);
    };

    const handleSaveProjectMeeting = async () => {
        if (!pMeetingDate || !pMeetingTime || !pMeetingTitle) return;
        setIsPMeetingSaving(true);
        try {
            const scheduledAt = `${pMeetingDate}T${pMeetingTime}:00`;
            const invitees = project.members.filter(m => m.uid !== currentUser?.uid);
            const link = await scheduleMeeting(pMeetingTitle, scheduledAt, invitees, pMeetingNotes);
            setToastNotification({ title: "Reunión Generada", message: "Se ha enviado la invitación a los miembros del proyecto.", icon: 'check' });
            setProjectMeetingModalOpen(false);
            setPMeetingNotes('');
        } catch (e) {
            setToastNotification({ title: "Error", message: "No se pudo agendar la reunión.", icon: "close" });
        } finally { setIsPMeetingSaving(false); }
    };

    const handleCreateGroupChat = async () => {
        if (project.hubGroupId) { setCurrentView('hub'); setActiveHubView('groups'); setDeepLinkTarget({ view: 'groups', id: project.hubGroupId }); window.location.hash = `hub/group/${project.hubGroupId}`; return; }
        if(confirm(`¿Crear un chat grupal para ${project.name}?`)) {
            try {
                const initialMembers = project.memberIds.filter(id => id !== currentUser?.uid);
                const newGroupId = await addHubGroup({ name: project.name, description: `Grupo de trabajo del proyecto ${project.name}`, isPrivate: true, icon: 'projects', tags: ['Proyecto'], }, initialMembers);
                await updateProject(project.id, { hubGroupId: newGroupId });
                setToastNotification({ title: "Grupo Creado", message: "El chat grupal ha sido creado en la Comunidad.", icon: "check" });
                setCurrentView('hub'); setActiveHubView('groups'); setDeepLinkTarget({ view: 'groups', id: newGroupId }); window.location.hash = `hub/group/${newGroupId}`;
            } catch (e) { console.error(e); setToastNotification({ title: "Error", message: "No se pudo crear el grupo.", icon: "close" }); }
        }
    }

    // FIX: Securizar flatMap en ProjectDetailView
    const allTasks = (project.folders || []).flatMap(folder => folder.tasks || []);
    const filteredTasks = selectedFolderId ? allTasks.filter(task => task.folderId === selectedFolderId) : allTasks;

    const navItems: { name: ProjectSubView; label: string; icon: React.ComponentProps<typeof Icon>['name'] }[] = [
        { name: 'overview', label: 'Resumen', icon: 'dashboard' },
        { name: 'info', label: 'Info del proyecto', icon: 'help' },
        { name: 'tasks', label: 'Tareas', icon: 'list' },
        { name: 'crm', label: 'Market CRM', icon: 'users' },
        { name: 'spreadsheet', label: 'Tablas', icon: 'table' },
        { name: 'documents', label: 'Documentos', icon: 'folder' },
        { name: 'notepad', label: 'Bloc de Notas', icon: 'notepad' },
        { name: 'drawingpad', label: 'Pizarra', icon: 'drawingpad' },
        { name: 'financials', label: 'Finanzas', icon: 'wallet' },
        { name: 'pos', label: 'Punto de Venta', icon: 'shopping-cart' },
        { name: 'loyalty', label: 'Fidelización', icon: 'star' },
        { name: 'chat', label: 'Chat IA del Proyecto', icon: 'ai' },
        { name: 'members', label: 'Miembros', icon: 'users' },
    ];

    const planConfig = getPlanConfig(userProfile.plan);
    const taskLimit = (planConfig.limits as any).active_tasks || 50;

    const renderSubView = () => {
        const [view, setView] = useState<'kanban' | 'list' | 'table' | 'calendar'>('kanban');
        switch (activeSubView) {
            case 'overview': return <ProjectOverview project={project} setActiveSubView={setActiveSubView} onTaskClick={(task) => {setEditingTask(task); setTaskEditModalOpen(true);}} />;
            case 'info': return <ProjectInfoView project={project} />;
            case 'crm': return <ProjectCrmView project={project} />;
            case 'tasks': return ( 
                <div> 
                    {/* VISUAL TASK VIEW SELECTOR - SLIM VERSION v12.5 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                        {[
                            { id: 'kanban', label: 'Kanban', icon: 'kanban' },
                            { id: 'list', label: 'Lista', icon: 'list' },
                            { id: 'table', label: 'Tabla', icon: 'table' },
                            { id: 'calendar', label: 'Agenda', icon: 'calendar' }
                        ].map(btn => {
                            const isActive = view === btn.id;
                            return (
                                <button
                                    key={btn.id}
                                    onClick={() => setView(btn.id as any)}
                                    className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-300 border-2 shadow-sm transform active:scale-95 ${isActive ? 'bg-brand-primary border-brand-primary text-white shadow-lg' : 'bg-white dark:bg-neutral-800 border-neutral-100 dark:border-neutral-700 text-neutral-400 hover:border-brand-primary/30'}`}
                                >
                                    <div className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isActive ? 'bg-white/20' : 'bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700'}`}>
                                        <Icon name={btn.icon as any} className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'}`} />
                                    </div>
                                    <span className={`text-[9px] font-black uppercase tracking-widest truncate ${isActive ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>{btn.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex justify-between items-center mb-2 px-1">
                        <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                            Tareas: {allTasks.length} de {taskLimit === 999999 ? '∞' : taskLimit} usadas
                        </div>
                    </div> 
                    {view === 'kanban' && <KanbanView tasks={filteredTasks} statuses={(project.statuses || []).map(s => s.name)} onUpdateTask={updateTask} onTaskClick={task => {setEditingTask(task); setTaskEditModalOpen(true);}} />} 
                    {view === 'list' && <ListView tasks={filteredTasks} onUpdateTask={updateTask} onTaskClick={task => {setEditingTask(task); setTaskEditModalOpen(true);}} />} 
                    {view === 'table' && <TableView project={project} tasks={filteredTasks} onUpdateTask={updateTask} onTaskClick={task => {setEditingTask(task); setTaskEditModalOpen(true);}} />} 
                    {view === 'calendar' && (
                        <div className="h-[600px] bg-white dark:bg-dark-surface rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                            <CalendarView 
                                tasks={filteredTasks} 
                                onTaskDateChange={(taskId, newDate) => { const task = allTasks.find(t=>t.id===taskId); if(task) updateTask({...task, date: newDate})}} 
                                onDayClick={(date) => { setNewTaskModalDate(date); setNewTaskModalOpen(true); }} 
                                onTaskClick={task => {setEditingTask(task); setTaskEditModalOpen(true);}} 
                            />
                        </div>
                    )} 
                </div> 
            );
            case 'spreadsheet': return <SpreadsheetView project={project} />;
            case 'documents': return <DocumentsView project={project} />;
            case 'notepad': return <Notepad project={project} />;
            case 'drawingpad': return <DrawingPad project={project} />;
            case 'financials': return <FinancialsView project={project} />;
            case 'pos': 
                return (
                    <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-neutral-900 rounded-3xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 shadow-sm">
                        <div className="relative mb-8">
                            <div className="w-24 h-24 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary animate-pulse">
                                <Icon name="shopping-cart" className="w-12 h-12" />
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-white dark:bg-neutral-800 rounded-full flex items-center justify-center border-4 border-neutral-50 dark:border-neutral-900 shadow-lg text-brand-primary">
                                <Icon name="loader" className="w-5 h-5 animate-spin" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-black text-neutral-900 dark:text-white mb-2 uppercase tracking-tighter">Abriendo Punto de Venta...</h2>
                        <p className="text-neutral-500 text-center max-w-sm mb-10 px-6 font-medium leading-relaxed">Estamos sincronizando el inventario y configurando la terminal en una nueva pestaña segura.</p>
                        <Button 
                            onClick={() => window.open(`/#/pos/${project.id}`, '_blank')}
                            className="bg-brand-primary text-white font-black uppercase tracking-widest px-12 py-5 rounded-2xl shadow-2xl shadow-brand-primary/40 hover:scale-[1.02] transform transition-all flex items-center gap-3 active:scale-95"
                        >
                            <Icon name="rocket" className="w-6 h-6" /> Forzar Reapertura
                        </Button>
                        <div className="mt-8 flex items-center gap-2 text-neutral-400 text-[10px] font-black uppercase tracking-[0.2em]">
                            <Icon name="shield" className="w-3 h-3" /> Conexión Segura Goatify
                        </div>
                    </div>
                );
            case 'loyalty': return <LoyaltySettingsView project={project} />;
            case 'chat': return <ProjectChat project={project} />;
            case 'members': 
                return (
                     <Card>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                            <h2 className="text-2xl font-bold">Miembros del Proyecto</h2>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button onClick={handleCreateGroupChat} className={`flex items-center gap-2 p-3 rounded-xl border border-brand-primary text-brand-primary font-bold ${project.hubGroupId ? "bg-brand-primary/10" : "bg-transparent"}`}>
                                    <Icon name={project.hubGroupId ? "message" : "hub"} className="w-4 h-4" /> 
                                    {project.hubGroupId ? "Ir al chat" : "Chat Grupal"}
                                </button>
                                <button onClick={handleOpenProjectMeeting} className="flex items-center gap-2 p-3 rounded-xl border border-brand-primary text-brand-primary font-bold bg-transparent">
                                    <Icon name="video" className="w-4 h-4" /> 
                                    Reunión
                                </button>
                                <Button onClick={handleInviteClick} className="flex-1 sm:flex-none"><Icon name="plus" className="w-4 h-4" /> Invitar</Button>
                            </div>
                        </div>
                        <ul className="space-y-4">
                            {(project.members || []).map(member => (
                                <li key={member.uid} className="flex items-center justify-between p-3 bg-light-bg dark:bg-dark-bg rounded-lg group">
                                    <div className="flex items-center gap-3">
                                        <img src={member.avatarUrl || `https://ui-avatars.com/api/?name=${(member.name || 'User').replace(' ', '+')}`} alt={member.name || 'Usuario'} className="w-10 h-10 rounded-full" />
                                        <div>
                                            <p className="font-semibold flex items-center gap-2">
                                                {member.name || 'Sin nombre'}
                                                {member.uid === project.ownerId && <span className="text-[10px] bg-brand-primary text-white px-2 py-0.5 rounded-full">Owner</span>}
                                            </p>
                                            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{member.headline || member.email}</p>
                                        </div>
                                    </div>
                                    {isOwner && member.uid !== project.ownerId && (
                                        <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveMember(member.uid)} title="Eliminar del Proyecto">
                                            <Icon name="trash" className="w-4 h-4"/>
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                     </Card>
                );
            default: return <div>Selecciona una vista</div>;
        }
    };

    return (
         <div className={`h-full flex flex-col ${isFullScreenActive ? 'fixed inset-0 z-[9999] bg-light-bg dark:bg-dark-bg px-4 md:px-6 lg:px-8 py-1 overflow-hidden' : ''}`}>
            {deletingFolderId && ( <Modal isOpen={!!deletingFolderId} onClose={() => setDeletingFolderId(null)} title="Eliminar Carpeta"><p>¿Estás seguro de que quieres eliminar esta carpeta y todas sus tareas? Esta acción se puede deshacer.</p><div className="flex justify-end gap-2 mt-4"><Button variant="secondary" onClick={() => setDeletingFolderId(null)}>Cancelar</Button><Button onClick={handleDeleteFolderConfirm} className="bg-red-50 hover:bg-red-600">Eliminar</Button></div></Modal> )}
             
             <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Invitar Colaborador">
                 <div className="space-y-4 relative">
                     <p>Ingresa el nombre o email del usuario que quieres invitar.</p>
                     <div className="relative">
                         <Input type="text" placeholder="Buscar por nombre o email..." value={inviteEmail} onChange={handleInviteInputChange} onFocus={() => inviteEmail && setShowSuggestions(true)} />
                         {showSuggestions && suggestedUsers.length > 0 && (
                             <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                 {suggestedUsers.map(user => (
                                     <div key={user.uid} className="p-2 flex items-center gap-3 hover:bg-light-bg dark:hover:bg-dark-bg cursor-pointer" onClick={() => handleSelectUser(user)}>
                                         <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} className="w-8 h-8 rounded-full" alt={user.name}/>
                                         <div><p className="text-sm font-bold">{user.name}</p><p className="text-xs text-neutral-500">{user.email}</p></div>
                                     </div>
                                 ))}
                             </div>
                         )}
                     </div>
                     <div className="flex justify-end"><Button onClick={handleSendInvite}>Invitar</Button></div>
                 </div>
             </Modal>

             <Modal isOpen={isProjectMeetingModalOpen} onClose={() => setProjectMeetingModalOpen(false)} title="Agendar Reunión de Proyecto">
                <div className="space-y-4">
                    <div><label className="text-xs font-bold uppercase text-neutral-500 mb-1 block">Título del evento</label><Input value={pMeetingTitle} onChange={e => setPMeetingTitle(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold uppercase text-neutral-500 mb-1 block">Fecha</label><Input type="date" value={pMeetingDate} onChange={e => setPMeetingDate(e.target.value)} /></div>
                        <div><label className="text-xs font-bold uppercase text-neutral-500 mb-1 block">Hora</label><Input type="time" value={pMeetingTime} onChange={e => setPMeetingTime(e.target.value)} /></div>
                    </div>
                    <div><label className="text-xs font-bold uppercase text-neutral-500 mb-1 block">Notas de agenda</label><Textarea value={pMeetingNotes} onChange={e => setPMeetingNotes(e.target.value)} placeholder="Ej: Revisión de sprints y demo técnica..." rows={3} /></div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                        <Button variant="secondary" onClick={() => setProjectMeetingModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveProjectMeeting} disabled={!pMeetingDate || !pMeetingTime || isPMeetingSaving} className="px-8 shadow-xl">
                            {isPMeetingSaving ? <Spinner className="w-4 h-4 text-white" /> : "Generar Link e Invitar"}
                        </Button>
                    </div>
                </div>
             </Modal>

            {!isDrawingPadFullScreen && (
              <header className={`flex-shrink-0 ${isFullScreenActive ? 'mb-0 pt-0' : 'mb-1 pt-[env(safe-area-inset-top)]'}`}>
                  <div className={`flex justify-between items-center ${isFullScreenActive ? 'mb-0' : 'mb-1'}`}>
                      <button onClick={() => { setSelectedProjectId(null); setIsFullScreenActive(false); }} className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-brand-primary font-semibold">&larr; {t('projects')}</button>
                      <div className="flex items-center gap-2">
                          {isFullScreenActive ? (
                              <Button variant="secondary" onClick={() => setIsFullScreenActive(false)}>
                                  <Icon name="close" className="w-4 h-4 mr-1"/> Regresar
                              </Button>
                          ) : (
                              <Button variant="secondary" onClick={() => setIsFullScreenActive(true)} title="Pantalla Completa">
                                  <Icon name="expand" className="w-4 h-4"/>
                              </Button>
                          )}
                          <Button onClick={() => setNewTaskModalOpen(true)}><Icon name="plus" className="w-4 h-4"/>{t('newTask')}</Button>
                      </div>
                  </div>
                  <div className="flex items-center gap-2">{isEditingProjectName ? ( <div className="flex items-center gap-2"><Input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUpdateProjectName()} className="text-3xl font-bold" autoFocus /><Button size="sm" onClick={handleUpdateProjectName}>Guardar</Button></div> ) : ( <div className="flex items-center gap-2"><h1 className="text-3xl font-bold">{project.name}</h1><button onClick={() => setIsEditingProjectName(true)}><Icon name="edit" className="w-5 h-5"/></button></div> )}</div>
                   <div className={`flex items-center gap-2 ${isFullScreenActive ? 'mt-0' : 'mt-1'}`}>{(project.members || []).slice(0, 5).map((member, index) => ( <img key={member.uid} src={member.avatarUrl || `https://ui-avatars.com/api/?name=${(member.name || 'User').replace(' ', '+')}`} alt={member.name || 'User'} title={member.name || 'User'} className={`w-8 h-8 rounded-full border-2 border-light-surface dark:border-dark-surface ${index > 0 ? '-ml-2' : ''} cursor-pointer`} onClick={() => { setViewingProfile(member); setCurrentView('profile'); window.location.hash = 'profile'; }} /> ))}{project.members && project.members.length > 5 && <div className="w-8 h-8 rounded-full bg-light-bg dark:bg-dark-bg flex items-center justify-center text-xs font-bold -ml-2 border-2 border-light-surface dark:border-dark-surface">+{project.members.length - 5}</div>}
                   <button onClick={handleInviteClick} className="w-8 h-8 rounded-full bg-brand-accent/50 text-brand-primary flex items-center justify-center text-lg font-bold border-2 border-light-surface dark:border-dark-surface hover:bg-brand-accent" title="Invitar a colaborar">+</button>
                   <button 
                     onClick={() => {
                       const emails = (project.members || []).map(m => m.email).filter(e => !!e).join(', ');
                       if (!emails) {
                         setToastNotification({title:"Sin correos", message:"Nadie en el proyecto tiene correo configurado", icon:"info"});
                         return;
                       }
                       setMailDraft({
                         to: emails,
                         subject: `Actualización General: ${project.name}`,
                         htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 30px 10px; background-color: #f3f4f6;">
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
        <div style="background-color: #f8fafc; padding: 40px 20px; text-align: center; border-bottom: 2px solid #e2e8f0;">
                                   <h1 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">${project.name}</h1>
                                   <p style="color: #64748b; margin: 10px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Comunicado Interno</p>
                               </div>
                               <div style="padding: 40px 20px;">
                                   <p style="font-size: 16px; color: #1e293b; font-weight: 700; margin: 0 0 15px 0;">Hola equipo,</p>
                                   <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 35px 0;">A continuación les comparto los detalles más recientes y actualizaciones del proyecto:</p>
                                   
                                   <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #10b981; padding: 25px 20px; margin-bottom: 40px;">
                                       <p style="color: #0f172a; font-size: 15px; line-height: 1.6; margin: 0; font-style: italic;">[Elimina este texto y escribe tu mensaje específico aquí. Utiliza este espacio para detallar avances, bloqueos o nuevos hitos.]</p>
                                   </div>
                                   
                                   <div style="text-align: center;">
                                       <a href="https://ia.goatify.app/" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #0f172a; color: #ffffff; padding: 18px 20px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Ingresar a Goatify</a>
                                   </div>
                               </div>
                               <div style="background-color: #f1f5f9; padding: 25px 20px; text-align: center;">
                                   <p style="margin: 0; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Sistema de Operaciones Integradas Goatify</p>
                               </div>
                           </div>
</body>
</html>
                         `
                       });
                       setCurrentView('mail');
                     }}
                     className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center border-2 border-brand-primary hover:bg-brand-primary/20 shadow-sm transition-all"
                     title="Notificar a todos los miembros por correo"
                   >
                     <Icon name="mail" className="w-4 h-4"/>
                   </button>
                   <button onClick={() => setIsSubMenuCollapsed(prev => !prev)} className="p-1 rounded-md hover:bg-light-border dark:hover:bg-dark-border hidden lg:block" title="Plegar panel"><Icon name="kanban" className={`w-4 h-4 transition-transform duration-300 ${isSubMenuCollapsed ? 'transform -rotate-180' : ''}`}/></button><button onClick={() => setMobileSubMenuOpen(o => !o)} className="p-2 rounded-md hover:bg-light-border dark:border-dark-border lg:hidden" title="Toggle menu"><Icon name="hamburger" className="w-5 h-5"/></button></div>
              </header>
            )}
            
            <div className={`flex-1 flex flex-col lg:flex-row ${isFullScreenActive ? 'gap-2' : 'gap-6'} overflow-hidden ${activeSubView === 'crm' ? 'pt-0' : ''}`}>
                {!isDrawingPadFullScreen && (
                    <>
                        <div className={`fixed inset-0 bg-black/50 z-[590] lg:hidden transition-opacity ${isMobileSubMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setMobileSubMenuOpen(false)}></div>
                        <nav ref={subMenuRef} className={`flex-shrink-0 overflow-y-auto pr-4 transition-all duration-300 z-[600] bg-light-surface dark:bg-dark-surface lg:bg-transparent lg:dark:bg-transparent lg:relative absolute lg:translate-x-0 h-full top-0 left-0 p-4 lg:p-0 ${isSubMenuCollapsed ? 'lg:w-16' : 'lg:w-56'} ${isMobileSubMenuOpen ? 'translate-x-0' : '-translate-x-full'} pt-[calc(env(safe-area-inset-top)+1rem)]`}>
                            <ul className="space-y-1">{navItems.map(item => ( 
                                <li key={item.name}>
                                    <a 
                                        href={`#projects/${project.id}/${item.name}`} 
                                        onClick={(e) => {
                                            if (e.metaKey || e.ctrlKey || e.shiftKey || (e as any).button !== 0) return;
                                            e.preventDefault();
                                            if (item.name === 'pos') {
                                                window.open(`/#/pos/${project.id}`, '_blank');
                                            }
                                            setActiveSubView(item.name); 
                                            if (window.innerWidth < 1024) setMobileSubMenuOpen(false);
                                        }} 
                                        title={item.label} 
                                        className={`w-full flex items-center gap-3 p-2 rounded-lg text-left font-semibold ${activeSubView === item.name ? 'bg-brand-accent/20 text-brand-primary' : 'hover:bg-light-bg dark:hover:bg-dark-bg'}`}
                                    >
                                        <Icon name={item.icon} className="w-5 h-5 flex-shrink-0"/>
                                        <span className={`transition-opacity duration-200 ${isSubMenuCollapsed ? 'lg:opacity-0 lg:hidden' : ''}`}>{item.label}</span>
                                    </a>
                                </li> 
                            ))}</ul>
                            <div className={`mt-6 pt-3 border-t border-light-border dark:border-dark-border ${isSubMenuCollapsed ? 'lg:border-t-0' : ''}`}>
                                <h3 className={`font-bold mb-2 text-sm uppercase text-light-text-secondary dark:text-dark-text-secondary ${isSubMenuCollapsed ? 'lg:hidden' : ''}`}>{t('folder')}s</h3>
                                <ul className="space-y-1">
                                    <li onDragOver={(e) => { e.preventDefault(); setDragOverFolderId('all'); }} onDragLeave={() => setDragOverFolderId(null)} onDrop={(e) => { e.preventDefault(); setDragOverFolderId(null); setSelectedFolderId(null);}} ><button onClick={() => setSelectedFolderId(null)} className={`w-full flex items-center gap-3 p-2 rounded-lg text-left text-sm font-medium transition-colors duration-300 ${selectedFolderId === null ? 'bg-light-bg dark:bg-dark-bg font-bold' : 'hover:bg-light-bg dark:hover:bg-dark-bg'} ${dragOverFolderId === 'all' ? 'bg-brand-accent/20' : ''}`}><Icon name="folder" className="w-5 h-5 flex-shrink-0"/><span className={`transition-opacity duration-200 ${isSubMenuCollapsed ? 'lg:opacity-0 lg:hidden' : ''}`}>{t('allFolders')}</span></button></li>
                                    {(project.folders || []).map(folder => ( <li key={folder.id}><div onDragOver={(e) => { e.preventDefault(); setDragOverFolderId(folder.id); }} onDragLeave={() => setDragOverFolderId(null)} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const taskId = e.dataTransfer.getData("itemId"); const itemType = e.dataTransfer.getData("itemType"); if (itemType === "task" && taskId) reorderOrMoveTask(taskId, null, folder.id, project.id); setDragOverFolderId(null); }} className={`group w-full flex items-center justify-between p-2 rounded-lg text-left text-sm font-medium transition-colors duration-300 ${selectedFolderId === folder.id ? 'bg-light-bg dark:bg-dark-bg font-bold' : 'hover:bg-light-bg dark:hover:bg-dark-bg'} ${dragOverFolderId === folder.id ? 'bg-brand-accent/20' : ''}`}><div className="flex items-center gap-1 flex-grow overflow-hidden"><button onClick={() => toggleFolderCollapse(folder.id)} className="p-1 flex-shrink-0"><Icon name="chevronDown" className={`w-4 h-4 transition-transform ${collapsedFolderIds.includes(folder.id) ? '-rotate-90' : ''}`}/></button>{editingFolderId === folder.id ? ( <Input value={editingFolderName} onChange={e => setEditingFolderName(e.target.value)} onBlur={() => handleSaveFolderName(folder.id)} onKeyDown={e => e.key === 'Enter' && handleSaveFolderName(folder.id)} autoFocus className="!mt-0 text-sm"/> ) : ( <span onClick={() => setSelectedFolderId(folder.id)} className={`flex-grow truncate cursor-pointer transition-opacity duration-200 ${isSubMenuCollapsed ? 'lg:opacity-0 lg:hidden' : ''}`}>{folder.name}</span> )}</div><div className={`opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0 ${isSubMenuCollapsed ? 'lg:hidden' : ''}`}><button onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditingFolderName(folder.name);}}><Icon name="edit" className="w-4 h-4"/></button><button onClick={(e) => { e.stopPropagation(); setDeletingFolderId(folder.id)}}><Icon name="trash" className="w-4 h-4 text-red-500"/></button></div></div>{!collapsedFolderIds.includes(folder.id) && ( <ul className={`pl-8 transition-all duration-300 overflow-hidden ${isSubMenuCollapsed ? 'lg:hidden' : ''}`}>{(folder.tasks || []).map(task => ( <li key={task.id} draggable onDragStart={(e) => { e.dataTransfer.setData("itemId", task.id); e.dataTransfer.setData("itemType", "task"); }} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverTaskId(task.id); }} onDragLeave={() => setDragOverTaskId(null)} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const draggedTaskId = e.dataTransfer.getData("itemId"); const itemType = e.dataTransfer.getData("itemType"); if (itemType === "task" && draggedTaskId && draggedTaskId !== task.id) { reorderOrMoveTask(draggedTaskId, task.id, folder.id, project.id); } setDragOverTaskId(null); }} onClick={() => {setEditingTask(task); setTaskEditModalOpen(true);}} title={task.title} className={`relative text-xs py-1.5 flex items-center gap-2 text-light-text-secondary dark:text-dark-text-secondary truncate cursor-pointer hover:text-brand-primary transition-all duration-300 ${dragOverTaskId === task.id ? 'pt-4' : ''}`}><div className={`absolute top-0 left-0 w-full h-0.5 bg-brand-primary rounded-full transition-all duration-300 ${dragOverTaskId === task.id ? 'opacity-100' : 'opacity-0'}`} /><span className={`w-2 h-2 rounded-full flex-shrink-0 ${task.status === 'Hecho' ? 'bg-green-500' : 'bg-yellow-500'}`}></span><span className="truncate">{task.title}</span></li>))}{(!folder.tasks || folder.tasks.length === 0) && <li className="text-xs py-1.5 text-neutral-400 italic">No hay tareas</li>}</ul> )}</li> ))}
                                </ul>
                                <div className={`mt-2 flex items-center gap-2 ${isSubMenuCollapsed ? 'lg:hidden' : ''}`}><Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddFolder()} placeholder="Nueva carpeta..." className="text-sm !mt-0" /><Button onClick={handleAddFolder} size="sm" variant="ghost" className="!p-1.5"><Icon name="plus" className="w-5 h-5"/></Button></div>
                            </div>
                        </nav>
                    </>
                )}
                <main className={`flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] ${activeSubView === 'crm' ? 'pt-0' : ''}`}>{renderSubView()}</main>
            </div>
        </div>
    );
}

const Projects: React.FC = () => { const { selectedProjectId, projects } = useContext(AppContext); const currentProject = projects.find(p => p.id === selectedProjectId); return ( <div className="h-full"> {selectedProjectId && currentProject ? ( <ErrorBoundary> <ProjectDetailView project={currentProject} /> </ErrorBoundary> ) : ( <AllProjectsView /> )} </div> ); };
export default Projects;