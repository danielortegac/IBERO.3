
import React, { useState, useContext } from 'react';
import type { Task, ProjectStatus } from '../types';
import Card from './ui/Card';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';

interface KanbanViewProps {
    tasks: Task[];
    statuses: string[];
    onUpdateTask: (task: Task) => void;
    onTaskClick: (task: Task) => void;
}

const TaskCard: React.FC<{ 
    task: Task; 
    onDragStart: (e: React.DragEvent<HTMLDivElement>, taskId: string) => void;
    onClick: () => void;
}> = ({ task, onDragStart, onClick }) => {
    const [isDragging, setIsDragging] = useState(false);
    const { projects, setMailDraft, setCurrentView, setToastNotification } = useContext(AppContext);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        setIsDragging(true);
        onDragStart(e, task.id);
        e.stopPropagation();
    };

    const handleDragEnd = () => {
        setIsDragging(false);
    };
    
    const project = projects.find(p => p.id === task.projectId);
    const assignees = task.assignedTo?.map(uid => project?.members.find(m => m.uid === uid)).filter(Boolean) || [];

    const isOverdue = new Date(task.date) < new Date() && !['Done', 'Terminada', 'Completada', 'Completado', 'Finalizada'].includes(task.status);

    const handleNudge = (e: React.MouseEvent) => {
        e.stopPropagation();
        const emails = assignees.map(a => a?.email).filter(Boolean).join(', ');
        if (!emails) {
            setToastNotification({title:"Sin Asignados", message:"No hay correos de responsables para esta tarea", icon:"info"});
            return;
        }
        setMailDraft({
            to: emails,
            subject: `Recordatorio de Tarea: ${task.title}`,
            htmlBody: `
                <div style="background:#FEF2F2;border-left:4px solid #EF4444;padding:20px;border-radius:12px;margin-bottom:20px;">
                    <h2 style="margin:0;color:#991B1B;font-size:20px;">Recordatorio de Pendiente</h2>
                    <p style="margin:5px 0 0;color:#B91C1C;font-size:14px;font-weight:bold;">Vencimiento: ${new Date(task.date).toLocaleDateString()}</p>
                </div>
                <p style="color:#374151;">Hola equipo,</p>
                <p style="color:#374151;">Les recordamos que la tarea <strong>${task.title}</strong> del proyecto <em>${project?.name || ''}</em> se encuentra pendiente de entrega.</p>
                ${task.description ? `<p style="color:#6B7280;font-style:italic;">"${task.description}"</p>` : ''}
                <br/>
                <p style="color:#374151;">Por favor, actualicen el estado lo antes posible.</p>
            `
        });
        setCurrentView('mail');
    };

    return (
        <Card 
            draggable 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={`p-1 lg:p-4 mb-1 sm:mb-2 lg:mb-4 cursor-grab active:cursor-grabbing border-l-2 sm:border-l-4 transition-all hover:shadow-lg ${isOverdue ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-brand-primary bg-white dark:bg-dark-surface hover:border-brand-secondary'} ${isDragging ? 'opacity-50 shadow-2xl scale-105' : 'opacity-100'} rounded sm:rounded-xl relative group`}
        >
            {isOverdue && (
                <button
                    onClick={handleNudge}
                    className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors opacity-0 group-hover:opacity-100 hidden sm:block"
                    title="Enviar Recordatorio (Nudge)"
                >
                    <Icon name="mail" className="w-3.5 h-3.5"/>
                </button>
            )}
            <div className="flex flex-col gap-1 mb-1 sm:mb-2 pr-6">
                <span className="text-[7px] sm:text-[8px] font-black uppercase text-brand-primary opacity-60 tracking-wider truncate">{project?.name}</span>
                <h4 className="font-bold text-[9px] sm:text-sm leading-tight truncate">{task.title}</h4>
            </div>
            <p className="text-xs lg:text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1 line-clamp-2 hidden sm:block">{task.description}</p>
            
            <div className="mt-0.5 sm:mt-2 flex items-center justify-between">
                <div className="flex gap-0.5 flex-wrap">
                    {task.tags?.slice(0, 1).map(tag => (
                        <span key={tag} className="text-[6px] sm:text-[10px] bg-brand-accent/50 text-brand-primary font-semibold px-1 py-0.5 rounded-full truncate max-w-[35px] sm:max-w-none">{tag}</span>
                    ))}
                    {task.time && (
                        <span className="text-[6px] sm:text-[10px] text-brand-primary font-bold flex items-center gap-0.5 bg-brand-primary/10 px-1 py-0.5 rounded-full">
                            <Icon name="clock" className="w-2 h-2"/> {task.time}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {assignees.length > 0 && (
                        <div className="flex -space-x-1">
                            {assignees.slice(0, 3).map((assignee) => (
                                <img 
                                    key={assignee!.uid} 
                                    src={assignee!.avatarUrl || `https://ui-avatars.com/api/?name=${assignee!.name}`} 
                                    alt={assignee!.name} 
                                    className="w-4 h-4 rounded-full border border-white dark:border-dark-surface"
                                    title={assignee!.name}
                                />
                            ))}
                             {assignees.length > 3 && <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[6px] font-bold border border-white">+{assignees.length - 3}</div>}
                        </div>
                    )}
                    {task.hours && <span className="text-[7px] sm:text-xs font-bold hidden sm:inline">{task.hours}h</span>}
                </div>
            </div>
        </Card>
    );
};

const KanbanColumn: React.FC<{
    status: string;
    tasks: Task[];
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, status: string) => void;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, taskId: string) => void;
    onTaskClick: (task: Task) => void;
}> = ({ status, tasks, onDragOver, onDrop, onDragStart, onTaskClick }) => {
    const [isOver, setIsOver] = useState(false);

    const handleInternalDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); 
        e.stopPropagation();
        onDragOver(e);
        setIsOver(true);
    };

    const handleInternalDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsOver(false);
    };

    const handleInternalDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e, status);
        setIsOver(false);
    };

    const safeTasks = Array.isArray(tasks) ? tasks : [];

    return (
        <div
            className={`bg-light-bg dark:bg-dark-bg rounded-lg sm:rounded-xl p-0.5 sm:p-2 lg:p-4 flex flex-col min-w-[120px] sm:min-w-[280px] transition-colors duration-300 ${isOver ? 'bg-brand-accent/20 ring-2 ring-brand-primary/30' : ''} h-full overflow-hidden border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800`}
            onDragOver={handleInternalDragOver}
            onDragLeave={handleInternalDragLeave}
            onDrop={handleInternalDrop}
        >
            <h3 className="text-[8px] sm:text-sm lg:text-lg font-extrabold mb-1 sm:mb-4 tracking-wider uppercase flex flex-col sm:flex-row sm:justify-between items-center text-light-text-secondary dark:text-dark-text-secondary pointer-events-none text-center sm:text-left truncate w-full">
                <span className="truncate w-full">{status}</span>
                <span className="text-[7px] sm:text-xs lg:text-sm font-semibold bg-brand-accent text-brand-primary px-1 py-0.5 rounded-full mt-0.5 sm:mt-0">{safeTasks.length}</span>
            </h3>
            
            <div className="flex-1 space-y-1 sm:space-y-2 lg:space-y-4 overflow-y-auto custom-scrollbar min-h-[100px]">
                {safeTasks.map(task => (
                    <TaskCard key={task.id} task={task} onDragStart={onDragStart} onClick={() => onTaskClick(task)} />
                ))}
            </div>
        </div>
    );
};

