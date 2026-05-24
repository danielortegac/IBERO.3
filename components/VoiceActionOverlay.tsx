
import React, { useState, useContext, useEffect, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import { analyzeVoiceCommand } from '../services/geminiService';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';

const VoiceActionOverlay: React.FC = () => {
    const { projects, createTask, addProject, setCurrentView, currentView, setToastNotification, userProfile, checkShivoLimit, setSelectedProjectId, setActiveHubView } = useContext(AppContext);
    const { scheduleMeeting, joinMeeting } = useContext(CallContext);
    
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [feedback, setFeedback] = useState<string | null>(null);
    const [isIdle, setIsIdle] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    
    const isMutedRef = useRef(isMuted);
    const recognitionRef = useRef<any>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const logoUrl = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/ChatGPT%20Image%2019%20nov%202025%2C%2022_40_34.png?alt=media&token=94b22a34-1c9c-42df-ab7a-f0cf7cef4aea";

    const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 150 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [clickStartPos, setClickStartPos] = useState({ x: 0, y: 0 });

    // Sync ref for audio process
    useEffect(() => {
        isMutedRef.current = isMuted;
        if (isMuted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    }, [isMuted]);

    const resetIdleTimer = () => {
        setIsIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (!isListening && !isProcessing && !feedback && !isDragging) {
            idleTimerRef.current = setTimeout(() => setIsIdle(true), 8000); 
        }
    };

    const startListening = async () => {
        const isBlocked = await checkShivoLimit();
        if (isBlocked) return;
        
        try { 
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch(e) {}
                recognitionRef.current.start(); 
                setIsListening(true); 
                setFeedback(null); 
                setTranscript(''); 
                setIsIdle(false);
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            } else {
                setToastNotification({ title: "Error", message: "Tu navegador no soporta reconocimiento de voz.", icon: "close" });
            }
        } catch (e) { 
            console.error(e); 
            setIsListening(false); 
        }
    };

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false; 
            recognition.interimResults = false;
            recognition.lang = 'es-MX';
            
            recognition.onresult = async (event: any) => {
                const text = event.results[0][0].transcript;
                setTranscript(text); 
                setIsListening(false);
                await handleProcessCommand(text);
            };
            
            recognition.onerror = (event: any) => { 
                console.warn("Speech recognition error:", event.error);
                setIsListening(false); 
                resetIdleTimer(); 
            };
            
            recognition.onend = () => { 
                setIsListening(false);
                if (!isProcessing && !feedback) resetIdleTimer(); 
            };
            
            recognitionRef.current = recognition;
        }
        
        return () => { 
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current); 
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch(e) {}
            }
        };
    }, []);

    const handleStart = (clientX: number, clientY: number) => { 
        setClickStartPos({ x: clientX, y: clientY }); 
        setDragOffset({ x: clientX - position.x, y: clientY - position.y }); 
        setIsDragging(true); 
        setIsIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    
    const handleMove = (clientX: number, clientY: number) => { 
        if (!isDragging) return; 
        const newX = Math.max(10, Math.min(clientX - dragOffset.x, window.innerWidth - 70));
        const newY = Math.max(10, Math.min(clientY - dragOffset.y, window.innerHeight - 70));
        setPosition({ x: newX, y: newY }); 
    };
    
    const handleEnd = (clientX: number, clientY: number) => { 
        setIsDragging(false); 
        resetIdleTimer();
    };
    
    useEffect(() => { 
        const onMouseMove = (e: MouseEvent) => { if(isDragging) handleMove(e.clientX, e.clientY); }; 
        const onMouseUp = (e: MouseEvent) => { if(isDragging) handleEnd(e.clientX, e.clientY); }; 
        const onTouchMove = (e: TouchEvent) => { if(isDragging) handleMove(e.touches[0].clientX, e.touches[0].clientY); };
        const onTouchEnd = (e: TouchEvent) => { if(isDragging) handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY); };

        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            window.addEventListener('touchmove', onTouchMove, { passive: false });
            window.addEventListener('touchend', onTouchEnd);
        }
        
        return () => { 
            window.removeEventListener('mousemove', onMouseMove); 
            window.removeEventListener('mouseup', onMouseUp); 
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        }; 
    }, [isDragging, dragOffset]);

    const toggleListening = (e: React.MouseEvent) => {
        e.stopPropagation();
        const dist = Math.sqrt(Math.pow(e.clientX - clickStartPos.x, 2) + Math.pow(e.clientY - clickStartPos.y, 2));
        if (dist > 8) return; 
        
        if (isListening || isProcessing || feedback) {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch(e) {}
            }
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setIsListening(false); 
            setIsProcessing(false); 
            setFeedback(null); 
            resetIdleTimer();
        } else { 
            startListening(); 
        }
    };

    const speakAndReset = (text: string, shouldContinueListening: boolean = false) => {
        if (!text || isMutedRef.current || !('speechSynthesis' in window)) {
            if (shouldContinueListening) setTimeout(() => startListening(), 1000);
            return;
        }
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-MX'; 
        
        const voices = window.speechSynthesis.getVoices();
        const latinVoice = voices.find(v => (v.lang.includes('MX') || v.lang.includes('ES')) && v.lang.startsWith('es'));
        if (latinVoice) utterance.voice = latinVoice;
        utterance.rate = 1.1; 
        
        utterance.onend = () => { 
            if (shouldContinueListening) {
                startListening();
            } else {
                resetIdleTimer(); 
            }
        };
        window.speechSynthesis.speak(utterance);
    };

    const handleProcessCommand = async (text: string) => {
        if (!text.trim()) return;
        setIsProcessing(true); 
        setFeedback("Analizando...");
        try {
            const fullContext = { 
                user: userProfile.name, 
                projects: projects.map(p => p.name), 
                location: currentView, 
                year: new Date().getFullYear() 
            };
            const analysis = await analyzeVoiceCommand(text, fullContext);
            if (analysis && analysis.confirmationText) {
                setFeedback(analysis.confirmationText);
                
                // Si la IA dice que necesita más info, o es solo una respuesta, activamos modo conversacional
                const isConversational = analysis.needsMoreInfo || analysis.intent === 'answer' || analysis.intent === 'list_projects' || analysis.intent === 'get_agenda';
                
                speakAndReset(analysis.confirmationText, isConversational);
                
                if (analysis.intent && !analysis.needsMoreInfo) {
                    await executeAction(analysis);
                }
            } else {
                setFeedback("Te escuché, ¿qué deseas?");
                speakAndReset("Te escuché, ¿cómo puedo ayudarte?", true);
            }
        } catch (e) { 
            console.error("Voice process error", e);
            setFeedback("Error de Shivo."); 
            speakAndReset("Lo siento, hubo un error procesando tu comando."); 
        } finally { 
            setIsProcessing(false); 
            setTimeout(() => { if (!isListening) setFeedback(null); }, 8000);
        }
    };

    const executeAction = async (analysis: any) => {
        const { intent, entities } = analysis;
        
        if (intent === 'navigate') {
            const viewMap: any = { 
                'dashboard': 'dashboard', 'inicio': 'dashboard',
                'projects': 'projects', 'proyectos': 'projects',
                'calendar': 'globalCalendar', 'calendario': 'globalCalendar', 'agenda': 'globalCalendar',
                'hub': 'hub', 'comunidad': 'hub', 'feed': 'hub', 'mensajes': 'hub',
                'wallet': 'wallet', 'billetera': 'wallet', 'cartera': 'wallet', 'intis': 'wallet',
                'ia': 'aiStudio', 'studio': 'aiStudio', 'ai studio': 'aiStudio',
                'perfil': 'profile', 'profile': 'profile', 'mi perfil': 'profile',
                'socios': 'partners', 'partners': 'partners', 'embajadores': 'partners',
                'discovery': 'discovery', 'descubrir': 'discovery', 'noticias': 'discovery',
                'drive': 'drive', 'nube': 'drive', 'archivos': 'drive',
                // AI APPS Mapping
                'aiStudio/chat': 'aiStudio',
                'aiStudio/agents': 'aiStudio',
                'aiStudio/live': 'aiStudio',
                'aiStudio/presentations': 'aiStudio',
                'aiStudio/socialManager': 'aiStudio',
                'aiStudio/webProgrammer': 'aiStudio',
                'aiStudio/formBuilder': 'aiStudio',
                'aiStudio/mediaGenerator': 'aiStudio',
                'aiStudio/imageEditor': 'aiStudio',
                'aiStudio/videoInsights': 'aiStudio',
                'aiStudio/audioTools': 'aiStudio',
            };
            
            const target = viewMap[entities.view];
            if (target) { 
                setCurrentView(target); 
                if (entities.view === 'mensajes') setActiveHubView('messages');
                window.location.hash = entities.view; 
            } else {
                setToastNotification({ title: "Navegación", message: `No encontré la vista: ${entities.view}`, icon: "help" });
            }
        } 
        else if (intent === 'create_task') {
            // Lógica inteligente para encontrar el proyecto por nombre
            let targetProject = null;
            if (entities.projectName) {
                targetProject = projects.find(p => p.name.toLowerCase().includes(entities.projectName.toLowerCase()));
            }

            if (targetProject) { 
                const folderId = targetProject.folders[0]?.id;
                if (folderId) {
                    await createTask({ 
                        title: entities.title || 'Nueva Tarea de Voz', 
                        description: entities.content || 'Creada vía comando de voz Shivo.', 
                        projectId: targetProject.id, 
                        folderId: folderId, 
                        date: entities.date || new Date().toISOString().split('T')[0], 
                        status: 'Por Hacer' 
                    }, folderId); 
                    setToastNotification({ title: "Tarea Creada", message: `${entities.title} en ${targetProject.name}`, icon: "check" }); 
                }
            }
        } 
        else if (intent === 'create_project') {
            const pid = await addProject({ 
                name: entities.title || 'Nuevo Proyecto de Voz', 
                ownerId: userProfile.uid, 
                members: [userProfile], 
                memberIds: [userProfile.uid], 
                folders: [{id: `f-${Date.now()}`, name: 'General', tasks: []}], 
                documents:[], notes:[], drawings:[], chats:[], spreadsheets:[], 
                finances:{income:0,expenses:0,transactions:[], adn: 'independent', fiscalCountry: 'OTHER'}, 
                statuses:[] 
            });
            setCurrentView('projects'); 
            setSelectedProjectId(pid); 
            window.location.hash = `projects/${pid}`;
        }
        else if (intent === 'schedule_meeting') {
            try {
                const scheduledAt = `${entities.date || new Date().toISOString().split('T')[0]}T${entities.time || '10:00'}:00`;
                await scheduleMeeting(entities.title || 'Reunión de Voz', scheduledAt, [], "Reunión agendada vía Shivo Voice.");
                setCurrentView('globalCalendar');
                window.location.hash = 'globalCalendar';
            } catch (e) {
                console.error("Meeting schedule failed", e);
            }
        }
    };

    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => ({
                x: Math.min(prev.x, window.innerWidth - 70),
                y: Math.min(prev.y, window.innerHeight - 150)
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div 
            ref={bubbleRef}
            style={{ 
                left: position.x, 
                top: position.y, 
                touchAction: 'none', 
                zIndex: 2000000,
                transition: isDragging ? 'none' : 'opacity 0.5s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }} 
            className={`fixed ${isIdle ? 'opacity-40' : 'opacity-100'} hover:opacity-100`}
        >
            {(isListening || isProcessing || feedback) && ( 
                <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 bg-black/90 text-white px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/10 animate-scale-in origin-bottom min-w-[220px] text-center pointer-events-none">
                    <p className="font-bold text-[11px] uppercase tracking-widest text-brand-accent mb-1">{isListening ? "Escuchando..." : "Shivo IA"}</p>
                    <span className="text-xs font-medium block leading-tight">{feedback || (transcript ? `"${transcript}"` : "Te escucho...")}</span>
                </div> 
            )}
            
            <div 
                onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} 
                className={`absolute -top-1 -right-1 w-8 h-8 rounded-full border-2 flex items-center justify-center cursor-pointer z-20 shadow-xl transition-all ${isMuted ? 'bg-red-600 scale-90' : 'bg-green-500 scale-100'} border-white text-white active:scale-125`}
            >
                <Icon name={isMuted ? "volumeMute" : "volume"} className="w-4 h-4" />
            </div>

            <div 
                onMouseDown={(e) => handleStart(e.clientX, e.clientY)} 
                onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)} 
                onClick={toggleListening} 
                className={`w-16 h-16 rounded-full shadow-[0_15px_35px_rgba(0,0,0,0.5)] flex items-center justify-center transform border-2 cursor-grab active:cursor-grabbing backdrop-blur-xl relative overflow-hidden transition-transform ${isListening ? 'scale-110 border-brand-primary ring-8 ring-brand-primary/20' : 'border-white/20 bg-black/90 hover:scale-105 active:scale-95'}`}
            >
                {isListening && <div className="absolute inset-0 rounded-full border-4 border-brand-primary animate-ping opacity-30"></div>}
                {isProcessing && <div className="absolute inset-0 rounded-full border-t-2 border-brand-accent animate-spin"></div>}
                <img src={logoUrl} alt="Shivo" className={`w-full h-full object-cover transition-opacity select-none pointer-events-none ${isListening ? 'opacity-100' : 'opacity-85'}`} />
            </div>
        </div>
    );
};

export default VoiceActionOverlay;
