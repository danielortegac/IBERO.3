
import React, { useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';
import type { AiAgentConfig, AgentFlow, FlowStep, FlowOption, StepType, TtsVoice } from '../types';
import { AppContext } from '../context/AppContext';
import { storage, db, auth } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { doc, updateDoc, serverTimestamp, setDoc, increment } from 'firebase/firestore';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import Input from './ui/Input';
import Modal from './ui/Modal';
import { SUBSCRIPTION_PLANS, getPlanConfig, EXTRA_AGENT_RESPONSES } from '../types';
import jsPDF from 'jspdf';
import Card from './ui/Card';
import PayPalWrapper from './ui/PayPalWrapper';

/**
 * Generates a cubic bezier path for connections between flow nodes.
 */
const getBezierPath = (startX: number, startY: number, endX: number, endY: number) => {
    const dx = Math.abs(endX - startX) * 0.5;
    return `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
};

const STEP_TYPES: { id: StepType; label: string; icon: React.ComponentProps<typeof Icon>['name']; color: string; borderColor: string }[] = [
    { id: 'TEXT', label: 'Enviar Mensaje', icon: 'message', color: 'bg-blue-600', borderColor: 'border-blue-600' },
    { id: 'IMAGE', label: 'Enviar Imagen/Archivo', icon: 'image', color: 'bg-purple-600', borderColor: 'border-purple-600' },
    { id: 'AI_RESPONSE', label: 'Respuesta IA', icon: 'ai', color: 'bg-emerald-600', borderColor: 'border-emerald-600' },
];

const rates: Record<string, number> = {
    USD: 1, MXN: 18.5, COP: 4100,
    PEN: 3.75, ARS: 910, EUR: 0.92,
    CAD: 1.37, BRL: 5.15, CLP: 980, GTQ: 7.8,
};

const formatCurrency = (usdValue: number, userCurrency: string, isMexicoUser: boolean): string => {
    if (isMexicoUser && userCurrency === 'MXN') {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0
        }).format(usdValue * rates['MXN']);
    }
    const selectedRate = rates[userCurrency] || rates['USD'];
    const convertedValue = usdValue * selectedRate;
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: userCurrency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0, 
    }).format(convertedValue);
};

const AgentLimitsHelpModal: React.FC<{ isOpen: boolean; onClose: () => void; plan: string; extraSlots: number; isSuperAdmin?: boolean }> = ({ isOpen, onClose, plan, extraSlots, isSuperAdmin }) => {
    const config = getPlanConfig(plan);
    const baseLimit = (config.limits as any).agents_allowed || 1;
    const baseResponses = (config.limits as any).agent_responses_monthly || 100;
    const baseDailyCredits = (config.limits as any).ai_chat_daily_queries || 30;
    const baseVoiceMins = (config.limits as any).voice_live_minutes || 5;
    
    const totalSlots = baseLimit + extraSlots;
    const totalExtraResponses = extraSlots * 1000;
    const totalPool = baseResponses + totalExtraResponses;
    const totalDailyCredits = baseDailyCredits + (extraSlots * 50);
    const totalVoicePool = baseVoiceMins + (extraSlots * 30);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manual de Capacidad: Vendedores IA" className="max-w-2xl">
            <div className="space-y-6 p-1">
                <div className="bg-brand-primary/5 p-6 rounded-3xl border border-brand-primary/10">
                    <div className="flex justify-between items-start mb-4">
                        <h4 className="text-sm font-black text-brand-primary uppercase tracking-widest flex items-center gap-2">
                            <Icon name="agent" className="w-5 h-5"/> Tu Bolsa Global
                        </h4>
                        {isSuperAdmin && <span className="bg-black text-amber-400 text-[8px] font-black px-2 py-1 rounded-md uppercase tracking-widest">Control Admin</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Capacidad de Equipo</p>
                            <p className="text-2xl font-black text-neutral-900 dark:text-white">{totalSlots} <span className="text-xs font-medium opacity-50">Vendedores</span></p>
                            <p className="text-[8px] text-neutral-400 mt-1 font-bold uppercase">{baseLimit} base + {extraSlots} VIP</p>
                        </div>
                        <div className="p-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Bolsa de Mensajes / Mes</p>
                            <p className="text-2xl font-black text-brand-primary">{totalPool.toLocaleString()}</p>
                            <p className="text-[8px] text-neutral-400 mt-1 font-bold uppercase">Mensajes compartidos entre todos</p>
                        </div>
                    </div>
                    
                    <div className="mt-4 p-4 bg-neutral-900 text-white rounded-2xl flex items-center justify-between shadow-lg">
                        <div>
                            <p className="text-[9px] font-black uppercase text-brand-accent tracking-widest">Energía Shivo Diaria</p>
                            <p className="text-xl font-black">{totalDailyCredits} <span className="text-xs font-normal opacity-50">créditos/día</span></p>
                        </div>
                        <div className="text-right">
                            <p className="text-[8px] font-bold uppercase opacity-50">Inyección VIP</p>
                            <p className="text-xs font-black text-green-400">+{extraSlots * 50} créditos</p>
                        </div>
                    </div>

                    <div className="mt-2 p-3 bg-brand-accent/20 rounded-xl flex items-center justify-between">
                         <div>
                            <p className="text-[8px] font-black uppercase text-brand-primary tracking-widest">Bolsa Voz Live Mensual</p>
                            <p className="text-base font-black text-neutral-900 dark:text-white">{totalVoicePool} <span className="text-[10px] font-normal opacity-60">minutos/mes</span></p>
                        </div>
                        <div className="text-right">
                            <p className="text-[8px] font-bold uppercase opacity-50">Suma VIP</p>
                            <p className="text-xs font-black text-brand-primary">+{extraSlots * 30} min</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                        <div className="flex items-center gap-2 mb-2">
                            <Icon name="ai" className="w-4 h-4 text-brand-primary"/>
                            <h5 className="text-[10px] font-black uppercase text-neutral-800 dark:text-white">Energía Shivo Diaria</h5>
                        </div>
                        <p className="text-[11px] text-neutral-500 leading-relaxed font-medium">Cada respuesta del vendedor descuenta <strong>1 crédito</strong> de tu energía diaria. Si compras un Slot VIP, recibes un bono de <strong>+50 créditos diarios</strong> permanentes.</p>
                    </div>
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                        <div className="flex items-center gap-2 mb-2">
                            <Icon name="mic" className="w-4 h-4 text-purple-600"/>
                            <h5 className="text-[10px] font-black uppercase text-neutral-800 dark:text-white">Conversación Live (Voz)</h5>
                        </div>
                        <p className="text-[11px] text-neutral-500 leading-relaxed font-medium">Las llamadas en tiempo real no descuentan de la bolsa de mensajes, sino de tu <strong>bolsa de minutos sincronizada</strong>. Cada Slot VIP suma <strong>+30 min/mes</strong> de voz HD.</p>
                    </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/10 p-5 rounded-3xl border border-orange-200 dark:border-orange-800">
                    <h5 className="text-xs font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Icon name="rocket" className="w-4 h-4"/> ¿Por qué comprar Slots VIP?
                    </h5>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-medium text-justify">
                        A diferencia de los vendedores base, cada **Slot VIP** es una expansión de infraestructura real. Inyecta **1,000 respuestas exclusivas**, **30 minutos de voz real** a tu bolsa mensual y **+50 créditos diarios** a tu energía Shivo para que tu fuerza de ventas masiva nunca se detenga.
                    </p>
                </div>
                
                <Button onClick={onClose} className="w-full py-4 font-black uppercase text-xs tracking-widest shadow-xl">Entendido</Button>
            </div>
        </Modal>
    );
};

const PurchaseSlotModal: React.FC<{ isOpen: boolean; onClose: () => void; onBuy: () => void }> = ({ isOpen, onClose, onBuy }) => {
    const { userProfile, isSuperAdmin } = useContext(AppContext);
    const isMexico = userProfile.country === 'Mexico';
    const currency = userProfile.currency || 'USD';
    const displayPrice = formatCurrency(6, currency, isMexico);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Desbloquear Slot de Vendedor VIP" className="max-w-xl">
            <div className="space-y-6 p-2 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-[1.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/20 animate-bounce">
                    <Icon name="agent" className="w-10 h-10 text-white" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-neutral-900 dark:text-white">Escala tu Fuerza de Ventas</h3>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm font-medium leading-relaxed">
                        Un Vendedor VIP no descansa, no duerme y cierra tratos mientras tú te enfocas en lo estratégico. {isSuperAdmin ? 'Como Súper Admin, puedes activarlo sin costo.' : 'Compra un slot permanente hoy.'}
                    </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                    <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                        <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Bolsa Mensual Mensajes</p>
                        <p className="text-xs font-bold text-neutral-700 dark:text-neutral-200">+1,000 respuestas exclusivas al mes.</p>
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-2xl border border-purple-100 dark:border-purple-900/20">
                        <p className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1">Conversación en Vivo</p>
                        <p className="text-xs font-bold text-neutral-700 dark:text-neutral-200">+30 minutos de voz HD real al mes.</p>
                    </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-2xl border border-orange-100 dark:border-orange-900/20 text-left">
                    <p className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-1 text-center">Inyección de Energía Diaria</p>
                    <p className="text-xs font-bold text-neutral-700 dark:text-neutral-200 text-center">+50 créditos diarios de Shivo Shivo para todo tu ecosistema.</p>
                </div>

                <div className="bg-neutral-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/20 rounded-full blur-2xl"></div>
                    <div className="relative z-10 flex justify-between items-center">
                        <div className="text-left">
                            <p className="text-[10px] font-black uppercase text-brand-accent tracking-widest">Inversión Mensual</p>
                            <p className="text-4xl font-black leading-none">{isSuperAdmin ? '$0' : displayPrice} <span className="text-sm font-normal opacity-50">{isSuperAdmin ? 'FREE' : currency}</span></p>
                        </div>
                        <Button onClick={onBuy} className="bg-white text-black hover:bg-neutral-200 border-none font-black uppercase text-[10px] tracking-widest px-8 h-12 shadow-2xl">
                            {isSuperAdmin ? 'Activar Slot Admin' : 'Adquirir Slot'}
                        </Button>
                    </div>
                </div>
                
                <button onClick={onClose} className="text-neutral-400 font-bold uppercase text-[9px] tracking-widest hover:text-brand-primary transition-colors">Tal vez después</button>
            </div>
        </Modal>
    );
};

const ConnectMonetizationModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { userProfile, updateUserProfile, currentUser, setToastNotification, isSuperAdmin } = useContext(AppContext);
    const [selectedPlan, setSelectedPlan] = useState<'pro_connect' | 'premium_connect' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const isMexico = userProfile.country === 'Mexico';
    const currencyCode = userProfile.currency || 'USD';
    
    const PLANS = {
        pro_connect: { 
            id: isMexico ? 'P-04765057WM055905NNEZAFOQ' : 'P-0FH70320LG8097714NF54CPQ', 
            price: 47, 
            mxnPrice: 869.5,
            name: 'Connect Pro', 
            desc: 'Automatización de respuestas en WhatsApp 24/7',
            features: [
                '1 Vendedor Web IA (texto + llamadas) (con límites por plan)',
                'Flujos listos de venta: captura → calificación → propuesta → agendamiento',
                'Seguimiento automático: reactivación de interesados y recordatorios',
                'Inbox GOATIFY: todo ordenado con etiquetas y etapas',
                'Dashboard de ventas: calificados, agendados y cierres',
                'Nota: WhatsApp puede tener costos externos según proveedor.'
            ],
            color: 'bg-brand-primary' 
        },
        premium_connect: { 
            id: isMexico ? 'P-0YJ18157B2153452BNEZAD2Q' : 'P-3NH356343Y547293UNF56CYQ', 
            price: 77, 
            mxnPrice: 1424.5,
            name: 'Connect Premium', 
            desc: 'Canales conectados: WhatsApp + Facebook + Instagram + TikTok + Messenger',
            features: [
                '1 Vendedor Web IA (texto + llamadas) (con límites por plan)',
                'Inbox unificado: todo en un solo panel (sin saltar entre apps)',
                'Automatización avanzada: secuencias, leads fríos y postventa',
                'Cierre pro con IA: objeciones complejas, upsell y seguimiento inteligente',
                'Reportes pro: leads por canal, conversión y rendimiento',
                'Nota: Los canales pueden tener costos externos según proveedor.'
            ],
            color: 'bg-gradient-to-br from-purple-600 to-pink-600'
        }
    };

    const handleSuccess = async (subId: string) => {
        if (!currentUser || !selectedPlan) return;
        setIsProcessing(true);
        try {
            const renewalDate = new Date();
            renewalDate.setDate(renewalDate.getDate() + 30);
            await updateUserProfile(currentUser.uid, {
                automationPlan: selectedPlan,
                automationPlanStatus: 'active',
                automationPlanRenewalDate: renewalDate.toISOString()
            } as any);
            setToastNotification({ title: "Connect Activado", message: "Tu omnicanalidad IA está lista.", icon: 'rocket' });
        } catch (e) { console.error(e); } finally { setIsProcessing(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Goatify IA Connect: Omnicanalidad" className="max-w-5xl">
            <div className="space-y-8 p-1 overflow-y-auto max-h-[75vh] custom-scrollbar">
                <div className="text-center space-y-2">
                    <h3 className="text-3xl font-black uppercase tracking-tighter text-neutral-900 dark:text-white">Lleva tu IA a Todo el Mundo</h3>
                    <p className="text-sm text-neutral-500 font-medium">Conecta tus vendedores con WhatsApp, Instagram y TikTok en minutos.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
                    {(Object.entries(PLANS) as [any, any][]).map(([key, plan]) => {
                        const isCurrentActive = userProfile.automationPlan === key && userProfile.automationPlanStatus === 'active';
                        const displayPriceText = isMexico 
                            ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(plan.mxnPrice)
                            : formatCurrency(plan.price, currencyCode, isMexico);
                        
                        return (
                            <Card key={key} className={`p-8 border-2 transition-all flex flex-col justify-between h-full relative overflow-hidden ${isCurrentActive ? 'border-green-500 shadow-2xl bg-white dark:bg-dark-surface' : 'border-neutral-100 dark:border-neutral-800'}`}>
                                {isCurrentActive && (
                                    <div className="absolute inset-0 z-50 bg-white/95 dark:bg-neutral-900/95 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 mb-4 animate-bounce">
                                            <Icon name="check" className="w-8 h-8" />
                                        </div>
                                        <h4 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter mb-2">Plan Activo</h4>
                                        <p className="text-sm text-neutral-500 font-bold leading-relaxed mb-6 italic">"Listo, has activado tu plan. Estamos configurando todo, ya nos contactamos contigo."</p>
                                        <div className="bg-green-50 dark:bg-green-900/10 p-3 rounded-xl border border-green-200">
                                            <p className="text-[10px] font-black text-green-700 uppercase">Próxima renovación: {new Date(userProfile.automationPlanRenewalDate || '').toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl mb-6 ${plan.color}`}><Icon name="hub" className="w-8 h-8"/></div>
                                    <h4 className="text-2xl font-black uppercase tracking-tighter mb-1">{plan.name}</h4>
                                    <p className="text-xs text-brand-primary font-bold mb-6">{plan.desc}</p>
                                    
                                    <div className="flex items-baseline gap-2 mb-6">
                                        <span className="text-5xl font-black tracking-tighter">{isMexico ? plan.mxnPrice.toLocaleString() : plan.price.toLocaleString()}</span>
                                        <span className="text-xs font-bold text-neutral-400 uppercase">{currencyCode} / Mes</span>
                                    </div>

                                    <ul className="space-y-3 mb-8">
                                        {plan.features.map((feat: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400 font-medium">
                                                <Icon name="check" className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                                <span>{feat}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="space-y-4">
                                    {isSuperAdmin ? (
                                        <Button onClick={() => { setSelectedPlan(key); handleSuccess('ADMIN_BYPASS'); }} className="w-full h-12 font-black uppercase tracking-widest text-xs shadow-xl bg-green-600 hover:bg-green-700">Activar Gratis (Admin)</Button>
                                    ) : selectedPlan === key ? (
                                        <PayPalWrapper planId={plan.id} currency={currencyCode} onSuccess={handleSuccess} onError={() => {}} />
                                    ) : (
                                        <Button onClick={() => setSelectedPlan(key)} className="w-full h-12 font-black uppercase tracking-widest text-xs shadow-xl">Activar Ahora</Button>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
};

const AgentUsageModal: React.FC<{ isOpen: boolean; onClose: () => void; agents: AiAgentConfig[] }> = ({ isOpen, onClose, agents }) => {
    const { userProfile, userUsage } = useContext(AppContext);
    
    const planConfig = getPlanConfig(userProfile.plan);
    const baseLimit = (planConfig.limits as any).agent_responses_monthly || 100;
    const extraResponses = (userProfile.extraAgentsPurchased || 0) * 1000;
    const totalPool = baseLimit + extraResponses;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Auditoría de Consumos: Vendedores de Élite" className="max-w-3xl">
            <div className="space-y-6 p-1">
                <div className="bg-brand-primary/5 p-6 rounded-3xl border border-brand-primary/10">
                    <h4 className="text-sm font-black text-brand-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Icon name="agent" className="w-5 h-5"/> Tu Capacidad Operativa
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div className="p-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Cupo Mensual Total</p>
                            <p className="text-2xl font-black text-neutral-900 dark:text-white">{totalPool.toLocaleString()} <span className="text-xs font-medium opacity-50">mensajes</span></p>
                        </div>
                        <div className="p-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Energía Shivo Diaria</p>
                            <p className="text-2xl font-black text-brand-primary">1 Crédito <span className="text-xs font-medium opacity-50">/ respuesta</span></p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h5 className="text-[11px] font-black text-neutral-900 dark:text-white uppercase tracking-tighter">¿Cómo funcionan tus límites?</h5>
                    <div className="grid grid-cols-1 gap-3">
                        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800 flex gap-4">
                            <div className="p-3 bg-white dark:bg-neutral-800 rounded-xl shadow-sm text-brand-primary h-fit"><Icon name="ai" className="w-5 h-5"/></div>
                            <div>
                                <p className="font-bold text-sm">Tecnología Gemini 2.5 Flash</p>
                                <p className="text-xs text-neutral-500 leading-relaxed">Tus vendedores usan la API más rápida para procesar texto, fotos y audio en tiempo real.</p>
                            </div>
                        </div>
                        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800 flex gap-4">
                            <div className="p-3 bg-white dark:bg-neutral-800 rounded-xl shadow-sm text-brand-primary h-fit"><Icon name="wallet" className="w-5 h-5"/></div>
                            <div>
                                <p className="font-bold text-sm">Escalabilidad de Energía</p>
                                <p className="text-xs text-neutral-500 leading-relaxed text-justify">Cada **Slot VIP** inyecta automáticamente **+50 créditos diarios** a tu energía Shivo, asegurando que el incremento en mensajes mensuales siempre tenga energía diaria suficiente para operar.</p>
                            </div>
                        </div>
                        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800 flex gap-4">
                            <div className="p-3 bg-white dark:bg-neutral-800 rounded-xl shadow-sm text-brand-primary h-fit"><Icon name="plus" className="w-5 h-5"/></div>
                            <div>
                                <p className="font-bold text-sm">Bonos por Slot VIP</p>
                                <p className="text-xs text-neutral-500 leading-relaxed text-justify">Cada Slot VIP adicional que compres suma permanentemente +1,000 respuestas y +30 minutos de voz a tu bolsa mensual compartida.</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <Button onClick={onClose} className="w-full py-4 mt-4 font-black uppercase text-xs tracking-widest shadow-xl">Cerrar Auditoría</Button>
            </div>
        </Modal>
    );
};

const FlowStepEditor: React.FC<{
    step: FlowStep;
    index: number;
    allSteps: FlowStep[];
    onUpdate: (updatedStep: FlowStep) => void;
    onDelete: () => void;
    onClose: () => void;
    onDuplicate: () => void;
}> = ({ step, index, allSteps, onUpdate, onDelete, onClose, onDuplicate }) => {
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploading(true);
            try {
                const uid = auth.currentUser?.uid;
                if (!uid) throw new Error('Debes iniciar sesión para subir archivos del agente.');
                const { url } = await uploadWithQuotaCheck({
                    userId: uid,
                    data: file,
                    path: safeStoragePath('agents', uid, 'flows', `${Date.now()}_${file.name}`),
                    sizeBytes: file.size,
                    metadata: { contentType: file.type || 'application/octet-stream' }
                });
                onUpdate({ ...step, mediaUrl: url, mediaType: file.type });
            } catch (error) { console.error("Upload failed", error); alert("Error subiendo archivo"); } finally { setIsUploading(false); }
        }
    };

    const addOption = () => {
        const newOption: FlowOption = { id: `opt-${Date.now()}`, label: 'Nueva Opción', nextStepId: 'AI_HANDOFF' };
        onUpdate({ ...step, options: [...step.options, newOption] });
    };

    const updateOption = (optId: string, field: keyof FlowOption, value: string) => {
        const newOptions = step.options.map(opt => opt.id === optId ? { ...opt, [field]: value } : opt);
        onUpdate({ ...step, options: newOptions });
    };

    const deleteOption = (optId: string) => { onUpdate({ ...step, options: step.options.filter(opt => opt.id !== optId) }); };
    const currentTypeInfo = STEP_TYPES.find(t => t.id === step.type) || STEP_TYPES[0];

    return (
        <div className="h-full flex flex-col bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700 shadow-2xl w-80 sm:w-96 absolute right-0 top-0 z-[110] animate-slide-in-right backdrop-blur-xl bg-opacity-95">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-800/50 flex-none">
                <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg text-white shadow-sm ${currentTypeInfo.color}`}>
                        <Icon name={currentTypeInfo.icon} className="w-4 h-4"/>
                    </div>
                    <div><h3 className="font-bold text-sm leading-tight">{step.name}</h3><p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Propiedades</p></div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={onDuplicate} className="p-2 text-neutral-400 hover:text-brand-primary hover:bg-brand-50 rounded-lg transition-colors" title="Duplicar Paso"><Icon name="copy" className="w-4 h-4"/></button>
                    <button onClick={onDelete} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar"><Icon name="trash" className="w-4 h-4"/></button>
                    <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-white rounded-lg transition-colors"><Icon name="close" className="w-4 h-4"/></button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-24 custom-scrollbar border-l dark:border-neutral-800">
                <div>
                    <label className="text-xs font-bold text-neutral-500 uppercase mb-2 block">Tipo de Paso</label>
                    <div className="relative">
                        <select value={step.type} onChange={(e) => onUpdate({ ...step, type: e.target.value as StepType })} className="w-full bg-white dark:bg-black border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 text-sm font-medium appearance-none outline-none shadow-sm">
                            {STEP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400"><Icon name="chevronDown" className="w-4 h-4"/></div>
                    </div>
                </div>
                <label className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/20 cursor-pointer hover:bg-brand-primary/10 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={!!step.waitForInput} 
                        onChange={(e) => onUpdate({ ...step, waitForInput: e.target.checked })}
                        className="w-5 h-5 rounded text-brand-primary focus:ring-brand-primary"
                    />
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">Esperar respuesta del cliente</span>
                        <span className="text-[10px] text-neutral-500">Pausa el flujo hasta recibir un mensaje.</span>
                    </div>
                </label>
                <div><label className="text-xs font-bold text-neutral-500 uppercase mb-2 block">Nombre Interno</label><Input value={step.name} onChange={(e) => onUpdate({...step, name: e.target.value})} className="font-semibold"/></div>
                {step.type === 'TEXT' && ( <div><label className="text-xs font-bold text-neutral-500 uppercase mb-2 block">Mensaje al Usuario</label><Textarea value={step.message} onChange={(e) => onUpdate({ ...step, message: e.target.value })} className="!mt-0 text-sm min-h-[120px] leading-relaxed" rows={4} placeholder="Escribe aquí lo que dirá el agente..."/></div> )}
                {step.type === 'IMAGE' && ( <div> <label className="text-xs font-bold text-neutral-500 uppercase block mb-2">Multimedia</label> <div className="space-y-3"> {step.mediaUrl ? ( <div className="relative group rounded-xl overflow-hidden shadow-md border border-neutral-200 dark:border-neutral-700"> {step.mediaType?.startsWith('image/') ? ( <img src={step.mediaUrl} alt="Preview" className="w-full h-48 object-cover"/> ) : ( <div className="w-full h-24 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-sm font-medium"> <Icon name="folder" className="w-5 h-5 mr-2"/> Archivo Adjunto </div> )} <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"> <button onClick={() => onUpdate({...step, mediaUrl: undefined, mediaType: undefined})} className="bg-red-500 text-white px-4 py-2 rounded-full shadow-lg font-bold text-xs flex items-center gap-2"> <Icon name="trash" className="w-3 h-3"/> Eliminar </button> </div> </div> ) : ( <div className="relative w-full group"> <input type="file" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={isUploading}/> <div className={`w-full border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-xl p-8 text-center transition-all group-hover:border-brand-primary group-hover:bg-brand-50/50 ${isUploading ? 'bg-neutral-100' : ''}`}> <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-3 text-brand-primary group-hover:scale-110 transition-transform"> <Icon name="upload" className="w-6 h-6"/> </div> <p className="text-sm font-bold text-neutral-600 dark:text-neutral-300">{isUploading ? 'Subiendo...' : 'Subir Archivo'}</p> <p className="text-xs text-neutral-400 mt-1">PNG, JPG, PDF</p> </div> </div> )} <label className="text-xs font-bold text-neutral-500 uppercase mt-4 block">Texto Acompañante</label> <Textarea value={step.message || ''} onChange={(e) => onUpdate({ ...step, message: e.target.value })} placeholder="(Opcional)" rows={2} /> </div> </div> )}
                {step.type === 'AI_RESPONSE' && ( <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/30 space-y-3"> <div className="flex gap-3"> <div className="mt-1"><Icon name="ai" className="w-5 h-5 text-emerald-600 dark:text-emerald-500"/></div> <div> <p className="font-bold text-sm text-emerald-800 dark:text-amber-400">IA Generativa</p> <p className="text-xs text-emerald-700/80 dark:text-emerald-500/80 mt-1 leading-relaxed">Genera una respuesta dinámica basada en el contexto.</p> </div> </div> <label className="text-xs font-bold text-neutral-500 uppercase block">Instrucción al Modelo (Qué debe hacer/vender)</label> <Textarea value={step.message} onChange={(e) => onUpdate({ ...step, message: e.target.value })} className="!mt-0 text-sm bg-white dark:bg-black" rows={3} placeholder="Ej: 'Vende agresivamente nuestro plan premium mencionando los beneficios de ahorro'." /> </div> )}
                <div className="pt-6 border-t border-neutral-200 dark:border-neutral-700">
                    <label className="text-xs font-bold text-neutral-500 uppercase mb-3 flex items-center gap-2"><Icon name="list" className="w-3 h-3"/> Botones de Decisión</label>
                    <div className="space-y-3">
                        {step.options.map((opt, i) => (
                            <div key={opt.id} className="flex flex-col bg-white dark:bg-black p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 gap-2 shadow-sm">
                                <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase text-neutral-400 tracking-wider">Opción {i+1}</span><button onClick={() => deleteOption(opt.id)} className="text-neutral-400 hover:text-red-500 transition-colors"><Icon name="close" className="w-3 h-3"/></button></div>
                                <input type="text" value={opt.label} onChange={(e) => updateOption(opt.id, 'label', e.target.value)} className="w-full bg-transparent border-b border-neutral-200 dark:border-neutral-800 px-0 py-1 text-sm font-semibold focus:border-brand-primary focus:outline-none transition-colors" placeholder="Etiqueta del botón" />
                            </div>
                        ))}
                        <Button onClick={addOption} variant="secondary" size="sm" className="w-full border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-transparent hover:border-brand-primary/50 text-neutral-500"><Icon name="plus" className="w-4 h-4"/> Añadir Opción</Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const VisualFlowBuilder: React.FC<{
    steps: FlowStep[];
    onStepsChange: (steps: FlowStep[]) => void;
    onSelectStep: (stepId: string) => void;
    selectedStepId: string | null;
    isFullScreen: boolean;
    toggleFullScreen: () => void;
    onAddStep: () => void;
    onDeleteStep: (stepId: string) => void;
    onDeploy: () => void;
    startStepId?: string;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}> = ({ steps, onStepsChange, onSelectStep, selectedStepId, isFullScreen, toggleFullScreen, onAddStep, onDeleteStep, onDeploy, startStepId, onUndo, onRedo, canUndo, canRedo }) => {
    const { setToastNotification } = useContext(AppContext);
    const containerRef = useRef<HTMLDivElement>(null);
    const stepsRef = useRef(steps);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const offsetRef = useRef(offset);
    const [zoom, setZoom] = useState(1);
    const zoomRef = useRef(zoom);
    const [dragState, setDragState] = useState<{ type: 'node' | 'pan' | 'connection'; id?: string; connectionStart?: { stepId: string, handleId: string, text: 'default' | 'option', startX: number, startY: number }; startX: number; startY: number; initialPos?: { x: number, y: number }; } | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [createMenu, setCreateMenu] = useState<{ x: number, y: number, sourceStepId: string, sourceHandle: string, type: 'default' | 'option' } | null>(null);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    useEffect(() => { stepsRef.current = steps; }, [steps]);
    useEffect(() => { offsetRef.current = offset; }, [offset]);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    const getTransformedPoint = (clientX: number, clientY: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return { x: (clientX - rect.left - offsetRef.current.x) / zoomRef.current, y: (clientY - rect.top - offsetRef.current.y) / zoomRef.current };
    };

    const handleClearConnection = (e: React.MouseEvent, stepId: string, handleId: string, type: 'default' | 'option') => {
        e.stopPropagation(); e.preventDefault();
        const newSteps = stepsRef.current.map(s => {
            if (s.id === stepId) {
                if (type === 'default') return { ...s, nextStepId: 'AI_HANDOFF' };
                else { const newOptions = s.options.map(opt => opt.id === handleId ? { ...opt, nextStepId: 'AI_HANDOFF' } : opt); return { ...s, options: newOptions }; }
            }
            return s;
        });
        onStepsChange([...newSteps]);
    };

    const handleDuplicateStep = (id: string) => {
        const original = steps.find(s => s.id === id);
        if (!original) return;
        const newId = `step-${Date.now()}`;
        const copy = {
            ...original,
            id: newId,
            name: `${original.name} (Copia)`,
            position: { x: original.position.x + 30, y: original.position.y + 30 },
            options: original.options.map(opt => ({ ...opt, id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` }))
        };
        onStepsChange([...steps, copy]);
        onSelectStep(newId);
        setToastNotification({ title: "Paso Duplicado", message: "Se ha creado una copia exacta del paso.", icon: 'copy' });
    };

    const organizeNodes = () => {
        if (steps.length === 0) return;
        const NODE_WIDTH = 320; const LEVEL_HEIGHT = 300;
        const levels: Record<string, number> = {}; const childrenMap: Record<string, string[]> = {};
        steps.forEach(s => { childrenMap[s.id] = []; if (s.nextStepId && s.nextStepId !== 'AI_HANDOFF') { childrenMap[s.id].push(s.nextStepId); } s.options.forEach(opt => { if (opt.nextStepId && opt.nextStepId !== 'AI_HANDOFF') { childrenMap[s.id].push(opt.nextStepId); } }); });
        let startNodeId = startStepId || (steps.length > 0 ? steps[0].id : null);
        if(!startNodeId) return;
        const queue = [{ id: startNodeId, level: 0 }]; const visited = new Set<string>();
        while(queue.length > 0) { const { id, level } = queue.shift()!; if(visited.has(id)) continue; visited.add(id); levels[id] = level; childrenMap[id]?.forEach(childId => { queue.push({ id: childId, level: level + 1 }); }); }
        steps.forEach(s => { if (!visited.has(s.id)) { levels[s.id] = 0; } });
        const nodesByLevel: Record<number, string[]> = {}; Object.entries(levels).forEach(([id, lvl]) => { if(!nodesByLevel[lvl]) nodesByLevel[lvl] = []; nodesByLevel[lvl].push(id); });
        const newSteps = steps.map(s => { const level = levels[s.id] || 0; const levelNodes = nodesByLevel[level]; const indexInLevel = levelNodes.indexOf(s.id); const totalWidth = levelNodes.length * NODE_WIDTH; const startX = -(totalWidth / 2); return { ...s, position: { x: startX + (indexInLevel * NODE_WIDTH) + 100, y: level * LEVEL_HEIGHT + 100 } }; });
        onStepsChange(newSteps); setOffset({ x: containerRef.current ? containerRef.current.clientWidth / 2 : 0, y: 50 }); setZoom(1);
    };

    useEffect(() => {
        const handleGlobalMove = (e: MouseEvent) => {
            if (!dragState) return;
            e.preventDefault();
            if (dragState.type === 'pan') { setOffset({ x: dragState.initialPos!.x + (e.clientX - dragState.startX), y: dragState.initialPos!.y + (e.clientY - dragState.startY) }); return; }
            if (dragState.type === 'node' && dragState.id) { const deltaX = (e.clientX - dragState.startX) / zoomRef.current; const deltaY = (e.clientY - dragState.startY) / zoomRef.current; const rawX = dragState.initialPos!.x + deltaX; const rawY = dragState.initialPos!.y + deltaY; const snappedX = Math.round(rawX / 10) * 10; const snappedY = Math.round(rawY / 10) * 10; const newSteps = stepsRef.current.map(s => s.id === dragState.id ? { ...s, position: { x: snappedX, y: snappedY } } : s); onStepsChange(newSteps); return; }
            if (dragState.type === 'connection') { let targetPoint = getTransformedPoint(e.clientX, e.clientY); setMousePos(targetPoint); }
        };
        const handleGlobalUp = (e: MouseEvent) => {
            if (!dragState) return;
            if (dragState.type === 'connection' && dragState.connectionStart) {
                const target = document.elementFromPoint(e.clientX, e.clientY); const handle = target?.closest('[data-target-handle]');
                if (handle) {
                    const targetStepId = handle.getAttribute('data-step-id');
                    if (targetStepId) { 
                        const newSteps = stepsRef.current.map(s => { if (s.id === dragState.connectionStart!.stepId) { if (dragState.connectionStart!.text === 'default') { return { ...s, nextStepId: targetStepId }; } else { const newOptions = s.options.map(opt => opt.id === dragState.connectionStart!.handleId ? { ...opt, nextStepId: targetStepId } : opt); return { ...s, options: newOptions }; } } return s; });
                        onStepsChange(newSteps);
                    }
                } else {
                    const point = getTransformedPoint(e.clientX, e.clientY);
                    setCreateMenu({ x: point.x, y: point.y, sourceStepId: dragState.connectionStart.stepId, sourceHandle: dragState.connectionStart.handleId, type: dragState.connectionStart.text as any });
                }
            }
            setDragState(null);
        };
        if (dragState) { window.addEventListener('mousemove', handleGlobalMove); window.addEventListener('mouseup', handleGlobalUp); }
        return () => { window.removeEventListener('mousemove', handleGlobalMove); window.removeEventListener('mouseup', handleGlobalUp); };
    }, [dragState, onStepsChange]);

    const startNodeDrag = (e: React.MouseEvent, stepId: string) => { e.stopPropagation(); onSelectStep(stepId); const step = steps.find(s => s.id === stepId); setDragState({ type: 'node', id: stepId, startX: e.clientX, startY: e.clientY, initialPos: step?.position || { x: 0, y: 0 } }); };
    const startPan = (e: React.MouseEvent) => { if (e.button === 0 || e.button === 1) { setCreateMenu(null); onSelectStep(''); setDragState({ type: 'pan', startX: e.clientX, startY: e.clientY, initialPos: offset }); } };
    const startConnection = (e: React.MouseEvent, stepId: string, handleId: string, type: 'default' | 'option') => { e.stopPropagation(); const point = getTransformedPoint(e.clientX, e.clientY); setMousePos(point); setCreateMenu(null); setDragState({ type: 'connection', startX: e.clientX, startY: e.clientY, connectionStart: { stepId, handleId, text: type, startX: point.x, startY: point.y } }); };

    const createNewStepFromDrop = (type: StepType) => {
        if (!createMenu) return;
        const newId = `step-${Date.now()}`; const newStep: FlowStep = { id: newId, name: `Nuevo Paso`, type, message: '', options: [], position: { x: createMenu.x, y: createMenu.y }, waitForInput: false };
        const newSteps = stepsRef.current.map(s => { if (s.id === createMenu.sourceStepId) { if (createMenu.type === 'default') { return { ...s, nextStepId: newId }; } else { const newOptions = s.options.map(opt => opt.id === createMenu.sourceHandle ? { ...opt, nextStepId: newId } : opt); return { ...s, options: newOptions }; } } return s; });
        onStepsChange([...newSteps, newStep]); setCreateMenu(null); onSelectStep(newId);
    };

    const handleWheel = (e: React.WheelEvent) => { e.preventDefault(); const delta = e.deltaY * -0.001; setZoom(z => Math.min(Math.max(0.2, z + delta), 2)); };

    const handleDownloadHelp = () => {
        const docPDF = new jsPDF();
        docPDF.setFontSize(20);
        docPDF.setTextColor(76, 29, 149);
        docPDF.text("Guía Maestra: Constructor de Flujos Goatify IA", 20, 20);
        docPDF.setFontSize(11);
        docPDF.setTextColor(100, 100, 100);
        docPDF.text("Manual de Configuración Estratégica para Agentes Autónomos", 20, 28);
        docPDF.line(20, 32, 190, 32);

        let yPos = 45;
        const addContent = (title: string, content: string) => {
            docPDF.setFont("helvetica", "bold");
            docPDF.setFontSize(14);
            docPDF.setTextColor(30, 30, 30);
            docPDF.text(title, 20, yPos);
            yPos += 7;
            docPDF.setFont("helvetica", "normal");
            docPDF.setFontSize(10);
            docPDF.setTextColor(60, 60, 60);
            const lines = docPDF.splitTextToSize(content, 170);
            docPDF.text(lines, 20, yPos);
            yPos += (lines.length * 5) + 12;
            if (yPos > 270) { docPDF.addPage(); yPos = 20; }
        };

        addContent("1. El Concepto del Flujo Lógico", "El constructor de flujos te permite diseñar la 'columna vertebral' de la conversación. A diferencia de un chat normal donde la IA responde libremente, aquí tú defines una estructura de pasos (steps) que guían al cliente hacia un objetivo específico, como una venta o el registro de sus datos.");
        addContent("2. El Paso Inicial: El Disparador", "El nodo de inicio es el origen absoluto. Cuando alguien abra tu enlace público, el agente disparará este contenido inmediatamente. Es tu carta de presentación: úsalo para un saludo impactante y una oferta de valor inicial.");
        addContent("3. Tipos de Pasos y Multimedia", "- Mensaje de Texto: Comunicación directa.\n- Imagen/Archivo: Compartte catálogos, PDFs o visuales de tus servicios.\n- Respuesta IA: Aquí la IA toma el control pero siguiendo una instrucción específica que tú le das (ej: 'Vende este producto resaltando el ahorro').");
        addContent("4. Botones y Toma de Decisiones", "Añadir 'Opciones' en el editor crea botones interactivos para el usuario. Cada botón puede tener un destino diferente. Por ejemplo, un botón 'Precios' puede llevar a un paso con información de costos, mientras que 'Contacto' puede llevar a un paso que pida el teléfono.");
        addContent("5. Conexiones y Arrastre", "Conectar es intuitivo: haz clic en el círculo derecho de un paso y arrastra hacia el círculo izquierdo de otro. Si arrastras al vacío, Goatify te preguntará qué tipo de paso quieres crear a continuación, automatizando el diseño.");
        addContent("6. Pausas y Captura de Datos", "Al activar 'Esperar respuesta del cliente', el agente se detiene. Esto es vital para capturar información. Si pides el nombre, activa esta casilla; la IA leerá lo que el usuario escriba, lo guardará en su memoria y continuará al siguiente paso vinculado.");
        addContent("7. Duplicación y Eficiencia", "Puedes usar el icono de copiar en cualquier tarjeta para duplicarla. Esto es ideal para flujos extensos donde la estructura del mensaje o las opciones se repiten. Solo cambia el contenido interno y ahorra minutos de trabajo.");
        addContent("8. Finalización e IA Handoff", "Si un paso no tiene salida (un 'Next Step'), la conversación pasará a modo 'Respuesta IA Libre'. Esto significa que una vez terminado tu flujo diseñado, Shivo seguirá atendiendo al cliente usando su personalidad base pero con todo el contexto de lo que ya hablaron.");

        docPDF.save("Guia_Flujos_Goatify_IA.pdf");
        setToastNotification({ title: "Guía Descargada", message: "Manual guardado en PDF.", icon: 'check' });
    };

    return (
        <div className="w-full h-full relative overflow-hidden bg-[#f0f2f5] dark:bg-[#121212]">
            <Modal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} title="Manual Maestro: Vendedores IA" className="max-w-4xl h-[85vh]">
                <div className="space-y-8 text-sm leading-relaxed p-1 overflow-y-auto custom-scrollbar">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 border-neutral-100 dark:border-neutral-800">
                        <div className="flex items-center gap-4">
                             <div className="p-4 bg-brand-primary text-white rounded-2xl shadow-xl">
                                <Icon name="agent" className="w-8 h-8"/>
                             </div>
                             <div>
                                 <h3 className="text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter leading-none">Ingeniería de Flujos</h3>
                                 <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-2">Manual de Operaciones para Agentes Autónomos</p>
                             </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button size="sm" variant="secondary" onClick={handleDownloadHelp} className="flex-1 sm:flex-none h-10 font-black uppercase text-[10px] tracking-widest">
                                <Icon name="upload" className="w-4 h-4"/> Descargar PDF
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div>
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-3 flex items-center gap-2"><div className="w-5 h-5 bg-brand-primary text-white rounded-md flex items-center justify-center text-[10px]">1</div> Paso Inicial (Trigger)</h4>
                                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">El nodo marcado como "Inicio" es lo primero que verá el cliente. Úsalo para un saludo potente y define el tono de la conversación. Es la cara de tu negocio 24/7.</p>
                            </div>
                            <div className="p-5 bg-orange-50 dark:bg-orange-900/10 rounded-[2rem] border border-orange-100 dark:border-orange-800 shadow-inner">
                                <p className="font-bold text-orange-700 dark:text-orange-400 text-xs mb-2 uppercase flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span> Configuración Multimedia</p>
                                <p className="text-[11px] text-orange-800/80 dark:text-orange-200/80 leading-relaxed">Puedes programar que el agente envíe fotos de productos o catálogos PDF. Usa el tipo de paso "Imagen/Archivo" y sube el asset directamente.</p>
                            </div>
                            <div>
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-3 flex items-center gap-2"><div className="w-5 h-5 bg-brand-primary text-white rounded-md flex items-center justify-center text-[10px]">2</div> Botones de Decisión</h4>
                                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">Las "Opciones" crean botones interactivos para el cliente. Cada botón puede tener un destino diferente, permitiéndote segmentar: "¿Quieres ver precios o hablar con un humano?".</p>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="p-5 bg-emerald-50 dark:bg-emerald-900/10 rounded-[2rem] border border-emerald-100 dark:border-emerald-800 shadow-inner">
                                <p className="font-bold text-emerald-700 dark:text-emerald-400 text-xs mb-2 uppercase flex items-center gap-2"><Icon name="ai" className="w-4 h-4"/> Respuestas de IA Híbrida</p>
                                <p className="text-[11px] text-emerald-800/80 dark:text-emerald-200/80 leading-relaxed">Usa el tipo "Respuesta IA" para que Shivo redacte el mensaje en tiempo real siguiendo una instrucción tuya (ej: 'Menciona nuestra oferta flash del 50%').</p>
                            </div>
                            <div>
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-3 flex items-center gap-2"><div className="w-5 h-5 bg-brand-primary text-white rounded-md flex items-center justify-center text-[10px]">3</div> Pausas y Recolección</h4>
                                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">Activa <strong>"Esperar respuesta del cliente"</strong> cuando pidas datos (Nombre, Email). El agente se detendrá, leerá la respuesta y continuará al siguiente nodo.</p>
                            </div>
                            <div className="p-5 bg-blue-50 dark:bg-blue-900/10 rounded-[2rem] border border-blue-100 dark:border-blue-800 shadow-inner">
                                <p className="font-bold text-blue-700 dark:text-blue-400 text-xs mb-2 uppercase flex items-center gap-2"><Icon name="rocket" className="w-4 h-4"/> Handoff a IA Libre</p>
                                <p className="text-[11px] text-blue-800/80 dark:text-blue-200/80 leading-relaxed">Si dejas un nodo sin conexión de salida, el flujo termina y Shivo entra en modo "Asistente Libre", respondiendo cualquier duda basada en tu personalidad base.</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-neutral-900 text-white p-8 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/20 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:scale-150"></div>
                        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
                            <div className="text-center sm:text-left">
                                <p className="text-brand-accent font-black uppercase text-[10px] tracking-widest mb-2">Truco de Eficiencia</p>
                                <h4 className="text-xl font-bold leading-tight">Usa el botón de 'Copiar' para duplicar tarjetas complejas.</h4>
                                <p className="text-neutral-400 text-sm mt-2">Clona estructuras de menús y solo ajusta el texto interno para ahorrar minutos de trabajo.</p>
                            </div>
                            <Button onClick={() => setIsHelpOpen(false)} className="px-12 py-4 bg-white text-black hover:bg-neutral-200 border-none font-black uppercase text-[10px] tracking-widest shadow-xl">¡Comprendido!</Button>
                        </div>
                    </div>
                </div>
            </Modal>

            <div className="absolute top-4 right-4 z-[90] flex gap-2">
                 <div className="flex bg-white dark:bg-neutral-800 rounded-full shadow-lg border border-neutral-200 dark:border-neutral-700 mr-2">
                     <button onClick={onUndo} disabled={!canUndo} className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-l-full disabled:opacity-30 transition-colors" title="Deshacer"><Icon name="undo" className="w-4 h-4"/></button>
                     <div className="w-px bg-neutral-200 dark:bg-neutral-700"></div>
                     <button onClick={onRedo} disabled={!canRedo} className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-r-full disabled:opacity-30 transition-colors" title="Rehacer"><Icon name="redo" className="w-4 h-4"/></button>
                 </div>
                 <button onClick={() => organizeNodes()} className="bg-white dark:bg-neutral-800 text-brand-primary px-5 py-2.5 rounded-full shadow-lg border border-brand-primary/20 hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2 font-black uppercase text-xs tracking-wider">
                    <Icon name="list" className="w-4 h-4"/> Organizar
                 </button>
                 <button onClick={() => setIsHelpOpen(true)} className="bg-white dark:bg-neutral-800 text-brand-primary px-5 py-2.5 rounded-full shadow-lg border border-brand-primary/20 hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2 font-black uppercase text-xs tracking-wider animate-pulse-subtle">
                    <Icon name="help" className="w-4 h-4"/> Guía de Uso
                 </button>
                 <button onClick={onDeploy} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-full shadow-lg font-black uppercase text-xs transition-transform hover:scale-105 border-2 border-white/20 tracking-wider">
                    <Icon name="check" className="w-4 h-4"/> Publicar Cambios
                 </button>
                 <button onClick={toggleFullScreen} className="bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 p-2.5 rounded-full shadow-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 transition-all">
                    <Icon name={isFullScreen ? "close" : "expand"} className="w-5 h-5"/>
                 </button>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-xl p-2 rounded-full shadow-2xl border border-neutral-200/50">
                <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-2.5 hover:bg-neutral-100 rounded-full text-neutral-600 dark:text-neutral-300 transition-colors"><Icon name="minus" className="w-4 h-4"/></button>
                <span className="text-xs font-bold font-mono min-w-[3rem] text-center text-neutral-500">{(zoom * 100).toFixed(0)}%</span>
                <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-2.5 hover:bg-neutral-100 rounded-full text-neutral-600 dark:text-neutral-300 transition-colors"><Icon name="plus" className="w-4 h-4"/></button>
                <div className="w-px h-6 bg-neutral-300 dark:bg-neutral-600 mx-1"></div>
                <button onClick={() => { setZoom(1); setOffset({x:0,y:0}); }} className="p-2.5 hover:bg-neutral-100 rounded-full text-neutral-600 dark:text-neutral-300 transition-colors"><Icon name="sync" className="w-4 h-4"/></button>
            </div>

            <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" onMouseDown={startPan} onWheel={handleWheel}>
                <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0', width: '100%', height: '100%' }} className="relative">
                    <div className="absolute -top-[5000px] -left-[5000px] w-[10000px] h-[10000px] pointer-events-none opacity-40 z-[-1]" style={{ backgroundImage: 'radial-gradient(circle, #9ca3af 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}></div>
                    <svg className="absolute top-0 left-0 pointer-events-none overflow-visible z-0" style={{ width: '100%', height: '100%' }}>
                        <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#5b21b6" /></marker><marker id="arrow-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#8b5cf6" /></marker><filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.3" /></filter></defs>
                        {steps.map(step => {
                            const lines = []; const startX = (step.position?.x || 0) + 256;
                            if (step.nextStepId && step.nextStepId !== 'AI_HANDOFF') {
                                const target = steps.find(s => s.id === step.nextStepId);
                                if (target) { const startY = (step.position?.y || 0) + 38; const endX = target.position?.x || 0; const endY = (target.position?.y || 0) + 30; lines.push(<path key={`${step.id}-default`} d={getBezierPath(startX, startY, endX, endY)} stroke="#5b21b6" strokeWidth="4" fill="none" markerEnd="url(#arrow)" filter="url(#shadow)" />); }
                            }
                            step.options.forEach((opt, idx) => {
                                if (opt.nextStepId && opt.nextStepId !== 'AI_HANDOFF') {
                                    const target = steps.find(s => s.id === opt.nextStepId);
                                    if (target) { const startY = (step.position?.y || 0) + 105 + (idx * 42); const endX = target.position?.x || 0; const endY = (target.position?.y || 0) + 30; lines.push(<path key={`${step.id}-${opt.id}`} d={getBezierPath(startX, startY, endX, endY)} stroke="#8b5cf6" strokeWidth="4" strokeDasharray="5,5" fill="none" markerEnd="url(#arrow-active)" filter="url(#shadow)" />); }
                                }
                            });
                            return lines;
                        })}
                        {dragState?.type === 'connection' && dragState.connectionStart && (<path d={getBezierPath(dragState.connectionStart.startX, dragState.connectionStart.startY, mousePos.x, mousePos.y)} stroke="#8b5cf6" strokeWidth="4" fill="none" markerEnd="url(#arrow-active)" className="animate-pulse" filter="url(#shadow)" />)}
                    </svg>
                    {steps.map((step) => {
                        const typeInfo = STEP_TYPES.find(t => t.id === step.type) || STEP_TYPES[0]; const isSelected = selectedStepId === step.id;
                        const isStart = step.id === startStepId;
                        return (
                            <div key={step.id} onMouseDown={(e) => startNodeDrag(e, step.id)} style={{ transform: `translate(${step.position?.x || 0}px, ${step.position?.y || 0}px)` }} className={`absolute w-64 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border-t-4 ${typeInfo.borderColor} hover:shadow-2xl transition-shadow z-10 select-none group ${isSelected ? 'ring-2 ring-brand-primary' : ''}`}>
                                <div data-target-handle="true" data-step-id={step.id} className={`absolute -left-4 top-[24px] w-8 h-8 rounded-full z-20 flex items-center justify-center cursor-crosshair bg-white dark:bg-neutral-800 border-2 border-neutral-400 group-hover:border-brand-primary`}></div>
                                <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-700 flex justify-between items-center bg-neutral-50/50 rounded-t-xl flex-none">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg text-white shadow-sm ${isStart ? 'bg-orange-600' : typeInfo.color}`}>
                                            <Icon name={isStart ? "rocket" : typeInfo.icon} className="w-3.5 h-3.5"/>
                                        </div>
                                        <span className="text-[10px] font-black uppercase text-neutral-500 tracking-wider truncate max-w-[100px]">{isStart ? 'Inicio' : typeInfo.label}</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); handleDuplicateStep(step.id); }} className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="copy" className="w-3 h-3"/></button>
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteStep(step.id); }} className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-red-500 transition-colors"><Icon name="trash" className="w-3 h-3"/></button>
                                    </div>
                                </div>
                                <div className="p-4 space-y-3">
                                    <p className={`text-xs font-bold line-clamp-3 leading-relaxed ${step.type === 'AI_RESPONSE' ? 'italic text-emerald-600' : 'text-neutral-700 dark:text-neutral-300'}`}>
                                        {step.message || 'Sin mensaje configurado...'}
                                    </p>
                                    <div className="space-y-2 mt-4">
                                        <div className="flex items-center justify-between group/handle">
                                            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Siguiente Paso</span>
                                            <div className="flex items-center gap-2">
                                                {step.nextStepId && step.nextStepId !== 'AI_HANDOFF' && (
                                                    <button 
                                                        onMouseDown={(e) => { e.stopPropagation(); handleClearConnection(e as any, step.id, 'default', 'default'); }}
                                                        className="p-1 bg-red-50 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"
                                                        title="Eliminar unión"
                                                    >
                                                        <Icon name="close" className="w-2 h-2"/>
                                                    </button>
                                                )}
                                                <div 
                                                    onMouseDown={(e) => startConnection(e, step.id, 'default', 'default')}
                                                    onContextMenu={(e) => handleClearConnection(e, step.id, 'default', 'default')}
                                                    className={`w-4 h-4 rounded-full border-2 transition-colors cursor-crosshair ${step.nextStepId && step.nextStepId !== 'AI_HANDOFF' ? 'bg-brand-primary border-brand-primary' : 'bg-white dark:bg-neutral-800 border-neutral-300'}`}
                                                ></div>
                                            </div>
                                        </div>
                                        {step.options.map(opt => (
                                            <div key={opt.id} className="flex items-center justify-between group/handle">
                                                <span className="text-[9px] font-bold text-brand-primary truncate max-w-[120px]">{opt.label}</span>
                                                <div className="flex items-center gap-2">
                                                    {opt.nextStepId && opt.nextStepId !== 'AI_HANDOFF' && (
                                                        <button 
                                                            onMouseDown={(e) => { e.stopPropagation(); handleClearConnection(e as any, step.id, opt.id, 'option'); }}
                                                            className="p-1 bg-red-50 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"
                                                            title="Eliminar unión"
                                                        >
                                                            <Icon name="close" className="w-2 h-2"/>
                                                        </button>
                                                    )}
                                                    <div 
                                                        onMouseDown={(e) => startConnection(e, step.id, opt.id, 'option')}
                                                        onContextMenu={(e) => handleClearConnection(e, step.id, opt.id, 'option')}
                                                        className={`w-4 h-4 rounded-full border-2 transition-colors cursor-crosshair ${opt.nextStepId && opt.nextStepId !== 'AI_HANDOFF' ? 'bg-brand-primary border-brand-primary' : 'bg-white dark:bg-neutral-800 border-neutral-300'}`}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {createMenu && (
                <div 
                    className="fixed z-[200] bg-white dark:bg-neutral-900 shadow-2xl rounded-2xl border border-neutral-200 dark:border-neutral-700 p-2 flex flex-col gap-1 animate-scale-in"
                    style={{ left: (createMenu.x * zoom + offset.x + containerRef.current!.getBoundingClientRect().left), top: (createMenu.y * zoom + offset.y + containerRef.current!.getBoundingClientRect().top) }}
                >
                    <p className="text-[9px] font-black uppercase text-neutral-400 px-3 py-1 border-b dark:border-neutral-800 mb-1">Crear nuevo paso</p>
                    {STEP_TYPES.map(t => (
                        <button key={t.id} onClick={() => createNewStepFromDrop(t.id)} className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors text-xs font-bold">
                            <div className={`p-1.5 rounded-lg ${t.color} text-white`}><Icon name={t.icon} className="w-3 h-3"/></div>
                            {t.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const AiAgent: React.FC = () => {
    const { agents, addAgent, updateAgent, deleteAgent, setToastNotification, userProfile, updateUserProfile, setProModalMode, setProModalOpen, userUsage, isSuperAdmin, currentUser } = useContext(AppContext);
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [isPurchaseModalOpen, setPurchaseModalOpen] = useState(false);
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
    const [isLimitsHelpOpen, setIsLimitsHelpOpen] = useState(false);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [isFlowEditorOpen, setIsFlowEditorOpen] = useState(false);
    const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
    const [isFullScreenFlow, setIsFullScreenFlow] = useState(false);
    
    const [agentName, setAgentName] = useState('');
    const [agentPersona, setAgentPersona] = useState('');
    const [agentMode, setAgentMode] = useState<'basic' | 'advanced'>('basic');
    const [agentVoice, setAgentVoice] = useState<TtsVoice>('Kore');
    const [agentAvatarUrl, setAgentAvatarUrl] = useState('');
    const [agentWhatsappStyle, setAgentWhatsappStyle] = useState(false);

    const selectedAgent = agents.find(a => a.id === selectedAgentId);
    const [tempFlow, setTempFlow] = useState<AgentFlow | null>(null);
    const [flowHistory, setFlowHistory] = useState<AgentFlow[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

    const updateFlowWithHistory = (newFlow: AgentFlow) => {
        const newHistory = flowHistory.slice(0, historyIndex + 1);
        newHistory.push(newFlow);
        if (newHistory.length > 50) newHistory.shift();
        setFlowHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setTempFlow(newFlow);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setTempFlow(flowHistory[newIndex]);
        }
    };

    const handleRedo = () => {
        if (historyIndex < flowHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setTempFlow(flowHistory[newIndex]);
        }
    };

    useEffect(() => {
        if (selectedAgent) {
            setAgentName(selectedAgent.name);
            setAgentPersona(selectedAgent.persona);
            setAgentMode(selectedAgent.mode);
            setAgentVoice(selectedAgent.voice);
            setAgentAvatarUrl(selectedAgent.avatarUrl || '');
            setAgentWhatsappStyle(selectedAgent.whatsappStyle || false);
        }
    }, [selectedAgent]);

    useEffect(() => {
        if (isFlowEditorOpen && selectedAgent) {
             const initialFlow = selectedAgent.flow || { startStepId: 'step-1', steps: [{ id: 'step-1', name: 'Bienvenida', type: 'TEXT', message: '¡Hola! ¿En qué puedo ayudarte?', options: [], position: { x: 100, y: 100 } }] };
             if (historyIndex === -1) {
                 setTempFlow(initialFlow);
                 setFlowHistory([initialFlow]);
                 setHistoryIndex(0);
             }
        } else if (!isFlowEditorOpen) {
            setHistoryIndex(-1);
            setFlowHistory([]);
        }
    }, [isFlowEditorOpen, selectedAgent?.id]);

    const handleSaveAgent = async () => {
        const data = {
            name: agentName,
            persona: agentPersona,
            mode: agentMode,
            voice: agentVoice,
            avatarUrl: agentAvatarUrl,
            whatsappStyle: agentWhatsappStyle,
            flow: agentMode === 'advanced' ? tempFlow : null,
            updatedAt: new Date().toISOString()
        };
        
        if (selectedAgentId) {
            await updateAgent(selectedAgentId, data);
            setToastNotification({ title: "Agente Actualizado", message: "Cambios guardados con éxito.", icon: 'check' });
        } else {
            await addAgent({ ...data, responseCount: 0 });
            setToastNotification({ title: "Agente Creado", message: "Tu nuevo vendedor está listo.", icon: 'check' });
        }
        setCreateModalOpen(false);
        setSelectedAgentId(null);
    };

    const handleDeployFlow = async () => {
        if (selectedAgentId && tempFlow) {
            await updateAgent(selectedAgentId, { flow: tempFlow, updatedAt: new Date().toISOString() });
            setToastNotification({ title: "Flujo Publicado", message: "El agente ha sido actualizado en tiempo real.", icon: 'rocket' });
        }
    };

    const handleCopyLink = (agent: AiAgentConfig) => {
        const slug = encodeURIComponent(agent.name.trim());
        const link = `${window.location.origin}/#/agent/${slug}`;
        navigator.clipboard.writeText(link);
        setToastNotification({ title: "Link Copiado", message: "Enlace público listo para compartir.", icon: 'copy' });
    };

    const handleOpenEdit = (agent: AiAgentConfig) => {
        setSelectedAgentId(agent.id);
        setCreateModalOpen(true);
    };

    const handleOpenPurchase = () => {
        setPurchaseModalOpen(true);
    };

    const handleBuySlot = async () => {
        if (isSuperAdmin && currentUser) {
            const newExtra = (userProfile.extraAgentsPurchased || 0) + 1;
            await updateUserProfile(currentUser.uid, { extraAgentsPurchased: newExtra } as any);
            setToastNotification({ title: "Slot Desbloqueado", message: "Slot VIP activado por rango Súper Admin.", icon: 'star' });
            setPurchaseModalOpen(false);
            setSelectedAgentId(null);
            setAgentName(''); setAgentPersona(''); setAgentMode('basic'); setAgentVoice('Kore'); setAgentAvatarUrl(''); setAgentWhatsappStyle(false);
            setCreateModalOpen(true); 
        } else {
            setPurchaseModalOpen(false);
            setProModalMode('agent');
            setProModalOpen(true);
        }
    };

    const extraSlots = userProfile.extraAgentsPurchased || 0;
    const getPlanLimit = () => {
        const plan = getPlanConfig(userProfile.plan);
        return (plan.limits as any).agents_allowed || 1;
    };
    const totalAllowedSlots = getPlanLimit() + extraSlots;

    const baseResponseLimit = (getPlanConfig(userProfile.plan).limits as any).agent_responses_monthly || 100;
    const totalResponseLimit = baseResponseLimit + (extraSlots * 1000);
    
    const baseDailyLimit = (getPlanConfig(userProfile.plan).limits as any).ai_chat_daily_queries || 30;
    const totalDailyEnergy = baseDailyLimit + (extraSlots * 50);
    
    const globalResponsesUsed = userUsage?.counters?.monthly_agent_responses || 0;
    const dailyEnergyUsed = userUsage?.counters?.daily_chat_count || 0;

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar bg-neutral-50 dark:bg-dark-bg animate-fade-in pb-32">
            <AgentUsageModal isOpen={isUsageModalOpen} onClose={() => setIsUsageModalOpen(false)} agents={agents} />
            <PurchaseSlotModal isOpen={isPurchaseModalOpen} onClose={() => setPurchaseModalOpen(false)} onBuy={handleBuySlot} />
            <ConnectMonetizationModal isOpen={isConnectModalOpen} onClose={() => setIsConnectModalOpen(false)} />
            <AgentLimitsHelpModal isOpen={isLimitsHelpOpen} onClose={() => setIsLimitsHelpOpen(false)} plan={userProfile.plan} extraSlots={extraSlots} isSuperAdmin={isSuperAdmin} />
            
            <Modal isOpen={isCreateModalOpen} onClose={() => setCreateModalOpen(false)} title={selectedAgentId ? "Configurar Vendedor" : "Crear Nuevo Vendedor IA"} zIndex="z-[200000]">
                <div className="space-y-5">
                    <div className="flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
                        <div className="relative group w-16 h-16 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex-none border-2 border-dashed border-neutral-300 dark:border-neutral-700">
                            {agentAvatarUrl ? <img src={agentAvatarUrl} alt="Avatar" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-neutral-400 group-hover:text-brand-primary transition-colors"><Icon name="image" className="w-6 h-6"/></div>}
                            <input type="file" accept="image/*" title="Subir foto de perfil" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setToastNotification({ title: 'Subiendo...', message: 'Subiendo foto del agente.', icon: 'sync' });
                                    try {
                                        const uid = currentUser?.uid;
                                        if (!uid) throw new Error('Debes iniciar sesión para subir la foto del agente.');
                                        const { url } = await uploadWithQuotaCheck({
                                            userId: uid,
                                            data: file,
                                            path: safeStoragePath('agents', uid, 'avatars', `${Date.now()}_${file.name}`),
                                            sizeBytes: file.size,
                                            metadata: { contentType: file.type || 'image/*' }
                                        });
                                        setAgentAvatarUrl(url);
                                        setToastNotification({ title: 'Éxito', message: 'Foto actualizada.', icon: 'check' });
                                    } catch (err) { console.error(err); setToastNotification({ title: 'Error', message: 'No se pudo subir la foto.', icon: 'close' }); }
                                }
                            }} />
                            {agentAvatarUrl && <button onClick={() => setAgentAvatarUrl('')} className="absolute bottom-0 inset-x-0 bg-red-500 text-[8px] font-black uppercase tracking-widest text-white z-20 py-0.5 text-center opacity-0 group-hover:opacity-100 transition-opacity">Borrar</button>}
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-black uppercase text-neutral-500 mb-1 block">Nombre del Agente</label>
                            <Input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Ej: Vendedor Inmobiliario..." />
                        </div>
                    </div>
                    <div><label className="text-xs font-black uppercase text-neutral-500 mb-1 block">Personalidad y Objetivo</label><Textarea value={agentPersona} onChange={e => setAgentPersona(e.target.value)} placeholder="Ej: Eres un vendedor experto en bienes raíces, amable y persuasivo..." rows={4} /></div>
                    
                    <div className="flex items-center gap-3 p-3 bg-[#25D366]/10 rounded-xl border border-[#25D366]/30 cursor-pointer hover:bg-[#25D366]/20 transition-colors" onClick={() => setAgentWhatsappStyle(!agentWhatsappStyle)}>
                        <input type="checkbox" checked={agentWhatsappStyle} onChange={(e) => setAgentWhatsappStyle(e.target.checked)} className="w-5 h-5 rounded text-[#25D366] focus:ring-[#25D366]" onClick={(e) => e.stopPropagation()}/>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-[#128C7E]">ESTILO VERDE (WhatsApp)</span>
                            <span className="text-[10px] sm:text-xs text-neutral-600 dark:text-neutral-400">Activa el modo de chat con aspecto similar a WhatsApp para este vendedor.</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-black uppercase text-neutral-500 mb-1 block">Modo Operativo</label>
                            <select value={agentMode} onChange={e => setAgentMode(e.target.value as any)} className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-bold text-sm">
                                <option value="basic">Conversación Libre</option>
                                <option value="advanced">Flujo Guiado (V2.5)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-black uppercase text-neutral-500 mb-1 block">Voz de Respuesta</label>
                            <select value={agentVoice} onChange={e => setAgentVoice(e.target.value as any)} className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-bold text-sm">
                                {['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="pt-4 flex gap-2">
                        <Button variant="secondary" onClick={() => setCreateModalOpen(false)} className="flex-1">Cancelar</Button>
                        <Button onClick={handleSaveAgent} className="flex-1 shadow-xl">Guardar Vendedor</Button>
                    </div>
                </div>
            </Modal>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 h-auto flex-none">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-grow">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black tracking-tighter uppercase">Vendedores de Élite IA</h1>
                        <button onClick={() => setIsLimitsHelpOpen(true)} className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:bg-brand-primary hover:text-white transition-all text-xs font-black shadow-sm">?</button>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="bg-brand-primary/5 px-4 py-2 rounded-2xl border border-brand-primary/10 text-right min-w-[160px]">
                            <p className="text-[9px] font-black uppercase text-brand-primary tracking-widest leading-none">Bolsa Mensual</p>
                            <div className="flex items-baseline justify-end gap-1 mt-1">
                                <span className="text-sm font-black text-neutral-900 dark:text-white">{globalResponsesUsed.toLocaleString()}</span>
                                <span className="text-[10px] font-bold text-neutral-400">de {totalResponseLimit.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-1 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden mt-1">
                                <div className="h-full bg-brand-primary transition-all duration-1000" style={{ width: `${Math.min(100, (globalResponsesUsed / totalResponseLimit) * 100)}%` }}></div>
                            </div>
                        </div>

                        <div className="bg-orange-50 dark:bg-orange-900/10 px-4 py-2 rounded-2xl border border-orange-100 dark:border-orange-800 text-right min-w-[140px]">
                            <p className="text-[9px] font-black uppercase text-orange-600 tracking-widest leading-none">Energía Shivo</p>
                            <div className="flex items-baseline justify-end gap-1 mt-1">
                                <span className="text-sm font-black text-neutral-900 dark:text-white">{dailyEnergyUsed}</span>
                                <span className="text-[10px] font-bold text-neutral-400">de {totalDailyEnergy}</span>
                            </div>
                            <div className="w-full h-1 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden mt-1">
                                <div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${Math.min(100, (dailyEnergyUsed / totalDailyEnergy) * 100)}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* CONTENEDOR DE BOTONES CON WRAP PARA ZOOM SEGURO v11.5 */}
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    <button 
                        onClick={() => setIsConnectModalOpen(true)}
                        className="p-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl shadow-lg font-black uppercase text-[10px] tracking-widest animate-pulse-subtle flex items-center gap-2 group overflow-hidden relative h-12 flex-shrink-0 z-40"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out"></div>
                        <Icon name="hub" className="w-5 h-5"/>
                        Connect Pro
                    </button>

                    <button onClick={() => setIsUsageModalOpen(true)} className="p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-sm hover:shadow-md transition-all text-neutral-500 hover:text-brand-primary h-12 flex-shrink-0" title="Auditoría de Consumo"><Icon name="chart" className="w-6 h-6"/></button>
                    <Button onClick={() => { setSelectedAgentId(null); setCreateModalOpen(true); }} className="flex-1 sm:flex-none shadow-xl px-8 font-black uppercase text-[10px] tracking-widest h-12 flex-shrink-0 whitespace-nowrap" disabled={agents.length >= totalAllowedSlots}><Icon name="plus" className="w-4 h-4"/> Nuevo Agente</Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 pb-20">
                {agents.map((agent, index) => {
                    const isVip = index >= getPlanLimit();
                    const quotaPct = (agent.responseCount / totalResponseLimit) * 100;
                    
                    return (
                        <Card key={agent.id} className={`p-4 sm:p-6 border shadow-lg hover:shadow-2xl transition-all group rounded-[1.5rem] sm:rounded-[2.5rem] bg-white dark:bg-dark-surface overflow-hidden relative ${isVip ? 'border-yellow-400 ring-2 ring-yellow-400/20' : 'border-neutral-100 dark:border-neutral-800'}`}>
                            {isVip && (
                                <div className="absolute top-0 right-0 bg-gradient-to-l from-yellow-400 to-orange-500 text-white font-black text-[7px] sm:text-[8px] px-2 sm:px-4 py-0.5 sm:py-1 rounded-bl-xl sm:rounded-bl-2xl uppercase tracking-widest shadow-xl z-20 animate-pulse">VIP SLOT</div>
                            )}
                            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-brand-primary/10 transition-colors ${isVip ? 'bg-yellow-400/20' : 'bg-brand-primary/5'}`}></div>
                            <div className="flex justify-between items-start mb-4 sm:mb-6">
                                <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform overflow-hidden relative ${isVip ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'}`}>
                                    {agent.avatarUrl ? <img src={agent.avatarUrl} alt="Vendedor" className="w-full h-full object-contain" /> : <Icon name="agent" className="w-6 h-6 sm:w-8 sm:h-8"/>}
                                    {agent.whatsappStyle && <div className="absolute bottom-0 right-0 bg-[#25D366] text-white p-0.5 sm:p-1 rounded-tl-lg"><Icon name="message" className="w-2.5 h-2.5 sm:w-3 sm:h-3" /></div>}
                                </div>
                                <div className="flex gap-1.5 sm:gap-1.5 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => window.open(`/#/agent/${encodeURIComponent(agent.name.trim())}`, '_blank')} className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg sm:rounded-xl hover:bg-brand-primary hover:text-white transition-all shadow-sm" title="Previsualizar"><Icon name="image" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/></button>
                                    <button onClick={() => handleCopyLink(agent)} className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg sm:rounded-xl hover:bg-brand-primary hover:text-white transition-all shadow-sm" title="Copiar Link Público"><Icon name="copy" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/></button>
                                    <button onClick={() => handleOpenEdit(agent)} className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg sm:rounded-xl hover:bg-brand-primary hover:text-white transition-all shadow-sm" title="Configurar"><Icon name="edit" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/></button>
                                    <button onClick={() => { if(window.confirm("¿Estás seguro de eliminar este vendedor?")) deleteAgent(agent.id) }} className="p-1.5 sm:p-2 bg-red-50 text-red-500 rounded-lg sm:rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm" title="Eliminar"><Icon name="trash" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/></button>
                                </div>
                            </div>
                            <div className="mb-4 sm:mb-6 min-h-[40px] sm:min-h-0">
                                <h3 className="font-black text-xs sm:text-xl text-neutral-900 dark:text-white uppercase tracking-tighter leading-tight truncate">{agent.name}</h3>
                                <div className="flex flex-wrap items-center gap-1 sm:gap-3 mt-1 sm:mt-2">
                                    <span className={`text-[6px] sm:text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${agent.mode === 'advanced' ? 'bg-blue-100 text-blue-600' : 'bg-neutral-100 text-neutral-500'}`}>{agent.mode === 'advanced' ? 'Flujo' : 'Libre'}</span>
                                    <span className="text-[6px] sm:text-[8px] font-bold text-neutral-400 uppercase flex items-center gap-1"><Icon name="mic" className="w-2.5 h-2.5"/> {agent.voice}</span>
                                </div>
                            </div>
                            
                            <div className="mb-4 space-y-1">
                                <div className="flex justify-between text-[7px] sm:text-[9px] font-black uppercase tracking-widest text-neutral-400">
                                    <span>Respuestas Producidas</span>
                                    <span className="text-brand-primary">{agent.responseCount} mensajes</span>
                                </div>
                                <div className="w-full h-1 bg-neutral-100 dark:bg-neutral-900 rounded-full overflow-hidden">
                                    <div className={`h-full bg-gradient-to-r from-brand-primary to-purple-600 transition-all duration-1000`} style={{ width: `${Math.min(100, quotaPct)}%` }}></div>
                                </div>
                            </div>

                            <p className="text-[9px] sm:text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 sm:line-clamp-3 mb-4 sm:mb-6 font-medium leading-tight sm:leading-relaxed italic">"{agent.persona}"</p>
                            <div className="flex gap-1.5 sm:gap-2">
                                {agent.mode === 'advanced' ? (
                                    <button onClick={() => { setSelectedAgentId(agent.id); setIsFlowEditorOpen(true); }} className="flex-1 py-2 sm:py-3 bg-brand-primary text-white rounded-xl sm:rounded-2xl font-black text-[7px] sm:text-[10px] uppercase tracking-widest shadow-lg shadow-brand-primary/20 transform hover:scale-[1.02] active:scale-95 transition-all">Diseñar</button>
                                ) : (
                                    <button onClick={() => window.open(`/#/agent/${encodeURIComponent(agent.name.trim())}`, '_blank')} className="flex-1 py-2 sm:py-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-xl sm:rounded-2xl font-black text-[7px] sm:text-[10px] uppercase tracking-widest shadow-sm hover:bg-neutral-200 transition-all flex items-center justify-center gap-1 sm:gap-2"><Icon name="externalLink" className="w-3 h-3 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">Probar Vendedor</span><span className="sm:hidden">Probar</span></button>
                                )}
                                <button onClick={() => handleCopyLink(agent)} className="px-3 sm:px-5 py-2 sm:py-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-xl sm:rounded-2xl font-black text-[7px] sm:text-[10px] uppercase tracking-widest shadow-sm hover:bg-neutral-200 transition-all">Link</button>
                            </div>
                        </Card>
                    );
                })}
                
                <Card 
                    onClick={handleOpenPurchase}
                    className="p-4 sm:p-8 border-4 border-dashed border-neutral-200 dark:border-neutral-800 rounded-[1.5rem] sm:rounded-[2.5rem] bg-transparent hover:border-brand-primary hover:bg-brand-primary/5 transition-all cursor-pointer flex flex-col items-center justify-center text-center group min-h-[200px] sm:min-h-[320px]"
                >
                    <div className="w-10 h-10 sm:w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-xl sm:rounded-[1.5rem] flex items-center justify-center text-neutral-400 group-hover:bg-brand-primary group-hover:text-white group-hover:scale-110 transition-all shadow-inner mb-3 sm:mb-6">
                        <Icon name="plus" className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <h3 className="font-black text-xs sm:text-xl uppercase tracking-tighter text-neutral-400 group-hover:text-brand-primary transition-colors">Slot VIP</h3>
                    <p className="text-[7px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-1 sm:mt-2 max-w-[150px] sm:max-w-[180px] leading-tight sm:leading-relaxed text-justify">Aumenta tu capacidad: **+1000 respuestas**, **+30 min de voz** y **+50 créditos diarios** por solo {formatCurrency(6, userProfile.currency || 'USD', userProfile.country === 'Mexico')}/mes.</p>
                    <div className="mt-4 sm:mt-8 px-4 sm:px-6 py-1 sm:py-2 bg-neutral-100 dark:bg-neutral-800 rounded-full text-[7px] sm:text-[9px] font-black text-neutral-500 group-hover:bg-brand-primary group-hover:text-white transition-all uppercase tracking-widest">
                        Obtener
                    </div>
                </Card>
            </div>

            {isFlowEditorOpen && selectedAgent && createPortal(
                <div className={`fixed inset-0 z-[999999] bg-white dark:bg-black flex flex-col animate-fade-in ${isFullScreenFlow ? '' : 'm-4 rounded-[2.5rem] shadow-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800'}`}>
                    <div className="flex-none p-4 sm:p-6 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-white/80 dark:bg-black/80 backdrop-blur-md">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsFlowEditorOpen(false)} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"><Icon name="chevronLeft" className="w-6 h-6 text-brand-primary"/></button>
                            <div>
                                <h2 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">Constructor de Flujo: {selectedAgent.name.replace(' (Avanzado)', '')} <span className="bg-brand-primary/10 text-brand-primary text-[10px] px-2 py-0.5 rounded-full">v2.5</span></h2>
                                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Diseño Lógico de Conversación para Cierre de Ventas</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleDeployFlow} className="bg-green-600 hover:bg-green-700 text-white border-none shadow-xl px-8 h-12 font-black uppercase text-[10px] tracking-widest"><Icon name="rocket" className="w-4 h-4"/> Publicar en Vendedor</Button>
                        </div>
                    </div>
                    
                    <div className="flex-1 relative overflow-hidden bg-[#f0f2f5] dark:bg-[#050505]">
                        <VisualFlowBuilder 
                            steps={tempFlow?.steps || []} 
                            startStepId={tempFlow?.startStepId}
                            onStepsChange={(steps) => updateFlowWithHistory(tempFlow ? { ...tempFlow, steps } : { startStepId: 'step-1', steps })} 
                            onSelectStep={(id) => setSelectedStepId(id)}
                            selectedStepId={selectedStepId}
                            isFullScreen={isFullScreenFlow}
                            toggleFullScreen={() => setIsFullScreenFlow(!isFullScreenFlow)}
                            onAddStep={() => {
                                const newId = `step-${Date.now()}`;
                                const newStep: FlowStep = { id: newId, name: `Nuevo Paso`, type: 'TEXT', message: '', options: [], position: { x: 100, y: 100 }, waitForInput: false };
                                updateFlowWithHistory(tempFlow ? { ...tempFlow, steps: [...tempFlow.steps, newStep] } : { startStepId: newId, steps: [newStep] });
                                setSelectedStepId(newId);
                            }}
                            onDeleteStep={(id) => {
                                if (tempFlow?.steps.length === 1) return;
                                updateFlowWithHistory(tempFlow ? { ...tempFlow, steps: tempFlow.steps.filter(s => s.id !== id) } : { startStepId: 'step-1', steps: [] });
                                if (selectedStepId === id) setSelectedStepId(null);
                            }}
                            onDeploy={handleDeployFlow}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            canUndo={historyIndex > 0}
                            canRedo={historyIndex < flowHistory.length - 1}
                        />

                        {selectedStepId && tempFlow && (
                            <FlowStepEditor 
                                step={tempFlow.steps.find(s => s.id === selectedStepId)!}
                                index={tempFlow.steps.findIndex(s => s.id === selectedStepId)}
                                allSteps={tempFlow.steps}
                                onUpdate={(updated) => updateFlowWithHistory(tempFlow ? { ...tempFlow, steps: tempFlow.steps.map(s => s.id === updated.id ? updated : s) } : { startStepId: 'step-1', steps: [] })}
                                onDelete={() => {
                                    updateFlowWithHistory(tempFlow ? { ...tempFlow, steps: tempFlow.steps.filter(s => s.id !== selectedStepId) } : { startStepId: 'step-1', steps: [] });
                                    setSelectedStepId(null);
                                }}
                                onDuplicate={() => {
                                    const original = tempFlow.steps.find(s => s.id === selectedStepId);
                                    if (!original) return;
                                    const newId = `step-${Date.now()}`;
                                    const copy = {
                                        ...original,
                                        id: newId,
                                        name: `${original.name} (Copia)`,
                                        position: { x: original.position.x + 30, y: original.position.y + 30 },
                                        options: original.options.map(opt => ({ ...opt, id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` }))
                                    };
                                    updateFlowWithHistory(tempFlow ? { ...tempFlow, steps: [...tempFlow.steps, copy] } : { startStepId: 'step-1', steps: [] });
                                    setSelectedStepId(newId);
                                }}
                                onClose={() => setSelectedStepId(null)}
                            />
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default AiAgent;
