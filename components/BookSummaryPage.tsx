import React, { useContext, useEffect, useState, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import SpeechSynthesisControls from './ui/SpeechSynthesisControls';
import jsPDF from 'jspdf';
import Button from './ui/Button';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Spinner from './ui/Spinner';
import Modal from './ui/Modal';

interface BookSummaryPageProps {
    bookId: string;
}

const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";

const bookLoadingMessages = [
    "Sincronizando sabiduría...",
    "Analizando textos profundos...",
    "Prepárate para una buena lectura...",
    "Extrayendo puntos estratégicos...",
    "Casi listo para ti..."
];

const ArticleAd: React.FC = () => {
    const handleNavigateToPartners = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Redirección directa e infalible al login/partners de la app oficial
        window.location.href = 'https://ia.goatify.app/#partners';
    };

    return (
        <div className="my-8 p-0.5 bg-gradient-to-r from-brand-primary via-purple-600 to-indigo-600 rounded-[2rem] shadow-2xl transform hover:scale-[1.01] transition-all duration-500 not-prose text-left">
            <div className="bg-white dark:bg-[#0a0a0a] rounded-[1.9rem] p-6 sm:p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-6 border border-white/10">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 rounded-full blur-[80px] -mr-32 -mt-32"></div>
                <div className="relative z-10 flex-shrink-0">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white dark:bg-neutral-900 p-3 rounded-2xl flex items-center justify-center shadow-xl border border-neutral-100 dark:border-neutral-800">
                        <img src={LOGO_URL} alt="Goatify" className="w-full h-full object-contain animate-glow" />
                    </div>
                </div>
                <div className="relative z-10 flex-1 text-center md:text-left space-y-3">
                    <h4 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter leading-tight">
                        ¡Monetiza <span className="text-brand-primary">con nosotros</span>!
                    </h4>
                    <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 font-bold leading-relaxed">
                        Únete a la economía circular de Goatify. Genera ingresos reales, potencia tu productividad y escala tu negocio con nuestra Inteligencia Artificial de élite. 
                        <strong className="text-brand-primary block mt-1 font-black uppercase tracking-widest text-[10px]">¡TU PRUEBA GRATUITA DE 30 DÍAS TE ESPERA!</strong>
                    </p>
                    <div className="pt-1 flex flex-wrap justify-center md:justify-start gap-3">
                        <button 
                            onClick={handleNavigateToPartners}
                            className="px-6 py-2.5 bg-brand-primary text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-[0_10px_30px_rgba(76,29,149,0.3)] hover:bg-brand-secondary transition-all transform active:scale-95 flex items-center gap-2"
                        >
                            Empezar Ahora <Icon name="arrowRight" className="w-3.5 h-3.5"/>
                        </button>
                        <div className="flex items-center gap-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
                            Licencia Socio Activa
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BookSummaryPage: React.FC<BookSummaryPageProps> = ({ bookId }) => {
    const { allBooks, setToastNotification, language, addHubPost, projects, updateProject, setCurrentView } = useContext(AppContext);
    const [book, setBook] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [loadMsgIdx, setLoadMsgIdx] = useState(0);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
    const [isSavingToProject, setIsSavingToProject] = useState(false);
    const [isShared, setIsShared] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const slugify = (text: string) => {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, '-')
            .replace(/[^\w-]+/g, '')
            .replace(/--+/g, '-');
    };

    useEffect(() => {
        if (!loading) return;
        const interval = setInterval(() => {
            setLoadMsgIdx(prev => (prev + 1) % bookLoadingMessages.length);
        }, 1200);
        return () => clearInterval(interval);
    }, [loading]);

    useEffect(() => {
        // Buscamos por ID o por Slug (título original o español)
        const foundBook = allBooks.find(b => 
            b.id === bookId || 
            slugify(b.title) === bookId || 
            slugify(b.spanishTitle) === bookId
        );
        
        if (foundBook) {
            setBook(foundBook);
            setTimeout(() => setLoading(false), 800);
        } else {
            setLoading(false);
        }
    }, [bookId, allBooks]);

    const handleCloseReader = () => {
        // Redirección absoluta para evitar pantallas en blanco en enlaces públicos
        window.location.href = 'https://ia.goatify.app/#dashboard';
    };

    const handleScrollToTop = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleDownloadPDF = () => {
        if (!book) return;
        setToastNotification({ title: "Generando PDF", message: "Preparando guía maestra detallada...", icon: 'upload', isLoading: true });
        try {
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const margin = 20;
            let y = 20;

            doc.setFillColor(76, 29, 149);
            doc.rect(0, 0, 210, 15, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("GOATIFY VIRTUAL LIBRARY - GUÍA MAESTRA", 105, 10, { align: 'center' });

            doc.setTextColor(17, 24, 39);
            doc.setFontSize(22);
            doc.text(book.spanishTitle || 'Resumen', margin, y + 15);
            y += 22;

            doc.setFontSize(12);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text(`Por ${book.author || 'Desconocido'}`, margin, y);
            y += 15;

            doc.setDrawColor(230, 230, 230);
            doc.line(margin, y, 190, y);
            y += 10;

            const cleanText = book.content.replace(/\*\*/g, '').replace(/###/g, '').replace(/####/g, '').replace(/#/g, '');
            const lines = cleanText.split('\n');
            
            doc.setFontSize(10);
            doc.setTextColor(50, 50, 50);

            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) { y += 5; return; }

                const splitText = doc.splitTextToSize(trimmed, 170);
                splitText.forEach((t: string) => {
                    if (y > 275) {
                        doc.addPage();
                        y = 20;
                    }
                    doc.text(t, margin, y);
                    y += 6;
                });
            });

            doc.save(`Goatify_Guia_${book.title.replace(/\s+/g, '_')}.pdf`);
            setToastNotification({ title: "Descarga Completa", message: "La guía maestra se ha guardado.", icon: 'check' });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo generar el PDF.", icon: "close" });
        }
    };

    const handleShareToFeed = () => {
        if (!book) return;
        
        const paragraphs = book.content
            .split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0 && !p.startsWith('#') && !p.startsWith('> ') && !p.includes('Descubre los secretos de') && !p.includes('He terminado de analizar'));

        const contentPreview = paragraphs.slice(0, 2).map((p, idx) => {
            const shortText = p.length > 250 ? p.substring(0, 250) + '...' : p;
            return `💡 **Punto Estratégico ${idx + 1}:**\n${shortText}`;
        }).join('\n\n');

        const postContent = `
📚 **Análisis Estratégico:** ${book.spanishTitle}

${contentPreview}

[📖 Leer Guía Maestra completa aquí](${window.location.origin}/#/book/${slugify(book.title)}?id=${book.id})
`;
        addHubPost(postContent);
        setIsShared(true);
        setToastNotification({ title: "Compartido", message: "Tu análisis está ahora en el Hub de la Comunidad.", icon: "hub" });
    };

    const handleSaveToProject = async () => {
        if (!targetProjectId || !book) return;
        setIsSavingToProject(true);
        try {
            const project = projects.find(p => p.id === targetProjectId);
            if (project) {
                const newNote = {
                    id: `book-note-${Date.now()}`,
                    title: `Guía: ${book.spanishTitle}`,
                    content: book.content,
                    createdAt: new Date().toISOString()
                };
                await updateProject(project.id, { notes: [newNote, ...(project.notes || [])] });
                setToastNotification({ title: "Guardado", message: "Guía añadida a las notas del proyecto.", icon: "check" });
            }
            setIsProjectModalOpen(false);
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo guardar.", icon: 'close' });
        } finally {
            setIsSavingToProject(false);
        }
    };

    const renderBookContent = (content: string) => {
        const paragraphs = content.split('\n\n');
        const firstPart = paragraphs.slice(0, 3).join('\n\n');
        const secondPart = paragraphs.slice(3).join('\n\n');

        return (
            <>
                <ChatMessageRenderer text={firstPart} className="text-lg leading-relaxed" />
                <ArticleAd />
                {secondPart && <ChatMessageRenderer text={secondPart} className="text-lg leading-relaxed" />}
            </>
        );
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]"><Spinner text={bookLoadingMessages[loadMsgIdx]} /></div>;
    if (!book) return <div className="p-20 text-center">Libro no encontrado.</div>;

    return (
        <div ref={scrollContainerRef} className="p-4 sm:p-10 h-screen overflow-y-auto bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 font-sans selection:bg-brand-primary/30 pb-32">
             <div className="max-w-4xl mx-auto animate-fade-in text-center">
                <div className="flex flex-col sm:flex-row justify-between items-start mb-12 gap-6 border-b border-gray-100 dark:border-neutral-800 pb-10">
                    <div className="flex items-center gap-3">
                         <button onClick={handleCloseReader} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-brand-primary" title="Regresar a la aplicación">
                            <Icon name="chevronLeft" className="w-6 h-6"/>
                         </button>
                        <div className="text-left">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-primary mb-1 block">Biblioteca Virtual Goatify</span>
                            <h1 className="text-4xl sm:text-6xl font-black mb-2 tracking-tighter leading-none text-neutral-900 dark:text-white uppercase">{book.spanishTitle}</h1>
                            <p className="text-xl text-gray-500 dark:text-gray-400 font-medium italic">Autor: {book.author}</p>
                        </div>
                    </div>
                    <div className="flex gap-3 flex-wrap items-center">
                        <SpeechSynthesisControls textToRead={book.content} />
                        <Button onClick={handleDownloadPDF} variant="secondary" className="shadow-md h-12 px-6 font-black uppercase text-xs tracking-widest bg-brand-primary !text-white border-none"><Icon name="upload" className="w-4 h-4"/> Exportar PDF</Button>
                    </div>
                </div>
                
                <div ref={contentRef} className="article-body text-justify">
                    {renderBookContent(book.content)}
                </div>

                <div className="mt-20 p-10 bg-neutral-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden ring-1 ring-white/10">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary rounded-full -mr-32 -mt-32 blur-[80px] opacity-30"></div>
                    <div className="relative z-10 text-center">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-4 border-white/20 p-2 transform hover:scale-110 transition-transform">
                             <img src={LOGO_URL} alt="Goatify Logo" className="w-full h-full object-contain" />
                        </div>
                        <h2 className="text-2xl font-black uppercase tracking-widest mb-4">¿Te gustó este análisis?</h2>
                        <p className="text-neutral-400 max-w-lg mx-auto mb-8 font-medium">Comparte esta guía con tu círculo profesional y gana Intis ($I) por cada interacción relevante.</p>
                        
                        <div className="flex flex-wrap justify-center gap-4">
                            <Button onClick={handleShareToFeed} className={`px-6 py-4 font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center gap-2 transition-all ${isShared ? 'bg-green-600 text-white' : 'bg-brand-primary hover:bg-brand-secondary text-white border-none'}`}>
                                <Icon name={isShared ? "check" : "share"} className="w-4 h-4"/> {isShared ? 'COMPARTIDO' : 'Compartir en Feed'}
                            </Button>
                            <Button onClick={handleDownloadPDF} variant="secondary" className="bg-white/10 hover:bg-white/20 !text-white border-white/20 px-6 py-4 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                                <Icon name="upload" className="w-4 h-4"/> Descargar PDF
                            </Button>
                            <Button onClick={() => setIsProjectModalOpen(true)} variant="secondary" className="bg-white/10 hover:bg-white/20 !text-white border-white/20 px-6 py-4 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                                <Icon name="folder" className="w-4 h-4"/> Guardar en Proyecto
                            </Button>
                        </div>
                    </div>
                </div>

                <footer className="mt-20 pt-10 border-t border-neutral-100 dark:border-neutral-800 text-center flex flex-col items-center pb-20">
                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-6">© 2026 Goatify IA Solutions - Todos los derechos reservados</p>
                    <div className="flex gap-4">
                        <button 
                            onClick={handleScrollToTop} 
                            className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all shadow-md group" 
                            title="Ir hacia arriba"
                        >
                            <Icon name="chevronLeft" className="w-6 h-6 rotate-90 text-neutral-500 group-hover:text-brand-primary transition-colors" />
                        </button>
                        <button 
                            onClick={handleCloseReader} 
                            className="p-4 bg-brand-primary rounded-full hover:bg-brand-secondary transition-all shadow-lg group" 
                            title="Volver al Inicio"
                        >
                            <Icon name="close" className="w-6 h-6 text-white" />
                        </button>
                    </div>
                </footer>
             </div>

             <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title="Guardar en Proyecto">
                <div className="space-y-4">
                    <p className="text-sm text-left">Selecciona el proyecto donde deseas guardar esta guía como nota:</p>
                    <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="secondary" onClick={() => setIsProjectModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveToProject} disabled={isSavingToProject}>
                            {isSavingToProject ? "Guardando..." : "Confirmar"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default BookSummaryPage;
