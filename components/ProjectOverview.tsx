
import React, { useContext, useState, useEffect, useMemo } from 'react';
import type { Project, Document, Task, ProjectSubView, CallSession, ProjectClient } from '../types';
import { TaskStatus } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import Card from './ui/Card';
import Icon from './Icon';
import { AppContext } from '../context/AppContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface ProjectOverviewProps {
    project: Project;
    setActiveSubView: (view: ProjectSubView) => void;
    onTaskClick: (task: Task) => void;
}

const SummaryStatCard: React.FC<{ title: string; value: string | number; subtitle: string; icon: React.ComponentProps<typeof Icon>['name']; onClick?: () => void; color: string }> = ({ title, value, subtitle, icon, onClick, color }) => (
    <div 
        onClick={onClick} 
        className={`relative overflow-hidden bg-white dark:bg-dark-surface rounded-2xl p-5 shadow-sm border border-neutral-100 dark:border-neutral-800 transition-all duration-300 group ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-1' : ''}`}
    >
        <div className={`absolute top-0 right-0 p-3 opacity-10 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform`}>
             <Icon name={icon} className={`w-16 h-16 ${color}`} />
        </div>
        
        <div className="relative z-10">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color.replace('text-', 'bg-').replace('600', '100').replace('500', '100').replace('400', '100') + ' dark:bg-opacity-20'}`}>
                <Icon name={icon} className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-3xl font-extrabold text-neutral-800 dark:text-white tracking-tight mb-1">{value}</p>
            <h4 className="text-sm font-bold text-neutral-700 dark:text-neutral-300">{title}</h4>
            <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>
        </div>
    </div>
);

const ActivityItem: React.FC<{ icon: React.ComponentProps<typeof Icon>['name']; text: React.ReactNode; date: string }> = ({ icon, text, date }) => (
    <div className="flex items-start gap-4 py-3 group border-b border-neutral-50 dark:border-neutral-800 last:border-0">
        <div className="mt-1 p-2 rounded-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 group-hover:bg-brand-accent/5 transition-colors shadow-sm">
            <Icon name={icon} className="w-4 h-4 text-neutral-500 group-hover:text-brand-primary transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{text}</p>
            <p className="text-[10px] text-neutral-400 mt-1 font-medium uppercase tracking-wider">{new Date(date).toLocaleString()}</p>
        </div>
    </div>
);

const QuickAccessCard: React.FC<{ title: string; description: string; icon: React.ComponentProps<typeof Icon>['name']; onClick: () => void; colorClass: string }> = ({ title, description, icon, onClick, colorClass }) => (
    <button onClick={onClick} className={`flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800 hover:border-${colorClass.split('-')[1]}-200 dark:hover:border-${colorClass.split('-')[1]}-800 transition-all shadow-sm hover:shadow-md text-left w-full group relative overflow-hidden`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass.replace('text-', 'bg-').replace('600', '100').replace('500', '100') + ' dark:bg-opacity-20'} group-hover:scale-110 transition-transform`}>
            <Icon name={icon} className={`w-6 h-6 ${colorClass}`} />
        </div>
        <div>
            <h4 className="font-bold text-base text-neutral-800 dark:text-white">{title}</h4>
            <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
        </div>
        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
             <Icon name="chevronLeft" className="w-5 h-5 text-neutral-300 rotate-180" />
        </div>
    </button>
);

