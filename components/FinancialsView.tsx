
import React, { useState, useContext, useMemo, useRef, useEffect } from 'react';
import type { Project, FinancialTransaction, FinanceADN, FinanceBucket, FiscalCountry, AiFinanceReport } from '../types';
import { AppContext } from '../context/AppContext';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Icon from './Icon';
import Modal from './ui/Modal';
import Spinner from './ui/Spinner';
import { analyzeReceipt, analyzeFinancesStrategically } from '../services/geminiService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { storage, db } from '../firebaseConfig';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import jsPDF from 'jspdf';
import ViabilityProjector from './ViabilityProjector';
import { getPlanConfig } from '../types';

const CONCEPTS: Record<string, { title: string; desc: string; advice: string }> = {
    health: { title: "Salud Operativa Real", desc: "Mide la capacidad de tu negocio para cubrir sus costos operativos (OPEX) con sus ingresos netos. Un score de 100 significa que tu negocio es una máquina perfecta de flujo de caja.", advice: "Mantén este número sobre 70 para garantizar la supervivencia a largo plazo." },
    efficiency: { title: "Eficiencia de Capital", desc: "Determina cuánto dinero generas por cada dólar invertido en tus activos y operación. Es la métrica favorita de los inversionistas.", advice: "Optimiza tus activos productivos para que este porcentaje supere siempre el 15%." },
    margin: { title: "% Utilidad Operativa", desc: "El porcentaje de dinero que queda libre tras descontar los costos directos de producción y operación.", advice: "En servicios digitales, busca un margen superior al 40% para reinversión sana." },
    runway: { title: "Días de Reserva", desc: "Días exactos que tu negocio puede seguir operando al ritmo de gasto actual si las ventas se detuvieran hoy mismo.", advice: "Lo ideal es tener 180 días (6 meses) de reserva líquida para operar sin estrés." },
    fisco: { title: "Reserva Fiscal (IVA/ISR)", desc: "Dinero que recaudas pero no te pertenece. Shivo lo separa visualmente para que nunca tengas problemas con el fisco.", advice: "Trata este dinero como si no estuviera en tu cuenta; es de la administración tributaria." },
    radar: { title: "Panel Estratégico", desc: "Es tu panel de control principal. Aquí ves la salud del negocio en tiempo real basada en tu ADN seleccionado.", advice: "Revísalo diariamente para detectar fugas de capital en buckets no prioritarios." },
    balance: { title: "Estado Patrimonial", desc: "Análisis profundo de tus recursos. Separa lo líquido de lo invertido en infraestructura.", advice: "Un patrimonio neto sólido te permite apalancarte con crédito bancario si lo necesitas." },
    bitacora: { title: "Libro Diario de Flujo", desc: "El registro histórico de cada centavo que entra y sale de la operación.", advice: "Clasifica correctamente cada gasto para que la IA de Shivo pueda darte mejores consejos." },
    vault: { title: "Historial de Auditorías", desc: "El archivo histórico de todos los análisis profundos realizados por Shivo CFO.", advice: "Compara reportes de meses anteriores para ver si tu salud operativa está mejorando." },
    caja: { title: "Caja y Bancos", desc: "Representa tu liquidez inmediata. Es el dinero 'vivo' disponible para pagar nóminas, deudas y proveedores.", advice: "Nunca dejes que tu caja baje del costo operativo mensual de 2 meses." },
    activos: { title: "Inventario y Activos", desc: "Bienes con valor comercial que posee el proyecto (laptops, licencias perpetuas, stock). No es dinero líquido pero suma a tu valor total.", advice: "Los activos deben ser productivos. Si tienes un activo que no genera ROI, véndelo." },
    burnrate: { title: "Gasto Mensual", desc: "La velocidad a la que 'quemas' dinero cada mes solo por tener el negocio abierto.", advice: "Un burn rate bajo te da tiempo; un burn rate alto te obliga a vender bajo presión." },
    networth: { title: "Patrimonio Neto Real", desc: "Es el valor total de tu proyecto hoy si decidieras liquidarlo todo.", advice: "Tu meta es que este número crezca mes a mes independientemente de tus retiros personales." },
    tab_radar: { title: "Monitor Radar", desc: "Vista panorámica de indicadores críticos. Ideal para tomas de decisión rápidas en el día a día.", advice: "Fíjate siempre en la tendencia del Margen de Gestión." },
    tab_proyector: { title: "Proyector ROI", desc: "Simulador de viabilidad comercial. Te dice cuántas ventas necesitas para recuperar tu inversión inicial.", advice: "Úsalo antes de lanzar cualquier producto nuevo para asegurar que el precio sea rentable." },
    tab_balance: { title: "Estado Patrimonial", desc: "Análisis profundo de tus recursos. Separa lo líquido de lo invertido en infraestructura.", advice: "Un patrimonio neto sólido te permite apalancarte con crédito bancario si lo necesitas." },
    tab_bitacora: { title: "Libro Diario de Flujo", desc: "Auditoría transaccional. Cada movimiento debe estar asignado a un bucket de ADN.", advice: "Revisa aquí si hay fugas hormiga en el bucket de EXISTIR." },
    tab_vault: { title: "Bóveda de Inteligencia", desc: "Almacén de los diagnósticos previos de Shivo. Memoria corporativa de tu progreso.", advice: "La constancia en las auditorías es lo que genera patrones de éxito." },
    lifestyle_adn: { title: "ADN Estilo de Vida", desc: "Este modelo prioriza la libertad de tiempo del dueño. Shivo audita que el negocio no absorba tu vida personal.", advice: "Mantén costos fijos bajos y automatiza al máximo para ganar tiempo libre." },
    independent_adn: { title: "ADN Independiente Pro", desc: "Diseñado para profesionales de alto nivel que venden su conocimiento. El KPI clave es el Valor de tu Hora.", advice: "Deja de cobrar por horas y empieza a cobrar por resultados para escalar tus ingresos." },
    business_adn: { title: "ADN Crecimiento Estructurado", desc: "Foco en procesos y delegación. El negocio debe poder funcionar sin el dueño presente.", advice: "Audita semanalmente el OPEX (Gasto Operativo) para asegurar que la estructura no se coma la utilidad." },
    investment_adn: { title: "ADN Inversionista", desc: "El negocio es un activo financiero. El objetivo es maximizar los dividendos y el retorno de capital.", advice: "Cada dólar extra de utilidad debe ser reinvertido en ACTIVOS que generen más flujo pasivo." },
    enterprise_adn: { title: "ADN Mando Global", desc: "Gestión corporativa avanzada. Enfocado en EBITDA y valoración para posible venta o salida a bolsa.", advice: "Implementa una Gobernanza estricta y reportes trimestrales de alta fidelidad." }
};

const CATEGORY_MAP: Record<FinanceBucket, { icon: React.ComponentProps<typeof Icon>['name'], desc: string }> = {
    PRODUCIR: { icon: 'code', desc: "Costos directos para entregar el servicio o producto." },
    EXISTIR: { icon: 'clock', desc: "Gastos fijos necesarios para mantener la operación abierta." },
    ACTIVOS: { icon: 'monitor', desc: "Inversión en herramientas o bienes de larga duración." },
    VENTAS: { icon: 'rocket', desc: "Inversión en marketing, pauta y adquisición de clientes." },
    IMPUESTOS: { icon: 'security', desc: "Reserva obligatoria para obligaciones tributarias." }
};

