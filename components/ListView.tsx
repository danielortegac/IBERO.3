
import React, { useContext, useMemo, useState } from 'react';
import type { Task, Project } from '../types';
import { TaskStatus } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import Button from './ui/Button';

interface ListViewProps {
    tasks: Task[]; // Se mantiene por retrocompatibilidad
    onUpdateTask: (task: Task) => void;
    onTaskClick: (task: Task) => void;
}

const ListView: React.FC<ListViewProps> = ({ tasks = [], onUpdateTask, onTaskClick }) => {
    const { t } = useTranslation();
    const { projects = [], selectedProjectId, createTask, setMailDraft, setCurrentView, setToastNotification } = useContext(AppContext);

    // Estados para edición en línea
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<any>(null);

    // Estado para nueva fila rápida
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');

    // REFUERZO DE SINCRONIZACIÓN: Extraer todas las tareas del proyecto seleccionado
    const allProjectTasks = useMemo(() => {
        if (!selectedProjectId) return tasks;
        const currentProj = projects.find(p => p.id === selectedProjectId);
        if (!currentProj) return tasks;
        const extracted = (currentProj.folders || []).flatMap(f => f.tasks || []);
        return extracted.length > 0 ? extracted : tasks;
    }, [projects, selectedProjectId, tasks]);

    const currentProject = projects.find(p => p.id === selectedProjectId);

    const handleToggleTask = (task: Task) => {
        onUpdateTask({ 
            ...task, 
            status: task.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE 
        });
    };

    const startEditing = (task: Task, field: string, value: any) => {
        setEditingId(task.id);
        setEditingField(field);
        setEditValue(value);
    };

    const handleSaveEdit = (task: Task) => {
        if (editingId && editingField) {
            const updatedTask = { ...task, [editingField]: editValue };
            onUpdateTask(updatedTask);
        }
        setEditingId(null);
        setEditingField(null);
    };

    const handleQuickAdd = async () => {
        if (!newTaskTitle.trim() || !selectedProjectId || !currentProject) return;
        const firstFolderId = currentProject.folders && currentProject.folders[0]?.id;
        if (!firstFolderId) return;

        await createTask({
            title: newTaskTitle.trim(),
            description: '',
            projectId: selectedProjectId,
            folderId: firstFolderId,
            date: new Date().toISOString().split('T')[0],
            status: 'Por Hacer'
        }, firstFolderId);

        setNewTaskTitle('');
        setIsAddingTask(false);
    };

    return (
        <div className="bg-light-surface dark:bg-dark-surface p-1 sm:p-4 rounded-xl sm:rounded-2xl shadow-md overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="border-b border-neutral-200 dark:border-neutral-700 text-[10px] sm:text-sm">
                    <tr>
                        <th className="p-2 sm:p-3 w-10"></th>
                        <th className="p-2 sm:p-3">Proyecto</th>
                        <th className="p-2 sm:p-3">{t('taskTitle')}</th>
                        <th className="p-2 sm:p-3">Responsables</th>
                        <th className="p-2 sm:p-3">{t('taskDate')}</th>
                        <th className="p-2 sm:p-3">{t('taskTime')}</th>
                        <th className="p-2 sm:p-3">{t('taskHours')}</th>
                    </tr>
                </thead>
                <tbody className="text-[10px] sm:text-sm">
                    {allProjectTasks.map(task => {
                         const project = projects.find(p => p.id === task.projectId);
                         const assignees = task.assignedTo?.map(uid => project?.members?.find(m => m.uid === uid)).filter(Boolean) || [];

                         return (
                             <tr key={task.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors group">
                                <td className="p-2 sm:p-3">
                                    <input 
                                        type="checkbox" 
                                        checked={task.status === TaskStatus.DONE} 
                                        onChange={() => handleToggleTask(task)} 
                                        className="form-checkbox h-4 w-4 text-brand-primary bg-light-surface dark:bg-dark-surface border-neutral-300 dark:border-neutral-600 rounded focus:ring-brand-primary cursor-pointer" 
                                    />
                                </td>
                                <td className="p-2 sm:p-3">
                                    <span className="text-[9px] font-black uppercase text-brand-primary opacity-70 truncate block max-w-[80px]">{project?.name || '---'}</span>
                                </td>
                                
                                {/* Título Editable */}
                                <td className="p-2 sm:p-3 min-w-[150px]" onClick={() => !editingId && startEditing(task, 'title', task.title)}>
                                    {editingId === task.id && editingField === 'title' ? (
                                        <input 
                                            value={editValue} 
                                            onChange={e => setEditValue(e.target.value)}
                                            onBlur={() => handleSaveEdit(task)}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(task)}
                                            className="w-full bg-neutral-100 dark:bg-neutral-800 p-1 rounded font-bold outline-none border border-brand-primary"
                                            autoFocus
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold block cursor-text ${task.status === TaskStatus.DONE ? 'line-through text-neutral-400' : ''}`}>
                                                {task.title}
                                            </span>
                                            {new Date(task.date) < new Date() && task.status !== TaskStatus.DONE && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const emails = assignees.map(a => a?.email).filter(Boolean).join(', ');
                                                        if (!emails) return setToastNotification({title:"Sin Asignados", message:"No hay correos de responsables para esta tarea", icon:"info"});
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
                                                    }}
                                                    className="p-1 bg-red-100 text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity" title="Enviar Recordatorio"
                                                ><Icon name="mail" className="w-3 h-3"/></button>
                                            )}
                                        </div>
                                    )}
                                </td>

                                {/* Responsables - Clic abre Modal normal */}
                                <td className="p-2 sm:p-3 cursor-pointer" onClick={() => onTaskClick(task)}>
                                    <div className="flex -space-x-1">
                                        {assignees.map((assignee) => (
                                            <img 
                                                key={assignee!.uid} 
                                                src={assignee!.avatarUrl || `https://ui-avatars.com/api/?name=${assignee!.name}`} 
                                                alt={assignee!.name} 
                                                className="w-6 h-6 rounded-full border border-white dark:border-dark-surface"
                                                title={assignee!.name}
                                            />
                                        ))}
                                        {assignees.length === 0 && <span className="text-[10px] text-neutral-400 italic">Sin asignar</span>}
                                    </div>
                                </td>

                                {/* Fecha Editable */}
                                <td className="p-2 sm:p-3" onClick={() => startEditing(task, 'date', task.date)}>
                                    {editingId === task.id && editingField === 'date' ? (
                                        <input 
                                            type="date"
                                            value={editValue} 
                                            onChange={e => setEditValue(e.target.value)}
                                            onBlur={() => handleSaveEdit(task)}
                                            className="bg-neutral-100 dark:bg-neutral-800 p-1 rounded text-[10px] outline-none border border-brand-primary"
                                            autoFocus
                                        />
                                    ) : (
                                        <span className="font-medium opacity-60">{new Date(task.date).toLocaleDateString()}</span>
                                    )}
                                </td>

                                {/* Hora Editable */}
                                <td className="p-2 sm:p-3" onClick={() => startEditing(task, 'time', task.time || '')}>
                                    {editingId === task.id && editingField === 'time' ? (
                                        <input 
                                            type="time"
                                            value={editValue} 
                                            onChange={e => setEditValue(e.target.value)}
                                            onBlur={() => handleSaveEdit(task)}
                                            className="bg-neutral-100 dark:bg-neutral-800 p-1 rounded text-[10px] outline-none border border-brand-primary"
                                            autoFocus
                                        />
                                    ) : (
                                        <span className="text-brand-primary font-black flex items-center gap-1">
                                            <Icon name="clock" className="w-3 h-3"/> {task.time || '--:--'}
                                        </span>
                                    )}
                                </td>

                                {/* Horas Editable */}
                                <td className="p-2 sm:p-3 text-right" onClick={() => startEditing(task, 'hours', task.hours || '')}>
                                     {editingId === task.id && editingField === 'hours' ? (
                                        <input 
                                            type="number"
                                            value={editValue} 
                                            onChange={e => setEditValue(e.target.value)}
                                            onBlur={() => handleSaveEdit(task)}
                                            className="w-12 bg-neutral-100 dark:bg-neutral-800 p-1 rounded text-right outline-none border border-brand-primary"
                                            autoFocus
                                        />
                                    ) : (
                                        <span className="font-black text-brand-secondary">{task.hours ? `${task.hours}h` : '-'}</span>
                                    )}
                                </td>
                             </tr>
                        )
                    })}

                    {/* Fila de Creación Rápida v3.0 */}
                    <tr className="bg-brand-primary/5 hover:bg-brand-primary/10 transition-colors">
                        <td className="p-2 sm:p-3 text-center">
                            <button onClick={handleQuickAdd} className="p-1.5 bg-brand-primary text-white rounded-full shadow-sm hover:scale-110 active:scale-95 transition-all">
                                <Icon name="plus" className="w-4 h-4"/>
                            </button>
                        </td>
                        <td className="p-2 sm:p-3 opacity-50 font-black text-[9px] uppercase tracking-widest">
                            {currentProject?.name}
                        </td>
                        <td className="p-2 sm:p-3" colSpan={5}>
                            <input 
                                value={newTaskTitle}
                                onChange={e => setNewTaskTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                                placeholder="Escribe para añadir fila rápida..."
                                className="w-full bg-transparent border-none focus:ring-0 font-bold text-sm text-neutral-600 dark:text-neutral-300 placeholder-neutral-400"
                            />
                        </td>
                    </tr>
                </tbody>
            </table>
            
            {allProjectTasks.length === 0 && !isAddingTask && (
                <div className="p-12 text-center text-neutral-400 italic bg-white dark:bg-dark-surface rounded-b-2xl border-t border-neutral-100 dark:border-neutral-800">
                    <Icon name="list" className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                    <p>No hay tareas registradas en este proyecto.</p>
                </div>
            )}
        </div>
    );
};

export default ListView;
