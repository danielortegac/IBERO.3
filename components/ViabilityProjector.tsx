import React, { useState, useContext, useMemo, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import type { Project } from '../types';
import Icon from './Icon';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Spinner from './ui/Spinner';
import Modal from './ui/Modal';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import { executeAiWithFallback } from '../services/geminiService';

interface ViabilityProjectorProps {
    project: Project;
}

const CONCEPTS: Record<string, { title: string; desc: string; advice: string }> = {
    breakeven: { title: "Punto de Equilibrio (Break-even)", desc: "Es el momento exacto donde tus ingresos igualan a tus costos. Ni ganas ni pierdes. Superar este número de ventas es lo que hace que tu negocio sea rentable.", advice: "Tu objetivo principal debe ser alcanzar este número lo más rápido posible cada mes." },
    profit: { title: "Utilidad Estimada", desc: "El dinero real que te queda en el bolsillo después de pagar inversión, costos variables y comisiones.", advice: "Si la utilidad es negativa, revisa tus costos operativos o sube el precio de venta." },
    roi: { title: "Retorno de Inversión (ROI)", desc: "Mide cuánto dinero generas por cada dólar invertido. Un ROI del 100% significa que duplicaste tu dinero.", advice: "En servicios digitales, busca ROIs superiores al 200% debido a los bajos costos marginales." },
    safety: { title: "Margen de Seguridad", desc: "Es el 'colchón' que tienes. Si tus ventas bajan este porcentaje, aún sigues sin perder dinero.", advice: "Un margen de seguridad sano está por encima del 30%." }
};

const ViabilityProjector: React.FC<ViabilityProjectorProps> = ({ project }) => {
    const { updateProject, setToastNotification } = useContext(AppContext);
    
    // Recuperar datos previos o inicializar
    const savedData = (project.finances as any)?.viabilityData || {
        investment: '',
        salePrice: '',
        costPerSale: '',
        targetSales: '10'
    };

    const [investment, setInvestment] = useState(savedData.investment);
    const [salePrice, setSalePrice] = useState(savedData.salePrice);
    const [costPerSale, setCostPerSale] = useState(savedData.costPerSale);
    const [targetSales, setTargetSales] = useState(savedData.targetSales);
    
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activeConcept, setActiveConcept] = useState<typeof CONCEPTS['breakeven'] | null>(null);

    // Cálculos lógicos
    const metrics = useMemo(() => {
        const inv = parseFloat(investment) || 0;
        const price = parseFloat(salePrice) || 0;
        const cost = parseFloat(costPerSale) || 0;
        const target = parseFloat(targetSales) || 0;

        const contributionMargin = Math.max(0, price - cost);
        const breakEven = contributionMargin > 0 ? Math.ceil(inv / contributionMargin) : 0;
        
        const totalRevenue = price * target;
        const totalVariableCosts = cost * target;
        const totalProfit = totalRevenue - totalVariableCosts - inv;
        
        const roi = inv > 0 ? (totalProfit / inv) * 100 : 0;
        const safetyMargin = target > breakEven ? ((target - breakEven) / target) * 100 : 0;

        return { contributionMargin, breakEven, totalProfit, roi, safetyMargin, totalRevenue };
    }, [investment, salePrice, costPerSale, targetSales]);

    // Guardado automático persistente
    useEffect(() => {
        const timer = setTimeout(async () => {
            const currentViability = { investment, salePrice, costPerSale, targetSales };
            if (JSON.stringify(currentViability) !== JSON.stringify(savedData)) {
                await updateProject(project.id, { 
                    finances: { 
                        ...project.finances, 
                        viabilityData: currentViability 
                    } as any 
                });
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [investment, salePrice, costPerSale, targetSales, project.id]);

    const handleConsultShivo = async () => {
        if (isAnalyzing) return;
        setIsAnalyzing(true);
        setToastNotification({ title: "Shivo Estratega", message: "Calculando viabilidad comercial...", icon: 'ai', isLoading: true });
        
        try {
            const prompt = `Actúa como Shivo CFO. Analiza la viabilidad de este modelo de negocio dentro del proyecto "${project.name}":
            - Inversión Inicial: $${investment}
            - Precio de Venta: $${salePrice}
            - Costo Variable/Venta: $${costPerSale}
            - Meta de Ventas: ${targetSales} unidades.
            - Punto de Equilibrio calculado: ${metrics.breakEven} unidades.
            - ROI Proyectado: ${metrics.roi.toFixed(1)}%.
            - Margen de Seguridad: ${metrics.safetyMargin.toFixed(1)}%.
            
            Dame un veredicto estratégico corto (máximo 150 palabras). ¿Es un negocio de alto riesgo? ¿Es escalable? Menciona el Margen de Seguridad. Usa Markdown elegante.`;

            const response = await executeAiWithFallback(prompt, "CFO Estratega Financiero", false, null, 'cfo');

            setAiAnalysis(response || "No se pudo generar el análisis.");
            setToastNotification({ title: "Análisis Listo", message: "Veredicto de viabilidad generado.", icon: "check" });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "Shivo está ocupado.", icon: "close" });
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            {/* CONCEPT MODAL */}
            <Modal isOpen={!!activeConcept} onClose={() => setActiveConcept(null)} title={activeConcept?.title || ''} zIndex="z-[160000]">
                <div className="space-y-6 p-2">
                    <div className="bg-brand-primary/5 p-8 rounded-[3rem] border-2 border-brand-primary/20 shadow-inner">
                         <p className="text-xl font-bold text-neutral-900 dark:text-white leading-relaxed mb-6">{activeConcept?.desc}</p>
                         <div className="flex items-start gap-4 p-5 bg-white dark:bg-neutral-900 rounded-[2rem] shadow-xl border border-brand-primary/10">
                             <div className="mt-1 bg-brand-primary/10 p-2 rounded-xl"><Icon name="ai" className="w-7 h-7 text-brand-primary animate-pulse"/></div>
                             <div>
                                 <p className="text-[10px] font-black uppercase text-brand-primary tracking-widest mb-1">TIP DEL ESTRATEGA</p>
                                 <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400 leading-relaxed">{activeConcept?.advice}</p>
                             </div>
                         </div>
                    </div>
                    <Button onClick={() => setActiveConcept(null)} className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl bg-brand-primary text-white border-none">Entendido</Button>
                </div>
            </Modal>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                    <Card className="p-6 bg-white dark:bg-dark-surface border border-neutral-200 dark:border-neutral-800 shadow-xl rounded-[2.5rem]">
                        <h4 className="text-xs font-black text-brand-primary uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Icon name="edit" className="w-4 h-4"/> Variables de Proyecto
                        </h4>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1 block ml-1">Inversión Inicial ($)</label>
                                <Input 
                                    type="number" 
                                    value={investment} 
                                    onChange={e => setInvestment(e.target.value)} 
                                    placeholder="Ej: 2000"
                                    className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-12 font-bold"
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1 block ml-1">PVP Sugerido ($)</label>
                                    <Input 
                                        type="number" 
                                        value={salePrice} 
                                        onChange={e => setSalePrice(e.target.value)} 
                                        placeholder="150"
                                        className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-12 font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1 block ml-1">Costo Var. ($)</label>
                                    <Input 
                                        type="number" 
                                        value={costPerSale} 
                                        onChange={e => setCostPerSale(e.target.value)} 
                                        placeholder="20"
                                        className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-12 font-bold"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1 block ml-1">Meta de Ventas (unids)</label>
                                <Input 
                                    type="number" 
                                    value={targetSales} 
                                    onChange={e => setTargetSales(e.target.value)} 
                                    placeholder="20"
                                    className="!rounded-2xl !bg-neutral-50 dark:!bg-neutral-900 border-none h-12 font-bold"
                                />
                            </div>

                            <Button 
                                onClick={handleConsultShivo} 
                                disabled={isAnalyzing || !investment || !salePrice}
                                className="w-full py-4 mt-4 bg-brand-primary border-none shadow-lg transform hover:scale-[1.02] active:scale-95 transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                            >
                                {isAnalyzing ? <Spinner className="w-4 h-4 text-white" /> : <><Icon name="ai" className="w-4 h-4" /> Veredicto de Viabilidad</>}
                            </Button>
                        </div>
                    </Card>

                    <Card className="p-6 bg-gradient-to-br from-indigo-600 to-brand-primary text-white rounded-3xl shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Icon name="rocket" className="w-16 h-16"/></div>
                        <h5 className="text-[9px] font-black uppercase tracking-widest mb-4 opacity-80">Rendimiento Proyectado</h5>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-xs opacity-70">Ingresos Totales</span>
                                <span className="text-xs font-bold">${metrics.totalRevenue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-xs opacity-70">Margen por Venta</span>
                                <span className="text-xs font-bold">${metrics.contributionMargin.toLocaleString()}</span>
                            </div>
                            <div className="pt-2 border-t border-white/10 flex justify-between items-end">
                                <span className="text-[10px] font-black uppercase">Utilidad Proyectada</span>
                                <span className="text-xl font-black">${metrics.totalProfit.toLocaleString()}</span>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="p-6 bg-[#0a0a0a] text-white border-none shadow-2xl relative overflow-hidden flex flex-col justify-between h-32 group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Icon name="rocket" className="w-16 h-16"/></div>
                            <div className="flex justify-between items-start relative z-10">
                                <p className="text-[9px] font-black text-brand-accent uppercase tracking-widest">Punto de Equilibrio</p>
                                <button onClick={() => setActiveConcept(CONCEPTS.breakeven)} className="text-brand-accent bg-brand-accent/20 p-1.5 rounded-xl hover:scale-110 transition-all shadow-md"><Icon name="help" className="w-4 h-4"/></button>
                            </div>
                            <p className="text-4xl font-black relative z-10">{metrics.breakEven} <span className="text-xs font-medium opacity-50 uppercase">Ventas</span></p>
                        </Card>
                        
                        <Card className="p-6 bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800 shadow-xl flex flex-col justify-between h-32 group relative">
                            <div className="flex justify-between items-start">
                                <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Utilidad Estimada</p>
                                <button onClick={() => setActiveConcept(CONCEPTS.profit)} className="text-brand-primary bg-brand-primary/5 p-1.5 rounded-xl hover:scale-110 transition-all shadow-sm"><Icon name="help" className="w-4 h-4"/></button>
                            </div>
                            <p className={`text-4xl font-black tracking-tighter ${metrics.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                ${metrics.totalProfit.toLocaleString()}
                            </p>
                        </Card>

                        <Card className="p-6 bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800 shadow-xl flex flex-col justify-between h-32 group relative">
                            <div className="flex justify-between items-start">
                                <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">ROI Proyectado</p>
                                <button onClick={() => setActiveConcept(CONCEPTS.roi)} className="text-brand-primary bg-brand-primary/5 p-1.5 rounded-xl hover:scale-110 transition-all shadow-sm"><Icon name="help" className="w-4 h-4"/></button>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <p className={`text-4xl font-black tracking-tighter ${metrics.roi >= 0 ? 'text-brand-primary' : 'text-red-500'}`}>
                                    {metrics.roi.toFixed(0)}%
                                </p>
                                <span className="text-[10px] font-bold text-neutral-400">del capital</span>
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="md:col-span-1 p-8 bg-[#050505] text-white rounded-[3rem] border border-white/5 shadow-3xl relative overflow-hidden flex flex-col group">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-brand-primary/10 rounded-full blur-[60px]"></div>
                            <div className="relative z-10 mb-6 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center shadow-lg"><Icon name="ai" className="w-6 h-6 text-white"/></div>
                                    <h5 className="font-black text-sm uppercase tracking-tighter">Análisis del Estratega</h5>
                                </div>
                                <div className="bg-white/10 px-3 py-1 rounded-full text-[8px] font-black uppercase text-brand-accent animate-pulse">Live Analysis</div>
                            </div>
                            
                            <div className="relative z-10 flex-1 prose prose-invert prose-sm max-w-none">
                                {aiAnalysis ? (
                                    <div className="animate-fade-in text-neutral-200">
                                        <ChatMessageRenderer text={aiAnalysis} className="!text-neutral-200" />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 opacity-30 text-center">
                                        <Icon name="brain" className="w-12 h-12 mb-4"/>
                                        <p className="text-xs font-black uppercase tracking-widest">Esperando Datos</p>
                                        <p className="text-[10px] mt-1">Shivo necesita las variables para darte un consejo.</p>
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card className="md:col-span-1 p-8 bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800 rounded-[3rem] shadow-xl flex flex-col group relative">
                            <div className="flex justify-between items-center mb-8">
                                <h5 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Margen de Seguridad</h5>
                                <button onClick={() => setActiveConcept(CONCEPTS.safety)} className="text-brand-primary bg-brand-primary/5 p-1.5 rounded-xl hover:scale-110 transition-all shadow-sm"><Icon name="help" className="w-4 h-4"/></button>
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <div className="relative w-full aspect-square max-w-[150px] mx-auto flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                                    <svg className="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-neutral-100 dark:text-neutral-800" />
                                        <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="10" fill="transparent" strokeDasharray="283" strokeDashoffset={`${283 - (283 * Math.min(100, metrics.safetyMargin)) / 100}`} strokeLinecap="round" className="text-brand-primary transition-all duration-1000 ease-out transform -rotate-90 origin-center" />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-4xl font-black text-neutral-900 dark:text-white">{metrics.safetyMargin.toFixed(0)}%</span>
                                    </div>
                                </div>
                                <div className="mt-8 text-center">
                                    <p className="text-xs font-bold text-neutral-600 dark:text-neutral-300 leading-relaxed px-4">
                                        {metrics.safetyMargin > 30 
                                            ? "Tienes un margen sólido para maniobrar ante imprevistos." 
                                            : metrics.safetyMargin > 0 
                                                ? "Tu margen es bajo. Cualquier incremento en costos afectará tu utilidad." 
                                                : "No tienes margen de seguridad. Actualmente estás operando a pérdida proyectada."}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>
                    
                    {/* Level Up: Visual Milestone Indicator (Mobile optimized) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-3xl border border-neutral-200 dark:border-neutral-700 flex flex-col items-center text-center justify-center overflow-hidden relative group">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary"></div>
                            <div className="w-10 h-10 bg-white dark:bg-neutral-900 rounded-xl flex items-center justify-center shadow-sm mb-2">
                                <Icon name="check" className={`w-6 h-6 ${metrics.totalProfit > 0 ? 'text-green-500' : 'text-neutral-300'}`} />
                            </div>
                            <p className="text-[10px] font-black uppercase text-neutral-800 dark:text-white">Estado Viabilidad</p>
                            <p className="text-[8px] text-neutral-500 font-bold uppercase mt-1">
                                {metrics.totalProfit > 0 ? 'Rentable' : 'No Rentable'}
                            </p>
                        </div>
                        
                        <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-3xl border border-neutral-200 dark:border-neutral-700 flex flex-col items-center text-center justify-center overflow-hidden relative group">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary"></div>
                            <div className="w-10 h-10 bg-white dark:bg-neutral-900 rounded-xl flex items-center justify-center shadow-sm mb-2">
                                <Icon name="rocket" className="w-6 h-6 text-brand-primary" />
                            </div>
                            <p className="text-[10px] font-black uppercase text-neutral-800 dark:text-white">Progreso Meta</p>
                            <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden mt-1.5">
                                 <div 
                                    className="h-full bg-brand-primary transition-all duration-1000" 
                                    style={{ width: `${Math.min(100, (parseFloat(targetSales) / Math.max(1, metrics.breakEven)) * 50)}%` }}
                                 ></div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ViabilityProjector;