const ProjectOverview: React.FC<ProjectOverviewProps> = ({ project, setActiveSubView, onTaskClick }) => {
    const { t } = useTranslation();
    const { activityLog, setEditingTask, setTaskEditModalOpen, currentUser, setMeetsInfoOpen } = useContext(AppContext);
    const [projectMeetings, setProjectMeetings] = useState<CallSession[]>([]);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "calls"), 
            where("participants", "array-contains", currentUser.uid), 
            where("isMeeting", "==", true)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allMeetings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallSession));
            const filtered = allMeetings.filter(m => 
                (m.projectId === project.id || (m.title && m.title.toLowerCase().includes(project.name.toLowerCase()))) &&
                (m.status === 'scheduled' || m.status === 'active')
            );
            setProjectMeetings(filtered);
        });
        return () => unsubscribe();
    }, [currentUser, project.id, project.name]);

    const allTasks = (project.folders || []).flatMap(f => f.tasks || []);
    const tasksToDo = allTasks.filter(t => t.status === TaskStatus.TODO).length;
    const tasksCompleted = allTasks.filter(t => t.status === TaskStatus.DONE).length;
    const tasksInProgress = allTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length;
    
    const upcomingTasks = allTasks
        .filter(t => t && t.status !== TaskStatus.DONE)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 5);

    const projectClients = useMemo(() => {
        return (project.clients || []).filter(c => c.status !== 'Ganado' && c.status !== 'Perdido').slice(0, 5);
    }, [project.clients]);

    const recentActivitiesForProject = (activityLog || [])
        .filter(log => log.projectId === project.id)
        .slice(0, 5);
    
    const iconMap: Record<string, React.ComponentProps<typeof Icon>['name']> = {
        task_done: 'check',
        doc_added: 'folder',
        note_added: 'notepad',
        project_created: 'projects',
    };

    const latestNote = (project.notes || []).length > 0 ? project.notes[0] : null;
    const spreadsheetCount = (project.spreadsheets || []).length || (project.spreadsheetData ? 1 : 0);

    return (
        <div className="space-y-8 pb-8 max-w-7xl mx-auto">
            {/* Header Stats */}
            <div 
                onClick={() => setMeetsInfoOpen(true)}
                className="bg-gradient-to-r from-brand-primary/10 to-indigo-900/10 p-3 rounded-2xl border border-brand-primary/20 flex items-center justify-between cursor-pointer hover:bg-brand-primary/20 transition-all mb-4"
            >
                <div className="flex items-center gap-2">
                    <Icon name="video" className="w-5 h-5 text-brand-primary"/>
                    <p className="text-xs font-black text-brand-primary uppercase italic">Goatify Meets: Descubre el video Premium</p>
                </div>
                <Icon name="arrowRight" className="w-4 h-4 text-brand-primary"/>
            </div>

            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="font-bold text-lg text-neutral-800 dark:text-white flex items-center gap-2">
                        <Icon name="dashboard" className="w-5 h-5 text-brand-primary"/> Resumen Ejecutivo
                    </h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryStatCard 
                        title="Por Hacer" 
                        value={tasksToDo} 
                        subtitle="Tareas pendientes"
                        icon="list" 
                        onClick={() => setActiveSubView('tasks')} 
                        color="text-amber-500"
                    />
                    <SummaryStatCard 
                        title="En Progreso" 
                        value={tasksInProgress} 
                        subtitle="Actualmente activas"
                        icon="kanban" 
                        onClick={() => setActiveSubView('tasks')} 
                        color="text-blue-500"
                    />
                    <SummaryStatCard 
                        title="Completadas" 
                        value={tasksCompleted} 
                        subtitle="Total finalizadas"
                        icon="check" 
                        onClick={() => setActiveSubView('tasks')} 
                        color="text-green-500"
                    />
                    <SummaryStatCard 
                        title="Documentos" 
                        value={(project.documents || []).length} 
                        subtitle="Archivos almacenados"
                        icon="folder" 
                        onClick={() => setActiveSubView('documents')} 
                        color="text-purple-500"
                    />
                </div>
            </div>
            
            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Meetings & Tools */}
                <div className="space-y-6">
                    <div>
                        <h3 className="font-bold text-lg mb-4 px-1 text-neutral-800 dark:text-white flex items-center gap-2">
                            <Icon name="video" className="w-5 h-5 text-brand-primary"/> Próximas Reuniones
                        </h3>
                        <div className="space-y-3">
                            {projectMeetings.length > 0 ? projectMeetings.map(meeting => (
                                <div key={meeting.id} className={`bg-white dark:bg-dark-surface p-4 rounded-2xl border ${meeting.status === 'active' ? 'border-green-500 ring-1 ring-green-500/20' : 'border-neutral-100 dark:border-neutral-800'} shadow-sm flex items-center justify-between group`}>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-sm truncate">{meeting.title}</p>
                                            <span className={`text-[8px] px-1 rounded uppercase font-black ${meeting.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-neutral-100 text-neutral-500'}`}>
                                                {meeting.status === 'active' ? 'En Vivo' : 'Programada'}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-brand-primary font-black uppercase tracking-wider mt-1">{new Date(meeting.scheduledAt!).toLocaleString([], { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
                                        <p className="text-[8px] text-neutral-400 font-bold uppercase mt-0.5">{meeting.isPrivate ? '🔒 Privada' : '🌐 Pública'} • {meeting.durationMinutes || 30} MIN</p>
                                    </div>
                                    <button onClick={() => window.open(`/#/calls/${meeting.id}`, '_blank')} className={`p-2 ${meeting.status === 'active' ? 'bg-green-600 animate-pulse' : 'bg-brand-primary'} text-white rounded-xl shadow-lg hover:scale-105 transition-transform`}><Icon name="video" className="w-4 h-4"/></button>
                                </div>
                            )) : (
                                <div className="p-4 text-center bg-neutral-50 dark:bg-neutral-800/30 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-700 text-xs text-neutral-400">
                                    No hay reuniones programadas para este proyecto.
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-bold text-lg mb-4 px-1 text-neutral-800 dark:text-white flex items-center gap-2">
                            <Icon name="grid" className="w-5 h-5 text-brand-primary"/> Herramientas
                        </h3>
                        <div className="space-y-3">
                            <QuickAccessCard 
                                title="Bloc de Notas"
                                description={latestNote ? `Última: ${latestNote.title}` : "Gestión de notas y textos"}
                                icon="notepad"
                                onClick={() => setActiveSubView('notepad')}
                                colorClass="text-amber-500"
                            />
                            <QuickAccessCard 
                                title="Tablas de Datos"
                                description={`${spreadsheetCount} tabla(s) para datos estructurados`}
                                icon="table"
                                onClick={() => setActiveSubView('spreadsheet')}
                                colorClass="text-emerald-500"
                            />
                            <QuickAccessCard 
                                title="Pizarra Visual"
                                description={`${(project.drawings || []).length} dibujo(s) y diagramas`}
                                icon="drawingpad"
                                onClick={() => setActiveSubView('drawingpad')}
                                colorClass="text-indigo-500"
                            />
                             <QuickAccessCard 
                                title="Finanzas"
                                description="Control de ingresos y gastos"
                                icon="wallet"
                                onClick={() => setActiveSubView('financials')}
                                colorClass="text-rose-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Right Column: Tasks & CRM */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Tasks Section */}
                        <Card className="flex flex-col overflow-hidden border border-neutral-100 dark:border-neutral-800 shadow-sm !rounded-2xl !p-0 h-full min-h-[400px]">
                            <div className="p-5 border-b border-neutral-50 dark:border-neutral-800 bg-white dark:bg-dark-surface flex justify-between items-center">
                                <h3 className="font-bold text-lg">Próximas Tareas</h3>
                                <span className="text-xs font-bold bg-neutral-100 dark:border-neutral-800 px-2 py-1 rounded-full text-neutral-500">{upcomingTasks.length}</span>
                            </div>
                            <div className="flex-1 p-2 bg-neutral-50/30 dark:bg-neutral-900/10 overflow-y-auto custom-scrollbar h-[350px]">
                                {upcomingTasks.length > 0 ? upcomingTasks.map(task => (
                                    <div key={task.id} onClick={() => onTaskClick(task)} className="p-3 mb-2 bg-white dark:bg-dark-surface rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm hover:shadow-md cursor-pointer transition-all flex justify-between items-center group">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`w-2 h-8 rounded-full ${task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-500' : 'bg-amber-500'}`}></div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm truncate group-hover:text-brand-primary transition-colors">{task.title}</p>
                                                <p className="text-[10px] text-neutral-400 font-medium">{new Date(task.date).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <Icon name="arrowRight" className="w-4 h-4 text-neutral-300 opacity-0 group-hover:opacity-100 transition-all"/>
                                    </div>
                                )) : (
                                    <div className="flex flex-col items-center justify-center h-full opacity-40">
                                        <Icon name="check" className="w-12 h-12 mb-2"/>
                                        <p className="text-xs font-bold uppercase tracking-widest">Todo al día</p>
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* Recent Activity Section */}
                        <Card className="flex flex-col overflow-hidden border border-neutral-100 dark:border-neutral-800 shadow-sm !rounded-2xl !p-0 h-full min-h-[400px]">
                            <div className="p-5 border-b border-neutral-50 dark:border-neutral-800 bg-white dark:bg-dark-surface flex justify-between items-center">
                                <h3 className="font-bold text-lg">Actividad Reciente</h3>
                            </div>
                            <div className="flex-1 p-5 bg-white dark:bg-dark-surface overflow-y-auto custom-scrollbar h-[350px]">
                                {recentActivitiesForProject.length > 0 ? recentActivitiesForProject.map(activity => (
                                    <ActivityItem 
                                        key={activity.id}
                                        icon={iconMap[activity.type] || 'bell'}
                                        text={activity.text}
                                        date={activity.date}
                                    />
                                )) : (
                                    <div className="flex flex-col items-center justify-center h-full opacity-40">
                                        <Icon name="history" className="w-12 h-12 mb-2"/>
                                        <p className="text-xs font-bold uppercase tracking-widest">Sin actividad reciente</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                    
                    {/* CRM Leads Section if any */}
                    {projectClients.length > 0 && (
                        <Card className="mt-6 border border-neutral-100 dark:border-neutral-800 shadow-sm !rounded-2xl overflow-hidden !p-0">
                            <div className="p-5 border-b border-neutral-50 dark:border-neutral-800 bg-white dark:bg-dark-surface flex justify-between items-center">
                                <h3 className="font-bold text-lg">Prospectos Activos (CRM)</h3>
                                <button onClick={() => setActiveSubView('crm')} className="text-xs font-bold text-brand-primary hover:underline">Gestionar Pipeline</button>
                            </div>
                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                {projectClients.map(client => (
                                    <div key={client.id} className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                        <p className="font-bold text-xs truncate">{client.name}</p>
                                        <p className="text-[10px] text-brand-primary font-black mt-1">${client.value.toLocaleString()}</p>
                                        <p className="text-[8px] text-neutral-400 uppercase mt-0.5">{client.status}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectOverview;