const MASTER_FINANCIAL_GUIDE = `
# 🎓 Masterclass CFO Elite: Ingeniería de Rentabilidad y Contabilidad Avanzada

Bienvenido al sistema operativo financiero de Goatify. Esta guía transforma la contabilidad tradicional en una herramienta de guerra para tu negocio. 

---

### 🏛️ 1. Los Pilares del Control: El Ciclo Contable Real

En Shivo no solo "anotamos gastos", ejecutamos un proceso de auditoría continua:

*   **📖 El Libro Diario (Journal):** Es el registro cronológico de cada "evento económico". 
    *   *Concepto:* En Goatify, cada transacción que registras es un asiento en tu Libro Diario.
    *   *Regla:* Debe ser inmediato. El dinero olvidado es dinero perdido.
*   **📂 El Libro Mayor (Ledger):** Aquí clasificamos lo registrado en el Diario por su naturaleza (Buckets).
    *   *Ejemplo:* Si en el Diario hay 10 pagos de Facebook Ads, en el Mayor de "VENTAS" verás la suma total de esos 10 eventos.
*   **⚖️ El Balance de Comprobación:** Shivo lo genera en tiempo real para asegurar que tus Ingresos y Egresos cuadren perfectamente con tu ADN empresarial.

---

### 🏗️ 2. La Ecuación Contable Maestra
**ACTIVOS = PASIVOS + PATRIMONIO**

Para que tu proyecto sea una empresa real y no un hobby, debes entender estos tres elementos:

1.  **💎 ACTIVOS (Lo que posees):**
    *   *Corrientes:* Dinero en caja, con las cuentas por cobrar (clientes que te deben).
    *   *No Corrientes (Fijos):* Laptops, licencias perpetuas de software, marcas registradas.
    *   *Estrategia:* Un activo que no produce dinero es un "Pasivo disfrazado".
2.  **💸 PASIVOS (Lo que debes):**
    *   *Corrientes:* Cuentas por pagar a proveedores, salarios del mes, el IVA que cobraste (Bucket IMPUESTOS).
    *   *Largo Plazo:* Préstamos bancarios para expansión.
3.  **📈 PATRIMONIO (Tu riqueza neta):** Es el valor real de tu negocio. Si vendieras todos tus activos y pagaras todas tus deudas, lo que queda es tu Patrimonio.

---

### ⚡ 3. Ingeniería de Costos: Los 5 Buckets Goatify

Dividimos tu Libro Mayor en 5 contenedores estratégicos para análisis IA:

*   **🚀 PRODUCIR (COGS):** Costos variables. Si vendes una App por $1,000 y pagas $100 en APIs de OpenAI, tu COGS es el 10%.
*   **💡 EXISTIR (OPEX):** El costo de estar vivo. Renta, internet, el sueldo que te pagas a ti mismo. 
    *   *Peligro:* Un OPEX alto te quita agilidad. Mantén tu estructura "Lean".
*   **🛡️ ACTIVOS (CAPEX):** Inversión en futuro. Comprar una cámara para tu canal de YouTube de $3,000 no es un gasto de "EXISTIR", es un Activo que se deprecia pero suma a tu Patrimonio.
*   **📈 VENTAS (CAC):** El costo de adquisición. Si gastas $200 en pauta para conseguir un cliente de $1,000, tu rentabilidad es masiva.
*   **🏛️ IMPUESTOS:** La reserva sagrada. Shivo te obliga a ver este dinero separado para que el Fisco nunca detenga tu crecimiento.

---

### 📊 4. Indicadores de Élite (KPIs Maestros)

#### 📉 EBITDA (Utilidad Operativa Pura)
*Earnings Before Interest, Taxes, Depreciation, and Amortization*. Es la métrica más importante para valorar tu empresa.
*   **Ejemplo:** Si facturas $10,000, gastas $2,000 en producir y $3,000 en existir, tu EBITDA es de $5,000 (50%). Un EBITDA sano en servicios digitales debe superar el 40%.

#### ⏳ Burn Rate & Runway (Días de Vida)
*   **Burn Rate:** ¿Cuánto dinero "quemas" al mes en el bucket EXISTIR?
*   **Runway:** Si hoy dejas de vender, ¿cuántos meses sobrevives? Shivo recomienda 6 meses mínimos de "Reserva de Paz".

#### 🎯 Punto de Equilibrio (Break-even)
¿Cuántas unidades de tu servicio debes vender para que la utilidad sea $0?
*   **Fórmula:** Inversión Fija / (Precio de Venta - Costo Variable).
*   **Ejemplo:** Inviertes $2,000 en software. Vendes licencias a $100 y cada una te cuesta $20 en servidor. Margen = $80. Debes vender 25 licencias para recuperar la inversión.

---

### 5. Estrategia según tu ADN Empresarial

*   **Independent:** Maximiza el **Valor Hora**. Todo lo que no sea tu habilidad principal debe automatizarse o delegarse.
*   **Business:** Enfócate en el **EBITDA**. Tu negocio debe funcionar sin ti; los procesos son tus activos.
*   **Investment:** Tu KPI es el **ROI (Retorno de Inversión)**. Cada dólar que sale de tu bolsillo debe volver con amigos.
*   **Enterprise:** Gobernanza y **Escalabilidad**. Buscamos múltiplos de valoración de 5x a 10x EBITDA.

**CONSEJO FINAL DE SHIVO:**
La libertad no viene de ganar más dinero, viene de entender a dónde va cada centavo. Usa el Radar CFO diariamente para detectar "fugas hormiga" en tu bucket de EXISTIR y redirecciona ese capital a VENTAS o ACTIVOS.
`;

const getADNConfig = (adn: FinanceADN): any => {
    const configs: Record<FinanceADN, any> = {
        lifestyle: { 
            label: 'Estilo de Vida', 
            radar: 'Monitor de Libertad', 
            icon: 'user', 
            color: 'bg-emerald-500', 
            theme: 'from-emerald-600/20 to-teal-900/40 border-emerald-500/30', 
            text: 'text-emerald-900 dark:text-emerald-100',
            slogan: 'El negocio es el vehículo, tu vida es el destino.',
            optimization: 'Para maximizar ingresos: Enfécate en High-Ticket con baja carga operativa. Para gastar menos: Automatiza tareas repetitivas con Shivo.',
            learningPoints: ['Separa tus gastos personales.', 'Busca la rentabilidad neta libre.', 'Automatiza para recuperar tiempo.'],
            buckets: { PRODUCIR: 'Entregables', EXISTIR: 'Sueldo Dueño', ACTIVOS: 'Equipos/Viajes', VENTAS: 'Marca Personal', IMPUESTOS: 'Fondo de Paz' }
        },
        independent: { 
            label: 'Independiente Pro', 
            radar: 'Consola de Eficiencia', 
            icon: 'star', 
            color: 'bg-amber-500', 
            theme: 'from-amber-600/20 to-orange-900/40 border-amber-500/30', 
            text: 'text-amber-900 dark:text-amber-100',
            slogan: 'Tu conocimiento es tu activo más rentable.',
            detailedDesc: 'Para consultores y freelancers pro.',
            optimization: 'Deja de vender horas y empieza a vender resultados o productos digitales escalables.',
            learningPoints: ['Cada hora tiene un costo de oportunidad.', 'Diferencia marca de gasto operativo.'],
            buckets: { PRODUCIR: 'Proyectos', EXISTIR: 'Gastos Fijos', ACTIVOS: 'Herramientas', VENTAS: 'Networking', IMPUESTOS: 'Reserva Fiscal' }
        },
        business: { 
            label: 'Crecimiento Pro', 
            radar: 'Director Financiero Pro', 
            icon: 'briefcase', 
            color: 'bg-brand-primary', 
            theme: 'from-brand-primary/20 to-purple-900/40 border-brand-primary/30', 
            text: 'text-brand-primary dark:text-brand-accent',
            slogan: 'Gestión por procesos, escala por números.',
            detailedDesc: 'Ideal para empresas en expansión.',
            optimization: 'Audita el bucket EXISTIR; los costos fijos son el enemigo de la rentabilidad en escala.',
            learningPoints: ['Controla el margen operativo semanal.', 'La escala requiere reinversión constante.'],
            buckets: { PRODUCIR: 'Producción (CAPEX)', EXISTIR: 'Operación (OPEX)', ACTIVOS: 'Activos Fijos', VENTAS: 'Adquisición', IMPUESTOS: 'Provisiones' }
        },
        investment: { 
            label: 'Inversionista', 
            radar: 'Monitor de Portafolio', 
            icon: 'market', 
            color: 'bg-indigo-600', 
            theme: 'from-indigo-600/20 to-blue-900/40 border-indigo-500/30', 
            text: 'text-indigo-900 dark:text-indigo-100',
            slogan: 'Haz que cada dólar sea un soldado trabajando por ti.',
            detailedDesc: 'Para modelos basados en activos.',
            optimization: 'Enfócate en el Interés Compuesto; reinvierte el margen neto en ACTIVOS.',
            learningPoints: ['Mide el retorno de cada movimiento.', 'Busca ingresos pasivos o recurrentes.'],
            buckets: { PRODUCIR: 'Capital de Riesgo', EXISTIR: 'Mantenimiento', ACTIVOS: 'Portfolio de Activos', VENTAS: 'Pauta Estratégica', IMPUESTOS: 'Dividendos Libres' }
        },
        enterprise: { 
            label: 'Mando Global', 
            radar: 'Consola de Mando Elite', 
            icon: 'security', 
            color: 'bg-neutral-900', 
            theme: 'from-neutral-800 to-black border-neutral-700', 
            text: 'text-neutral-200', 
            slogan: 'Liderazgo basado en EBITDA y Gobernanza.',
            detailedDesc: 'Máximo nivel de sofisticación.',
            optimization: 'Maximiza el EBITDA mediante procesos; la eficiencia genera múltiplos de valoración.',
            learningPoints: ['Maximiza el EBITDA para atraer capital.', 'Implementa Gobernanza estricta.'],
            buckets: { PRODUCIR: 'I+D e Innovación', EXISTIR: 'Estructura Org.', ACTIVOS: 'Expansión Global', VENTAS: 'Marketing Masivo', IMPUESTOS: 'Reservas Legales' }
        }
    };
    return configs[adn] || configs.independent;
};

