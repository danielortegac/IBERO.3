
import React, { useState, useContext, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';
import { AppContext } from '../context/AppContext';
import { UserPlan } from '../types';
import Button from './ui/Button';
import PayPalWrapper from './ui/PayPalWrapper';
import { serverTimestamp, doc, collection, addDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface ProModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Standard Rates for display reference (used in display logic below)
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

const ProModal: React.FC<ProModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const { userProfile, updateUserProfile, setToastNotification, currentUser, createNotification, setCurrentView, proModalMode, setProModalMode } = useContext(AppContext);
    
    const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<{plan: UserPlan | 'agent', price: number, planId: string, currency: string} | null>(null);
    const [isProcessingBackend, setIsProcessingBackend] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showAgentSuccessModal, setShowAgentSuccessModal] = useState(false);
    const [paymentTimestamp, setPaymentTimestamp] = useState<string>('');

    // --- COUNTRY & PLAN LOGIC ---
    const isMexico = userProfile.country === 'Mexico';
    const paymentCurrencyCode = isMexico ? 'MXN' : 'USD';
    const displayCurrencyCode = userProfile.currency || 'USD';
    const exchangeRate = rates[displayCurrencyCode] || 1;

    // Plan IDs Configuration
    const PRO_PLAN_ID = isMexico 
        ? 'P-04765057WM055905NNEZAFOQ' // MX PRO
        : 'P-4HX36845LD904453BNBZN66A'; // Global PRO

    const PREMIUM_PLAN_ID = isMexico
        ? 'P-0YJ18157B2153452BNEZAD2Q' // MX Premium Trial
        : 'P-3EP28851HB800071UNEY74JY'; // Global Premium Trial
    
    const AGENT_ADDON_PLAN_ID = 'P-25619148MY463043RNF54TDQ'; 
    
    useEffect(() => {
        if (isOpen) {
            if (proModalMode === 'agent') {
                setSelectedPlanForPayment({
                    plan: 'agent',
                    price: 6,
                    planId: AGENT_ADDON_PLAN_ID,
                    currency: paymentCurrencyCode
                });
            }
        } else {
            setSelectedPlanForPayment(null);
        }
    }, [isOpen, proModalMode, AGENT_ADDON_PLAN_ID, paymentCurrencyCode]);

    if (!isOpen) return null;

    const handleSelectPlan = (plan: UserPlan, priceForPayment: number) => {
        if (plan === 'free') {
             if (currentUser) {
                updateUserProfile(currentUser.uid, { plan: 'free' } as any);
             }
            onClose();
            return;
        }
        
        let planId = '';
        if (plan === 'pro') planId = PRO_PLAN_ID;
        if (plan === 'premium') planId = PREMIUM_PLAN_ID;

        if (!planId) {
            setToastNotification({ title: "Error", message: "Plan no configurado.", icon: 'close' });
            return;
        }

        setSelectedPlanForPayment({ plan, price: priceForPayment, planId, currency: paymentCurrencyCode });
    };
    
    const handleSubscriptionSuccess = async (subscriptionID: string) => {
        if (!selectedPlanForPayment || !currentUser) return;

        setIsProcessingBackend(true);
        const now = new Date().toLocaleString();
        setPaymentTimestamp(now);

        try {
            if (selectedPlanForPayment.plan === 'agent') {
                await updateDoc(doc(db, "users", currentUser.uid), { 
                    extraAgentsPurchased: increment(1) 
                });
                
                await createNotification(currentUser.uid, {
                    type: 'general',
                    text: `🎉 **¡Slot VIP Activado!** Has comprado un Vendedor IA adicional. Tienes +1,000 respuestas mensuales y +50 créditos de energía diaria Shivo.`,
                    link: '/#aiStudio/agents',
                    fromUser: {
                        uid: 'system_goatify',
                        name: 'Sistema Goatify',
                        avatarUrl: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747'
                    }
                });

                setShowAgentSuccessModal(true);

            } else {
                const isTrial = selectedPlanForPayment.plan === 'premium';
                await updateUserProfile(currentUser.uid, { 
                    plan: selectedPlanForPayment.plan as UserPlan,
                    subscriptionStatus: isTrial ? 'trialing' : 'active',
                    subscriptionId: subscriptionID
                } as any);

                const planName = selectedPlanForPayment.plan.toUpperCase();
                const systemConversationId = `system_goatify_${currentUser.uid}`;
                const systemConversationRef = doc(db, 'conversations', systemConversationId);
                
                await setDoc(systemConversationRef, {
                    members: [currentUser.uid, 'system_goatify'],
                    lastMessage: {
                        text: "Pago confirmado - Plan activo",
                        timestamp: serverTimestamp(),
                        senderId: 'system_goatify'
                    },
                    deletedBy: [],
                    agentName: "Sistema Goatify"
                }, { merge: true });

                const paymentText = isTrial 
                    ? `Plan: ${planName} (Prueba Gratis 30 Días)\nCobro Hoy: $0.00 ${selectedPlanForPayment.currency}` 
                    : `Plan: ${planName}\nEstado: PAGADO`;

                await addDoc(collection(systemConversationRef, 'messages'), {
                    senderId: 'system_goatify',
                    text: `**Recibo de Suscripción - Centro Iberoamericano de Inteligencia Artificial (IBERO)**\n\n${paymentText}\nFecha: ${now}\n\n¡Gracias por tu confianza!`,
                    timestamp: serverTimestamp(),
                    read: false,
                    isSystem: true
                });

                await createNotification(currentUser.uid, {
                    type: 'new_message',
                    text: `Factura: Paquete ${planName} activado exitosamente.`,
                    link: `/#hub/messages/${systemConversationId}`,
                    fromUser: {
                        uid: 'system_goatify',
                        name: 'Sistema Goatify',
                        avatarUrl: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747'
                    }
                });
                
                setShowSuccessModal(true);
            }

        } catch (error) {
            console.error("Backend verification failed:", error);
            if (selectedPlanForPayment.plan !== 'agent') {
                 const isTrial = selectedPlanForPayment.plan === 'premium';
                 await updateUserProfile(currentUser.uid, { 
                     plan: selectedPlanForPayment.plan as UserPlan,
                     subscriptionStatus: isTrial ? 'trialing' : 'active',
                     subscriptionId: subscriptionID 
                 } as any);
                 setShowSuccessModal(true);
            }
        } finally {
            setIsProcessingBackend(false);
        }
    };

    const handlePaymentError = (err: any) => {
        setToastNotification({
            title: "Error en el pago",
            message: "Hubo un problema procesando tu pago con PayPal.",
            icon: 'close'
        });
    };
    
    const handlePartnerLink = () => {
        onClose();
        setCurrentView('partners');
        window.location.hash = 'partners';
    };
    
    const plans: UserPlan[] = ['free', 'pro', 'premium'];

    const featureCategories = [
        {
            name: "Goatify Drive (Nube)",
            features: [
                { key: "Espacio de Almacenamiento", free: "1 GB GRATIS", pro: "10 GB", premium: "50 GB" },
                { key: "Seguridad Digital", free: "Estándar", pro: "Pro", premium: "Encriptado VIP" },
                { key: "Respaldo de Todo", free: "Habilitado", pro: "Habilitado", premium: "Habilitado" },
                { key: "Grabación Automática", free: "-", pro: <span className="text-green-600 font-bold text-[10px]">Activado</span>, premium: <span className="text-green-600 font-bold text-[10px]">Activado</span> },
            ]
        },
        {
            name: "Goatify Meets (Videollamadas)",
            features: [
                { key: "Duración Máxima", free: "30 min", pro: "2 horas", premium: "4 horas" },
                { key: "Asistentes Máximos", free: "10 personas", pro: "10 personas", premium: "ILIMITADOS" },
                { key: "Reuniones al Mes", free: "30 reuniones", pro: "60 reuniones", premium: "ILIMITADAS" },
            ]
        },
        {
            name: "Extras y Contenidos",
            features: [
                { key: "Biblioteca Virtual", free: "Básico", pro: "Acceso Total", premium: "VIP" },
                { key: "Noticias", free: "Resumen Semanal", pro: "Actualización Diaria", premium: "Tiempo Real" },
                { key: "Publicar Artículos", free: <Icon name="close" className="w-4 h-4 text-red-400 mx-auto"/>, pro: <Icon name="close" className="w-4 h-4 text-red-400 mx-auto"/>, premium: <span className="text-green-600 font-bold text-[10px]">10 / mes</span> },
            ]
        },
        {
            name: "Funciones Core", 
            features: [
                { key: "Proyectos", free: "Hasta 3", pro: "Ilimitados", premium: "Ilimitados" },
                { key: "Tareas", free: "Hasta 50", pro: "Ilimitados", premium: "Ilimitados" },
                { key: "Constructor de Formularios", free: "1", pro: "5", premium: "20" },
                { key: "Finanzas Elite", free: "Básico", pro: "Acceso Total", premium: "VIP" },
            ]
        },
        {
            name: "Funciones IA de Élite", 
            features: [
                { key: 'Búsquedas Web IA', free: "20 / mes", pro: "100 / mes", premium: "300 / mes" },
                { key: "Consultas IA", free: "30 / día", pro: "150 / día", premium: "500 / día" },
                { key: "Generación Multimedia", free: "3 / mes", pro: "15 / mes", premium: "60 / mes" },
                { key: "Visión HUD (Pantalla)", free: "OFF", pro: "Básico", premium: <span className="text-green-600 font-bold text-[10px]">Ultra HD</span> },
                { key: "Video Insights (Análisis)", free: "1 Créd. Medios", pro: "1 Créd. Medios", premium: "1 Créd. Medios" },
                { key: "Audio Tools (Voz/Texto)", free: "1 Créd. Chat", pro: "1 Créd. Chat", premium: "1 Créd. Chat" },
            ]
        },
        {
            name: "Colaboración y Web",
            features: [
                { key: "Presentaciones", free: "1 / mo", pro: "10 / mo", premium: "50 / mo" },
                { key: "Social Manager", free: "30 / mo", pro: "100 / mo", premium: "300 / mo" },
                { key: "Programador Web", free: "10", pro: "120", premium: "350" },
                { key: "Publicar Sitios", free: "1 sitio", pro: "Hasta 10 sitios", premium: "Hasta 30 sitios" },
            ]
        },
        {
            name: "Punto de Venta (POS) y Negocios",
            features: [
                { key: "Punto de Venta (POS)", free: <span className="text-green-600 font-bold text-[10px]">Gratis</span>, pro: <span className="text-green-600 font-bold text-[10px]">Gratis</span>, premium: <span className="text-green-600 font-bold text-[10px]">Gratis</span> },
                { key: "Prefacturación", free: <span className="text-green-600 font-bold text-[10px]">Gratis</span>, pro: <span className="text-green-600 font-bold text-[10px]">Gratis</span>, premium: <span className="text-green-600 font-bold text-[10px]">Gratis</span> },
                { key: "Manejo de Inventario", free: <span className="text-green-600 font-bold text-[10px]">Gratis</span>, pro: <span className="text-green-600 font-bold text-[10px]">Gratis</span>, premium: <span className="text-green-600 font-bold text-[10px]">Gratis</span> },
                { key: "Todo tipo de Negocios", free: <span className="text-green-600 font-bold text-[10px]">Soportado</span>, pro: <span className="text-green-600 font-bold text-[10px]">Soportado</span>, premium: <span className="text-green-600 font-bold text-[10px]">Soportado</span> },
            ]
        },
        {
            name: "Agentes IA",
            features: [
                { key: "Asistente Shivo (Voz)", free: "5 comandos / mes", pro: "30 comandos / mes", premium: "180 comandos / mes" },
                { key: "Agente de Ventas IA", free: "1 Agente", pro: "1 Agente", premium: "3 Agentes" },
                { key: "Respuestas de Agente", free: "100 respuestas", pro: "500 respuestas", premium: "1,500 respuestas" },
                { key: "Conversación en Vivo", free: "5 min voz / 1 min video", pro: "30 min voz / 5 min video", premium: "120 min voz / 20 min video" },
                { key: "Sesiones Live", free: "-", pro: "30 / mes", premium: "ILIMITADO" },
            ]
        },
        {
            name: "Infraestructura de Ganancias",
            features: [
                { 
                    key: "Programa de Socios", 
                    free: <span className="text-brand-primary font-black text-[10px] uppercase">Gratis 90 días</span>, 
                    pro: <button onClick={handlePartnerLink} className="text-brand-primary hover:underline font-bold text-[10px] flex items-center justify-center gap-1">Acceso Total <Icon name="externalLink" className="w-3 h-3"/></button>, 
                    premium: <button onClick={handlePartnerLink} className="text-brand-primary hover:underline font-bold text-[10px] flex items-center justify-center gap-1">Acceso Total <Icon name="externalLink" className="w-3 h-3"/></button> 
                },
                { key: "Multiplicador Intis ($I)", free: "1.0x", pro: <span className="font-bold text-brand-primary">1.5x</span>, premium: <span className="font-bold text-purple-600">2.0x VIP</span> },
                { key: "Elite Academy", free: "-", pro: <span className="text-green-600 font-bold text-[10px]">Habilitado</span>, premium: <span className="text-green-600 font-bold text-[10px]">VIP Access</span> },
                { key: "Soporte", free: "Centro de Ayuda", pro: "Email Prioritario", premium: "WhatsApp VIP" },
            ]
        }
    ];

    // DISPLAY PRICE CALCULATION
    const getDisplayPrice = (baseUsd: number, mxnPrice: number) => {
        if (isMexico) return mxnPrice;
        return baseUsd * exchangeRate;
    };
    
    // PAYMENT PRICE CALCULATION (Strictly USD or MXN)
    const getPaymentPrice = (baseUsd: number, mxnPrice: number) => {
        if (isMexico) return mxnPrice;
        return baseUsd;
    };

    const planDetails: Record<UserPlan, any> = {
        free: {
            title: "Start",
            tagline: "Empieza a explorar la IA",
            displayPrice: 0,
            paymentPrice: 0,
            buttonText: userProfile.plan === 'free' ? "Plan Actual" : "Empezar",
            color: 'text-neutral-900 dark:text-white',
            bgColor: 'bg-white dark:bg-neutral-900',
            borderColor: 'border-neutral-200 dark:border-neutral-700',
            highlights: ["POS & Inventario GRATIS", "Publicar 1 Sitio", "Goatify Drive 1GB", "Socio Trial 90 días"]
        },
        pro: {
            title: "Pro",
            tagline: "Potencia para profesionales",
            displayPrice: getDisplayPrice(6, 120),
            paymentPrice: getPaymentPrice(6, 120),
            buttonText: userProfile.plan === 'pro' ? "Plan Actual" : "Mejorar",
            color: 'text-white',
            bgColor: 'bg-gradient-to-br from-brand-primary to-purple-900',
            borderColor: 'border-transparent ring-2 ring-brand-accent/50',
            highlights: ["POS & Inventario GRATIS", "100 Búsquedas Web IA", "Goatify Drive 10GB", "Publicar 10 Sitios"]
        },
        premium: {
            title: "Premium",
            tagline: "El arsenal definitivo para negocios",
            displayPrice: getDisplayPrice(12, 240),
            paymentPrice: getPaymentPrice(12, 240),
            buttonText: userProfile.plan === 'premium' ? "Plan Actual" : "Mejorar",
            color: 'text-neutral-900',
            bgColor: 'bg-gradient-to-br from-yellow-200 via-yellow-100 to-orange-100',
            borderColor: 'border-yellow-300 ring-2 ring-yellow-400/50',
            highlights: ["POS & Inventario GRATIS", "300 Búsquedas Web IA", "Meets ILIMITADAS", "WhatsApp VIP"]
        }
    };
    
    if (showAgentSuccessModal && selectedPlanForPayment?.plan === 'agent') {
        return (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[110000000] p-4 animate-fade-in overflow-y-auto">
                <div className="bg-white text-black rounded-[2rem] shadow-2xl w-full max-w-md p-10 relative animate-scale-in my-auto font-sans border-t-8 border-yellow-500">
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 bg-yellow-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-yellow-500/20">
                            <Icon name="agent" className="w-12 h-12" />
                        </div>
                        <h2 className="text-2xl font-black uppercase tracking-tighter">¡Vendedor VIP Activado!</h2>
                        <p className="text-sm text-gray-500 mt-2 font-medium">Has desbloqueado un nuevo slot de alta conversión.</p>
                    </div>

                    <div className="space-y-4 mb-8">
                        <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-2xl border border-yellow-100">
                            <Icon name="check" className="w-5 h-5 text-yellow-600" />
                            <span className="text-xs font-bold text-yellow-800">1,000 Respuestas Mensuales Extra</span>
                        </div>
                        <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                            <Icon name="ai" className="w-5 h-5 text-orange-600" />
                            <span className="text-xs font-bold text-orange-800">+50 Energía Diaria Sincronizada</span>
                        </div>
                    </div>

                    <Button onClick={() => { setShowAgentSuccessModal(false); setSelectedPlanForPayment(null); onClose(); }} className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase tracking-widest shadow-xl">
                        IR A CONFIGURAR AGENTE
                    </Button>
                </div>
            </div>
        );
    }

    if (showSuccessModal && selectedPlanForPayment && selectedPlanForPayment.plan !== 'agent') {
        const planName = selectedPlanForPayment.plan.toUpperCase();
        const benefits = planDetails[selectedPlanForPayment.plan].highlights;
        const isTrial = selectedPlanForPayment.plan === 'premium';
        
        return (
             <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[110000000] p-4 animate-fade-in overflow-y-auto">
                <div className="bg-white text-black rounded-sm shadow-2xl w-full max-w-md p-8 relative animate-scale-in my-auto font-mono border-t-8 border-brand-primary receipt-texture">
                    <div className="text-center border-b-2 border-dashed border-gray-300 pb-6 mb-6">
                        <div className="flex justify-center mb-4">
                            <div className="w-16 h-16 bg-brand-primary text-white rounded-full flex items-center justify-center">
                                <Icon name="goat" className="w-10 h-10" />
                            </div>
                        </div>
                        <h2 className="text-xl font-bold uppercase tracking-widest">Recibo</h2>
                        <p className="text-xs text-gray-500 mt-1">Goatify IA</p>
                    </div>

                    <div className="space-y-3 text-sm mb-6">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Cliente:</span>
                            <span className="font-bold uppercase">{userProfile.name}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Fecha:</span>
                            <span>{paymentTimestamp}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Producto:</span>
                            <span className="font-bold">PLAN {planName} {isTrial && "(TRIAL)"}</span>
                        </div>
                        <div className="flex justify-between text-lg border-t border-gray-200 pt-2 mt-2">
                            <span className="font-bold">TOTAL PAGADO:</span>
                            <span className="font-bold text-brand-primary">
                                {isTrial ? `$0.00 ${selectedPlanForPayment.currency}` : `${selectedPlanForPayment.price.toFixed(2)} ${selectedPlanForPayment.currency}`}
                            </span>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2 text-center">Beneficios Desbloqueados:</p>
                        <ul className="space-y-2">
                            {benefits.map((b: string, i: number) => (
                                <li key={i} className="flex items-center text-xs font-semibold">
                                    <Icon name="check" className="w-3 1/4 h-3 text-green-600 mr-2"/> {b}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="text-center space-y-4">
                        <div className="inline-block border-2 border-green-600 text-green-600 font-bold px-4 py-1 rounded transform -rotate-12 text-xl opacity-80">
                            {isTrial ? 'PRUEBA ACTIVA' : 'PAGADO'}
                        </div>
                        <Button onClick={() => { setShowSuccessModal(false); setSelectedPlanForPayment(null); onClose(); }} className="w-full py-3 text-lg shadow-xl bg-black text-white hover:bg-gray-800 rounded-none font-sans font-bold">
                            CONTINUAR
                        </Button>
                    </div>
                </div>
             </div>
        );
    }

    if (selectedPlanForPayment) {
        const title = selectedPlanForPayment.plan === 'agent' ? "Compra de Agente IA VIP" : `Suscripción ${selectedPlanForPayment.plan.toUpperCase()}`;
        const isTrial = selectedPlanForPayment.plan === 'premium';
        const displayPrice = isTrial ? 0 : selectedPlanForPayment.price;
        
        const userCurrency = userProfile.currency || 'USD';
        const rate = rates[userCurrency] || 1;
        const localVal = selectedPlanForPayment.price * rate;
        const formattedLocal = new Intl.NumberFormat(undefined, { style: 'currency', currency: userCurrency, maximumFractionDigits: 0 }).format(localVal);
        
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110000000] p-4 animate-fade-in" onClick={onClose}>
                <div className="bg-light-surface dark:bg-dark-surface rounded-3xl shadow-2xl w-full max-w-md p-0 overflow-hidden flex flex-col animate-scale-in" onClick={e => e.stopPropagation()}>
                    <div className="bg-gradient-to-r from-brand-primary to-brand-secondary p-6 text-white text-center relative">
                         <button onClick={() => setSelectedPlanForPayment(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><Icon name="close" className="w-6 h-6"/></button>
                         <h2 className="text-2xl font-bold mb-1">{title}</h2>
                         {isTrial && <span className="bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded-full uppercase">Prueba Gratis 30 Días</span>}
                         {selectedPlanForPayment.plan === 'agent' && <span className="bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest mt-2 inline-block shadow-lg">Licencia Vitalicia de Slot</span>}
                    </div>
                    <div className="p-8 flex flex-col items-center">
                        <div className="text-4xl font-extrabold text-light-text-primary dark:text-dark-text-primary mb-2 text-center">
                            {displayPrice === 0 ? (
                                <span>$0.00 <span className="text-lg font-normal text-neutral-500">{selectedPlanForPayment.currency} hoy</span></span>
                            ) : (
                                <div className="flex flex-col items-center">
                                   <span>${(selectedPlanForPayment.plan === 'agent' && isMexico) ? (6 * rates['MXN']).toFixed(0) : displayPrice.toFixed(2)} <span className="text-lg font-normal text-neutral-500">{selectedPlanForPayment.currency} / mes</span></span>
                                   {selectedPlanForPayment.currency === 'USD' && userCurrency !== 'USD' && (
                                       <p className="text-sm text-neutral-500 mt-2 font-normal">
                                           (Equivalente a aprox. <span className="font-bold text-neutral-800 dark:text-white">{formattedLocal}</span>)
                                       </p>
                                   )}
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-neutral-500 mb-8 text-center">
                            {isTrial ? "No se te cobrará hasta el próximo mes." : "Pago seguro procesado por PayPal."}
                        </p>
                        {isProcessingBackend ? (
                            <div className="py-8 flex flex-col items-center">
                                <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p className="font-semibold text-brand-primary">Vinculando Licencia...</p>
                            </div>
                        ) : (
                            <div className="w-full">
                                <PayPalWrapper 
                                    planId={selectedPlanForPayment.planId} 
                                    currency={selectedPlanForPayment.currency}
                                    onSuccess={handleSubscriptionSuccess} 
                                    onError={handlePaymentError} 
                                />
                                {selectedPlanForPayment.plan === 'agent' && (
                                    <div className="mt-4 p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                                        <p className="text-[10px] text-center text-neutral-500 font-medium">Al comprar este slot, también aceptas el incremento automático de tus límites de energía diaria en Shivo.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // SPECIAL UI FOR PREMIUM USERS WHO REACH THE LIMIT
    if (userProfile.plan === 'premium' && proModalMode === 'plan') {
        return (
            <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md flex items-center justify-center z-[110000000] p-4 animate-fade-in" onClick={onClose}>
                <div className="bg-white dark:bg-[#0a0a0a] rounded-[2.5rem] shadow-2xl w-full max-w-lg transform animate-scale-in overflow-hidden flex flex-col border border-white/10 relative" onClick={e => e.stopPropagation()}>
                    <button onClick={onClose} className="absolute top-6 right-6 text-neutral-500 hover:text-black dark:hover:text-white z-30 p-2"><Icon name="close" className="w-6 h-6" /></button>
                    
                    <div className="p-10 text-center space-y-8">
                        <div className="w-24 h-24 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto shadow-inner border-2 border-brand-primary/20">
                            <Icon name="ai" className="w-12 h-12 text-brand-primary animate-pulse" />
                        </div>
                        
                        <div className="space-y-3">
                             <h2 className="text-3xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter">Límite Premium Alcanzado</h2>
                             <p className="text-neutral-500 dark:text-neutral-400 text-sm font-medium leading-relaxed">
                                Has agotado los comandos de voz de tu plan actual. En Goatify premiamos el uso masivo, por eso podemos armarte un <strong>Plan Corporativo Personalizado</strong> a tu medida.
                             </p>
                        </div>

                        <div className="p-6 bg-brand-primary/5 rounded-3xl border border-brand-primary/10 flex flex-col gap-4">
                             <div className="flex items-center gap-4 text-left">
                                 <div className="p-3 bg-brand-primary text-white rounded-2xl shadow-lg"><Icon name="phone" className="w-6 h-6"/></div>
                                 <div>
                                     <p className="font-black text-xs uppercase tracking-widest text-neutral-400">Contacto Directo</p>
                                     <p className="text-sm font-bold text-neutral-800 dark:text-white">Asistencia VIP para Upgrade</p>
                                 </div>
                             </div>
                             <a 
                                href="https://wa.me/19125715145?text=Hola,%20soy%20usuario%20Premium%20y%20necesito%20un%20plan%20personalizado%20para%20más%20comandos%20de%20voz." 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all transform active:scale-95 text-center flex items-center justify-center gap-3"
                             >
                                <Icon name="phone" className="w-5 h-5"/> Hablar con Soporte
                             </a>
                        </div>

                        <button onClick={onClose} className="text-neutral-400 font-bold uppercase text-[10px] tracking-[0.3em] hover:text-neutral-600 transition-all">Seguir navegando</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md flex items-center justify-center z-[110000000] p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-neutral-100 dark:bg-[#0a0a0a] rounded-3xl shadow-2xl w-full max-w-6xl transform animate-scale-in overflow-hidden flex flex-col max-h-[95vh] border border-white/10 relative" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-neutral-500 hover:text-black dark:hover:text-white z-30 p-2 bg-white/80 dark:bg-neutral-800/80 rounded-full backdrop-blur-sm transition-colors"><Icon name="close" className="w-5 h-5" /></button>
                
                <div className="p-4 sm:p-6 text-center flex-shrink-0 bg-white dark:bg-[#0f0f0f] border-b border-neutral-200 dark:border-neutral-800">
                    {proModalMode === 'plan' && userProfile.plan !== 'premium' && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl mb-4 font-black uppercase text-xs animate-pulse border border-red-100 dark:border-red-900/30">
                            ¡Límite Alcanzado! Activa Premium Gratis para Seguir
                        </div>
                    )}
                    <h2 className="text-xl sm:text-4xl font-black font-sans mb-2 bg-clip-text text-transparent bg-gradient-to-r from-brand-primary via-purple-500 to-pink-500">
                        {t('proModalTitle')}
                    </h2>
                    <p className="text-neutral-500 dark:text-neutral-400 text-xs sm:text-sm max-w-lg mx-auto mb-4 hidden sm:block">{t('proModalSubtitle')}</p>
                    
                    <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl border border-neutral-200 dark:border-neutral-700 opacity-50 pointer-events-none" title="Annual plans coming soon">
                        <button className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-md">{t('monthly')}</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-neutral-50 dark:bg-[#0a0a0a]">
                    <div className="p-2 sm:p-8 max-w-6xl mx-auto">
                        
                        <div className="grid grid-cols-3 gap-2 sm:gap-6 mb-6 sm:mb-10 px-0 sm:px-1">
                             {plans.map(plan => {
                                const details = planDetails[plan];
                                const isCurrent = userProfile.plan === plan;
                                const displayPriceValue = details.displayPrice;
                                
                                return (
                                    <div key={plan} className={`relative p-3 sm:p-6 flex flex-col rounded-xl sm:rounded-3xl transition-all duration-300 border ${details.borderColor} ${details.bgColor} shadow-sm sm:shadow-xl overflow-hidden group hover:scale-[1.02] min-w-0`}>
                                        {isCurrent && <div className="absolute top-1 right-1 sm:top-4 sm:right-4 bg-green-500 text-white text-[8px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-10">Actual</div>}
                                        {plan === 'premium' && <div className="absolute top-1 left-1 sm:top-4 sm:left-4 bg-yellow-400 text-black text-[8px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-10">30 Días Gratis</div>}
                                        
                                        <div className="mb-1 sm:mb-4 mt-4 sm:mt-6 relative z-10">
                                            <h3 className={`text-xs sm:text-2xl font-black uppercase tracking-tight ${details.color} truncate`}>{details.title}</h3>
                                            <p className={`text-[8px] sm:text-xs font-medium opacity-80 mt-0.5 sm:mt-1 ${details.color} leading-tight line-clamp-2`}>{details.tagline}</p>
                                        </div>
                                        
                                        <div className={`mb-2 sm:mb-6 relative z-10 ${details.color}`}>
                                            <span className="text-lg sm:text-4xl font-extrabold">
                                                {displayPriceValue > 0 
                                                    ? isMexico 
                                                        ? `$${displayPriceValue}` 
                                                        : `$${displayPriceValue.toFixed(2)}`
                                                    : '$0'}
                                            </span>
                                            {displayPriceValue > 0 && <span className="text-[8px] sm:text-sm opacity-80 font-medium block sm:inline"> {isMexico ? 'MXN' : displayCurrencyCode} / mo</span>}
                                        </div>

                                        <ul className={`mb-3 sm:mb-6 space-y-1 relative z-10 ${details.color} opacity-90`}>
                                            {details.highlights.map((feat: string, idx: number) => (
                                                <li key={idx} className="text-[8px] sm:text-xs flex items-center gap-1">
                                                    <Icon name="check" className="w-3 h-3" /> {feat}
                                                </li>
                                            ))}
                                        </ul>

                                        <div className="mt-auto relative z-10">
                                            <Button 
                                                onClick={() => handleSelectPlan(plan, details.paymentPrice)} 
                                                className={`w-full py-2 sm:py-3 rounded-full font-bold text-[9px] sm:text-sm shadow-md hover:shadow-xl transform active:scale-[0.98] transition-all ${
                                                    plan === 'free' 
                                                    ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-300' 
                                                    : 'bg-gradient-to-r from-[#1e1b4b] to-[#6b21a8] text-white hover:from-[#312e81] hover:to-[#7e22ce] border-none shadow-lg'
                                                }`}
                                                disabled={isCurrent}
                                            >
                                                {plan === 'premium' && !isCurrent ? "Iniciar Prueba Gratis" : details.buttonText}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="bg-white dark:bg-[#0f0f0f] rounded-3xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                            <div className="p-3 sm:p-4 border-b border-neutral-100 border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                                <h4 className="font-bold text-xs sm:text-sm text-neutral-500 uppercase tracking-widest text-center">Comparar Funciones</h4>
                            </div>
                            
                            {featureCategories.map((category, catIdx) => (
                                <div key={category.name} className={catIdx > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
                                    <div className="bg-neutral-50 dark:bg-neutral-900/30 px-3 sm:px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
                                        <p className="text-[10px] sm:text-xs font-bold text-brand-primary uppercase">{category.name}</p>
                                    </div>
                                    {category.features.map((feat, idx) => (
                                        <div key={idx} className="grid grid-cols-4 text-[10px] sm:text-sm border-b last:border-0 border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                            <div className="col-span-1 p-2 sm:p-3 font-medium text-neutral-700 dark:text-neutral-300 border-r border-neutral-100 dark:border-neutral-800 flex items-center">{feat.key}</div>
                                            <div className="col-span-1 p-2 sm:p-3 text-center text-neutral-500 dark:text-neutral-400 border-r border-neutral-100 dark:border-neutral-800 flex items-center justify-center break-words">{feat.free}</div>
                                            <div className="col-span-1 p-2 sm:p-3 text-center font-bold text-brand-primary border-r border-neutral-100 dark:border-neutral-800 bg-brand-primary/5 flex items-center justify-center break-words">{feat.pro}</div>
                                            <div className="col-span-1 p-2 sm:p-3 text-center font-bold text-purple-600 dark:text-purple-400 bg-purple-500/5 flex items-center justify-center break-words">{feat.premium}</div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProModal;
