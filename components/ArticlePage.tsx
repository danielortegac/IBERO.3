import React, { useContext, useState, useEffect, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import { useTranslation } from '../hooks/useTranslation';
import SpeechSynthesisControls from './ui/SpeechSynthesisControls';
import jsPDF from 'jspdf';
import Button from './ui/Button';
import type { GoatifyArticle } from '../types';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import Spinner from './ui/Spinner';
import { collection, getDocs, query, orderBy, doc, getDoc, limit } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import Modal from './ui/Modal';

// Logo oficial de la aplicación
const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";

// Declare html2canvas for TS if not present
declare global {
    interface Window {
        html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
    }
}

interface ArticlePageProps {
    articleId: string;
}

const ArticleAd: React.FC = () => {
    const handleNavigateToPartners = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Redirección directa e infalible al login/partners de la app oficial
        window.location.href = 'https://ia.goatify.app/#partners';
    };

    return (
        <div className="my-8 p-0.5 bg-gradient-to-r from-brand-primary via-purple-600 to-indigo-600 rounded-[2rem] shadow-2xl transform hover:scale-[1.01] transition-all duration-500 not-prose">
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

const formatDateSafe = (dateString: string): string => {
    try {
        if (!dateString) return "Reciente";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
             return "Reciente";
        }
        return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
        return "Reciente";
    }
};

const ArticlePage: React.FC<ArticlePageProps> = ({ articleId }) => {
    const { goatifyNews, setToastNotification, projects, updateProject, addHubPost, setCurrentView } = useContext(AppContext);
    const [textForSpeech, setTextForSpeech] = useState('');
    const [foundArticle, setFoundArticle] = useState<GoatifyArticle | null>(null);
    const [isSearching, setIsSearching] = useState(true);
    const [isShared, setIsShared] = useState(false);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
    const [isSavingToProject, setIsSavingToProject] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try { 
                    await signInAnonymously(auth); 
                } catch (err) { 
                    console.error("Anonym auth error", err); 
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!isAuthReady) return;

        const slugify = (text: string) => {
            return text
                .toString()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '')
                .replace(/--+/g, '-')
                .replace(/^-+/, '')
                .replace(/-+$/, '');
        };

        const findArticle = async () => {
            setIsSearching(true);
            
            // 1. Try direct ID match in local news
            let local = goatifyNews.find(a => a.id === articleId);
            if (!local) {
                // Try slug match in local news
                local = goatifyNews.find(a => slugify(a.title) === articleId);
            }

            if (local) {
                setFoundArticle(local);
                setIsSearching(false);
                return;
            }

            try {
                // 2. Try direct ID match in community articles
                const commRef = doc(db, "community_articles", articleId);
                const commSnap = await getDoc(commRef);
                if (commSnap.exists()) {
                    setFoundArticle({ id: commSnap.id, ...commSnap.data() } as GoatifyArticle);
                    setIsSearching(false);
                    return;
                }

                // 3. Try searching by slug in community articles
                const commSlugQuery = query(collection(db, "community_articles"), limit(10)); // We can't query by slug directly if it's not a field, but we can check recent ones
                const commSlugSnap = await getDocs(commSlugQuery);
                const foundInComm = commSlugSnap.docs.find(d => slugify(d.data().title) === articleId);
                if (foundInComm) {
                    setFoundArticle({ id: foundInComm.id, ...foundInComm.data() } as GoatifyArticle);
                    setIsSearching(false);
                    return;
                }

                // 4. Try system news
                const newsRef = collection(db, "system_news");
                const q = query(newsRef, orderBy("createdAt", "desc"), limit(15));
                const snapshot = await getDocs(q);
                
                let matchedArticle: GoatifyArticle | null = null;
                snapshot.forEach(d => {
                    const data = d.data();
                    if (data.articles && Array.isArray(data.articles)) {
                        // Try ID match
                        let found = data.articles.find((a: GoatifyArticle) => a.id === articleId);
                        // Try Slug match
                        if (!found) {
                            found = data.articles.find((a: GoatifyArticle) => slugify(a.title) === articleId);
                        }
                        if (found) matchedArticle = found;
                    }
                });

                if (matchedArticle) {
                    setFoundArticle(matchedArticle);
                }
            } catch (error) {
                console.error("Error retrieving article:", error);
            } finally {
                setIsSearching(false);
            }
        };

        if (articleId) {
            findArticle();
        }
    }, [articleId, goatifyNews, isAuthReady]);

    useEffect(() => {
        if (foundArticle) {
            const fullText = `${foundArticle.title}. Por ${foundArticle.author || 'Goatify Editorial'}. ${foundArticle.content.replace(/\*\*/g, '').replace(/###/g, '')}. Perspectiva Goatify: ${foundArticle.goatifyTakeaway}`;
            setTextForSpeech(fullText);
        }
    }, [foundArticle]);

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
    
    const handleDownloadArticle = async () => {
        if (!foundArticle || !printRef.current || !window.html2canvas) {
            setToastNotification({ title: 'Error', message: 'Librerías no preparadas.', icon: 'close' });
            return;
        }

        setToastNotification({ title: 'Generando PDF...', message: 'Preparando análisis completo...', icon: 'upload', isLoading: true });

        try {
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const canvas = await window.html2canvas(printRef.current, {
                scale: 2, 
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgWidth = 210; 
            const pageHeight = 297; 
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            let heightLeft = imgHeight;
            let position = 0;
            const imgData = canvas.toDataURL('image/jpeg', 0.95);

            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`Goatify_Article_${foundArticle.title.substring(0, 20)}.pdf`);
            setToastNotification({ title: 'PDF Listo', message: 'Descarga completada.', icon: 'check' });

        } catch (error) {
            console.error("PDF Generation failed", error);
            setToastNotification({ title: 'Error', message: 'No se pudo generar el PDF.', icon: 'close' });
        }
    };

    const handleShareToFeed = () => {
        if (!foundArticle) return;
        const slugify = (text: string) => {
            return text
                .toString()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '')
                .replace(/--+/g, '-')
                .replace(/^-+/, '')
                .replace(/-+$/, '');
        };

        const postContent = `
### ${foundArticle.title.toUpperCase()}
**Fuente:** ${foundArticle.source || 'Goatify Intelligence'}

**Resumen Ejecutivo:**
> "${foundArticle.summary}"

[Leer análisis completo aquí](${window.location.origin}/#/article/${slugify(foundArticle.title)})
`;
        addHubPost(postContent);
        setIsShared(true);
        setToastNotification({ title: "Compartido", message: "Artículo publicado en el Hub de la Comunidad.", icon: "hub" });
    };

    const handleSaveToProject = async () => {
        if (!targetProjectId || !foundArticle) return;
        setIsSavingToProject(true);
        try {
            const project = projects.find(p => p.id === targetProjectId);
            if (project) {
                const newNote = {
                    id: `article-note-${Date.now()}`,
                    title: foundArticle.title,
                    content: `# ${foundArticle.title}\n\n${foundArticle.content}\n\n**Perspectiva Goatify:** ${foundArticle.goatifyTakeaway}`,
                    createdAt: new Date().toISOString()
                };
                await updateProject(project.id, { notes: [newNote, ...(project.notes || [])] });
                setToastNotification({ title: "Guardado", message: "Artículo añadido a las notas del proyecto.", icon: "check" });
            }
            setIsProjectModalOpen(false);
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo guardar.", icon: "close" });
        } finally {
            setIsSavingToProject(false);
        }
    };

    // Separar contenido por párrafos para insertar publicidad después del 3ro
    const formatArticleContent = (content: string) => {
        let formatted = content;
        
        // Helper to convert ALL CAPS text to sentence case
        const toSentenceCase = (text: string) => {
            // Only convert if the text is significantly uppercase (more than 80% of letters)
            const letters = text.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
            if (letters.length > 0) {
                const upperCount = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
                if (upperCount / letters.length > 0.8) {
                    return text.toLowerCase().replace(/(^\s*[^a-zA-Záéíóúñ]*[a-zA-Záéíóúñ]|[\.\!\?]\s*[a-zA-Záéíóúñ])/g, c => c.toUpperCase());
                }
            }
            return text;
        };

        // Process each paragraph
        formatted = formatted.split('\n\n').map(p => {
            let paragraph = p.trim();
            
            // Convert to sentence case if it's all caps
            paragraph = toSentenceCase(paragraph);

            // Handle "### Subtitle. Paragraph" -> "**Subtitle.** Paragraph"
            paragraph = paragraph.replace(/^(#{1,3})\s*([^.:]+)(?:\.|\:)\s+(.+)$/m, '**$2.** $3');
            
            // Handle standalone "### Subtitle" -> "**Subtitle**"
            paragraph = paragraph.replace(/^(#{1,3})\s+(.*)$/m, '**$2**');

            return paragraph;
        }).join('\n\n');
        
        return formatted;
    };

    const renderArticleContent = (content: string) => {
        const formattedContent = formatArticleContent(content);
        const paragraphs = formattedContent.split('\n\n').filter(p => p.trim() !== '');
        
        let insertIndex = 3;
        // Evitar insertar la publicidad inmediatamente después de un subtítulo
        while (insertIndex < paragraphs.length && paragraphs[insertIndex - 1] && paragraphs[insertIndex - 1].trim().startsWith('**') && paragraphs[insertIndex - 1].trim().endsWith('**')) {
            insertIndex++;
        }

        const firstPart = paragraphs.slice(0, insertIndex).join('\n\n');
        const secondPart = paragraphs.slice(insertIndex).join('\n\n');

        return (
            <>
                <ChatMessageRenderer text={firstPart} className="text-lg sm:text-xl" />
                {paragraphs.length > 3 && <ArticleAd />}
                {secondPart && <ChatMessageRenderer text={secondPart} className="text-lg sm:text-xl" />}
            </>
        );
    };

    if (isSearching) {
         return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#0a0a0a]">
                <Spinner text="Abriendo inteligencia..." />
            </div>
         )
    }

    if (!foundArticle) {
        return (
            <div className="min-h-screen flex items-center justify-center text-center p-4 bg-white dark:bg-[#0a0a0a] font-sans">
                <div className="max-w-md p-8 bg-neutral-50 dark:bg-neutral-800 rounded-3xl shadow-xl border border-neutral-200 dark:border-neutral-700">
                    <Icon name="news" className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-neutral-800 dark:text-white mb-2">Artículo no disponible</h1>
                    <p className="text-neutral-500 mb-6">El enlace es incorrecto o el artículo ha sido retirado.</p>
                    <button onClick={handleCloseReader} className="px-8 py-2 bg-brand-primary text-white rounded-full font-bold shadow-lg">Ir al Inicio</button>
                </div>
            </div>
        );
    }

    return (
        <div ref={scrollContainerRef} className="min-h-screen bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 font-sans overflow-y-auto h-screen w-full selection:bg-brand-primary/30 pb-32">
            <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title="Guardar en Proyecto">
                <div className="space-y-4">
                    <p className="text-sm">Selecciona el proyecto donde deseas guardar este artículo como nota:</p>
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

            <style>{`
                .article-reader p {
                    text-indent: 0 !important;
                    margin-top: 1.5rem !important;
                    margin-bottom: 1.5rem !important;
                    line-height: 1.8 !important;
                    text-align: justify !important;
                }
                .article-reader li span, .article-reader blockquote p {
                    text-indent: 0 !important;
                }
            `}</style>

            <div ref={printRef} style={{ position: 'absolute', top: -9999, left: -9999, width: '800px', backgroundColor: '#ffffff', color: '#000000', padding: '40px' }}>
                <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '10px', color: '#111' }}>{foundArticle.title}</h1>
                <p style={{ fontSize: '14px', marginBottom: '30px', color: '#666', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Por {foundArticle.author} • {formatDateSafe(foundArticle.publicationDate)}</p>
                <div style={{ fontSize: '16px', lineHeight: '1.8', color: '#333' }}>{foundArticle.content}</div>
                <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '15px', border: '1px solid #eee' }}>
                    <h3 style={{ fontWeight: 'bold', marginBottom: '10px', color: '#4c1d95' }}>Perspectiva Estratégica Goatify:</h3>
                    <p style={{ fontStyle: 'italic' }}>{foundArticle.goatifyTakeaway}</p>
                </div>
            </div>

             <div className="sticky top-0 z-50 bg-white/90 dark:bg-[#0a0a0a]/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={handleCloseReader} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-brand-primary" title="Regresar a la aplicación">
                        <Icon name="chevronLeft" className="w-6 h-6"/>
                    </button>
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-brand-primary">Goatify Reader Pro</span>
                </div>
                <div className="flex items-center gap-3">
                    <SpeechSynthesisControls textToRead={textForSpeech} />
                    <Button onClick={handleDownloadArticle} variant="secondary" size="sm" className="hidden sm:flex h-9 font-bold bg-brand-primary !text-white border-none shadow-md">
                        <Icon name="upload" className="w-4 h-4" /> EXPORTAR PDF
                    </Button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-6 sm:p-12 pb-32">
                <header className="mb-12">
                    <div className="flex items-center gap-3 mb-6">
                        <img src={LOGO_URL} alt="Goatify" className="w-10 h-10 object-contain mr-2" referrerPolicy="no-referrer" />
                        <span className="px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-black uppercase tracking-widest">
                            {foundArticle.category || foundArticle.source}
                        </span>
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{formatDateSafe(foundArticle.publicationDate)}</span>
                    </div>
                    
                    <h1 className="text-4xl sm:text-6xl font-black leading-none mb-8 tracking-tighter text-neutral-900 dark:text-white">{foundArticle.title}</h1>
                    
                    <div className="flex items-center justify-between border-y border-gray-100 dark:border-gray-800 py-8">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-gradient-to-br from-brand-primary to-purple-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
                                {foundArticle.author?.charAt(0)}
                            </div>
                            <div>
                                <p className="font-black text-lg text-neutral-900 dark:text-white leading-none mb-1">{foundArticle.author}</p>
                                <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider">Analista de Estrategia Digital</p>
                            </div>
                        </div>
                    </div>
                </header>
                
                <article className="prose prose-xl dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:text-neutral-700 dark:prose-p:text-neutral-300 font-sans article-reader">
                    <div className="bg-neutral-50 dark:bg-white/5 p-8 rounded-[2rem] mb-12 border border-neutral-100 dark:border-neutral-800 not-prose shadow-inner">
                        <h3 className="font-black text-xs mb-3 uppercase tracking-[0.2em] text-brand-primary">Resumen Ejecutivo</h3>
                        <p className="text-xl text-neutral-600 dark:text-neutral-300 font-medium italic leading-relaxed">"{foundArticle.summary}"</p>
                    </div>
                    
                    <div className="article-body">
                        {renderArticleContent(foundArticle.content)}
                    </div>

                    <div className="mt-12 p-8 bg-brand-primary/5 dark:bg-white/5 rounded-3xl border border-brand-primary/20 not-prose">
                        <h3 className="font-black text-sm uppercase tracking-widest text-brand-primary mb-4 flex items-center gap-2">
                             <Icon name="ai" className="w-5 h-5"/> Perspectiva Estratégica Goatify
                        </h3>
                        <p className="text-lg font-medium italic text-neutral-700 dark:text-neutral-300 leading-relaxed">
                            {foundArticle.goatifyTakeaway}
                        </p>
                    </div>

                    <div className="mt-20 p-10 bg-[#050505] rounded-[2.5rem] text-white shadow-2xl not-prose relative overflow-hidden ring-1 ring-white/10">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary rounded-full -mr-32 -mt-32 blur-[80px] opacity-30"></div>
                        <div className="relative z-10 text-center">
                            <h2 className="text-2xl font-black uppercase tracking-widest mb-6 italic">¿Te interesó este análisis?</h2>
                            <div className="flex flex-wrap justify-center gap-4">
                                <Button onClick={handleShareToFeed} className={`px-6 py-3 font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center gap-2 transition-all ${isShared ? 'bg-green-600 text-white' : 'bg-brand-primary hover:bg-brand-secondary text-white border-none'}`}>
                                    <Icon name={isShared ? "check" : "share"} className="w-4 h-4"/> {isShared ? 'COMPARTIDO' : 'Compartir en Feed'}
                                </Button>
                                <Button onClick={handleDownloadArticle} variant="secondary" className="bg-white/10 hover:bg-white/20 !text-white border-white/20 px-6 py-3 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                                    <Icon name="upload" className="w-4 h-4"/> Descargar PDF
                                </Button>
                                <Button onClick={() => setIsProjectModalOpen(true)} variant="secondary" className="bg-white/10 hover:bg-white/20 !text-white border-white/20 px-6 py-3 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                                    <Icon name="folder" className="w-4 h-4"/> Guardar en Proyecto
                                </Button>
                            </div>
                        </div>
                    </div>
                </article>
                
                <footer className="mt-20 pt-10 border-t border-neutral-100 dark:border-neutral-800 text-center flex flex-col items-center">
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
        </div>
    );
};

export default ArticlePage;