const KanbanView: React.FC<KanbanViewProps> = ({ tasks, statuses, onUpdateTask, onTaskClick }) => {
    const { projects, selectedProjectId, updateProject, setToastNotification } = useContext(AppContext);
    
    const handleAddStatus = async () => {
        if (!selectedProjectId) return;
        const name = prompt("Nombre de la nueva etapa / columna:");
        if (!name || name.trim() === "") return;

        const currentProject = projects.find(p => p.id === selectedProjectId);
        if (currentProject) {
            const newStatus: ProjectStatus = {
                id: `status-${Date.now()}`,
                name: name.trim(),
                color: '#6d28d9', 
                isFixed: false
            };
            const updatedStatuses = [...(currentProject.statuses || []), newStatus];
            await updateProject(selectedProjectId, { statuses: updatedStatuses });
            setToastNotification({ title: "Columna Añadida", message: `Se ha creado "${name}" en el proyecto.`, icon: "check" });
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
        e.dataTransfer.setData("taskId", taskId);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, newStatus: string) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("taskId");
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        const task = safeTasks.find(t => t.id === taskId);
        
        if (task && task.status !== newStatus) {
            onUpdateTask({ ...task, status: newStatus });
        }
    };

    const safeStatuses = Array.isArray(statuses) ? statuses : [];

    return (
        <div className="flex gap-1 sm:gap-4 h-full w-full pb-2 overflow-x-auto custom-scrollbar items-start">
            {safeStatuses.map(status => (
                <KanbanColumn
                    key={status}
                    status={status}
                    tasks={tasks.filter(t => t.status === status)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onTaskClick={onTaskClick}
                />
            ))}
            
            {/* Botón para añadir nueva columna */}
            <div className="flex-shrink-0 w-20 sm:w-40 h-full flex flex-col pt-12 items-center">
                <button 
                    onClick={handleAddStatus}
                    className="w-12 h-12 rounded-full border-2 border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-400 hover:border-brand-primary hover:text-brand-primary transition-all group"
                    title="Añadir Columna"
                >
                    <Icon name="plus" className="w-6 h-6 group-hover:scale-110 transition-transform"/>
                </button>
                <span className="mt-2 text-[8px] sm:text-[10px] font-black uppercase text-neutral-400">Añadir Etapa</span>
            </div>
        </div>
    );
};

export default KanbanView;
