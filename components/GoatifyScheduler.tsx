
import React, { useState, useContext, useEffect, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import Button from './ui/Button';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Spinner from './ui/Spinner';
import { collection, addDoc, query, where, getDocs, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { MeetingRequest, UserProfile, CallSession } from '../types';

interface GoatifySchedulerProps {
    isPublic?: boolean;
    username?: string;
}

const GoatifyScheduler: React.FC<GoatifySchedulerProps> = ({ isPublic = false, username }) => {
    const { userProfile, currentUser, updateUserProfile, setToastNotification, setCurrentView, isOnboardingComplete } = useContext(AppContext);
    const [ownerProfile, setOwnerProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(isPublic);
    
    // Booking State
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [bookingStep, setBookingStep] = useState<'date' | 'time' | 'details'>('date');
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [selectedTime, setSelectedTime] = useState<string>('');
    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientWhatsapp, setClientWhatsapp] = useState('');
    const [meetingNotes, setMeetingNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bookingStatus, setBookingStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [createdCallId, setCreatedCallId] = useState<string | null>(null);
    useEffect(() => {
        if (currentUser) {
            setClientName(currentUser.displayName || userProfile.name || '');
            setClientEmail(currentUser.email || userProfile.email || '');
            setClientWhatsapp(userProfile.phoneNumber || '');
        }
    }, [currentUser, userProfile]);

    // Config State (for owner)
    const [config, setConfig] = useState(userProfile.schedulingConfig || {
        enabled: false,
        workingDays: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30
    });
    const [tempUsername, setTempUsername] = useState(userProfile.username || '');

    // Fetch owner profile if public
    useEffect(() => {
        if (isPublic && username) {
            const fetchOwner = async () => {
                try {
                    const q = query(collection(db, 'users'), where('username', '==', username));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        setOwnerProfile(snap.docs[0].data() as UserProfile);
                    }
                } catch (e) {
                    console.error("Error fetching owner profile:", e);
                } finally {
                    setLoading(false);
                }
            };
            fetchOwner();
        } else if (!isPublic) {
            setOwnerProfile(userProfile);
        }
    }, [isPublic, username, userProfile]);

    const handleSaveConfig = async () => {
        if (!currentUser) return;
        try {
            // Check if username is taken if changed
            if (tempUsername !== userProfile.username) {
                const q = query(collection(db, 'users'), where('username', '==', tempUsername));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    setToastNotification({ title: "Error", message: "El nombre de usuario ya está en uso.", icon: 'close' });
                    return;
                }
            }

            await updateUserProfile(currentUser.uid, {
                username: tempUsername,
                schedulingConfig: config
            });
            setToastNotification({ title: "Guardado", message: "Configuración actualizada correctamente.", icon: 'check' });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo guardar la configuración.", icon: 'close' });
        }
    };

    const [existingMeetings, setExistingMeetings] = useState<CallSession[]>([]);

    // Fetch existing meetings for the selected date
    useEffect(() => {
        if (!ownerProfile || !selectedDate) return;
        const q = query(
            collection(db, 'calls'),
            where('participants', 'array-contains', ownerProfile.uid),
            where('status', 'in', ['scheduled', 'active'])
        );
        const unsub = onSnapshot(q, (snap) => {
            const meetings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallSession));
            setExistingMeetings(meetings.filter(m => m.scheduledAt?.startsWith(selectedDate)));
        });
        return () => unsub();
    }, [ownerProfile, selectedDate]);

    const generateTimeSlots = (date: string, profile: UserProfile) => {
        if (!profile.schedulingConfig) return [];
        const { startTime, endTime, slotDuration } = profile.schedulingConfig;
        const slots: string[] = [];
        let current = new Date(`${date}T${startTime}:00`);
        const end = new Date(`${date}T${endTime}:00`);

        while (current < end) {
            const timeStr = current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            
            // Check if slot is occupied
            const isOccupied = existingMeetings.some(m => {
                const mStart = new Date(m.scheduledAt!);
                const mEnd = new Date(mStart.getTime() + (m.maxDurationMinutes || 30) * 60000);
                const slotStart = new Date(`${date}T${timeStr}:00`);
                const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
                return (slotStart < mEnd && slotEnd > mStart);
            });

            if (!isOccupied) {
                slots.push(timeStr);
            }
            current.setMinutes(current.getMinutes() + slotDuration);
        }
        return slots;
    };

    const [currentCalMonth, setCurrentCalMonth] = useState(new Date());

    const handlePrevMonth = () => setCurrentCalMonth(new Date(currentCalMonth.getFullYear(), currentCalMonth.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentCalMonth(new Date(currentCalMonth.getFullYear(), currentCalMonth.getMonth() + 1, 1));

    const getDaysArray = () => {
        const daysInMonth = new Date(currentCalMonth.getFullYear(), currentCalMonth.getMonth() + 1, 0).getDate();
        const startDay = new Date(currentCalMonth.getFullYear(), currentCalMonth.getMonth(), 1).getDay();
        const arr = [];
        for (let i = 0; i < startDay; i++) arr.push(null);
        for (let i = 1; i <= daysInMonth; i++) arr.push(i);
        return arr;
    };

    const handleRequestMeeting = async () => {
        if (!ownerProfile) return;

        setIsSubmitting(true);
        try {
            const scheduledAt = `${selectedDate}T${selectedTime}:00`;
            const duration = ownerProfile.schedulingConfig?.slotDuration || 30;
            
            let mappingUid = currentUser?.uid;
            if (!mappingUid && clientEmail) {
                const usersRef = collection(db, 'users');
                const qUser = query(usersRef, where('email', '==', clientEmail.toLowerCase()));
                const snap = await getDocs(qUser);
                if (!snap.empty) {
                    mappingUid = snap.docs[0].id;
                }
            }

            const participantsArr = [ownerProfile.uid];
            if (mappingUid && mappingUid !== ownerProfile.uid) {
                participantsArr.push(mappingUid);
            }

            const activeCallerUid = mappingUid || 'guest';

            const callData: Partial<CallSession> = {
                title: `Reunión con ${clientName || currentUser?.displayName || 'Cliente'}`,
                description: meetingNotes || 'Reunión agendada vía Goatify Scheduler',
                scheduledAt,
                maxDurationMinutes: duration,
                participants: participantsArr,
                status: 'scheduled',
                type: 'video',
                adminId: ownerProfile.uid,
                isActive: false,
                isMeeting: true,
                caller: {
                    uid: activeCallerUid,
                    name: clientName || currentUser?.displayName || 'Cliente',
                    avatarUrl: currentUser?.photoURL || null
                },
                guestInfo: {
                    name: clientName,
                    email: clientEmail.toLowerCase(),
                    whatsapp: clientWhatsapp,
                    notes: meetingNotes
                },
                source: 'scheduler',
                createdAt: new Date().toISOString(),
                isPrivate: true,
            };

            const docRef = await addDoc(collection(db, 'calls'), callData);
            setCreatedCallId(docRef.id);

            // Intentar enviar correo de confirmación
            try {
                const meetingLink = `${window.location.origin}/#/calls/${docRef.id}`;
                await fetch('/api/scheduler/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ownerId: ownerProfile.uid,
                        ownerEmail: ownerProfile.email,
                        guestEmail: clientEmail.toLowerCase(),
                        guestName: clientName || 'Invitado',
                        date: selectedDate,
                        time: selectedTime,
                        meetingLink,
                        notes: meetingNotes
                    })
                });
            } catch (err) {
                console.warn("Could not send confirmation email:", err);
            }
            
            const now = new Date().toISOString();
            
            // Add an in-app priority push notification so it pops up immediately if active
            await addDoc(collection(db, `users/${ownerProfile.uid}/notifications`), {
                fromUser: {
                    uid: activeCallerUid,
                    name: clientName || 'Invitado'
                },
                title: '¡Nueva Cita Agendada!',
                text: `**${clientName || 'Alguien'}** agendó una cita.<br/>📅 ${selectedDate} • ⏰ ${selectedTime}<br/>📧 ${clientEmail}<br/>📱 ${clientWhatsapp}<br/>📝 ${meetingNotes || 'Sin notas'}`,
                type: 'general',
                link: `calls/${docRef.id}`,
                createdAt: now,
                timestamp: now,
                read: false
            });

            setBookingStatus('success');
            setToastNotification({ title: "¡Cita Confirmada!", message: "La reunión ha sido agendada con éxito.", icon: 'check' });
        } catch (e) {
            console.error(e);
            setBookingStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;
    if (isPublic && !ownerProfile) return <div className="text-center p-10"><Icon name="close" className="w-12 h-12 mx-auto text-red-500 mb-4" /><p className="text-xl font-bold">Usuario no encontrado</p></div>;

    const publicLink = `${window.location.origin}/#/s/${userProfile.username}`;

    return (
        <div className={isPublic ? "absolute inset-0 h-full w-full overflow-y-auto touch-action-pan-y bg-neutral-50 dark:bg-dark-bg p-4 md:p-8 custom-scrollbar" : "max-w-6xl mx-auto p-4 lg:p-8"}>
            {!isPublic ? (
                <div className="space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-3xl font-black tracking-tight text-brand-primary dark:text-white uppercase">Goatify Scheduler</h2>
                            <p className="text-light-text-secondary dark:text-dark-text-secondary font-medium">Gestiona tu disponibilidad y comparte tu link de agendamiento.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button onClick={() => window.open(publicLink, '_blank')} variant="outline" className="rounded-xl">
                                <Icon name="expand" className="w-4 h-4 mr-2" /> Ver mi link
                            </Button>
                            <Button onClick={handleSaveConfig} className="rounded-xl bg-brand-primary shadow-lg shadow-brand-primary/20">
                                Guardar Cambios
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Config Card */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white dark:bg-dark-surface p-6 rounded-[2rem] border border-light-border dark:border-dark-border shadow-sm">
                                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                    <Icon name="settings" className="w-5 h-5 text-brand-primary" /> Configuración General
                                </h3>
                                
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Nombre de Usuario (URL Personal)</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-neutral-400 font-medium">goatify.ia/#/s/</span>
                                            <Input 
                                                value={tempUsername} 
                                                onChange={(e) => setTempUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                                placeholder="tu-nombre"
                                                className="flex-1"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                                        <div>
                                            <p className="font-bold text-brand-primary">Activar Agendador</p>
                                            <p className="text-xs text-brand-primary/70">Permite que otros agenden reuniones contigo.</p>
                                        </div>
                                        <button 
                                            onClick={() => setConfig({...config, enabled: !config.enabled})}
                                            className={`w-12 h-6 rounded-full transition-colors relative ${config.enabled ? 'bg-brand-primary' : 'bg-neutral-300 dark:bg-neutral-700'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.enabled ? 'left-7' : 'left-1'}`}></div>
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Hora de Inicio</label>
                                            <Input type="time" value={config.startTime} onChange={(e) => setConfig({...config, startTime: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Hora de Fin</label>
                                            <Input type="time" value={config.endTime} onChange={(e) => setConfig({...config, endTime: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Duración (minutos)</label>
                                            <select 
                                                value={config.slotDuration} 
                                                onChange={(e) => setConfig({...config, slotDuration: parseInt(e.target.value)})}
                                                className="w-full p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                                            >
                                                <option value={15}>15 minutos</option>
                                                <option value={30}>30 minutos</option>
                                                <option value={45}>45 minutos</option>
                                                <option value={60}>60 minutos</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Días Laborales</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        const newDays = config.workingDays.includes(i)
                                                            ? config.workingDays.filter(d => d !== i)
                                                            : [...config.workingDays, i];
                                                        setConfig({...config, workingDays: newDays});
                                                    }}
                                                    className={`w-10 h-10 rounded-xl font-bold transition-all ${config.workingDays.includes(i) ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'}`}
                                                >
                                                    {day}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Preview Card */}
                        <div className="space-y-6">
                            <div className="bg-gradient-to-br from-brand-primary to-brand-secondary p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                                <Icon name="calendar" className="w-12 h-12 mb-6" />
                                <h4 className="text-2xl font-black uppercase tracking-tight leading-none mb-2">Tu Enlace Público</h4>
                                <p className="text-white/70 text-sm mb-6 font-medium">Comparte este link para que tus clientes agenden directamente contigo.</p>
                                <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 flex items-center justify-between gap-2">
                                    <span className="text-xs font-mono truncate opacity-80">{publicLink}</span>
                                    <button onClick={() => { navigator.clipboard.writeText(publicLink); setToastNotification({ title: "Copiado", message: "Enlace copiado al portapapeles.", icon: 'copy' }); }} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                                        <Icon name="copy" className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>


                        </div>
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto bg-white dark:bg-dark-surface rounded-[3rem] shadow-2xl border border-light-border dark:border-dark-border flex flex-col overflow-hidden min-h-[500px] mb-12">
                    {/* Horizontal Header Info */}
                    <div className="bg-neutral-50 dark:bg-neutral-900 p-4 lg:p-5 border-b border-light-border dark:border-dark-border flex items-center justify-between gap-4 text-left relative z-10 shrink-0">
                        <div className="flex items-center gap-4">
                            {ownerProfile.avatarUrl ? (
                                <img src={ownerProfile.avatarUrl} alt={ownerProfile.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shadow-sm" />
                            ) : (
                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-primary flex items-center justify-center text-white text-2xl font-black shadow-sm">
                                    {ownerProfile.name[0]}
                                </div>
                            )}
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white leading-tight">{ownerProfile.name}</h3>
                                <p className="text-neutral-500 font-medium text-xs sm:text-sm mt-0.5">{ownerProfile.headline || "Goatify Professional"}</p>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-neutral-500">
                            <div className="flex items-center gap-1.5 bg-white dark:bg-neutral-800 px-2.5 py-1 rounded-md shadow-sm border border-neutral-100 dark:border-neutral-700">
                                <Icon name="clock" className="w-3 h-3" />
                                <span className="font-bold text-[10px] uppercase tracking-wider">{ownerProfile.schedulingConfig?.slotDuration} Min</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white dark:bg-neutral-800 px-2.5 py-1 rounded-md shadow-sm text-brand-primary border border-brand-primary/10">
                                <Icon name="video" className="w-3 h-3" />
                                <span className="font-bold text-[10px] uppercase tracking-wider">Meets HD</span>
                            </div>
                        </div>
                    </div>

                    {/* Booking Flow */}
                    <div className="p-6 lg:p-10 flex-1 flex flex-col">
                        <div className="w-full h-full flex flex-col justify-start">
                        {bookingStatus === 'success' ? (
                            <div className="flex flex-col animate-fade-in text-left max-w-4xl mx-auto w-full py-4">
                                <div className="flex items-center justify-center mb-6">
                                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600">
                                        <Icon name="check" className="w-8 h-8" />
                                    </div>
                                </div>
                                <h4 className="text-2xl font-black text-neutral-900 dark:text-white mb-2 text-center uppercase tracking-tight">¡Cita Confirmada!</h4>
                                <p className="text-neutral-500 font-medium mb-8 text-center">Tu reunión con {ownerProfile.name} ha sido agendada con éxito directamente en su agenda.</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    {/* Left Column - Details */}
                                    <div className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 space-y-5">
                                        <h5 className="text-[10px] uppercase tracking-widest text-neutral-400 font-black border-b border-neutral-200 dark:border-neutral-800 pb-2">Detalles de tu reunión</h5>
                                        
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                                                <Icon name="calendar" className="w-4 h-4 text-brand-primary" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Día y Hora</p>
                                                <p className="font-bold text-sm dark:text-white leading-none">{selectedDate} a las {selectedTime}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                                                <Icon name="users" className="w-4 h-4 text-brand-primary" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Participantes</p>
                                                <p className="font-bold text-sm dark:text-white leading-none">{ownerProfile.name} y tú ({clientName})</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                                                <Icon name="video" className="w-4 h-4 text-brand-primary" />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Enlace (Goatify Meets)</p>
                                                <a href={`${window.location.origin}/#/calls/${createdCallId}`} target="_blank" rel="noopener noreferrer" className="font-bold text-sm text-brand-primary truncate block hover:underline leading-none">
                                                    {window.location.origin}/#/calls/{createdCallId}
                                                </a>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column - Actions */}
                                    <div className="flex flex-col gap-6">
                                        <div className="flex flex-col gap-3">
                                            <Button 
                                                onClick={() => {
                                                    const details = `¡Cita Confirmada con ${ownerProfile.name}!\n\n📅 Fecha: ${selectedDate}\n⏰ Hora: ${selectedTime}\n🎥 Enlace a la reunión: ${window.location.origin}/#/calls/${createdCallId}`;
                                                    navigator.clipboard.writeText(details);
                                                    setToastNotification({ title: "Copiado", message: "Detalles copiados al portapapeles", icon: 'copy' });
                                                }}
                                                variant="outline" 
                                                className="w-full justify-center rounded-xl font-bold py-4 bg-transparent border-brand-primary/20 hover:bg-brand-primary/5 text-brand-primary"
                                            >
                                                <Icon name="copy" className="w-4 h-4 mr-2" /> Copiar la información
                                            </Button>
                                            <Button 
                                                onClick={() => window.open(`http://ia.goatify.app`, '_blank')}
                                                className="w-full justify-center rounded-xl font-bold py-4 shadow-lg shadow-brand-primary/20 border-brand-primary"
                                            >
                                                <Icon name="external-link" className="w-4 h-4 mr-2" /> Ir a la App (ia.goatify.app)
                                            </Button>
                                        </div>

                                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-5 flex gap-4 items-start">
                                            <Icon name="info" className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-amber-800 dark:text-amber-400 font-medium leading-relaxed">
                                                <span className="font-black block uppercase tracking-widest mb-1.5 text-amber-600 dark:text-amber-500">💡 Nota Estratégica</span>
                                                Para ver tu reunión en el calendario, cancelarla o modificarla entra directamente a <strong className="text-amber-900 dark:text-amber-200">ia.goatify.app</strong> usando este mismo correo electrónico (<strong className="text-amber-900 dark:text-amber-200">{clientEmail}</strong>). Tu cuenta ya te está esperando allí con esta reunión agendada.
                                            </p>
                                        </div>
                                        
                                        <div className="text-center pt-2">
                                            <button onClick={() => {
                                                setBookingStatus('idle');
                                                setSelectedDate('');
                                                setSelectedTime('');
                                                setCreatedCallId(null);
                                                setBookingStep('date');
                                            }} className="text-[10px] font-black text-neutral-400 hover:text-brand-primary uppercase tracking-widest transition-colors flex items-center justify-center gap-2 mx-auto">
                                                <Icon name="refresh-cw" className="w-3 h-3" /> Agendar otra reunión
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-3xl mx-auto w-full">
                                {(bookingStep === 'date' || bookingStep === 'time') && (
                                    <div className="flex items-center justify-between mb-8">
                                        <h4 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">
                                            {bookingStep === 'date' ? 'Selecciona Fecha' : 'Selecciona Hora'}
                                        </h4>
                                        <span className="text-[10px] font-black uppercase text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
                                            Paso {bookingStep === 'date' ? '1' : '2'} de 3
                                        </span>
                                    </div>
                                )}
                                {bookingStep === 'details' && (
                                    <div className="flex items-center justify-between mb-8">
                                        <h4 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Tus Detalles</h4>
                                        <span className="text-[10px] font-black uppercase text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">Paso 3 de 3</span>
                                    </div>
                                )}

                                {bookingStep === 'date' && (
                                    <div className="space-y-6 animate-fade-in w-full max-w-sm mx-auto">
                                        <div className="bg-white dark:bg-dark-surface border border-neutral-200 dark:border-neutral-800 rounded-[2rem] p-6 shadow-sm">
                                            <div className="flex items-center justify-between mb-6">
                                                <button onClick={handlePrevMonth} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"><Icon name="chevron-left" className="w-5 h-5 text-neutral-500" /></button>
                                                <span className="font-bold uppercase tracking-widest text-sm dark:text-white">
                                                    {currentCalMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                                                </span>
                                                <button onClick={handleNextMonth} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"><Icon name="chevron-right" className="w-5 h-5 text-neutral-500" /></button>
                                            </div>

                                            <div className="grid grid-cols-7 gap-2 text-center mb-4">
                                                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(d => (
                                                    <div key={d} className="text-[10px] font-black text-neutral-400">{d}</div>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-7 gap-2">
                                                {getDaysArray().map((day, i) => {
                                                    if (!day) return <div key={`empty-${i}`} className="p-2"></div>;

                                                    const paddedMonth = String(currentCalMonth.getMonth() + 1).padStart(2, '0');
                                                    const paddedDay = String(day).padStart(2, '0');
                                                    const currentIterDateStr = `${currentCalMonth.getFullYear()}-${paddedMonth}-${paddedDay}`;
                                                    const currentIterDateObj = new Date(currentCalMonth.getFullYear(), currentCalMonth.getMonth(), day);
                                                    
                                                    const isWorkingDay = ownerProfile.schedulingConfig?.workingDays?.includes(currentIterDateObj.getDay());
                                                    const isPast = currentIterDateStr < new Date().toISOString().split('T')[0];
                                                    const disabled = !isWorkingDay || isPast;
                                                    
                                                    const isSelected = selectedDate === currentIterDateStr;

                                                    return (
                                                        <button 
                                                            key={i} 
                                                            disabled={disabled}
                                                            onClick={() => {
                                                                setSelectedDate(currentIterDateStr);
                                                                setSelectedTime('');
                                                                setBookingStep('time');
                                                            }}
                                                            className={`aspect-square rounded-full font-bold text-sm transition-all flex items-center justify-center
                                                                ${isSelected ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/30' : ''}
                                                                ${!isSelected && !disabled ? 'bg-neutral-50 dark:bg-neutral-900 hover:border-brand-primary border border-transparent dark:text-white' : ''}
                                                                ${disabled ? 'text-neutral-300 dark:text-neutral-700 cursor-not-allowed' : ''}
                                                            `}
                                                        >
                                                            {day}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {bookingStep === 'time' && (
                                    <div className="animate-slide-in-up space-y-6">
                                        <button onClick={() => setBookingStep('date')} className="text-xs font-bold text-brand-primary uppercase tracking-widest flex items-center gap-2 hover:opacity-80 transition-opacity">
                                            <Icon name="arrow-left" className="w-4 h-4" /> Volver al calendario
                                        </button>
                                        
                                        <div className="bg-neutral-50 dark:bg-neutral-900 rounded-[2rem] p-6 border border-neutral-200 dark:border-neutral-800">
                                            <p className="text-center font-bold text-neutral-500 mb-6 uppercase tracking-widest text-[10px]">
                                                Horarios disponibles para el <span className="text-brand-primary">{selectedDate}</span>
                                            </p>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                                {generateTimeSlots(selectedDate, ownerProfile).map(slot => (
                                                    <button
                                                        key={slot}
                                                        onClick={() => setSelectedTime(slot)}
                                                        className={`p-4 rounded-2xl font-bold transition-all border text-sm ${selectedTime === slot ? 'bg-brand-primary text-white border-brand-primary shadow-lg shadow-brand-primary/20' : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 hover:border-brand-primary dark:text-neutral-300'}`}
                                                    >
                                                        {slot}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="pt-4 flex gap-4">
                                            <Button 
                                                variant="outline"
                                                onClick={() => setBookingStep('date')}
                                                className="py-6 rounded-2xl font-black uppercase tracking-widest flex-[0.5]"
                                            >
                                                Volver
                                            </Button>
                                            <Button 
                                                disabled={!selectedTime}
                                                onClick={() => setBookingStep('details')}
                                                className="py-6 rounded-2xl font-black uppercase tracking-widest shadow-xl flex-1"
                                            >
                                                Siguiente Paso
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {bookingStep === 'details' && (
                                    <div className="space-y-6 animate-fade-in w-full max-w-3xl mx-auto">
                                        <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-white dark:bg-neutral-800 flex items-center justify-center text-brand-primary shadow-sm">
                                                <Icon name="calendar" className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black uppercase text-brand-primary leading-none mb-1">Resumen de Cita</p>
                                                <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">{selectedDate} a las {selectedTime}</p>
                                            </div>
                                            <button onClick={() => setBookingStep('time')} className="ml-auto p-2 text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="edit" className="w-4 h-4" /></button>
                                        </div>

                                        <div className="flex flex-col md:flex-row gap-6">
                                            <div className="flex-1 space-y-4">
                                                <div>
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Nombre Completo</label>
                                                    <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ej. Juan Pérez" className="rounded-xl" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Correo Electrónico</label>
                                                    <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="juan@ejemplo.com" className="rounded-xl" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">WhatsApp (Opcional)</label>
                                                    <Input value={clientWhatsapp} onChange={(e) => setClientWhatsapp(e.target.value)} placeholder="+51 999 999 999" className="rounded-xl" />
                                                </div>
                                            </div>
                                            <div className="flex-1 flex flex-col">
                                                <div className="flex-1 flex flex-col h-full">
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Notas Adicionales</label>
                                                    <Textarea value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} placeholder="¿De qué trata la reunión?" className="rounded-xl flex-1 resize-none min-h-[120px]" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-2 flex flex-col sm:flex-row gap-4">
                                            <Button variant="outline" onClick={() => setBookingStep('time')} className="w-full sm:w-1/3 py-6 rounded-2xl font-black uppercase tracking-widest">Atrás</Button>
                                            <Button 
                                                disabled={!clientName || !clientEmail || isSubmitting}
                                                onClick={handleRequestMeeting}
                                                className="w-full sm:w-2/3 py-6 rounded-2xl font-black uppercase tracking-widest shadow-xl"
                                            >
                                                {isSubmitting ? <Spinner size="sm" /> : 'Confirmar Cita'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GoatifyScheduler;
