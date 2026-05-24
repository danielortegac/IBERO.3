import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import type { Project, Note, LoyaltyClaim } from '../types';
import Spinner from './ui/Spinner';
import Icon from './Icon';
import Card from './ui/Card';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface PublicProjectPageProps {
    urlId: string;
}

const PublicProjectPage: React.FC<PublicProjectPageProps> = ({ urlId }) => {
    const [project, setProject] = useState<Project | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showScrollTop, setShowScrollTop] = useState(false);

    const [speakingSection, setSpeakingSection] = useState<string | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [speechRate, setSpeechRate] = useState(1.2);
    const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null);
    
    // Loyalty states
    const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);
    const [email, setEmail] = useState('');
    const [userClaims, setUserClaims] = useState<LoyaltyClaim[]>([]);
    const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
    const [claimStatus, setClaimStatus] = useState<{ type: 'success' | 'error', message: string, userExists?: boolean } | null>(null);
    const [isCheckingClaims, setIsCheckingClaims] = useState(false);
    const [hasCheckedClaims, setHasCheckedClaims] = useState(false);
    const [isRedeeming, setIsRedeeming] = useState(false);

    // Scheduling states
    const [showSchedulingModal, setShowSchedulingModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientWhatsapp, setClientWhatsapp] = useState('');
    const [meetingNotes, setMeetingNotes] = useState('');
    const [isSubmittingMeeting, setIsSubmittingMeeting] = useState(false);
    const [meetingStatus, setMeetingStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [schedulingStep, setSchedulingStep] = useState<'date' | 'details'>('date');

    const getLatinVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        // Prefer Mexican or US Spanish for "Latin" feel, fallback to any Spanish, then default
        return voices.find(v => v.lang === 'es-MX') || 
               voices.find(v => v.lang === 'es-US') || 
               voices.find(v => v.lang.startsWith('es')) || 
               null;
    };

    const handleSpeak = (text: string, sectionId: string) => {
        if (speakingSection === sectionId) {
            if (isPaused) {
                window.speechSynthesis.resume();
                setIsPaused(false);
            } else {
                window.speechSynthesis.pause();
                setIsPaused(true);
            }
        } else {
            window.speechSynthesis.cancel();
            
            // Split text into smaller chunks to avoid cutting off
            // Split by sentence endings first
            const rawChunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
            // Then split any chunk longer than 180 chars
            const safeChunks = rawChunks.flatMap(c => {
                if (c.length <= 180) return [c];
                return c.match(/.{1,180}(?:\s|$)/g) || [c];
            });

            safeChunks.forEach((chunk, index) => {
                const utterance = new SpeechSynthesisUtterance(chunk);
                const voice = getLatinVoice();
                if (voice) utterance.voice = voice;
                utterance.lang = 'es-ES';
                utterance.rate = speechRate;
                
                // Track state on the last chunk
                if (index === safeChunks.length - 1) {
                    utterance.onend = () => {
                        setSpeakingSection(null);
                        setIsPaused(false);
                        setCurrentUtterance(null);
                    };
                }
                
                utterance.onstart = () => {
                     setCurrentUtterance(utterance);
                };
                
                utterance.onerror = (e) => {
                     console.error("Speech synthesis error", e);
                     if (index === safeChunks.length - 1) {
                        setSpeakingSection(null);
                        setIsPaused(false);
                        setCurrentUtterance(null);
                     }
                };

                window.speechSynthesis.speak(utterance);
            });

            setSpeakingSection(sectionId);
            setIsPaused(false);
        }
    };

    const handleStop = () => {
        window.speechSynthesis.cancel();
        setSpeakingSection(null);
        setIsPaused(false);
        setCurrentUtterance(null);
    };

    const changeSpeed = () => {
        const newRate = speechRate >= 2 ? 1 : speechRate + 0.25;
        setSpeechRate(newRate);
        if (speakingSection && currentUtterance) {
            // To change rate while speaking, we must restart the utterance
            // This is a limitation of Web Speech API
            window.speechSynthesis.cancel();
            const newUtterance = new SpeechSynthesisUtterance(currentUtterance.text);
            newUtterance.voice = getLatinVoice();
            newUtterance.rate = newRate;
            newUtterance.onend = () => {
                setSpeakingSection(null);
                setIsPaused(false);
                setCurrentUtterance(null);
            };
            window.speechSynthesis.speak(newUtterance);
            setCurrentUtterance(newUtterance);
        }
    };

    useEffect(() => {
        // Load voices when they are ready (chrome requires this)
        window.speechSynthesis.onvoiceschanged = () => {
            // Just to ensure voices are loaded
        };
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const q = query(collection(db, 'projects'), where('publicLinkConfig.urlId', '==', urlId));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const projData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Project;
                    
                    if (projData.publicLinkConfig?.enabled) {
                        setProject(projData);
                        
                        // Fetch notes from subcollection
                        try {
                            const notesRef = collection(db, `projects/${projData.id}/notes`);
                            // Removed orderBy to avoid index issues. Sorting is handled client-side.
                            const notesSnapshot = await getDocs(notesRef);
                            const fetchedNotes = notesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note));
                            
                            // Merge with legacy notes if any
                            const legacyNotes = projData.notes || [];
                            const fetchedNoteIds = new Set(fetchedNotes.map(n => n.id));
                            const missingLegacyNotes = legacyNotes.filter(n => !fetchedNoteIds.has(n.id));
                            const combinedNotes = [...fetchedNotes, ...missingLegacyNotes];
                            
                            combinedNotes.sort((a, b) => {
                                const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                                const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                                return dateB - dateA;
                            });
                            
                            setNotes(combinedNotes);
                        } catch (noteErr) {
                            console.error("Error fetching notes for public page:", noteErr);
                            // Fallback to legacy notes if subcollection fetch fails
                            setNotes(projData.notes || []);
                        }

                    } else {
                        setError('Este enlace ha sido desactivado.');
                    }
                } else {
                    setError('Proyecto no encontrado.');
                }
            } catch (err) {
                console.error("Error fetching project:", err);
                setError('Error al cargar el proyecto.');
            } finally {
                setLoading(false);
            }
        };
        fetchProject();
    }, [urlId]);

    useEffect(() => {
        const container = document.getElementById('public-project-container');
        if (!container) return;

        const handleScroll = () => {
            setShowScrollTop(container.scrollTop > 300);
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [loading]);

    const handleDownloadPDF = async () => {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
            const element = document.getElementById('public-project-print-content');
            if (!element) return;
            const opt = {
                margin: 10,
                filename: `${project?.name || 'Proyecto'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            try {
                // @ts-ignore
                await html2pdf().set(opt).from(element).save();
            } catch (e) {
                console.error("Error generating PDF on mobile:", e);
                window.print(); // fallback
            }
        } else {
            window.print();
        }
    };

    const handleCheckClaims = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!email || !project) return;
        
        setIsCheckingClaims(true);
        try {
            const q = query(
                collection(db, 'claims'),
                where('projectId', '==', project.id),
                where('userEmail', '==', email.toLowerCase().trim()),
                where('status', '==', 'approved'),
                where('redeemed', '==', false)
            );
            const snapshot = await getDocs(q);
            const claims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoyaltyClaim));
            setUserClaims(claims);
            setHasCheckedClaims(true);
        } catch (err) {
            console.error("Error checking claims:", err);
        } finally {
            setIsCheckingClaims(false);
        }
    };

    const handleRedeemReward = async () => {
        const requiredVisits = project?.publicLinkConfig?.loyaltyProgram?.requiredVisits || project?.loyaltyConfig?.targetVisits || 10;
        if (!project || userClaims.length < requiredVisits) return;
        
        setIsRedeeming(true);
        try {
            const batchPromises = userClaims.map(claim => 
                updateDoc(doc(db, 'claims', claim.id), { redeemed: true, redeemedAt: new Date().toISOString() })
            );
            await Promise.all(batchPromises);
            
            // Send a notification/claim record? For now just reset local state
            setUserClaims([]);
            setClaimStatus({
                type: 'success',
                message: `¡Felicidades! Has reclamado tu recompensa: ${project.publicLinkConfig?.loyaltyProgram?.rewardName || project.loyaltyConfig?.rewardName || 'Premio'}. Tu tarjeta ha sido reiniciada.`
            });
        } catch (err) {
            console.error("Error redeeming reward:", err);
            setClaimStatus({ type: 'error', message: 'No se pudo procesar el reclamo. Intenta de nuevo.' });
        } finally {
            setIsRedeeming(false);
        }
    };

    const generateTimeSlots = (date: string) => {
        if (!project?.publicLinkConfig?.schedulingConfig) return [];
        const { startTime, endTime, slotDuration, workingDays } = project.publicLinkConfig.schedulingConfig;
        
        const dayOfWeek = new Date(date).getDay();
        // Adjust for UTC/Local mismatch if needed, but for simple selection this works
        if (!workingDays.includes(dayOfWeek)) return [];

        const slots = [];
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        
        let current = new Date();
        current.setHours(startH, startM, 0, 0);
        
        const end = new Date();
        end.setHours(endH, endM, 0, 0);

        while (current < end) {
            slots.push(current.toTimeString().slice(0, 5));
            current = new Date(current.getTime() + slotDuration * 60000);
        }
        return slots;
    };

    const handleRequestMeeting = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project || !selectedTime || !clientName || !clientEmail) return;

        setIsSubmittingMeeting(true);
        setMeetingStatus(null);

        try {
            const meetingData = {
                projectId: project.id,
                projectName: project.name,
                ownerId: project.ownerId,
                clientName,
                clientEmail,
                clientWhatsapp,
                requestedAt: `${selectedDate}T${selectedTime}:00`,
                status: 'pending',
                notes: meetingNotes,
                createdAt: new Date().toISOString()
            };

            await addDoc(collection(db, 'meetingRequests'), meetingData);

            setMeetingStatus({
                type: 'success',
                message: '¡Solicitud enviada! El dueño del proyecto revisará tu propuesta y te contactará pronto.'
            });
            
            // Reset form
            setClientName('');
            setClientEmail('');
            setClientWhatsapp('');
            setMeetingNotes('');
            setSelectedTime(null);
        } catch (err) {
            console.error("Error requesting meeting:", err);
            setMeetingStatus({
                type: 'error',
                message: 'Hubo un error al enviar la solicitud. Por favor intenta de nuevo.'
            });
        } finally {
            setIsSubmittingMeeting(false);
        }
    };

    const handleRegisterConsumption = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !project) return;

        setIsSubmittingClaim(true);
        setClaimStatus(null);

        try {
            // 1. Check if email exists in users
            const userQuery = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
            const userSnapshot = await getDocs(userQuery);
            const userExists = !userSnapshot.empty;

            // 2. Create the claim
            const claimData: any = {
                projectId: project.id,
                projectName: project.name,
                userEmail: email.toLowerCase().trim(),
                status: 'pending',
                redeemed: false,
                createdAt: new Date().toISOString(),
                rewardName: project.publicLinkConfig?.loyaltyProgram?.rewardName || project.loyaltyConfig?.rewardName || 'Recompensa',
                targetVisits: project.publicLinkConfig?.loyaltyProgram?.requiredVisits || project.loyaltyConfig?.targetVisits || 10
            };

            if (userExists) {
                claimData.userId = userSnapshot.docs[0].id;
            }

            // Add ownerId for security rules
            const finalClaimData = {
                ...claimData,
                ownerId: project.ownerId,
                timestamp: serverTimestamp()
            };

            const claimRef = await addDoc(collection(db, 'loyaltyClaims'), finalClaimData);
            const claimId = claimRef.id;

            // 3. Notify owner with ACTION BUTTONS
            try {
                await addDoc(collection(db, `users/${project.ownerId}/notifications`), {
                    type: 'loyalty_claim',
                    text: `🎫 **Nueva Solicitud de Visita:** ${email} ha solicitado registrar una visita en **${project.name}**.`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    link: `/#projects/${project.id}/loyalty`,
                    fromUser: { uid: 'system_loyalty', name: 'Goatify Loyalty', avatarUrl: null },
                    metadata: { 
                        claimId, 
                        projectId: project.id,
                        userEmail: email.toLowerCase().trim()
                    }
                });
            } catch (notifErr) {
                console.error("Error notifying owner:", notifErr);
            }

            // 4. Send Confirmation Email to User
            fetch('/api/loyalty/registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerId: project.ownerId,
                    projectName: project.name,
                    userEmail: email.toLowerCase().trim(),
                    rewardName: claimData.rewardName,
                    targetVisits: project.publicLinkConfig?.loyaltyProgram?.requiredVisits || project.loyaltyConfig?.targetVisits || 10
                })
            }).catch(err => console.error("Error triggering registration email", err));

            setClaimStatus({
                type: 'success',
                message: '¡Listo! Enviamos la solicitud al dueño. Te hemos enviado un correo de confirmación. Si aún no tienes cuenta, regístrate con este mismo correo para ver tus puntos acumulados.',
                userExists
            });
        } catch (err) {
            console.error("Error registering consumption:", err);
            setClaimStatus({
                type: 'error',
                message: 'Hubo un error al enviar la solicitud. Por favor intenta de nuevo.'
            });
        } finally {
            setIsSubmittingClaim(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
                <Spinner className="w-8 h-8 text-brand-primary" />
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col items-center justify-center p-4 text-center">
                <Icon name="close" className="w-16 h-16 text-red-500 mb-4" />
                <h1 className="text-2xl font-black mb-2">Oops!</h1>
                <p className="text-neutral-500">{error || 'Proyecto no encontrado'}</p>
            </div>
        );
    }

    const { publicLinkConfig } = project;
    const included = publicLinkConfig?.includedSections || [];

    const scrollToSection = (id: string) => {
        let element = document.getElementById(`section-${id}`);
        if (!element) {
            element = document.getElementById(id);
        }
        const container = document.getElementById('public-project-container');
        if (element && container) {
            const y = element.getBoundingClientRect().top + container.scrollTop - container.getBoundingClientRect().top - 100;
            container.scrollTo({ top: y, behavior: 'smooth' });
        }
    };

    const renderSection = (id: string, index: number) => {
        if (!included.includes(id)) return null;

        const isImportant = publicLinkConfig?.importantSections?.includes(id);
        const baseCardClass = `p-6 md:p-8 bg-white dark:bg-neutral-800 shadow-xl rounded-[2rem] mb-8 transition-all duration-300 break-inside-avoid ${isImportant ? 'ring-2 ring-brand-primary/50 shadow-brand-primary/20 scale-[1.01]' : 'border-none'}`;
        const numberPrefix = <span className="text-neutral-300 mr-4 font-black text-2xl">{(index + 1).toString().padStart(2, '0')}.</span>;

        const renderTTSButton = (text: string, sectionId: string) => (
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    handleSpeak(text, sectionId);
                }}
                className={`ml-auto p-2 rounded-full transition-colors print:hidden ${speakingSection === sectionId ? 'bg-brand-primary/10 text-brand-primary' : 'bg-neutral-100 text-neutral-500 hover:text-brand-primary'}`}
                title={speakingSection === sectionId ? (isPaused ? "Reanudar" : "Pausar") : "Escuchar sección"}
            >
                <Icon name={speakingSection === sectionId ? (isPaused ? "play" : "pause") : "volume"} className="w-5 h-5" />
            </button>
        );

        // Handle Custom Sections
        if (id.startsWith('custom_')) {
            const section = publicLinkConfig?.customSections?.find(s => s.id === id);
            if (!section) return null;
            
            const colorClass = section.color ? `bg-${section.color}-500/10 text-${section.color}-700 dark:text-${section.color}-400 border-${section.color}-500/20` : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700';
            const iconColorClass = section.color ? `text-${section.color}-500` : 'text-neutral-500';
            const iconBgClass = section.color ? `bg-${section.color}-500/10` : 'bg-neutral-200 dark:bg-neutral-700';

            return (
                <Card key={id} id={`section-${id}`} className={`p-6 md:p-8 shadow-xl border rounded-[2rem] mb-8 break-inside-avoid ${colorClass} ${isImportant ? 'scale-[1.01]' : ''}`}>
                    <div className="flex items-center gap-3 mb-4">
                        {numberPrefix}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBgClass} ${iconColorClass}`}>
                            <Icon name="bell" className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-black uppercase tracking-widest">{section.title}</h2>
                        {renderTTSButton(`${section.title || ''}. ${section.content || ''}`, id)}
                    </div>
                    <p className="whitespace-pre-wrap font-medium leading-relaxed">{section.content}</p>
                </Card>
            );
        }

        // Handle Individual Project Notes
        if (id.startsWith('note_')) {
            const noteId = id.replace('note_', '');
            const note = notes.find(n => n.id === noteId);
            if (!note) return null;

            // Strip HTML for TTS
            const plainText = (note.content || '').replace(/<[^>]+>/g, ' ');
            const ttsText = `${note.title}. ${plainText}`;

            return (
                <Card key={id} id={`section-${id}`} className={baseCardClass}>
                     <div className="flex items-center gap-3 mb-6">
                        {numberPrefix}
                        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                            <Icon name="notepad" className="w-5 h-5" />
                        </div>
                        {/* Hide title in body to avoid duplication with content, but keep for screen readers/SEO if needed, or just hide visually */}
                        <h2 className="text-xl font-black uppercase tracking-widest break-words hidden">{note.title}</h2>
                        <div className="ml-auto flex gap-2">
                             {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                             {renderTTSButton(ttsText, id)}
                        </div>
                    </div>
                    <div className="notepad-content-render">
                        <style>{`
                            .notepad-content-render {
                                font-family: 'Inter', sans-serif;
                                color: #404040;
                                line-height: 1.8;
                            }
                            .dark .notepad-content-render {
                                color: #d4d4d4;
                            }
                            .notepad-content-render h1 {
                                font-size: 2.2rem;
                                font-weight: 900;
                                color: #4c1d95;
                                margin-top: 2rem;
                                margin-bottom: 1rem;
                                border-left: 6px solid #4c1d95;
                                padding-left: 15px;
                                line-height: 1.2;
                            }
                            .notepad-content-render h2 {
                                font-size: 1.8rem;
                                font-weight: 800;
                                color: #4c1d95;
                                margin-top: 1.5rem;
                                margin-bottom: 0.8rem;
                                border-bottom: 2px solid rgba(76, 29, 149, 0.15);
                                padding-bottom: 5px;
                            }
                            .notepad-content-render h3 {
                                font-size: 1.4rem;
                                font-weight: 700;
                                color: #4c1d95;
                                margin-top: 1.2rem;
                                margin-bottom: 0.5rem;
                            }
                            .notepad-content-render p {
                                margin-bottom: 1.2rem;
                                font-size: 1rem;
                            }
                            .notepad-content-render ul, .notepad-content-render ol {
                                margin-bottom: 1.2rem;
                                padding-left: 1.5rem;
                            }
                            .notepad-content-render ul { list-style-type: disc; }
                            .notepad-content-render ol { list-style-type: decimal; }
                            .notepad-content-render li { margin-bottom: 0.5rem; }
                            .notepad-content-render blockquote {
                                border-left: 4px solid #e5e7eb;
                                padding-left: 1rem;
                                font-style: italic;
                                color: #6b7280;
                                margin: 1.5rem 0;
                            }
                            .notepad-content-render .media-container {
                                margin: 20px 0;
                                max-width: 100%;
                            }
                            .notepad-content-render img {
                                border-radius: 12px;
                                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                            }
                        `}</style>
                        <div dangerouslySetInnerHTML={{ __html: note.content }} />
                    </div>
                </Card>
            );
        }

        switch (id) {
            case 'fidelizacion':
                if (!publicLinkConfig?.loyaltyProgram?.enabled) return null;
                const loyalty = publicLinkConfig.loyaltyProgram;
                const target = loyalty.requiredVisits || project.loyaltyConfig?.targetVisits || 10;
                const current = userClaims.length;
                const isComplete = current >= target;
                const percentage = Math.min((current / target) * 100, 100);

                return (
                    <Card key={id} id={`section-${id}`} className={`${baseCardClass} overflow-hidden relative`}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                        <div className="flex items-center gap-3 mb-8">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                                <Icon name="star" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Programa de Fidelización</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton(`Programa de fidelización. Tu recompensa: ${loyalty.rewardName}. Llevas ${current} de ${target} visitas.`, id)}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-2xl font-black text-neutral-900 dark:text-white leading-tight">
                                        {isComplete ? '¡Felicidades! Has completado tu tarjeta' : `Gana un ${loyalty.rewardName}`}
                                    </h3>
                                    <p className="text-neutral-500 text-sm mt-2">
                                        {isComplete 
                                            ? 'Ya puedes reclamar tu premio. Haz clic en el botón de abajo para canjearlo.' 
                                            : `Registra tus visitas y cuando llegues a ${target}, ¡el premio es tuyo!`}
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Tu Progreso</span>
                                        <span className="text-lg font-black">{current} / {target}</span>
                                    </div>
                                    <div className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-4 overflow-hidden border border-neutral-200 dark:border-neutral-700 p-1">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-1000 ${isComplete ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)] animate-pulse' : 'bg-brand-primary'}`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <Button 
                                        onClick={() => setShowLoyaltyModal(true)}
                                        className="bg-brand-primary text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20 hover:scale-[1.02] transition-transform"
                                    >
                                        Registrar Visita
                                    </Button>
                                    {isComplete && (
                                        <Button 
                                            onClick={handleRedeemReward}
                                            isLoading={isRedeeming}
                                            className="bg-green-500 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-green-500/20 hover:scale-[1.02] transition-transform animate-bounce"
                                        >
                                            Reclamar Premio
                                        </Button>
                                    )}
                                    {!hasCheckedClaims && (
                                        <button 
                                            onClick={() => setShowLoyaltyModal(true)}
                                            className="text-xs font-bold text-neutral-500 hover:text-brand-primary transition-colors"
                                        >
                                            ¿Ya tienes visitas? Consulta aquí
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Stamp Card UI */}
                            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-6 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800">
                                <div className="grid grid-cols-5 gap-3">
                                    {Array.from({ length: target }).map((_, i) => {
                                        const isFilled = i < current;
                                        return (
                                            <div 
                                                key={i} 
                                                className={`aspect-square rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                                                    isFilled 
                                                    ? 'bg-brand-primary border-brand-primary text-white shadow-lg shadow-brand-primary/30 scale-110' 
                                                    : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-300'
                                                }`}
                                            >
                                                {isFilled ? (
                                                    <Icon name="check" className="w-4 h-4 sm:w-6 sm:h-6" />
                                                ) : (
                                                    <span className="text-xs font-black">{i + 1}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-6 text-center">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Tarjeta de Fidelización Digital</p>
                                </div>
                            </div>
                        </div>
                    </Card>
                );
            case 'agendamiento':
                if (!publicLinkConfig?.schedulingConfig?.enabled) return null;
                return (
                    <Card key={id} id={`section-${id}`} className={`${baseCardClass} overflow-hidden relative`}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                        <div className="flex items-center gap-3 mb-8">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                                <Icon name="calendar" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Agendar Reunión</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton(`Agendar una reunión. Haz clic en el botón para ver los horarios disponibles y reservar tu cita.`, id)}
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="flex-1 space-y-4">
                                <h3 className="text-2xl font-black text-neutral-900 dark:text-white leading-tight">
                                    ¿Hablamos sobre tu proyecto?
                                </h3>
                                <p className="text-neutral-500 font-medium">
                                    Reserva un espacio en mi agenda para que podamos revisar los detalles, resolver dudas y avanzar con los siguientes pasos.
                                </p>
                                <Button 
                                    onClick={() => setShowSchedulingModal(true)}
                                    className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:scale-[1.02] transition-transform flex items-center gap-3"
                                >
                                    <Icon name="calendar" className="w-6 h-6" />
                                    Ver Disponibilidad
                                </Button>
                            </div>
                            <div className="w-full md:w-1/3 aspect-square bg-neutral-100 dark:bg-neutral-800 rounded-[2.5rem] flex items-center justify-center border border-neutral-200 dark:border-neutral-700">
                                <Icon name="calendar" className="w-20 h-20 text-brand-primary/20" />
                            </div>
                        </div>
                    </Card>
                );
            case 'info':
                const infoText = `Información General. Industria: ${project.metadata?.industry || 'No especificada'}. Etapa Actual: ${project.stage || 'No especificada'}. Público Objetivo: ${project.metadata?.targetAudience || 'No especificado'}. Fecha Fin Estimada: ${project.endDate ? new Date(project.endDate).toLocaleDateString() : 'No especificada'}.`;
                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                                <Icon name="help" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Información General</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton(infoText, id)}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {project.metadata?.industry && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Industria</p>
                                    <p className="font-bold text-lg">{project.metadata.industry}</p>
                                </div>
                            )}
                            {project.stage && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Etapa Actual</p>
                                    <p className="font-bold text-lg text-brand-primary">{project.stage}</p>
                                </div>
                            )}
                            {project.metadata?.targetAudience && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Público Objetivo</p>
                                    <p className="font-bold text-lg">{project.metadata.targetAudience}</p>
                                </div>
                            )}
                            {project.endDate && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Fecha Fin Estimada</p>
                                    <p className="font-bold text-lg">{new Date(project.endDate).toLocaleDateString()}</p>
                                </div>
                            )}
                        </div>
                    </Card>
                );
            case 'notas_adicionales':
                if (!publicLinkConfig?.additionalNotes) return null;
                const colorClass = publicLinkConfig.notesColor ? `bg-${publicLinkConfig.notesColor}-500/10 text-${publicLinkConfig.notesColor}-700 dark:text-${publicLinkConfig.notesColor}-400 border-${publicLinkConfig.notesColor}-500/20` : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700';
                const iconColorClass = publicLinkConfig.notesColor ? `text-${publicLinkConfig.notesColor}-500` : 'text-neutral-500';
                const iconBgClass = publicLinkConfig.notesColor ? `bg-${publicLinkConfig.notesColor}-500/10` : 'bg-neutral-200 dark:bg-neutral-700';
                
                return (
                    <Card key={id} id={`section-${id}`} className={`p-6 md:p-8 shadow-xl border rounded-[2rem] mb-8 ${colorClass} ${isImportant ? 'scale-[1.01]' : ''}`}>
                        <div className="flex items-center gap-3 mb-4">
                            {numberPrefix}
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBgClass} ${iconColorClass}`}>
                                <Icon name="bell" className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-widest">Notas Importantes</h2>
                            {renderTTSButton(`Notas Importantes. ${publicLinkConfig.additionalNotes}`, id)}
                        </div>
                        <p className="whitespace-pre-wrap font-medium leading-relaxed">{publicLinkConfig.additionalNotes}</p>
                    </Card>
                );
            case 'finanzas':
                const financesText = `Finanzas. Ingresos Totales: ${project.finances?.income?.toLocaleString() || 0}. Gastos Totales: ${project.finances?.expenses?.toLocaleString() || 0}.`;
                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                                <Icon name="wallet" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Finanzas</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton(financesText, id)}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="p-6 bg-neutral-50 dark:bg-neutral-900 rounded-2xl">
                                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1">Ingresos Totales</p>
                                <p className="text-3xl font-black text-green-500">${project.finances?.income?.toLocaleString() || 0}</p>
                            </div>
                            <div className="p-6 bg-neutral-50 dark:bg-neutral-900 rounded-2xl">
                                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1">Gastos Totales</p>
                                <p className="text-3xl font-black text-red-500">${project.finances?.expenses?.toLocaleString() || 0}</p>
                            </div>
                        </div>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 font-medium">Resumen financiero del proyecto, mostrando el balance actual de ingresos y gastos registrados.</p>
                    </Card>
                );
            case 'notas':
                const visibleNotes = notes.filter(n => publicLinkConfig?.includedNotes?.includes(n.id)) || [];
                if (visibleNotes.length === 0) return null;
                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                                <Icon name="notepad" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Notas</h2>
                            {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary ml-auto" />}
                        </div>
                        <div className="flex flex-col gap-6">
                            {visibleNotes.map(note => (
                                <div key={note.id} id={`note-${note.id}`} className="p-6 bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                                    <h3 className="font-black text-xl mb-4 text-brand-primary">{note.title}</h3>
                                    <div className="notepad-content-render">
                                        <style>{`
                                            .notepad-content-render {
                                                font-family: 'Inter', sans-serif;
                                                color: #404040;
                                                line-height: 1.8;
                                            }
                                            .dark .notepad-content-render {
                                                color: #d4d4d4;
                                            }
                                            .notepad-content-render h1 {
                                                font-size: 2.2rem;
                                                font-weight: 900;
                                                color: #4c1d95;
                                                margin-top: 2rem;
                                                margin-bottom: 1rem;
                                                border-left: 6px solid #4c1d95;
                                                padding-left: 15px;
                                                line-height: 1.2;
                                            }
                                            .notepad-content-render h2 {
                                                font-size: 1.8rem;
                                                font-weight: 800;
                                                color: #4c1d95;
                                                margin-top: 1.5rem;
                                                margin-bottom: 0.8rem;
                                                border-bottom: 2px solid rgba(76, 29, 149, 0.15);
                                                padding-bottom: 5px;
                                            }
                                            .notepad-content-render h3 {
                                                font-size: 1.4rem;
                                                font-weight: 700;
                                                color: #4c1d95;
                                                margin-top: 1.2rem;
                                                margin-bottom: 0.5rem;
                                            }
                                            .notepad-content-render p {
                                                margin-bottom: 1.2rem;
                                                font-size: 1rem;
                                            }
                                            .notepad-content-render ul, .notepad-content-render ol {
                                                margin-bottom: 1.2rem;
                                                padding-left: 1.5rem;
                                            }
                                            .notepad-content-render ul { list-style-type: disc; }
                                            .notepad-content-render ol { list-style-type: decimal; }
                                            .notepad-content-render li { margin-bottom: 0.5rem; }
                                            .notepad-content-render blockquote {
                                                border-left: 4px solid #e5e7eb;
                                                padding-left: 1rem;
                                                font-style: italic;
                                                color: #6b7280;
                                                margin: 1.5rem 0;
                                            }
                                            .notepad-content-render .media-container {
                                                margin: 20px 0;
                                                max-width: 100%;
                                            }
                                            .notepad-content-render img {
                                                border-radius: 12px;
                                                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                                            }
                                        `}</style>
                                        <div dangerouslySetInnerHTML={{ __html: note.content }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                );
            case 'tareas':
                const allTasks = project.folders?.flatMap(f => f.tasks) || [];
                const statusOrder: Record<string, number> = { 'Por Hacer': 1, 'En Progreso': 2, 'Hecho': 3 };
                const sortedTasks = [...allTasks].sort((a, b) => {
                    const statusA = statusOrder[a.status] || 4;
                    const statusB = statusOrder[b.status] || 4;
                    return statusA - statusB;
                });
                const tasksText = `Tareas Activas. Hay ${sortedTasks.length} tareas registradas.`;

                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                                <Icon name="check" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Tareas Activas</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton(tasksText, id)}
                            </div>
                        </div>
                        {sortedTasks.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {sortedTasks.map(task => {
                                    const assignedMembers = task.assignedTo?.map(uid => project.members.find(m => m.uid === uid)).filter(Boolean) || [];
                                    
                                    return (
                                        <div key={task.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-neutral-50 dark:bg-neutral-900 rounded-2xl gap-4 border border-neutral-100 dark:border-neutral-800">
                                            <div className="flex-1">
                                                <h3 className="font-black text-base">{task.title}</h3>
                                                {task.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-2">{task.description}</p>}
                                                <div className="flex flex-wrap items-center gap-4 mt-3">
                                                    {assignedMembers.length > 0 && (
                                                        <div className="flex flex-col gap-1 text-[8px] font-bold text-white uppercase tracking-wider bg-brand-primary px-2 py-1 rounded-md shadow-sm w-full max-w-[200px]">
                                                            <div className="flex items-center gap-1.5 opacity-75 mb-0.5">
                                                                <Icon name="user" className="w-3 h-3 text-white" />
                                                                <span>Responsables:</span>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                                                {assignedMembers.map(m => (
                                                                    <span key={m.uid} className="break-words leading-tight">{m.name}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {task.tags && task.tags.length > 0 && (
                                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-white dark:bg-neutral-800 px-2 py-1 rounded-md shadow-sm">
                                                            <Icon name="tag" className="w-3 h-3 text-brand-primary" />
                                                            <span>{task.tags.join(', ')}</span>
                                                        </div>
                                                    )}
                                                    {task.dueDate && (
                                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-white dark:bg-neutral-800 px-2 py-1 rounded-md shadow-sm">
                                                            <Icon name="calendar" className="w-3 h-3 text-brand-primary" />
                                                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-sm ${
                                                task.status === 'Hecho' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                                                task.status === 'En Progreso' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 
                                                'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                                            }`}>
                                                {task.status}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-500 font-medium">No hay tareas registradas.</p>
                        )}
                    </Card>
                );
            case 'miembros':
                // Check if any role has members
                const hasMembers = ['director', 'socios', 'colaboradores', 'clientes'].some(role => 
                    (project.roles?.[role as keyof typeof project.roles] || []).length > 0
                );
                
                if (!hasMembers) return null;

                const membersText = "Equipo y Roles del Proyecto.";

                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                                <Icon name="users" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Equipo y Roles</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton(membersText, id)}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                            {['director', 'socios', 'colaboradores', 'clientes'].map(roleType => {
                                const people = project.roles?.[roleType as keyof typeof project.roles] || [];
                                if (people.length === 0) return null;
                                return (
                                    <div key={roleType} className="space-y-3">
                                        <h3 className="text-xs font-black uppercase text-brand-primary tracking-widest">{roleType}</h3>
                                        <div className="space-y-2">
                                            {people.map((person, idx) => (
                                                <div key={idx} className="flex items-center gap-2 p-2 bg-neutral-50 dark:bg-neutral-900 rounded-xl">
                                                    <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-[10px] font-bold">
                                                        {person.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-medium">{person}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                );
            case 'crm':
                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                                <Icon name="briefcase" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">CRM de Proyecto</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton("CRM de Proyecto", id)}
                            </div>
                        </div>
                        {project.clients && project.clients.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {project.clients.map(client => (
                                    <div key={client.id} className="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-2xl flex justify-between items-center">
                                        <div>
                                            <h3 className="font-bold text-sm">{client.name}</h3>
                                            <p className="text-xs text-neutral-500">{client.contact}</p>
                                        </div>
                                        <span className="px-3 py-1 bg-neutral-200 dark:bg-neutral-700 rounded-full text-[10px] font-bold uppercase">
                                            {client.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-500">No hay clientes en el CRM.</p>
                        )}
                    </Card>
                );
            case 'docs':
                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                                <Icon name="folder" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Documentos</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton("Documentos del Proyecto", id)}
                            </div>
                        </div>
                        {project.documents && project.documents.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {project.documents.map(doc => {
                                    const isPresentation = doc.fileType === 'interactive_presentation';
                                    const isLink = doc.content.startsWith('http') || doc.content.startsWith('data:');
                                    
                                    let href = doc.content;
                                    let target = "_blank";
                                    let download = undefined;

                                    if (isPresentation) {
                                        // Use the name for the link as requested, cleaned to match builder's internal title
                                        const cleanName = doc.name.replace('PRESENTACIÓN: ', '').replace(' (EDICIÓN)', '').replace(' (LECTURA)', '');
                                        href = `/#aiStudio/presentations/present/${encodeURIComponent(cleanName)}`;
                                        target = "_blank";
                                    } else {
                                        if (isLink) {
                                            download = doc.name;
                                        } else {
                                            // Handle plain text content: Create a data URL so it's downloadable
                                            href = `data:text/plain;charset=utf-8,${encodeURIComponent(doc.content)}`;
                                            download = `${doc.name}.txt`;
                                        }
                                    }

                                    const clickable = true; // All docs are now clickable

                                    return (
                                        <a 
                                            key={doc.id} 
                                            href={clickable ? href : '#'} 
                                            target={clickable ? target : undefined}
                                            rel={clickable && target === "_blank" ? "noopener noreferrer" : undefined}
                                            download={download}
                                            onClick={(e) => {
                                                if (!clickable) {
                                                    e.preventDefault();
                                                }
                                            }}
                                            className={`p-4 bg-neutral-50 dark:bg-neutral-900 rounded-2xl flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer border border-transparent hover:border-cyan-500/30 ${!clickable ? 'cursor-default opacity-80' : ''}`}
                                        >
                                            <Icon name={isPresentation ? "rocket" : "notepad"} className="w-8 h-8 text-cyan-500" />
                                            <div className="overflow-hidden">
                                                <h3 className="font-bold text-sm truncate">{doc.name}</h3>
                                                <p className="text-xs text-neutral-500">
                                                    {isPresentation ? 'Presentación Interactiva' : `${(doc.size / 1024).toFixed(1)} KB`}
                                                </p>
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-500">No hay documentos subidos.</p>
                        )}
                    </Card>
                );
            case 'tablas':
                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                <Icon name="table" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Tablas</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton("Tablas de Datos", id)}
                            </div>
                        </div>
                        {project.spreadsheets && project.spreadsheets.length > 0 ? (
                            <div className="space-y-4">
                                {project.spreadsheets.map(sheet => (
                                    <div key={sheet.id} className="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-2xl">
                                        <h3 className="font-bold text-sm mb-2">{sheet.title}</h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm">
                                                <thead>
                                                    <tr>
                                                        {sheet.columns.map(col => (
                                                            <th key={col.id} className="p-2 border-b border-neutral-200 dark:border-neutral-700 font-bold text-neutral-500">{col.name}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sheet.rows.slice(0, 5).map(row => (
                                                        <tr key={row.id}>
                                                            {sheet.columns.map((col, colIndex) => {
                                                                const cell = row.cells[colIndex];
                                                                return <td key={col.id} className="p-2 border-b border-neutral-100 dark:border-neutral-800">{cell?.value || ''}</td>;
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {sheet.rows.length > 5 && <p className="text-xs text-neutral-500 mt-2 text-center">Mostrando 5 de {sheet.rows.length} filas</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-500">No hay tablas creadas.</p>
                        )}
                    </Card>
                );
            case 'pizarra':
                return (
                    <Card key={id} id={`section-${id}`} className={baseCardClass}>
                        <div className="flex items-center gap-3 mb-6">
                            {numberPrefix}
                            <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-500">
                                <Icon name="drawingpad" className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Pizarras</h2>
                            <div className="ml-auto flex gap-2">
                                {isImportant && <Icon name="star" className="w-5 h-5 text-brand-primary" />}
                                {renderTTSButton("Pizarras Visuales", id)}
                            </div>
                        </div>
                        {project.drawings && project.drawings.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {project.drawings.map(drawing => (
                                    <div key={drawing.id} className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-700">
                                        <div className="p-3 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
                                            <h3 className="font-bold text-sm">{drawing.title}</h3>
                                        </div>
                                        <div className="aspect-video bg-white flex items-center justify-center p-2">
                                            <img src={drawing.dataUrl} alt={drawing.title} className="max-w-full max-h-full object-contain" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-500">No hay pizarras guardadas.</p>
                        )}
                    </Card>
                );
            default:
                return null;
        }
    };

    return (
        <div id="public-project-container" className="h-screen overflow-y-auto overflow-x-hidden bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white font-sans selection:bg-brand-primary/30 print:h-auto print:overflow-visible">
            <style>{`
                @media print {
                    html, body, #root, #public-project-container {
                        height: auto !important;
                        overflow: visible !important;
                        position: static !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    #public-project-print-content {
                        height: auto !important;
                        overflow: visible !important;
                    }
                    /* Ensure no other scrollbars hide content */
                    * {
                        overflow: visible !important;
                    }
                }
            `}</style>
            <div id="public-project-print-content">
            {/* Header */}
            <header className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 sticky top-0 z-40 shadow-sm print:static print:border-b-2 max-[950px]:landscape:hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 pr-2">
                        {project.logoUrl ? (
                            <img src={project.logoUrl} alt={project.name} className="h-8 w-8 sm:h-10 sm:w-10 object-contain rounded-lg sm:rounded-xl flex-shrink-0" />
                        ) : (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-brand-primary text-white flex items-center justify-center font-black text-lg sm:text-xl flex-shrink-0">
                                {project.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-700 hidden sm:block"></div>
                        <div className="block min-w-0 flex-1">
                            <h1 className="text-sm sm:text-lg font-black tracking-tight leading-tight break-words">{project.name}</h1>
                            <div className="flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                                <span className="truncate">{project.metadata?.industry || 'Proyecto'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-4 print:scale-75 print:origin-right flex-shrink-0">
                        <button onClick={handleDownloadPDF} className="flex-shrink-0 flex items-center justify-center px-2 py-1.5 sm:px-4 sm:py-2 bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg sm:rounded-xl hover:text-brand-primary transition-colors print:hidden" title="Descargar PDF">
                            <Icon name="download" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest ml-1 sm:ml-2">PDF</span>
                        </button>
                        <a href={`/#/hub/messages/${project.ownerId}`} className="flex-shrink-0 flex items-center justify-center w-7 h-7 sm:w-auto sm:h-auto sm:px-4 sm:py-2 bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg sm:rounded-xl hover:text-brand-primary transition-colors print:hidden" title="Enviar comentarios">
                            <Icon name="message" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest ml-2">Enviar Comentarios</span>
                        </a>
                        <a href={`mailto:${publicLinkConfig?.contactEmail || 'info@goatify.app'}`} className="flex-shrink-0 flex items-center justify-center w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-brand-primary transition-colors" title="Email">
                            <Icon name="mail" className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                        </a>
                        <a href={`https://wa.me/${publicLinkConfig?.contactWhatsapp || '19125715145'}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center justify-center w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-green-500 transition-colors" title="WhatsApp">
                            <Icon name="phone" className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                        </a>
                        {publicLinkConfig?.schedulingConfig?.enabled ? (
                            <button 
                                onClick={() => setShowSchedulingModal(true)}
                                className="flex-shrink-0 flex items-center justify-center w-7 h-7 sm:w-auto sm:h-auto sm:px-4 sm:py-2 bg-brand-primary text-white rounded-lg sm:rounded-xl hover:bg-brand-primary/90 transition-colors" 
                                title="Agendar Reunión"
                            >
                                <Icon name="calendar" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest ml-2">Reunión</span>
                            </button>
                        ) : (
                            <a href={publicLinkConfig?.meetingLink ? (publicLinkConfig.meetingLink.startsWith('http') ? publicLinkConfig.meetingLink : `https://${publicLinkConfig.meetingLink}`) : "https://calendly.com/goatify/reunion-express?month=2026-02"} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center justify-center w-7 h-7 sm:w-auto sm:h-auto sm:px-4 sm:py-2 bg-brand-primary text-white rounded-lg sm:rounded-xl hover:bg-brand-primary/90 transition-colors" title="Agendar Reunión">
                                <Icon name="calendar" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest ml-2">Reunión</span>
                            </a>
                        )}
                        <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-700 hidden sm:block mx-2"></div>
                        <a href="https://ia.goatify.app/" target="_blank" rel="noopener noreferrer" className="hidden sm:block">
                            <img src="https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747" alt="Goatify IA" className="h-8 object-contain" />
                        </a>
                    </div>
                </div>
                
                {/* Sticky Navigation Index */}
                {included.length > 0 && (
                    <div className="bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 print:hidden">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                            {/* Grid layout: 4 cols on mobile, 4 on sm, 7 on lg. Max height constrained to show approx 2 rows on mobile before scroll. */}
                            <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 max-h-[60px] sm:max-h-[120px] overflow-y-auto custom-scrollbar items-start pb-2">
                                {included.map((id, index) => {
                                    if (id.startsWith('custom_')) return null; // Hide custom notes from menu
                                    const numberPrefix = `${(index + 1).toString().padStart(2, '0')}. `;

                                    if (id.startsWith('note_')) {
                                        const noteId = id.replace('note_', '');
                                        const note = notes.find(n => n.id === noteId);
                                        if (!note) return null;
                                        return (
                                            <button 
                                                key={`nav-${id}`}
                                                onClick={() => scrollToSection(`section-${id}`)}
                                                className="text-[8px] sm:text-xs font-black text-brand-primary hover:text-brand-secondary uppercase tracking-widest transition-colors text-left whitespace-normal w-full leading-tight flex-shrink-0"
                                            >
                                                <div className="max-h-[2.4em] overflow-y-auto custom-scrollbar pr-1">
                                                    {numberPrefix}{note.title}
                                                </div>
                                            </button>
                                        );
                                    }

                                    if (id === 'notas') {
                                        // Legacy handling if 'notas' section is still used
                                        const visibleNotes = notes.filter(n => publicLinkConfig?.includedNotes?.includes(n.id)) || [];
                                        return visibleNotes.map(note => (
                                            <button 
                                                key={`nav-note-${note.id}`}
                                                onClick={() => scrollToSection(`note-${note.id}`)}
                                                className="text-[8px] sm:text-xs font-black text-brand-primary hover:text-brand-secondary uppercase tracking-widest transition-colors text-left whitespace-normal w-full leading-tight flex-shrink-0"
                                            >
                                                <div className="max-h-[2.4em] overflow-y-auto custom-scrollbar pr-1">
                                                    {numberPrefix}{note.title}
                                                </div>
                                            </button>
                                        ));
                                    }
                                    return (
                                        <button 
                                            key={`nav-${id}`}
                                            onClick={() => scrollToSection(id)}
                                            className="text-[8px] sm:text-xs font-bold text-neutral-500 hover:text-brand-primary uppercase tracking-widest transition-colors text-left whitespace-normal w-full leading-tight flex-shrink-0"
                                        >
                                            <div className="max-h-[2.4em] overflow-y-auto custom-scrollbar pr-1">
                                                {numberPrefix}{id.replace('_', ' ')}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* Main Content */}
            <main id="public-project-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 print:py-4 print:px-0">
                {/* Hero Section */}
                <div className="mb-12 text-center max-w-4xl mx-auto relative print:mb-6">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-brand-primary/5 blur-3xl rounded-full -z-10 print:hidden"></div>
                    
                    <div className="inline-block mb-4 px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-black uppercase tracking-widest animate-fade-in-up print:border-none print:bg-transparent print:p-0">
                        Propuesta de Valor
                    </div>
                    
                    <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-6 leading-tight text-neutral-900 dark:text-white animate-fade-in-up delay-100 print:text-2xl print:text-black">
                        {project.metadata?.valueProposition || 'Visión General del Proyecto'}
                    </h2>

                    {project.loyaltyConfig?.enabled && (
                        <div className="flex justify-center mb-8 print:hidden">
                            <Button 
                                onClick={() => setShowLoyaltyModal(true)}
                                className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-brand-primary/20 hover:scale-105 transition-transform flex items-center gap-3 text-lg"
                            >
                                <Icon name="star" className="w-6 h-6" />
                                Registrar mi consumo de hoy
                            </Button>
                        </div>
                    )}
                </div>
                
                {project.metadata?.objective && (
                    <div className="mb-12 relative bg-white dark:bg-neutral-800/50 backdrop-blur-sm p-6 md:p-8 rounded-[2rem] border border-neutral-200 dark:border-neutral-700 shadow-xl animate-fade-in-up delay-200 print:shadow-none print:border-none print:p-0 print:bg-white print:opacity-100 print:visible print:block print:animate-none print:mb-8">
                        <Icon name="quote" className="w-6 h-6 text-brand-primary/30 absolute top-6 left-6 print:hidden" />
                        <p className="text-lg md:text-xl text-neutral-900 dark:text-white font-bold leading-relaxed italic relative z-10 text-center print:text-black print:text-base print:not-italic print:opacity-100 print:font-normal print:text-left">
                            "{project.metadata.objective}"
                        </p>
                        <div className="mt-6 flex items-center justify-center gap-2 print:hidden">
                            <div className="h-0.5 w-8 bg-brand-primary/30 rounded-full"></div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Objetivo Estratégico</span>
                            <div className="h-0.5 w-8 bg-brand-primary/30 rounded-full"></div>
                        </div>
                    </div>
                )}

                {/* Table of Contents for PDF */}
                <div className="hidden print:block mb-8 break-after-page">
                    <h2 className="text-2xl font-black mb-6 uppercase tracking-tight border-b-2 border-black pb-2">Índice del Proyecto</h2>
                    <ul className="space-y-2">
                        {included.map((id, index) => {
                            let title = id.replace('_', ' ');
                            if (id.startsWith('custom_')) {
                                const section = publicLinkConfig?.customSections?.find(s => s.id === id);
                                title = section?.title || 'Sección Personalizada';
                            } else if (id.startsWith('note_')) {
                                const noteId = id.replace('note_', '');
                                const note = notes.find(n => n.id === noteId);
                                title = note?.title || 'Nota';
                            } else if (id === 'info') title = 'Información General';
                            else if (id === 'notas_adicionales') title = 'Notas Importantes';
                            else if (id === 'miembros') title = 'Equipo y Roles';
                            
                            return (
                                <li key={`toc-${id}`} className="flex items-baseline justify-between border-b border-neutral-300 pb-1 border-dashed">
                                    <span className="font-bold text-sm uppercase tracking-wider">
                                        <span className="mr-2 text-neutral-500">{(index + 1).toString().padStart(2, '0')}.</span>
                                        {title}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Render Selected Sections */}
                <div className="space-y-8 print:space-y-4">
                    {included.map((id, index) => renderSection(id, index))}
                </div>

                {/* Promotional Banner */}
                <div className="mt-20 p-8 md:p-12 bg-gradient-to-br from-[#2e1065] to-[#4c1d95] rounded-[2.5rem] text-white text-center shadow-2xl relative overflow-hidden group print:bg-[#4c1d95] print:text-white">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 print:hidden"></div>
                    <div className="relative z-10 max-w-2xl mx-auto">
                        <img src="https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747" alt="Goatify IA" className="h-16 mx-auto mb-6 object-contain animate-pulse" />
                        <h3 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">Eleva tu negocio al siguiente nivel con Goatify IA</h3>
                        <p className="text-lg text-white/80 mb-8 font-medium">
                            Obtén 30 días gratis de nuestro paquete Premium. Gestiona clientes, proyectos y usa herramientas de IA avanzadas. Además, conviértete en socio y genera grandes comisiones.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <a href="https://kbra.goatify.app/" target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-white text-brand-primary rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform w-full sm:w-auto">
                                Probar Gratis Ahora
                            </a>
                            <a href="https://www.goatify.app/socios/" target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-white/10 border border-white/20 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-colors w-full sm:w-auto">
                                Plan de Socios
                            </a>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white dark:bg-neutral-950 border-t border-neutral-200 dark:border-neutral-800 pt-16 pb-8 mt-12">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                        <div className="col-span-1 md:col-span-2 space-y-6">
                            <img src="https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747" alt="Goatify IA" className="h-10 object-contain" />
                            <p className="text-sm text-neutral-500 max-w-sm">
                                Transformando negocios con Inteligencia Artificial. Automatización, gestión de proyectos y herramientas de productividad de primer nivel.
                            </p>
                            <div className="flex items-center gap-4">
                                <a href="https://www.tiktok.com/@goatify.ia" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="tiktok" className="w-5 h-5" /></a>
                                <a href="https://www.facebook.com/profile.php?id=61574864266396&locale=es_LA" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="facebook" className="w-5 h-5" /></a>
                                <a href="https://www.instagram.com/goatify.ia/" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="instagram" className="w-5 h-5" /></a>
                                <a href="https://www.linkedin.com/company/goatify-ia/" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="linkedin" className="w-5 h-5" /></a>
                                <a href="https://www.youtube.com/@goatify_ia" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="youtube" className="w-5 h-5" /></a>
                            </div>
                        </div>
                        
                        <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-900 dark:text-white mb-6">Enlaces Rápidos</h4>
                            <ul className="space-y-3 text-sm text-neutral-500">
                                <li><a href="https://www.goatify.app/inicio" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Inicio</a></li>
                                <li><a href="https://www.goatify.app/portafolio/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Portafolio</a></li>
                                <li><a href="https://www.goatify.app/pricing/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Precios</a></li>
                                <li><a href="https://www.goatify.app/socios/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Socios</a></li>
                                <li><a href="https://www.goatify.app/fundadores/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Fundadores</a></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-900 dark:text-white mb-6">Soluciones</h4>
                            <ul className="space-y-3 text-sm text-neutral-500">
                                <li><a href="https://kbra.goatify.app/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">KBRA App</a></li>
                                <li><a href="https://qlase.goatify.app/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Qlase App</a></li>
                                <li><a href="https://www.goatify.app/productividad" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Productividad IA</a></li>
                                <li><a href="https://www.goatify.app/automatizaciones/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Automatizaciones</a></li>
                                <li><a href="https://www.goatify.app/social-media/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Social Media</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-neutral-200 dark:border-neutral-800 gap-4">
                        <div className="flex items-center gap-4">
                            <a href="https://calendly.com/goatify/reunion-express?month=2026-02" target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2">
                                <Icon name="calendar" className="w-4 h-4" /> Agendar Reunión
                            </a>
                            <a href="https://wa.me/19125715145" target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-green-500 transition-colors"><Icon name="phone" className="w-5 h-5" /></a>
                            <a href="mailto:info@goatify.app" className="text-neutral-500 hover:text-brand-primary transition-colors"><Icon name="mail" className="w-5 h-5" /></a>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium text-neutral-500">
                            <a href="https://www.goatify.app/privacidad/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">Privacidad</a>
                            <span>&copy; 2026 Goatify IA. Todos los derechos reservados.</span>
                        </div>
                    </div>
                </div>
            </footer>

            {/* Floating TTS Player */}
            {speakingSection && (
                <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 z-[10000] animate-fade-in-up">
                    <div className="flex items-center gap-2 mr-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-xs font-bold uppercase tracking-widest text-brand-primary">Leyendo...</span>
                    </div>
                    
                    <button 
                        onClick={() => handleSpeak('', speakingSection)} // Toggles pause/resume
                        className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                        <Icon name={isPaused ? "play" : "pause"} className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
                    </button>

                    <button 
                        onClick={handleStop}
                        className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full hover:bg-red-100 hover:text-red-500 transition-colors"
                    >
                        <Icon name="stop" className="w-5 h-5" />
                    </button>

                    <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-700 mx-1"></div>

                    <button 
                        onClick={changeSpeed}
                        className="text-xs font-black w-12 text-center py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                        {speechRate}x
                    </button>
                </div>
            )}

            {/* Scroll to Top Button */}
            <button 
                onClick={() => {
                    const container = document.getElementById('public-project-container');
                    if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`fixed bottom-4 left-4 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-2xl rounded-full hover:scale-110 transition-all duration-300 z-[9999] border border-white/20 print:hidden ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
                title="Volver arriba"
            >
                <Icon name="chevronUp" className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Loyalty Modal */}
            <Modal
                isOpen={showLoyaltyModal}
                onClose={() => {
                    setShowLoyaltyModal(false);
                    setClaimStatus(null);
                    if (!hasCheckedClaims) setEmail('');
                }}
                title={hasCheckedClaims ? "Registrar Consumo" : "Consulta tu Progreso"}
            >
                <div className="p-6">
                    {!claimStatus ? (
                        <div className="space-y-6">
                            <div className="text-center space-y-2 mb-6">
                                <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary mx-auto">
                                    <Icon name="star" className="w-8 h-8" />
                                </div>
                                <h3 className="text-xl font-black">
                                    {hasCheckedClaims ? '¡Registra tu visita!' : 'Consulta tus recompensas'}
                                </h3>
                                <p className="text-neutral-500 text-sm">
                                    {hasCheckedClaims 
                                        ? 'Confirma tu correo para registrar una nueva visita.' 
                                        : `Ingresa tu correo para ver cuántas visitas llevas en ${project.name}.`}
                                </p>
                            </div>

                            {hasCheckedClaims && (
                                <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 space-y-3 animate-fade-in">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse"></div>
                                            <span className="text-xs font-black uppercase tracking-widest text-brand-primary">Tu Progreso Actual</span>
                                        </div>
                                        <span className="text-lg font-black text-brand-primary">
                                            {userClaims.length} / {project.publicLinkConfig?.loyaltyProgram?.requiredVisits || project.loyaltyConfig?.targetVisits || 10}
                                        </span>
                                    </div>
                                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-brand-primary h-full transition-all duration-1000" 
                                            style={{ width: `${Math.min((userClaims.length / (project.publicLinkConfig?.loyaltyProgram?.requiredVisits || project.loyaltyConfig?.targetVisits || 10)) * 100, 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] font-bold text-neutral-500 text-center">
                                        {userClaims.length >= (project.publicLinkConfig?.loyaltyProgram?.requiredVisits || project.loyaltyConfig?.targetVisits || 10) 
                                            ? '¡Ya puedes reclamar tu premio!' 
                                            : `Te faltan ${(project.publicLinkConfig?.loyaltyProgram?.requiredVisits || project.loyaltyConfig?.targetVisits || 10) - userClaims.length} visitas para tu premio.`}
                                    </p>
                                </div>
                            )}

                            <form onSubmit={hasCheckedClaims ? handleRegisterConsumption : handleCheckClaims} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tu Correo Electrónico</label>
                                    <Input 
                                        type="email"
                                        placeholder="ejemplo@correo.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="text-lg py-4"
                                    />
                                </div>

                                <Button 
                                    type="submit"
                                    isLoading={isSubmittingClaim || isCheckingClaims}
                                    className="w-full bg-brand-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20"
                                >
                                    {hasCheckedClaims ? 'Enviar Solicitud de Visita' : 'Consultar Progreso'}
                                </Button>

                                {hasCheckedClaims && (
                                    <button 
                                        type="button"
                                        onClick={() => setHasCheckedClaims(false)}
                                        className="w-full text-xs font-bold text-neutral-500 hover:underline"
                                    >
                                        Usar otro correo
                                    </button>
                                )}
                            </form>
                        </div>
                    ) : (
                        <div className="text-center space-y-6 py-4">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${claimStatus.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                <Icon name={claimStatus.type === 'success' ? 'check' : 'close'} className="w-8 h-8" />
                            </div>
                            
                            <div className="space-y-2">
                                <h3 className="text-xl font-black">
                                    {claimStatus.type === 'success' ? '¡Solicitud Enviada!' : 'Error'}
                                </h3>
                                <p className="text-neutral-600 leading-relaxed">
                                    {claimStatus.message}
                                </p>
                            </div>

                            {claimStatus.type === 'success' && (
                                <div className="flex flex-col gap-3 pt-4">
                                    {claimStatus.userExists ? (
                                        <Button 
                                            onClick={() => window.location.href = '/#/dashboard'}
                                            className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest"
                                        >
                                            Ir a mi Dashboard
                                        </Button>
                                    ) : (
                                        <Button 
                                            onClick={() => window.location.href = '/#/onboarding'}
                                            className="w-full bg-brand-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest"
                                        >
                                            Crear cuenta ahora
                                        </Button>
                                    )}
                                    <button 
                                        onClick={() => setShowLoyaltyModal(false)}
                                        className="text-neutral-500 font-bold text-sm hover:text-neutral-800"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            )}

                            {claimStatus.type === 'error' && (
                                <Button 
                                    onClick={() => setClaimStatus(null)}
                                    className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest"
                                >
                                    Reintentar
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Scheduling Modal */}
            <Modal
                isOpen={showSchedulingModal}
                onClose={() => {
                    setShowSchedulingModal(false);
                    setSchedulingStep('date');
                    setSelectedDate(new Date().toISOString().split('T')[0]);
                    setSelectedTime(null);
                    setMeetingStatus(null);
                }}
                title="Agendar Reunión"
            >
                <div className="p-6">
                    {meetingStatus ? (
                        <div className="text-center space-y-6 py-4">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${meetingStatus.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                <Icon name={meetingStatus.type === 'success' ? 'check' : 'close'} className="w-8 h-8" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black">
                                    {meetingStatus.type === 'success' ? '¡Solicitud Enviada!' : 'Error'}
                                </h3>
                                <p className="text-neutral-600 leading-relaxed">{meetingStatus.message}</p>
                            </div>
                            <Button 
                                onClick={() => {
                                    setShowSchedulingModal(false);
                                    setMeetingStatus(null);
                                }}
                                className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest"
                            >
                                Cerrar
                            </Button>
                        </div>
                    ) : schedulingStep === 'date' ? (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Selecciona una fecha</label>
                                <Input 
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="text-lg py-4"
                                />
                            </div>

                            {selectedDate && (
                                <div className="space-y-4 animate-fade-in">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Horarios Disponibles</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {generateTimeSlots(selectedDate).length > 0 ? (
                                            generateTimeSlots(selectedDate).map(time => (
                                                <button
                                                    key={time}
                                                    onClick={() => setSelectedTime(time)}
                                                    className={`py-3 rounded-xl font-bold text-sm transition-all ${
                                                        selectedTime === time
                                                        ? 'bg-brand-primary text-white shadow-lg'
                                                        : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-brand-primary/10 hover:text-brand-primary'
                                                    }`}
                                                >
                                                    {time}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="col-span-3 py-8 text-center bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-700">
                                                <p className="text-xs font-bold text-neutral-400">No hay horarios disponibles para este día</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <Button 
                                disabled={!selectedDate || !selectedTime}
                                onClick={() => setSchedulingStep('details')}
                                className="w-full bg-brand-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20"
                            >
                                Continuar
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleRequestMeeting} className="space-y-6">
                            <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 flex items-center gap-4">
                                <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                                    <Icon name="calendar" className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Fecha y Hora</p>
                                    <p className="font-bold">{new Date(selectedDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las {selectedTime}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tu Nombre</label>
                                    <Input 
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        placeholder="Tu nombre completo"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tu Correo</label>
                                    <Input 
                                        type="email"
                                        value={clientEmail}
                                        onChange={(e) => setClientEmail(e.target.value)}
                                        placeholder="tu@email.com"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">WhatsApp (Opcional)</label>
                                    <Input 
                                        type="tel"
                                        value={clientWhatsapp}
                                        onChange={(e) => setClientWhatsapp(e.target.value)}
                                        placeholder="+57 300 123 4567"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Notas</label>
                                    <textarea 
                                        value={meetingNotes}
                                        onChange={(e) => setMeetingNotes(e.target.value)}
                                        placeholder="¿De qué te gustaría hablar?"
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 border-none focus:ring-2 focus:ring-brand-primary transition-all font-bold resize-none"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button 
                                    type="button"
                                    variant="outline"
                                    onClick={() => setSchedulingStep('date')}
                                    className="flex-1"
                                >
                                    Atrás
                                </Button>
                                <Button 
                                    type="submit"
                                    isLoading={isSubmittingMeeting}
                                    className="flex-[2] bg-brand-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20"
                                >
                                    Confirmar Cita
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </Modal>
            </div>
        </div>
    );
};

const availableSectionsOrder = [
    'info', 'notas_adicionales', 'miembros', 'tareas', 'pizarra', 'docs', 'tablas', 'crm', 'finanzas', 'notas'
];

export default PublicProjectPage;
