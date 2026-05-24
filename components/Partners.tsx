
import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';
import Icon from './Icon';
import { useTranslation } from '../hooks/useTranslation';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Modal from './ui/Modal';
import Spinner from './ui/Spinner';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import { PartnerLead, ClientChangeRequest, UserProfile, SUPER_ADMIN_EMAILS, AdminUserData, Book, getPlanConfig } from '../types';
import { BookManagement } from './BookManagement';
import { generateAiQuotation, generateSalesClosingScript, generatePartnerClientSiteHtml, generatePartnerPreInvoice, generatePartnerContract, investigateClientWithAi } from '../services/geminiService';
import { constructWelcomeEmailHtml, constructNewsEmailHtml, constructMarketingEmailHtml, constructPartnerEmailHtml } from '../utils/emailTemplates';
import jsPDF from 'jspdf';
import html2pdf from 'html2pdf.js';
import { collection, addDoc, doc, updateDoc, writeBatch, query, where, getDocs, deleteDoc, arrayUnion, getDoc, arrayRemove, setDoc, increment, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { db, storage } from '../firebaseConfig';

const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";
const WHATSAPP_URL = "https://wa.me/19125715145";

const PAYPAL_MONTHLY_URL = "https://www.paypal.com/ncp/payment/P-ACADEMY_MONTHLY_PRO";
const PAYPAL_SEMESTRAL_URL = "https://www.paypal.com/ncp/payment/P-ACADEMY_SEMESTRAL_PRO";

const statusLabels: Record<string, string> = { pending: 'Pendiente', meeting: 'Reunión', closing: 'Negociación', won: 'Ganado', lost: 'Perdido' };
const statusColors: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-700', meeting: 'bg-blue-100 text-blue-700', closing: 'bg-purple-100 text-purple-700', won: 'bg-green-100 text-green-700', lost: 'bg-red-100 text-red-700' };


const getTimestampMs = (value: any): number => {
    if (!value) return 0;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'number') return value;
    if (value?.toDate) return value.toDate().getTime();
    if (value?.seconds) return value.seconds * 1000;
    return 0;
};

const formatAdminRelativeTime = (value: any): string => {
    const ts = getTimestampMs(value);
    if (!ts) return 'Sin registro';
    const diffMs = Date.now() - ts;
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `Hace ${days} d`;
    return new Date(ts).toLocaleDateString();
};

const formatAdminBytes = (bytes?: number): string => {
    const value = Math.max(0, Number(bytes || 0));
    if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
    if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
};

