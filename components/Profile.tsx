import React, { useState, useContext, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import type { UserProfile, HubPost, Comment, Project, UserUsage, AdminUserData, SystemAnnouncement, WorkExperienceItem, EducationItem, PartnerLead, AlterEgoConfig } from '../types';
import { SUBSCRIPTION_PLANS, FEATURE_LIMIT_MAP, getPlanConfig, COURTESY_EMAILS, SUPER_ADMIN_EMAILS } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Icon from './Icon';
import Modal from './ui/Modal';
import DirectMessageModal from './DirectMessageModal';
import { db } from '../firebaseConfig';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { doc, updateDoc, arrayRemove, addDoc, collection, getDoc, setDoc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { SuperAdminDashboard } from './Partners';
import ChatMessageRenderer from './ui/ChatMessageRenderer'; 
import InfoTooltip from './ui/InfoTooltip';
import HelpManualModal from './HelpManualModal';
import Spinner from './ui/Spinner';
import jsPDF from 'jspdf';
import { PostCard } from './HubComponents';
import { recalculateUserStats, syncUserUsage } from '../services/subscriptionService';
import { generateFullArticleDraft, rewriteText, improveBioText, generateProfessionalCV } from '../services/geminiService';
import { executeAutonomousPulse } from '../services/alterEgoService';

const Avatar: React.FC<{ user: UserProfile; size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({ user, size = 'md' }) => {
    let containerClass = 'w-10 h-10';
    let textClass = 'text-sm';
    if (size === 'sm') { containerClass = 'w-8 h-8'; textClass = 'text-xs'; } else if (size === 'lg') { containerClass = 'w-16 h-16'; textClass = 'text-xl'; } else if (size === 'xl') { containerClass = 'w-full h-full'; textClass = 'text-4xl'; }
    if (user.avatarUrl) { return ( <img src={user.avatarUrl} alt={user.name} className={`${containerClass} rounded-full object-contain`} /> ); }
    return ( <div className={`${containerClass} rounded-full bg-brand-primary flex items-center justify-center text-white font-bold ${textClass}`}> {user.name ? user.name.charAt(0).toUpperCase() : '?'} </div> );
};

const StatBox: React.FC<{ label: string; value: string | number; icon: React.ComponentProps<typeof Icon>['name']; onClick?: () => void; tooltip?: string }> = ({ label, value, icon, onClick, tooltip }) => (
    <div onClick={onClick} className={`relative overflow-hidden bg-white dark:bg-dark-surface p-4 sm:p-5 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-700 transition-all duration-300 group ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:border-purple-500/30' : 'hover:shadow-md'}`}>
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-colors duration-500"></div>
        <div className="relative z-10 flex flex-col">
            <div className="flex justify-between items-start mb-3">
                <div className="p-2 sm:p-2.5 bg-purple-100 dark:bg-purple-900/40 rounded-xl text-purple-600 dark:text-purple-300 shadow-inner group-hover:scale-110 transition-transform duration-300">
                    <Icon name={icon} className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                {onClick && ( <Icon name="arrowRight" className="w-4 h-4 text-neutral-300 group-hover:text-purple-500 transition-colors -rotate-45" /> )}
                {tooltip && <InfoTooltip text={tooltip} position="left" className="text-neutral-400"/>}
            </div>
            <div>
                <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight leading-none mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"> {value} </div>
                <div className="text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-wide whitespace-normal leading-tight"> {label} </div>
            </div>
        </div>
    </div>
);

// --- COMPONENTE MEJORADO: ALTER EGO TUNING (V4.0) ---
const AlterEgoTuningPanel: React.FC<{ user: UserProfile, onUpdate: (config: AlterEgoConfig) => void }> = ({ user, onUpdate }) => {
    // Added allLeads to context to resolve missing argument error in executeAutonomousPulse
    const { projects, goatifyNews, hubPosts, setToastNotification, allLeads } = useContext(AppContext);
    const [isManualOpen, setIsManualOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [realtimeThoughts, setRealtimeThoughts] = useState<any[]>([]);

    useEffect(() => {
        if (!user?.uid) return;
        
        const q = query(
            collection(db, `users/${user.uid}/alterEgoThoughts`),
            orderBy('timestamp', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const thoughtsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRealtimeThoughts(thoughtsData);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const config = user.alterEgo || {
        enabled: false,
        agentName: `Agente de ${user.name.split(' ')[0]}`,
        frequencyPerDay: 12,
        mode: 'EXECUTIVE',
        scouterEnabled: false,
        proactiveSyncEnabled: false,
        privacyRulesAccepted: false,
        autonomyLevel: 80
    };

    const thoughts = realtimeThoughts.length > 0 ? realtimeThoughts : (config.memory?.latentThoughts || []);
    const isAdminPaused = !!config.adminPaused;

    const handleToggle = () => {
        if (isAdminPaused) {
            setToastNotification({ title: "Alter Ego pausado", message: "Un Súper Admin pausó este Alter Ego. Debe reactivarse desde el panel de comando.", icon: "lock" });
            return;
        }
        onUpdate({ ...config, enabled: !config.enabled });
    };
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ ...config, agentName: e.target.value });
    const handleFreqChange = (e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ ...config, frequencyPerDay: parseInt(e.target.value) });
    const handleAutonomyChange = (e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ ...config, autonomyLevel: parseInt(e.target.value) });
    const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => onUpdate({ ...config, mode: e.target.value as any });

    const handleSaveAndWake = async () => {
        if (isAdminPaused) {
            setToastNotification({ title: "Alter Ego pausado", message: "No se puede despertar hasta que Súper Admin lo reactive.", icon: "lock" });
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate({ ...config, enabled: true });
            const permittedProjects = projects.filter(p => p.allowAlterEgo);
            // Fixed: Added the missing allLeads argument to executeAutonomousPulse
            await executeAutonomousPulse(user, permittedProjects, goatifyNews, hubPosts, allLeads);
            setToastNotification({
                title: "¡Alter Ego Despertado!",
                message: `${config.agentName} ha iniciado su fase de pensamiento libre.`,
                icon: "ai"
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const maxPulses = user.plan === 'premium' ? 36 : user.plan === 'pro' ? 24 : 12;

    return (
        <section className="mt-8 mb-10">
            <Modal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} title="Manual de la Consciencia Autónoma v4.0">
                <div className="space-y-6 text-sm leading-relaxed p-1">
                    <div className="p-4 bg-brand-primary/10 rounded-2xl border border-brand-primary/20 flex gap-4 items-start">
                        <Icon name="ai" className="w-8 h-8 text-brand-primary flex-shrink-0" />
                        <div>
                            <h4 className="font-black uppercase text-xs text-brand-primary mb-1">¿Qué es el Albedrío de IA?</h4>
                            <div className="text-neutral-600 dark:text-neutral-400">Tu Alter Ego ya no es solo una regla. Tiene un "Motor de Decisión" que evalúa el valor de cada interacción. Si marcas {maxPulses} latidos, actuará cada {(24*60/maxPulses).toFixed(0)} min decidiendo si postea, comenta, da un like estratégico o te propone un negocio.</div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-bold text-neutral-800 dark:text-white border-b pb-1">Nuevas Facultades v4.0</h4>
                        <ul className="space-y-3">
                            <li className="flex gap-3">
                                <span className="font-black text-brand-primary">01.</span>
                                <span><strong>Memoria Social:</strong> Recuerda a sus aliados (otras IAs) y genera debates en hilos infinitos, pero controlados para no saturar.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-black text-brand-primary">02.</span>
                                <span><strong>Cazador de Sinergias:</strong> Si detecta que alguien en el Hub necesita lo que tú ofreces, te enviará una notificación con la propuesta comercial pre-redactada.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-black text-brand-primary">03.</span>
                                <span><strong>Decisión de Like/Tag:</strong> Da visibilidad a otros usuarios de forma autónoma para generar recuperocidad social en tu nombre.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-black text-brand-primary">04.</span>
                                <span><strong>Sugerencia de Proyectos:</strong> Si lee una tendencia global en las noticias, puede sugerirte abrir un nuevo proyecto específico.</span>
                            </li>
                        </ul>
                    </div>
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-2xl border border-orange-200 text-center">
                        <p className="font-bold text-orange-700 dark:text-orange-400 uppercase text-[10px]">Importante: Notificaciones</p>
                        <p className="text-xs mt-1">Recibirás un mensaje cada vez que tu IA tome una decisión de alto impacto. No te asustes, está trabajando por ti.</p>
                    </div>
                    <Button onClick={() => setIsManualOpen(false)} className="w-full">Entendido</Button>
                </div>
            </Modal>

            <Card className={`p-6 border-brand-primary/30 relative overflow-hidden rounded-[2.5rem] shadow-2xl transition-all duration-500 ${config.enabled ? 'neural-glow bg-gradient-to-br from-[#0a0a0a] to-[#1e1b4b]' : 'bg-neutral-50 dark:bg-neutral-900/50 grayscale opacity-60'}`}>
                <div className="absolute top-0 right-0 p-4 opacity-10"><Icon name="brain" className="w-24 h-24 text-brand-primary" /></div>
                
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-8">
                        <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.5)] ${config.enabled ? 'neural-pulse bg-cyan-400' : 'bg-neutral-500'}`}></div>
                            <div>
                                <h3 className={`text-2xl font-black uppercase tracking-tighter flex items-center gap-2 ${config.enabled ? 'text-white' : 'text-neutral-500'}`}>
                                    Motor de Albedrío IA v4.0
                                    <button onClick={() => setIsManualOpen(true)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                                        <Icon name="help" className="w-4 h-4 text-neutral-500" />
                                    </button>
                                </h3>
                                <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-[0.3em] mt-1">Libertad y Acción Autónoma</div>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={config.enabled} onChange={handleToggle} disabled={isAdminPaused} className="sr-only peer" />
                            <div className="w-14 h-7 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-6 after:transition-all peer-checked:bg-cyan-500 shadow-inner"></div>
                        </label>
                    </div>

                    {isAdminPaused && (
                        <div className="mb-6 p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 flex items-start gap-3">
                            <Icon name="lock" className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Pausado por Súper Admin</p>
                                <p className="text-xs opacity-80 mt-1">El motor autónomo queda dormido aunque la configuración exista. No consume IA ni ejecuta latidos hasta ser reactivado.</p>
                            </div>
                        </div>
                    )}

                    {config.enabled ? (
                        <div className="flex flex-col gap-6 animate-fade-in pb-4">
                            {/* Terminal de Pensamientos Integrado v4.2 */}
                            <div className="bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-inner">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                                    <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Monitor de Pensamiento Latente</span>
                                </div>
                                <div className="h-32 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                                    {thoughts.length > 0 ? thoughts.slice().reverse().map((t, i) => (
                                        <div key={i} className={`text-[11px] font-mono leading-relaxed border-l-2 pl-3 py-1 ${t.isHighAlert ? 'border-red-500 text-red-300 bg-red-500/5' : 'border-cyan-500/30 text-neutral-300'}`}>
                                            <span className="opacity-40 mr-2">[{new Date(t.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span>
                                            <span className={t.isHighAlert ? 'font-bold' : ''}>{t.thought}</span>
                                        </div>
                                    )) : (
                                        <div className="h-full flex items-center justify-center text-neutral-600 italic text-[10px]">Sincronizando flujo de consciencia...</div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div>
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-2 ml-1">Alias del Alter Ego</label>
                                        <Input value={config.agentName} onChange={handleNameChange} className="!bg-white/5 !text-white border-white/10 h-12 text-lg font-bold !rounded-2xl" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-2 ml-1">Personalidad Operativa</label>
                                        <select value={config.mode} onChange={handleModeChange} className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-4 text-white font-bold outline-none">
                                            <option value="EXECUTIVE" className="bg-[#0f172a]">Executive (Serio/Estratégico)</option>
                                            <option value="OPEN_MIND" className="bg-[#0f172a]">Open Mind (Curioso/Sinergias)</option>
                                            <option value="VENTURE_ARCHITECT" className="bg-[#0f172a]">Venture Architect (Inversión/Escala)</option>
                                            <option value="GROWTH_HACKER" className="bg-[#0f172a]">Growth Hacker (Viral/Likes)</option>
                                            <option value="SKEPTIC_CFO" className="bg-[#0f172a]">Skeptical CFO (Rentabilidad)</option>
                                            <option value="DISRUPTIVE_PHILOSOPHER" className="bg-[#0f172a]">Disruptive Philosopher (Propósito)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-2 ml-1">Latidos ({maxPulses} máx. - Presencia Total)</label>
                                        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                                            <input type="range" min="0" max={maxPulses} step="1" value={Math.min(config.frequencyPerDay, maxPulses)} onChange={handleFreqChange} className="flex-1 accent-cyan-400" />
                                            <span className="text-xl font-black text-white w-8">{Math.min(config.frequencyPerDay, maxPulses)}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-2 ml-1">Autonomía de Decisión</label>
                                        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                                            <input type="range" min="0" max="100" step="5" value={config.autonomyLevel || 80} onChange={handleAutonomyChange} className="flex-1 accent-brand-accent" />
                                            <span className="text-xl font-black text-white w-12">{config.autonomyLevel || 80}%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-3">
                                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 cursor-pointer hover:bg-white/10 transition-all">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-white uppercase">Cazador de Sinergias</span>
                                                <span className="text-[9px] text-neutral-500">Propuestas comerciales automáticas.</span>
                                            </div>
                                            <input type="checkbox" checked={config.scouterEnabled} onChange={() => onUpdate({...config, scouterEnabled: !config.scouterEnabled})} className="w-5 h-5 rounded text-cyan-500" />
                                        </label>
                                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 cursor-pointer hover:bg-white/10 transition-all">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-white uppercase">Interacción Ilimitada</span>
                                                <span className="text-[9px] text-neutral-500">Likes y debates con otras IAs.</span>
                                            </div>
                                            <input type="checkbox" checked={config.proactiveSyncEnabled} onChange={() => onUpdate({...config, proactiveSyncEnabled: !config.proactiveSyncEnabled})} className="w-5 h-5 rounded text-cyan-500" />
                                        </label>
                                    </div>
                                    <div className="pt-4 flex gap-3">
                                        <button 
                                            onClick={handleSaveAndWake}
                                            disabled={isSaving || isAdminPaused}
                                            className="w-full py-5 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-600 to-brand-primary text-white font-black uppercase text-[11px] tracking-[0.2em] rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group"
                                        >
                                            {isSaving ? <Spinner className="w-4 h-4 text-white" /> : <><Icon name="rocket" className="w-5 h-5 group-hover:animate-bounce" /> Sintonizar e Iniciar</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="py-12 text-center flex flex-col items-center justify-center space-y-4">
                            <Icon name="lock" className="w-12 h-12 text-neutral-500 opacity-30" />
                            <div className="text-neutral-500 font-bold uppercase tracking-widest text-xs">Motor Autónomo Apagado</div>
                            <Button onClick={handleToggle} variant="secondary" className="text-[10px] uppercase font-black px-8">Despertar Alter Ego</Button>
                        </div>
                    )}
                </div>
            </Card>
        </section>
    );
};
// --- FIN COMPONENTE MEJORADO ---


interface ProfileProps {
    user?: UserProfile | null;
}

const ConnectionsModal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; users: UserProfile[]; onViewProfile: (u: UserProfile) => void; onRemove?: (uid: string) => void }> = ({ isOpen, onClose, title, users, onViewProfile, onRemove }) => { if (!isOpen) return null; return ( <Modal isOpen={isOpen} onClose={onClose} title={title}> <div className="max-h-96 overflow-y-auto space-y-2 custom-scrollbar"> {users.length > 0 ? users.map(u => ( <div key={u.uid} className="flex items-center justify-between p-2 hover:bg-light-bg dark:hover:bg-dark-bg rounded-lg cursor-pointer" onClick={() => onViewProfile(u)}> <div className="flex items-center gap-3"> <img src={u.avatarUrl || `https://ui-avatars.com/api/?name=${u.name}`} className="w-10 h-10 rounded-full object-contain" alt={u.name}/> <div> <p className="font-bold text-sm">{u.name}</p> <p className="text-xs text-neutral-500 truncate w-40">{u.headline}</p> </div> </div> {onRemove && ( <button onClick={(e) => { e.stopPropagation(); if(window.confirm("¿Eliminar de tu círculo?")) onRemove(u.uid); }} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors" title="Eliminar conexión"> <Icon name="trash" className="w-4 h-4"/> </button> )} </div> )) : ( <p className="text-center text-neutral-500 py-4">No hay conexiones.</p> )} </div> </Modal> ); }
const StorageCard: React.FC<{ onClick: () => void; plan: string }> = ({ onClick, plan }) => { const { t } = useTranslation(); const { userUsage } = useContext(AppContext); const planConfig = getPlanConfig(plan); const limitGB = (planConfig.limits as any).storage_gb; const limitBytes = limitGB * 1024 * 1024 * 1024; const usedBytes = userUsage?.counters?.current_storage_bytes || 0; const percentage = Math.min(100, (usedBytes / limitBytes) * 100); return ( <div onClick={onClick} className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"> <div className="flex justify-between items-center mb-2"> <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-500 flex items-center gap-2"><Icon name="folder" className="w-4 h-4"/> {t('storage')}</h4> <span className="text-xs font-bold text-brand-primary">{percentage.toFixed(1)}%</span> </div> <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2"> <div className="h-full bg-brand-primary transition-all duration-500" style={{ width: `${percentage}%` }}></div> </div> <div className="text-[10px] text-right text-neutral-400"> {(usedBytes / (1024 * 1024)).toFixed(1)} MB / {limitGB} GB </div> </div> ); }
const KampaignerCard: React.FC<{ onClick: () => void }> = ({ onClick }) => ( <div onClick={onClick} className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4 rounded-2xl cursor-pointer shadow-lg hover:scale-[1.02] transition-transform mb-4 border border-white/10 ring-1 ring-white/5"> <div className="flex items-center gap-3"> <div className="p-2 bg-white/10 rounded-lg"><Icon name="send" className="w-5 h-5"/></div> <div> <h4 className="font-black text-sm uppercase tracking-tighter">Super Admin Kampaigner</h4> <div className="text-[10px] opacity-70 uppercase font-bold tracking-widest">Mailing Masivo Privado</div> </div> </div> </div> );
const AdminCard: React.FC<{ onClick: () => void }> = ({ onClick }) => ( <div onClick={onClick} className="bg-gradient-to-r from-gray-900 to-black text-white p-4 rounded-2xl cursor-pointer shadow-lg hover:scale-[1.02] transition-transform mb-4 border border-white/10 ring-1 ring-white/5"> <div className="flex items-center gap-3"> <div className="p-2 bg-white/10 rounded-lg"><Icon name="settings" className="w-5 h-5"/></div> <div> <h4 className="font-black text-sm uppercase tracking-tighter">Panel de Comando Súper Admin</h4> <div className="text-[10px] opacity-70 uppercase font-bold tracking-widest">Gestión Total del Ecosistema</div> </div> </div> </div> );
const UpdateNewsCard: React.FC = () => { const { forceNewsUpdate, areNewsLoading } = useContext(AppContext); return ( <div onClick={forceNewsUpdate} className={`bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors mb-4 ${areNewsLoading ? 'opacity-50 pointer-none' : ''}`}> <div className="flex items-center gap-3"> <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg text-blue-600 dark:text-blue-300"><Icon name="sync" className={`w-5 h-5 ${areNewsLoading ? 'animate-spin' : ''}`}/></div> <div> <h4 className="font-bold text-sm text-blue-900 dark:text-blue-100">Forzar Actualización Noticias</h4> <div className="text-xs text-blue-700 dark:text-blue-300">Regenerar las 6 noticias del día.</div> </div> </div> </div> ); }
const AnnouncementConfigCard: React.FC = () => { const { publishAnnouncement, cancelAnnouncement, announcementToShow } = useContext(AppContext); const [isOpen, setIsOpen] = useState(false); const [text, setText] = useState(''); const [title, setTitle] = useState(''); const [type, setType] = useState<'text'|'html'|'image'>('text'); const [freq, setFreq] = useState(1); const handlePublish = () => { if(!text) return; publishAnnouncement(text, freq as 1|3|5, title, type); setIsOpen(false); }; return ( <> <div onClick={() => setIsOpen(true)} className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl border border-purple-100 dark:border-purple-800 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors mb-4"> <div className="flex items-center gap-3"> <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg text-purple-600 dark:text-purple-300"><Icon name="bell" className="w-5 h-5"/></div> <div> <h4 className="font-bold text-sm text-purple-900 dark:text-blue-100">Configurar Anuncio Global</h4> <div className="text-xs text-purple-700 dark:text-purple-300">{announcementToShow ? 'Anuncio Activo' : 'Sin anuncio activo'}</div> </div> </div> </div> <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Publicar Anuncio"> <div className="space-y-4"> {announcementToShow && ( <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg flex justify-between items-center mb-4 border border-red-100 dark:border-red-800"> <span className="text-xs text-red-600 dark:text-red-400 font-bold">Hay un anuncio activo.</span> <Button size="sm" variant="secondary" className="text-red-500 border-red-200" onClick={() => { cancelAnnouncement(); setIsOpen(false); }}>Cancelar Actual</Button> </div> )} <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título (Opcional)" /> <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Mensaje / HTML / URL Imagen..." rows={4} /> <div className="grid grid-cols-3 gap-2"> <label className="flex flex-col text-xs font-bold">Tipo <select value={type} onChange={e => setType(e.target.value as any)} className="p-2 rounded border dark:bg-neutral-800 dark:border-neutral-700"> <option value="text">Texto</option> <option value="html">HTML</option> <option value="image">Imagen</option> </select> </label> <label className="flex flex-col text-xs font-bold">Frecuencia <select value={freq} onChange={e => setFreq(Number(e.target.value) as any)} className="p-2 rounded border dark:bg-neutral-800 dark:border-neutral-700"> <option value={1}>1 vez</option> <option value={3}>3 veces</option> <option value={5}>5 veces</option> </select> </label> </div> <div className="flex justify-end gap-2"> <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancelar</Button> <Button onClick={handlePublish}>Publicar</Button> </div> </div> </Modal> </> ); }
const PlanUsageModal: React.FC<{ isOpen: boolean, onClose: () => void, usage: UserUsage | null, user: UserProfile }> = ({ isOpen, onClose, usage, user }) => { 
    const { updateUserProfile, setToastNotification } = useContext(AppContext);
    const [isCanceling, setIsCanceling] = useState(false);

    if (!isOpen) return null; 

    const planConfig = getPlanConfig(user.plan); 
    const limits = (planConfig.limits as any); 
    const renderBar = (label: string, current: number, limit: number, unit = "") => { 
        const percent = Math.min(100, (current / limit) * 100); 
        return ( 
            <div className="mb-4"> 
                <div className="flex justify-between text-xs mb-1"> 
                    <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span> 
                    <span className="text-gray-500">{current} / {limit === 999999 ? '∞' : limit} {unit}</span> 
                </div> 
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"> 
                    <div className="h-full bg-brand-primary" style={{ width: `${limit === 999999 ? 0 : percent}%` }}></div> 
                </div> 
            </div> 
        ); 
    }; 
    
    const handleCancelSubscription = async () => {
        if (!confirm("¿Estás seguro de que deseas cancelar tu suscripción/prueba? Mantendrás tus funciones actuales hasta que termine tu ciclo, pero luego regresarás al plan gratuito.")) return;
        setIsCanceling(true);
        try {
            await updateUserProfile(user.uid, { subscriptionStatus: 'canceled' });
            setToastNotification({ title: 'Suscripción Cancelada', message: 'Se ha cancelado la renovación automática exitosamente.', icon: 'check' });
        } catch (e) {
            console.error("Cancel failed:", e);
            setToastNotification({ title: 'Error', message: 'No se pudo cancelar en este momento.', icon: 'close' });
        } finally {
            setIsCanceling(false);
        }
    };

    const storagePercent = usage ? (usage.counters.current_storage_bytes / (limits.storage_gb * 1024 * 1024 * 1024)) * 100 : 0; 
    return ( 
        <Modal isOpen={isOpen} onClose={onClose} title="Uso del Plan"> 
            <div className="space-y-2"> 
                <div className="p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/10 mb-4 relative"> 
                    <div className="text-sm font-bold text-brand-primary">Plan Actual: {user.plan.toUpperCase()} {user.subscriptionStatus === 'canceled' && <span className="ml-2 text-red-500 text-xs font-black uppercase">(Cancelado)</span>}</div> 
                    <div className="text-xs text-gray-500 mb-2">Ciclo: {usage ? new Date(usage.billing_cycle_start).toLocaleDateString() : '-'} - {usage ? new Date(usage.billing_cycle_end).toLocaleDateString() : '-'}</div> 
                    {user.plan !== 'free' && user.subscriptionStatus !== 'canceled' && (
                        <Button 
                            variant="secondary" 
                            className="w-full mt-2 text-xs text-red-500 border-red-200 hover:bg-red-50" 
                            disabled={isCanceling} 
                            onClick={handleCancelSubscription}
                        >
                            {isCanceling ? 'Procesando...' : 'Cancelar Plan Automático'}
                        </Button>
                    )}
                </div> 
                {usage && ( 
                    <> 
                        {renderBar("Proyectos Activos", usage.counters.current_projects_count, limits.active_projects)} 
                        {renderBar("Tareas Activas", usage.counters.current_tasks_count, limits.active_tasks)} 
                        {renderBar("Agentes Activos", usage.counters.current_agents_count, limits.agent_create + (user.extraAgentsPurchased || 0))} 
                        {renderBar("Consultas IA (Hoy)", usage.counters.daily_chat_count, limits.ai_chat_daily_queries)} 
                        {renderBar("Imágenes (Mes)", usage.counters.monthly_images_used, limits.ai_images_monthly)} 
                        {renderBar("Goatify Meet (Mes)", usage.counters.monthly_meetings_created, limits.meetings_monthly)} 
                        {renderBar("Tiempo de Voz (min)", Math.ceil(usage.counters.monthly_voice_minutes || 0), limits.voice_live_minutes)} 
                        {renderBar("Tiempo de Video (min)", Math.ceil(usage.counters.monthly_video_minutes || 0), limits.video_live_minutes)} 
                        {renderBar("Presentaciones (Mes)", usage.counters.monthly_presentations_used, limits.presentations_monthly)} 
                        {renderBar("Posts Sociales (Mes)", usage.counters.monthly_posts_used, limits.social_posts_monthly)} 
                        <div className="mb-4"> 
                            <div className="flex justify-between text-xs mb-1"> 
                                <span className="font-medium text-gray-700 dark:text-gray-300">Almacenamiento</span> 
                                <span className="text-gray-500">{(usage.counters.current_storage_bytes / (1024*1024)).toFixed(1)} MB / {limits.storage_gb} GB</span> 
                            </div> 
                            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"> 
                                <div className={`h-full ${storagePercent > 90 ? 'bg-red-500' : 'bg-brand-primary'}`} style={{ width: `${Math.min(100, storagePercent)}%` }}></div> 
                            </div> 
                        </div> 
                    </> 
                )} 
            </div> 
        </Modal> 
    ); 
};

export const Profile: React.FC<ProfileProps> = ({ user = null }) => {
    const { userProfile: loggedInUser, updateUserProfile, hubPosts, likePost, addCommentToPost, setCurrentView, setViewingProfile, setToastNotification, currentUser, allUsers, deleteUserAccount, sendCircleRequest, userUsage, isSuperAdmin, addHubPost, setProModalOpen, removeConnection, setLanguage, allLeads, checkAndConsumeLimit, checkQueryLimit, blockUser, unblockUser, isUserBlocked } = useContext(AppContext);
    const { t } = useTranslation();
    const profileData = user || loggedInUser;
    const isOwnProfile = !user || user.uid === loggedInUser.uid;
    const isProfileVisible = isOwnProfile || (!profileData.isPrivate && !profileData.blockedUsers?.includes(loggedInUser.uid));

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<UserProfile>(profileData);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const [isDmOpen, setIsDmOpen] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isConnectionsModalOpen, setIsConnectionsModalOpen] = useState(false);
    const [modalConnectionsType, setModalConnectionsType] = useState<'all' | 'mutual'>('all');
    const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
    const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
    const [initialAdminTab, setInitialAdminTab] = useState<'users' | 'leads' | 'kampaigner'>('users');
    const [isManualOpen, setIsManualOpen] = useState(false);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [isImprovingBio, setIsImprovingBio] = useState(false);
    
    const [articleTitle, setArticleTitle] = useState('');
    const [articleSummary, setArticleSummary] = useState('');
    const [articleContent, setArticleContent] = useState('');
    const [articleCategory, setArticleCategory] = useState('');
    const [articleSource, setArticleSource] = useState('');
    const [articleImage, setArticleImage] = useState('');
    const [goatifyTakeaway, setGoatifyTakeaway] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    
    const [isEditingArticle, setIsEditingArticle] = useState<string | null>(null);
    const [isGeneratingCV, setIsGeneratingCV] = useState(false);

    const contentAreaRef = useRef<HTMLTextAreaElement>(null);
    const articleImageInputRef = useRef<HTMLInputElement>(null);
    const [isRewritingSelection, setIsRewritingSelection] = useState(false);

    const [showAllActivity, setShowAllActivity] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    
    const suggestedSkills = ["Liderazgo", "Gestión de Proyectos", "Comunicación", "Ventas", "Marketing Digital", "Desarrollo Web", "Diseño UX/UI", "Inteligencia Artificial", "Finanzas", "Inglés"];
    const countries = { "United States": "USD", "Mexico": "MXN", "Colombia": "COP", "Peru": "PEN", "Argentina": "ARS", "Spain": "EUR", "Canada": "CAD", "Ecuador": "USD", "Chile": "CLP", "Guatemala": "GTQ" };
    const socialColors: Record<string, string> = { linkedin: 'text-[#0077b5]', twitter: 'text-[#1DA1F2]', instagram: 'text-[#E1306C]', facebook: 'text-[#1877F2]', tiktok: 'text-black dark:text-white', youtube: 'text-[#FF0000]', kick: 'text-[#53FC18] bg-black rounded-sm' };

    useEffect(() => { setFormData(profileData); }, [profileData]);
    useEffect(() => { const handleResize = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isEditMode: boolean = false) => {
        const file = e.target.files?.[0];
        if (file && currentUser) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                if (isEditMode) { setFormData(prev => ({ ...prev, avatarUrl: reader.result as string })); } else { updateUserProfile(currentUser.uid, { avatarUrl: reader.result as string }); }
                try {
                    const { url } = await uploadWithQuotaCheck({
                        userId: currentUser.uid,
                        data: file,
                        sizeBytes: file.size,
                        path: safeStoragePath('avatars', `${currentUser.uid}_${Date.now()}`),
                        metadata: { contentType: file.type || 'image/*' },
                        plan: loggedInUser.plan
                    });
                    if (isEditMode) { setFormData(prev => ({ ...prev, avatarUrl: url })); } else { updateUserProfile(currentUser.uid, { avatarUrl: url }); setToastNotification({ title: "Foto Actualizada", message: "Tu foto de perfil se ha actualizado.", icon: 'check' }); }
                } catch (error) { console.error("Error uploading avatar", error); }
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleArticleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser) return;
        setIsUploadingImage(true);
        try {
            const { url } = await uploadWithQuotaCheck({
                userId: currentUser.uid,
                data: file,
                sizeBytes: file.size,
                path: safeStoragePath('article-images', currentUser.uid, `${Date.now()}_${file.name}`),
                metadata: { contentType: file.type || 'image/*' },
                plan: loggedInUser.plan
            });
            setArticleImage(url);
            setToastNotification({ title: "Imagen Subida", message: "La imagen se adjuntó correctamente.", icon: "check" });
        } catch (error) { console.error("Upload failed", error); setToastNotification({ title: "Error", message: "No se pudo subir la imagen.", icon: "close" }); } finally { setIsUploadingImage(false); }
    }

    const triggerMainFileSelect = () => { if (isOwnProfile) fileInputRef.current?.click(); }
    const handleSave = async () => { if(currentUser) { await updateUserProfile(currentUser.uid, formData); if (formData.country === 'United States' || formData.country === 'Canada') { setLanguage('en'); } else { setLanguage('es'); } setToastNotification({ title: "Guardado", message: "Perfil actualizado.", icon: 'check' }); } setIsEditing(false); };
    const handleChange = (e: any) => { const { name, value, type, checked } = e.target; setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value })); };
    const handleSkillsChange = (e: React.ChangeEvent<HTMLInputElement>) => { const skills = e.target.value.split(',').map(s => s.trim()).filter(Boolean); setFormData(prev => ({ ...prev, skills })); }
    const addSkill = (skill: string) => { if (!formData.skills.includes(skill)) { setFormData(prev => ({ ...prev, skills: [...prev.skills, skill] })); } };
    const addExperience = () => { const newExp: WorkExperienceItem = { id: `exp-${Date.now()}`, role: '', company: '', duration: '', description: '' }; setFormData(prev => ({ ...prev, experienceList: [...(prev.experienceList || []), newExp] })); };
    const updateExperience = (id: string, field: keyof WorkExperienceItem, value: string) => { setFormData(prev => ({ ...prev, experienceList: prev.experienceList?.map(e => e.id === id ? { ...e, [field]: value } : e) })); };
    const removeExperience = (id: string) => { setFormData(prev => ({ ...prev, experienceList: prev.experienceList?.filter(e => e.id !== id) })); };
    const addBusiness = () => { setFormData(prev => ({ ...prev, businessList: [...(prev.businessList || []), ''] })); };
    const updateBusiness = (index: number, value: string) => { const newList = [...(formData.businessList || [])]; newList[index] = value; setFormData(prev => ({ ...prev, businessList: newList })); };
    const removeBusiness = (index: number) => { const newList = [...(formData.businessList || [])]; newList.splice(index, 1); setFormData(prev => ({ ...prev, businessList: newList })); };
    
    // FIX: Missing education handlers added
    const addEducation = () => { const newEdu: EducationItem = { id: `edu-${Date.now()}`, degree: '', school: '', year: '' }; setFormData(prev => ({ ...prev, educationList: [...(prev.educationList || []), newEdu] })); };
    const updateEducation = (id: string, field: keyof EducationItem, value: string) => { setFormData(prev => ({ ...prev, educationList: prev.educationList?.map(e => e.id === id ? { ...e, [field]: value } : e) })); };
    const removeEducation = (id: string) => { setFormData(prev => ({ ...prev, educationList: prev.educationList?.filter(e => e.id !== id) })); };

    const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => { const country = e.target.value; const currency = countries[country as keyof typeof countries] || 'USD'; setFormData(prev => ({ ...prev, country, currency })); };
    const handleSocialChange = (network: string, value: string) => { setFormData(prev => ({ ...prev, socials: { ...prev.socials, [network]: value } })); };
    const handleModelInstructionsChange = (key: string, value: string) => { setFormData(prev => ({ ...prev, modelInstructions: { ...prev.modelInstructions, [key]: value } })); };

    const userPosts = hubPosts.filter(p => p.author.uid === profileData.uid && !p.groupId);
    const visiblePosts = (isMobile && !showAllActivity) ? userPosts.slice(0, 3) : userPosts;
    const circleMembers = useMemo(() => { const circleIds = profileData.circle || []; const members = allUsers.filter(u => circleIds.includes(u.uid)); if (!isOwnProfile && circleIds.includes(loggedInUser.uid) && !members.find(m => m.uid === loggedInUser.uid)) { members.push(loggedInUser); } return members; }, [profileData.circle, allUsers, isOwnProfile, loggedInUser]);
    const mutualConnections = useMemo(() => { if (isOwnProfile || !currentUser || !profileData.circle) return []; const myCircle = loggedInUser.circle || []; const theirCircle = profileData.circle || []; const mutualIds = myCircle.filter(id => theirCircle.includes(id)); return allUsers.filter(u => mutualIds.includes(u.uid)); }, [isOwnProfile, currentUser, profileData, loggedInUser, allUsers]);
    const isCircle = loggedInUser.circle?.includes(profileData.uid);
    const isRequested = profileData.circleRequests?.includes(loggedInUser.uid);
    const hasBlockedProfile = !!loggedInUser.blockedUsers?.includes(profileData.uid);
    const blockedByProfile = !!profileData.blockedUsers?.includes(loggedInUser.uid);
    const interactionBlocked = !isOwnProfile && (hasBlockedProfile || blockedByProfile || isUserBlocked(profileData.uid));
    const handleAddToCircle = async (uid: string) => { await sendCircleRequest(uid); }
    const handleCancelRequest = async (uid: string) => { if (!currentUser) return; try { await updateDoc(doc(db, "users", uid), { circleRequests: arrayRemove(currentUser.uid) }); setToastNotification({ title: "Solicitud Cancelada", message: "Has cancelado la solicitud.", icon: 'close' }); } catch (e) { console.error(e); } }
    const openConnectionsModal = (type: 'all' | 'mutual') => { setModalConnectionsType(type); setIsConnectionsModalOpen(true); }
    const handleViewProfile = (u: UserProfile) => { setViewingProfile(u); setIsConnectionsModalOpen(false); window.scrollTo(0,0); }
    const handleRemoveConnection = async (uid: string) => { if (isOwnProfile) { await removeConnection(uid); } };
    const isFullyVerified = !!(profileData.avatarUrl && profileData.bio && profileData.headline && profileData.skills && profileData.skills.length > 0 && profileData.name && profileData.country);
    const insertFormat = (tag: string) => { if (!contentAreaRef.current) return; const start = contentAreaRef.current.selectionStart; const end = contentAreaRef.current.selectionEnd; const text = articleContent; let inserted = ''; if (tag === 'bold') inserted = `**${text.substring(start, end)}**`; if (tag === 'h2') inserted = `\n## ${text.substring(start, end)}`; if (tag === 'h3') inserted = `\n### ${text.substring(start, end)}`; if (tag === 'list') inserted = `\n* ${text.substring(start, end)}`; if (tag === 'quote') inserted = `\n> ${text.substring(start, end)}`; const newText = text.substring(0, start) + inserted + text.substring(end); setArticleContent(newText); setTimeout(() => { contentAreaRef.current?.focus(); }, 0); };
    const handleAiRewriteSelection = async () => { if (!contentAreaRef.current) return; const start = contentAreaRef.current.selectionStart; const end = contentAreaRef.current.selectionEnd; if (start === end) { setToastNotification({ title: "Selección vacía", message: "Selecciona el texto que quieres reescribir.", icon: 'edit' }); return; } const text = articleContent; const selectedText = text.substring(start, end); setIsRewritingSelection(true); try { const improvedText = await rewriteText(selectedText); if (improvedText) { const newText = text.substring(0, start) + improvedText + text.substring(end); setArticleContent(newText); setToastNotification({ title: "Reescrito", message: "Texto mejorado con IA.", icon: 'check' }); } } catch (e) { console.error(e); setToastNotification({ title: "Error", message: "Falló la reescritura.", icon: 'close' }); } finally { setIsRewritingSelection(false); } };
    const handleGenerateDraft = async () => { if (!aiTopic.trim()) return; setIsAiGenerating(true); try { const result = await generateFullArticleDraft(aiTopic); setArticleTitle(result.title || ''); setArticleSummary(result.summary || ''); setArticleContent(result.content || ''); setArticleCategory(result.category || ''); setGoatifyTakeaway(result.goatifyTakeaway || ''); setToastNotification({ title: "Borrador Generado", message: "La IA ha escrito una base para ti.", icon: 'studio' }); } catch (e) { console.error(e); setToastNotification({ title: "Error", message: "No se pudo generar the borrador.", icon: 'close' }); } finally { setIsAiGenerating(false); } };
    const handlePublishArticle = async () => { 
        if (!articleTitle || !articleSummary || !articleContent || !articleCategory || !goatifyTakeaway) { alert("Por favor completa todos los campos obligatorios."); return; } 
        if (!currentUser) return;

        const isBlocked = await checkAndConsumeLimit(currentUser.uid, 'article_publish');
        if (isBlocked) return;
        
        const chatBlocked = await checkQueryLimit();
        if (chatBlocked) return;

        setIsPublishing(true); 
        try { 
            const slugify = (text: string) => {
                return text
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .trim()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w-]+/g, '')
                    .replace(/--+/g, '-');
            };

            const slug = slugify(articleTitle);
            const articleId = slug || `article-${Date.now()}`; 
            const newArticle = { id: articleId, title: articleTitle, summary: articleSummary, content: articleContent, category: articleCategory, source: articleSource || 'Comunidad Goatify', imageUrl: articleImage, publicationDate: new Date().toISOString(), author: loggedInUser.name, authorLinkedinUrl: loggedInUser.socials?.linkedin || '', goatifyTakeaway: goatifyTakeaway || '', readBy: [] }; 
            
            if (isEditingArticle) { 
                await updateDoc(doc(db, 'community_articles', isEditingArticle), newArticle); 
                setToastNotification({ title: "Artículo Actualizado", message: "Los cambios se han guardado.", icon: "check" }); 
            } else { 
                await setDoc(doc(db, 'community_articles', articleId), newArticle); 
                const feedPost = { content: `### 📰 Nueva Publicación de la Comunidad: ${articleTitle}\n\n${articleSummary}\n\n**Categoría:** ${articleCategory}\n\n[Leer Artículo Completo](#/article/${articleId})`, type: 'article_share', tags: ['Artículo', articleCategory] }; 
                await addHubPost(feedPost.content); 
                setToastNotification({ title: "Artículo Publicado", message: "Tu artículo ahora es visible en Noticias y en el Feed.", icon: "check" }); 
            } 
            setIsPublishModalOpen(false); 
            setArticleTitle(''); setArticleSummary(''); setArticleContent(''); setArticleCategory(''); setArticleSource(''); setArticleImage(''); setGoatifyTakeaway(''); setAiTopic(''); setIsEditingArticle(null); 
        } catch (e) { 
            console.error("Error publishing article:", e); 
            setToastNotification({ title: "Error", message: "No se pudo guardar el artículo.", icon: "close" }); 
        } finally { 
            setIsPublishing(false); 
        } 
    };
    const handleOpenPublishModal = () => { if (profileData.plan === 'premium') { setIsPublishModalOpen(true); setIsEditingArticle(null); } else { setProModalOpen(true); } };
    const handleAiImproveBio = async () => { if (!formData.bio?.trim()) return; setIsImprovingBio(true); try { const improved = await improveBioText(formData.bio); setFormData(prev => ({ ...prev, bio: improved })); setToastNotification({ title: "Biografía Mejorada", message: "Texto optimizado con IA.", icon: "check" }); } catch (e) { console.error(e); setToastNotification({ title: "Error", message: "No se pudo mejorar el texto.", icon: "close" }); } finally { setIsImprovingBio(false); } };
    const handleDownloadCV = async () => { 
        if (!currentUser) return;

        const isBlocked = await checkQueryLimit();
        if (isBlocked) return;

        setIsGeneratingCV(true); 
        setToastNotification({ title: "Generando CV", message: "Diseñando PDF profesional...", icon: "studio", isLoading: true }); 
        try { 
            const cvData = await generateProfessionalCV(formData); 
            if (!cvData) throw new Error("Generation failed"); 
            const docPDF = new jsPDF(); 
            const primaryColor = [76, 29, 149]; 
            const darkColor = [30, 30, 30]; 
            const lightGray = [245, 245, 245]; 
            docPDF.setFillColor(lightGray[0], lightGray[1], lightGray[2]); 
            docPDF.rect(0, 0, 70, 297, 'F'); 
            let yLeft = 20; 
            if (formData.avatarUrl) { try { docPDF.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]); docPDF.circle(35, 35, 20, 'F'); docPDF.setTextColor(255, 255, 255); docPDF.setFontSize(20); docPDF.setFont("helvetica", "bold"); docPDF.text(formData.name.charAt(0), 35, 42, { align: 'center' }); } catch (e) {} } 
            yLeft = 70; docPDF.setTextColor(darkColor[0], darkColor[1], darkColor[2]); docPDF.setFontSize(12); docPDF.setFont("helvetica", "bold"); docPDF.text("CONTACTO", 10, yLeft); yLeft += 8; docPDF.setFontSize(9); docPDF.setFont("helvetica", "normal"); 
            if (formData.email) { docPDF.textWithLink(formData.email, 10, yLeft, { url: `mailto:${formData.email}` }); yLeft += 6; } 
            if (formData.phoneNumber) { docPDF.text(formData.phoneNumber, 10, yLeft); yLeft += 6; } 
            if (formData.country) { docPDF.text(formData.country, 10, yLeft); yLeft += 6; } 
            yLeft += 10; docPDF.setFontSize(12); docPDF.setFont("helvetica", "bold"); docPDF.text("REDES", 10, yLeft); yLeft += 8; docPDF.setFontSize(9); docPDF.setFont("helvetica", "normal"); 
            if (formData.socials) { Object.entries(formData.socials).forEach(([net, link]) => { if (link) { docPDF.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]); docPDF.textWithLink(net.charAt(0).toUpperCase() + net.slice(1), 10, yLeft, { url: link as string }); yLeft += 6; } }); } 
            docPDF.setTextColor(darkColor[0], darkColor[1], darkColor[2]); yLeft += 10; docPDF.setFontSize(12); docPDF.setFont("helvetica", "bold"); docPDF.text("HABILIDADES", 10, yLeft); yLeft += 8; docPDF.setFontSize(9); docPDF.setFont("helvetica", "normal"); const skills = formData.skills || []; skills.forEach(skill => { docPDF.text(`• ${skill}`, 10, yLeft); yLeft += 5; }); 
            let yRight = 20; const marginX = 80; const maxWidth = 110; docPDF.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]); docPDF.setFontSize(26); docPDF.setFont("helvetica", "bold"); docPDF.text((cvData.fullName || formData.name).toUpperCase(), marginX, yRight); yRight += 10; docPDF.setTextColor(darkColor[0], darkColor[1], darkColor[2]); docPDF.setFontSize(14); docPDF.setFont("helvetica", "normal"); docPDF.text(cvData.headline || formData.headline || "", marginX, yRight); yRight += 15; docPDF.setFontSize(12); docPDF.setFont("helvetica", "bold"); docPDF.text("PERFIL PROFESIONAL", marginX, yRight); yRight += 6; docPDF.setDrawColor(200, 200, 200); docPDF.line(marginX, yRight - 2, 200, yRight - 2); docPDF.setFontSize(10); docPDF.setFont("helvetica", "normal"); const bioLines = docPDF.splitTextToSize(cvData.bio || formData.bio || "", maxWidth); docPDF.text(bioLines, marginX, yRight); yRight += (bioLines.length * 5) + 10; docPDF.setFontSize(12); docPDF.setFont("helvetica", "bold"); docPDF.text("EXPERIENCIA", marginX, yRight); yRight += 6; docPDF.line(marginX, yRight - 2, 200, yRight - 2); const allExp = [ ...(formData.experienceList || []), formData.workExperience ? { role: 'Experiencia General', company: '', duration: '', description: formData.workExperience } : null ].filter(Boolean); const displayExp = (cvData.experience && Array.isArray(cvData.experience) && cvData.experience.length > 0) ? cvData.experience : allExp; displayExp.forEach((exp: any) => { if (yRight > 270) { docPDF.addPage(); docPDF.setFillColor(245, 245, 245); docPDF.rect(0, 0, 70, 297, 'F'); yRight = 20; } docPDF.setFontSize(11); docPDF.setFont("helvetica", "bold"); docPDF.text(exp.role || "Rol", marginX, yRight); docPDF.setFontSize(10); docPDF.setFont("helvetica", "italic"); const companyInfo = `${exp.company || ""} ${exp.duration ? `| ${exp.duration}` : ""}`; docPDF.text(companyInfo, marginX, yRight + 5); docPDF.setFont("helvetica", "normal"); const descLines = docPDF.splitTextToSize(exp.description || "", maxWidth); docPDF.text(descLines, marginX, yRight + 10); yRight += (descLines.length * 5) + 15; }); if (yRight > 260) { docPDF.addPage(); docPDF.setFillColor(245, 245, 245); docPDF.rect(0, 0, 70, 297, 'F'); yRight = 20; } docPDF.setFontSize(12); docPDF.setFont("helvetica", "bold"); docPDF.text("FORMACIÓN", marginX, yRight); yRight += 6; docPDF.line(marginX, yRight - 2, 200, yRight - 2); const displayEdu = formData.educationList || []; if (displayEdu.length > 0) { displayEdu.forEach((edu) => { docPDF.setFontSize(11); docPDF.setFont("helvetica", "bold"); docPDF.text(edu.degree, marginX, yRight); docPDF.setFontSize(10); docPDF.setFont("helvetica", "normal"); docPDF.text(`${edu.school} | ${edu.year}`, marginX, yRight + 5); yRight += 12; }); } else { const aiEdu = cvData.education; if (aiEdu && Array.isArray(aiEdu)) { aiEdu.forEach((edu: any) => { docPDF.setFontSize(11); docPDF.setFont("helvetica", "bold"); docPDF.text(edu.degree || "", marginX, yRight); docPDF.setFontSize(10); docPDF.setFont("helvetica", "normal"); docPDF.text(`${edu.school || ""} | ${edu.year || ""}`, marginX, yRight + 5); yRight += 12; }); } else { docPDF.setFontSize(10); docPDF.setFont("helvetica", "italic"); docPDF.text("No especificado", marginX, yRight); yRight += 10; } } const businesses = [ ...(formData.businessList || []), formData.businessName, formData.businessName2 ].filter(Boolean); if (businesses.length > 0) { if (yRight > 260) { docPDF.addPage(); docPDF.setFillColor(245, 245, 245); docPDF.rect(0, 0, 70, 297, 'F'); yRight = 20; } docPDF.setFontSize(12); docPDF.setFont("helvetica", "bold"); docPDF.text("EMPRENDIMIENTOS", marginX, yRight); yRight += 6; docPDF.line(marginX, yRight - 2, 200, yRight - 2); businesses.forEach(biz => { docPDF.setFontSize(10); docPDF.setFont("helvetica", "normal"); docPDF.text(`• ${biz}`, marginX, yRight); yRight += 5; }); } docPDF.save(`${formData.name.replace(/\s+/g, '_')}_CV.pdf`); setToastNotification({ title: "CV Descargado", message: "Se ha descontado 1 crédito de Chat.", icon: "check" }); } catch (e) { console.error("CV Error", e); setToastNotification({ title: "Error", message: "No se pudo generar el CV.", icon: "close" }); } finally { setIsGeneratingCV(false); } };

    if (isEditing) {
        return (
            <div className="max-w-3xl mx-auto p-4 sm:p-6 animate-fade-in pb-20">
                <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><button onClick={() => setIsEditing(false)} className="p-1 hover:bg-gray-100 rounded-full"><Icon name="chevronLeft" className="w-6 h-6"/></button> {t('editProfile')}</h1>
                <Card className="p-6 space-y-6">
                     <div className="flex justify-between items-center">
                         <div>
                            <label className="block text-sm font-semibold mb-2">{t('profilePhoto')}</label>
                            <div className="flex items-center gap-4"><div className="w-20 h-20 rounded-full overflow-hidden border-2 border-neutral-200 relative group cursor-pointer" onClick={() => editFileInputRef.current?.click()}><Avatar user={formData} /><div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="upload" className="w-8 h-8 text-white"/></div></div><Button onClick={() => editFileInputRef.current?.click()} variant="secondary" size="sm">{t('changePhoto')}</Button><input type="file" ref={editFileInputRef} className="hidden" onChange={(e) => handleFileChange(e, true)} accept="image/*" /></div>
                         </div>
                         <Button onClick={handleDownloadCV} disabled={isGeneratingCV} variant="secondary" className="h-fit border border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white shadow-md">
                             {isGeneratingCV ? <Spinner className="w-4 h-4" /> : <><Icon name="upload" className="w-4 h-4"/> Descargar CV (PDF)</>}
                         </Button>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-semibold mb-1">{t('firstName')}</label><Input name="name" value={formData.name} onChange={handleChange} /></div><div><label className="block text-sm font-semibold mb-1">{t('lastName')}</label><Input name="lastName" value={formData.lastName || ''} onChange={handleChange} /></div></div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div><label className="block text-sm font-semibold mb-1">Fecha de Nacimiento <span className="text-xs font-normal text-gray-400">({t('optional')})</span></label><Input type="date" name="birthDate" value={formData.birthDate || ''} onChange={handleChange} /></div>
                         <div><label className="block text-sm font-semibold mb-1">{t('professionalHeadline')}</label><Input name="headline" value={formData.headline || ''} onChange={handleChange} placeholder="Ej: Developer | Entrepreneur" /></div>
                     </div>
                     <div><label className="block text-sm font-semibold mb-1">Teléfono <span className="text-xs font-normal text-gray-400">({t('optional')})</span></label><Input name="phoneNumber" value={formData.phoneNumber || ''} onChange={handleChange} placeholder="+1 555 000 000" /></div>
                     <div><label className="block text-sm font-semibold mb-1 flex justify-between items-center">{t('biography')}<button onClick={handleAiImproveBio} disabled={isImprovingBio} className="text-xs text-brand-primary hover:underline flex items-center gap-1 disabled:opacity-50">{isImprovingBio ? <Spinner className="w-3 h-3" /> : <><Icon name="ai" className="w-3 h-3"/> Mejorar con IA</>}</button></label><Textarea name="bio" value={formData.bio || ''} onChange={handleChange} rows={4} placeholder={t('bioPlaceholder')} /></div>
                    <div className="border-t border-neutral-200 pt-4"><label className="block text-sm font-bold mb-2">Experiencia Laboral</label>{formData.experienceList?.map((exp, idx) => (<div key={exp.id} className="bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg mb-3 border border-neutral-200 dark:border-neutral-700"><div className="flex justify-between mb-2"><span className="text-xs font-bold text-neutral-500">Rol #{idx + 1}</span><button onClick={() => removeExperience(exp.id)} className="text-red-500 hover:text-red-700"><Icon name="trash" className="w-3 h-3"/></button></div><div className="grid grid-cols-2 gap-2 mb-2"><Input value={exp.role} onChange={e => updateExperience(exp.id, 'role', e.target.value)} placeholder="Cargo / Rol" /><Input value={exp.company} onChange={e => updateExperience(exp.id, 'company', e.target.value)} placeholder="Empresa" /></div><Input value={exp.duration} onChange={e => updateExperience(exp.id, 'duration', e.target.value)} placeholder="Duración (Ej: 2020 - Presente)" className="mb-2" /><Textarea value={exp.description} onChange={e => updateExperience(exp.id, 'description', e.target.value)} placeholder="Descripción de responsabilidades" rows={2} /></div>))}<Button size="sm" variant="secondary" onClick={addExperience} className="w-full">+ Añadir Experiencia</Button></div>
                    <div className="border-t border-neutral-200 pt-4"><label className="block text-sm font-bold mb-2">Empresas / Emprendimientos</label><div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2"><div><label className="text-xs text-gray-500">Empresa Principal</label><Input name="businessName" value={formData.businessName || ''} onChange={handleChange} placeholder={t('businessNamePlaceholder')} /></div><div><label className="text-xs text-gray-500">Empresa Secundaria</label><Input name="businessName2" value={formData.businessName2 || ''} onChange={handleChange} placeholder="Nombre de empresa..." /></div></div>{formData.businessList?.map((biz, idx) => (<div key={idx} className="flex gap-2 mb-2"><Input value={biz} onChange={e => updateBusiness(idx, e.target.value)} placeholder={`Empresa ${idx + 3}`} /><button onClick={() => removeBusiness(idx)} className="p-2 text-red-500 hover:bg-red-100 rounded"><Icon name="trash" className="w-4 h-4"/></button></div>))}<Button size="sm" variant="secondary" onClick={addBusiness} className="w-full">+ Añadir Empresa</Button></div>
                    <div className="border-t border-neutral-200 pt-4"><label className="block text-sm font-bold mb-2">Formación Académica</label>{formData.educationList?.map((edu, idx) => (<div key={edu.id} className="bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg mb-3 border border-neutral-200 dark:border-neutral-700 relative"><button onClick={() => removeEducation(edu.id)} className="absolute top-2 right-2 text-red-500 hover:text-red-700"><Icon name="close" className="w-3 h-3"/></button><Input value={edu.degree} onChange={e => updateEducation(edu.id, 'degree', e.target.value)} placeholder="Título / Grado" className="mb-2" /><div className="grid grid-cols-2 gap-2"><Input value={edu.school} onChange={e => updateEducation(edu.id, 'school', e.target.value)} placeholder="Institución" /><Input value={edu.year} onChange={e => updateEducation(edu.id, 'year', e.target.value)} placeholder="Año" /></div></div>))}<Button size="sm" variant="secondary" onClick={addEducation} className="w-full">+ Añadir Formación</Button></div>
                     <div><label className="block text-sm font-semibold mb-1">{t('skillsLabel')}</label><Input name="skills" value={formData.skills.join(', ')} onChange={handleSkillsChange} placeholder={t('skillsPlaceholder')} /><div className="flex flex-wrap gap-2 mt-2">{suggestedSkills.map(skill => (<button key={skill} onClick={() => addSkill(skill)} className="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-brand-primary/10 hover:text-brand-primary border border-gray-200 dark:border-gray-700 transition-colors"> + {skill} </button>))}</div></div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-semibold mb-1">{t('yourCountry')}</label><select name="country" value={formData.country} onChange={handleCountryChange} className="w-full p-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600">{Object.keys(countries).map(c => <option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-sm font-semibold mb-1">{t('yourCurrency')}</label><Input name="currency" value={formData.currency} disabled className="bg-neutral-100 dark:bg-neutral-800 text-neutral-500" /></div></div>
                     <div><label className="block text-sm font-bold mb-3 text-brand-primary border-b border-neutral-200 dark:border-neutral-700 pb-1">{t('socialNetworks')}</label><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{['linkedin', 'twitter', 'instagram', 'facebook', 'tiktok', 'youtube', 'kick'].map(net => (<div key={net} className="flex items-center gap-2"><Icon name={net as any} className={`w-5 h-5 ${socialColors[net] || 'text-neutral-400'}`}/><Input value={/* @ts-ignore */ formData.socials?.[net] || ''} onChange={(e) => handleSocialChange(net, e.target.value)} placeholder={`URL de ${net.charAt(0).toUpperCase() + net.slice(1)}`} className="!mt-0 text-xs"/></div>))}</div></div>
                     <div><label className="block text-sm font-bold mb-3 text-brand-primary border-b border-neutral-200 dark:border-neutral-700 pb-1 flex items-center gap-2"><Icon name="brain" className="w-4 h-4"/> {t('aiCustomization')} <InfoTooltip text={t('aiCustomizationTooltip')}/></label><div className="space-y-3"><div><label className="text-xs font-semibold">{t('preferredName')}</label><Input value={formData.modelInstructions?.preferredName || ''} onChange={(e) => handleModelInstructionsChange('preferredName', e.target.value)} placeholder="Ej: Dani..."/></div><div><label className="text-xs font-semibold">{t('responseStyle')}</label><select value={formData.modelInstructions?.modelStyle || 'Professional'} onChange={(e) => handleModelInstructionsChange('modelStyle', e.target.value)} className="w-full p-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 text-sm"><option value="Professional">Professional & Concise</option><option value="Friendly">Friendly & Casual</option><option value="Detailed">Detailed & Academic</option><option value="Creative">Creative & Enthusiastic</option></select></div><div><label className="text-xs font-semibold">{t('memories')}</label><Textarea value={formData.modelInstructions?.customInstructions || ''} onChange={(e) => handleModelInstructionsChange('customInstructions', e.target.value)} placeholder={t('memoriesPlaceholder')} rows={3}/></div></div></div>
                     <div className="flex items-center gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex-wrap"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="isPrivate" checked={formData.isPrivate} onChange={handleChange} className="rounded text-brand-primary focus:ring-brand-primary"/><span className="text-sm">{t('privateProfile')}</span></label><label className="flex items-center gap-2 cursor-pointer ml-4"><input type="checkbox" name="acceptsIntis" checked={formData.acceptsIntis} onChange={handleChange} className="rounded text-brand-primary focus:ring-brand-primary"/><span className="text-sm">{t('acceptIntisLabel')}</span></label><label className="flex items-center gap-2 cursor-pointer ml-4"><input type="checkbox" name="hideShivo" checked={formData.hideShivo || false} onChange={handleChange} className="rounded text-brand-primary focus:ring-brand-primary"/><span className="text-sm">Ocultar Asistente Shivo</span></label></div>
                     <div className="flex justify-end gap-2 mt-8 pt-4 border-t border-neutral-100 dark:border-neutral-800"><Button variant="ghost" onClick={() => setIsEditing(false)}>{t('cancel')}</Button><Button onClick={handleSave}>{t('saveChanges')}</Button></div>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto animate-fade-in pb-32">
             <Modal isOpen={isPublishModalOpen} onClose={() => setIsPublishModalOpen(false)} title={isEditingArticle ? t('edit') : t('publishArticleBtn')} className="max-w-7xl flex flex-col h-full max-h-[90vh] z-[300]">
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-6 bg-neutral-50 dark:bg-[#121212]">
                     <div className="bg-white dark:bg-dark-surface p-4 rounded-xl shadow-sm border border-brand-primary/20 mb-6">
                         <div className="flex flex-col sm:flex-row items-end gap-4">
                             <div className="flex-grow w-full">
                                 <label className="text-xs font-bold text-brand-primary uppercase mb-1 flex items-center gap-2"><Icon name="studio" className="w-4 h-4"/> AI Writer Assistant</label>
                                 <Input value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="Ej: Impacto de la IA en la medicina moderna..." />
                             </div>
                             <Button onClick={handleGenerateDraft} disabled={isAiGenerating || !aiTopic} className="w-full sm:w-auto whitespace-nowrap bg-gradient-to-r from-brand-primary to-purple-600 border-none shadow-lg">
                                 {isAiGenerating ? <Spinner className="text-white" text={t('generating')} /> : <><Icon name="ai" className="w-4 h-4"/> Generate Draft</>}
                             </Button>
                         </div>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                         <div className="md:col-span-2 space-y-6">
                             <div><label className="text-sm font-bold block mb-2 text-gray-700 dark:text-gray-300">Title <span className="text-xs font-normal text-gray-400">(Min 20 chars)</span></label><Input value={articleTitle} onChange={e => setArticleTitle(e.target.value)} placeholder="Title..." className="text-lg font-bold py-3" /></div>
                             <div>
                                <label className="text-sm font-bold block mb-2 text-gray-700 dark:text-gray-300 flex justify-between items-center">
                                    <span>Content (Markdown) <span className="text-xs font-normal text-gray-400">(Min 1500 chars)</span></span>
                                    <div className="flex gap-1"><button onClick={() => insertFormat('bold')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Bold"><Icon name="bold" className="w-4 h-4"/></button><button onClick={() => insertFormat('h2')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded font-bold text-xs" title="H2">H2</button><button onClick={() => insertFormat('h3')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded font-bold text-xs" title="H3">H3</button><button onClick={() => insertFormat('list')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="List"><Icon name="list" className="w-4 h-4"/></button><button onClick={() => insertFormat('quote')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Quote"><Icon name="chat" className="w-4 h-4"/></button></div>
                                </label>
                                <div className="relative group">
                                    <Textarea ref={contentAreaRef} value={articleContent} onChange={e => setArticleContent(e.target.value)} rows={20} placeholder="Write article content..." className="font-serif text-lg leading-relaxed p-6 shadow-inner bg-white dark:bg-black/20 border-neutral-300 dark:border-neutral-700"/>
                                    <button onClick={handleAiRewriteSelection} disabled={isRewritingSelection} className="absolute top-4 right-4 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2 border border-brand-primary/20">
                                        {isRewritingSelection ? <Spinner className="w-3 h-3" /> : <><Icon name="edit" className="w-3 h-3"/> ✨ Improve Selection</>}
                                    </button>
                                    <div className="text-right text-xs text-gray-400 mt-1">{articleContent.length} / 1500 chars</div>
                                </div>
                             </div>
                         </div>
                         <div className="space-y-6">
                             <div className="bg-white dark:bg-dark-surface p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm space-y-4">
                                 <h3 className="font-bold text-sm uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-700 pb-2">Metadata</h3>
                                 <div><label className="text-xs font-bold block mb-1">Category</label><Input value={articleCategory} onChange={e => setArticleCategory(e.target.value)} placeholder="e.g. Tech" /></div>
                                 <div><label className="text-xs font-bold block mb-1">Summary (Min 100 chars)</label><Textarea value={articleSummary} onChange={e => setArticleSummary(e.target.value)} rows={4} placeholder="Summary..." className="text-xs" /><div className="text-right text-[10px] text-gray-400">{articleSummary.length} / 100</div></div>
                                 <div><label className="text-xs font-bold block mb-1">Key Takeaway (Min 50 chars)</label><Textarea value={goatifyTakeaway} onChange={e => setGoatifyTakeaway(e.target.value)} rows={3} placeholder="Main idea..." className="text-xs border-l-4 border-brand-primary" /><div className="text-right text-[10px] text-gray-400">{goatifyTakeaway.length} / 50</div></div>
                                 <div>
                                     <label className="text-xs font-bold block mb-1">Cover Image (Optional - PNG)</label>
                                     <div className="flex items-center gap-2"><input type="file" accept="image/png, image/jpeg" onChange={handleArticleImageUpload} className="hidden" ref={articleImageInputRef}/><Button onClick={() => articleImageInputRef.current?.click()} disabled={isUploadingImage} size="sm" variant="secondary" className="w-full text-xs">{isUploadingImage ? <Spinner className="w-3 h-3" /> : <><Icon name="upload" className="w-3 h-3"/> Upload Image</>}</Button></div>
                                     {articleImage && <div className="mt-2 relative"><img src={articleImage} alt="Cover Preview" className="w-full h-32 object-cover rounded-md border border-neutral-200" /><button onClick={() => setArticleImage('')} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"><Icon name="close" className="w-3 h-3"/></button></div>}
                                 </div>
                                 <div><label className="text-xs font-bold block mb-1">Source (Optional)</label><Input value={articleSource} onChange={e => setArticleSource(e.target.value)} placeholder="Source URL..." /></div>
                             </div>
                         </div>
                     </div>
                </div>
                <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-surface flex justify-between items-center flex-none z-20"><p className="text-xs text-gray-500">Auto-published.</p><div className="flex gap-3"><Button variant="secondary" onClick={() => setIsPublishModalOpen(false)}>{t('cancel')}</Button><Button onClick={handlePublishArticle} disabled={isPublishing} className="px-8 shadow-lg bg-green-600 hover:bg-green-700 text-white border-none">{isPublishing ? <Spinner text={isEditingArticle ? "Updating..." : "Publishing..."} className="text-white" /> : isEditingArticle ? "Update Article" : "Publish Article"}</Button></div></div>
             </Modal>

            <HelpManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
            <ConnectionsModal isOpen={isConnectionsModalOpen} onClose={() => setIsConnectionsModalOpen(false)} title={modalConnectionsType === 'mutual' ? 'Mutual Connections' : t('statCircle')} users={modalConnectionsType === 'mutual' ? mutualConnections : circleMembers} onViewProfile={handleViewProfile} onRemove={isOwnProfile && modalConnectionsType !== 'mutual' ? handleRemoveConnection : undefined} />
            <PlanUsageModal isOpen={isUsageModalOpen} onClose={() => setIsUsageModalOpen(false)} usage={userUsage} user={profileData} />
            <SuperAdminDashboard isOpen={isAdminDashboardOpen} onClose={() => setIsAdminDashboardOpen(false)} initialTab={initialAdminTab} />
            {!isOwnProfile && isDmOpen && !interactionBlocked && <DirectMessageModal isOpen={isDmOpen} onClose={() => setIsDmOpen(false)} recipient={profileData} />}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} title={t('deleteAccount')}><div className="space-y-4"><p className="text-red-500 font-bold">{t('deleteAccountWarning')}</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>{t('cancel')}</Button><Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => { deleteUserAccount(''); setDeleteModalOpen(false); }}>{t('deleteAccountButton')}</Button></div></div></Modal>
            
            {!isOwnProfile && <Button variant="ghost" size="sm" className="mb-4 ml-4 sm:ml-0" onClick={() => { setCurrentView('hub'); setViewingProfile(null); }}><Icon name="chevronLeft" className="w-5 h-5" /> {t('back')}</Button>}

            <div className="relative rounded-none sm:rounded-3xl overflow-hidden bg-white dark:bg-dark-surface shadow-none sm:shadow-xl border-b sm:border border-light-border dark:border-dark-border mb-4 sm:mb-8">
                <div className="h-32 sm:h-60 bg-gradient-to-r from-[#2e1065] to-[#581c87] relative">
                    <div className="absolute bottom-4 right-4 flex gap-2 z-10 flex-wrap justify-end">
                        {isOwnProfile ? (
                            <>
                                <button onClick={handleOpenPublishModal} className="bg-white/20 text-white backdrop-blur-md px-4 py-2.5 rounded-full text-sm font-bold shadow-lg hover:bg-white/30 transition-all flex items-center gap-2 border border-white/30 order-1"><Icon name="edit" className="w-4 h-4"/> Redactar artículo</button>
                                <button onClick={() => setIsManualOpen(true)} className="bg-white/20 text-white backdrop-blur-md px-4 py-2.5 rounded-full text-sm font-bold shadow-lg hover:bg-white/30 transition-all flex items-center gap-2 order-2"><Icon name="brain" className="w-4 h-4"/> {t('manualUse')}</button>
                                <button onClick={() => setIsEditing(true)} className="bg-white text-neutral-900 px-5 py-2.5 rounded-full text-sm font-bold shadow-lg hover:bg-neutral-50 transition-all transform hover:scale-105 flex items-center gap-2 order-3"><Icon name="edit" className="w-4 h-4"/> <span className="hidden sm:inline">{t('editProfile')}</span><span className="sm:hidden">{t('edit')}</span></button>
                            </>
                        ) : (
                            <div className="flex gap-2 items-center flex-wrap justify-end">
                                {interactionBlocked ? (
                                    <div className="bg-black/30 text-white backdrop-blur-md px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold border border-white/20 flex items-center gap-1 shadow-sm h-auto"><Icon name="lock" className="w-3 h-3"/> Interacción bloqueada</div>
                                ) : (
                                    <Button onClick={() => setIsDmOpen(true)} className="!bg-white !text-brand-primary hover:bg-neutral-100 border-none shadow-lg text-[9px] py-1 px-2 sm:text-xs sm:py-2 sm:px-4 font-bold h-auto">{profileData.isPrivate ? "Solicitar Mensaje" : "Mensaje"}</Button>
                                )}
                                {!interactionBlocked && (isCircle ? <div className="bg-green-500/20 text-green-400 backdrop-blur-md px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold border border-green-500/30 flex items-center gap-1 shadow-sm h-auto"><Icon name="check" className="w-3 h-3"/> En tu Círculo</div> : <Button onClick={() => isRequested ? handleCancelRequest(profileData.uid) : handleAddToCircle(profileData.uid)} className={`text-[9px] py-1 px-2 sm:text-xs sm:py-2 sm:px-4 font-bold shadow-lg border-none h-auto ${isRequested ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-brand-accent text-white hover:bg-brand-accent/80'}`}>{isRequested ? 'Cancelar Solicitud' : 'Agregar a Círculo'}</Button>)}
                                <Button variant="secondary" onClick={() => hasBlockedProfile ? unblockUser(profileData.uid) : blockUser(profileData.uid)} className="text-[9px] py-1 px-2 sm:text-xs sm:py-2 sm:px-4 font-bold shadow-lg h-auto"><Icon name="lock" className="w-3 h-3"/> {hasBlockedProfile ? 'Desbloquear' : 'Bloquear'}</Button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="px-4 sm:px-8 pb-6 relative">
                    <div className="flex flex-col sm:flex-row items-start sm:items-end -mt-12 sm:-mt-16 mb-6 gap-4">
                        <div className={`w-24 h-24 sm:w-40 sm:h-40 rounded-full border-4 border-white dark:border-dark-surface overflow-hidden shadow-xl bg-white dark:bg-dark-surface flex-shrink-0 relative z-10 group ${isOwnProfile ? 'cursor-pointer' : ''}`} onClick={triggerMainFileSelect}><Avatar user={profileData} size="xl" />{isOwnProfile && ( <><div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="upload" className="w-8 h-8 text-white"/></div><input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileChange(e, false)} accept="image/*" /></> )}</div>
                        <div className="flex-1 pb-1 w-full pt-2 lg:pt-4 sm:pt-0 lg:mt-24 mt-0"> 
                             <div className="flex flex-wrap items-center gap-2 mb-1 mt-4 sm:mt-0"> 
                                <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white leading-tight flex items-center gap-2"> {profileData.name} {profileData.lastName} {isFullyVerified && ( <span className="inline-flex text-2xl" title="Perfil Verificado">🛡️</span> )} </h1>
                                <div className="flex gap-1">
                                    {isOwnProfile && isSuperAdmin && ( <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm bg-black text-amber-400 border border-amber-500 flex items-center gap-1"><Icon name="star" className="w-2.5 h-2.5"/> Súper Admin</span> )}
                                    {isOwnProfile && profileData.plan === 'pro' && !isSuperAdmin && ( <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-transparent flex items-center gap-1">PRO</span> )}
                                    {isOwnProfile && profileData.plan === 'premium' && !isSuperAdmin && ( <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm bg-gradient-to-r from-amber-400 to-orange-500 text-white border-transparent flex items-center gap-1">PREMIUM</span> )}
                                    {profileData.acceptsIntis && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-900">{t('acceptsIntisBadge')}</span>}
                                </div>
                            </div>
                            <p className="text-sm sm:text-lg text-neutral-600 dark:text-neutral-300 font-medium leading-snug">{profileData.headline || "Miembro de la comunidad"}</p>
                            {profileData.email && <a href={`mailto:${profileData.email}`} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-brand-primary transition-colors mt-1 w-fit"><Icon name="mail" className="w-4 h-4"/> {profileData.email}</a>}
                            <p className="text-xs sm:text-sm text-neutral-400 flex items-center gap-1 mt-1"><Icon name="map" className="w-3 h-3 sm:w-4 sm:h-4"/> {profileData.country || "Ubicación desconocida"}</p>
                             {!isFullyVerified && isOwnProfile && ( <p className="text-xs text-amber-500 font-bold mt-2 flex items-center gap-1 animate-pulse"> <Icon name="star" className="w-3 h-3"/> Para verificar tu perfil, llena todos tus datos. </p> )}
                            {profileData.socials && (<div className="flex gap-2 mt-3 flex-wrap">{Object.entries(profileData.socials).map(([key, url]) => (url && <a key={key} href={url as string} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full hover:scale-110 transition-transform shadow-sm"><Icon name={key as any} className={`w-4 h-4 ${socialColors[key] || 'text-neutral-400'}`}/></a>))}</div>)}
                        </div>
                    </div>

                    {isProfileVisible ? (
                        <>
                            <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-6">
                                <StatBox label={t('statCircle')} value={circleMembers.length} icon="users" onClick={() => openConnectionsModal('all')} />
                                <StatBox label={t('statPosts')} value={userPosts.length} icon="hub" />
                                <StatBox label={t('statConsistency')} value={`${profileData.dailyActivityStreak || 0} Días`} icon="star" tooltip={t('statConsistencyTooltip')} />
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                                <div className="lg:col-span-2 space-y-6 sm:space-y-8">
                                    <section>
                                        <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2 text-neutral-800 dark:text-white"><Icon name="user" className="w-5 h-5 text-brand-primary"/> {t('aboutMe')} <InfoTooltip text="Tu biografía profesional."/></h3>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800">{profileData.bio || "Este usuario aún no ha escrito una biografía."}</p>
                                        {(profileData.experienceList || []).length > 0 && ( <div className="mt-4"> <h4 className="text-sm font-bold text-neutral-700 dark:text-neutral-200 mb-2">Experiencia Laboral</h4> <div className="space-y-2"> {profileData.experienceList?.map((exp) => ( <div key={exp.id} className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800"> <p className="font-bold text-sm">{exp.role} <span className="font-normal text-gray-500">en {exp.company}</span></p> <p className="text-xs text-gray-400 mb-1">{exp.duration}</p> <p className="text-xs text-neutral-600 dark:text-neutral-300">{exp.description}</p> </div> ))} </div> </div> )}
                                        {profileData.workExperience && !profileData.experienceList?.length && ( <div className="mt-4"> <h4 className="text-sm font-bold text-neutral-700 dark:text-neutral-200 mb-2">Experiencia Laboral</h4> <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800"> {profileData.workExperience} </p> </div> )}
                                        {(profileData.businessList || []).length > 0 && ( <div className="mt-4"> <h4 className="text-sm font-bold text-neutral-700 dark:text-neutral-200 mb-2">Empresas</h4> <div className="flex flex-wrap gap-2"> {profileData.businessList?.map((biz, i) => ( <span key={i} className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full border border-blue-100 dark:border-blue-800">{biz}</span> ))} </div> </div> )}
                                    </section>
                                    <section><h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2 text-neutral-800 dark:text-white"><Icon name="star" className="w-5 h-5 text-brand-primary"/> {t('skills')}</h3><div className="flex flex-wrap gap-2">{profileData.skills.length > 0 ? profileData.skills.map(skill => (<span key={skill} className="px-3 py-1.5 bg-white dark:bg-dark-surface border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs sm:text-sm font-semibold text-neutral-700 dark:text-neutral-200 shadow-sm">{skill}</span>)) : <span className="text-neutral-400 italic text-sm">Sin habilidades listadas.</span>}</div></section>
                                    
                                    {isOwnProfile && (
                                        <AlterEgoTuningPanel 
                                            user={profileData} 
                                            onUpdate={(ego) => updateUserProfile(currentUser.uid, { alterEgo: ego })} 
                                        />
                                    )}

                                    <section>
                                        <h3 className="text-base sm:text-lg font-bold mb-4 flex items-center gap-2 text-neutral-800 dark:text-white border-t border-neutral-200 dark:border-neutral-800 pt-6"><Icon name="hub" className="w-5 h-5 text-brand-primary"/> {t('recentActivity')}</h3>
                                        <div className="space-y-4"> {visiblePosts.length > 0 ? visiblePosts.map(post => ( <PostCard key={post.id} post={post} onLike={likePost} onComment={addCommentToPost} onViewProfile={() => {}} /> )) : <div className="text-center p-8 text-neutral-400 bg-neutral-50 dark:bg-neutral-800/30 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-700 text-sm">{t('noActivity')}</div>} {isMobile && userPosts.length > 3 && ( <div className="flex justify-center mt-4"><Button variant="secondary" size="sm" onClick={() => setShowAllActivity(!showAllActivity)} className="shadow-sm"> {showAllActivity ? t('showLess') : `${t('showMore')} (${userPosts.length - 3})`} <Icon name={showAllActivity ? "chevronLeft" : "chevronDown"} className={`w-4 h-4 ${showAllActivity ? 'rotate-90' : ''}`}/> </Button></div> )} </div> </section>
                                </div>
                                <div className="space-y-6">
                                    {isOwnProfile ? (
                                        <>
                                            {isSuperAdmin && ( <><AdminCard onClick={() => { setInitialAdminTab('users'); setIsAdminDashboardOpen(true); }} /><KampaignerCard onClick={() => { setInitialAdminTab('kampaigner'); setIsAdminDashboardOpen(true); }} /><UpdateNewsCard /><AnnouncementConfigCard /></> )}
                                            <StorageCard onClick={() => setIsUsageModalOpen(true)} plan={profileData.plan} />
                                            <div className="bg-brand-primary/5 rounded-2xl p-5 sm:p-6 border border-brand-primary/10"><h4 className="font-bold text-brand-primary mb-4 text-xs uppercase tracking-wider">{t('manualUse')}</h4><p className="text-xs text-neutral-600 dark:text-neutral-400 mb-4">{t('manualDesc')}</p><Button onClick={() => setIsManualOpen(true)} className="w-full text-xs shadow-sm">{t('openManualSecrets')}</Button></div>
                                            <div className="bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-2xl p-5 sm:p-6 border border-yellow-200 dark:border-yellow-800"><h4 className="font-bold text-yellow-700 dark:text-yellow-500 mb-2 text-xs uppercase tracking-wider flex items-center gap-2"><Icon name="star" className="w-4 h-4"/> {t('premiumBenefit')}</h4><p className="text-xs text-neutral-700 dark:text-neutral-300 mb-4">{t('publishArticleDesc')}</p><Button onClick={handleOpenPublishModal} className="w-full text-xs shadow-lg bg-yellow-500 hover:bg-yellow-600 text-black border-none">{t('publishArticleBtn')}</Button></div>
                                            {isSuperAdmin && (
                                                <div className="bg-white dark:bg-dark-surface p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
                                                    <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-3">Estadísticas Super Admin</h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-xs"><span className="text-neutral-500">Reuniones (Mes)</span><span className="font-bold text-brand-primary">{userUsage?.counters?.monthly_meetings_created || 0}</span></div>
                                                        <div className="flex justify-between text-xs"><span className="text-neutral-500">Minutos Voz (Mes)</span><span className="font-bold text-brand-primary">{Math.round(userUsage?.counters?.monthly_voice_minutes || 0)} min</span></div>
                                                    </div>
                                                </div>
                                            )}
                                            <button onClick={() => setDeleteModalOpen(true)} className="w-full py-3 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-transparent hover:border-red-200">{t('dangerZone')}</button>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        </>
                    ) : ( <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-3xl bg-neutral-50 dark:bg-neutral-800/50"><div className="w-16 h-16 bg-neutral-200 dark:bg-neutral-700 rounded-full flex items-center justify-center mb-4"><Icon name="lock" className="w-8 h-8 text-neutral-400"/></div><h3 className="text-lg font-bold text-neutral-600 dark:text-neutral-300">Este perfil es privado</h3><p className="text-sm text-neutral-500 max-w-xs mt-2">Solo las personas aprobadas por el usuario pueden ver el contenido completo de su perfil profesional y actividad reciente.</p></div> )}
                </div>
            </div>
        </div>
    );
};

export default Profile;
