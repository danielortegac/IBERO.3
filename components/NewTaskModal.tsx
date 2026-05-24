
import React, { useState, useContext, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { Task, Folder } from '../types';
import { AppContext } from '../context/AppContext';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Button from './ui/Button';
import Icon from './Icon';

interface NewTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateTask: (taskData: Omit<Task, 'id' | 'status'>, folderId: string) => void;
    defaultDate?: string | null;
}

const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose, onCreateTask, defaultDate }) => {
    const { t } = useTranslation();
    const { projects, selectedProjectId, addProject } = useContext(AppContext);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [projectId, setProjectId] = useState(selectedProjectId || projects[0]?.id || '');
    const [isCreatingNewProject, setIsCreatingNewProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [folderId, setFolderId] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [tags, setTags] = useState('');
    const [hours, setHours] = useState('');
    const [assignedTo, setAssignedTo] = useState<string[]>([]);
    
    useEffect(() => {
        if (isOpen) {
            const defaultProjectId = selectedProjectId || (projects.length > 0 ? projects[0].id : '');
            setProjectId(defaultProjectId);
            
            const projectForDefaultFolder = projects.find(p => p.id === defaultProjectId);
            if (projectForDefaultFolder && projectForDefaultFolder.folders.length > 0) {
                setFolderId(projectForDefaultFolder.folders[0].id);
            } else {
                setFolderId('');
            }
            setAssignedTo([]);
        }
    }, [selectedProjectId, projects, isOpen]);

    useEffect(() => {
        if (isOpen) {
            setDate(defaultDate || new Date().toISOString().split('T')[0]);
            setTime(''); // Reset time to empty
        }
    }, [defaultDate, isOpen]);


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        let finalProjectId = projectId;
        let finalFolderId = folderId;

        if (isCreatingNewProject) {
            if (!newProjectName) return;
            try {
                const newProj: any = {
                    name: newProjectName,
                    ownerId: '', 
                    memberIds: [],
                    members: [],
                    folders: [{ id: 'general', name: 'General', tasks: [] }],
                    documents: [],
                    notes: [],
                    drawings: [],
                    chats: [],
                    spreadsheets: [],
                    finances: { income: 0, expenses: 0, transactions: [], adn: 'business', fiscalCountry: 'OTHER' },
                    statuses: [
                        { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true },
                        { id: 'status-inprogress', name: 'En Progreso', color: '#3B82F6', isFixed: true },
                        { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true }
                    ],
                    clients: [],
                    createdAt: new Date().toISOString()
                };
                
                // addProject expects project object without ID
                const createdProjectId = await addProject(newProj);
                finalProjectId = createdProjectId;
                finalFolderId = 'general';
            } catch (err) {
                console.error("Error creating project:", err);
                return;
            }
        }

        if (!title || !finalProjectId || !finalFolderId || !date || !time) return;
        
        onCreateTask({
            title,
            description,
            projectId: finalProjectId,
            folderId: finalFolderId,
            date,
            time: time || undefined,
            tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
            hours: hours ? parseFloat(hours) : null,
            assignedTo: assignedTo
        }, finalFolderId);

        // Reset form
        setTitle('');
        setDescription('');
        setTags('');
        setHours('');
        setTime('');
        setAssignedTo([]);
        onClose(); // Ensure modal closes
    };

    const currentProjectForDropdown = projects.find(p => p.id === projectId);
    const projectMembers = currentProjectForDropdown?.members || [];

    const toggleAssignee = (uid: string) => {
        setAssignedTo(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('createNewTask')}>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div>
                    <label className="text-sm font-medium">{t('taskTitle')}</label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} required />
                </div>
                <div>
                    <label className="text-sm font-medium">{t('taskDescription')}</label>
                    <Textarea value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium">{t('projects')}</label>
                        <select value={projectId} onChange={e => {
                            const newProjectId = e.target.value;
                            if (newProjectId === 'new_project') {
                                setIsCreatingNewProject(true);
                                setProjectId('new_project');
                                setFolderId('');
                            } else {
                                setIsCreatingNewProject(false);
                                setProjectId(newProjectId);
                                const newProject = projects.find(p => p.id === newProjectId);
                                setFolderId(newProject?.folders[0]?.id || '');
                            }
                            setAssignedTo([]); // Reset assignees when project changes
                        }} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            <option value="new_project" className="text-brand-primary font-bold">+ Nuevo Proyecto...</option>
                        </select>
                    </div>

                    {isCreatingNewProject && (
                        <div className="col-span-full animate-in slide-in-from-top-2 duration-300">
                            <label className="text-sm font-black text-brand-primary uppercase tracking-widest block mb-1">Nombre del Nuevo Proyecto</label>
                            <Input 
                                value={newProjectName} 
                                onChange={e => setNewProjectName(e.target.value)} 
                                placeholder="Escribe el nombre del proyecto..." 
                                autoFocus
                                required
                            />
                        </div>
                    )}

                     {!isCreatingNewProject && (
                        <div>
                            <label className="text-sm font-medium">{t('folder')}</label>
                            <select value={folderId} onChange={e => setFolderId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1" disabled={!currentProjectForDropdown || currentProjectForDropdown.folders.length === 0}>
                                {currentProjectForDropdown?.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        </div>
                     )}
                </div>

                {/* Assignees Section */}
                {projectMembers.length > 1 && (
                    <div>
                        <label className="text-sm font-medium mb-2 block">Asignar a:</label>
                        
                        {/* Selected Assignees */}
                        {assignedTo.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                                {assignedTo.map(uid => {
                                    const member = projectMembers.find(m => m.uid === uid);
                                    if (!member) return null;
                                    return (
                                        <button
                                            key={uid}
                                            type="button"
                                            onClick={() => toggleAssignee(uid)}
                                            className="flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-brand-primary text-white border border-brand-primary hover:bg-brand-primary/90 transition-colors"
                                        >
                                            <img src={member.avatarUrl || `https://ui-avatars.com/api/?name=${member.name}`} alt={member.name} className="w-4 h-4 rounded-full bg-white/20" />
                                            <span>{member.name}</span>
                                            <Icon name="close" className="w-3 h-3 ml-1" />
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Available Members to Add */}
                        <div className="flex flex-wrap gap-2 bg-light-bg dark:bg-dark-bg p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 max-h-32 overflow-y-auto custom-scrollbar">
                            {projectMembers.filter(m => !assignedTo.includes(m.uid)).map(member => (
                                <button
                                    key={member.uid}
                                    type="button"
                                    onClick={() => toggleAssignee(member.uid)}
                                    className="flex items-center gap-2 px-2 py-1 rounded-full text-xs border bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:border-brand-primary/50 transition-colors"
                                >
                                    <img src={member.avatarUrl || `https://ui-avatars.com/api/?name=${member.name}`} alt={member.name} className="w-4 h-4 rounded-full" />
                                    <span>{member.name}</span>
                                    <Icon name="plus" className="w-3 h-3 text-neutral-400" />
                                </button>
                            ))}
                            {projectMembers.filter(m => !assignedTo.includes(m.uid)).length === 0 && (
                                <p className="text-xs text-neutral-400 p-1 w-full text-center">Todos los miembros asignados.</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="text-sm font-medium">{t('taskDate')}</label>
                        <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
                    </div>
                     <div>
                        <label className="text-sm font-medium">{t('taskTime')}</label>
                        <Input type="time" value={time} onChange={e => setTime(e.target.value)} required />
                    </div>
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="text-sm font-medium">{t('taskHours')}</label>
                        <Input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g., 4" />
                    </div>
                     <div>
                        <label className="text-sm font-medium">{t('taskTags')}</label>
                        <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g., planning, urgent"/>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
                    <Button type="submit" variant="primary" disabled={!title || (isCreatingNewProject ? !newProjectName : (!projectId || !folderId)) || !date || !time}>{t('createNewTask')}</Button>
                </div>
            </form>
        </Modal>
    );
};

export default NewTaskModal;
