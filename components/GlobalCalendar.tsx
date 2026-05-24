
import React, { useState, useContext, useMemo, useEffect } from 'react';
import { getPlanConfig } from '../types';
import type { Task, CallSession, UserProfile } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import WeekView from './WeekView';
import Icon from './Icon';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import { collection, onSnapshot, query, where, deleteDoc, doc, updateDoc, getDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const projectColors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f97316', '#eab308',
];


const toLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getProjectColor = (projectId: string) => {
    if (!projectId) return projectColors[0];
    let hash = 0;
    for (let i = 0; i < projectId.length; i++) {
        hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % projectColors.length);
    return projectColors[index];
};

const MeetingEditModal: React.FC<{ isOpen: boolean; onClose: () => void; meeting: CallSession | null }> = ({ isOpen, onClose, meeting }) => {
    const { setToastNotification, projects, currentUser } = useContext(AppContext);
    const { joinMeeting } = useContext(CallContext);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [projectId, setProjectId] = useState('');
    const [duration, setDuration] = useState('30');

    useEffect(() => {
        if (meeting) {
            setTitle(meeting.title || '');
            setDescription(meeting.description || '');
            setProjectId(meeting.projectId || '');
            setDuration(String(meeting.durationMinutes || '30'));
            if (meeting.scheduledAt) {
                const [d, t] = meeting.scheduledAt.split('T');
                setDate(d);
                setTime(t?.slice(0, 5) || '');
            }
        }
    }, [meeting, isOpen]);

    const handleSave = async () => {
        if (!meeting) return;
        const scheduledAt = `${date}T${time}:00`;
        try {
            await updateDoc(doc(db, "calls", meeting.id), {
                title,
                description,
                scheduledAt,
                durationMinutes: parseInt(duration) || 30,
                projectId: projectId || null
            });
            setToastNotification({ title: "Reunión Actualizada", message: "Los cambios han sido guardados.", icon: "check" });
            onClose();
        } catch (error) {
            console.error("Error updating meeting:", error);
            setToastNotification({ title: "Error", message: "No se pudo actualizar la reunión.", icon: "close" });
        }
    };

    const handleDelete = async () => {
        if (!meeting || !currentUser) return;
        
        const isHost = meeting.adminId === currentUser.uid;
        const confirmMsg = isHost 
            ? "¿Estás seguro de que quieres cancelar esta reunión para TODOS?" 
            : "¿Quitar esta reunión de tu calendario personal?";

        if (window.confirm(confirmMsg)) {
            try {
                if (isHost) {
                    await deleteDoc(doc(db, "calls", meeting.id));
                    setToastNotification({ title: "Eliminado", message: "La reunión ha sido cancelada.", icon: "trash" });
                } else {
                    await updateDoc(doc(db, "calls", meeting.id), {
                        participants: arrayRemove(currentUser.uid)
                    });
                    setToastNotification({ title: "Quitado", message: "Reunión eliminada de tu calendario.", icon: "trash" });
                }
                onClose();
            } catch (error) {
                console.error("Error deleting meeting:", error);
            }
        }
    };

    if (!isOpen || !meeting) return null;

    const isAdmin = meeting.adminId === currentUser?.uid;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gestionar Reunión" className="max-w-2xl">
            <div className="space-y-4">
                <div className="flex justify-between items-center bg-neutral-50 dark:bg-neutral-800 p-3 rounded-2xl border border-neutral-100 dark:border-neutral-700">
                    <div className="flex items-center gap-2">
                         <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${meeting.isPrivate ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                            {meeting.isPrivate ? 'Privada' : 'Pública'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${meeting.status === 'active' ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-neutral-100 text-neutral-500'}`}>
                            {meeting.status === 'active' ? 'En Pregreso' : meeting.status === 'ended' ? 'Terminada' : 'Programada'}
                        </span>
                    </div>
                </div>

                <div>
                    <label className="font-bold text-xs text-gray-500 uppercase block mb-1">Título</label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} disabled={!isAdmin} />
                </div>
                
                <div>
                    <label className="font-bold text-xs text-gray-500 uppercase block mb-1">Proyecto</label>
                    <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-sm" disabled={!isAdmin}>
                        <option value="">Reunión General</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div><label className="font-bold text-xs text-gray-500 uppercase block mb-1">Fecha</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!isAdmin} /></div>
                    <div><label className="font-bold text-xs text-gray-500 uppercase block mb-1">Hora</label><Input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!isAdmin} /></div>
                </div>

                <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/20 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-brand-primary uppercase">Goatify Meet Link</p>
                        <p className="text-xs font-mono truncate max-w-[200px] opacity-70">{window.location.origin}/#/calls/${meeting.id}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => joinMeeting(meeting.id)}>Entrar</Button>
                    </div>
                </div>

                {meeting.guestInfo && (
                    <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                        <p className="text-[10px] font-black text-neutral-500 uppercase mb-2">Detalles del Invitado (Scheduler)</p>
                        <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                            <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">Email</p>
                                <p className="font-medium truncate">{meeting.guestInfo.email}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">WhatsApp</p>
                                <p className="font-medium">{meeting.guestInfo.whatsapp}</p>
                            </div>
                        </div>
                        {meeting.guestInfo.notes && (
                            <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">Notas</p>
                                <p className="text-xs text-neutral-600 dark:text-neutral-400 italic">"{meeting.guestInfo.notes}"</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-between pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <Button onClick={handleDelete} variant="ghost" className="text-red-500 hover:bg-red-50">{isAdmin ? 'Cancelar para todos' : 'Quitar de mi vista'}</Button>
                    <div className="flex gap-2">
                        <Button onClick={onClose} variant="secondary">Cerrar</Button>
                        {isAdmin && <Button onClick={handleSave}>Guardar Cambios</Button>}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const ScheduleMeetingModal: React.FC<{ isOpen: boolean; onClose: () => void; setCurrentDate: (d: Date) => void }> = ({ isOpen, onClose, setCurrentDate }) => {
    const { scheduleMeeting } = useContext(CallContext);
    const { allUsers, currentUser, projects, userProfile, setProModalOpen, setMeetsInfoOpen } = useContext(AppContext);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [duration, setDuration] = useState('30');
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [generatedLink, setGeneratedLink] = useState('');
    const [step, setStep] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    const planConfig = getPlanConfig(userProfile.plan);
    const maxDurAllowed = (planConfig.limits as any).meeting_duration_minutes || 30;

    useEffect(() => {
        if (isOpen) {
            const now = new Date();
            now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 30));
            setDate(toLocalDateString(now));
            setTime(now.toTimeString().slice(0, 5));
            setDuration('30');
        }
    }, [isOpen]);

    const handleSchedule = async () => {
        if (!title || !date || !time) return;
        const durNum = parseInt(duration);
        if (durNum > maxDurAllowed) {
            setProModalOpen(true);
            return;
        }
        const scheduledAt = `${date}T${time}:00`;
        const invitees = allUsers.filter(u => selectedUsers.includes(u.uid));
        const link = await scheduleMeeting(title, scheduledAt, invitees, description, isPrivate);
        const callId = link.split('/calls/')[1];
        if (callId) {
            await updateDoc(doc(db, "calls", callId), { 
                projectId: selectedProjectId || null,
                durationMinutes: durNum 
            });
        }
        setGeneratedLink(link);
        setStep(2);
    };

    const copyLink = () => { navigator.clipboard.writeText(generatedLink); alert("Enlace copiado"); };
    const toggleUser = (uid: string) => { setSelectedUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]); };
    const reset = () => { setTitle(''); setDescription(''); setDate(''); setTime(''); setDuration('30'); setSelectedUsers([]); setSelectedProjectId(''); setGeneratedLink(''); setIsPrivate(false); setStep(1); onClose(); };

    const handleViewInCalendar = () => {
        if (date) {
            setCurrentDate(new Date(date + 'T12:00:00'));
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={reset} title={step === 1 ? "Programar Reunión Sincronizada" : "¡Reunión Lista!"} className="max-w-4xl w-full h-[85vh] flex flex-col">
            <div className="flex-1 overflow-y-auto p-1">
                {step === 1 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <div className="p-4 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-2xl border border-brand-primary/20 mb-2">
                                <p className="text-[10px] font-black text-brand-primary uppercase mb-1">Goatify Meets Premium</p>
                                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-tight">
                                    Una plataforma de videoconferencias y mensajería Premium que guarda links siempre que quieras y tiene mejores funciones que otras plataformas.
                                </p>
                                <button onClick={() => setMeetsInfoOpen(true)} className="mt-2 text-[9px] font-black text-brand-primary underline uppercase">Saber más</button>
                            </div>

                            <div>
                                <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Título de la reunión</label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Revisión Sprint..." className="mb-2" />
                                <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-sm mb-2">
                                    <option value="">Reunión General</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción..." rows={3} />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-1"><label className="font-bold text-xs text-gray-500 uppercase block mb-1">Fecha</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                                <div className="col-span-1"><label className="font-bold text-xs text-gray-500 uppercase block mb-1">Hora</label><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
                                <div className="col-span-1">
                                    <label className="font-bold text-xs text-gray-500 uppercase block mb-1">Duración</label>
                                    <select value={duration} onChange={e => setDuration(e.target.value)} className="w-full p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs h-[42px]">
                                        <option value="15">15 min</option>
                                        <option value="30">30 min</option>
                                        {maxDurAllowed >= 60 && <option value="60">1 hora</option>}
                                        {maxDurAllowed >= 120 && <option value="120">2 horas</option>}
                                        {maxDurAllowed >= 240 && <option value="240">4 horas</option>}
                                    </select>
                                    {parseInt(duration) > maxDurAllowed && <p className="text-[9px] text-red-500 font-bold mt-1 animate-pulse">Límite superado. Mejora tu plan.</p>}
                                </div>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer p-4 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                                <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="rounded text-brand-primary w-5 h-5"/>
                                <div className="flex flex-col"><span className="text-xs font-black uppercase">Reunión Privada</span><span className="text-[10px] text-neutral-500">Debes admitir a todos manualmente.</span></div>
                            </label>
                        </div>
                        <div className="flex flex-col h-full">
                            <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Invitar Participantes</label>
                            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Filtrar por nombre..." className="mb-2" />
                            <div className="flex-1 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-2xl p-2 space-y-2 max-h-[300px] custom-scrollbar">
                                {allUsers.filter(u => u.uid !== currentUser?.uid && (u.name.toLowerCase().includes(searchQuery.toLowerCase()))).map(user => (
                                    <div key={user.uid} onClick={() => toggleUser(user.uid)} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${selectedUsers.includes(user.uid) ? 'bg-brand-primary/10 border border-brand-primary' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>
                                        <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} className="w-8 h-8 rounded-full" alt={user.name} />
                                        <span className="text-sm font-bold flex-1">{user.name}</span>
                                        {selectedUsers.includes(user.uid) && <Icon name="check" className="w-4 h-4 text-brand-primary" />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6"><Icon name="check" className="w-10 h-10" /></div>
                        <h3 className="text-2xl font-bold mb-2">Reunión Sincronizada</h3>
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-2xl flex items-center justify-between max-w-lg mx-auto shadow-inner"><p className="text-xs font-mono text-neutral-500 truncate mr-4">{generatedLink}</p><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={handleViewInCalendar} title="Ver en Calendario"><Icon name="calendar" className="w-4 h-4"/></Button><Button size="sm" onClick={copyLink}>Copiar</Button></div></div>
                    </div>
                )}
            </div>
            <div className="flex-shrink-0 pt-4 border-t border-neutral-200 dark:border-neutral-700 mt-4 flex justify-end gap-2">
                {step === 1 ? <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSchedule} disabled={!title || !date || !time || parseInt(duration) > maxDurAllowed}>Programar</Button></> : <Button onClick={reset}>Cerrar</Button>}
            </div>
        </Modal>
    );
};

const GlobalCalendar: React.FC = () => {
    const { projects, currentUser, updateTask, setEditingTask, setTaskEditModalOpen, setNewTaskModalOpen, setNewTaskModalDate, setToastNotification, createNotification, userProfile, setMeetsInfoOpen, isScheduleModalOpen, setScheduleModalOpen } = useContext(AppContext);
    const { joinMeeting } = useContext(CallContext);
    const { language } = useTranslation();
    
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [isMeetingEditModalOpen, setMeetingEditModalOpen] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState<CallSession | null>(null);
    const [scheduledCalls, setScheduledCalls] = useState<CallSession[]>([]);
    const [socialCalendarItems, setSocialCalendarItems] = useState<any[]>([]);
    
    const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
    const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
    const [showOnlyMeetings, setShowOnlyMeetings] = useState(false);
    const [personalTasks, setPersonalTasks] = useState<Task[]>([]);
    const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

    const allTasks = useMemo(() => {
        const pTasks = projects.flatMap(p => (p.folders || []).flatMap(f => f.tasks || []));
        return [...pTasks, ...personalTasks];
    }, [projects, personalTasks]);

    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash;
            if (hash.includes('taskId=')) {
                const urlParams = new URLSearchParams(hash.split('?')[1]);
                const taskId = urlParams.get('taskId');
                if (taskId) {
                    setHighlightedTaskId(taskId);
                    const task = allTasks.find(t => t.id === taskId);
                    if (task) {
                        setEditingTask(task);
                        setTaskEditModalOpen(true);
                    }
                }
            }
        };
        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [allTasks, setEditingTask, setTaskEditModalOpen]);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "users", currentUser.uid, "tasks"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPersonalTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
        });
        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "calls"), where("participants", "array-contains", currentUser.uid), where("isMeeting", "==", true));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setScheduledCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallSession)));
        });
        return () => unsubscribe();
    }, [currentUser]);


    useEffect(() => {
        if (!currentUser) return;
        const unsubscribe = onSnapshot(collection(db, 'users', currentUser.uid, 'socialCalendar'), (snapshot) => {
            setSocialCalendarItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubscribe();
    }, [currentUser]);

    const days = useMemo(() => {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const startDay = startOfMonth.getDay();
        // Generamos un set de 42 días para cubrir todas las posibilidades del mes
        return Array.from({ length: 42 }, (_, i) => new Date(currentDate.getFullYear(), currentDate.getMonth(), i - startDay + 1));
    }, [currentDate]);

    const changeDate = (offset: number) => {
        setCurrentDate(prev => viewMode === 'month' ? new Date(prev.getFullYear(), prev.getMonth() + offset, 1) : new Date(prev.setDate(prev.getDate() + (offset * 7))));
    };

    const uniqueTags = useMemo(() => {
        const tags = new Set<string>();
        allTasks.forEach(t => t.tags?.forEach(tag => tags.add(tag)));
        return Array.from(tags);
    }, [allTasks]);

    const filteredTasks = useMemo(() => {
        if (showOnlyMeetings) return [];
        return allTasks.filter(task => {
            const projectMatch = selectedProjectFilter === 'all' || task.projectId === selectedProjectFilter;
            const tagMatch = selectedTagFilter === 'all' || (task.tags && task.tags.includes(selectedTagFilter));
            return projectMatch && tagMatch;
        });
    }, [allTasks, selectedProjectFilter, selectedTagFilter, showOnlyMeetings]);

    const filteredCalls = useMemo(() => {
        return scheduledCalls.filter(call => {
            const projectMatch = selectedProjectFilter === 'all' || call.projectId === selectedProjectFilter;
            return projectMatch;
        });
    }, [scheduledCalls, selectedProjectFilter]);

    const handleDayClick = (dateStr: string) => { setNewTaskModalDate(dateStr); setNewTaskModalOpen(true); };
    const getMonthTitle = () => new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(currentDate);

    const updateTaskDateSafely = async (task: Task, newDateStr: string) => {
        const previousDate = task.date;
        const updatedTask = {
            ...task,
            date: newDateStr,
            time: task.time || '',
            lastMovedAt: new Date().toISOString(),
            lastMovedBy: currentUser?.uid || null
        } as any;

        try {
            const taskHasProject = !!task.projectId && !!task.folderId && projects.some(p => p.id === task.projectId);
            if (taskHasProject) {
                await updateTask(updatedTask);
            } else if (currentUser) {
                await updateDoc(doc(db, "users", currentUser.uid, "tasks", task.id), {
                    date: newDateStr,
                    time: task.time || '',
                    updatedAt: new Date().toISOString(),
                    lastMovedAt: new Date().toISOString(),
                    lastMovedBy: currentUser.uid
                });
            }
            setToastNotification({ title: "Tarea movida", message: `Nueva fecha: ${newDateStr}${task.time ? ` · ${task.time}` : ''}`, icon: "calendar" });
        } catch (error) {
            console.error("Error moving task in calendar:", error);
            if (task.projectId && task.folderId) await updateTask({ ...task, date: previousDate } as any).catch(() => null);
            setToastNotification({ title: "No se guardó", message: "Se restauró la fecha anterior. Intenta nuevamente.", icon: "close" });
        }
    };

    const handleDrop = async (e: React.DragEvent, date: Date) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData("itemId");
        const type = e.dataTransfer.getData("itemType");
        const newDateStr = toLocalDateString(date);

        if (type === 'task') {
            const task = allTasks.find(t => t.id === id);
            if (task) await updateTaskDateSafely(task, newDateStr);
        } else if (type === 'meeting') {
            const meeting = scheduledCalls.find(c => c.id === id);
            if (meeting && meeting.scheduledAt && meeting.adminId === currentUser?.uid) {
                const timePart = meeting.scheduledAt.split('T')[1] || '09:00:00';
                const newScheduledAt = `${newDateStr}T${timePart}`;
                await updateDoc(doc(db, "calls", meeting.id), { scheduledAt: newScheduledAt, updatedAt: new Date().toISOString(), lastMovedBy: currentUser.uid });
                
                for (const uid of meeting.participants) {
                    if (uid !== currentUser.uid) {
                        await createNotification(uid, {
                            type: 'incoming_call',
                            text: `📅 **Reunión Reprogramada**: "${meeting.title}" movida al ${new Date(newScheduledAt).toLocaleString()}.`,
                            link: `/#/calls/${meeting.id}`,
                            fromUser: { uid: currentUser.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
                        });
                    }
                }
                setToastNotification({ title: "Reunión Movida", message: `Nueva fecha: ${newDateStr}. Invitados notificados.`, icon: "calendar" });
            }
        }
    };

    return (
        <div className="h-full flex flex-col p-0 bg-light-bg dark:bg-dark-bg overflow-hidden animate-fade-in">
            <ScheduleMeetingModal isOpen={isScheduleModalOpen} onClose={() => setScheduleModalOpen(false)} setCurrentDate={setCurrentDate} />
            <MeetingEditModal isOpen={isMeetingEditModalOpen} onClose={() => setMeetingEditModalOpen(false)} meeting={selectedMeeting} />
            
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 flex-shrink-0 px-4 pt-4 gap-4">
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <button 
                        onClick={() => setMeetsInfoOpen(true)}
                        className="flex items-center gap-2 bg-brand-primary p-2 px-3 rounded-xl shadow-lg hover:scale-105 transition-all text-white font-black text-xs uppercase tracking-tighter"
                    >
                        <Icon name="video" className="w-4 h-4"/> Goatify Meets
                    </button>
                    <h1 className="text-xl sm:text-2xl font-black tracking-tighter text-neutral-900 dark:text-white capitalize">{getMonthTitle()}</h1>
                    <div className="flex bg-white dark:bg-neutral-800 rounded-xl p-1 shadow-sm border border-neutral-200 dark:border-neutral-700">
                        <button onClick={() => changeDate(-1)} className="p-1.5 hover:bg-neutral-100 rounded-lg"><Icon name="chevronLeft" className="w-4 h-4"/></button>
                        <button onClick={() => changeDate(1)} className="p-1.5 hover:bg-neutral-100 rounded-lg"><Icon name="chevronLeft" className="w-4 h-4 rotate-180"/></button>
                    </div>
                </div>

                <div className="grid grid-cols-4 sm:flex lg:flex-nowrap items-center gap-1 sm:gap-2 w-full lg:w-auto overflow-hidden">
                    <select 
                        value={selectedProjectFilter} 
                        onChange={(e) => setSelectedProjectFilter(e.target.value)} 
                        className="col-span-1 p-2 rounded-xl text-[10px] sm:text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-bold truncate"
                    >
                        <option value="all">Proyectos</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>

                    <select 
                        value={selectedTagFilter} 
                        onChange={(e) => setSelectedTagFilter(e.target.value)} 
                        className="col-span-1 p-2 rounded-xl text-[10px] sm:text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-bold truncate"
                    >
                        <option value="all">Etiquetas</option>
                        {uniqueTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                    </select>

                    <button 
                        onClick={() => setShowOnlyMeetings(!showOnlyMeetings)}
                        className={`col-span-1 flex items-center justify-center gap-1 p-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all border ${showOnlyMeetings ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white dark:bg-neutral-800 border-neutral-200 text-neutral-500'}`}
                    >
                        <Icon name="video" className="w-3 h-3"/> <span className="hidden sm:inline">Meets</span>
                    </button>

                    <Button onClick={() => setScheduleModalOpen(true)} className="col-span-1 !px-2 sm:!px-4 bg-brand-primary text-white font-black text-[10px] sm:text-xs h-10 shadow-lg"><Icon name="calendar" className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Programar</span></Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white dark:bg-dark-surface border-t border-neutral-100 dark:border-neutral-800 p-0 relative">
                {viewMode === 'month' ? (
                    <div className="grid grid-cols-7 h-auto gap-px bg-neutral-200 dark:bg-neutral-800">
                        {['dom','lun','mar','mie','jue','vie','sab'].map(day => (<div key={day} className="bg-white dark:bg-dark-surface text-center font-black text-neutral-400 uppercase text-[9px] tracking-[0.2em] py-3">{day}</div>))}
                        
                        {days.map((date, i) => {
                            const dateStr = toLocalDateString(date);
                            const isCurrent = date.getMonth() === currentDate.getMonth();
                            const isToday = date.toDateString() === new Date().toDateString();
                            const dayTasks = filteredTasks.filter(t => t.date === dateStr);
                            const dayCalls = filteredCalls.filter(c => c.scheduledAt?.startsWith(dateStr));
                            const daySocial = socialCalendarItems.filter(item => String(item.scheduledAt || '').startsWith(dateStr));
                            
                            return (
                                <div key={i} className={`relative flex flex-col p-1.5 transition-all hover:bg-neutral-50 cursor-pointer min-h-[100px] h-auto ${isCurrent ? 'bg-white dark:bg-dark-surface' : 'bg-neutral-50/50 dark:bg-black/20 opacity-50'}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, date)} onClick={() => handleDayClick(dateStr)}>
                                    <span className={`text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-lg mb-1 ${isToday ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-700 dark:text-neutral-300'}`}>{date.getDate()}</span>
                                    <div className="flex-1 space-y-1 pr-0.5">
                                        {dayCalls.map(call => (
                                            <div key={call.id} draggable={true} onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("itemId", call.id); e.dataTransfer.setData("itemType", "meeting"); }} onClick={(e) => { e.stopPropagation(); setSelectedMeeting(call); setMeetingEditModalOpen(true); }} className={`bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-lg text-[9px] font-black truncate border-l-4 border-purple-500 shadow-sm flex flex-col ${call.status === 'active' ? 'ring-2 ring-purple-400' : ''}`}>
                                                <span className="truncate flex items-center gap-1"><Icon name="video" className="w-2.5 h-2.5"/> {call.scheduledAt?.split('T')[1].slice(0,5)}</span>
                                                <span className="truncate mt-0.5">{call.title}</span>
                                            </div>
                                        ))}
                                        {dayTasks.map(task => (
                                            <div key={task.id} draggable={true} onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("itemId", task.id); e.dataTransfer.setData("itemType", "task"); }} onClick={(e) => { e.stopPropagation(); setEditingTask(task); setTaskEditModalOpen(true); }} className="px-2 py-1 rounded-md text-[9px] font-bold truncate text-white shadow-sm flex items-center justify-between" style={{ backgroundColor: getProjectColor(task.projectId) }}>
                                                <span className="truncate">{task.title}</span>
                                            </div>
                                        ))}
                                        {daySocial.map(item => (
                                            <div key={item.id} onClick={(e) => { e.stopPropagation(); setToastNotification({ title: 'Post social', message: `${item.platform || 'Red'} · ${String(item.scheduledAt || '').slice(11,16)} · ${item.title || 'Contenido programado'}`, icon: 'megaphone' }); }} className="px-2 py-1 rounded-md text-[9px] font-black truncate bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-200 border-l-4 border-pink-500 shadow-sm">
                                                <span className="truncate">{String(item.scheduledAt || '').slice(11,16)} · {item.platform || 'Social'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <WeekView currentDate={currentDate} tasks={filteredTasks} calls={filteredCalls} onTaskDateChange={(taskId, newDate) => { const task = allTasks.find(t => t.id === taskId); if (task) updateTaskDateSafely(task, newDate); }} onMeetingDateChange={async (id, d) => { const m = scheduledCalls.find(c=>c.id===id); if(m) { const time = m.scheduledAt?.split('T')[1]; await updateDoc(doc(db, "calls", id), { scheduledAt: `${d}T${time}` }); } }} onTaskClick={(t) => { setEditingTask(t); setTaskEditModalOpen(true); }} onMeetingClick={(c) => { setSelectedMeeting(c); setMeetingEditModalOpen(true); }} language={language} />
                )}
            </div>
        </div>
    );
};

export default GlobalCalendar;