const getAdminPresence = (user: UserProfile, usage?: any) => {
    const lastSeen = getTimestampMs(user.lastSeen);
    const lastUsage = getTimestampMs(usage?.counters?.last_activity);
    const last = Math.max(lastSeen, lastUsage);
    const mins = last ? (Date.now() - last) / 60000 : Infinity;
    if (mins < 5) return { label: 'Online', dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' };
    if (mins < 30) return { label: 'Activo', dot: 'bg-lime-500', text: 'text-lime-600', bg: 'bg-lime-50 dark:bg-lime-900/20' };
    if (mins < 1440) return { label: 'Hoy', dot: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' };
    return { label: 'Offline', dot: 'bg-neutral-400', text: 'text-neutral-500', bg: 'bg-neutral-50 dark:bg-neutral-800' };
};

const Avatar: React.FC<{ user: UserProfile; size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({ user, size = 'md' }) => {
    let containerClass = 'w-10 h-10';
    let textClass = 'text-sm';
    if (size === 'sm') { containerClass = 'w-8 h-8'; textClass = 'text-xs'; } else if (size === 'lg') { containerClass = 'w-16 h-16'; textClass = 'text-xl'; } else if (size === 'xl') { containerClass = 'w-full h-full'; textClass = 'text-4xl'; }
    if (user.avatarUrl) { return ( <img src={user.avatarUrl} alt={user.name} className={`${containerClass} rounded-full object-contain`} /> ); }
    return ( <div className={`${containerClass} rounded-full bg-brand-primary flex items-center justify-center text-white font-bold ${textClass}`}> {user.name ? user.name.charAt(0).toUpperCase() : '?'} </div> );
};

const rates: Record<string, number> = {
    USD: 1, MXN: 18.5, COP: 4100,
    PEN: 3.75, ARS: 910, EUR: 0.92,
    CAD: 1.37, BRL: 5.15, CLP: 980, GTQ: 7.8,
};

const convertAndFormatCurrency = (usdValue: number, userCurrency: string): string => {
    const selectedRate = rates[userCurrency] || rates['USD'];
    const convertedValue = usdValue * selectedRate;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: userCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(convertedValue);
};

const commissionData = [
  { id: 'web_smart', service: 'Web Smart', price: 47, commission: '35%', type: 'Única', notes: 'Hasta 5 secciones.', isAnnual: false },
  { id: 'web_smart_pro', service: 'Web Smart PRO', price: 97, commission: '35%', type: 'Única', notes: 'Ilimitado + Blog.', isAnnual: false },
  { id: 'ecommerce', service: 'E-commerce Smart', price: 147, commission: '35%', type: 'Única', notes: 'Tienda completa.', isAnnual: false },
  { id: 'branding', service: 'Kit de Branding IA', price: 40, commission: '35%', type: 'Única', notes: 'Identidad visual.', isAnnual: false },
  { id: 'social_auto', service: 'Social Autopilot', price: 50, commission: '30%', type: 'Suscripción', notes: 'Redes sociales.', isMonthly: true, isAnnual: false },
  { id: 'video_promo', service: 'Video IA Promos', price: 50, commission: '30%', type: 'Suscripción', notes: '8 videos/mes (30s c/u) editados.', isMonthly: true, isAnnual: false },
  { id: 'email_mkt', service: 'Email Marketing IA', price: 50, commission: '30%', type: 'Suscripción', notes: 'Funnels auto.', isMonthly: true, isAnnual: false },
  { id: 'reports', service: 'Reportes Pro', price: 20, commission: '30%', type: 'Suscripción', notes: 'Tableros métricas.', isMonthly: true, isAnnual: false },
  { id: 'crm', service: 'Integración CRM', price: 70, commission: '35%', type: 'Única', notes: 'Gestión ventas.', isAnnual: false },
  { id: 'bot_prof', service: 'Bot IA Professional', price: 47, commission: '30%', type: 'Suscripción', notes: 'Vendedor 24/7.', isMonthly: true, isAnnual: false },
  { id: 'bot_elite', service: 'Bot IA Elite', price: 77, commission: '30%', type: 'Suscripción', notes: 'Vendedor VIP.', isMonthly: true, isAnnual: false },
  { id: 'custom_app', service: 'App Personalizada', price: 500, commission: '35%', type: 'Única', notes: 'App web/móvil.', isAnnual: false },
  { id: 'calls_system', service: 'Sistema Llamadas IA', price: 200, commission: '35%', type: 'Única', notes: 'Llamadas/WhatsApp.', isAnnual: false },
  { id: 'academy_monthly', service: 'Academia Mensual', price: 77, commission: '35%', type: 'Suscripción', notes: 'Formación Élite.', isMonthly: true, isAnnual: false },
  { id: 'academy_semestral', service: 'Academia Semestral', price: 367, commission: '35%', type: 'Suscripción', notes: 'Acceso total 6 meses.', isMonthly: false, isSemestral: true, isAnnual: false },
  { id: 'plan_premium_sale', service: 'Plan Premium Goatify', price: 12, commission: '40%', type: 'Suscripción', notes: 'Herramienta de Productividad IA.', isMonthly: true, isAnnual: false },
  { id: 'social_ig_fb_12', service: 'Manejo Redes IG+FB (12 post)', price: 220, commission: '35%', type: 'Suscripción', notes: 'Manejo mensual.', isMonthly: true, isAnnual: false },
  { id: 'social_ig_fb_tk_12', service: 'Manejo Redes IG+FB+TikTok (12 post)', price: 290, commission: '35%', type: 'Suscripción', notes: 'Manejo mensual.', isMonthly: true, isAnnual: false },
  { id: 'social_ig_fb_tk_18', service: 'Manejo Redes IG+FB+TikTok (18 post)', price: 350, commission: '35%', type: 'Suscripción', notes: 'Manejo mensual.', isMonthly: true, isAnnual: false },
  { id: 'domain_annual', service: 'Dominio Anual', price: 50, commission: '35%', type: 'Suscripción', notes: 'Pago anual.', isMonthly: false, isAnnual: true },
  { id: 'domain_config', service: 'Configuración Dominio Propio', price: 40, commission: '35%', type: 'Única', notes: 'Pago único.', isAnnual: false },
  { id: 'mailing_setup', service: 'Mailing', price: 50, commission: '35%', type: 'Única', notes: 'Pago único.', isAnnual: false },
  { id: 'corp_email_1', service: 'Correo Corporativo (1 cuenta)', price: 15, commission: '35%', type: 'Única', notes: 'Pago único.', isAnnual: false },
  { id: 'corp_email_5', service: 'Correos Corporativos (Paquete 5)', price: 50, commission: '35%', type: 'Única', notes: 'Pago único.', isAnnual: false },
  { id: 'custom', service: 'Proyecto Variable', price: 500, isCustom: true, commission: '35%', type: 'Única', notes: 'Monto a medida.', isAnnual: false }
];

const industrySolutions = [
  { title: "Comercio Local", icon: "market", desc: "Facturación e inventarios IA.", price: 500, gain: 175 },
  { title: "Salud y Citas", icon: "calendar", desc: "Agendamiento automático clínico.", price: 500, gain: 175 },
  { title: "Fitness & Gyms", icon: "star", desc: "Membresías y rutinas IA.", price: 500, gain: 175 },
  { title: "Educación Pro", icon: "book", desc: "Academias IA para coaches.", price: 500, gain: 175 },
  { title: "Hotelería", icon: "projects", desc: "Conserjería y reservas 24/7.", price: 700, gain: 245 },
  { title: "Bienes Raíces", icon: "map", desc: "Tours virtuales y leads IA.", price: 600, gain: 210 },
  { title: "Bufetes Legales", icon: "security", desc: "Análisis de contratos IA.", price: 800, gain: 280 },
  { title: "Automotriz", icon: "code", desc: "Bots de ventas para agencias.", price: 700, gain: 245 },
  { title: "Gastronomía", icon: "radio", desc: "Pedidos vía voz e IA.", price: 500, gain: 175 },
  { title: "Logística", icon: "expand", desc: "Optimización de rutas IA.", price: 900, gain: 315 },
  { title: "Belleza y Spa", icon: "image", desc: "Marketing estético IA.", price: 400, gain: 140 },
  { title: "Recursos Humanos", icon: "users", desc: "Filtrado de CVs masivo.", price: 800, gain: 280 },
  { title: "Para PyMES", icon: "settings", desc: "Automatización total de procesos.", price: 1200, gain: 420 }
];

const FeatureCard: React.FC<{ icon: any; title: string; number: number; children: React.ReactNode; onClick?: () => void }> = ({ icon, title, number, children, onClick }) => (
    <Card onClick={onClick} className={`p-3 sm:p-6 bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800 shadow-md rounded-2xl sm:rounded-3xl relative overflow-hidden group transition-all ${onClick ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1' : ''}`}>
        <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-brand-primary/10 rounded-lg sm:rounded-xl flex items-center justify-center text-brand-primary font-black text-[10px] sm:text-sm shadow-inner">{number}</div>
                <h4 className="font-black text-[9px] sm:text-sm uppercase tracking-tight truncate">{title}</h4>
            </div>
            <div className="text-[9px] sm:text-xs text-neutral-500 leading-relaxed font-medium flex-grow mb-3 sm:mb-4 line-clamp-3 sm:line-clamp-none">{children}</div>
            {onClick && (
                <div className="flex items-center justify-center w-full py-1.5 sm:py-2 bg-brand-primary/5 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black text-brand-primary uppercase tracking-widest mt-auto group-hover:bg-brand-primary group-hover:text-white transition-all">
                    <span>Ver más</span> <Icon name="arrowRight" className="w-2.5 h-2.5 sm:w-3.5 h-3.5 ml-1.5"/>
                </div>
            )}
        </div>
    </Card>
);

const SolutionsCarousel: React.FC = () => {
    const { userProfile } = useContext(AppContext);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        let animationFrameId: number;
        const scrollSpeed = 0.8; 

        const performScroll = () => {
            if (containerRef.current && !isPaused) {
                const container = containerRef.current;
                container.scrollLeft += scrollSpeed;
                
                if (container.scrollLeft >= container.scrollWidth - container.clientWidth) {
                    container.scrollLeft = 0;
                }
            }
            animationFrameId = requestAnimationFrame(performScroll);
        };

        animationFrameId = requestAnimationFrame(performScroll);
        return () => cancelAnimationFrame(animationFrameId);
    }, [isPaused]);

    const scroll = (dir: 'l' | 'r') => {
        if (containerRef.current) {
            const amount = dir === 'l' ? -300 : 300;
            containerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    const items = [...industrySolutions, ...industrySolutions];

    return (
        <div 
            className="relative group/carousel"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onTouchStart={() => setIsPaused(true)}
            onTouchEnd={() => setIsPaused(false)}
        >
            <div 
                ref={containerRef}
                className="flex gap-4 sm:gap-6 overflow-x-auto pb-8 pt-2 no-scrollbar"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {items.map((sol, i) => (
                    <Card key={i} className="min-w-[200px] sm:min-w-[280px] p-5 sm:p-6 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] bg-white dark:bg-dark-surface shadow-lg hover:shadow-2xl transition-all group flex flex-col h-full relative overflow-hidden flex-shrink-0">
                        <div className="p-3 sm:p-4 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-2xl w-fit mb-4 group-hover:scale-110 transition-transform duration-500">
                            <Icon name={sol.icon as any} className="w-5 h-5 sm:w-7 sm:h-7 text-brand-primary"/>
                        </div>
                        <h3 className="text-sm sm:base font-black mb-1.5 truncate text-neutral-900 dark:text-white">{sol.title}</h3>
                        <p className="text-[10px] sm:text-xs text-neutral-500 leading-relaxed mb-4 flex-grow line-clamp-2">{sol.desc}</p>
                        <div className="mt-auto pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-col gap-1">
                            <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Inversión: {convertAndFormatCurrency(sol.price, userProfile.currency || 'USD')}</span>
                            <span className="text-[10px] font-black text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full shadow-sm w-fit">Ganas {convertAndFormatCurrency(sol.gain, userProfile.currency || 'USD')}</span>
                        </div>
                    </Card>
                ))}
            </div>
            <button onClick={() => scroll('l')} className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2 sm:-ml-4 w-10 h-10 bg-white dark:bg-neutral-800 rounded-full shadow-xl items-center justify-center flex z-10 opacity-0 group-hover/carousel:opacity-100 transition-opacity border border-neutral-200 dark:border-neutral-700 active:scale-90"><Icon name="chevronLeft" className="w-6 h-6 text-brand-primary"/></button>
            <button onClick={() => scroll('r')} className="absolute right-0 top-1/2 -translate-y-1/2 -mr-2 sm:-mr-4 w-10 h-10 bg-white dark:bg-neutral-800 rounded-full shadow-xl items-center justify-center flex z-10 opacity-0 group-hover/carousel:opacity-100 transition-opacity border border-neutral-200 dark:border-neutral-700 active:scale-90"><Icon name="chevronLeft" className="w-6 h-6 rotate-180 text-brand-primary"/></button>
        </div>
    );
};

const TeamLeadersSection: React.FC<{ isPaid: boolean, userName: string, onUpgrade: () => void }> = ({ isPaid, userName, onUpgrade }) => {
    const handleApply = () => {
        if (!isPaid) {
            onUpgrade();
            return;
        }
        const message = encodeURIComponent(`Hola, quiero aplicar para ser uno de los 5 Líderes de Equipo en Goatify. Mi nombre es ${userName}.`);
        window.open(`${WHATSAPP_URL}?text=${message}`, '_blank');
    };

    return (
        <section className="relative p-0.5 sm:p-1 bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-500 rounded-[2.5rem] sm:rounded-[3.5rem] shadow-2xl overflow-hidden group animate-fade-in border border-white/10">
            <div className="bg-[#050505] rounded-[2.4rem] sm:rounded-[3.4rem] p-6 sm:p-20 relative overflow-hidden flex flex-col md:flex-row items-center gap-8 sm:gap-12">
                <div className="absolute top-0 right-0 w-[30rem] sm:w-[50rem] h-[30rem] sm:h-[50rem] bg-brand-primary/10 rounded-full blur-[100px] sm:blur-[140px] -mr-40 sm:-mr-80 -mt-40 sm:-mt-80 animate-pulse"></div>
                <div className="relative flex-shrink-0">
                    <div className="absolute inset-0 bg-brand-primary rounded-full blur-2xl sm:blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative bg-neutral-900/60 backdrop-blur-3xl p-1 w-24 h-24 sm:w-40 sm:h-40 rounded-full border border-white/20 shadow-2xl flex items-center justify-center transform group-hover:scale-105 transition-transform duration-700 overflow-hidden">
                        <img src={LOGO_URL} alt="Goatify Logo" className="w-14 h-14 sm:w-24 sm:h-24 object-contain animate-glow drop-shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
                    </div>
                </div>
                <div className="flex-1 text-center md:text-left space-y-4 sm:space-y-6">
                    <div className="inline-block px-3 py-1 bg-brand-primary/20 border border-brand-primary/30 text-brand-accent font-black text-[8px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.3em] rounded-full shadow-lg">Programa de Liderazgo de Élite</div>
                    <h2 className="text-3xl sm:text-6xl font-black text-white leading-tight sm:leading-[0.9] tracking-tighter">Buscamos a los 5 <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-purple-400">Líderes de Equipo</span></h2>
                    <p className="text-sm sm:text-xl text-neutral-400 max-w-2xl leading-relaxed font-medium">
                        Si eres un socio con visión de escala, esta es tu oportunidad definitiva. Recibirás un <span className="text-brand-accent font-black">10% de comisión de POR VIDA</span> sobre la facturación de todo tu equipo.
                    </p>
                    <div className="flex flex-wrap gap-3 pt-2 justify-center md:justify-start">
                        <Button onClick={handleApply} className="bg-white text-black hover:bg-neutral-100 border-none px-6 sm:px-10 py-3 sm:py-4 font-black text-sm sm:text-base shadow-2xl rounded-xl sm:rounded-2xl transform active:scale-[0.95] transition-all">
                            {isPaid ? "Aplicar a Plaza de Líder" : "Activar Premium Gratis"}
                        </Button>
                        <div className="flex items-center gap-2 text-white font-bold text-[10px] sm:text-sm bg-white/5 px-4 sm:px-5 py-2 rounded-xl sm:rounded-2xl border border-white/10 backdrop-blur-md">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span> 3 Plazas Disponibles
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

const PartnerAgreementModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { userProfile, setToastNotification } = useContext(AppContext);

    const handleDownloadPdf = () => {
        setToastNotification({ title: "Generando Convenio", message: "Preparando documento de alta fidelidad...", icon: 'upload', isLoading: true });
        try {
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const margin = 20;
            let y: number = 30;
            doc.setFillColor(15, 23, 42); 
            doc.rect(0, 0, 210, 18, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.setTextColor(17, 24, 39);
            doc.text("CONVENIO MAESTRO DE ALIANZA ESTRATÉGICA", margin, y);
            y += 10;
            doc.setFontSize(9);
            doc.setTextColor(107, 114, 128);
            doc.text(`ID DE CONVENIO: GTFY-PARTNER-${userProfile.uid.slice(0, 8).toUpperCase()}`, margin, y);
            doc.text(`VIGENCIA: INDEFINIDA`, 190, y, { align: 'right' });
            y += 15;
            doc.setDrawColor(76, 29, 149); 
            doc.setLineWidth(1);
            doc.line(margin, y, 190, y);
            y += 12;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10.5);
            doc.setTextColor(55, 65, 81);
            const fullName = `${userProfile.name} ${userProfile.lastName || ''}`.trim().toUpperCase();
            const introText = `El presente instrumento constituye un acuerdo vinculante de colaboración comercial y tecnológica celebrado entre GOATIFY IA SOLUTIONS (en adelante "LA EMPRESA"), unidad de negocio estratégica de CIE S.A.S. con RUC 1793199203001, y ${fullName} (en adelante "EL SOCIO ESTRATÉGICO"). Ambas partes, con plena capacidad legal para obligarse, suscriben las siguientes cláusulas que regirán la alianza para la expansión de soluciones de Inteligencia Artificial:`;
            const splitIntro = doc.splitTextToSize(introText, 170);
            doc.text(splitIntro, margin, y);
            y += (splitIntro.length * 6);

            const clauses = [
                { t: "CLÁUSULA PRIMERA: OBJETO DEL CONVENIO", c: "El presente acuerdo tiene como fin establecer las bases de una colaboración profesional donde EL SOCIO actúa como enlace comercial y facilitador de soluciones tecnológicas basadas en IA desarrolladas por LA EMPRESA. LA EMPRESA otorga al socio el derecho no exclusivo de comercializar su portafolio de servicios de consultoría, desarrollo de software e implementación de agentes inteligentes." },
                { t: "CLÁUSULA SEGUNDA: NATURALEZA DE LA RELACIÓN", c: "Se establece de forma expresa que la relación entre las partes es estrictamente comercial y de carácter independiente. Este convenio no constituye, bajo ninguna circunstancia, contrato de trabajo, relación de dependencia laboral, mandato o representación legal plena. EL SOCIO asume todos sus riesgos operativos, tributarios y de seguridad social de manera autónoma." },
                { t: "CLÁUSULA TERCERA: RÉGIMEN ECONÓMICO Y COMISIONES", c: "LA EMPRESA reconocerá a EL SOCIO una comisión variable entre el 30% y el 40% (según el catálogo de servicios vigente) sobre el valor NETO efectivamente cobrado al cliente. Las comisiones se liquidarán una vez que el cliente haya realizado el abono total o parcial correspondiente. En proyectos de pago fraccionado (50/50), la comisión se liberará proporcionalmente a cada ingreso recibido." },
                { t: "CLÁUSULA QUARTA: SUSCRIPCIONES Y CARGOS MENSUALES", c: "Para servicios que impliquen mantenimiento, hosting o entrenamiento continuo de IA, el cliente final realizará pagos mensuales de suscripción. La comisión inicial del socio se calcula sobre el primer despliegue. LA EMPRESA se reserva el derecho de incentivar al socio por la retención de estos clientes recurrentes mediante bonos especiales definidos en el portal de socios." },
                { t: "CLÁUSULA SEXTA: DESCUENTOS Y VALORES AGREGADOS", c: "EL SOCIO está facultado para ofrecer, bajo el respaldo de la marca, un 15% de descuento directo, la 'Guía de Monetización IA' y sesiones de capacitación gratuitas. Estos beneficios son las herramientas de cierre primarias y no pueden ser modificadas ni aumentadas sin autorización." },
                { t: "CLÁUSULA SÉPTIMA: CONFIDENCIALIDAD (NDA)", c: "EL SOCIO se obliga a no revelar, transferir ni utilizar en beneficio propio o de terceros cualquier información técnica, comercial, tarifaria o de arquitectura de software que LA EMPRESA ponga a su disposición. Esta obligación se mantiene vigente por un periodo de cinco (5) años tras la terminación de este convenio." },
                { t: "CLÁUSULA OCTAVA: PROPIEDAD INTELECTUAL", c: "Todo el código fuente, motores de IA, configuraciones de agentes y metodologías comerciales son propiedad intelectual exclusiva de LA EMPRESA. EL SOCIO tiene prohibido replicar, copiar o descompilar las herramientas para fines ajenos a este convenio. EL SOCIO podrá usar el logo y marca 'Goatify Partners' solo en materiales aprobados." },
                { t: "CLÁUSULA NOVENA: ÉTICA PROFESIONAL", c: "EL SOCIO debe actuar con transparencia, integridad y respeto hacia los clientes. Queda terminantemente prohibido realizar promesas técnicas imposibles o falsificar capacidades de los modelos de IA de LA EMPRESA. Cualquier mala práctica comercial resultará en la rescisión inmediata del convenio." },
                { t: "CLÁUSULA DÉCIMA: INDEMNIDAD", c: "EL SOCIO mantendrá indemne a LA EMPRESA de cualquier recomendación, demanda o sanción derivada de sus propios actos, omisiones o mala gestión comercial frente al cliente final. LA EMPRESA no es responsable por deudas o compromisos adquiridos por el socio ante terceros." },
                { t: "CLÁUSULA DÉCIMA PRIMERA: VIGENCIA Y RESCISIÓN", c: "El presente convenio entra en vigor al momento de la aceptación digital y tiene vigencia indefinida. Cualquiera de las partes puede darlo por terminado notificando por vía electrónica con al menos 15 días de antelación. Las comisiones pendientes de leads en proceso de cierre se respetarán hasta 30 días después del cierre de la cuenta." },
                { t: "CLÁUSULA DÉCIMA SEGUNDA: SOPORTE Y CAPACITACIÓN", c: "LA EMPRESA proveerá al socio acceso a la 'Elite Academy' y materiales de soporte técnico. No obstante, LA EMPRESA es la única encargada del desarrollo final y despliegue de las soluciones, reservándose la facultad de aprobar o rechazar proyectos por viabilidad técnica." },
                { t: "CLÁUSULA DÉCIMA TERCERA: ACTUALIZACIÓN DE TARIFAS", c: "LA EMPRESA podrá ajustar los precios del catálogo y los porcentajes de comisión de acuerdo a las fluctuaciones del mercado tecnológico global, notificando a través del portal de socios con 7 días de antelación." },
                { t: "CLÁUSULA DÉCIMA CUARTA: LEY APLICABLE", c: "Este convenio se rige por las leyes mercantiles de la República del Ecuador. Cualquier duda se resolverá mediante mediación en el Centro de Arbitraje de la Cámara de Comercio de Quito. Para socios fuera de Ecuador, se aceptan principios de arbitraje comercial internacional." },
                { t: "CLÁUSULA DÉCIMA QUINTA: ACUERDO INTEGRAL", c: "Este documento sustituye cualquier acuerdo previo, oral o escrito, entre las partes. Ninguna modificación será válida a menos que sea notificada y aceptada digitalmente a través de la plataforma Goatify." },
                { t: "CLÁUSULA SÉPTIMA: EXCLUSIVIDAD LIMITADA", c: "EL SOCIO puede comercializar otros servicios, siempre que no compitan directamente con las arquitecturas propias de Goatify ni utilicen su know-how. El conflicto de intereses será causa de terminación inmediata." },
                { t: "CLÁUSULA DÉCIMA OCTAVA: PROTECCIÓN DE DATOS", c: "Ambas partes cumplirán con las leyes de protección de datos personales. EL SOCIO solo recopilará datos de clientes bajo consentimiento y con el único fin de procesar la venta en Goatify." },
                { t: "CLÁUSULA DÉCIMA NOVENA: FUERZA MAYOR", c: "Ninguna de las partes será responsable por demoras o fallos en el cumplimiento de sus obligaciones resultantes de causas fuera de su control razonable, incluyendo fallos masivos en infraestructuras de terceros (Cloud Providers)." },
                { t: "CLÁUSULA VIGÉSIMA: ACEPTACIÓN DIGITAL", c: "La activación del perfil de socio y el uso continuo de la plataforma constituyen la firma digital de este convenio, aceptando todas sus partes de forma voluntaria y consciente." }
            ];

            clauses.forEach(clause => {
                if (y > 245) { doc.addPage(); y = 25; }
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.setTextColor(76, 29, 149);
                doc.text(clause.t, margin, y);
                y += 6;
                doc.setFont("helvetica", "normal");
                doc.setFontSize(9.5);
                doc.setTextColor(55, 65, 81);
                const splitC = doc.splitTextToSize(clause.c, 170);
                doc.text(splitC, margin, y);
                y += (splitC.length * 5) + 6;
            });

            y += 15;
            if (y > 250) { doc.addPage(); y = 25; }
            doc.setDrawColor(229, 231, 235);
            doc.line(margin, y, 190, y);
            y += 15;
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(17, 24, 39);
            doc.text("POR LA EMPRESA", margin, y);
            doc.text("POR EL SOCIO", 120, y);
            y += 12;
            doc.setFontSize(9);
            doc.setTextColor(55, 65, 81);
            doc.text("GOATIFY IA (CIE S.A.S)", margin, y);
            doc.text(fullName, 120, y);
            y += 5;
            doc.setFont("helvetica", "italic");
            doc.setFontSize(8);
            doc.text("Validado Digitalmente vía App", margin, y);
            doc.text(`HASH: ${btoa(userProfile.uid).slice(0, 16)}`, 120, y);
            
            doc.save(`Contrato_Maestro_Goatify_${userProfile.name.replace(/\s+/g, '_')}.pdf`);
            setToastNotification({ title: "Documento Listo", message: "Se ha descargado el contrato íntegro de 20 cláusulas.", icon: 'check' });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "Error renderizando PDF legal.", icon: 'close' });
        }
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Convenio de Alianza Estratégica" className="max-w-4xl h-[85vh]">
            <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar p-1">
                <div className="text-center pb-8 border-b border-neutral-100 dark:border-neutral-800">
                    <img src={LOGO_URL} alt="Goatify" className="h-20 mx-auto mb-6 drop-shadow-xl" />
                    <h3 className="text-3xl font-black text-brand-primary uppercase tracking-tighter">Certificado Socio de Élite</h3>
                    <p className="text-[10px] text-neutral-400 uppercase font-black tracking-[0.4em] mt-2">Acuerdo de Cooperación Tecnológica v2.5</p>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-900/50 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800">
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
                        Este convenio regula la relación profesional estratégica entre <span className="font-bold text-neutral-900 dark:text-white">Goatify IA (CIE S.A.S)</span> y el Socio Estratégico. Al aceptar, te integras a la expansión tecnológica más importante de la región bajo un marco legal blindado de 20 cláusulas operativas.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h4 className="font-black text-brand-primary flex items-center gap-2 uppercase text-xs border-b pb-2">Garantías Corporativas</h4>
                        <ul className="space-y-3 text-xs text-neutral-600 dark:text-neutral-400">
                            <li className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0"/> <span>Suministro de infraestructura de IA de última generación.</span></li>
                            <li className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0"/> <span>Cierre comercial profesional asistido por nuestro equipo directivo.</span></li>
                            <li className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0"/> <span>Liquidación inmediata de comisiones tras validación de pago.</span></li>
                            <li className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0"/> <span>Capacitación en neuro-ventas y herramientas disruptivas.</span></li>
                        </ul>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-black text-purple-600 flex items-center gap-2 uppercase text-xs border-b pb-2">Compromisos del Socio</h4>
                        <ul className="space-y-3 text-xs text-neutral-600 dark:text-neutral-400">
                            <li className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0"/> <span>Registro veraz de prospectos en el CRM oficial.</span></li>
                            <li className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0"/> <span>Protección estricta de secretos comerciales y arquitectura IA.</span></li>
                            <li className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0"/> <span>Gestión proactiva del agendamiento y seguimiento inicial.</span></li>
                            <li className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0"/> <span>Independencia operativa total sin subordinación laboral.</span></li>
                        </ul>
                    </div>
                </div>
                <div className="bg-brand-primary/5 p-6 rounded-3xl border-2 border-dashed border-brand-primary/20">
                    <h4 className="font-black text-brand-primary uppercase text-sm mb-4 flex items-center gap-2">
                        <Icon name="wallet" className="w-5 h-5"/> Liquidación de Comisiones
                    </h4>
                    <div className="space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-blue-100 rounded-xl flex-shrink-0"><Icon name="discover" className="text-blue-600 w-5 h-5"/></div>
                            <div>
                                <p className="font-black text-sm text-neutral-800 dark:text-white uppercase">PayPal (Global)</p>
                                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">Recibes tus ganancias de forma automática y segura en USD apenas el cliente formaliza su proyecto.</p>
                            </div>
                        </div>
                        {userProfile.country === 'Ecuador' && (
                            <div className="flex items-start gap-4 pt-4 border-t border-brand-primary/10">
                                <div className="p-3 bg-emerald-100 rounded-xl flex-shrink-0"><Icon name="market" className="text-emerald-600 w-5 h-5"/></div>
                               <div>
                                    <p className="font-black text-sm text-neutral-800 dark:text-white uppercase">Transferencia Bancaria Directa (Ecuador)</p>
                                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
                                        Banco Bolivariano - Cta. Corriente: 5015025433 - CIE S.A.S. RUC: 1793199203001.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 sticky bottom-0 bg-white dark:bg-dark-surface py-4 mt-auto">
                    <button onClick={handleDownloadPdf} className="flex-1 sm:flex-none border-2 border-brand-primary text-brand-primary font-black uppercase text-[10px] tracking-widest bg-transparent rounded-xl px-8 py-3 flex items-center justify-center gap-2">
                        <Icon name="upload" className="w-4 h-4"/> Descargar Contrato de 20 Cláusulas
                    </button>
                    <Button onClick={onClose} className="px-10 py-3 shadow-xl font-black uppercase text-[10px] tracking-widest">Aceptar Alianza</Button>
                </div>
            </div>
        </Modal>
    );
};

const EarningsSimulator: React.FC = () => {
    const { userProfile } = useContext(AppContext);
    const [counts, setCounts] = useState<Record<string, number>>({
        web_smart_pro: 2, bot_prof: 4, custom_app: 1, calls_system: 2, branding: 3, consulting: 5, social_auto: 2, video_promo: 2, academy_monthly: 2, academy_semestral: 1
    });
    const updateCount = (id: string, delta: number) => {
        setCounts(prev => {
            const current = prev[id] || 0;
            const newVal = Math.max(0, current + delta);
            return { ...prev, [id]: newVal };
        });
    };
    const totals = useMemo(() => {
        let monthly = 0;
        commissionData.forEach(svc => {
            const count = counts[svc.id] || 0;
            const commVal = (svc.price * (parseInt(svc.commission)/100)) * count;
            monthly += commVal;
        });
        const annualBonus = 6200;
        const commissionsAnnual = monthly * 12;
        return { monthly, annual: commissionsAnnual + annualBonus };
    }, [counts]);
    
    const SimulatorRow = ({ svc }: any) => (
        <div className="space-y-1.5 bg-neutral-50 dark:bg-neutral-900/50 p-2.5 sm:p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm flex flex-col justify-center">
            <div className="flex justify-between items-center px-0.5">
                <div className="flex flex-col min-w-0 max-w-[60%]">
                    <label className="text-[8px] sm:text-[10px] font-black text-neutral-800 dark:text-neutral-200 uppercase tracking-widest truncate">{svc.service}</label>
                    <span className="text-[7px] sm:text-[8px] text-brand-primary font-bold uppercase">{svc.commission}</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3">
                     <button onClick={() => updateCount(svc.id, -1)} className="p-1.5 sm:p-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:text-red-500 transition-colors shadow-sm"><Icon name="minus" className="w-2.5 h-2.5 sm:w-3.5 h-3.5"/></button>
                     <span className="font-black text-xs sm:text-base text-brand-primary w-4 sm:w-6 text-center">{counts[svc.id] || 0}</span>
                     <button onClick={() => updateCount(svc.id, 1)} className="p-1.5 sm:p-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:text-brand-primary transition-colors shadow-sm"><Icon name="plus" className="w-2.5 h-2.5 sm:w-3.5 h-3.5"/></button>
                </div>
            </div>
        </div>
    );

    return (
        <Card className="p-5 sm:p-10 bg-white dark:bg-dark-surface border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden relative rounded-[2rem] sm:rounded-[2.5rem]">
            <h3 className="text-base sm:text-xl font-black mb-6 sm:mb-8 flex items-center gap-2 text-neutral-800 dark:text-white">
                <Icon name="chart" className="w-6 h-6 sm:w-8 sm:h-8 text-brand-primary"/> Escenario de Ganancias
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-10">
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-4 h-fit">
                    {commissionData.filter(s => !s.isCustom && ['web_smart_pro', 'bot_prof', 'custom_app', 'calls_system', 'branding', 'consulting', 'social_auto', 'video_promo', 'academy_monthly', 'academy_semestral'].includes(s.id)).map(svc => (
                        <SimulatorRow key={svc.id} svc={svc} />
                    ))}
                </div>
                <div className="p-6 sm:p-8 bg-neutral-900 rounded-[2rem] sm:rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden flex flex-col justify-center text-center">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 rounded-full blur-[80px] text-white"></div>
                    <div className="relative z-10">
                        <p className="text-[8px] sm:text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1.5 sm:mb-2">Comisión Bruta Mensual</p>
                        <p className="text-2xl sm:text-4xl font-black text-white leading-none mb-2">{convertAndFormatCurrency(totals.monthly, userProfile.currency || 'USD')}</p>
                        <div className="h-px bg-white/10 w-16 sm:w-20 mx-auto my-4 sm:my-5"></div>
                        <p className="text-[8px] sm:text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1">Ingreso Anual (Comisiones + Bonos)</p>
                        <p className="text-lg sm:text-3xl font-black text-brand-accent tracking-tighter">{convertAndFormatCurrency(totals.annual, userProfile.currency || 'USD')}</p>
                        <p className="text-[8px] sm:text-[9px] text-neutral-500 mt-3 font-bold">Incluye $6,200 USD en bonos proyectados.</p>
                    </div>
                </div>
            </div>
        </Card>
    );
};

const LeadDocPreviewModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    lead: PartnerLead | null;
    title: string;
    docType: any; 
    generateFn: (lead: PartnerLead) => Promise<string>;
    initialContent?: string;
}> = ({ isOpen, onClose, lead, title, docType, generateFn, initialContent }) => {
    const { setToastNotification, updatePartnerLead, userProfile, createNotification, currentUser } = useContext(AppContext);
    const [content, setContent] = useState<string>('');
    const [savedContent, setSavedContent] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [isEditingDoc, setIsEditingDoc] = useState(true);
    
    useEffect(() => { 
        if (isOpen && lead) {
            const existing = initialContent || lead[docType as keyof PartnerLead];
            if (existing && typeof existing === 'string') {
                setContent(existing);
                setSavedContent(existing);
            } else {
                setContent('');
                setSavedContent('');
            }
        }
    }, [isOpen, lead, docType, initialContent]);
    
    const handleGenerate = async () => {
        if (!lead || !currentUser) return;
        setLoading(true);
        createNotification(currentUser.uid, {
            type: 'general',
            text: `🛠️ **Goatify Docs**: Generando **${title}** en segundo plano para ${lead.clientName}.`,
            fromUser: { uid: 'system_docs', name: 'Goatify Docs', avatarUrl: null }
        });

        try {
            const res = await generateFn(lead);
            setContent(res);
            setToastNotification({ title: "Borrador Generado", message: "Fíjalo para guardar cambios.", icon: "ai" });
        } catch (e) { 
            setToastNotification({ title: "Error", message: "Motor comercial ocupado.", icon: 'close' }); 
        } finally { setLoading(false); }
    };

    const handleSaveDoc = async () => {
        if (!lead) return;
        try {
            setLoading(true);
            const updates: any = { 
                [docType]: content,
                clientSiteUrl: null 
            };
            if (docType === 'proposalText') updates.hasProposal = true;
            if (docType.includes('preInvoice')) updates.hasPrefactura = true;
            if (docType.includes('contract')) updates.hasContrato = true;
            
            await updatePartnerLead(lead.id, updates);
            setSavedContent(content);
            setToastNotification({ title: "Documento Fijado", message: "Ahora es parte del expediente oficial.", icon: "check" });
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const generatePDFManual = async (docTitle: string) => {
        if (!lead) return;
        const element = document.getElementById('partner-doc-editor-content');
        if (!element) {
             setToastNotification({ title: "Error", message: "No se encontró el contenido para generar PDF.", icon: 'close' });
             return;
        }

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile) {
            window.print();
            return;
        }

        const opt = {
            margin: 10,
            filename: `${lead.clientName.replace(/\s+/g, '_')}_${docTitle.replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        try {
            // @ts-ignore
            await html2pdf().set(opt).from(element).save();
            setToastNotification({ title: "PDF Generado", message: "Documento listo para enviar.", icon: 'check' });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "Error generando PDF.", icon: 'close' });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-[95vw] lg:max-w-6xl h-[95vh]" noPadding>
            <div className="flex flex-col h-full bg-white dark:bg-[#050505] overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between items-center p-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 gap-2 flex-none z-20 shadow-sm">
                    <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg w-full sm:w-auto">
                        <button onClick={() => setIsEditingDoc(false)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${!isEditingDoc ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'}`}><Icon name="image" className="w-3 h-3 inline mr-1.5"/> Formato</button>
                        <button onClick={() => setIsEditingDoc(true)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${isEditingDoc ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'}`}><Icon name="edit" className="w-3 h-3 inline mr-1.5"/> Editar</button>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
                         <Button onClick={handleGenerate} disabled={loading} variant="secondary" className="flex-1 sm:flex-none border-brand-primary/30 h-8 text-[9px] font-black uppercase tracking-widest text-black bg-white hover:bg-neutral-50 px-3">
                            {loading ? <Spinner className="!w-3 !h-3 !p-0" /> : <><Icon name="sync" className="w-3 h-3 text-black"/> {content ? "Regenerar IA" : "Generar con IA"}</>}
                         </Button>
                         <Button onClick={() => generatePDFManual(title)} variant="secondary" className="flex-1 sm:flex-none border-neutral-300 h-8 text-[9px] font-black uppercase tracking-widest px-3"><Icon name="upload" className="w-3 h-3"/> PDF</Button>
                         <Button onClick={handleSaveDoc} disabled={loading} className={`flex-1 sm:flex-none px-4 border-none shadow-lg h-8 text-[9px] font-black uppercase tracking-widest ${(savedContent && content === savedContent) ? 'bg-green-100 text-green-700' : 'bg-brand-primary text-white'}`}>
                            {(savedContent && content === savedContent) ? <><Icon name="check" className="w-3 h-3"/> Guardado</> : savedContent ? "Volver a guardar" : "Fijar Documento"}
                         </Button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center bg-white dark:bg-neutral-900 p-2 sm:p-6">
                    <div id="partner-doc-editor-content" className={`w-full max-w-4xl bg-white text-black p-4 sm:p-10 transition-all mx-auto ${isEditingDoc ? 'ring-1 ring-brand-primary/20 rounded' : 'rounded'}`}>
                        {isEditingDoc ? (
                            <Textarea 
                                value={content} 
                                onChange={e => setContent(e.target.value)}
                                className="w-full h-full font-mono text-sm leading-relaxed bg-transparent border-none focus:ring-0 p-0 !mt-0 min-h-[50vh] text-left"
                                placeholder="Edita el contenido aquí..."
                            />
                        ) : (
                            <div className="prose prose-sm sm:prose-lg max-w-none text-justify font-sans leading-relaxed">
                                <ChatMessageRenderer text={content} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const SalesClosingTool: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { projects, updateProject, addHubPost, setToastNotification, language } = useContext(AppContext);
    const [selectedService, setSelectedService] = useState(commissionData[0].service);
    const [targetPersona, setTargetPersona] = useState('Dueño de Pyme preocupado por los costos');
    const [script, setScript] = useState('');
    const [loading, setLoading] = useState(false);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
    const [isSavingToProject, setIsSavingToProject] = useState(false);
    const handleGenerate = async () => {
        setLoading(true); setScript('');
        try { const res = await generateSalesClosingScript(selectedService, targetPersona); setScript(res); } catch (e) { setScript("Error generando guion de ventas."); } finally { setLoading(false); }
    };
    const handleSaveToProject = async () => {
        if (!script || !targetProjectId) return;
        setIsSavingToProject(true);
        const project = projects.find(p => p.id === targetProjectId);
        if (project) {
            const newNote = { id: `pitch-${Date.now()}`, title: `Pitch: ${selectedService}`, content: script, createdAt: new Date().toISOString() };
            const updatedNotes = [newNote, ...(project.notes || [])];
            await updateProject(project.id, { notes: updatedNotes });
            setToastNotification({ title: "Guardado", message: "Guion guardado en el proyecto.", icon: 'check' });
        }
        setIsSavingToProject(false);
    };
    const handleDownloadPdf = () => {
        if (!script) return;
        const docPDF = new jsPDF(); docPDF.setFontSize(18); docPDF.text(`Pitch de Ventas: ${selectedService}`, 20, 20); docPDF.setFontSize(10); const splitText = docPDF.splitTextToSize(script, 170); docPDF.text(splitText, 20, 30); docPDF.save(`Pitch_${selectedService.replace(/\s+/g, '_')}.pdf`);
    };
    const handlePostToFeed = async () => {
        if (!script) return;
        const feedContent = `💡 **Técnica de Persuasión 2026: ${selectedService}**\n\n${script.substring(0, 300)}...\n\n[Ver guion completo en Socios](#partners)`;
        await addHubPost(feedContent);
        setToastNotification({ title: "Publicado", message: "Técnica compartida con la comunidad.", icon: "hub" });
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Herramientas de Cierre 2026" className="max-w-4xl h-[90vh] flex flex-col">
            <div className="space-y-6 flex-1 overflow-y-auto p-1 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-neutral-400 uppercase block mb-1">Producto / Servicio</label>
                        <select value={selectedService} onChange={e => setSelectedService(e.target.value)} className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-brand-primary" > {commissionData.map(s => <option key={s.id} value={s.service}>{s.service}</option>)} </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-neutral-400 uppercase block mb-1">Perfil del Prospecto</label>
                        <Input value={targetPersona} onChange={e => setTargetPersona(e.target.value)} placeholder="Ej: Dueño de restaurante escéptico..." />
                    </div>
                </div>
                <button onClick={handleGenerate} disabled={loading} className="w-full py-4 bg-gradient-to-r from-brand-primary to-purple-600 text-white font-black text-lg shadow-xl shadow-brand-primary/20 transform hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3"> {loading ? <Spinner className="text-white" text="Generando Pitch..." /> : <><Icon name="ai" className="w-6 h-6"/> Generar Pitch de Venta Inmediato</>} </button>
                {script && (
                    <div className="animate-fade-in space-y-4">
                        <div className="p-6 bg-white dark:bg-neutral-800 rounded-3xl border-2 border-brand-primary/20 shadow-inner">
                            <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap"> {script.split('\n').map((line, i) => ( <p key={i} className={`mb-3 ${line.toUpperCase() === line && line.length > 5 ? 'font-black text-brand-primary mt-6 border-b pb-1 text-base' : ''}`}>{line}</p> ))} </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-neutral-50 dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                             <div className="space-y-2">
                                <label className="text-[10px] font-black text-neutral-400 uppercase">Enviar a Proyecto</label>
                                <div className="flex gap-2">
                                    <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="flex-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs px-3 focus:ring-2 focus:ring-brand-primary outline-none h-10"> {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)} </select>
                                    <button onClick={handleSaveToProject} disabled={isSavingToProject} className="w-10 h-10 bg-brand-primary text-white rounded-xl flex items-center justify-center hover:bg-brand-secondary transition-colors"><Icon name="send" className="w-4 h-4"/></button>
                                </div>
                            </div>
                            <div className="flex items-end gap-2">
                                <Button onClick={handleDownloadPdf} variant="secondary" className="flex-1 h-10 text-[10px] font-black"><Icon name="upload" className="w-4 h-4"/> PDF</Button>
                                <Button onClick={handlePostToFeed} variant="secondary" className="flex-1 h-10 text-[10px] font-black"><Icon name="hub" className="w-3 h-3"/> FEED</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

const ManualOperativoModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const steps = [
        { title: "Identificar y Registrar", desc: "Localiza dueños de negocio o profesionales que necesiten automatizar procesos. Regístralos en tu CRM de Socios. Es vital incluir RUC/ID Fiscal para que los documentos legales se generen con total validez." },
        { title: "Ofrecer Beneficios Exclusivos", desc: "Tu mayor ventaja es tu código de socio. Al usarlo, el cliente recibe un 15% DE DESCUENTO directo, la Guía de Monetización IA (valorada en $47) y una Capacitación técnica sin costo. Esto facilita el interés inmediato." },
        { title: "Prefactura Digital Inmediata", desc: "Genera y descarga la prefactura directamente desde tu CRM. El valor con el descuento aplicado aparecerá automáticamente. Envíala al cliente para formalizar el interés económico." },
        { title: "Agendar Cierre Profesional", desc: "Usa el botón de 'Agendar Cierre'. Esto te permite coordinar una reunión 1 a 1 entre el cliente y nuestro equipo experto. Nosotros realizamos la demo técnica y cerramos el contrato por ti." },
        { title: "Firma y Anticipo", desc: "Una vez aceptada la propuesta, descarga el Contrato Maestro de Servicios (Múltiples cláusulas legales). El cliente firma digitalmente y paga el 50% de anticipo. En ese momento el proyecto se activa." },
        { title: "Cobro de Comisiones", desc: "Recibirás una notificación apenas se valide el pago. El 50% de tu comisión se libera con el anticipo y el otro 50% con el pago final. Puedes ver tu saldo acumulado en tiempo real." }
    ];
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manual Maestro del Socio" className="max-w-3xl">
            <div className="space-y-6 p-2">
                <div className="bg-brand-primary/5 p-5 rounded-2xl border-2 border-brand-primary/20 mb-4">
                    <p className="text-sm font-bold text-brand-primary mb-1">Estrategia de Éxito:</p>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed font-bold text-justify">
                        No necesitas ser un experto técnico en IA. Tu labor estratégica es detectar la necesidad, registrar al prospecto y agendar la reunión de cierre. Nosotros aportamos el respaldo tecnológico masivo y el cierre profesional de alta conversión. Mientras otros buscan empleo, tú estás construyendo un imperio digital.
                    </p>
                </div>
                <div className="space-y-4">
                    {steps.map((s, i) => (
                        <div key={i} className="flex gap-4 p-4 bg-white dark:bg-neutral-800/30 rounded-2xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
                            <div className="flex-shrink-0 w-10 h-10 bg-brand-primary text-white rounded-xl flex items-center justify-center font-black text-lg shadow-lg">{i + 1}</div>
                            <div>
                                <h4 className="font-bold text-base text-neutral-900 dark:text-white">{s.title}</h4>
                                <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{s.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <Button onClick={onClose} className="w-full py-4 mt-4 font-black shadow-xl">¡Comenzar a Expandir!</Button>
            </div>
        </Modal>
    );
};

const LeadManagement: React.FC = () => {
    const { userProfile, addPartnerLead, allLeads, updatePartnerLead, setToastNotification, projects, isSuperAdmin, currentUser, allUsers, sendDirectMessage, setActiveHubView, setCurrentView, setDeepLinkTarget, createNotification, setMailDraft } = useContext(AppContext);
    const { scheduleMeeting } = useContext(CallContext);
    
    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [selectedLead, setSelectedLead] = useState<PartnerLead | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [clientName, setClientName] = useState('');
    const [clientRepresentative, setClientRepresentative] = useState('');
    const [clientTaxId, setClientTaxId] = useState('');
    const [projectFormalName, setProjectFormalName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [selectedServices, setSelectedServices] = useState<Record<string, number>>({});
    const [extraDevValue, setExtraDevValue] = useState('');
    const [extraDevName, setExtraDevName] = useState('');
    const [estimatedDays, setEstimatedDays] = useState('7');
    const [taxPercentage, setTaxPercentage] = useState(15);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [isGeneratingSite, setIsGeneratingSite] = useState<string | null>(null);

    const [customServices, setCustomServices] = useState<{name: string, value: string, isMonthly: boolean}[]>([]);
    const [newServiceName, setNewServiceName] = useState("");
    const [newServiceValue, setNewServiceValue] = useState("");
    const [newServiceIsMonthly, setNewServiceIsMonthly] = useState(false);

    const addCustomService = () => {
        if (!newServiceName.trim() || !newServiceValue) return;
        setCustomServices([...customServices, { name: newServiceName, value: newServiceValue, isMonthly: newServiceIsMonthly }]);
        setNewServiceName("");
        setNewServiceValue("");
        setNewServiceIsMonthly(false);
    };
    const removeCustomService = (index: number) => {
        setCustomServices(customServices.filter((_, i) => i !== index));
    };

    const [docPreview, setDocPreview] = useState<{ 
        lead: PartnerLead; 
        title: string; 
        docType: any; 
        generateFn: (lead: PartnerLead) => Promise<string>;
        initialContent?: string;
    } | null>(null);

    const [isSchedulingMeeting, setIsSchedulingMeeting] = useState<PartnerLead | null>(null);
    const [meetingDate, setMeetingDate] = useState('');
    const [meetingTime, setMeetingTime] = useState('');
    const [meetingNotes, setMeetingNotes] = useState('');
    const [isSavingMeeting, setIsSavingMeeting] = useState(false);
    
    const updateServiceQuantity = (id: string, delta: number) => { 
        const svc = commissionData.find(s => s.id === id);
        if (!svc) return;

        setSelectedServices(prev => { 
            const currentQty = prev[id] || 0; 
            let newQty = Math.max(0, currentQty + delta); 

            if (((svc as any).isMonthly || (svc as any).isSemestral || (svc as any).isAnnual) && newQty > 1) {
                newQty = 1;
            }

            if (id === 'academy_monthly' && newQty > 0) {
                 const { academy_semestral, ...rest } = prev;
                 return { ...rest, [id]: 1 };
            }
            if (id === 'academy_semestral' && newQty > 0) {
                 const { academy_monthly, ...rest } = prev;
                 return { ...rest, [id]: 1 };
            }

            if (id === 'bot_elite' && newQty > 0) {
                 const { bot_prof, ...rest } = prev;
                 return { ...rest, [id]: newQty };
            }
            if (id === 'bot_prof' && newQty > 0 && prev['bot_elite']) {
                setToastNotification({ title: "Aviso", message: "Ya tienes seleccionado el Bot Elite.", icon: 'info' });
                return prev;
            }

            if (newQty === 0) { 
                const { [id]: _, ...rest } = prev; 
                return rest; 
            } 
            return { ...prev, [id]: newQty }; 
        }); 
    };
    
    const calculatedTotal = useMemo(() => { 
        let total = 0; 
        Object.entries(selectedServices).forEach(([id, qty]) => { 
            const svc = commissionData.find(s => s.id === id); 
            if (svc && svc.price) { total += svc.price * (qty as number); } 
        }); 
        total += (parseFloat(extraDevValue) || 0);
        customServices.forEach(s => total += (parseFloat(s.value) || 0));
        return total; 
    }, [selectedServices, extraDevValue, customServices]);

    const handleOpenAdd = () => { 
        setIsEditMode(false); 
        setSelectedLead(null); 
        setClientName(''); 
        setClientRepresentative(''); 
        setClientTaxId(''); 
        setProjectFormalName(''); 
        setClientPhone('');
        setClientEmail(''); 
        setSelectedServices({}); 
        setExtraDevValue(''); 
        setExtraDevName(''); 
        setNotes(''); 
        setEstimatedDays('7'); 
        setTaxPercentage(15); 
        setCustomServices([]);
        setNewServiceName("");
        setNewServiceValue("");
        setNewServiceIsMonthly(false);
        setAddModalOpen(true); 
    };
    
    const handleOpenEdit = (lead: PartnerLead) => { 
        setIsEditMode(true); 
        setSelectedLead(lead); 
        setClientName(lead.clientName); 
        setClientRepresentative(lead.clientRepresentative || ''); 
        setClientTaxId(lead.clientTaxId || ''); 
        setProjectFormalName(lead.projectFormalName || ''); 
        setClientPhone(lead.clientContact?.split(' | ')[0] || lead.clientContact || '');
        setClientEmail(lead.clientContact?.split(' | ')[1] || ''); 
        setNotes(lead.notes); 
        setExtraDevValue(String(lead.extraDevValue || '')); 
        setExtraDevName(lead.extraDevName || ''); 
        setEstimatedDays(String(lead.estimatedDays || '7')); 
        setTaxPercentage(lead.taxPercentage || 15);
        setCustomServices(lead.customServices || []);
        const initialQtys: Record<string, number> = {}; 
        commissionData.forEach(s => { if (lead.serviceType.includes(s.service)) initialQtys[s.id] = 1; }); 
        setSelectedServices(initialQtys); 
        setAddModalOpen(true); 
    };

    const handleOpenDocPreview = (lead: PartnerLead, type: any, title: string, genFn: (l: PartnerLead) => Promise<string>, initialContent?: string) => {
        setDocPreview({ lead, docType: type, title, generateFn: genFn, initialContent });
    };
    
    const handleStatusChange = async (leadId: string, status: any) => {
        const lead = allLeads.find(l => l.id === leadId);
        if (!lead) return;
        
        if (lead.status === 'won' && !isSuperAdmin) {
            setToastNotification({ title: "Acceso Denegado", message: "Este prospecto ya está cerrado y no puede ser modificado.", icon: "lock" });
            return;
        }

        if (status === 'won' && !isSuperAdmin) {
             setToastNotification({ title: "Validación Requerida", message: "Solo el Súper Administrador puede marcar una venta como Ganada.", icon: "security" });
             return;
        }

        await updatePartnerLead(leadId, { status });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        
        const oneTimeList: string[] = [];
        const recurringList: string[] = [];

        // 1. Catalog Services
        Object.entries(selectedServices).forEach(([id, qty]) => {
            const svc = commissionData.find(s => s.id === id);
            if (svc) {
                if (svc.isMonthly || svc.isSemestral || (svc as any).isAnnual) {
                    recurringList.push(`${svc.service} (RECURRENTE MENSUAL)`);
                } else {
                    oneTimeList.push((qty as number) > 1 ? `${svc.service} (x${qty})` : svc.service);
                }
            }
        });

        // 2. Extra Dev (Legacy field but still used)
        if (parseFloat(extraDevValue) > 0) {
             const extraText = extraDevName.trim() ? extraDevName.trim() : 'Desarrollo Adicional';
             oneTimeList.push(`${extraText} ($${extraDevValue})`);
        }

        // 3. Custom Services
        customServices.forEach(s => {
            if (s.isMonthly) {
                recurringList.push(`${s.name} ($${s.value}/mes)`);
            } else {
                oneTimeList.push(`${s.name} ($${s.value})`);
            }
        });

        let finalServiceText = "";
        if (oneTimeList.length > 0) finalServiceText += `PAGOS ÚNICOS: ${oneTimeList.join(', ')}. `;
        if (recurringList.length > 0) finalServiceText += `PAGOS RECURRENTES: ${recurringList.join(', ')}.`;
            
        const leadData: any = {
            clientName, clientRepresentative, clientTaxId, projectFormalName, clientContact: `${clientPhone} ${clientEmail ? '| ' + clientEmail : ''}`.trim(),
            serviceType: finalServiceText || 'Consulta General',
            estimatedValue: calculatedTotal,
            taxPercentage: taxPercentage,
            extraDevValue: parseFloat(extraDevValue) || 0,
            extraDevName: extraDevName.trim(),
            customServices,
            estimatedDays: parseInt(estimatedDays) || 7,
            notes, duration: 'monthly' as const, commissionRate: 0.35,
            advanceValue: calculatedTotal / 2,
            balanceValue: calculatedTotal / 2
        };

        if (isEditMode && selectedLead) {
            leadData.hasProposal = false;
            leadData.hasPrefactura = false;
            leadData.hasContrato = false;
            leadData.clientSiteUrl = null;
            await updatePartnerLead(selectedLead.id, leadData);
            setToastNotification({ title: "Datos Actualizados", message: "Vuelve a descargar los DOCS para habilitar el sitio.", icon: 'sync' });
        } else {
            await addPartnerLead(leadData);
        }
        setLoading(false);
        setAddModalOpen(false);
    };

    const handleConfirmScheduleMeeting = async () => {
        if (!isSchedulingMeeting || !meetingDate || !meetingTime) return;
        
        setIsSavingMeeting(true);
        try {
            const scheduledAt = `${meetingDate}T${meetingTime}:00`;
            const title = `🤝 SOCIO: ${userProfile.name} - Lead: ${isSchedulingMeeting.clientName}`;
            
            const adminsQ = query(collection(db, "users"), where("email", "in", SUPER_ADMIN_EMAILS));
            const adminsSnap = await getDocs(adminsQ);

            const link = await scheduleMeeting(title, scheduledAt, adminsSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)), meetingNotes);
            
            await updatePartnerLead(isSchedulingMeeting.id, { 
                meetingUrl: link, meetingDate: scheduledAt, status: 'meeting'
            });

            if (!adminsSnap.empty) {
                const batch = writeBatch(db);
                adminsSnap.docs.forEach(admDoc => {
                    const nRef = doc(collection(db, `users/${admDoc.id}/notifications`));
                    batch.set(nRef, {
                        type: 'incoming_call',
                        text: `📅 **REUNIÓN SOLICITADA**: El socio **${userProfile.name}** ha agendado un cierre con **${isSchedulingMeeting.clientName}** para el ${new Date(scheduledAt).toLocaleString()}. ¡Atiende esta oportunidad!`,
                        timestamp: new Date().toISOString(),
                        read: false,
                        link: `/#/calls/${link.split('/calls/')[1]}`,
                        fromUser: { uid: currentUser?.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
                    });
                });
                await batch.commit();
            }

            setToastNotification({ title: "Reunión Agendada", message: "El link de nuestra APP ha sido generado y los administradores notificados.", icon: 'check' });
            setIsSchedulingMeeting(null);
            setMeetingDate(''); setMeetingTime(''); setMeetingNotes('');
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo agendar la reunión.", icon: 'close' });
        } finally {
            setIsSchedulingMeeting(null);
            setIsSavingMeeting(false);
        }
    };
    
    const slugify = (text: string) => {
        return text
            .toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]+/g, '')
            .replace(/--+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    };

    const handleGenerateClientSite = async (lead: PartnerLead) => {
        if (!currentUser) return;
        if (!lead.hasProposal || !lead.hasPrefactura || !lead.hasContrato) {
            setToastNotification({ title: "Acción Requerida", message: "Primero descarga/fija todos los documentos (Estrategia, Prefactura y Contrato) para habilitar el sitio.", icon: "lock" });
            return;
        }
        setIsGeneratingSite(lead.id);
        setToastNotification({ title: "Diseñando Sitio", message: "La IA está construyendo el micro-sitio informativo...", icon: "ai", isLoading: true });
        try {
            const htmlCode = await generatePartnerClientSiteHtml(lead, userProfile.name, userProfile.partnerCode || 'GTFY', userProfile.country || 'Global', lead.taxPercentage || 0);
            
            const siteSlug = slugify(lead.clientName);
            // Usamos el slug como ID del documento para URLs limpias
            const siteRef = doc(db, 'published_sites', siteSlug);
            
            // Verificamos si ya existe para evitar sobreescribir accidentalmente o manejar colisiones
            const existingSite = await getDoc(siteRef);
            let finalId = siteSlug;
            if (existingSite.exists() && existingSite.data().leadId !== lead.id) {
                finalId = `${siteSlug}-${Math.random().toString(36).substring(2, 5)}`;
            }

            await setDoc(doc(db, 'published_sites', finalId), {
                ownerId: currentUser.uid, 
                brandName: `Propuesta: ${lead.clientName}`, 
                htmlCode: htmlCode, 
                createdAt: new Date().toISOString(), 
                active: true, 
                isPartnerSite: true, 
                leadId: lead.id,
                slug: finalId
            });

            const link = `${window.location.origin}/#/site/${finalId}`;
            await updatePartnerLead(lead.id, { clientSiteUrl: link } as any);
            setToastNotification({ title: "Sitio Publicado", message: "Link copiado al portapapeles.", icon: "rocket" });
            navigator.clipboard.writeText(link);
        } catch (error) {
            console.error(error);
            setToastNotification({ title: "Error", message: "No se pudo generar the sitio.", icon: "close" });
        } finally {
            setIsGeneratingSite(null);
        }
    };

    const handleFollowUpChat = async (lead: PartnerLead) => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const closerEmail = 'deoc29@hotmail.com';
            const closerUser = allUsers.find(u => u.email?.toLowerCase() === closerEmail);
            
            if (!closerUser) {
                setToastNotification({ title: "Admin no encontrado", message: "El cerrador oficial no está disponible en este momento.", icon: 'close' });
                return;
            }

            const conversationId = [currentUser.uid, closerUser.uid].sort().join('_');
            const initialText = `Hola, quiero hacer seguimiento al cierre del prospecto **${lead.clientName}**. El estatus actual es **${statusLabels[lead.status]}**. ¿Alguna novedad estratégica?`;
            
            await sendDirectMessage(closerUser, initialText);
            
            setToastNotification({ title: "Seguimiento Iniciado", message: "Abriendo chat con el Administrador de Cierres.", icon: 'message' });
            
            setCurrentView('hub');
            setActiveHubView('messages');
            setDeepLinkTarget({ view: 'messages', id: conversationId });
            window.location.hash = `hub/messages/${conversationId}`;
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleArchiveLead = async (leadId: string) => {
        if (confirm("¿Deseas archivar este prospecto? Ya no aparecerá en tu vista actual pero Shivo mantendrá el registro.")) {
            await updatePartnerLead(leadId, { archived: true });
            setToastNotification({ title: "Prospecto Archivado", message: "El registro ha sido ocultado de tu lista.", icon: 'folder' });
        }
    };

    const handleDeleteLeadPermanent = async (leadId: string) => {
        if (confirm("🚨 ACCIÓN SUPERADMIN: ¿Eliminar permanentemente de la base de datos?")) {
            await deleteDoc(doc(db, "partnerLeads", leadId));
            setToastNotification({ title: "Eliminado", message: "Registro borrado de Firestore.", icon: 'trash' });
        }
    };

    const handleOpenSchedule = (lead: PartnerLead) => {
        setIsSchedulingMeeting(lead);
        const now = new Date();
        now.setMinutes(now.getMinutes() + 60);
        setMeetingDate(now.toISOString().split('T')[0]);
        setMeetingTime(now.toTimeString().slice(0, 5));
    };

    const copyMeetingLink = (link: string) => {
        navigator.clipboard.writeText(link);
        setToastNotification({ title: "Copiado", message: "Enlace de reunión copiado.", icon: 'copy' });
    };

    const handleResolveRequest = async (leadId: string, requestId: string, section: string) => {
        const lead = allLeads.find(l => l.id === leadId);
        if (!lead) return;
        
        const updatedRequests = (lead.changeRequests || []).map(r => r.id === requestId ? { ...r, status: 'resolved' as const } : r);
        const updates: any = { 
            changeRequests: updatedRequests,
            clientSiteUrl: null, 
            hasProposal: false, hasPrefactura: false, hasContrato: false 
        };
        await updatePartnerLead(leadId, updates);
        
        let docType: any = 'proposalText';
        let title = 'ESTRATEGIA';
        let genFn = (l: PartnerLead) => generateAiQuotation(l.clientName, l.serviceType, l.notes, l.estimatedValue, userProfile.name, undefined, l.notes);

        if (section.toLowerCase().includes('inversion') || section.toLowerCase().includes('preinvoice')) {
            docType = lead.preInvoiceEcuText ? 'preInvoiceEcuText' : 'preInvoiceLatText';
            title = lead.preInvoiceEcuText ? 'PREFACTURA ECU' : 'PREFACTURA LAT';
            genFn = (l: PartnerLead) => generatePartnerPreInvoice(l, userProfile.name, lead.preInvoiceEcuText ? 'Ecuador' : 'Latinoamérica', l.taxPercentage || 0);
        } else if (section.toLowerCase().includes('contrato') || section.toLowerCase().includes('contract')) {
            docType = lead.contractEcuText ? 'contractEcuText' : 'contractLatText';
            title = lead.contractEcuText ? 'CONTRATO ECU' : 'CONTRATO LAT';
            genFn = (l: PartnerLead) => generatePartnerContract(l, userProfile.name, lead.contractEcuText ? 'Ecuador' : 'Internacional');
        }
        
        handleOpenDocPreview(lead, docType, title, genFn);
        setToastNotification({ title: "Abriendo Editor", message: "Resolviendo solicitud de ajuste...", icon: 'edit' });
    };

    const filteredLeads = useMemo(() => {
        if (isSuperAdmin) return allLeads;
        return allLeads.filter(l => !l.archived);
    }, [allLeads, isSuperAdmin]);
    
    return (
        <div className="space-y-6">
            {docPreview && (
                <LeadDocPreviewModal 
                    isOpen={!!docPreview} 
                    onClose={() => setDocPreview(null)} 
                    lead={docPreview.lead}
                    title={docPreview.title}
                    docType={docPreview.docType}
                    generateFn={docPreview.generateFn}
                    initialContent={docPreview.initialContent}
                />
            )}
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-1 gap-4">
                <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-neutral-800 dark:text-white"><Icon name="list" className="w-5 h-5 text-brand-primary"/> CRM de Prospectos y Negociación</h3>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={handleOpenAdd} className="flex-1 sm:flex-none border border-brand-primary bg-transparent text-brand-primary font-black text-xs shadow-md p-2 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-brand-primary/5"><Icon name="plus" className="w-4 h-4"/> Nueva Oportunidad</button>
                </div>
            </div>
            <Card className="overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-xl rounded-2xl bg-white dark:bg-dark-surface">
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-[10px] sm:text-xs">
                        <thead className="bg-neutral-50 dark:bg-neutral-800 border-b dark:border-neutral-700 sticky top-0 z-20 shadow-sm">
                            <tr>
                                <th className="p-3 font-black uppercase text-[9px] text-neutral-400">Cliente y Contacto</th>
                                <th className="p-3 font-black uppercase text-[9px] text-neutral-400">Inversión y Pagos</th>
                                <th className="p-3 font-black uppercase text-[9px] text-neutral-400">Estatus Oficial</th>
                                <th className="p-3 font-black uppercase text-[9px] text-right text-neutral-400">Gestión de Cierre</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-neutral-900">
                            {Array.isArray(filteredLeads) && filteredLeads.length > 0 ? filteredLeads.map(lead => {
                                const isWon = lead.status === 'won';
                                const canEditStatus = isSuperAdmin || (!isWon && lead.status !== 'lost');
                                
                                const statusOptions = Object.entries(statusLabels).filter(([k]) => {
                                    if (isSuperAdmin) return true;
                                    if (k === 'won') return false; 
                                    return ['pending', 'meeting', 'closing', 'lost'].includes(k);
                                });
                                
                                const canArchive = lead.status !== 'won' && lead.status !== 'lost';
                                const siteUrl = lead.clientSiteUrl;
                                const canGenerateSite = lead.hasProposal && lead.hasPrefactura && lead.hasContrato;
                                const pendingRequests = lead.changeRequests?.filter(r => r.status === 'pending') || [];

                                // Granular Payment Calculations
                                const total = lead.finalValue || lead.estimatedValue || 0;
                                const advValue = lead.advanceValue || (total / 2);
                                const balValue = lead.balanceValue || (total / 2);
                                const earned = (lead.advancePaid ? advValue : 0) + (lead.balancePaid ? balValue : 0);
                                const pending = total - earned;
                                const commEarned = earned * lead.commissionRate;

                                return (
                                <tr key={lead.id} className={`hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors group ${lead.archived ? 'bg-neutral-100 opacity-60' : ''}`}>
                                    <td className="p-3 min-w-[150px] text-neutral-800 dark:text-white">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold truncate">{lead.clientName}</p>
                                            {lead.archived && <span className="text-[7px] font-black uppercase px-1 py-0.5 bg-neutral-300 text-neutral-600 rounded">Archivado</span>}
                                        </div>
                                        <p className="text-[9px] text-neutral-400 truncate">📱 {lead.clientContact?.split('|')[0]} {lead.clientContact?.includes('|') ? `📧 ${lead.clientContact.split('|')[1]}` : ''}</p>
                                        
                                        {lead.billingInfo && (
                                            <div className="mt-1.5 bg-neutral-100 dark:bg-neutral-800 p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                                <p className="text-[8px] font-black uppercase text-neutral-500 flex items-center gap-1 mb-0.5">
                                                    <Icon name="check" className="w-2.5 h-2.5 text-green-500"/> Datos Facturación
                                                </p>
                                                <p className="text-[8px] text-neutral-600 dark:text-neutral-400 truncate max-w-[140px]" title={`${lead.billingInfo.name} - ${lead.billingInfo.ruc}`}>
                                                    {lead.billingInfo.name} • {lead.billingInfo.ruc}
                                                </p>
                                            </div>
                                        )}

                                        {isSuperAdmin && lead.partnerId !== currentUser?.uid && (
                                            <div className="mt-1 flex items-center gap-1">
                                                <span className="text-[7px] font-black uppercase px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary rounded border border-brand-primary/20">Socio: {lead.partnerName}</span>
                                            </div>
                                        )}

                                        {pendingRequests.length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                <p className="text-[8px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1">
                                                    <Icon name="edit" className="w-3 h-3"/> Ajustes Requeridos
                                                </p>
                                                {pendingRequests.map(req => (
                                                    <div key={req.id} className="bg-red-50 dark:bg-red-900/10 p-2 rounded-xl border border-red-200 dark:border-red-900 flex flex-col gap-2">
                                                        <div>
                                                            <p className="text-[8px] font-black text-red-600 uppercase">Sección: {req.section} • {new Date(req.date).toLocaleString()}</p>
                                                            <p className="text-[9px] text-neutral-700 dark:text-neutral-300 italic line-clamp-2">"{req.description}"</p>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleResolveRequest(lead.id, req.id, req.section); }}
                                                            className="w-full py-1.5 bg-red-600 text-white rounded-lg text-[8px] font-black uppercase shadow-sm hover:bg-red-700 transition-all flex items-center justify-center gap-1"
                                                        >
                                                            Ir a Cambiar <Icon name="arrowRight" className="w-2.5 h-2.5"/>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="mt-1 flex flex-col gap-0.5">
                                            {lead.meetingUrl ? (
                                                <div className="flex items-center gap-1.5 mt-1 bg-green-50 dark:bg-green-900/10 p-1.5 rounded-xl border border-green-100 dark:border-green-800 shadow-sm animate-fade-in">
                                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                                    <span className="text-[8px] font-black text-green-600 uppercase flex-1 truncate">REUNIÓN: {new Date(lead.meetingDate!).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                                    <button onClick={() => copyMeetingLink(lead.meetingUrl!)} className="p-1 hover:bg-green-200 dark:hover:bg-green-800 rounded-lg transition-colors" title="Copiar Link"><Icon name="copy" className="w-3.5 h-3.5 text-green-600"/></button>
                                                    <button onClick={() => window.open(lead.meetingUrl, '_blank')} className="p-1.5 bg-green-500 text-white rounded-lg transition-all hover:scale-110 active:scale-95 shadow-md" title="Entrar a Reunión"><Icon name="video" className="w-3.5 h-3.5"/></button>
                                                </div>
                                            ) : (
                                                <button onClick={() => handleOpenSchedule(lead)} className="text-[8px] font-black text-brand-primary bg-brand-primary/5 px-2 py-1 rounded-lg uppercase hover:bg-brand-primary hover:text-white transition-all flex items-center gap-1 w-fit mt-1"> <Icon name="calendar" className="w-3 h-3"/> Agendar Cierre APP </button>
                                            )}
                                            <p className="text-[8px] text-neutral-400 italic mt-1 ml-1">Registrado: {new Date(lead.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <div className="space-y-1">
                                            <p className="font-black text-neutral-900 dark:text-white truncate">Total: {convertAndFormatCurrency(total, userProfile.currency || 'USD')}</p>
                                            <div className="flex flex-col gap-1 mt-1">
                                                <div className="flex items-center justify-between text-[8px] font-bold">
                                                    <span className={`px-1.5 py-0.5 rounded ${lead.advancePaid ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-400'} uppercase`}>Anticipo: {convertAndFormatCurrency(advValue, userProfile.currency || 'USD')}</span>
                                                    {lead.advanceVoucherUrl && <a href={lead.advanceVoucherUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline"><Icon name="folder" className="w-3 h-3"/></a>}
                                                </div>
                                                <div className="flex items-center justify-between text-[8px] font-bold">
                                                    <span className={`px-1.5 py-0.5 rounded ${lead.balancePaid ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-400'} uppercase`}>Saldo: {convertAndFormatCurrency(balValue, userProfile.currency || 'USD')}</span>
                                                    {lead.balanceVoucherUrl && <a href={lead.balanceVoucherUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline"><Icon name="folder" className="w-3 h-3"/></a>}
                                                </div>
                                                <div className="pt-1 mt-1 border-t border-neutral-100 dark:border-neutral-800">
                                                    <p className="text-[8px] font-black text-brand-primary uppercase">Ganancia Real: {convertAndFormatCurrency(commEarned, userProfile.currency || 'USD')}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex flex-col gap-1.5">
                                            {isSuperAdmin ? (
                                                <select 
                                                    value={lead.status} 
                                                    onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                                                    className={`w-full px-2 py-1 rounded-xl text-[8px] font-black uppercase border-none focus:ring-0 cursor-pointer shadow-sm ${statusColors[lead.status]}`}
                                                >
                                                    {statusOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                                                    {isWon && <option value="won">Ganado</option>}
                                                </select>
                                            ) : (
                                                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-center shadow-sm border border-black/5 ${statusColors[lead.status]}`}>
                                                    {statusLabels[lead.status]}
                                                </div>
                                            )}
                                            
                                            {pending === 0 && total > 0 && (
                                                <span className="text-[8px] font-black text-green-600 uppercase text-center mt-1">Liquidado ✅</span>
                                            )}
                                            {earned > 0 && pending > 0 && (
                                                <span className="text-[8px] font-black text-blue-500 uppercase text-center mt-1">Parcial</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex justify-end gap-1.5 flex-wrap max-w-[320px]">
                                                {!isWon && !isSuperAdmin && (
                                                    <button 
                                                        onClick={() => handleFollowUpChat(lead)}
                                                        className="p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg hover:bg-brand-primary hover:text-white transition-all shadow-sm flex items-center gap-1.5 border border-brand-primary/20"
                                                        title="Preguntar estatus al cerrador"
                                                    >
                                                        <Icon name="message" className="w-4 h-4"/>
                                                        <span className="text-[8px] font-black uppercase hidden sm:inline">Seguimiento</span>
                                                    </button>
                                                )}
                                                {lead.clientSiteUrl && ((lead.clientContact?.includes('|') ? lead.clientContact.split('|')[1]?.trim() : lead.clientContact) || '').length > 0 && (
                                                    <button 
                                                        onClick={() => {
                                                            const emailRaw = lead.clientContact?.includes('|') ? lead.clientContact.split('|')[1].trim() : lead.clientContact;
                                                            setMailDraft({
                                                                to: emailRaw,
                                                                subject: `Propuesta Oficial y Estrategia Digital: ${lead.clientName}`,
                                                                htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 30px 10px; background-color: #f3f4f6;">
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
    <div style="background-color: #000000; padding: 40px 20px; text-align: center; border-bottom: 4px solid #2F4AE4;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; line-height: 1.2;">Estrategia de Transformación Digital</h1>
        <p style="color: #9ca3af; margin: 10px 0 0 0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Expediente de Alto Rendimiento</p>
    </div>
    <div style="padding: 40px 25px;">
        <p style="font-size: 16px; color: #111827; font-weight: 700; margin: 0 0 15px 0;">Hola,</p>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin: 0 0 25px 0;">Tras analizar al detalle la estructura operativa de <b style="color: #111827;">${lead.clientName}</b>, hemos consolidado el plan exacto para llevar tu negocio al siguiente nivel operativo y comercial.</p>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin: 0 0 30px 0;">En el siguiente enlace, hemos activado tu <b style="color: #111827;">Sala de Acuerdos Privada</b>. Allí encontrarás tu expediente oficial dividido en 3 fases clave:</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #2F4AE4; padding: 25px 20px; margin-bottom: 40px;">
            <div style="margin-bottom: 20px;">
                <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #111827; text-transform: uppercase;">1. Propuesta de Valor</p>
                <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">Estrategia y desglose tecnológico detallado.</p>
            </div>
            <div style="margin-bottom: 20px;">
                <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #111827; text-transform: uppercase;">2. Prefactura y Tiempos</p>
                <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">Inversión detallada proyectada por rubro.</p>
            </div>
            <div>
                <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #111827; text-transform: uppercase;">3. Convenio de Servicios</p>
                <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">Nuestro pacto legal de excelencia y alcances.</p>
            </div>
        </div>

        <div style="text-align: center; margin-bottom: 40px;">
            <a href="${lead.clientSiteUrl}" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #2F4AE4; color: #ffffff; padding: 18px 20px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Ingresar A Sala de Acuerdos</a>
        </div>
        
        <p style="font-size: 13px; color: #6b7280; font-style: italic; line-height: 1.6; margin: 0 0 35px 0; padding-top: 25px; border-top: 1px solid #e5e7eb;">Revisa cada pestaña haciendo clic sobre ellas. Si tienes algún comentario, duda o necesitas un ajuste a las pautas, puedes solicitarlo directamente desde allí en la sección interactiva o por esta misma vía.</p>
        
        <div>
            <p style="margin: 0 0 5px 0; font-size: 16px; font-weight: 800; color: #111827;">¿Avanzamos con la transformación?</p>
            <p style="margin: 0; font-size: 14px; color: #4b5563;">Quedamos atentos a tu confirmación para iniciar con fuerza.</p>
        </div>
    </div>
    <div style="background-color: #f9fafb; padding: 25px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; color: #111827;">- Goatify</p>
        <p style="margin: 0; font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px;">Estructura Operativa & Cierre Digital</p>
    </div>
</div>
</body>
</html>`
                                                            });
                                                            setCurrentView('mail');
                                                        }}
                                                        className="p-1.5 bg-blue-100/30 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-1.5 border border-blue-500/20"
                                                        title="Enviar Enlace por Email"
                                                    >
                                                        <Icon name="send" className="w-4 h-4"/>
                                                        <span className="text-[8px] font-black uppercase hidden sm:inline">Email Site</span>
                                                    </button>
                                                )}

                                                {isSuperAdmin ? (
                                                    <button onClick={() => handleDeleteLeadPermanent(lead.id)} className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-sm" title="ELIMINAR PERMANENTE (ADMIN)"> <Icon name="trash" className="w-4 h-4"/> </button>
                                                ) : (
                                                    canArchive && (
                                                        <button onClick={() => handleArchiveLead(lead.id)} className="p-1.5 bg-neutral-100 text-neutral-500 rounded-lg hover:bg-neutral-200 transition-all shadow-sm" title="Archivar (ocultar)"> <Icon name="folder" className="w-4 h-4"/> </button>
                                                    )
                                                )}

                                                {!isWon && (
                                                    <button onClick={() => handleOpenEdit(lead)} className="p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-brand-primary hover:text-white transition-all shadow-sm" title="Editar datos"> <Icon name="edit" className="w-4 h-4"/> </button>
                                                )}
                                                
                                                <button 
                                                    onClick={() => siteUrl ? window.open(siteUrl, '_blank') : handleGenerateClientSite(lead)} 
                                                    disabled={isGeneratingSite === lead.id || (!siteUrl && !canGenerateSite)}
                                                    className={`inline-flex items-center justify-center gap-1 px-3 h-8 rounded-full font-black text-[9px] uppercase transition-all shadow-sm overflow-hidden whitespace-nowrap min-w-[80px] ${siteUrl ? 'bg-purple-600 text-white hover:scale-105' : canGenerateSite ? 'bg-brand-primary text-white hover:scale-105' : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-40'}`}
                                                    title={siteUrl ? "Ver Sitio del Cliente" : canGenerateSite ? "Generar Sitio Informativo" : "Prerrequisito: Descarga Estrategia, Prefactura y Contrato"}
                                                >
                                                    {isGeneratingSite === lead.id ? <Spinner className="!w-3 !h-3 !p-0 !text-white" /> : <><Icon name="rocket" className="w-3 h-3 flex-shrink-0"/> <span className="truncate">{siteUrl ? 'VER SITIO' : 'GEN SITIO'}</span></>}
                                                </button>

                                                <button 
                                                    disabled={!!lead.preInvoiceLatText}
                                                    onClick={() => handleOpenDocPreview(lead, 'preInvoiceEcuText', 'PREFACTURA ECUADOR', (l) => generatePartnerPreInvoice(l, userProfile.name, 'Ecuador', l.taxPercentage || 15))} 
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-black text-[9px] uppercase transition-all shadow-sm ${lead.preInvoiceEcuText ? 'bg-amber-500 text-white' : 'bg-amber-100/10 text-amber-700 hover:bg-amber-600 hover:text-white opacity-40'}`}
                                                > 
                                                    <Icon name={lead.preInvoiceEcuText ? "check" : "upload"} className={`w-3 h-3 ${!lead.preInvoiceEcuText && 'transform rotate-180'}`}/> Pref ECU 
                                                </button>
                                                <button 
                                                    disabled={!!lead.preInvoiceEcuText}
                                                    onClick={() => handleOpenDocPreview(lead, 'preInvoiceLatText', 'PREFACTURA LATAM', (l) => generatePartnerPreInvoice(l, userProfile.name, 'Latinoamérica', l.taxPercentage || 0))} 
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-black text-[9px] uppercase transition-all shadow-sm ${lead.preInvoiceLatText ? 'bg-orange-500 text-white' : 'bg-orange-100/10 text-orange-700 hover:bg-orange-600 hover:text-white opacity-40'}`}
                                                > 
                                                    <Icon name={lead.preInvoiceLatText ? "check" : "upload"} className={`w-3 h-3 ${!lead.preInvoiceLatText && 'transform rotate-180'}`}/> Pref LAT 
                                                </button>
                                                <button 
                                                    onClick={() => handleOpenDocPreview(lead, 'proposalText', 'ESTRATEGIA COMERCIAL', (l) => generateAiQuotation(l.clientName, l.serviceType, l.notes, l.estimatedValue, userProfile.name, undefined, l.notes))} 
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-black text-[9px] uppercase transition-all shadow-sm ${lead.proposalText ? 'bg-indigo-600 text-white' : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white opacity-40'}`}
                                                > 
                                                    <Icon name={lead.proposalText ? "check" : "ai"} className="w-3 h-3"/> Estrategia 
                                                </button>
                                                <button 
                                                    disabled={!!lead.contractLatText}
                                                    onClick={() => handleOpenDocPreview(lead, 'contractEcuText', 'CONTRATO MAESTRO ECU', (l) => generatePartnerContract(l, userProfile.name, 'Ecuador'))} 
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-black text-[9px] uppercase transition-all shadow-sm ${lead.contractEcuText ? 'bg-green-600 text-white' : 'bg-green-100/10 text-green-700 hover:bg-green-600 hover:text-white opacity-40'}`}
                                                > 
                                                    <Icon name="check" className="w-3 h-3"/> ECU 
                                                </button>
                                                <button 
                                                    disabled={!!lead.contractEcuText}
                                                    onClick={() => handleOpenDocPreview(lead, 'contractLatText', 'CONTRATO MAESTRO LATAM', (l) => generatePartnerContract(l, userProfile.name, 'Internacional'))} 
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-black text-[9px] uppercase transition-all shadow-sm ${lead.contractLatText ? 'bg-blue-600 text-white' : 'bg-blue-100/10 text-blue-700 hover:bg-blue-600 hover:text-white opacity-40'}`}
                                                > 
                                                    <Icon name="globe" className="w-3 h-3"/> LAT 
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}) : (
                                <tr><td colSpan={4} className="p-12 text-center text-neutral-400 font-medium italic">No hay oportunidades de negocio registradas. Comienza registrando tu primer lead.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal 
                isOpen={!!isSchedulingMeeting} 
                onClose={() => setIsSchedulingMeeting(null)} 
                title={`Agendar Cierre APP: ${isSchedulingMeeting?.clientName}`} 
                className="max-w-xl"
                zIndex="z-[150000]"
            >
                 <div className="space-y-6">
                    <p className="text-sm text-neutral-500 font-medium leading-relaxed">Configura el momento exacto para la videoconferencia HD de cierre. Shivo enviará las notificaciones pertinentes.</p>
                    
                    <div className="grid grid-cols-1 gap-4 bg-neutral-50 dark:bg-neutral-900 p-4 rounded-3xl border border-neutral-100 dark:border-neutral-800">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest flex items-center gap-2">
                                <Icon name="calendar" className="w-3.5 h-3.5"/> Seleccionar Fecha
                            </label>
                            <input 
                                type="date" 
                                value={meetingDate} 
                                onChange={e => setMeetingDate(e.target.value)}
                                className="w-full bg-white dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm font-bold focus:border-brand-primary outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-brand-primary tracking-widest flex items-center gap-2">
                                <Icon name="clock" className="w-3.5 h-3.5"/> Seleccionar Hora
                            </label>
                            <input 
                                type="time" 
                                value={meetingTime} 
                                onChange={e => setMeetingTime(e.target.value)}
                                className="w-full bg-white dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm font-bold focus:border-brand-primary outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest ml-1">Agenda de Sesión</label>
                        <Textarea value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} rows={3} placeholder="Describe brevemente los puntos a tratar..." className="rounded-2xl text-xs" />
                    </div>
                    
                    <div className="flex gap-3 pt-4 border-t dark:border-neutral-800">
                        <Button variant="secondary" onClick={() => setIsSchedulingMeeting(null)} className="flex-1 rounded-xl h-12">Cancelar</Button>
                        <Button onClick={handleConfirmScheduleMeeting} disabled={!meetingDate || !meetingTime || isSavingMeeting} className="flex-[2] rounded-xl h-12 shadow-xl shadow-brand-primary/20">
                            {isSavingMeeting ? <Spinner className="w-4 h-4 text-white" /> : "Generar Link de Nuestra APP"}
                        </Button>
                    </div>
                 </div>
            </Modal>

            <Modal 
                isOpen={isAddModalOpen} 
                onClose={() => setAddModalOpen(false)} 
                title={isEditMode ? "Editar Oportunidad" : "Registro de Nueva Oportunidad Estratégica"}>
                <form onSubmit={handleSubmit} className="space-y-5 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-3">
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block">Información Jurídica para Instrumentos Legales</label>
                        <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Razón Social Completa / Empresa *" required />
                        <Input value={clientRepresentative} onChange={e => setClientRepresentative(e.target.value)} placeholder="Representante Legal Autorizado" />
                        <Input value={clientTaxId} onChange={e => setClientTaxId(e.target.value)} placeholder="RUC / Tax ID / Identificación Fiscal" />
                        <Input value={projectFormalName} onChange={e => setProjectFormalName(e.target.value)} placeholder="Denominación del Proyecto" />
                        <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Número de WhatsApp o Teléfono" />
                        <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} type="email" placeholder="Correo Electrónico de Contacto" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block mb-3">Portafolio de Soluciones (Selecciona y Define Cantidades)</label>
                        <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto p-1 custom-scrollbar">
                            {commissionData.filter(s => !s.isCustom).map(svc => {
                                const qty = selectedServices[svc.id] || 0;
                                return (
                                    <div key={svc.id} className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${qty > 0 ? 'border-brand-primary bg-brand-primary/5' : 'border-neutral-100 dark:border-neutral-800 hover:border-neutral-300'}`}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors ${qty > 0 ? 'bg-brand-primary border-brand-primary' : 'border-neutral-300'}`}>{qty > 0 && <Icon name="check" className="w-3 h-3 text-white"/>}</div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[11px] font-black leading-tight truncate">{svc.service}</span>
                                                <span className="text-[8px] text-neutral-400 uppercase font-bold">{svc.commission} de comisión asignada</span>
                                                {(svc.isMonthly || svc.isSemestral || (svc as any).isAnnual) && <span className="text-[8px] text-amber-600 font-bold uppercase mt-0.5"> * Pago recurrente para el cliente (Máx. 1)</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-[11px] text-brand-primary">{convertAndFormatCurrency(svc.price, userProfile.currency || 'USD')}</span>
                                            <div className="flex items-center bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-0.5">
                                                <button type="button" onClick={() => updateServiceQuantity(svc.id, -1)} className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-red-500 transition-colors"><Icon name="minus" className="w-3 h-3"/></button>
                                                <span className="w-6 text-center text-xs font-black">{qty}</span>
                                                <button type="button" onClick={() => updateServiceQuantity(svc.id, 1)} className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="plus" className="w-3 h-3"/></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block mb-2">Desarrollo Adicional Especial (35% Com.)</label>
                            <Input value={extraDevName} onChange={e => setExtraDevName(e.target.value)} placeholder="Ej: Integración ERP específica..." />
                        </div>
                        <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block mb-2">Presupuesto Extra Asignado</label>
                            <div className="relative">
                                <Input type="number" value={extraDevValue} onChange={e => setExtraDevValue(e.target.value)} placeholder="0.00" className="pl-4"/>
                            </div>
                        </div>
                    </div>

                    <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block mb-2">Otros Servicios Adicionales</label>
                        <div className="flex flex-col sm:flex-row gap-2 mb-3">
                            <Input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder="Nombre del servicio" className="flex-1" />
                            <Input type="number" value={newServiceValue} onChange={e => setNewServiceValue(e.target.value)} placeholder="Valor" className="w-full sm:w-24" />
                            <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 px-3 py-2 sm:py-0 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                <input type="checkbox" checked={newServiceIsMonthly} onChange={e => setNewServiceIsMonthly(e.target.checked)} className="rounded text-brand-primary focus:ring-brand-primary" />
                                <span className="text-[10px] font-bold uppercase">Mensual</span>
                            </div>
                            <button type="button" onClick={addCustomService} className="w-full sm:w-10 h-10 p-0 flex items-center justify-center rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"><Icon name="plus" className="w-4 h-4"/></button>
                        </div>
                        
                        {customServices.length > 0 && (
                            <div className="space-y-2">
                                {customServices.map((s, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white dark:bg-neutral-800 p-2 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold">{s.name}</span>
                                            <span className="text-[10px] text-neutral-500">{s.isMonthly ? 'Recurrente Mensual' : 'Pago Único'}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-black text-brand-primary">${s.value}</span>
                                            <button type="button" onClick={() => removeCustomService(i)} className="text-red-500 hover:text-red-700"><Icon name="trash" className="w-3 h-3"/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block mb-2">Plazo Estimado de Entrega (Días Hábiles)</label>
                            <Input type="number" min="1" max="60" value={estimatedDays} onChange={e => setEstimatedDays(e.target.value)} placeholder="Ej: 7" />
                        </div>
                        <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block mb-2">% Impuestos (IVA)</label>
                            <Input type="number" min="0" max="100" value={String(taxPercentage)} onChange={e => setTaxPercentage(Number(e.target.value))} placeholder="Ej: 15" />
                        </div>
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block mb-2">Análisis de Necesidades y Giro del Negocio</label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe el sector comercial y los puntos de dolor detectados que la IA resolverá..." rows={3} className="rounded-lg text-xs" />
                    </div>
                    <div className="p-4 bg-brand-primary/5 rounded-2xl border-2 border-brand-primary/20 flex justify-between items-center shadow-md">
                        <div className="flex flex-col">
                            <span className="font-black text-neutral-500 uppercase tracking-[0.2em] text-[9px]">Inversión Estimada</span>
                            <span className="text-xs text-brand-primary font-bold">Incluye soluciones únicas y primer mes de suscripción</span>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-black text-brand-primary block">{convertAndFormatCurrency(calculatedTotal * (1 + taxPercentage / 100), userProfile.currency || 'USD')}</span>
                            <span className="text-[9px] font-bold text-neutral-400 uppercase">Subtotal: {convertAndFormatCurrency(calculatedTotal, userProfile.currency || 'USD')} + {taxPercentage}% Imp.</span>
                        </div>
                    </div>
                    <div className="pt-4 flex gap-3 sticky bottom-0 bg-white dark:bg-neutral-900 pb-1">
                        <button type="button" onClick={() => setAddModalOpen(false)} className="w-full h-12 rounded-xl font-black text-xs bg-neutral-200 text-neutral-700">Descartar</button>
                        <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl shadow-xl font-black text-xs">{loading ? <Spinner className="w-4 h-4 text-white"/> : (isEditMode ? "Actualizar Oportunidad" : "Registrar Oportunidad")}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

const ElitePartnerAcademy: React.FC = () => {
    const { userProfile, joinGroup, setToastNotification, setCurrentView, setActiveHubView, setDeepLinkTarget } = useContext(AppContext);
    const benefits = [
        "Capacitación diaria intensiva de alto impacto (Lun a Vie - 1h)",
        "Incremento al 50% de COMISIÓN real en todo el ecosistema",
        "Estrategias maestras de CREACIÓN DE NEGOCIOS exponenciales",
        "Mentoría técnica y estratégica 1 a 1 mensualmente",
        "Neuro-programación para el éxito comercial masivo",
        "Habilidades sociales de élite y técnicas de persuasión",
        "Acceso preferente a lanzamientos tecnológicos alfa",
        "Certificación oficial como Consultor Estratégico de Goatify IA",
        "Plan estructurado de Retorno de Inversión (ROI) veloz"
    ];

    const monthlyPrice = convertAndFormatCurrency(77, userProfile.currency || 'USD');
    const semestralPrice = convertAndFormatCurrency(367, userProfile.currency || 'USD');
    return (
        <section className="mt-12 sm:mt-16 relative p-0.5 sm:p-1 bg-gradient-to-br from-brand-primary via-purple-600 to-black rounded-[2.5rem] sm:rounded-[3.5rem] shadow-[0_20px_60px_rgba(76,29,149,0.4)] overflow-hidden animate-fade-in group">
            <div className="bg-[#050505] rounded-[2.4rem] sm:rounded-[3.4rem] p-6 sm:p-16 relative overflow-hidden flex flex-col items-center text-center">
                <div className="absolute top-0 right-0 w-[40rem] sm:w-[50rem] h-[40rem] sm:h-[50rem] bg-brand-primary/20 rounded-full blur-[100px] sm:blur-[140px] -mr-60 sm:-mr-80 -mt-60 sm:-mt-80 animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-[30rem] sm:w-[40rem] h-[30rem] sm:h-[40rem] bg-brand-secondary/10 rounded-full blur-[80px] sm:blur-[110px] -ml-40 sm:-ml-56 -mb-40 sm:-mb-56"></div>
                <div className="relative z-10 space-y-6 sm:space-y-8 w-full max-w-5xl">
                    <div className="inline-flex items-center gap-2 sm:gap-3 bg-white/10 backdrop-blur-xl px-6 sm:px-8 py-2 sm:py-3 rounded-full border border-white/20 text-white text-[9px] sm:text-sm font-black uppercase tracking-[0.3em] sm:tracking-[0.5em] shadow-2xl transform group-hover:scale-105 transition-all duration-500">
                        <img src={LOGO_URL} alt="Goatify" className="w-5 h-5 sm:w-8 sm:h-8 object-contain drop-shadow-[0_0_10px_rgba(139,92,246,0.8)]" /> Academia Élite
                    </div>
                    <h2 className="text-2xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tighter"> Escala tus Ideas, <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-primary to-brand-secondary">Crea tu Propio Futuro</span> </h2>
                    <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
                        <p className="text-base sm:text-2xl text-neutral-300 font-medium leading-relaxed"> No es solo educación, es tu <span className="text-white font-black underline decoration-brand-primary underline-offset-8">Catalizador Financiero</span>. </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 py-6 sm:py-10 text-left">
                        {benefits.map((b, i) => (
                            <div key={i} className="flex items-start gap-2.5 sm:gap-4 bg-white/5 border border-white/10 p-3.5 sm:p-6 rounded-2xl sm:rounded-[2rem] backdrop-blur-md group/item hover:bg-white/10 hover:border-brand-primary hover:shadow-[0_0_30px_rgba(139,92,246,0.2)] transition-all duration-500">
                                <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-lg sm:rounded-2xl bg-brand-primary text-white flex items-center justify-center flex-shrink-0 shadow-lg group-hover/item:scale-110 transition-transform"> <Icon name="check" className="w-3.5 h-3.5 sm:w-6 sm:h-6 font-bold"/> </div>
                                <span className="text-[10px] sm:text-base font-bold text-gray-200 leading-tight">{b}</span>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 sm:gap-10 pt-6 sm:pt-10 w-full relative">
                        <div className="bg-white/5 backdrop-blur-2xl p-5 sm:p-10 rounded-2xl sm:rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col items-center transform hover:scale-[1.03] transition-all relative overflow-hidden group/card min-h-[160px] sm:min-h-0">
                            <p className="text-[8px] sm:text-xs font-black text-neutral-400 uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-2 sm:mb-4">Mensual</p>
                            <div className="flex flex-col items-center mb-4 sm:mb-8">
                                <span className="text-lg sm:text-4xl font-black text-white tracking-tighter">{monthlyPrice}</span>
                                <span className="text-[7px] sm:text-[10px] font-bold text-neutral-500 uppercase mt-1">Acceso Premium</span>
                            </div>
                            <button onClick={() => window.open(PAYPAL_MONTHLY_URL, '_blank')} className="w-full py-3 sm:py-6 rounded-xl sm:rounded-[1.5rem] bg-neutral-900 text-white border border-white/20 font-black text-[10px] sm:text-xl shadow-lg hover:bg-brand-primary hover:border-transparent transition-all active:scale-[0.95]"> Suscribirse </button>
                        </div>
                        <div className="bg-gradient-to-br from-brand-primary/20 to-purple-600/20 backdrop-blur-3xl p-5 sm:p-10 rounded-2xl sm:rounded-[3.5rem] border-2 border-brand-primary shadow-[0_0_30px_rgba(139,92,246,0.3)] flex flex-col items-center transform hover:scale-[1.03] lg:scale-110 transition-all relative overflow-hidden group/card ring-4 ring-brand-primary/10 min-h-[160px] sm:min-h-0">
                            <div className="absolute top-0 right-0 bg-brand-primary text-white font-black text-[7px] sm:text-xs px-3 sm:px-8 py-1 sm:py-3 rounded-bl-xl sm:rounded-bl-3xl uppercase tracking-wider shadow-2xl animate-pulse">VIP</div>
                            <p className="text-[8px] sm:text-xs font-black text-brand-accent uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-2 sm:mb-4">Semestral</p>
                            <div className="flex flex-col items-center mb-4 sm:mb-8">
                                <span className="text-lg sm:text-4xl font-black text-white tracking-tighter">{semestralPrice}</span>
                                <span className="text-[7px] sm:text-[10px] font-bold text-brand-accent uppercase mt-1">Full Access</span>
                            </div>
                            <button onClick={() => window.open(PAYPAL_SEMESTRAL_URL, '_blank')} className="w-full py-3 sm:py-6 rounded-xl sm:rounded-[1.5rem] bg-brand-primary text-white font-black text-[10px] sm:text-2xl shadow-[0_10px_30px_rgba(139,92,246,0.6)] hover:bg-brand-secondary transform hover:scale-105 transition-all active:scale-[0.95] border-none text-white"> Inscribirse </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

const StrategicPartnerBanner: React.FC = () => (
    <div className="relative p-6 sm:p-12 rounded-[2rem] sm:rounded-[2.5rem] bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 overflow-hidden shadow-xl animate-fade-in group">
        <div className="absolute top-0 right-0 w-[20rem] sm:w-[30rem] h-[20rem] sm:h-[30rem] bg-brand-primary/5 rounded-full blur-[80px] sm:blur-[100px] -mr-32 -mt-32 sm:-mt-48"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 sm:gap-8">
            <div className="p-4 sm:p-5 bg-brand-primary/10 rounded-2xl sm:rounded-3xl text-brand-primary">
                <Icon name="hub" className="w-10 h-10 sm:w-12 h-12" />
            </div>
            <div className="flex-1 text-center md:text-left">
                <h3 className="text-2xl sm:text-3xl font-black mb-2 tracking-tighter text-neutral-900 dark:text-white">
                    Socio Estratégico Goatify
                </h3>
                <p className="text-sm sm:base text-neutral-500 font-medium leading-relaxed max-w-2xl">
                    Lideramos la expansión tecnológica. Tú conectas prospectos y generas ingresos masivos. Nosotros cerramos por ti.
                </p>
                <div className="mt-4 sm:mt-6 flex flex-wrap gap-3 sm:gap-4 justify-center md:justify-start">
                    <div className="flex items-center gap-1.5 sm:gap-2 bg-neutral-100 dark:bg-neutral-800 px-3 sm:px-4 py-1.5 rounded-full">
                        <Icon name="check" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500"/>
                        <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-neutral-900 dark:text-white">Ingresos Directos</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 bg-neutral-100 dark:bg-neutral-800 px-3 sm:px-4 py-1.5 rounded-full">
                        <Icon name="globe" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500"/>
                        <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-neutral-900 dark:text-white">Alianza Regional</span>
                    </div>
                </div>
            </div>
            <Button onClick={() => window.open(WHATSAPP_URL, '_blank')} className="px-6 sm:px-8 py-2.5 sm:py-3 shadow-lg font-black uppercase text-[10px] sm:text-xs tracking-widest bg-brand-primary hover:bg-brand-secondary border-none w-full md:w-auto">Quiero empezar</Button>
        </div>
    </div>
);

const PerformanceIncentives: React.FC<{ wonLeads: PartnerLead[] }> = ({ wonLeads }) => {
    const { userProfile } = useContext(AppContext);
    const totalWonCommissions = useMemo(() => {
        return wonLeads.reduce((acc, curr) => {
            const total = Number(curr.finalValue ?? curr.estimatedValue ?? 0);
            const adv = curr.advanceValue || (total / 2);
            const bal = curr.balanceValue || (total / 2);
            const paid = (curr.advancePaid ? adv : 0) + (curr.balancePaid ? bal : 0);
            const rate = Number(curr.commissionRate ?? 0.35);
            return acc + (paid * rate);
        }, 0);
    }, [wonLeads]);
    
    const incentives = [
        { id: 'q', title: 'Trimestral', goal: 3000, reward: 300, icon: 'briefcase', color: 'from-blue-600 to-indigo-700' },
        { id: 's', title: 'Semestral', goal: 8000, reward: 1000, icon: 'security', goalColor: 'text-brand-accent', color: 'from-slate-700 to-slate-900' },
        { id: 'a', title: 'Meta Anual', goal: 20000, reward: 3000, icon: 'goat', color: 'from-neutral-800 to-neutral-950' }
    ];

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
                <h2 className="text-lg sm:text-2xl font-black flex items-center gap-2 text-neutral-800 dark:text-white">
                    <Icon name="briefcase" className="w-6 h-6 sm:w-8 sm:h-8 text-brand-primary" /> Bonos por Objetivos
                </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                {incentives.map(inc => {
                    const progress = Math.min(100, (totalWonCommissions / inc.goal) * 100);
                    
                    return (
                        <Card key={inc.id} className="relative p-4 sm:p-6 overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-xl rounded-[1.5rem] sm:rounded-[2rem] group transition-all hover:scale-[1.02] bg-white dark:bg-dark-surface h-full">
                            <div className={`absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-gradient-to-br ${inc.color} opacity-5 rounded-full -mr-12 sm:-mr-16 -mt-12 sm:-mt-16 blur-2xl group-hover:opacity-10 transition-opacity`}></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="flex justify-between items-start mb-4 sm:mb-6">
                                    <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-br ${inc.color} text-white shadow-lg`}>
                                        <Icon name={inc.icon as any} className="w-4 h-4 sm:w-6 sm:h-6" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[7px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest">Bono</p>
                                        <p className={`text-sm sm:text-xl font-black text-neutral-900 dark:text-white`}>{convertAndFormatCurrency(inc.reward, userProfile.currency || 'USD')}</p>
                                    </div>
                                </div>
                                <h4 className="text-[10px] sm:text-lg font-bold text-neutral-800 dark:text-white mb-0.5 sm:mb-1 truncate">{inc.title}</h4>
                                <p className="text-[8px] sm:text-xs text-neutral-500 mb-4 sm:mb-6 font-mono truncate">Meta: {convertAndFormatCurrency(inc.goal, userProfile.currency || 'USD')}</p>
                                <div className="space-y-1.5 sm:space-y-2 mt-auto">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[7px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest">Progreso</span>
                                        <span className="text-[8px] sm:text-xs font-black text-neutral-800 dark:text-white">{progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 sm:h-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                        <div className={`h-full bg-gradient-to-r ${inc.color} transition-all duration-1000 ease-out`} style={{ width: `${progress}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
};

const Partners: React.FC = () => {
    const { setProModalOpen, userProfile, updateUserProfile, allLeads, setCurrentView, setActiveHubView, setDeepLinkTarget, updatePartnerLead, isSuperAdmin, currentUser, joinGroup, setToastNotification } = useContext(AppContext);
    const isPaidUser = userProfile.plan === 'pro' || userProfile.plan === 'premium';
    const [isManualOpen, setManualOpen] = useState(false);
    const [isSalesToolOpen, setSalesToolOpen] = useState(false);
    const [isAgreementModalOpen, setAgreementModalOpen] = useState(false);
    const [isFreeUnlockModalOpen, setIsFreeUnlockModalOpen] = useState(false);
    
    const wonLeads = useMemo(() => {
        return allLeads.filter(l => l.status === 'won' && l.partnerId === currentUser?.uid);
    }, [allLeads, currentUser]);

    const totalCommissions = useMemo(() => {
        return wonLeads.reduce((acc, curr) => {
            const total = Number(curr.finalValue ?? curr.estimatedValue ?? 0);
            const adv = curr.advanceValue || (total / 2);
            const bal = curr.balanceValue || (total / 2);
            const earned = (curr.advancePaid ? adv : 0) + (curr.balancePaid ? bal : 0);
            const rate = Number(curr.commissionRate ?? 0.35);
            return acc + (earned * rate);
        }, 0);
    }, [wonLeads]);

    const pendingPayment = useMemo(() => {
        return wonLeads.reduce((acc, curr) => {
            const total = Number(curr.finalValue ?? curr.estimatedValue ?? 0);
            const adv = curr.advanceValue || (total / 2);
            const bal = curr.balanceValue || (total / 2);
            const earned = (curr.advancePaid ? adv : 0) + (curr.balancePaid ? bal : 0);
            const pending = total - earned;
            const rate = Number(curr.commissionRate ?? 0.35);
            return acc + (pending * rate);
        }, 0);
    }, [wonLeads]);

    const handleJoinAcademyGroup = async () => {
        const ACADEMY_GROUP_ID = "crea_con_ia_main_group_id"; 
        try {
            await joinGroup(ACADEMY_GROUP_ID);
            setToastNotification({ title: "Acceso Élite", message: "Inscrito en la Escuela. Accediendo al grupo...", icon: "hub" });
            setCurrentView('hub');
            setActiveHubView('groups');
            setDeepLinkTarget({ view: 'groups', id: ACADEMY_GROUP_ID });
            window.location.hash = 'hub/groups';
        } catch (e) {
            setCurrentView('hub');
            setActiveHubView('groups');
            setDeepLinkTarget({ view: 'groups', id: ACADEMY_GROUP_ID });
            window.location.hash = 'hub/groups';
        }
    };

    const handleActivatePartner = () => {
        if (userProfile.plan === 'free') {
            setIsFreeUnlockModalOpen(true);
        } else {
            setProModalOpen(true);
        }
    };

    const confirmFreePartnerActivation = async () => {
        if (!currentUser) return;
        try {
            // Activamos el partner en el perfil con una fecha de expiración de 90 días
            const partnerTrialExpiry = new Date();
            partnerTrialExpiry.setDate(partnerTrialExpiry.getDate() + 90);
            
            // Generar código único si no existe
            const newPartnerCode = userProfile.partnerCode || `SOCIO-${Math.floor(10000 + Math.random() * 90000)}`;

            await updateUserProfile(currentUser.uid, {
                plan: 'free', // Mantiene plan free pero con partner activo
                isPartnerActive: true,
                partnerTrialExpiry: partnerTrialExpiry.toISOString(),
                partnerCode: newPartnerCode
            } as any);
            
            setToastNotification({ 
                title: "Licencia Desbloqueada", 
                message: "Shivo ha activado tu perfil socio por 90 días.", 
                icon: "check" 
            });
            setIsFreeUnlockModalOpen(false);
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo activar la licencia.", icon: "close" });
        }
    };

    const resources = [
        { title: "Portafolio", desc: "Apps, Webs y Automatizaciones.", url: "https://www.goatify.app/portafolio/", icon: "image" },
        { title: "Catálogo", desc: "Precios de todos los servicios.", url: "https://www.goatify.app/pricing/", icon: "market" },
        { title: "Monetización", desc: "Cómo funcionan tus ganancias.", url: "https://www.goatify.app/socios/", icon: "wallet" },
        { title: "Apps de IA", desc: "Nuestros 12 agentes 24/7.", url: "https://www.goatify.app/productividad", icon: "studio" }
    ];

    // Se considera socio si es Pro/Premium O si es Free con la prueba de partner activa
    const isPartnerActive = isPaidUser || (userProfile as any).isPartnerActive;

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.data?.type === 'BILLING_INFO_UPDATE' && event.data.leadId && event.data.data) {
                try {
                    await updatePartnerLead(event.data.leadId, { billingInfo: event.data.data });
                    setToastNotification({ title: "Datos Recibidos", message: "Información de facturación del cliente actualizada.", icon: "check" });
                } catch (e) {
                    console.error("Error updating billing info:", e);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [updatePartnerLead, setToastNotification]);

    return (
        <div className="max-w-6xl mx-auto animate-fade-in space-y-8 sm:space-y-12 py-6 sm:py-8 px-3 sm:px-6 pb-24 h-full overflow-y-auto custom-scrollbar">
            <ManualOperativoModal isOpen={isManualOpen} onClose={() => setManualOpen(false)} />
            <SalesClosingTool isOpen={isSalesToolOpen} onClose={() => setSalesToolOpen(false)} />
            <PartnerAgreementModal isOpen={isAgreementModalOpen} onClose={() => setAgreementModalOpen(false)} />
            
            <Modal isOpen={isFreeUnlockModalOpen} onClose={() => setIsFreeUnlockModalOpen(false)} title="Licencia de Socio Desbloqueada">
                <div className="text-center py-6 space-y-6">
                    <div className="w-20 h-20 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <Icon name="goat" className="w-12 h-12 text-brand-primary animate-bounce"/>
                    </div>
                    <div className="space-y-3">
                        <h3 className="text-xl font-black uppercase text-neutral-900 dark:text-white">¡Shivo ha desbloqueado tu licencia de socio!</h3>
                        <p className="text-sm text-neutral-500 font-medium leading-relaxed">
                            Por 90 días, empieza a cerrar negocios hoy y generar ingresos sin costo mensual. 
                        </p>
                    </div>
                    <div className="bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/20 text-left">
                        <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Términos del Trial</p>
                        <ul className="text-[11px] space-y-1 text-neutral-600 dark:text-neutral-400">
                            <li>• Válido por 90 días naturales.</li>
                            <li>• 35% de comisión real en servicios Goatify.</li>
                            <li>• Descuento de créditos de IA (Lite model) por convenio.</li>
                        </ul>
                    </div>
                    <Button onClick={confirmFreePartnerActivation} className="w-full py-4 shadow-xl">Activar Mi Licencia Gratuita</Button>
                </div>
            </Modal>

            <section className="text-center space-y-3">
                <h1 className="text-3xl lg:text-7xl font-black bg-clip-text text-transparent bg-gradient-to-r from-brand-primary via-purple-600 to-neutral-400 tracking-tighter leading-none">{isPartnerActive ? "Goatify Partners" : "Genera Riqueza con IA"}</h1>
                <p className="text-xs sm:text-lg max-w-2xl mx-auto text-neutral-500 font-medium leading-relaxed px-4">Monetiza tu capital compartiendo tecnología de élite. Tú agendas, nosotros cerramos por ti.</p>
                 {!isPartnerActive && (
                    <div className="mt-6 flex flex-col items-center gap-4">
                        <Button onClick={handleActivatePartner} size="lg" className="transform hover:scale-[1.05] shadow-2xl px-8 sm:px-12 py-3 sm:py-4 text-base sm:text-xl font-black rounded-xl sm:rounded-2xl">Activar Perfil Partner</Button>
                        <p className="text-[10px] sm:text-sm text-neutral-400 font-bold uppercase tracking-widest">Plan Start: Prueba de Socios Gratis 90 días</p>
                    </div>
                 )}
            </section>

            {isPartnerActive && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
                    <Card className="lg:col-span-1 p-6 sm:p-8 bg-gradient-to-br from-[#1e1b4b] to-[#0a0a0a] text-white shadow-2xl relative overflow-hidden h-fit rounded-[2rem] border-none ring-1 ring-white/10">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/20 rounded-full -mr-16 -mt-16 blur-3xl animate-pulse"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-6 sm:mb-10"><div className="p-2 sm:p-3 bg-white/20 rounded-xl backdrop-blur-md border border-white/30 shadow-lg"><Icon name="goat" className="w-6 h-6 sm:w-8 sm:h-8 text-white" /></div><span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-brand-primary text-white rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest shadow-xl">Partner</span></div>
                            <div className="bg-white/5 backdrop-blur-md p-4 sm:p-6 rounded-2xl border border-white/10 mb-6 sm:mb-8 text-center shadow-inner">
                                <p className="text-[8px] sm:text-[10px] text-white/70 uppercase font-black tracking-[0.2em] sm:tracking-[0.3em] mb-1">Código Embajador</p>
                                <h3 className="text-2xl sm:text-4xl font-black font-mono tracking-tighter drop-shadow-xl text-white">{userProfile.partnerCode || 'SOCIO-TRIAL'}</h3>
                                <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/10 space-y-3 sm:space-y-4 text-left">
                                    <div className="flex items-center gap-2.5 sm:gap-3"> <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-brand-primary flex items-center justify-center flex-shrink-0 border border-white/20"> <Icon name="check" className="w-3.5 h-3.5 sm:w-5 h-5 text-white"/> </div> <p className="text-[10px] sm:text-sm font-black text-white">15% Beneficio Cliente</p> </div>
                                    <div className="flex items-center gap-2.5 sm:gap-3"> <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/10"> <Icon name="book" className="w-3.5 h-3.5 sm:w-5 h-5 text-brand-accent"/> </div> <p className="text-[10px] sm:text-sm font-bold text-white/90">Guía Monetización Gratis</p> </div>
                                </div>
                            </div>
                            <div className="mt-6 sm:mt-8 flex flex-col gap-2.5 sm:gap-3">
                                <button onClick={() => setAgreementModalOpen(true)} className="w-full py-3 sm:py-4 bg-brand-primary text-white rounded-xl font-black text-[10px] sm:text-xs uppercase shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"> <Icon name="security" className="w-4 h-4"/> Convenio Socio </button>
                                <button onClick={handleJoinAcademyGroup} className="w-full py-3 sm:py-4 bg-white text-brand-primary rounded-xl font-black text-[10px] sm:text-xs uppercase shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"><Icon name="hub" className="w-4 h-4"/> Escuela Élite</button>
                            </div>
                        </div>
                    </Card>
                    <div className="lg:col-span-2 space-y-6 sm:space-y-8">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                            <Card className="p-3 sm:p-4 bg-white dark:bg-dark-surface border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl flex flex-col justify-center text-center h-24 sm:h-28"><p className="text-[8px] sm:text-[9px] text-neutral-400 font-black uppercase mb-1">Cierres Personales</p><p className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white leading-none">{wonLeads.length}</p></Card>
                            <Card className="p-3 sm:p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 shadow-sm rounded-2xl flex flex-col justify-center text-center h-24 sm:h-28"><p className="text-[8px] sm:text-[9px] text-emerald-600 font-black uppercase mb-1">Mis Comisiones</p><p className="text-base sm:text-xl font-black text-emerald-700 dark:text-emerald-400 leading-none truncate w-full px-1">{convertAndFormatCurrency(totalCommissions, userProfile.currency || 'USD')}</p></Card>
                            <Card className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 shadow-sm col-span-2 md:col-span-1 rounded-2xl flex flex-col justify-center text-center h-20 sm:h-28"><p className="text-[8px] sm:text-[9px] text-blue-600 font-black uppercase mb-1">Por Cobrar</p><p className="text-base sm:text-xl font-black text-blue-700 dark:text-blue-400 leading-none truncate w-full px-1">{convertAndFormatCurrency(pendingPayment, userProfile.currency || 'USD')}</p></Card>
                        </div>
                        <LeadManagement />
                    </div>
                </div>
            )}
            
            <section className="animate-fade-in"><EarningsSimulator /></section>
            
            <section className="grid grid-cols-2 md:grid-cols-2 gap-3 sm:gap-8">
                <FeatureCard onClick={() => setManualOpen(true)} icon="book" title="Protocolo" number={1}>Domina el workflow estratégico. Aprende a apalancarte en tu código exclusivo para incentivar cierres inmediatos y referir con autoridad.</FeatureCard>
                <FeatureCard onClick={() => setSalesToolOpen(true)} icon="market" title="Sales Copilot" number={2}>Usa nuestra IA avanzada para extraer el 100% del valor de tus propuestas comerciales en segundos.</FeatureCard>
            </section>

            <section className="animate-fade-in">
                <div className="text-center space-y-2 sm:space-y-4 max-w-4xl mx-auto mb-4 sm:mb-8 text-white">
                    <span className="text-[10px] sm:text-xs font-black text-brand-primary uppercase tracking-[0.3em] sm:tracking-[0.4em]">Portafolio</span>
                    <h2 className="text-2xl sm:text-6xl font-black tracking-tighter text-neutral-900 dark:text-white">Soluciones Vendibles</h2>
                </div>
                <div className="relative group/carousel">
                    <SolutionsCarousel />
                </div>
            </section>
            
            <section className="animate-fade-in"><StrategicPartnerBanner /></section>
            
            <TeamLeadersSection isPaid={isPartnerActive} userName={userProfile.name} onUpgrade={handleActivatePartner} />

            {isPartnerActive && <PerformanceIncentives wonLeads={wonLeads} />}

            <section>
                <h2 className="text-lg sm:text-2xl font-black text-center mb-6 sm:mb-8 tracking-tight text-neutral-800 dark:text-white">Catálogo de Comisiones</h2>
                <div className="bg-white dark:bg-dark-surface rounded-2xl sm:rounded-3xl shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                    <table className="w-full text-[8px] sm:text-xs text-left table-fixed">
                        <thead>
                            <tr className="bg-neutral-50 dark:bg-neutral-800 border-b dark:border-neutral-700">
                                <th className="p-2 sm:p-3 w-2/5 font-black uppercase text-[7px] sm:text-[9px] text-neutral-400">Solución</th>
                                <th className="p-2 sm:p-3 w-1/5 font-black uppercase text-[7px] sm:text-[9px] text-neutral-400 text-center">Inv.</th>
                                <th className="p-2 sm:p-3 w-1/5 font-black uppercase text-[7px] sm:text-[9px] text-brand-primary text-center">% Profit</th>
                                <th className="p-2 sm:p-3 w-1/5 font-black uppercase text-[7px] sm:text-[9px] text-green-600 text-center">Ganancia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-neutral-800">
                            {commissionData.map((item, index) => {
                                const gain = item.isCustom ? "Var." : convertAndFormatCurrency(item.price * (parseInt(item.commission)/100), userProfile.currency || 'USD');
                                return (
                                    <tr key={index} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                                        <td className="p-2 sm:p-3 overflow-hidden text-neutral-800 dark:text-white"><p className="font-bold leading-none truncate text-[9px] sm:text-xs">{item.service}</p></td>
                                        <td className="p-2 sm:p-3 font-black text-center text-neutral-500 truncate">{item.isCustom ? "Var." : convertAndFormatCurrency(item.price, userProfile.currency || 'USD')}</td>
                                        <td className="p-2 sm:p-3 font-black text-brand-primary text-center text-[9px] sm:text-sm">{item.commission}</td>
                                        <td className="p-2 sm:p-3 font-black text-green-600 text-center text-[9px] sm:text-sm whitespace-nowrap">{gain}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="space-y-6 pt-6 sm:pt-12 border-t border-neutral-100 dark:border-neutral-800">
                <div className="text-center text-white">
                    <h2 className="text-xl sm:text-3xl font-black tracking-tight text-neutral-800 dark:text-white">Arsenal de Ventas</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                    {resources.map((res, i) => (
                        <a key={i} href={res.url} target="_blank" rel="noopener noreferrer" className="group bg-white dark:bg-dark-surface p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-neutral-100 dark:border-neutral-800 shadow-lg hover:shadow-2xl transition-all hover:-translate-y-1 flex flex-col items-center text-center">
                            <div className="p-2.5 sm:p-4 bg-brand-primary/10 rounded-xl sm:rounded-2xl text-brand-primary mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                                <Icon name={res.icon as any} className="w-5 h-5 sm:w-6 sm:h-6"/>
                            </div>
                            <h4 className="font-black text-[10px] sm:text-sm uppercase mb-1.5 sm:mb-2 text-neutral-900 dark:text-white truncate w-full">{res.title}</h4>
                            <p className="text-[8px] sm:text-[10px] text-neutral-500 font-medium leading-tight line-clamp-2">{res.desc}</p>
                            <div className="mt-3 sm:mt-4 text-[7px] sm:text-[9px] font-black text-brand-primary uppercase tracking-widest group-hover:underline">Ver Recurso</div>
                        </a>
                    ))}
                </div>
            </section>

            <ElitePartnerAcademy />
        </div>
    );
};

export default Partners;

/** SUPER ADMIN DASHBOARD EXTENSION **/
export const SuperAdminDashboard: React.FC<{ isOpen: boolean, onClose: () => void, initialTab?: 'overview' | 'users' | 'leads' | 'kampaigner' }> = ({ isOpen, onClose, initialTab = 'users' }) => {
    const { 
        getAllUsersData, performNuclearDeletion, userProfile, currentUser, 
        allLeads, updatePartnerLead, setDeepLinkTarget, setActiveHubView, 
        setCurrentView, setToastNotification, createNotification, 
        setMailDraft, emailAccounts, isSuperAdmin, goatifyNews, automationSettings, updateUserProfile 
    } = useContext(AppContext);
    const { scheduleMeeting } = useContext(CallContext);
    
    const [usersData, setUsersData] = useState<AdminUserData[]>([]);
    const [globalStats, setGlobalStats] = useState({ app_views: 0, daily_active_users: 0, perplexity_calls: 0, gemini_calls: 0 });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [deletingUid, setDeletingUid] = useState<string | null>(null);
    const [userToDelete, setUserToDelete] = useState<AdminUserData | null>(null);
    const [isNuclearConfirmOpen, setIsNuclearConfirmOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'leads' | 'kampaigner' | 'books'>(initialTab as any);
    const [adminUserFilter, setAdminUserFilter] = useState<'all' | 'online' | 'active_today' | 'alter_ego' | 'alter_paused' | 'premium' | 'high_cost'>('all');
    const [expandedUserUid, setExpandedUserUid] = useState<string | null>(null);
    const [pausingAlterEgoUid, setPausingAlterEgoUid] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && initialTab) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);
    
    const [isUploadingVoucher, setIsUploadingVoucher] = useState<string | null>(null);
    const [isGeneratingSite, setIsGeneratingSite] = useState<string | null>(null);
    const [docPreview, setDocPreview] = useState<{ lead: PartnerLead; title: string; docType: any; generateFn: (lead: PartnerLead) => Promise<string>; initialContent?: string; } | null>(null);
    const [isSchedulingMeeting, setIsSchedulingMeeting] = useState<PartnerLead | null>(null);
    const [meetingDate, setMeetingDate] = useState('');
    const [meetingTime, setMeetingTime] = useState('');
    const [meetingNotes, setMeetingNotes] = useState('');
    const [isSavingMeeting, setIsSavingMeeting] = useState(false);
    
    const voucherInputRef = useRef<HTMLInputElement>(null);
    const currentLeadIdRef = useRef<string | null>(null);
    const currentVoucherFieldRef = useRef<'advanceVoucherUrl' | 'balanceVoucherUrl'>('advanceVoucherUrl');

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            const fetchData = async () => {
                const uData = await getAllUsersData();
                const statsSnap = await getDoc(doc(db, 'stats', 'global_metrics'));
                if (statsSnap.exists()) {
                    setGlobalStats(prev => ({ ...prev, ...(statsSnap.data() as any) }));
                }
                
                // Calcular usuarios activos hoy
                const today = new Date().toISOString().split('T')[0];
                const dau = uData.filter(u => u.usage?.counters?.last_entry_date === today).length;
                setGlobalStats(prev => ({ ...prev, daily_active_users: dau }));

                setUsersData(uData);
                setLoading(false);
            };
            fetchData();
        }
    }, [isOpen]);

    const handleNuclear = async (uid: string) => {
        setIsNuclearConfirmOpen(false);
        setDeletingUid(uid);
        try {
            await performNuclearDeletion(uid);
            setUsersData(prev => prev.filter(u => u.user.uid !== uid));
            setToastNotification({ title: "Usuario Eliminado", message: "La cuenta y todos sus datos han sido borrados.", icon: "trash" });
        } catch (e) { 
            console.error(e); 
            setToastNotification({ title: "Error", message: "No se pudo eliminar al usuario.", icon: "close" });
        } finally { 
            setDeletingUid(null); 
        }
    };
    
    const handleMakeUserPlan = async (data: AdminUserData, plan: 'free' | 'pro' | 'premium') => {
        if (!data.user.uid) return;
        try {
            const subscriptionStatus = plan === 'free' ? 'canceled' : 'active';
            await updateUserProfile(data.user.uid, { plan, subscriptionStatus } as any);
            setUsersData(prev => prev.map(item => item.user.uid === data.user.uid ? ({ ...item, user: { ...item.user, plan, subscriptionStatus } }) : item));
            setToastNotification({
                title: plan === 'free' ? 'Usuario pasado a Free' : `Usuario activado como ${plan.toUpperCase()}`,
                message: `${data.user.name || data.user.email} fue actualizado desde el panel Súper Admin.`,
                icon: 'check'
            });
        } catch (error) {
            console.error(error);
            setToastNotification({ title: 'Error', message: 'No se pudo actualizar el plan del usuario.', icon: 'close' });
        }
    };

    const adminSummary = useMemo(() => {
        const online = usersData.filter(d => getAdminPresence(d.user, d.usage).label === 'Online').length;
        const activeToday = usersData.filter(d => {
            const last = Math.max(getTimestampMs(d.user.lastSeen), getTimestampMs((d.usage as any)?.counters?.last_activity));
            return last > 0 && (Date.now() - last) < 24 * 60 * 60 * 1000;
        }).length;
        const alterEgoOn = usersData.filter(d => !!d.user.alterEgo?.enabled && !d.user.alterEgo?.adminPaused).length;
        const alterPaused = usersData.filter(d => !!d.user.alterEgo?.adminPaused).length;
        const premiumActive = usersData.filter(d => d.user.plan === 'premium' && d.user.subscriptionStatus === 'active').length;
        const proUsers = usersData.filter(d => d.user.plan === 'pro').length;
        const freeUsers = usersData.filter(d => d.user.plan === 'free').length;
        const totalApiCost = usersData.reduce((sum, d) => sum + ((d.usage as any)?.total_cost_usd || 0), 0);
        const totals = usersData.reduce((acc, d) => {
            const c: any = d.usage?.counters || {};
            acc.storageBytes += c.current_storage_bytes || 0;
            acc.images += c.monthly_images_used || 0;
            acc.socialPosts += c.monthly_posts_used || 0;
            acc.presentations += c.monthly_presentations_used || 0;
            acc.webOps += c.monthly_web_ops_used || 0;
            acc.agentResponses += c.monthly_agent_responses || 0;
            acc.videoMinutes += c.monthly_video_minutes || 0;
            acc.voiceMinutes += c.monthly_voice_minutes || 0;
            acc.grounding += c.monthly_grounding_used || 0;
            acc.crmClients += c.monthly_crm_clients_created || 0;
            acc.meetings += c.monthly_meetings_created || 0;
            acc.publishedSites += c.current_published_sites || 0;
            acc.projects += c.current_projects_count || 0;
            acc.tasks += c.current_tasks_count || 0;
            acc.tokensIn += (d.usage as any)?.tokens_in || 0;
            acc.tokensOut += (d.usage as any)?.tokens_out || 0;
            return acc;
        }, { storageBytes: 0, images: 0, socialPosts: 0, presentations: 0, webOps: 0, agentResponses: 0, videoMinutes: 0, voiceMinutes: 0, grounding: 0, crmClients: 0, meetings: 0, publishedSites: 0, projects: 0, tasks: 0, tokensIn: 0, tokensOut: 0 });
        const highCostUsers = usersData.filter(d => ((d.usage as any)?.total_cost_usd || 0) >= 0.5).length;
        const revenueSignal = (premiumActive * 19) + (proUsers * 9);
        return { online, activeToday, alterEgoOn, alterPaused, premiumActive, proUsers, freeUsers, totalApiCost, highCostUsers, revenueSignal, ...totals };
    }, [usersData]);

    const filteredUsers = usersData
        .filter(d => {
            const term = searchTerm.trim().toLowerCase();
            if (!term) return true;
            return `${d.user.name || ''} ${d.user.lastName || ''} ${d.user.email || ''} ${d.user.uid || ''}`.toLowerCase().includes(term);
        })
        .filter(d => {
            const presence = getAdminPresence(d.user, d.usage);
            const last = Math.max(getTimestampMs(d.user.lastSeen), getTimestampMs((d.usage as any)?.counters?.last_activity));
            if (adminUserFilter === 'online') return presence.label === 'Online';
            if (adminUserFilter === 'active_today') return last > 0 && (Date.now() - last) < 24 * 60 * 60 * 1000;
            if (adminUserFilter === 'alter_ego') return !!d.user.alterEgo;
            if (adminUserFilter === 'alter_paused') return !!d.user.alterEgo?.adminPaused;
            if (adminUserFilter === 'premium') return d.user.plan === 'premium';
            if (adminUserFilter === 'high_cost') return ((d.usage as any)?.total_cost_usd || 0) >= 0.5;
            return true;
        });

    const handleToggleAlterEgoPause = async (data: AdminUserData) => {
        if (!data.user.uid) return;
        const currentConfig: any = data.user.alterEgo || {
            enabled: false,
            agentName: `Alter Ego de ${data.user.name || 'Usuario'}`,
            frequencyPerDay: 12,
            mode: 'EXECUTIVE',
            scouterEnabled: false,
            proactiveSyncEnabled: false,
            privacyRulesAccepted: false,
            autonomyLevel: 80
        };
        const currentlyPaused = !!currentConfig.adminPaused;
        const nextConfig: any = {
            ...currentConfig,
            adminPaused: !currentlyPaused,
            adminPausedBy: userProfile.uid,
            adminPauseReason: currentlyPaused ? 'Reactivado desde panel Súper Admin' : 'Pausado desde panel Súper Admin'
        };

        if (currentlyPaused) {
            nextConfig.enabled = currentConfig.adminPreviousEnabled ?? true;
            nextConfig.adminResumedAt = new Date().toISOString();
        } else {
            nextConfig.adminPreviousEnabled = !!currentConfig.enabled;
            nextConfig.enabled = false;
            nextConfig.adminPausedAt = new Date().toISOString();
        }

        setPausingAlterEgoUid(data.user.uid);
        try {
            await updateDoc(doc(db, 'users', data.user.uid), { alterEgo: nextConfig });
            setUsersData(prev => prev.map(item => item.user.uid === data.user.uid ? ({ ...item, user: { ...item.user, alterEgo: nextConfig } }) : item));
            setToastNotification({
                title: currentlyPaused ? 'Alter Ego reactivado' : 'Alter Ego pausado',
                message: `${data.user.name || 'Usuario'} ${currentlyPaused ? 'puede volver a usar su motor autónomo.' : 'queda sin latidos autónomos ni consumo de IA.'}`,
                icon: currentlyPaused ? 'check' : 'lock'
            });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: 'Error', message: 'No se pudo actualizar el Alter Ego.', icon: 'close' });
        } finally {
            setPausingAlterEgoUid(null);
        }
    };

    const handleStatusChange = async (leadId: string, status: any) => {
        await updatePartnerLead(leadId, { status });
    };

    const handleTotalValueChange = async (leadId: string, value: string) => {
        if(!value) return;
        const total = parseFloat(value);
        await updatePartnerLead(leadId, { 
            finalValue: total,
            advanceValue: total / 2,
            balanceValue: total / 2
        });
    };

    const handleAdvanceValueChange = async (leadId: string, value: string) => {
        if(!value) return;
        await updatePartnerLead(leadId, { advanceValue: parseFloat(value) });
    };

    const handleBalanceValueChange = async (leadId: string, value: string) => {
        if(!value) return;
        await updatePartnerLead(leadId, { balanceValue: parseFloat(value) });
    };

    const togglePaidState = async (leadId: string, field: 'advancePaid' | 'balancePaid', current: boolean) => {
        const lead = allLeads.find(l => l.id === leadId);
        if (!lead) return;

        await updatePartnerLead(leadId, { [field]: !current });

        // NOTIFICACIÓN AL SOCIO SI SE VALIDA EL PAGO
        if (!current) {
            const amount = field === 'advancePaid' ? (lead.advanceValue || lead.estimatedValue / 2) : (lead.balanceValue || lead.estimatedValue / 2);
            const msg = `💰 **Pago Validado**: Se ha verificado el pago del **${field === 'advancePaid' ? 'Anticipo' : 'Saldo Final'}** por un valor de **$${amount} USD** para el cliente **${lead.clientName}**.`;
            
            await createNotification(lead.partnerId, {
                type: 'general',
                text: msg,
                link: '/#partners',
                fromUser: { uid: 'system_crm', name: 'Goatify Finance', avatarUrl: null }
            });
            
            // Abrir Borrador de Mail Automático al Socio
            const socio = usersData.find(u => u.user.uid === lead.partnerId)?.user;
            if (socio && socio.email) {
                const commissionRate = lead.commissionRate ?? 0.35;
                const percentage = (commissionRate * 100).toFixed(0);
                const comisionValue = (amount * commissionRate).toFixed(2);
                
                const subject = `💰 Comprobante de Comisión: ${lead.clientName}`;
                const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 30px 10px; background-color: #f3f4f6;">
<div style="font-family: 'Inter', Arial, sans-serif; width: 100%; max-width: 600px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 20px; color: #111827; margin: 0 auto; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
    <div style="background-color: #10B981; padding: 40px 30px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.02em;">¡COMISIÓN LIBERADA!</h2>
        <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0 0; font-size: 14px; font-weight: 600; text-transform: uppercase;">Goatify Finance Hub</p>
    </div>
    
    <div style="padding: 40px 30px;">
        <p style="font-size: 16px; color: #374151; line-height: 1.6;">Hola <b>${socio.name || 'Socio'}</b>,</p>
        <p style="font-size: 16px; color: #374151; line-height: 1.6;">Nos complace informarte que hemos validado exitosamente el ingreso del cliente y tu comisión ha sido procesada. Aquí tienes el desglose técnico de la operación:</p>
        
        <div style="background-color: #f9fafb; border-radius: 16px; padding: 25px; border: 1px solid #f3f4f6; margin: 30px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">PROSPECTO / CLIENTE</td>
                    <td style="padding: 10px 0; text-align: right; color: #111827; font-weight: 800;">${lead.clientName}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">PRODUCTO / SERVICIO</td>
                    <td style="padding: 10px 0; text-align: right; color: #111827; font-weight: 700;">${lead.serviceType || 'Solución Goatify'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">FASE DE PAGO</td>
                    <td style="padding: 10px 0; text-align: right; color: #10B981; font-weight: 800; text-transform: uppercase;">${field === 'advancePaid' ? 'Anticipo' : 'Saldo Final'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">VALOR BASE (USD)</td>
                    <td style="padding: 10px 0; text-align: right; color: #111827; font-weight: 800;">$${amount}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">% COMISIÓN ACORDADA</td>
                    <td style="padding: 10px 0; text-align: right; color: #2F4AE4; font-weight: 800;">${percentage}%</td>
                </tr>
                <tr><td colspan="2" style="padding: 15px 0; border-bottom: 1px dashed #e5e7eb;"></td></tr>
                <tr>
                    <td style="padding: 20px 0 0 0; color: #111827; font-size: 18px; font-weight: 900;">TU GANANCIA</td>
                    <td style="padding: 20px 0 0 0; text-align: right; color: #10B981; font-size: 26px; font-weight: 900;">$${comisionValue} USD</td>
                </tr>
            </table>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 30px;">El saldo ha sido acreditado en tu panel de control y puede ser retirado según las políticas de tu plan.</p>
        
        <div style="text-align: center;">
            <a href="https://ia.goatify.app/#/partners" style="background-color: #111827; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 800; display: inline-block; font-size: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">Ver mi Dashboard de Socio</a>
        </div>
    </div>
    
    <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #f3f4f6;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;"><b>Goatify Innovation Lab</b><br/>Departamento de Cierres y Comisiones</p>
    </div>
</div>
</body>
</html>`;

                setMailDraft({
                    to: socio.email,
                    subject: subject,
                    htmlBody: htmlBody
                });
                onClose(); // Cerrar dashboard admin para mostrar el mailer
                setTimeout(() => {
                    setCurrentView('mail');
                    setToastNotification({ 
                        title: "Borrador de Comisión", 
                        message: "Se ha generado el comprobante con el desglose del prospecto.", 
                        icon: "mail" 
                    });
                }, 300);
            }
        }
    };

    const handleVoucherClick = (leadId: string, field: 'advanceVoucherUrl' | 'balanceVoucherUrl') => {
        currentLeadIdRef.current = leadId;
        currentVoucherFieldRef.current = field;
        voucherInputRef.current?.click();
    };

    const handleUploadVoucher = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const leadId = currentLeadIdRef.current;
        const field = currentVoucherFieldRef.current;
        if (!file || !leadId || !currentUser) return;
        
        setIsUploadingVoucher(`${leadId}-${field}`);
        try {
            const { url } = await uploadWithQuotaCheck({
                userId: currentUser.uid,
                data: file,
                path: safeStoragePath('vouchers', currentUser.uid, leadId, `${field}_${Date.now()}_${file.name}`),
                sizeBytes: file.size,
                metadata: { contentType: file.type || 'application/octet-stream' },
                plan: userProfile.plan
            });
            await updatePartnerLead(leadId, { [field]: url });
            setToastNotification({ title: "Comprobante Subido", message: "Archivo vinculado correctamente.", icon: "check" });
        } catch (err) {
            console.error(err);
            setToastNotification({ title: "Error", message: "No se pudo subir el archivo.", icon: "close" });
        } finally {
            setIsUploadingVoucher(null);
            currentLeadIdRef.current = null;
            if (voucherInputRef.current) voucherInputRef.current.value = '';
        }
    };

    const handleGoToChat = (partnerId: string) => {
        onClose();
        const convoId = [currentUser?.uid, partnerId].sort().join('_');
        setCurrentView('hub');
        setActiveHubView('messages');
        setDeepLinkTarget({ view: 'messages', id: convoId });
        window.location.hash = `hub/messages/${convoId}`;
    };

    const copyMeetingLink = (link: string) => {
        navigator.clipboard.writeText(link);
        setToastNotification({ title: "Copiado", message: "Enlace de reunión copiado.", icon: 'copy' });
    };

    const handleOpenDocPreview = (lead: PartnerLead, type: any, title: string, genFn: (l: PartnerLead) => Promise<string>, initialContent?: string) => {
        setDocPreview({ lead, docType: type, title, generateFn: genFn, initialContent });
    };

    const handleResolveRequest = async (leadId: string, requestId: string, section: string) => {
        const lead = allLeads.find(l => l.id === leadId);
        if (!lead) return;
        
        const updatedRequests = (lead.changeRequests || []).map(r => r.id === requestId ? { ...r, status: 'resolved' as const } : r);
        const updates: any = { 
            changeRequests: updatedRequests,
            clientSiteUrl: null, 
            hasProposal: false, hasPrefactura: false, hasContrato: false 
        };
        await updatePartnerLead(leadId, updates);
        
        let docType: any = 'proposalText';
        let title = 'ESTRATEGIA';
        let genFn = (l: PartnerLead) => generateAiQuotation(l.clientName, l.serviceType, l.notes, l.estimatedValue, userProfile.name, undefined, l.notes);

        if (section.toLowerCase().includes('inversion') || section.toLowerCase().includes('preinvoice')) {
            docType = lead.preInvoiceEcuText ? 'preInvoiceEcuText' : 'preInvoiceLatText';
            title = lead.preInvoiceEcuText ? 'PREFACTURA ECU' : 'PREFACTURA LAT';
            genFn = (l: PartnerLead) => generatePartnerPreInvoice(l, userProfile.name, lead.preInvoiceEcuText ? 'Ecuador' : 'Latinoamérica');
        } else if (section.toLowerCase().includes('contrato') || section.toLowerCase().includes('contract')) {
            docType = lead.contractEcuText ? 'contractEcuText' : 'contractLatText';
            title = lead.contractEcuText ? 'CONTRATO ECU' : 'CONTRATO LAT';
            genFn = (l: PartnerLead) => generatePartnerContract(l, userProfile.name, lead.contractEcuText ? 'Ecuador' : 'Internacional');
        }
        
        handleOpenDocPreview(lead, docType, title, genFn);
        setToastNotification({ title: "Abriendo Editor", message: "Resolviendo solicitud de cambio...", icon: 'edit' });
    };

    const handleOpenSchedule = (lead: PartnerLead) => {
        setIsSchedulingMeeting(lead);
        const now = new Date();
        now.setMinutes(now.getMinutes() + 60);
        setMeetingDate(now.toISOString().split('T')[0]);
        setMeetingTime(now.toTimeString().slice(0, 5));
    };

    const handleConfirmScheduleMeeting = async () => {
        if (!isSchedulingMeeting || !meetingDate || !meetingTime) return;
        setIsSavingMeeting(true);
        try {
            const scheduledAt = `${meetingDate}T${meetingTime}:00`;
            const title = `🤝 CIERRE: ${isSchedulingMeeting.clientName}`;
            const adminsSnap = await getDocs(query(collection(db, "users"), where("email", "in", SUPER_ADMIN_EMAILS)));
            const link = await scheduleMeeting(title, scheduledAt, adminsSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)), meetingNotes);
            await updatePartnerLead(isSchedulingMeeting.id, { meetingUrl: link, meetingDate: scheduledAt, status: 'meeting' });
            setToastNotification({ title: "Reunión Agendada", message: "Link de Meet generado.", icon: 'check' });
        } catch (e) { console.error(e); } finally { setIsSchedulingMeeting(null); setIsSavingMeeting(false); }
    };

    const handleGenerateClientSite = async (lead: PartnerLead) => {
        if (!currentUser) return;
        setIsGeneratingSite(lead.id);
        setToastNotification({ title: "Diseñando Sitio", message: "IA construyendo...", icon: "ai", isLoading: true });
        try {
            const htmlCode = await generatePartnerClientSiteHtml(lead, userProfile.name, userProfile.partnerCode || 'GTFY', userProfile.country || 'Global');
            const siteRef = await addDoc(collection(db, 'published_sites'), {
                ownerId: currentUser.uid, brandName: `Propuesta: ${lead.clientName}`, htmlCode: htmlCode, createdAt: new Date().toISOString(), active: true, isPartnerSite: true, leadId: lead.id
            });
            const link = `${window.location.origin}/#/site/${siteRef.id}`;
            await updatePartnerLead(lead.id, { clientSiteUrl: link } as any);
            setToastNotification({ title: "Sitio Publicado", message: "Link copiado.", icon: "rocket" });
            navigator.clipboard.writeText(link);
        } catch (error) { console.error(error); } finally { setIsGeneratingSite(null); }
    };

    if (!isSuperAdmin) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Acceso Denegado">
                <div className="p-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                        <Icon name="lock" className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-xl font-bold">Sin Permisos</h3>
                    <p className="text-sm text-neutral-500">Este panel está restringido exclusivamente a coordinadores de Goatify.</p>
                    <Button onClick={onClose} className="w-full">Cerrar</Button>
                </div>
            </Modal>
        );
    }

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Panel de Comando Súper Admin Goatify" className="max-w-[100vw] h-[100dvh] !max-h-[100dvh] !rounded-none" noPadding>
            <div className="flex flex-col h-full min-h-0 p-4 sm:p-5 bg-neutral-50 dark:bg-neutral-950">
                {docPreview && (
                    <LeadDocPreviewModal 
                        isOpen={!!docPreview} 
                        onClose={() => setDocPreview(null)} 
                        lead={docPreview.lead}
                        title={docPreview.title}
                        docType={docPreview.docType}
                        generateFn={docPreview.generateFn}
                        initialContent={docPreview.initialContent}
                    />
                )}

                <Modal 
                    isOpen={!!isSchedulingMeeting} 
                    onClose={() => setIsSchedulingMeeting(null)} 
                    title={`Agendar Cierre: ${isSchedulingMeeting?.clientName}`} 
                    zIndex="z-[150000]"
                >
                     <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-black text-neutral-500 mb-1 block">Fecha</label><Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} /></div>
                            <div><label className="text-xs font-black text-neutral-500 mb-1 block">Hora</label><Input type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} /></div>
                        </div>
                        <Textarea value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} rows={3} placeholder="Notas..." />
                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button variant="secondary" onClick={() => setIsSchedulingMeeting(null)}>Cancelar</Button>
                            <Button onClick={handleConfirmScheduleMeeting} disabled={!meetingDate || !meetingTime || isSavingMeeting}>{isSavingMeeting ? <Spinner className="w-4 h-4 text-white" /> : "Agendar"}</Button>
                        </div>
                     </div>
                </Modal>

                <input type="file" ref={voucherInputRef} className="hidden" accept="application/pdf,image/*" onChange={handleUploadVoucher} />
                <div className="flex flex-wrap gap-4 sm:gap-6 mb-6 border-b dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 p-2 rounded-xl items-center justify-between">
                    <div className="flex gap-3 flex-wrap">
                        <button onClick={() => setActiveTab('overview')} className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'overview' ? 'bg-neutral-950 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>
                            <Icon name="dashboard" className="w-4 h-4"/> Comando
                        </button>
                        <button onClick={() => setActiveTab('users')} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'users' ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>
                            <Icon name="users" className="w-4 h-4"/> Gestión de Usuarios ({usersData.length})
                        </button>
                        <button onClick={() => setActiveTab('leads')} className={`px-4 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'leads' ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>
                            <Icon name="market" className="w-4 h-4"/> Ventas ({allLeads.length})
                        </button>
                        <button onClick={() => setActiveTab('kampaigner')} className={`px-4 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'kampaigner' ? 'bg-brand-accent text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>
                            <Icon name="send" className="w-4 h-4"/> Kampaigner
                        </button>
                        <button onClick={() => setActiveTab('books')} className={`px-4 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'books' ? 'bg-amber-500 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>
                            <Icon name="book" className="w-4 h-4"/> Guías de Libros
                        </button>
                    </div>
                    <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 px-4 py-2 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600">
                            <Icon name="chart" className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Tráfico App</p>
                            <p className="text-sm font-black text-brand-primary leading-none">{globalStats.app_views.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 px-4 py-2 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                            <Icon name="users" className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Activos Hoy</p>
                            <p className="text-sm font-black text-emerald-600 leading-none">{globalStats.daily_active_users}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 px-4 py-2 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600">
                            <Icon name="search" className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">IA Perplexity</p>
                            <p className="text-sm font-black text-blue-600 leading-none">{globalStats.perplexity_calls || 0}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 px-4 py-2 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600">
                            <Icon name="ai" className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">IA Gemini</p>
                            <p className="text-sm font-black text-indigo-600 leading-none">{globalStats.gemini_calls || 0}</p>
                        </div>
                    </div>
                </div>

                {activeTab === 'overview' ? (
                    <div className="flex-1 overflow-auto custom-scrollbar space-y-5 pb-8">
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                            {[
                                { label: 'Usuarios', value: usersData.length, icon: 'users', tone: 'text-brand-primary' },
                                { label: 'Online', value: adminSummary.online, icon: 'activity', tone: 'text-emerald-600' },
                                { label: 'Activos 24h', value: adminSummary.activeToday, icon: 'clock', tone: 'text-amber-600' },
                                { label: 'Free', value: adminSummary.freeUsers, icon: 'user', tone: 'text-neutral-500' },
                                { label: 'Pro', value: adminSummary.proUsers, icon: 'rocket', tone: 'text-blue-600' },
                                { label: 'Premium', value: adminSummary.premiumActive, icon: 'star', tone: 'text-amber-500' },
                                { label: 'Costo IA', value: `$${adminSummary.totalApiCost.toFixed(2)}`, icon: 'wallet', tone: 'text-red-500' },
                                { label: 'MRR señal', value: `$${adminSummary.revenueSignal}`, icon: 'chart', tone: 'text-emerald-600' }
                            ].map((stat: any) => (
                                <Card key={stat.label} className="p-4 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                                    <div className="flex items-center justify-between mb-3"><Icon name={stat.icon} className={`w-5 h-5 ${stat.tone}`} /><span className="text-xl font-black tabular-nums">{stat.value}</span></div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{stat.label}</p>
                                </Card>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                            <Card className="p-5 border border-neutral-200 dark:border-neutral-800 xl:col-span-2">
                                <div className="flex items-center justify-between mb-4"><div><h3 className="text-xl font-black">Uso operativo global</h3><p className="text-xs text-neutral-500">IA, storage, contenidos, agentes, CRM y activos digitales.</p></div><Button size="sm" variant="secondary" onClick={() => setActiveTab('users')}>Administrar usuarios</Button></div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        ['Storage total', formatAdminBytes(adminSummary.storageBytes), 'folder'],
                                        ['Imágenes IA', adminSummary.images, 'image'],
                                        ['Posts social', adminSummary.socialPosts, 'share'],
                                        ['Presentaciones', adminSummary.presentations, 'presentation'],
                                        ['Web ops', adminSummary.webOps, 'code'],
                                        ['Agent responses', adminSummary.agentResponses, 'agent'],
                                        ['Grounding/Web', adminSummary.grounding, 'search'],
                                        ['Videos/voz min', `${adminSummary.videoMinutes}/${adminSummary.voiceMinutes}`, 'video'],
                                        ['CRM clientes', adminSummary.crmClients, 'market'],
                                        ['Meetings', adminSummary.meetings, 'calendar'],
                                        ['Sitios publicados', adminSummary.publishedSites, 'rocket'],
                                        ['Proyectos/Tareas', `${adminSummary.projects}/${adminSummary.tasks}`, 'layers']
                                    ].map(([label, value, icon]: any) => (
                                        <div key={label} className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800">
                                            <div className="flex items-center justify-between gap-2"><Icon name={icon} className="w-4 h-4 text-brand-primary"/><span className="text-lg font-black">{value}</span></div>
                                            <p className="text-[9px] mt-2 uppercase tracking-widest font-black text-neutral-400">{label}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card className="p-5 border border-neutral-200 dark:border-neutral-800">
                                <h3 className="text-xl font-black mb-4">Alertas ejecutivas</h3>
                                <div className="space-y-3 text-sm">
                                    <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40"><b>{adminSummary.highCostUsers}</b> usuario(s) con costo API alto.</div>
                                    <div className="p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-900/40"><b>{adminSummary.alterEgoOn}</b> Alter Ego activos y <b>{adminSummary.alterPaused}</b> pausados.</div>
                                    <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40">Tokens: {(adminSummary.tokensIn + adminSummary.tokensOut).toLocaleString()} total estimado.</div>
                                    <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">Tráfico registrado: {globalStats.app_views.toLocaleString()} vistas app.</div>
                                </div>
                            </Card>
                        </div>

                        <Card className="p-5 border border-neutral-200 dark:border-neutral-800">
                            <div className="flex items-center justify-between mb-4"><h3 className="text-xl font-black">Top consumo IA / Storage</h3><span className="text-[10px] font-black uppercase text-neutral-400">Ranking operativo</span></div>
                            <div className="overflow-auto custom-scrollbar">
                                <table className="w-full text-xs min-w-[900px]">
                                    <thead><tr className="text-left text-neutral-400 uppercase tracking-widest"><th className="p-3">Usuario</th><th className="p-3">Plan</th><th className="p-3">Costo IA</th><th className="p-3">Storage</th><th className="p-3">Posts</th><th className="p-3">Imágenes</th><th className="p-3 text-right">Acción</th></tr></thead>
                                    <tbody className="divide-y dark:divide-neutral-800">
                                        {[...usersData].sort((a,b) => (((b.usage as any)?.total_cost_usd || 0) + ((b.usage?.counters?.current_storage_bytes || 0) / 1e9)) - (((a.usage as any)?.total_cost_usd || 0) + ((a.usage?.counters?.current_storage_bytes || 0) / 1e9))).slice(0, 12).map(data => (
                                            <tr key={data.user.uid} className="hover:bg-neutral-50 dark:hover:bg-neutral-900"><td className="p-3 font-bold">{data.user.name}<div className="text-[10px] text-neutral-500">{data.user.email}</div></td><td className="p-3 uppercase font-black">{data.user.plan}</td><td className="p-3 text-red-500 font-black">${((data.usage as any)?.total_cost_usd || 0).toFixed(4)}</td><td className="p-3">{formatAdminBytes(data.usage?.counters?.current_storage_bytes)}</td><td className="p-3">{data.usage?.counters?.monthly_posts_used || 0}</td><td className="p-3">{data.usage?.counters?.monthly_images_used || 0}</td><td className="p-3 text-right"><Button size="sm" variant="secondary" onClick={() => { setExpandedUserUid(data.user.uid); setActiveTab('users'); }}>Ver</Button></td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                ) : activeTab === 'users' ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
                            {[
                                { key: 'online', label: 'Online ahora', value: adminSummary.online, icon: 'activity', tone: 'emerald' },
                                { key: 'active_today', label: 'Activos 24h', value: adminSummary.activeToday, icon: 'clock', tone: 'amber' },
                                { key: 'alter_ego', label: 'Alter Ego ON', value: adminSummary.alterEgoOn, icon: 'brain', tone: 'indigo' },
                                { key: 'alter_paused', label: 'Alter pausado', value: adminSummary.alterPaused, icon: 'lock', tone: 'red' },
                                { key: 'premium', label: 'Premium activo', value: adminSummary.premiumActive, icon: 'star', tone: 'yellow' },
                                { key: 'high_cost', label: 'Costo API', value: `$${adminSummary.totalApiCost.toFixed(2)}`, icon: 'wallet', tone: 'purple' }
                            ].map((stat: any) => (
                                <button key={stat.key} onClick={() => setAdminUserFilter(adminUserFilter === stat.key ? 'all' : stat.key)} className={`p-3 rounded-2xl border text-left transition-all hover:-translate-y-0.5 ${adminUserFilter === stat.key ? 'bg-neutral-900 text-white border-neutral-900 shadow-xl' : 'bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 hover:border-brand-primary/40'}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className={`p-2 rounded-xl ${adminUserFilter === stat.key ? 'bg-white/10 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-brand-primary'}`}><Icon name={stat.icon as any} className="w-4 h-4" /></div>
                                        <span className="text-lg font-black tabular-nums">{stat.value}</span>
                                    </div>
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mt-2">{stat.label}</p>
                                </button>
                            ))}
                        </div>

                        <div className="mb-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-center"> 
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"><Icon name="search" className="w-4 h-4"/></div>
                                <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar usuario, email o UID..." className="pl-10" /> 
                            </div>
                            <select value={adminUserFilter} onChange={e => setAdminUserFilter(e.target.value as any)} className="h-11 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 text-xs font-black uppercase tracking-widest text-neutral-500">
                                <option value="all">Todos</option>
                                <option value="online">Online ahora</option>
                                <option value="active_today">Activos 24h</option>
                                <option value="alter_ego">Con Alter Ego</option>
                                <option value="alter_paused">Alter Ego pausado</option>
                                <option value="premium">Premium</option>
                                <option value="high_cost">Costo API alto</option>
                            </select>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar border border-gray-200 dark:border-gray-700 rounded-2xl shadow-inner bg-white dark:bg-neutral-950">
                            <table className="w-full text-xs text-left border-collapse min-w-[1680px]">
                                <thead className="bg-neutral-100 dark:bg-neutral-900 sticky top-0 z-20 shadow-sm border-b dark:border-neutral-800">
                                    <tr className="font-black uppercase tracking-widest text-neutral-400">
                                        <th className="p-4">Usuario</th>
                                        <th className="p-4">Plan / Status</th>
                                        <th className="p-4 text-center">Actividad</th>
                                        <th className="p-4 text-center">Alter Ego</th>
                                        <th className="p-4 text-center">Créditos IA Hoy</th>
                                        <th className="p-4 text-center">Imágenes (Mes)</th>
                                        <th className="p-4 text-center">Activos Digitales</th>
                                        <th className="p-4 text-center">Web / Proy</th>
                                        <th className="p-4 text-center">Acceso (D/T)</th>
                                        <th className="p-4 text-center">Saldo / API Cost</th>
                                        <th className="p-4 text-center">Alertas Uso</th>
                                        <th className="p-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-neutral-900">
                                    {loading ? (
                                        <tr><td colSpan={12} className="p-20 text-center"><Spinner text="Analizando sistema..."/></td></tr>
                                    ) : filteredUsers.map((data) => {
                                        const presence = getAdminPresence(data.user, data.usage);
                                        const lastActivityTs = Math.max(getTimestampMs(data.user.lastSeen), getTimestampMs((data.usage as any)?.counters?.last_activity));
                                        const alter = data.user.alterEgo;
                                        const isAlterPaused = !!alter?.adminPaused;
                                        const isAlterOn = !!alter?.enabled && !isAlterPaused;
                                        return (
                                            <React.Fragment key={data.user.uid}>
                                            <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar user={data.user} size="sm" />
                                                        <div>
                                                            <div className="font-black text-neutral-900 dark:text-white flex items-center gap-1.5 leading-tight">
                                                                {data.user.name} {data.user.lastName}
                                                                {data.user.isSuperAdmin && <Icon name="security" className="w-3 h-3 text-brand-primary" title="Súper Admin"/>}
                                                            </div>
                                                            <div className="text-neutral-500 text-[10px] leading-tight mt-0.5">{data.user.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase w-fit ${data.user.plan === 'premium' ? 'bg-amber-100 text-amber-700' : data.user.plan === 'pro' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                                            {data.user.plan}
                                                        </span>
                                                        {data.user.subscriptionStatus === 'canceled' && <span className="text-[8px] font-bold text-red-500 uppercase px-1.5 py-0.5 bg-red-100 rounded-md w-fit">Cancelado</span>}
                                                        {data.user.subscriptionStatus === 'trialing' && <span className="text-[8px] font-bold text-yellow-600 uppercase px-1.5 py-0.5 bg-yellow-100 rounded-md w-fit">Trial</span>}
                                                        {data.user.subscriptionStatus === 'active' && <span className="text-[8px] font-bold text-green-600 uppercase px-1.5 py-0.5 bg-green-100 rounded-md w-fit">Activo</span>}
                                                        {data.usage && data.user.plan !== 'free' && (
                                                            <div className="text-[8px] text-neutral-500 mt-1 uppercase font-semibold">
                                                                Fin: {new Date(data.usage.billing_cycle_end).toLocaleDateString()}
                                                            </div>
                                                        )}
                                                        {data.user.active === false && <span className="text-[8px] font-bold text-red-500 uppercase mt-1">Inactivo</span>}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full ${presence.bg}`}>
                                                        <span className={`w-2 h-2 rounded-full ${presence.dot}`}></span>
                                                        <span className={`text-[10px] font-black uppercase ${presence.text}`}>{presence.label}</span>
                                                    </div>
                                                    <div className="text-[9px] text-neutral-500 font-bold mt-1">{formatAdminRelativeTime(lastActivityTs)}</div>
                                                    <div className="text-[8px] text-neutral-400 mt-0.5">Racha: {data.user.dailyActivityStreak || 0}d</div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {alter ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${isAlterPaused ? 'bg-red-100 text-red-700' : isAlterOn ? 'bg-cyan-100 text-cyan-700' : 'bg-neutral-100 text-neutral-500'}`}>
                                                                {isAlterPaused ? 'Pausado' : isAlterOn ? 'Activo' : 'Dormido'}
                                                            </span>
                                                            <span className="text-[8px] font-bold text-neutral-500 truncate max-w-[120px]" title={alter.agentName}>{alter.agentName || 'Sin alias'}</span>
                                                            <span className="text-[8px] text-neutral-400">{alter.frequencyPerDay || 0} lat/día · {alter.mode || 'EXECUTIVE'}</span>
                                                            <button
                                                                onClick={() => handleToggleAlterEgoPause(data)}
                                                                disabled={pausingAlterEgoUid === data.user.uid}
                                                                className={`mt-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase transition-all ${isAlterPaused ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white' : 'bg-red-100 text-red-700 hover:bg-red-600 hover:text-white'}`}
                                                            >
                                                                {pausingAlterEgoUid === data.user.uid ? '...' : isAlterPaused ? 'Reactivar' : 'Pausar'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[9px] font-bold text-neutral-400 uppercase">No creado</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {(() => {
                                                        const conf = getPlanConfig(data.user.plan);
                                                        const limit = (conf.limits as any).ai_chat_daily_queries || 0;
                                                        
                                                        // RESET VISUAL: Si no es hoy, el contador es 0 aunque en DB sea viejo
                                                        const lastResetStr = data.usage?.counters?.last_daily_reset;
                                                        const now = new Date();
                                                        const lastReset = lastResetStr ? new Date(lastResetStr) : new Date(0);
                                                        const isToday = now.getUTCDate() === lastReset.getUTCDate() && 
                                                                       now.getUTCMonth() === lastReset.getUTCMonth() && 
                                                                       now.getUTCFullYear() === lastReset.getUTCFullYear();
                                                        
                                                        const current = isToday ? (data.usage?.counters?.daily_chat_count || 0) : 0;
                                                        
                                                        return (
                                                            <div className="flex flex-col items-center">
                                                                <span className={`text-sm font-black ${current >= limit ? 'text-red-500' : 'text-brand-primary'}`}>{current} / {limit === 999999 ? '∞' : limit}</span>
                                                                <div className="w-16 h-1 bg-gray-100 dark:bg-gray-800 rounded-full mt-1 overflow-hidden">
                                                                    <div className={`h-full ${current >= limit ? 'bg-red-500' : 'bg-brand-primary'}`} style={{ width: `${Math.min(100, (current / (limit || 1)) * 100)}%` }} />
                                                                </div>
                                                                {!isToday && current === 0 && (
                                                                    <div className="text-[7px] text-neutral-400 uppercase mt-0.5 font-bold">Reseteado</div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {(() => {
                                                        const conf = getPlanConfig(data.user.plan);
                                                        const limit = (conf.limits as any).ai_images_monthly || 0;
                                                        const current = data.usage?.counters?.monthly_images_used || 0;
                                                        return (
                                                            <div className="flex flex-col items-center">
                                                                <span className={`text-sm font-black ${current >= limit ? 'text-amber-500' : 'text-indigo-600'}`}>{current} / {limit}</span>
                                                                <div className="w-16 h-1 bg-gray-100 dark:bg-gray-800 rounded-full mt-1 overflow-hidden">
                                                                    <div className={`h-full ${current >= limit ? 'bg-amber-500' : 'bg-indigo-600'}`} style={{ width: `${Math.min(100, (current / (limit || 1)) * 100)}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex flex-wrap justify-center gap-3">
                                                        <div className="flex flex-col items-center" title="Agentes IA">
                                                            <Icon name="agent" className="w-3.5 h-3.5 text-indigo-500"/>
                                                            <span className="text-[10px] font-black">{data.usage?.counters?.current_agents_count || 0}</span>
                                                        </div>
                                                        <div className="flex flex-col items-center" title="Formularios Activos">
                                                            <Icon name="copy" className="w-3.5 h-3.5 text-emerald-500"/>
                                                            <span className="text-[10px] font-black">{data.usage?.counters?.current_forms_count || 0}</span>
                                                        </div>
                                                        <div className="flex flex-col items-center" title="Automatización/Schedulers">
                                                            <Icon name="calendar" className="w-3.5 h-3.5 text-amber-500"/>
                                                            <span className="text-[10px] font-black">{data.usage?.counters?.monthly_meetings_created || 0}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <Icon name="rocket" className="w-3 h-3 text-purple-500" title="Sitios Web Publicados"/>
                                                            <span className="text-[11px] font-black text-purple-600">{data.usage?.counters?.current_published_sites || 0}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <Icon name="layers" className="w-3 h-3 text-blue-500" title="Proyectos Activos"/>
                                                            <span className="text-[10px] font-bold text-blue-600">
                                                                {data.usage?.counters?.current_projects_count || 0}P | {data.usage?.counters?.current_tasks_count || 0}T
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-brand-primary">{data.usage?.counters?.daily_entry_count || 0}</span>
                                                        <span className="text-[8px] text-neutral-400 font-bold border-t border-neutral-100 dark:border-neutral-800 mt-0.5 pt-0.5">{(data.user as any).entryCount || 0} Total</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="inline-flex items-center bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-lg border border-amber-100 dark:border-amber-900/30">
                                                            <span className="font-black text-amber-600 text-[10px]">{(data.user.intisBalance || 0).toFixed(1)} $I</span>
                                                        </div>
                                                        <span className="text-[9px] font-bold text-red-500">
                                                            ${(data.usage?.total_cost_usd || 0).toFixed(4)} USD
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    {(() => {
                                                        const conf = getPlanConfig(data.user.plan);
                                                        const lim = conf.limits as any;
                                                        const dailyChat = data.usage?.counters?.daily_chat_count || 0;
                                                        const images = data.usage?.counters?.monthly_images_used || 0;
                                                        const budget = data.usage?.total_cost_usd || 0;
                                                        const maxBudget = conf.ai_budget_usd || 1;
                                                        
                                                        const pMax = Math.max(
                                                            (dailyChat / (lim.ai_chat_daily_queries || 1)) * 100,
                                                            (images / (lim.ai_images_monthly || 1)) * 100,
                                                            (budget / maxBudget) * 100
                                                        );
                                                        const isAlert = pMax > 85;
                                                        return (
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden min-w-[60px] border border-neutral-200 dark:border-neutral-700">
                                                                    <div className={`h-full transition-all ${isAlert ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : pMax > 60 ? 'bg-amber-500' : 'bg-brand-primary'}`} style={{ width: `${Math.min(100, pMax)}%` }} />
                                                                </div>
                                                                {isAlert && <Icon name="info" className="w-4 h-4 text-red-600 animate-bounce" title="¡ALERTA DE ALTO CONSUMO!"/>}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-1 items-center">
                                                        <button
                                                            onClick={() => setExpandedUserUid(expandedUserUid === data.user.uid ? null : data.user.uid)}
                                                            title="Ver detalle operativo"
                                                            className="p-1.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-900 hover:text-white transition-all shadow-sm"
                                                        >
                                                            <Icon name="search" className="w-3.5 h-3.5"/>
                                                        </button>
                                                        <button onClick={() => handleMakeUserPlan(data, 'free')} title="Pasar a Free" className="px-2 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-700 hover:text-white transition-all shadow-sm text-[9px] font-black uppercase">Free</button>
                                                        <button onClick={() => handleMakeUserPlan(data, 'pro')} title="Hacer Pro" className="px-2 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm text-[9px] font-black uppercase">Pro</button>
                                                        <button onClick={() => handleMakeUserPlan(data, 'premium')} title="Hacer Premium" className="px-2 py-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-500 hover:text-white transition-all shadow-sm text-[9px] font-black uppercase">Premium</button>
                                                        <button 
                                                            onClick={() => {
                                                                setMailDraft({
                                                                    to: data.user.email,
                                                                    subject: 'Bienvenido a Goatify: Tu Infraestructura de Negocio de Alto Rendimiento',
                                                                    htmlBody: constructWelcomeEmailHtml(data.user.name)
                                                                });
                                                                onClose();
                                                                setTimeout(() => setCurrentView('mail'), 300);
                                                            }} 
                                                            title="Enviar Bienvenida Manual"
                                                            className="p-1.5 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-600 hover:text-white transition-all shadow-sm"
                                                        >
                                                            <Icon name="user" className="w-3.5 h-3.5"/>
                                                        </button>
                                                        <button onClick={() => handleGoToChat(data.user.uid)} className="p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg hover:bg-brand-primary hover:text-white transition-all shadow-sm"><Icon name="message" className="w-3.5 h-3.5"/></button>
                                                        {deletingUid === data.user.uid ? (
                                                            <span className="text-red-500 font-bold animate-pulse text-[10px]">...</span>
                                                        ) : (
                                                            <button 
                                                                onClick={() => {
                                                                    setUserToDelete(data);
                                                                    setIsNuclearConfirmOpen(true);
                                                                }} 
                                                                className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm" 
                                                                title="Eliminación Total" 
                                                                disabled={data.user.uid === currentUser?.uid}
                                                            >
                                                                <Icon name="trash" className="w-3.5 h-3.5"/>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedUserUid === data.user.uid && (
                                                <tr className="bg-neutral-50/80 dark:bg-neutral-950/80">
                                                    <td colSpan={12} className="p-0">
                                                        <div className="m-3 p-4 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-inner grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                                            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800">
                                                                <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Identidad y acceso</p>
                                                                <p className="text-xs font-bold text-neutral-700 dark:text-neutral-200 break-all">UID: {data.user.uid}</p>
                                                                <p className="text-xs text-neutral-500 mt-1">Último visto: {lastActivityTs ? new Date(lastActivityTs).toLocaleString() : 'Sin registro'}</p>
                                                                <p className="text-xs text-neutral-500 mt-1">Perfil: {data.user.profileType || 'personal'} · País: {(data.user as any).country || 'N/D'}</p>
                                                            </div>
                                                            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800">
                                                                <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Suscripción / modelo IA</p>
                                                                <p className="text-xs font-bold">Plan: {data.user.plan} · Estado: {data.user.subscriptionStatus || 'N/D'}</p>
                                                                <p className="text-xs text-neutral-500 mt-1">Modelo permitido: {data.user.plan === 'premium' && data.user.subscriptionStatus === 'active' ? 'Pro habilitado en módulos pesados' : data.user.plan === 'free' ? 'Flash Lite' : 'Flash sin Pro'}</p>
                                                                <p className="text-xs text-neutral-500 mt-1">Ciclo: {data.usage?.billing_cycle_start ? new Date(data.usage.billing_cycle_start).toLocaleDateString() : 'N/D'} → {data.usage?.billing_cycle_end ? new Date(data.usage.billing_cycle_end).toLocaleDateString() : 'N/D'}</p>
                                                            </div>
                                                            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800">
                                                                <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Consumo detallado</p>
                                                                <p className="text-xs text-neutral-500">Tokens IN/OUT: {(data.usage as any)?.tokens_in || 0} / {(data.usage as any)?.tokens_out || 0}</p>
                                                                <p className="text-xs text-neutral-500 mt-1">Web ops: {(data.usage as any)?.counters?.monthly_web_ops_used || 0} · Presentaciones: {(data.usage as any)?.counters?.monthly_presentations_used || 0}</p>
                                                                <p className="text-xs text-neutral-500 mt-1">Voz/video: {(data.usage as any)?.counters?.monthly_voice_minutes || 0}m / {(data.usage as any)?.counters?.monthly_video_minutes || 0}m</p>
                                                            </div>
                                                            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800">
                                                                <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Alter Ego control</p>
                                                                {alter ? (
                                                                    <>
                                                                        <p className="text-xs font-bold">{alter.agentName || 'Sin alias'} · {alter.mode || 'EXECUTIVE'}</p>
                                                                        <p className="text-xs text-neutral-500 mt-1">Autonomía: {alter.autonomyLevel || 0}% · Latidos: {alter.dailyPulseCount || 0}/{alter.frequencyPerDay || 0}</p>
                                                                        <p className="text-xs text-neutral-500 mt-1">Último pulso: {formatAdminRelativeTime(alter.lastPulseAt)}</p>
                                                                        {isAlterPaused && <p className="text-xs text-red-500 mt-1 font-bold">Pausado: {formatAdminRelativeTime(alter.adminPausedAt)}</p>}
                                                                        <button onClick={() => handleToggleAlterEgoPause(data)} className={`mt-3 w-full py-2 rounded-xl text-[10px] font-black uppercase ${isAlterPaused ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>{isAlterPaused ? 'Reactivar Alter Ego' : 'Pausar Alter Ego'}</button>
                                                                    </>
                                                                ) : (
                                                                    <p className="text-xs text-neutral-500">Este usuario todavía no tiene motor autónomo creado.</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : activeTab === 'leads' ? (
                    <div className="flex-1 overflow-auto custom-scrollbar border border-gray-200 dark:border-gray-700 rounded-2xl shadow-inner bg-white dark:bg-neutral-950">
                        <table className="w-full text-xs text-left border-collapse min-w-[1200px]">
                            <thead className="bg-neutral-100 dark:bg-neutral-900 sticky top-0 z-20 shadow-sm border-b dark:border-neutral-800">
                                <tr className="font-black uppercase tracking-widest text-neutral-400">
                                    <th className="p-4">Socio / Código</th>
                                    <th className="p-4">Cliente / Interés</th>
                                    <th className="p-4">Agenda y Cierre</th>
                                    <th className="p-4">Valor Cierre (USD)</th>
                                    <th className="p-4">Estado del Lead</th>
                                    <th className="p-4 text-right">Liquidación</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-neutral-900">
                                {allLeads.map((lead) => {
                                    const total = lead.finalValue || lead.estimatedValue || 0;
                                    const adv = lead.advanceValue || (total / 2);
                                    const bal = lead.balanceValue || (total / 2);

                                    return (
                                        <tr key={lead.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-black text-neutral-900 dark:text-white">{lead.partnerName}</div>
                                                <div className="text-[10px] font-mono text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full w-fit mt-1">{lead.partnerCode}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-bold text-sm">{lead.clientName}</div>
                                                <div className="text-neutral-500 mt-0.5 truncate max-w-[200px]">{lead.serviceType}</div>
                                                {lead.changeRequests?.filter(r => r.status === 'pending').map(req => (
                                                    <button key={req.id} onClick={() => handleResolveRequest(lead.id, req.id, req.section as any)} className="text-[8px] font-black text-red-500 uppercase border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-500 hover:text-white transition-all">Cambio: {req.section}</button>
                                                ))}
                                            </td>
                                            <td className="p-4">
                                                {lead.meetingUrl ? (
                                                    <div className="bg-blue-50 dark:bg-blue-900/10 p-2 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                                        <span className="text-[9px] font-black text-blue-600 block mb-1">REUNIÓN: {new Date(lead.meetingDate!).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                        <div className="flex gap-1 flex-wrap">
                                                            <button onClick={() => window.open(lead.meetingUrl, '_blank')} className="px-2 py-1 bg-blue-600 text-white rounded text-[8px] font-black uppercase">Entrar</button>
                                                            <button onClick={() => copyMeetingLink(lead.meetingUrl!)} className="p-1 bg-white dark:bg-neutral-800 border border-blue-200 rounded text-blue-600"><Icon name="copy" className="w-3 h-3"/></button>
                                                            <button onClick={() => {
                                                                setMailDraft({
                                                                    to: lead.billingInfo?.email || '',
                                                                    subject: `Estatus de Reunión: ${lead.clientName}`,
                                                                    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 30px 10px; background-color: #f3f4f6;">
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 20px; padding: 40px 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
    <p style="font-size: 16px; color: #111827; font-weight: 700; margin: 0 0 20px 0;">Estatus de Reunión</p>
    Hola,<br/><br/>Te comparto el enlace para nuestra próxima reunión de seguimiento.<br/><br/>
    <b>Fecha:</b> ${new Date(lead.meetingDate!).toLocaleString()}<br/>
    <b>Enlace:</b> <a href="${lead.meetingUrl}" style="color: #2F4AE4; font-weight: bold;">${lead.meetingUrl}</a><br/><br/>
    Quedo a tu disposición.
</div>
</body>
</html>`
                                                                });
                                                                setCurrentView('mail');
                                                            }} className="p-1 bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/20 rounded text-brand-primary" title="Enviar Estatus por Correo">
                                                                <Icon name="mail" className="w-3 h-3"/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => handleOpenSchedule(lead)} className="text-[9px] font-black text-neutral-400 hover:text-brand-primary uppercase border border-dashed border-neutral-300 p-2 rounded-xl">Agendar</button>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="space-y-1">
                                                    <input type="number" defaultValue={total} onBlur={(e) => handleTotalValueChange(lead.id, e.target.value)} className="w-full bg-neutral-100 dark:bg-neutral-800 border-none rounded p-1 font-black text-[11px]" />
                                                    <div className="flex gap-1">
                                                        <input type="number" defaultValue={adv} onBlur={(e) => handleAdvanceValueChange(lead.id, e.target.value)} className="w-full bg-neutral-100 dark:bg-neutral-800 border-none rounded p-1 font-bold text-[9px]" />
                                                        <input type="number" defaultValue={bal} onBlur={(e) => handleBalanceValueChange(lead.id, e.target.value)} className="w-full bg-neutral-100 dark:bg-neutral-800 border-none rounded p-1 font-bold text-[9px]" />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <select value={lead.status} onChange={(e) => handleStatusChange(lead.id, e.target.value)} className={`w-full px-2 py-1 rounded-lg text-[9px] font-black uppercase border-none focus:ring-0 ${statusColors[lead.status]}`}>
                                                    {Object.entries(statusLabels).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                                                </select>
                                                {lead.clientSiteUrl ? (
                                                    <button onClick={() => window.open(lead.clientSiteUrl, '_blank')} className="w-full mt-2 py-1.5 bg-purple-600 text-white rounded-lg text-[8px] font-black uppercase">Ver Sitio</button>
                                                ) : (
                                                    <button onClick={() => handleGenerateClientSite(lead)} disabled={isGeneratingSite === lead.id} className={`w-full mt-2 py-1.5 rounded-lg text-[8px] font-black uppercase bg-brand-primary text-white`}>
                                                        {isGeneratingSite === lead.id ? '...' : 'Gen Sitio'}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex flex-col gap-1 min-w-[120px]">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <span className="text-[8px] font-black text-neutral-400 uppercase">Ant</span>
                                                        <button onClick={() => togglePaidState(lead.id, 'advancePaid', !!lead.advancePaid)} className={`px-2 py-1 rounded text-[8px] font-black uppercase ${lead.advancePaid ? 'bg-green-600 text-white' : 'bg-neutral-200 text-neutral-500'}`}>{lead.advancePaid ? 'OK' : 'Validar'}</button>
                                                    </div>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <span className="text-[8px] font-black text-neutral-400 uppercase">Sal</span>
                                                        <button onClick={() => togglePaidState(lead.id, 'balancePaid', !!lead.balancePaid)} className={`px-2 py-1 rounded text-[8px] font-black uppercase ${lead.balancePaid ? 'bg-green-600 text-white' : 'bg-neutral-200 text-neutral-500'}`}>{lead.balancePaid ? 'OK' : 'Validar'}</button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : activeTab === 'kampaigner' ? (
                    <div className="flex-1 overflow-auto p-4 sm:p-6 bg-white dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-gray-700 custom-scrollbar">
                        <div className="max-w-3xl mx-auto space-y-6">
                            <div className="text-center mt-6 mb-8">
                                <Icon name="send" className="w-12 h-12 text-brand-accent mx-auto mb-4 opacity-80" />
                                <h2 className="text-2xl font-black text-neutral-800 dark:text-white uppercase tracking-tight">Super Admin Kampaigner</h2>
                                <p className="text-sm text-neutral-500 font-medium">Borradores masivos con segmentación a {usersData.length} usuarios de la plataforma Goatify.</p>
                            </div>

                            <div className="space-y-4 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 p-6 rounded-3xl shadow-sm">
                                <label className="text-xs font-black text-neutral-500 block mb-4 uppercase tracking-wider">Configuración de Automatización</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                                        <div>
                                            <p className="text-sm font-black text-neutral-800 dark:text-white leading-tight">Diario de Noticias (7 AM)</p>
                                            <p className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Envío automático diario</p>
                                        </div>
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    const newValue = !automationSettings?.newsEnabled;
                                                    await setDoc(doc(db, 'automation_settings', 'status'), { newsEnabled: newValue }, { merge: true });
                                                    setToastNotification({ 
                                                        title: newValue ? "Noticias Activadas" : "Noticias Desactivadas", 
                                                        message: newValue ? "Se enviará el briefing a las 7 AM." : "Se ha desactivado el envío automático.", 
                                                        icon: newValue ? "check" : "close" 
                                                    });
                                                } catch (e) {
                                                    setToastNotification({ title: "Error", message: "Error al actualizar configuración.", icon: "close" });
                                                }
                                            }}
                                            className={`w-12 h-6 rounded-full transition-all relative ${automationSettings?.newsEnabled ? 'bg-brand-primary shadow-lg shadow-brand-primary/20' : 'bg-neutral-300 dark:bg-neutral-700'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${automationSettings?.newsEnabled ? 'right-1' : 'left-1'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                                        <div>
                                            <p className="text-sm font-black text-neutral-800 dark:text-white leading-tight">Email de Bienvenida</p>
                                            <p className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Auto-envío al crear cuenta</p>
                                        </div>
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    const newValue = !automationSettings?.welcomeEnabled;
                                                    await setDoc(doc(db, 'automation_settings', 'status'), { welcomeEnabled: newValue }, { merge: true });
                                                    setToastNotification({ 
                                                        title: newValue ? "Bienvenida Activada" : "Bienvenida Desactivada", 
                                                        message: newValue ? "Los nuevos usuarios recibirán el correo." : "Se ha desactivado el envío automático.", 
                                                        icon: newValue ? "check" : "close" 
                                                    });
                                                } catch (e) {
                                                    setToastNotification({ title: "Error", message: "Error al actualizar configuración.", icon: "close" });
                                                }
                                            }}
                                            className={`w-12 h-6 rounded-full transition-all relative ${automationSettings?.welcomeEnabled ? 'bg-brand-primary shadow-lg shadow-brand-primary/20' : 'bg-neutral-300 dark:bg-neutral-700'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${automationSettings?.welcomeEnabled ? 'right-1' : 'left-1'}`} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                                    <button 
                                        onClick={() => {
                                            // Trigger a message to check queue
                                            setToastNotification({ title: "Procesando Cola", message: "Solicitando al servidor procesar la cola de correos...", icon: "send" });
                                        }}
                                        className="text-[10px] font-black text-neutral-400 hover:text-brand-primary uppercase transition-colors"
                                    >
                                        Forzar Procesamiento de Cola
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 p-6 rounded-3xl shadow-sm">
                                <div>
                                    <label className="text-xs font-black text-neutral-500 block mb-4 uppercase tracking-wider">Formatos de Redacción Inteligentes</label>
                                    <div className="flex gap-3 flex-wrap">
                                        <button onClick={() => {
                                            const allEmails = usersData.map(u => u.user.email).filter(e => e && e.includes('@')).join(',');
                                            const displayNews = (goatifyNews && goatifyNews.length > 0) ? goatifyNews.slice(0, 6) : [
                                                { title: "Plataforma Goatify v5.0 Liberada", summary: "Nuevas funciones de IA Studio y automatización de ventas ya están disponibles para todos los planes Pro y Premium.", category: "Plataforma" },
                                                { title: "Nueva Alianza Estratégica", summary: "Goatify expande sus operaciones para facilitar la gestión de leads en todo el mercado hispanohablante.", category: "Mercado" },
                                                { title: "Webinar: Escala tu Negocio", summary: "Únete a nuestra próxima sesión en vivo para aprender a usar el Super Admin Panel a su máximo potencial.", category: "Evento" },
                                                { title: "Inteligencia Artificial aplicada a Ventas", summary: "Descubre cómo el nuevo Sales Copilot está ayudando a socios a cerrar tratos un 40% más rápido.", category: "IA" },
                                                { title: "Seguridad y Privacidad B2B", summary: "Implementamos nuevos protocolos de encriptación para proteger la data de tus clientes en el CRM.", category: "Seguridad" },
                                                { title: "Tendencias 2026: Automatización", summary: "El futuro de las ventas no es humano vs IA, es humano potenciado por IA. Lee nuestro último reporte.", category: "Tendencias" }
                                            ];
                                            
                                            setMailDraft({
                                                to: '',
                                                bcc: allEmails,
                                                subject: 'NOTICIA DEL DÍA: Estrategia IA para tu marca',
                                                htmlBody: constructNewsEmailHtml(displayNews)
                                            });
                                            onClose();
                                            setTimeout(() => setCurrentView('mail'), 300);
                                        }} className="px-5 py-3 bg-blue-100/50 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-600 hover:text-white transition-all shadow-sm">📰 Diario de Noticias</button>
                                        
                                        <button onClick={() => {
                                            const allEmails = usersData.map(u => u.user.email).filter(e => e && e.includes('@')).join(',');
                                            setMailDraft({
                                                to: '',
                                                bcc: allEmails,
                                                subject: 'Oportunidad Exclusiva: Tu ventaja competitiva ha sido activada',
                                                htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 30px 10px; background-color: #f3f4f6;">
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
        <div style="background-color: #0f172a; padding: 40px 20px; text-align: center; border-bottom: 4px solid #10b981;">
            <h2 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">PROMO <span style="color: #10b981;">ACTIVA</span></h2>
            <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Beneficio exclusivo por tiempo limitado</p>
        </div>
        
        <div style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #1e293b; font-weight: 700; margin: 0 0 10px 0;">Hola,</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 30px 0;">Hemos detectado una oportunidad para optimizar tu cuenta. Hemos activado una ventaja imperdible para que maximices el uso de las herramientas de Goatify y explotes la productividad esta temporada.</p>
            
            <div style="background-color: #ecfdf5; border: 2px dashed #10b981; padding: 30px 20px; border-radius: 12px; margin-bottom: 35px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: 800; color: #065f46; text-transform: uppercase; letter-spacing: 1px;">Tu código de ventaja:</p>
                <div style="font-size: 32px; font-weight: 900; color: #10b981; letter-spacing: 2px; margin: 0 0 15px 0;">GOAT_ULTIMATE_26</div>
                <p style="margin: 0; font-size: 13px; color: #059669; font-weight: 600;">Aplica este beneficio dentro de tu IA Studio.</p>
            </div>

            <div style="text-align: center;">
                <a href="https://ia.goatify.app" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #0f172a; color: white; padding: 16px 20px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">Reclamar Beneficio Ahora</a>
            </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 25px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; color: #0f172a;">- Goatify Finance</p>
            <p style="margin: 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Innovación sin Límites.</p>
        </div>
    </div>
</body>
</html>`
                                            });
                                            onClose();
                                            setTimeout(() => setCurrentView('mail'), 300);
                                        }} className="px-5 py-3 bg-green-100/50 text-green-600 rounded-xl text-sm font-bold hover:bg-green-600 hover:text-white transition-all shadow-sm">🎁 Promo Especial</button>
                                        
                                        <button onClick={() => {
                                            setMailDraft({
                                                to: '',
                                                bcc: '',
                                                subject: 'Bienvenido a Goatify: Tu Infraestructura de Negocio de Alto Rendimiento',
                                                htmlBody: constructWelcomeEmailHtml('Socio')
                                            });
                                            onClose();
                                            setTimeout(() => setCurrentView('mail'), 300);
                                        }} className="px-5 py-3 bg-purple-100/50 text-purple-600 rounded-xl text-sm font-bold hover:bg-purple-600 hover:text-white transition-all shadow-sm">👋 Bienvenida Indiv.</button>

                                        <button onClick={() => {
                                            setMailDraft({
                                                to: '',
                                                bcc: '',
                                                subject: '¿Quieres generar ingresos extra?',
                                                htmlBody: constructPartnerEmailHtml()
                                            });
                                            onClose();
                                            setTimeout(() => setCurrentView('mail'), 300);
                                        }} className="px-5 py-3 bg-indigo-100/50 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-600 hover:text-white transition-all shadow-sm">🤝 e partners</button>

                                        <button onClick={() => {
                                            setMailDraft({
                                                to: '',
                                                bcc: '',
                                                subject: 'Te invitamos a ser socio',
                                                htmlBody: constructMarketingEmailHtml('')
                                            });
                                            onClose();
                                            setTimeout(() => setCurrentView('mail'), 300);
                                        }} className="px-5 py-3 bg-brand-primary/10 text-brand-primary rounded-xl text-sm font-bold hover:bg-brand-primary hover:text-white transition-all shadow-sm">🚀 Info & Beneficios</button>
                                    </div>
                                </div>
                                <div className="pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800">
                                    <div className="flex items-start gap-4 p-4 bg-brand-accent/10 border border-brand-accent/20 rounded-2xl mb-4">
                                        <Icon name="info" className="w-5 h-5 text-brand-accent shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs text-brand-accent font-black mb-1 uppercase">Privacidad y Manejo Seguro de Audiencias B2B</p>
                                            <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">Al elegir un formato, Goatify transferirá los <b className="text-brand-accent">{usersData.length}</b> correos de tus usuarios de manera encriptada al campo oculto (CCO) de tu entorno privado en <b>Goatify Mail</b>. De esta forma, ningún receptor verá las identidades de otros miembros, garantizando la política de privacidad de Goatify. Podrás modificar todo antes de autorizar el envío final.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'books' ? (
                    <BookManagement />
                ) : null}

                <Modal isOpen={isNuclearConfirmOpen} onClose={() => setIsNuclearConfirmOpen(false)} title="Eliminación Nuclear de Usuario">
                    <div className="p-2">
                        <div className="flex flex-col items-center gap-4 text-center mb-6">
                            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-600 animate-pulse">
                                <Icon name="alert" className="w-10 h-10" />
                             </div>
                            <div>
                                <h3 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter">¿Confirmas la destrucción?</h3>
                                <p className="text-sm text-neutral-500 font-medium">Estás a punto de borrar permanentemente a <b>{userToDelete?.user.name} ({userToDelete?.user.email})</b>.</p>
                                <p className="text-[10px] text-red-600 font-black uppercase mt-2 tracking-widest">⚠️ ESTA ACCIÓN NO SE PUEDE DESHACER ⚠️</p>
                            </div>
                        </div>
                        <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 mb-6">
                            <ul className="text-[10px] font-bold text-neutral-500 uppercase flex flex-col gap-2">
                                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"/> Se borrará la cuenta de autenticación</li>
                                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"/> Se borrarán todos sus proyectos y tareas</li>
                                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"/> Se borrarán sus agentes y sitios web</li>
                                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"/> Se borrarán sus formularios y respuestas</li>
                            </ul>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setIsNuclearConfirmOpen(false)} className="flex-1 uppercase font-black text-[10px] tracking-widest">Cancelar</Button>
                            <Button onClick={() => userToDelete && handleNuclear(userToDelete.user.uid)} className="flex-1 bg-red-600 text-white uppercase font-black text-[10px] tracking-widest">Confirmar Eliminación</Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </Modal>
    );
};
