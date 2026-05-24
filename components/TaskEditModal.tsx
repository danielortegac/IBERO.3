
import React, { useState, useContext, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { Task, Folder } from '../types';
import { TaskStatus } from '../types';
import { AppContext } from '../context/AppContext';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Button from './ui/Button';
import Icon from './Icon';

interface TaskEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task;
    onUpdateTask: (task: Task) => void;
}

const TaskEditModal: React.FC<TaskEditModalProps> = ({ isOpen, onClose, task, onUpdateTask }) => {
    const { t } = useTranslation();
    const { projects, deleteTask, setMailDraft, setCurrentView, allUsers } = useContext(AppContext);
    
    const [formData, setFormData] = useState<Task>({
        ...task,
        description: task.description || '',
        tags: task.tags || [],
        hours: task.hours ?? null,
        time: task.time || '', // Initialize time
        isAiGenerated: !!task.isAiGenerated,
        assignedTo: task.assignedTo || []
    });

    useEffect(() => {
        if (task) {
            setFormData({
                ...task,
                description: task.description || '',
                tags: task.tags || [],
                hours: task.hours ?? null,
                time: task.time || '', // Initialize time
                isAiGenerated: !!task.isAiGenerated,
                assignedTo: task.assignedTo || []
            });
        }
    }, [task]);
    
    const project = projects.find(p => p.id === formData.projectId) || projects.find(p => p.id === task.projectId);
    const projectMembers = project?.members || [];

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        
        if (name === 'projectId') {
            const newProj = projects.find(p => p.id === value);
            setFormData(prev => ({ 
                ...prev, 
                projectId: value, 
                folderId: newProj?.folders[0]?.id || '' 
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }));
    };
    
    const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, hours: e.target.value ? parseFloat(e.target.value) : null }));
    };

    const toggleAssignee = (uid: string) => {
        setFormData(prev => {
            const current = prev.assignedTo || [];
            const updated = current.includes(uid) 
                ? current.filter(id => id !== uid) 
                : [...current, uid];
            return { ...prev, assignedTo: updated };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdateTask(formData);
        onClose();
    };

    const handleAddToGoogleCalendar = () => {
        const title = encodeURIComponent(formData.title);
        const details = encodeURIComponent(formData.description || '');
        const startDate = formData.date.replace(/-/g, '');
        // Optional: Add time to google calendar link if present, simpler to just do date for now or basic enhancement
        let datesParam = `${startDate}/${startDate}`;
        if (formData.time) {
             const timeStr = formData.time.replace(':', '') + '00';
             // Basic ISO assumption, improvement would be proper timezone handling
             datesParam = `${startDate}T${timeStr}/${startDate}T${Number(timeStr)+10000}`; 
        }
        
        const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${datesParam}&details=${details}`;
        window.open(url, '_blank');
    };

    const handleDelete = async () => {
        if (window.confirm("¿Estás seguro de que deseas eliminar esta tarea?")) {
            await deleteTask(task.id, task.projectId, task.folderId);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('editTask')}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Project and Folder Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-brand-primary/5 p-3 rounded-2xl border border-brand-primary/10 mb-4">
                    <div>
                        <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest block mb-1">Asignar a Proyecto</label>
                        <select 
                            name="projectId" 
                            value={formData.projectId} 
                            onChange={handleChange} 
                            className="w-full bg-white dark:bg-neutral-900 border border-brand-primary/20 rounded-xl p-2 text-xs font-bold"
                        >
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest block mb-1">{t('folder')}</label>
                        <select 
                            name="folderId" 
                            value={formData.folderId} 
                            onChange={handleChange} 
                            className="w-full bg-white dark:bg-neutral-900 border border-brand-primary/20 rounded-xl p-2 text-xs font-bold"
                        >
                            {project?.folders.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                 <div>
                    <label className="text-sm font-medium">{t('taskTitle')}</label>
                    <Input name="title" value={formData.title} onChange={handleChange} required />
                </div>
                <div>
                    <label className="text-sm font-medium">{t('taskDescription')}</label>
                    <Textarea name="description" value={formData.description} onChange={handleChange} />
                </div>

                {/* Assignees Section */}
                {projectMembers.length > 1 && (
                    <div>
                        <label className="text-sm font-medium mb-2 block">Asignado a:</label>
                        <div className="flex flex-wrap gap-2 bg-light-bg dark:bg-dark-bg p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 max-h-32 overflow-y-auto custom-scrollbar">
                            {projectMembers.map(member => (
                                <button
                                    key={member.uid}
                                    type="button"
                                    onClick={() => toggleAssignee(member.uid)}
                                    className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs border transition-colors ${formData.assignedTo?.includes(member.uid) ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:border-brand-primary/50'}`}
                                >
                                    <img src={member.avatarUrl || `https://ui-avatars.com/api/?name=${member.name}`} alt={member.name} className="w-4 h-4 rounded-full" />
                                    <span>{member.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="text-sm font-medium">{t('status')}</label>
                        <select name="status" value={formData.status} onChange={handleChange} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                            {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="text-sm font-medium">{t('taskDate')}</label>
                        <Input type="date" name="date" value={formData.date} onChange={handleChange} required />
                    </div>
                     <div>
                        <label className="text-sm font-medium">{t('taskTime')}</label>
                        <Input type="time" name="time" value={formData.time || ''} onChange={handleChange} />
                    </div>
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="text-sm font-medium">{t('taskHours')}</label>
                        <Input 
                            type="number" 
                            name="hours"
                            value={formData.hours ?? ''} 
                            onChange={handleHoursChange} 
                            placeholder="e.g., 4" 
                            step="0.5"
                        />
                    </div>
                     <div>
                        <label className="text-sm font-medium">{t('taskTags')}</label>
                        <Input value={formData.tags?.join(', ') || ''} onChange={handleTagsChange} placeholder="e.g., planning, urgent"/>
                    </div>
                </div>
                <div className="flex justify-between items-center pt-4">
                    <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={() => {
                            let emails = '';
                            if (formData.assignedTo && formData.assignedTo.length > 0) {
                                emails = formData.assignedTo.map(uid => allUsers.find(u => u.uid === uid)?.email).filter(Boolean).join(', ');
                            }
                            setMailDraft({
                                to: emails,
                                subject: `Recordatorio de Tarea: ${formData.title}`,
                                htmlBody: `Hola equipo,<br/><br/>Este es un recordatorio amable sobre la siguiente tarea:<br/><br/><b>Tarea:</b> ${formData.title}<br/><b>Descripción:</b> ${formData.description || 'N/A'}<br/><b>Fecha de Entrega:</b> ${formData.date} ${formData.time || ''}<br/><br/>Por favor asegúrense de mantener el progreso actualizado.<br/>Gracias.`
                            });
                            setCurrentView('mail');
                            onClose();
                        }} className="!p-2 text-brand-primary border-brand-primary/20 hover:bg-brand-primary/10" title="Enviar recordatorio por mail">
                            <Icon name="mail" className="w-4 h-4"/>
                        </Button>
                        <Button type="button" variant="secondary" onClick={handleAddToGoogleCalendar} className="!p-2" title="Add to Calendar">
                            <Icon name="calendar" className="w-4 h-4"/>
                        </Button>
                        <Button type="button" variant="ghost" onClick={handleDelete} className="!p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Eliminar">
                            <Icon name="trash" className="w-4 h-4"/>
                        </Button>
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
                        <Button type="submit" variant="primary">{t('updateTask')}</Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default TaskEditModal;
