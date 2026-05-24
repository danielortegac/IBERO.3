
import React, { useState, useMemo, useContext, useEffect } from 'react';
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
import { collection, onSnapshot, query, where, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const toLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const projectColors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f97316', '#eab308',
];

const getProjectColor = (projectId: string) => {
    if (!projectId) return projectColors[0];
    let hash = 0;
    for (let i = 0; i < projectId.length; i++) {
        hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % projectColors.length);
    return projectColors[index];
};

const holidays: Record<string, string> = {
  '2024-01-01': 'New Year\'s Day',
  '2024-01-15': 'Martin Luther King, Jr. Day',
  '2024-02-19': 'Presidents\' Day',
  '2024-05-27': 'Memorial Day',
  '2024-06-19': 'Juneteenth',
  '2024-07-04': 'Independence Day',
  '2024-09-02': 'Labor Day',
  '2024-11-28': 'Thanksgiving Day',
  '2024-12-25': 'Christmas Day',
};

const MeetingEditModal: React.FC<{ isOpen: boolean; onClose: () => void; meeting: CallSession | null }> = ({ isOpen, onClose, meeting }) => {
    const { setToastNotification, setMailDraft, setCurrentView, allUsers } = useContext(AppContext);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    useEffect(() => {
        if (meeting) {
            setTitle(meeting.title || '');
            setDescription(meeting.description || '');
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
                scheduledAt
            });
            setToastNotification({ title: "Reunión Actualizada", message: "Los cambios han sido guardados.", icon: "check" });
            onClose();
        } catch (error) {
            console.error("Error updating meeting:", error);
            setToastNotification({ title: "Error", message: "No se pudo actualizar la reunión.", icon: "close" });
        }
    };

    const handleDelete = async () => {
        if (!meeting) return;
        if (window.confirm("¿Estás seguro de que quieres eliminar esta reunión permanentemente?")) {
            try {
                await deleteDoc(doc(db, "calls", meeting.id));
                setToastNotification({ title: "Eliminado", message: "La reunión ha sido cancelada.", icon: "trash" });
                onClose();
            } catch (error) {
                console.error("Error deleting meeting:", error);
                setToastNotification({ title: "Error", message: "No se pudo eliminar la reunión.", icon: "close" });
            }
        }
    };

    if (!isOpen || !meeting) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Reunión">
            <div className="space-y-4">
                <div>
                    <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Título</label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <div>
                    <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Descripción</label>
                    <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Fecha</label>
                        <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Hora</label>
                        <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
                    </div>
                </div>
                <div className="flex justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700 mt-4 flex-wrap gap-2">
                    <Button onClick={handleDelete} variant="ghost" className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Icon name="trash" className="w-4 h-4" /> Eliminar
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                const guestEmails = meeting.participants
                                    .map(uid => allUsers.find(u => u.uid === uid)?.email)
                                    .filter(email => email)
                                    .join(", ");
                                setMailDraft({
                                    to: guestEmails,
                                    subject: `Actualización de Reunión: ${title}`,
                                    htmlBody: `¡Hola!<br/><br/>Aquí están los detalles actualizados de nuestra reunión.<br/><br/><b>Asunto:</b> ${title}<br/><b>Fecha:</b> ${date}<br/><b>Hora:</b> ${time}<br/><b>Descripción:</b><br/>${description}<br/><br/><b>Enlace de Reunión:</b> <a href="${meeting.link}">${meeting.link}</a><br/><br/>Nos vemos pronto.`
                                });
                                onClose();
                                setCurrentView('mail');
                            }}
                            className="bg-brand-accent/10 text-brand-primary"
                        >
                            <Icon name="mail" className="w-4 h-4 mr-1"/> Enviar Detalle
                        </Button>
                        <Button onClick={onClose} variant="secondary">Cancelar</Button>
                        <Button onClick={handleSave}>Guardar</Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const ScheduleMeetingModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { scheduleMeeting } = useContext(CallContext);
    const { allUsers, currentUser, setMailDraft, setCurrentView } = useContext(AppContext);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [generatedLink, setGeneratedLink] = useState('');
    const [step, setStep] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (isOpen) {
            const now = new Date();
            now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 30));
            setDate(toLocalDateString(now));
            setTime(now.toTimeString().slice(0, 5));
        }
    }, [isOpen]);

    const handleSchedule = async () => {
        if (!title || !date || !time) return;
        const scheduledAt = `${date}T${time}:00`;
        const invitees = allUsers.filter(u => selectedUsers.includes(u.uid));
        
        const link = await scheduleMeeting(title, scheduledAt, invitees, description);
        setGeneratedLink(link);
        setStep(2);

        // Schedule 30-minute reminder
        try {
            const token = localStorage.getItem('goatify_token');
            const meetingTime = new Date(scheduledAt).getTime();
            const sendAt = meetingTime - (30 * 60 * 1000); // 30 mins before
            
            if (sendAt > Date.now()) {
                const mailOptions = {
                    from: currentUser?.email || 'Goatify Mail',
                    to: invitees.map(i => i.email).join(', '),
                    subject: `RECORDATORIO: Revisión de agenda "${title}" en 30 minutos`,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #1e293b; padding: 20px; border-radius: 10px;">
                            <h2 style="color: #6366f1;">¡Hola! Tu reunión está por comenzar</h2>
                            <p>Este es un recordatorio automático de que la reunión <strong>"${title}"</strong> inicia en aproximadamente 30 minutos.</p>
                            <p><strong>Fecha/Hora:</strong> ${date} ${time}</p>
                            <a href="${link}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 15px;">Ir a la Videollamada</a>
                        </div>
                    `
                };

                fetch('/api/campaigns/schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        ownerId: currentUser?.uid,
                        accountId: 'primary', // server resolves to ownerSession.accounts[0]
                        mailOptions,
                        sendAt
                    })
                });
            }
        } catch (err) {
            console.error("Error scheduling reminder", err);
        }
    };

    const copyLink = () => { navigator.clipboard.writeText(generatedLink); alert("Enlace copiado al portapapeles"); };
    
    const toggleUser = (uid: string) => { 
        setSelectedUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]); 
    };

    const reset = () => { 
        setTitle(''); 
        setDescription('');
        setDate(''); 
        setTime(''); 
        setSelectedUsers([]); 
        setGeneratedLink(''); 
        setStep(1); 
        onClose(); 
    };

    const filteredUsers = allUsers.filter(u => 
        u.uid !== currentUser?.uid && 
        (u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <Modal isOpen={isOpen} onClose={reset} title={step === 1 ? "Programar Reunión" : "¡Reunión Lista!"} className="max-w-4xl w-full h-[85vh] flex flex-col">
            <div className="flex-1 overflow-y-auto p-1">
                {step === 1 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <div>
                                <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Detalles del Evento</label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título de la reunión" className="mb-2" />
                                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción o agenda..." rows={3} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Fecha</label>
                                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                                </div>
                                <div>
                                    <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Hora</label>
                                    <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col h-full">
                            <label className="font-bold text-sm text-gray-500 uppercase block mb-1">Participantes ({selectedUsers.length})</label>
                            <Input 
                                value={searchQuery} 
                                onChange={e => setSearchQuery(e.target.value)} 
                                placeholder="Buscar usuarios..." 
                                className="mb-2"
                            />
                            <div className="flex-1 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-xl p-2 space-y-2 max-h-[300px] custom-scrollbar">
                                {filteredUsers.map(user => (
                                    <div 
                                        key={user.uid} 
                                        onClick={() => toggleUser(user.uid)}
                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedUsers.includes(user.uid) ? 'bg-brand-primary/10 border border-brand-primary' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                                    >
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedUsers.includes(user.uid) ? 'bg-brand-primary border-brand-primary' : 'border-gray-400'}`}>
                                            {selectedUsers.includes(user.uid) && <Icon name="check" className="w-3 h-3 text-white" />}
                                        </div>
                                        <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} className="w-8 h-8 rounded-full" alt={user.name} />
                                        <div>
                                            <p className="text-sm font-bold">{user.name}</p>
                                            <p className="text-xs text-neutral-500">{user.email}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Icon name="check" className="w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-bold mb-2">Reunión Programada</h3>
                        <p className="text-neutral-500 mb-6">Hemos enviado las notificaciones a los participantes.</p>
                        
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-xl flex items-center justify-between max-w-lg mx-auto border border-neutral-200 dark:border-neutral-700">
                            <p className="text-sm font-mono text-neutral-600 dark:text-neutral-300 truncate mr-4">{generatedLink}</p>
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="secondary" onClick={() => {
                                    const inviteesHtml = allUsers.filter(u => selectedUsers.includes(u.uid)).map(u => u.email).join(', ');
                                    setMailDraft({
                                        to: inviteesHtml,
                                        subject: `Invitación: ${title}`,
                                        htmlBody: `Hola,<br/><br/>Te invito a la reunión <b>"${title}"</b> programada para el <b>${date}</b> a las <b>${time}</b>.<br/><br/>${description ? `<p>${description}</p>` : ''}Link de acceso:<br/><a href="${generatedLink}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px;">Unirse a la Reunión</a><br/><br/>Saludos.`
                                    });
                                    setCurrentView('mail');
                                }}>
                                    <Icon name="mail" className="w-4 h-4" /> Enviar Invitación
                                </Button>
                                <Button size="sm" onClick={copyLink}><Icon name="copy" className="w-4 h-4" /> Copiar</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="flex-shrink-0 pt-4 border-t border-neutral-200 dark:border-neutral-700 mt-4 flex justify-end gap-2 bg-white dark:bg-dark-surface">
                {step === 1 ? (
                    <>
                        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button onClick={handleSchedule} disabled={!title || !date || !time}>Programar Reunión</Button>
                    </>
                ) : (
                    <Button onClick={reset}>Cerrar</Button>
                )}
            </div>
        </Modal>
    );
};