interface FinancialsViewProps {
    project: Project;
}

const FinancialsView: React.FC<FinancialsViewProps> = ({ project }) => {
    const { 
        updateProject, userProfile, setToastNotification, currentUser, 
        userUsage, checkQueryLimit, setProModalOpen,
        isFullScreenActive, setIsFullScreenActive
    } = useContext(AppContext);
    
    const [activeTab, setActiveTab] = useState<'dashboard' | 'balance' | 'history' | 'vault' | 'proyector'>('dashboard');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isManualOpen, setIsManualOpen] = useState(false);
    const [activeConcept, setActiveConcept] = useState<typeof CONCEPTS['health'] | null>(null);
    const [editingBucketKey, setEditingBucketKey] = useState<FinanceBucket | null>(null);
    const [bucketNameValue, setBucketNameValue] = useState('');
    
    const [txDesc, setTxDesc] = useState('');
    const [txAmount, setTxAmount] = useState('');
    const [txBucket, setTxBucket] = useState<FinanceBucket>('EXISTIR');
    const [txType, setTxType] = useState<'income' | 'expense'>('expense');
    const [hasTax, setHasTax] = useState(false);
    const [taxPercentageVal, setTaxPercentageVal] = useState('15');
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const finances = useMemo(() => project.finances || {
        income: 0, expenses: 0, transactions: [], adn: 'independent', fiscalCountry: 'OTHER', healthScore: 70, reports: []
    }, [project.finances]);

    const adn = finances.adn || 'independent';
    const config = getADNConfig(adn);
    
    const bucketNames = useMemo(() => {
        return {
            ...config.buckets,
            ...(project.finances as any)?.customBucketNames
        };
    }, [config.buckets, (project.finances as any)?.customBucketNames]);

    const stats = useMemo(() => {
        const txs = finances.transactions || [];
        const net = finances.income - finances.expenses;
        const margin = finances.income > 0 ? (net / finances.income) * 100 : 0;
        const taxes = txs.reduce((a, b) => a + (b.taxAmount || 0), 0);
        const burnRate = txs.filter(t => t.type === 'expense' && t.bucket === 'EXISTIR').reduce((a, b) => a + b.amount, 0) / (txs.length > 20 ? 3 : 1);
        const runway = Math.max(0, (net > 0 ? net : 0) / (burnRate / 30 || 1));
        const assetsValue = txs.filter(t => t.bucket === 'ACTIVOS').reduce((a,b) => a + b.amount, 0);
        const capitalEfficiency = assetsValue > 0 ? (net / assetsValue) * 100 : 0;
        return { net, margin, taxes, runway, burnRate, assetsValue, currentCash: net, capitalEfficiency };
    }, [finances]);

    const handleDeleteTransaction = async (id: string) => {
        if (!window.confirm("¿Eliminar esta transacción?")) return;
        const updatedTxs = finances.transactions.filter(t => t.id !== id);
        const newInc = updatedTxs.filter(t => t.type === 'income').reduce((a,b) => a + b.amount, 0);
        const newExp = updatedTxs.filter(t => t.type === 'expense').reduce((a,b) => a + b.amount, 0);
        await updateProject(project.id, { finances: { ...finances, transactions: updatedTxs, income: newInc, expenses: newExp } });
        setToastNotification({ title: "Registro Elimnado", message: "La bitácora se ha actualizado.", icon: 'trash' });
    };

    const handleAddTx = async (e?: React.FormEvent, aiData?: any) => {
        if (e) e.preventDefault();
        const inputAmt = parseFloat(aiData?.amount || txAmount);
        if (isNaN(inputAmt) || inputAmt <= 0) return;

        let calculatedTax = 0;
        let finalAmt = inputAmt;

        if (hasTax || aiData?.taxAmount) {
            const pct = parseFloat(taxPercentageVal) || 0;
            calculatedTax = aiData?.taxAmount || (inputAmt * (pct / 100));
            finalAmt = inputAmt + calculatedTax;
        }

        const newTx: FinancialTransaction = { 
            id: `tx-${Date.now()}`, 
            type: aiData?.type || txType, 
            description: aiData?.description || txDesc || "Sin descripción", 
            amount: finalAmt, 
            date: aiData?.date || new Date().toISOString().split('T')[0], 
            bucket: aiData?.bucket || txBucket, 
            isPaid: true, 
            taxAmount: calculatedTax, 
            attachmentUrl: aiData?.attachmentUrl || null,
            providerTaxId: aiData?.providerTaxId || null,
            isAutoFromCrm: !!aiData?.isAutoFromCrm
        };

        const updatedTxs = [newTx, ...(finances.transactions || [])];
        const newInc = updatedTxs.filter(t => t.type === 'income').reduce((a,b) => a + b.amount, 0);
        const newExp = updatedTxs.filter(t => t.type === 'expense').reduce((a,b) => a + b.amount, 0);
        
        await updateProject(project.id, { finances: { ...finances, transactions: updatedTxs, income: newInc, expenses: newExp } });
        setTxDesc(''); setTxAmount(''); setAddModalOpen(false); setHasTax(false);
        setToastNotification({ title: "Radar Sincronizado", message: "Shivo ha registrado el flujo.", icon: 'check' });
    };

    const handleUpdateBucketName = async () => {
        if (!editingBucketKey || !bucketNameValue.trim()) return;
        
        const currentCustomNames = (project.finances as any)?.customBucketNames || {};
        const newCustomNames = {
            ...currentCustomNames,
            [editingBucketKey]: bucketNameValue.trim()
        };
        
        await updateProject(project.id, {
            finances: {
                ...finances,
                customBucketNames: newCustomNames
            } as any
        });
        
        setEditingBucketKey(null);
        setBucketNameValue('');
        setToastNotification({ title: "ADN Personalizado", message: "Nombre de bucket actualizado.", icon: 'check' });
    };

    const handleRunAiAnalysis = async () => {
        const isBlocked = await checkQueryLimit();
        if (isBlocked) return;

        setIsAnalyzing(true);
        setToastNotification({ title: "Shivo CFO", message: "Auditando modelo operativo...", icon: 'ai', isLoading: true });
        try {
            const res = await analyzeFinancesStrategically(project.finances, userProfile, project.name, project.metadata);
            const newReport: AiFinanceReport = { id: `rep-${Date.now()}`, date: new Date().toISOString(), score: res.healthScore, report: res.report, dnaAdvice: res.dnaAdvice };
            const updatedReports = [newReport, ...(finances.reports || [])].slice(0, 20);
            await updateProject(project.id, { finances: { ...finances, healthScore: res.healthScore, aiReport: res.report, reports: updatedReports, lastAiAnalysis: new Date().toISOString() } });
            setToastNotification({ title: "Veredicto Listo", message: "Instrucciones de alto nivel en Historial.", icon: "check" });
        } catch (e) { console.error(e); } finally { setIsAnalyzing(false); }
    };

    const handleDeleteReport = async (reportId: string) => {
        if (!window.confirm("¿Eliminar este reporte?")) return;
        
        const updatedReports = (finances.reports || []).filter(r => r.id !== reportId);
        await updateProject(project.id, {
            finances: {
                ...finances,
                reports: updatedReports
            }
        });
        setToastNotification({ title: "Reporte Eliminado", message: "Bóveda actualizada.", icon: 'trash' });
    };

    const handleDownloadBalance = () => {
        const doc = new jsPDF();
        doc.setFillColor(76, 29, 149); doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont("helvetica", "bold"); 
        doc.text("ESTADO DE BALANCE CORPORATIVO", 20, 25);
        doc.setFontSize(10); doc.text(`PROYECTO: ${project.name.toUpperCase()} | ADN: ${config.label.toUpperCase()}`, 20, 34);

        let y = 60; doc.setTextColor(30, 30, 30); doc.setFontSize(14); doc.text("RESUMEN DE PATRIMONIO", 20, y); y += 15;
        doc.setFontSize(11); doc.setFont("helvetica", "normal");
        const rows = [
            ["Liquidez Líquida", `$${stats.currentCash.toLocaleString()}`],
            ["Valor en Activos", `$${stats.assetsValue.toLocaleString()}`],
            ["Reserva Fiscal", `$${stats.taxes.toLocaleString()}`],
            ["Días de Reserva", `${stats.runway.toFixed(0)} Días`],
            ["", ""],
            ["PATRIMONIO NETO REAL", `$${(stats.currentCash + stats.assetsValue - stats.taxes).toLocaleString()}`]
        ];

        rows.forEach(r => {
            if (r[0] === "PATRIMONIO NETO REAL") doc.setFont("helvetica", "bold");
            doc.text(r[0], 30, y); doc.text(r[1], 150, y, { align: 'right' });
            y += 8;
        });

        y += 15; doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("DISTRIBUCIÓN POR BUCKETS", 20, y); y += 15;
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        (Object.keys(CATEGORY_MAP) as FinanceBucket[]).map(key => {
             const total = (finances.transactions || []).filter(t => t.bucket === key && t.type === 'expense').reduce((a,b)=>a+b.amount, 0);
             doc.text(`${bucketNames[key]}:`, 30, y);
             doc.text(`$${total.toLocaleString()}`, 150, y, { align: 'right' });
             y += 7;
        });

        doc.save(`Balance_Goatify_${project.name.replace(/\s+/g, '_')}.pdf`);
        setToastNotification({ title: "Balance Exportado", message: "PDF profesional descargado.", icon: 'check' });
    };

    const planConfig = getPlanConfig(userProfile.plan);
    const chatLimit = (planConfig.limits as any).ai_chat_daily_queries || 30;
    const chatUsed = userUsage?.counters?.daily_chat_count || 0;

    return (
        <div className={`space-y-6 animate-fade-in pb-32 overflow-hidden px-1 font-sans ${isFullScreenActive ? 'fixed inset-0 z-[999999] bg-white dark:bg-[#0a0a0a] overflow-y-auto p-4 sm:p-8 w-full h-full' : 'max-w-7xl mx-auto'}`}>
            {isFullScreenActive ? (
                <button 
                    onClick={() => setIsFullScreenActive(false)} 
                    className="fixed top-4 right-4 z-[100001] bg-red-500 text-white px-4 py-2 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest whitespace-normal break-words text-center"
                >
                    <Icon name="close" className="w-4 h-4 flex-shrink-0"/> Regresar
                </button>
            ) : (
                <button 
                    onClick={() => setIsFullScreenActive(true)} 
                    className="fixed bottom-24 right-4 sm:bottom-8 sm:right-8 z-[90000] bg-brand-primary text-white px-4 py-3 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest whitespace-normal break-words text-center"
                >
                    <Icon name="expand" className="w-5 h-5 flex-shrink-0"/> Pantalla Completa
                </button>
            )}

            <Modal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} title={`Capacitación Maestro CFO Elite`} className="max-w-5xl h-[90vh]" zIndex="z-[200000]">
                <div className="space-y-8 overflow-y-auto pr-2 custom-scrollbar p-1">
                    <div className={`p-10 sm:p-14 rounded-3xl text-white shadow-2xl relative overflow-hidden bg-gradient-to-br from-brand-primary via-purple-900 to-black`}>
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
                        <div className="relative z-10">
                            <h3 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter mb-4 leading-none">Masterclass de Ingeniería Financiera Pro</h3>
                            <p className="text-sm sm:text-lg opacity-90 leading-relaxed font-medium max-w-3xl">Goatify IA ha diseñado esta guía definitiva para convertir tu proyecto en una potencia rentable y escalable. Domina los números, domina el mercado.</p>
                        </div>
                    </div>
                    <div className="prose dark:prose-invert max-w-none bg-neutral-50 dark:bg-neutral-900/50 p-6 sm:p-14 rounded-[3.5rem] border border-neutral-100 dark:border-neutral-800 shadow-inner">
                        <ChatMessageRenderer text={MASTER_FINANCIAL_GUIDE} />
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-8 sticky bottom-0 bg-white dark:bg-dark-surface py-6 mt-auto border-t dark:border-neutral-800">
                        <Button onClick={handleDownloadBalance} variant="secondary" className="px-8 font-black uppercase text-[10px] tracking-widest border-brand-primary text-brand-primary min-h-[48px] h-auto py-3 whitespace-normal break-words leading-tight">
                            <Icon name="upload" className="w-4 h-4 flex-shrink-0"/> Guardar Guía Maestra PDF
                        </Button>
                        <Button onClick={() => { setToastNotification({ title: "Misión Completada", message: "Ahora posees el conocimiento de un CFO de élite.", icon: 'check' }); setIsManualOpen(false); }} className="px-12 font-black uppercase text-[11px] tracking-widest shadow-2xl min-h-[48px] h-auto py-3 whitespace-normal break-words leading-tight bg-gradient-to-r from-brand-primary to-purple-600 border-none">Finalizar Entrenamiento</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={!!editingBucketKey} onClose={() => setEditingBucketKey(null)} title="Personalizar ADN">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">Cambia el nombre de este bucket para que se adapte perfectamente a tu forma de trabajar.</p>
                    <Input 
                        value={bucketNameValue} 
                        onChange={e => setBucketNameValue(e.target.value)} 
                        placeholder="Nuevo nombre del bucket..." 
                        autoFocus
                    />
                    <div className="flex flex-wrap justify-end gap-2 pt-4">
                        <Button variant="secondary" onClick={() => setEditingBucketKey(null)} className="whitespace-normal break-words leading-tight">Cancelar</Button>
                        <Button onClick={handleUpdateBucketName} className="whitespace-normal break-words leading-tight">Guardar Cambios</Button>
                    </div>
                </div>
            </Modal>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center text-white shadow-lg shadow-brand-primary/20">
                        <Icon name="wallet" className="w-6 h-6"/>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter uppercase">Shivo CFO Elite</h1>
                        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Inteligencia Financiera Avanzada</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center">
                    <div className="bg-brand-primary/5 px-4 py-2 rounded-2xl border border-brand-primary/10 text-right mr-2 hidden sm:block">
                        <p className="text-[9px] font-black uppercase text-brand-primary tracking-widest leading-none">Consultas IA</p>
                        <p className="text-xs font-bold text-neutral-800 dark:text-white">{chatUsed} de {chatLimit}</p>
                    </div>
                    <Button onClick={() => window.open(`#/pos/${encodeURIComponent(project.name.replace(/\s+/g, '-'))}?id=${project.id}`, '_blank')} className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-500 to-teal-600 border-none shadow-xl transform hover:scale-105 transition-all py-3 px-4 sm:px-6 font-black text-[10px] uppercase tracking-widest text-white min-h-[48px] h-auto whitespace-normal break-words leading-tight flex items-center justify-center gap-2">
                        <Icon name="market" className="w-4 h-4 flex-shrink-0"/> Smart POS
                    </Button>
                    <Button onClick={() => setIsManualOpen(true)} className="flex-1 sm:flex-none bg-gradient-to-r from-blue-600 to-indigo-700 border-none shadow-xl transform hover:scale-105 transition-all py-3 px-4 sm:px-6 font-black text-[10px] uppercase tracking-widest min-h-[48px] h-auto whitespace-normal break-words leading-tight flex items-center justify-center gap-2">
                        <Icon name="book" className="w-4 h-4 flex-shrink-0"/> Capacitación Maestro
                    </Button>
                </div>
            </div>

            <Card className="p-3 bg-white dark:bg-dark-surface border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-widest flex items-center gap-2">Modelo de Negocio (ADN) <button onClick={() => setActiveConcept({ title: "Arquitectura ADN", desc: "Shivo cambia toda su lógica contable y estratégica según el ADN seleccionado para darte una mentoría real.", advice: "Selecciona 'Mando Corporativo' si buscas atraer inversión, o 'Estilo de Vida' si priorizas tu libertad personal." })} className="text-neutral-300 hover:text-brand-primary transition-all hover:scale-125"><Icon name="help" className="w-3.5 h-3.5 text-brand-primary"/></button></h4>
                        <span className="text-[9px] font-bold text-neutral-400 uppercase hidden sm:block">ADN Activo: {config.label}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:overflow-x-auto sm:no-scrollbar bg-neutral-100 dark:bg-neutral-900 p-1 rounded-xl">
                        {(['lifestyle', 'independent', 'business', 'investment', 'enterprise'] as FinanceADN[]).map((key, idx) => {
                            const c = getADNConfig(key);
                            return (
                                <div key={key} className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-all group relative ${adn === key ? 'bg-brand-primary text-white shadow-md scale-[1.01]' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'} ${idx >= 3 ? 'col-span-1.5 last:col-span-1.5' : ''}`}>
                                    <button 
                                        onClick={() => updateProject(project.id, { finances: { ...finances, adn: key } })} 
                                        className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 w-full h-full"
                                    >
                                        <Icon name={c.icon} className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${adn === key ? 'text-white' : 'group-hover:text-brand-primary'}`}/>
                                        <span className="text-[7px] sm:text-xs font-black uppercase tracking-tighter text-center leading-tight">{c.label}</span>
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setActiveConcept(CONCEPTS[`${key}_adn`]); }}
                                        className={`absolute top-0.5 right-0.5 p-0.5 rounded-full transition-colors ${adn === key ? 'text-white/60 hover:text-white' : 'text-neutral-300 hover:text-brand-primary'}`}
                                    >
                                        <Icon name="help" className="w-2 h-2 sm:w-3 sm:h-3"/>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <div className={`p-4 rounded-xl border transition-all duration-500 animate-fade-in bg-gradient-to-br ${config.theme}`}>
                        <div className="flex justify-between items-start mb-1">
                             <p className={`text-xs font-black uppercase tracking-tight ${config.text}`}>{config.slogan}</p>
                             <div className="flex items-center gap-1 bg-white/20 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest text-white shadow-sm border border-white/20">DNA Verified</div>
                        </div>
                        <p className={`text-[10px] font-bold ${config.text} mb-2 opacity-80`}>{config.detailedDesc || "Configuración estratégica activa para auditoría IA."}</p>
                        
                        <div className="mt-2 p-3 bg-white/10 backdrop-blur-md rounded-lg border border-white/10 mb-2">
                            <h5 className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 ${config.text}`}>Guía de Optimización:</h5>
                            <p className={`text-[10px] font-medium leading-relaxed italic ${config.text}`}>{config.optimization}</p>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {config.learningPoints.map((p: string, i: number) => (
                                <span key={i} className="text-[9px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 font-bold"><div className="w-1 h-1 rounded-full bg-brand-primary"></div> {p}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>


            <div className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border shadow-xl relative overflow-hidden transition-all duration-1000 bg-gradient-to-br ${config.theme}`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] animate-pulse"></div>
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-4 sm:gap-6">
                        <div className={`w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[2rem] flex items-center justify-center text-white shadow-xl transition-all ${config.color} transform hover:rotate-3 ring-4 ring-white/10`}>
                            <Icon name={config.icon} className="w-8 h-8 sm:w-12 sm:h-12"/>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 sm:gap-4">
                                <h3 className={`text-xl sm:text-4xl font-black uppercase tracking-tighter leading-none ${config.text}`}>{config.radar}</h3>
                                <button onClick={() => setActiveConcept(CONCEPTS.radar)} className="p-2 bg-white/20 backdrop-blur-md rounded-xl text-white hover:bg-white/40 transition-all shadow-md hover:scale-110"><Icon name="help" className="w-4 h-4 sm:w-5 sm:h-5"/></button>
                            </div>
                            <p className="text-[10px] sm:text-lg font-black text-brand-primary uppercase tracking-tight mt-2">{config.slogan}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                        <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-white/80 dark:bg-black/40 backdrop-blur-xl border border-neutral-200 dark:border-white/10 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-white transition-all flex items-center justify-center gap-2 group min-h-[3rem] h-auto break-words whitespace-normal leading-tight">
                            {isScanning ? <Spinner className="w-3 h-3"/> : <><Icon name="camera" className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0"/> <span className="text-center">Scan IA</span></>}
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" onChange={async (e) => {
                             const file = e.target.files?.[0]; if (!file || !currentUser) return; setIsScanning(true);
                             try {
                                 const reader = new FileReader(); reader.readAsDataURL(file);
                                 reader.onload = async () => {
                                     const base64 = (reader.result as string).split(',')[1];
                                     const res = await analyzeReceipt(base64, file.type, finances.fiscalCountry || 'OTHER');
                                     const { url } = await uploadWithQuotaCheck({
                                         userId: currentUser.uid,
                                         data: file,
                                         path: safeStoragePath('receipts', currentUser.uid, `${Date.now()}_${file.name}`),
                                         sizeBytes: file.size,
                                         metadata: { contentType: file.type || 'image/*' },
                                         plan: userProfile.plan
                                     });
                                     handleAddTx(undefined, { ...res, type: 'expense', attachmentUrl: url });
                                 };
                             } finally { setIsScanning(false); }
                        }} accept="image/*" />
                        <Button onClick={() => setAddModalOpen(true)} className="flex-1 px-4 sm:px-6 font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg min-h-[3rem] h-auto py-2 transform hover:scale-105 transition-all break-words whitespace-normal text-center leading-tight">Registro Manual</Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-3 space-y-4">
                    <Card className="p-5 bg-white dark:bg-[#0a0a0a] rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-xl flex flex-col items-center text-center group overflow-hidden relative">
                        <div className="flex items-center gap-2 mb-4 z-10">
                             <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">Salud Operativa</p>
                             <button onClick={() => setActiveConcept(CONCEPTS.health)} className="text-brand-primary p-1 bg-brand-primary/10 rounded-full hover:scale-125 transition-all"><Icon name="help" className="w-3 h-3"/></button>
                        </div>
                        <div className="relative w-full aspect-square max-w-[140px] mx-auto flex items-center justify-center transform group-hover:scale-110 transition-transform duration-700 z-10">
                            <svg className="w-full h-full" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-neutral-100 dark:text-neutral-800" />
                                <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="283" strokeDashoffset={`${283 - (283 * (finances.healthScore || 0)) / 100}`} strokeLinecap="round" className={`${(finances.healthScore || 0) > 80 ? 'text-green-500' : (finances.healthScore || 0) > 50 ? 'text-amber-500' : 'text-red-500'} transition-all duration-1000 ease-out transform -rotate-90 origin-center`} />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-4xl font-black tracking-tighter text-neutral-900 dark:text-white">{finances.healthScore || 0}</span>
                                <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-widest">Score</span>
                            </div>
                        </div>
                        
                        <div className="mt-4 w-full p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[8px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-1">Eficiencia <button onClick={() => setActiveConcept(CONCEPTS.efficiency)} className="text-brand-primary"><Icon name="help" className="w-2.5 h-2.5"/></button></span>
                                <span className="text-[9px] font-black text-brand-primary">{stats.capitalEfficiency.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-1 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-primary transition-all duration-1000" style={{ width: `${Math.min(100, stats.capitalEfficiency)}%` }}></div>
                            </div>
                        </div>

                        <button onClick={handleRunAiAnalysis} disabled={isAnalyzing} className="mt-3 w-full py-3 bg-brand-primary hover:bg-brand-secondary text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-2xl transform active:scale-95 transition-all z-10 flex items-center justify-center gap-2 min-h-[40px] h-auto whitespace-normal break-words leading-tight">
                            {isAnalyzing ? <Spinner className="w-3 h-3 text-white" /> : <><Icon name="ai" className="w-3 h-3 flex-shrink-0"/> Generar Reporte CFO</>}
                        </button>
                    </Card>

                    <Card className="p-5 bg-emerald-500 text-white rounded-2xl flex flex-col gap-1 shadow-2xl shadow-emerald-500/20 group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10 transform translate-x-2 -translate-y-2"><Icon name="chart" className="w-12 h-12"/></div>
                        <div className="flex justify-between items-start relative z-10">
                            <p className="text-[8px] font-black uppercase tracking-widest opacity-80">Utilidad Neta</p>
                            <button onClick={() => setActiveConcept(CONCEPTS.networth)} className="text-white bg-white/20 p-1 rounded-full hover:scale-125 transition-all"><Icon name="help" className="w-3 h-3"/></button>
                        </div>
                        <p className="font-black text-2xl tracking-tighter group-hover:scale-105 transition-transform relative z-10">${stats.net.toLocaleString()}</p>
                        <p className="text-[9px] font-bold opacity-60 mt-1 relative z-10">Flujo de caja actual libre.</p>
                    </Card>
                </div>

                <div className="lg:col-span-9 space-y-6">
                    <div className="flex bg-neutral-100 dark:bg-neutral-900 p-1.5 rounded-2xl w-fit border border-neutral-200 dark:border-neutral-800 flex-wrap gap-1">
                        <div className="flex items-center gap-1 group">
                            <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-normal break-words text-center ${activeTab === 'dashboard' ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>Radar</button>
                            <button onClick={() => setActiveConcept(CONCEPTS.tab_radar)} className="p-2 text-neutral-300 hover:text-brand-primary"><Icon name="help" className="w-4 h-4"/></button>
                        </div>
                        <div className="flex items-center gap-1 group">
                            <button onClick={() => setActiveTab('proyector')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-normal break-words text-center ${activeTab === 'proyector' ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}><Icon name="rocket" className="w-4 h-4 flex-shrink-0"/> Proyector ROI</button>
                            <button onClick={() => setActiveConcept(CONCEPTS.tab_proyector)} className="p-2 text-neutral-300 hover:text-brand-primary"><Icon name="help" className="w-4 h-4"/></button>
                        </div>
                        <div className="flex items-center gap-1 group">
                            <button onClick={() => setActiveTab('balance')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-normal break-words text-center ${activeTab === 'balance' ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>Balance</button>
                            <button onClick={() => setActiveConcept(CONCEPTS.tab_balance)} className="p-2 text-neutral-300 hover:text-brand-primary"><Icon name="help" className="w-4 h-4"/></button>
                        </div>
                        <div className="flex items-center gap-1 group">
                            <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-normal break-words text-center ${activeTab === 'history' ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>Bitácora</button>
                            <button onClick={() => setActiveConcept(CONCEPTS.tab_bitacora)} className="p-2 text-neutral-300 hover:text-brand-primary"><Icon name="help" className="w-4 h-4"/></button>
                        </div>
                        <div className="flex items-center gap-1 group">
                            <button onClick={() => setActiveTab('vault')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-normal break-words text-center ${activeTab === 'vault' ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>Reportes</button>
                            <button onClick={() => setActiveConcept(CONCEPTS.tab_vault)} className="p-2 text-neutral-300 hover:text-brand-primary"><Icon name="help" className="w-4 h-4"/></button>
                        </div>
                    </div>

                    {activeTab === 'dashboard' && (
                        <div className="space-y-8 animate-fade-in">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card className="p-6 bg-white dark:bg-dark-surface border-l-4 border-brand-primary flex flex-col justify-between hover:shadow-xl transition-all relative">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[10px] font-black text-neutral-400 uppercase">% Utilidad Bruta</p>
                                        <button onClick={() => setActiveConcept(CONCEPTS.margin)} className="text-brand-primary bg-brand-primary/5 p-1 rounded-full hover:scale-110 transition-all"><Icon name="help" className="w-3.5 h-3.5"/></button>
                                    </div>
                                    <span className="text-2xl sm:text-3xl font-black mt-2">{stats.margin.toFixed(1)}%</span>
                                </Card>
                                <Card className="p-6 bg-white dark:bg-dark-surface border-l-4 border-orange-500 flex flex-col justify-between hover:shadow-xl transition-all relative">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[10px] font-black text-neutral-400 uppercase">Días de Reserva</p>
                                        <button onClick={() => setActiveConcept(CONCEPTS.runway)} className="text-orange-500 bg-orange-500/5 p-1 rounded-full hover:scale-110 transition-all"><Icon name="help" className="w-3.5 h-3.5"/></button>
                                    </div>
                                    <span className="text-2xl sm:text-3xl font-black mt-2">{stats.runway.toFixed(0)} <span className="text-xs uppercase opacity-40">Días</span></span>
                                </Card>
                                <Card className="p-6 bg-white dark:bg-dark-surface border-l-4 border-purple-500 flex flex-col justify-between hover:shadow-xl transition-all relative">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[10px] font-black text-neutral-400 uppercase">Gasto Mensual</p>
                                        <button onClick={() => setActiveConcept(CONCEPTS.burnrate)} className="text-purple-500 bg-purple-500/5 p-1 rounded-full hover:scale-110 transition-all"><Icon name="help" className="w-3.5 h-3.5"/></button>
                                    </div>
                                    <span className="text-2xl sm:text-3xl font-black mt-2">${stats.burnRate.toLocaleString()}</span>
                                </Card>
                                <Card className="p-6 bg-[#0a0a0a] text-white border-none shadow-2xl flex flex-col justify-between relative">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[10px] font-black text-neutral-500 uppercase">Reserva Fiscal</p>
                                        <button onClick={() => setActiveConcept(CONCEPTS.fisco)} className="text-brand-accent bg-brand-accent/20 p-1 rounded-full hover:scale-110 transition-all"><Icon name="help" className="w-3.5 h-3.5"/></button>
                                    </div>
                                    <span className="text-2xl sm:text-3xl font-black text-brand-accent mt-2">${stats.taxes.toLocaleString()}</span>
                                </Card>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center px-2">
                                        <h4 className="text-[11px] font-black uppercase text-neutral-400 tracking-[0.2em]">Análisis de ADN (Buckets)</h4>
                                        <button onClick={() => setActiveConcept({ title: "Segmentación por Buckets", desc: "Clasificar tus gastos en estos 5 buckets es la clave del método Goatify. Te permite ver exactamente dónde estás invirtiendo y dónde estás gastando sin sentido.", advice: "El bucket de VENTAS debe ser siempre productivo. Si gastas ahí y no sube el ingreso, tu estrategia está fallando." })} className="text-brand-primary p-1 bg-brand-primary/10 rounded-full hover:scale-110 transition-all"><Icon name="help" className="w-4 h-4"/></button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(Object.keys(CATEGORY_MAP) as FinanceBucket[]).map(key => {
                                            const total = (finances.transactions || []).filter(t => t.bucket === key && t.type === 'expense').reduce((a,b)=>a+b.amount, 0);
                                            const pct = finances.expenses > 0 ? (total / finances.expenses) * 100 : 0;
                                            return (
                                                <div key={key} className="bg-white dark:bg-neutral-900/40 p-3 sm:p-5 rounded-[2rem] border border-neutral-100 dark:border-neutral-800 hover:shadow-lg transition-all relative overflow-hidden group">
                                                    <div className="flex flex-col sm:flex-row justify-between items-start mb-2">
                                                        <div className="flex items-center gap-2 sm:gap-4">
                                                            <div className="p-1.5 sm:p-2.5 rounded-xl bg-brand-primary/10 group-hover:scale-110 transition-transform shadow-inner"><Icon name={CATEGORY_MAP[key].icon} className="w-4 h-4 sm:w-5 sm:h-5 text-brand-primary"/></div>
                                                            <div className="flex flex-col min-w-0">
                                                                <div className="flex items-center gap-1">
                                                                    <p className="text-[8px] sm:text-[10px] font-black uppercase text-neutral-900 dark:text-white leading-none truncate">{bucketNames[key]}</p>
                                                                    <button onClick={() => { setBucketNameValue(bucketNames[key]); setEditingBucketKey(key); }} className="text-neutral-400 hover:text-brand-primary ml-1 transition-colors"><Icon name="edit" className="w-2.5 h-2.5 sm:w-3 sm:h-3"/></button>
                                                                </div>
                                                                <p className="text-sm sm:text-xl font-black mt-1 truncate">${total.toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                        <span className="text-[8px] sm:text-[11px] font-black text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full">{pct.toFixed(0)}%</span>
                                                    </div>
                                                    <div className="w-full h-1 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden mt-2 shadow-inner"><div className="h-full bg-brand-primary transition-all duration-1000" style={{width:`${pct}%`}}></div></div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex justify-between items-center px-2">
                                        <h4 className="text-[11px] font-black uppercase text-neutral-400 tracking-[0.2em]">Veredicto Estratégico Shivo</h4>
                                        <button onClick={() => setActiveConcept(CONCEPTS.vault)} className="text-brand-primary p-1 bg-brand-primary/10 rounded-full hover:scale-110 transition-all"><Icon name="help" className="w-4 h-4"/></button>
                                    </div>
                                    <Card className="p-8 bg-[#050505] text-white rounded-[3.5rem] shadow-2xl relative overflow-hidden h-full border border-white/5 ring-1 ring-white/10 group">
                                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-1000"><Icon name="brain" className="w-80 h-80"/></div>
                                        <div className="relative z-10 flex flex-col h-full">
                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-12 h-12 bg-gradient-to-br from-brand-primary to-purple-600 rounded-2xl flex items-center justify-center shadow-lg"><Icon name="ai" className="w-7 h-7 text-white"/></div>
                                                <div>
                                                    <h5 className="font-black text-base uppercase tracking-tighter">Reporte CFO Elite</h5>
                                                    <p className="text-[8px] text-neutral-500 uppercase font-black tracking-widest">Estado: {finances.lastAiAnalysis ? 'Auditado' : 'Pendiente'}</p>
                                                </div>
                                            </div>
                                            <div className="text-white prose prose-invert prose-sm max-w-none leading-relaxed text-sm flex-grow font-medium">
                                                {finances.aiReport ? (
                                                     <div className="animate-fade-in"><ChatMessageRenderer text={finances.aiReport} className="!text-white" /></div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center py-24 opacity-20 text-center">
                                                        <Icon name="ai" className="w-20 h-20 mb-6"/>
                                                        <p className="text-lg font-black uppercase tracking-widest">Auditoría Pendiente</p>
                                                        <p className="text-xs mt-2">Shivo necesita analizar tus transacciones para guiarte.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'proyector' && <ViabilityProjector project={project} />}

                    {activeTab === 'balance' && (
                        <div className="space-y-8 animate-fade-in pb-20">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <Card className="p-10 bg-white dark:bg-[#0a0a0a] border border-neutral-100 dark:border-neutral-800 rounded-[3.5rem] shadow-xl relative">
                                    <div className="flex justify-between items-start mb-10">
                                        <div className="flex items-center gap-3">
                                            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-2xl text-green-600"><Icon name="market" className="w-6 h-6"/></div>
                                            <h3 className="text-2xl font-black uppercase tracking-tight italic">Patrimonio Detallado</h3>
                                            <button onClick={() => setActiveConcept(CONCEPTS.balance)} className="text-brand-primary p-2 bg-brand-primary/10 rounded-2xl hover:scale-110 transition-all shadow-sm"><Icon name="help" className="w-6 h-6"/></button>
                                        </div>
                                        <button onClick={handleDownloadBalance} className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-neutral-500 hover:text-brand-primary transition-all"><Icon name="upload" className="w-5 h-5"/></button>
                                    </div>
                                    
                                    <div className="space-y-6">
                                        <div className="flex justify-between items-center p-6 bg-neutral-50 dark:bg-neutral-900 rounded-[1.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm relative group">
                                            <div>
                                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Caja y Bancos (Líquido)</span>
                                                <span className="font-black text-3xl text-green-600">${stats.currentCash.toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => setActiveConcept(CONCEPTS.caja)} className="p-2 text-brand-primary bg-brand-primary/5 rounded-full transition-all"><Icon name="help" className="w-4 h-4"/></button>
                                                <Icon name="wallet" className="w-8 h-8 text-green-500 opacity-20"/>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center p-6 bg-neutral-50 dark:bg-neutral-900 rounded-[1.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm relative group">
                                            <div>
                                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Activos Productivos</span>
                                                <span className="font-black text-3xl text-neutral-900 dark:text-white">${stats.assetsValue.toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => setActiveConcept(CONCEPTS.activos)} className="p-2 text-brand-primary bg-brand-primary/5 rounded-full transition-all"><Icon name="help" className="w-4 h-4"/></button>
                                                <Icon name="monitor" className="w-8 h-8 text-purple-500 opacity-20"/>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center p-6 bg-red-50 dark:bg-red-900/5 rounded-[1.5rem] border border-red-100 border-red-900/20 shadow-sm relative group">
                                            <div>
                                                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest block mb-1">Reserva Fiscal (Pasivo)</span>
                                                <span className="font-black text-2xl text-red-600">-${stats.taxes.toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => setActiveConcept(CONCEPTS.fisco)} className="p-2 text-red-500 bg-red-500/5 rounded-full transition-all"><Icon name="help" className="w-4 h-4"/></button>
                                                <Icon name="security" className="w-8 h-8 text-red-500 opacity-20"/>
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="p-6 sm:p-8 bg-[#050505] text-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl relative overflow-hidden ring-1 ring-white/10 flex flex-col justify-between h-full group">
                                    <div className="absolute top-0 right-0 w-[150%] h-[150%] bg-gradient-to-br from-brand-primary/20 to-transparent opacity-50 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                                    <div className="relative z-10 flex justify-between items-start">
                                        <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter italic leading-none">Net Worth <br/> <span className="text-sm sm:text-base opacity-40 font-black">Patrimonio Real</span></h3>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setActiveConcept(CONCEPTS.networth)} className="p-2 sm:p-3 bg-brand-primary text-white rounded-xl sm:rounded-2xl hover:scale-110 transition-all shadow-xl"><Icon name="help" className="w-4 h-4 sm:w-5 sm:h-5"/></button>
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-xl sm:rounded-2xl flex items-center justify-center border border-white/20 shadow-2xl"><Icon name="security" className="w-5 h-5 sm:w-6 sm:h-6 text-brand-accent"/></div>
                                        </div>
                                    </div>
                                    <div className="relative z-10 py-6 sm:py-8">
                                        <p className="text-4xl sm:text-6xl font-black tracking-tighter text-white leading-none drop-shadow-2xl animate-glow truncate">${(stats.currentCash + stats.assetsValue - stats.taxes).toLocaleString()}</p>
                                        <p className="text-[10px] sm:text-xs font-bold text-neutral-500 mt-4 uppercase tracking-[0.2em]">Cálculo algorítmico Goatify CFO (Líquido - Pasivos).</p>
                                    </div>
                                    <Button onClick={handleDownloadBalance} className="relative z-10 w-full bg-white text-black font-black uppercase text-[10px] tracking-widest py-3 sm:py-4 rounded-xl sm:rounded-2xl border-none shadow-2xl hover:scale-[1.02] transition-all min-h-[48px] h-auto whitespace-normal break-words leading-tight">Exportar Balance Pro</Button>
                                </Card>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'history' && (
                        <Card className="overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-xl rounded-[3rem] bg-white dark:bg-[#0a0a0a] animate-fade-in relative">
                            <div className="p-4 bg-neutral-50 dark:bg-neutral-900 border-b dark:border-neutral-800 flex justify-between items-center px-4 sm:px-8">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-3 truncate">Bitácora de Flujo <button onClick={() => setActiveConcept(CONCEPTS.bitacora)} className="text-brand-primary p-1 bg-brand-primary/10 rounded-full hover:scale-110 transition-all"><Icon name="help" className="w-4 h-4"/></button></h4>
                                <span className="text-[9px] font-black text-neutral-400 bg-white dark:bg-neutral-800 px-2 sm:px-3 py-1 rounded-full whitespace-nowrap">{finances.transactions?.length || 0} Regs</span>
                            </div>
                            <div className="max-h-[700px] overflow-x-auto sm:overflow-y-auto custom-scrollbar">
                                <table className="w-full text-[10px] sm:text-xs text-left border-collapse min-w-full sm:min-w-0">
                                    <thead className="bg-neutral-50 dark:bg-neutral-900 sticky top-0 z-20 shadow-sm border-b dark:border-neutral-800">
                                        <tr className="font-black uppercase tracking-widest text-neutral-400">
                                            <th className="p-3 sm:p-6">Fecha / Concepto</th>
                                            <th className="p-3 sm:p-6">Bucket</th>
                                            <th className="p-3 sm:p-6 text-right">Monto</th>
                                            <th className="p-3 sm:p-6 text-right w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y dark:divide-neutral-900">
                                        {finances.transactions?.map(tx => (
                                            <tr key={tx.id} className="hover:bg-brand-primary/5 transition-all group">
                                                <td className="p-3 sm:p-6">
                                                    <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
                                                        <div className={`p-1.5 sm:p-3 rounded-xl sm:rounded-2xl flex-shrink-0 ${tx.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-neutral-100 text-neutral-500'}`}>
                                                            <Icon name={tx.type === 'income' ? 'arrowRight' : 'send'} className="w-3.5 h-3.5 sm:w-4 sm:h-4"/>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-black text-[11px] sm:text-sm text-neutral-800 dark:text-white truncate max-w-[120px] sm:max-w-[200px]">{tx.description}</p>
                                                            <p className="text-[8px] sm:text-[10px] font-bold text-neutral-400 uppercase mt-0.5">{tx.date}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3 sm:p-6">
                                                    <span className="px-2 sm:px-4 py-1 rounded-full text-[8px] sm:text-[9px] font-black uppercase bg-brand-primary/10 text-brand-primary border border-brand-primary/20 whitespace-nowrap">
                                                        {bucketNames[tx.bucket]}
                                                    </span>
                                                </td>
                                                <td className={`p-3 sm:p-6 text-right font-black text-sm sm:text-lg whitespace-nowrap ${tx.type === 'income' ? 'text-green-600' : 'text-neutral-900 dark:text-white'}`}>
                                                    {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString()}
                                                </td>
                                                <td className="p-3 sm:p-6 text-right">
                                                    <button 
                                                        onClick={() => handleDeleteTransaction(tx.id)}
                                                        className="text-neutral-300 hover:text-red-500 transition-colors"
                                                        title="Eliminar"
                                                    >
                                                        <Icon name="trash" className="w-4 h-4"/>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {activeTab === 'vault' && (
                         <div className="space-y-6 animate-fade-in pb-20">
                            <div className="flex justify-between items-center px-4">
                                <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">Archivo de Auditorías <button onClick={() => setActiveConcept(CONCEPTS.vault)} className="text-brand-primary p-1 bg-brand-primary/10 rounded-full hover:scale-110 transition-all shadow-sm"><Icon name="help" className="w-5 h-5"/></button></h3>
                                <div className="text-[10px] font-bold text-neutral-400 uppercase">Shivo CFO Historical Data</div>
                            </div>
                            {finances.reports?.map((rep) => (
                                <Card key={rep.id} className="p-10 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:shadow-2xl transition-all rounded-[3.5rem] group relative overflow-hidden">
                                    <button onClick={() => handleDeleteReport(rep.id)} className="absolute top-6 right-6 p-3 bg-red-50 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-lg"><Icon name="trash" className="w-4 h-4"/></button>
                                    <div className="flex justify-between items-start mb-8 pb-8 border-b dark:border-neutral-800">
                                        <div><p className="text-xs font-black text-brand-primary uppercase tracking-widest">{new Date(rep.date).toLocaleDateString()}</p><p className="text-xl font-black text-neutral-900 dark:text-white mt-1 uppercase tracking-tighter">Veredicto Estratégico {rep.score}/100</p></div>
                                        <div className="p-4 bg-neutral-50 dark:bg-black rounded-3xl shadow-inner font-black text-3xl group-hover:text-brand-primary transition-colors">{rep.score}</div>
                                    </div>
                                    <div className="prose prose-lg dark:prose-invert max-w-none bg-neutral-950 p-6 sm:p-10 rounded-[2.5rem] border border-white/5"><ChatMessageRenderer text={rep.report} className="!text-white" /></div>
                                    <div className="mt-8 pt-8 border-t dark:border-neutral-800 italic text-lg text-brand-primary font-bold flex items-center gap-3"><Icon name="star" className="w-6 h-6"/> "{rep.dnaAdvice}"</div>
                                </Card>
                            ))}
                            {(!finances.reports || finances.reports.length === 0) && (
                                <div className="text-center py-40 opacity-20 flex flex-col items-center">
                                    <Icon name="brain" className="w-32 h-32 mb-6" />
                                    <p className="text-2xl font-black uppercase tracking-widest">Sin Reportes</p>
                                    <p className="text-sm">Ejecuta tu primera auditoría CFO para generar inteligencia financiera.</p>
                                </div>
                            )}
                         </div>
                    )}
                </div>
            </div>

            <Modal isOpen={!!activeConcept} onClose={() => setActiveConcept(null)} title={activeConcept?.title || ''} zIndex="z-[200000]">
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
                    <Button onClick={() => setActiveConcept(null)} className="w-full min-h-[56px] h-auto py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl bg-brand-primary text-white border-none whitespace-normal break-words leading-tight">Entendido</Button>
                </div>
            </Modal>

            <Modal isOpen={isAddModalOpen} onClose={() => setAddModalOpen(false)} title="Nuevo Registro Financiero" className="max-w-md !rounded-[3rem] overflow-hidden" zIndex="z-[150000]">
                <div className="bg-neutral-50 dark:bg-[#0a0a0a] p-1">
                    <form onSubmit={handleAddTx} className="space-y-6">
                        <div className="flex bg-neutral-200 dark:bg-neutral-900 p-1.5 rounded-3xl relative overflow-hidden shadow-inner min-h-[56px] h-auto">
                             <div className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-0.375rem)] bg-white dark:bg-neutral-800 rounded-2xl shadow-xl transition-transform duration-500 ease-out ${txType === 'income' ? 'translate-x-full' : ''}`}></div>
                            <button type="button" onClick={()=>setTxType('expense')} className={`flex-1 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] relative z-10 transition-colors whitespace-normal break-words leading-tight ${txType==='expense'?'text-neutral-900 dark:text-white':'text-neutral-500'}`}>SALIDA</button>
                            <button type="button" onClick={()=>setTxType('income')} className={`flex-1 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] relative z-10 transition-colors whitespace-normal break-words leading-tight ${txType==='income'?'text-neutral-900 dark:text-white':'text-neutral-500'}`}>ENTRADA</button>
                        </div>
                        <div className="space-y-4 px-2">
                            <div><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 ml-2 block">Descripción Detallada</label><Input value={txDesc} onChange={e=>setTxDesc(e.target.value)} placeholder="Ej: Pago Hosting, Cliente X..." required className="!rounded-2xl !bg-white dark:!bg-neutral-900 border-none shadow-sm h-14 text-base font-bold px-6" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 ml-2 block">Monto USD</label><Input type="number" step="0.01" value={txAmount} onChange={e=>setTxAmount(e.target.value)} required className="!rounded-2xl !bg-white dark:!bg-neutral-900 border-none shadow-sm h-14 text-center text-xl font-black text-brand-primary" /></div>
                                <div><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 ml-2 block">Bucket ADN</label><select value={txBucket} onChange={e=>setTxBucket(e.target.value as any)} className="w-full h-14 px-4 rounded-2xl bg-white dark:bg-neutral-900 border-none font-black text-[10px] uppercase focus:ring-2 focus:ring-brand-primary shadow-sm outline-none">{Object.keys(CATEGORY_MAP).map(b=><option key={b} value={b}>{bucketNames[b as FinanceBucket]}</option>)}</select></div>
                            </div>
                            
                            <div className="p-4 bg-neutral-100 dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                                <label className="flex items-center gap-3 cursor-pointer mb-3">
                                    <input type="checkbox" checked={hasTax} onChange={e => setHasTax(e.target.checked)} className="w-5 h-5 rounded text-brand-primary focus:ring-brand-primary" />
                                    <span className="text-[10px] font-black uppercase text-neutral-500">¿Tiene Impuesto?</span>
                                </label>
                                {hasTax && (
                                    <div className="flex items-center gap-3 animate-fade-in">
                                        <Input 
                                            type="number" 
                                            value={taxPercentageVal} 
                                            onChange={e => setTaxPercentageVal(e.target.value)} 
                                            className="w-20 !mt-0 h-10 text-center font-black !rounded-xl"
                                        />
                                        <span className="text-xs font-bold text-neutral-400">% de Impuesto</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-3 pt-6 border-t dark:border-neutral-800">
                            <Button variant="secondary" onClick={() => setAddModalOpen(false)} className="w-full min-h-[56px] h-auto py-4 rounded-2xl uppercase font-black text-[10px] tracking-[0.2em] bg-white dark:bg-neutral-900 border-none text-neutral-500 hover:text-neutral-900 whitespace-normal break-words leading-tight">Descartar</Button>
                            <Button type="submit" className="w-full min-h-[56px] h-auto py-4 rounded-2xl uppercase font-black text-[10px] tracking-[0.2em] shadow-xl shadow-brand-primary/20 bg-brand-primary text-white border-none transform hover:scale-[1.02] transition-all whitespace-normal break-words leading-tight">Registrar Flujo ✅</Button>
                        </div>
                    </form>
                </div>
            </Modal>
        </div>
    );
};

export default FinancialsView;