const GlobalCalendar: React.FC = () => {
    const { projects, currentUser, updateTask, setEditingTask, setTaskEditModalOpen, setNewTaskModalOpen, setNewTaskModalDate } = useContext(AppContext);
    const { joinMeeting } = useContext(CallContext);
    const { t, language } = useTranslation();
    
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [isScheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [isMeetingEditModalOpen, setMeetingEditModalOpen] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState<CallSession | null>(null);
    const [scheduledCalls, setScheduledCalls] = useState<CallSession[]>([]);

    // Filters
    const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
    const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');

    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, "calls"), 
            where("participants", "array-contains", currentUser.uid),
            where("isMeeting", "==", true)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallSession));
            setScheduledCalls(calls);
        });
        
        return () => unsubscribe();
    }, [currentUser]);

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startDay = startOfMonth.getDay();
    
    // ALWAYS display 6 weeks (42 days) to ensure consistency and prevent layout shifts
    const totalSlots = 42;
    
    const days = Array.from({ length: totalSlots }, (_, i) => {
        const dayOffset = i - startDay + 1;
        // Create date object (handles negative/overflow automatically)
        return new Date(currentDate.getFullYear(), currentDate.getMonth(), dayOffset);
    });

    const changeDate = (offset: number) => {
        setCurrentDate(prev => {
            if (viewMode === 'month') {
                return new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
            } else {
                const newDate = new Date(prev);
                newDate.setDate(prev.getDate() + (offset * 7));
                return newDate;
            }
        });
    };

    const allTasks = useMemo(() => projects.flatMap(p => p.folders.flatMap(f => f.tasks)), [projects]);
    
    // Filtered Tasks Logic
    const filteredTasks = useMemo(() => {
        return allTasks.filter(task => {
            const projectMatch = selectedProjectFilter === 'all' || task.projectId === selectedProjectFilter;
            const tagMatch = selectedTagFilter === 'all' || (task.tags && task.tags.includes(selectedTagFilter));
            return projectMatch && tagMatch;
        });
    }, [allTasks, selectedProjectFilter, selectedTagFilter]);

    const uniqueTags = useMemo(() => {
        const tags = new Set<string>();
        allTasks.forEach(t => t.tags?.forEach(tag => tags.add(tag)));
        return Array.from(tags);
    }, [allTasks]);

    const handleTaskClick = (task: Task) => {
        setEditingTask(task);
        setTaskEditModalOpen(true);
    };

    const handleJoinCall = (callId: string) => {
        joinMeeting(callId);
    };

    const handleMeetingClick = (call: CallSession) => {
        setSelectedMeeting(call);
        setMeetingEditModalOpen(true);
    }

    const handleDayClick = (dateStr: string) => {
        setNewTaskModalDate(dateStr);
        setNewTaskModalOpen(true);
    }

    const getMonthTitle = () => new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(currentDate);
    
    // Drag and Drop Logic
    const formatLocalDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("taskId", taskId);
        e.dataTransfer.setData("itemType", "task");
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>, date: Date) => {
        e.preventDefault();
        e.stopPropagation();
        const taskId = e.dataTransfer.getData("taskId") || e.dataTransfer.getData("itemId");
        const task = allTasks.find(t => t.id === taskId);
        if (task && date) {
            const newDateStr = formatLocalDate(date);
            if (task.date !== newDateStr) {
                await updateTask({ ...task, date: newDateStr });
            }
        }
    };
    
    // Get day names dynamically based on locale
    const weekDayNames = useMemo(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(d.setDate(diff));
        const days = [];
        // If we want Sunday start (as standard in calendar view):
        // Reset to a known Sunday. Jan 1 2023 was Sunday.
        const sunday = new Date(2023, 0, 1); 
        for(let i=0; i<7; i++) {
             const nextDay = new Date(sunday);
             nextDay.setDate(sunday.getDate() + i);
             days.push(new Intl.DateTimeFormat(language, { weekday: 'short' }).format(nextDay));
        }
        return days;
    }, [language]);

    return (
        <div className="h-full flex flex-col p-0 bg-light-bg dark:bg-dark-bg overflow-hidden animate-fade-in">
            <ScheduleMeetingModal isOpen={isScheduleModalOpen} onClose={() => setScheduleModalOpen(false)} />
            <MeetingEditModal isOpen={isMeetingEditModalOpen} onClose={() => setMeetingEditModalOpen(false)} meeting={selectedMeeting} />
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 flex-shrink-0 px-4 pt-4 gap-2">
                <div className="flex items-center gap-2 sm:gap-4">
                    <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white capitalize">{getMonthTitle()}</h1>
                    <div className="flex bg-white dark:bg-neutral-800 rounded-lg p-1 shadow-sm border border-neutral-200 dark:border-neutral-700">
                        <button onClick={() => changeDate(-1)} className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md"><Icon name="chevronLeft" className="w-4 h-4"/></button>
                        <button onClick={() => setCurrentDate(new Date())} className="px-2 py-1 text-xs font-bold hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md">Hoy</button>
                        <button onClick={() => changeDate(1)} className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md"><Icon name="chevronLeft" className="w-4 h-4 rotate-180"/></button>
                    </div>
                </div>
                
                <div className="flex flex-nowrap items-center gap-1.5 w-full sm:w-auto overflow-x-auto no-scrollbar sm:overflow-visible">
                    {/* Filters */}
                    <select 
                        value={selectedProjectFilter} 
                        onChange={(e) => setSelectedProjectFilter(e.target.value)} 
                        className="p-1.5 rounded-lg text-[10px] sm:text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex-shrink-0 max-w-[100px] sm:max-w-none"
                    >
                        <option value="all">Todos</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    
                    <select 
                        value={selectedTagFilter} 
                        onChange={(e) => setSelectedTagFilter(e.target.value)} 
                        className="p-1.5 rounded-lg text-[10px] sm:text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex-shrink-0 max-w-[80px] sm:max-w-none"
                    >
                        <option value="all">Tags</option>
                        {uniqueTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                    </select>

                    {/* Desktop View Toggle & Buttons */}
                    <div className="flex bg-white dark:bg-neutral-800 p-1 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 hidden sm:flex items-center gap-1">
                        <button onClick={() => setViewMode('month')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${viewMode === 'month' ? 'bg-brand-primary text-white' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'}`}>Mes</button>
                        <button onClick={() => setViewMode('week')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${viewMode === 'week' ? 'bg-brand-primary text-white' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'}`}>Semana</button>
                         <Button onClick={() => setScheduleModalOpen(true)} className="!px-3 !py-1.5 flex-shrink-0 text-[10px] sm:text-xs bg-brand-secondary text-white hover:bg-brand-primary ml-2" size="sm">
                            <Icon name="calendar" className="w-3 h-3 sm:w-4 sm:h-4" /> Programar
                        </Button>
                    </div>
                    
                    {/* Mobile View Toggle */}
                    <div className="sm:hidden flex bg-white dark:bg-neutral-800 p-1 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 flex-shrink-0">
                         <button onClick={() => setViewMode(viewMode === 'month' ? 'week' : 'month')} className="p-1.5 rounded-md text-xs font-bold">
                             <Icon name={viewMode === 'month' ? 'calendar' : 'list'} className="w-4 h-4" />
                         </button>
                    </div>

                    {/* Mobile Add Button */}
                    <Button onClick={() => setNewTaskModalOpen(true)} className="shadow-sm hover:scale-105 transition-transform !px-2 !py-1.5 flex-shrink-0 text-[10px] sm:text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-white" size="sm">
                        <Icon name="plus" className="w-3 h-3" />
                    </Button>
                    
                     {/* Mobile Schedule Button (Hidden on desktop as it's moved inside the toggle group) */}
                    <Button onClick={() => setScheduleModalOpen(true)} className="shadow-lg hover:scale-105 transition-transform !px-3 !py-1.5 flex-shrink-0 text-[10px] sm:text-xs sm:hidden">
                        <Icon name="calendar" className="w-3 h-3" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white dark:bg-dark-surface shadow-none border-t border-neutral-200 dark:border-neutral-800 p-0 relative">
                {viewMode === 'month' ? (
                    <div className="grid grid-cols-7 grid-rows-[auto_1fr] h-full gap-px bg-neutral-200 dark:bg-neutral-800">
                        {weekDayNames.map(day => (
                            <div key={day} className="bg-white dark:bg-dark-surface text-center font-bold text-neutral-400 uppercase text-[10px] sm:text-xs tracking-wider py-2">{day}</div>
                        ))}
                        
                        {/* Forces 6 rows to ensure consistency even for months spanning 6 weeks */}
                        <div className="grid grid-cols-7 grid-rows-6 col-span-7 h-full gap-px bg-neutral-200 dark:bg-neutral-800">
                            {days.map((date, i) => {
                                const dateString = toLocalDateString(date);
                                const isToday = new Date().toDateString() === date.toDateString();
                                const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                                const dayTasks = filteredTasks.filter(t => t.date === dateString);
                                const dayCalls = scheduledCalls.filter(c => c.scheduledAt && c.scheduledAt.startsWith(dateString));
                                const holiday = holidays[dateString];

                                return (
                                    <div 
                                        key={i} 
                                        className={`group relative flex flex-col p-1 transition-all hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer min-h-[60px] ${isCurrentMonth ? 'bg-white dark:bg-dark-surface' : 'bg-gray-50 dark:bg-black/40 opacity-60'}`}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, date)}
                                        onClick={() => handleDayClick(dateString)}
                                    >
                                        <span className={`text-[10px] sm:text-xs font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-brand-primary text-white' : isCurrentMonth ? 'text-neutral-700 dark:text-neutral-300' : 'text-neutral-400 dark:text-neutral-600'}`}>
                                            {date.getDate()}
                                        </span>
                                        {holiday && <div className="text-[8px] text-green-600 font-bold mb-0.5 truncate">{holiday}</div>}
                                        
                                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
                                            {dayCalls.map(call => (
                                                <div 
                                                    key={call.id} 
                                                    className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1 rounded text-[8px] font-bold truncate cursor-pointer hover:opacity-80 border-l-2 border-purple-500 flex items-center justify-between group/call"
                                                    onClick={(e) => { e.stopPropagation(); handleMeetingClick(call); }}
                                                    title={`Reunión: ${call.title}`}
                                                >
                                                    <span className="truncate flex items-center gap-1"><Icon name="video" className="w-2 h-2"/> {call.scheduledAt?.split('T')[1]?.slice(0,5)}</span>
                                                </div>
                                            ))}
                                            {dayTasks.map(task => (
                                                <div 
                                                    key={task.id} 
                                                    className="px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium truncate cursor-pointer text-white hover:opacity-90 shadow-sm flex items-center justify-between"
                                                    style={{ backgroundColor: getProjectColor(task.projectId) }}
                                                    onClick={(e) => { e.stopPropagation(); handleTaskClick(task); }}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, task.id)}
                                                >
                                                    <span className="truncate">{task.title}</span>
                                                    {task.time && <span className="text-[8px] opacity-90 ml-1 font-bold">{task.time}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <WeekView 
                        currentDate={currentDate} 
                        tasks={filteredTasks} 
                        onTaskDateChange={(taskId, newDate) => {
                            const task = allTasks.find(t => t.id === taskId);
                            if (task) updateTask({ ...task, date: newDate });
                        }}
                        onTaskClick={handleTaskClick}
                        language={language}
                    />
                )}
            </div>
        </div>
    );
};

export default GlobalCalendar;
