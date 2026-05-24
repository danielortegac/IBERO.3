
import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import type { GoatifyArticle, Book, Project } from '../types';
import { AppContext } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import Card from './ui/Card';
import Button from './ui/Button';
import Icon from './Icon';
import Modal from './ui/Modal';
import Spinner from './ui/Spinner';
import Textarea from './ui/Textarea';
import Input from './ui/Input';
import { NewsCardSkeleton } from './ui/Skeleton';
import jsPDF from 'jspdf';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import { collection, query, orderBy, getDocs, limit, addDoc, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, storage } from '../firebaseConfig';
import { generateFullArticleDraft, rewriteText } from '../services/geminiService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';

const DID_YOU_KNOW_FACTS = ["El corazón de un colibrí late hasta 1,200 veces por minuto.", "El cerebro humano procesa imágenes 60,000 veces más rápido que texto.", "Las nutrias se toman de la mano mientras duermen para no separarse flotando.", "La primera programadora de la historia fue una mujer: Ada Lovelace.", "El 90% de los datos del mundo se han creado en los últimos dos años.", "Los pulpos tienen tres corazones y sangre azul.", "La IA AlphaGo venció al campeón mundial de Go en 2016, una década antes de lo previsto.", "Leer 20 minutos al día te expone a 1.8 millones de palabras al año.", "El 'burnout' fue reconocido oficialmente como un fenómeno ocupacional por la OMS en 2019.", "Las abejas pueden reconocer rostros humanos.", "La multitarea reduce tu productividad hasta en un 40%.", "El primer virus informático se creó in 1971 y se llamaba 'Creeper'.", "La luz azul de las pantallas reduce la melatonina y afecta tu sueño profundo.", "Tardas 23 minutos en volver a concentrarte completamente tras una interrupción.", "El 85% de los trabajos que existirán en 2030 aún no se han inventado.", "Los flamencos nacen grises, se vuelven rosas por comer camarones.", "Escribir tus metas a mano aumenta en un 42% la probabilidad de lograrlas.", "La meditación diaria puede cambiar físicamente la estructura de tu cerebro en 8 semanas.", "El efecto Zeigarnik explica por qué recordamos mejor las tareas incompletas.", "La técnica Pomodoro se llama así por el reloj de cocina con forma de tomate de su creador.", "El ADN humano es idéntico en un 50% al de un plátano.", "Júpiter actúa como un escudo espacial, absorbiendo asteroides que podrían golpear la Tierra.", "Si pudieras doblar una hoja de papel 42 veces, llegaría hasta la Luna.", "El sonido no viaja en el vacío del espacio; nadie puede oírte gritar allí.", "Cleopatra vivió más cerca de la invención del iPhone que de la construcción de las pirámides.", "Las hormigas no tienen pulmones; respiran a través de pequeños orificios en sus costados.", "Un día en Venus es más largo que un año en Venus.", "La miel es el único alimento que nunca se echa a perder.", "El ojo de un avestruz es más grande que su cerebro.", "Los plátanos son ligeramente radiactivos.", "El primer mouse de computadora estaba hecho de madera.", "Hay más estrellas en el universo que granos de arena en todas las playas de la Tierra.", "El plástico tarda hasta 1,000 años en descomponerse.", "Los delfines tienen names únicos unos para otros.", "Tu nose puede recordar 50,000 aromas diferentes.", "El Monte Everest crece aproximadamente 4 milímetros cada año.", "La Torre Eiffel puede crecer hasta 15 cm en verano debido a la expansión térmica.", "Los koalas tienen huellas dactilares casi idénticas a las de los humanos.", "El agua caliente se congela más rápido que el agua fría (Efecto Mpemba).", "Las vacas tienen mejores amigas y se estresan cuando las separan.", "Un rayo cae 6 veces más caliente que la superficie del sol.", "El 20% del oxígeno del mundo es producido por la selva amazónica.", "Los tiburones han existido por más tiempo que los árboles.", "Un grupo de cuervos se llama 'asesinato'.", "El corazón de una ballena azul es tan grande que un humano podría nadar en sus arterias.", "La letra 'E' es la más común en el idioma inglés.", "Los gatos pasan el 70% de sus vidas durmiendo.", "El chocolate fue usado como moneda por los aztecas.", "La Gran Muralla China no es visible desde la Luna a simple vista.", "Los cerdos no pueden mirar hacia el cielo.", "El nombre original de Google era 'Backrub'.", "Nintendo se fundó en 1889 como una empresa de cartas de juego.", "El primer video de YouTube se titula 'Me at the zoo'.", "La Antártida es el desierto más grande del mundo.", "Las jirafas duermen solo 30 minutos al día.", "El universo observable tiene un diámetro de 93 mil millones de años luz.", "Los átomos son 99.9999999% espacio vacío.", "Si eliminas todo el espacio vacío en los átomos, toda la raza humana cabría en un cubo de azúcar.", "El cerebro humano genera suficiente electricidad para encender una bombilla pequeña.", "Los bebés nacen con 300 huesos, pero los adultos tienen 206.", "El sudor de los hipopótamos es rojo y actúa como protector solar.", "El bambú puede crecer hasta 91 cm en un solo día.", "Las estrellas de mar no tienen cerebro ni sangre.", "El primer producto con código de barras escaneado fue un paquete de chicles.", "La palabra 'robot' proviene de la palabra checa 'robota', que significa trabajo forzado.", "El Internet pesa aproximadamente lo mismo que una fresa.", "Los vikingos usaban cráneos de enemigos como copas (Mito: en realidad usaban cuernos).", "El sonido vaia 4 veces más rápido en el agua que en el aire.", "Los cocodrilos pueden vivir hasta 100 años.", "El sol constituye el 99.8% de la masa de todo el sistema solar.", "La luna se aleja de la Tierra 3.8 cm cada año.", "En Saturno y Júpiter llueven diamantes.", "El aguacate es una ventaja de salud, no solo una verdura.", "El sentido del olfato está directamente conectado con la memoria y la emoción en el cerebro.", "Los osos polares tienen la piel negra bajo su pelaje blanco.", "El primer mensaje de texto enviado decía 'Merry Christmas'.", "La contraseña más común en el mundo sigue siendo '123456'.", "Amazon comenzó vendiendo solo libros.", "Netflix se fundó antes que Google (1997 vs 1998).", "El código QR fue inventado para rastrear piezas de automóviles.", "La primera cámara digital pesaba 3.6 kg y tardaba 23 segundos en guardar una foto.", "Los pulpos tienen 9 cerebros: uno central y uno en cada tentáculo.", "El café es la segunda mercancía más comercializada en el mundo después del petróleo.", "Islandia no tiene mosquitos.", "El desierto de Atacama en Chile es el lugar más seco de la Tierra.", "Las nubes pueden pesar más de un millón de libras.", "Un caracol puede dormir durante 3 años.", "Las mariposas prueban la comida con sus patas.", "El animal más ruidoso del mundo es el cachalote (230 decibelios).", "El rugido de un león se puede escuchar a 8 km de distancia.", "Los elefantes son los únicos animales que no pueden saltar.", "La lengua de una ballena azul pesa tanto como un elefante.", "El ojo de un avestruz es más grande que su cerebro.", "El animal más fuerte del mundo es la avispa de mar.", "Los tiburones no tienen huesos; su esqueleto está hecho de cartílago.", "Las vacas pueden subir escaleras, pero no bajarlas.", "El corazón de un camarón está en su cabeza.", "Los caracoles pueden regenerar sus ojos si los pierden.", "Las mariposas tienen el sentido del gusto en sus patas.", "El elefante es el único mamífero que no puede saltar.", "El oso hormiguero come hasta 35,000 hormigas al día.", "Los búhos no pueden mover sus ojos; tienen que girar la cabeza.", "El animal más rápido en el agua es el pez vela.", "Los caballos duermen de pie.", "Las jirafas tienen la misma cantidad de verdades en el cuello que los humanos (7).", "El colibrí es el único pájaro que puede volar hacia atrás.", "Los guatines no pueden caminar hacia atrás.", "El cerebro de un avestruz es más pequeño que su ojo.", "Los pulpos tienen sangre azul debido al cobre en su hemoglobina.", "Las estrellas de mar no tienen cerebro.", "El animal más fuerte del mundo es la avispa de mar.", "El animal más grande que ha existido es la ballena azul.", "Los delfines duermen con un ojo abierto.", "Las hormigas nunca duermen.", "El mosquito es el animal más letal del mundo debido a las enfermedades que transmite."];

const DidYouKnowCarousel: React.FC = () => {
    const [currentIndex, setCurrentIndex] = useState(() => Math.floor(Math.random() * DID_YOU_KNOW_FACTS.length));
    const { setStartupPrompt, setCurrentView, language, addNewGlobalChat } = useContext(AppContext);
    
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % DID_YOU_KNOW_FACTS.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const nextSlide = () => {
        setCurrentIndex((prev) => (prev + 1) % DID_YOU_KNOW_FACTS.length);
    };

    const prevSlide = () => {
        setCurrentIndex((prev) => (prev - 1 + DID_YOU_KNOW_FACTS.length) % DID_YOU_KNOW_FACTS.length);
    };

    const handleFactClick = async () => {
        const fact = DID_YOU_KNOW_FACTS[currentIndex];
        const langInstruction = language === 'en' 
            ? `I just read this fact in "Did you know?": "${fact}". Please explain it to me in depth, providing scientific and historical context in ENGLISH.` 
            : `Acabo de leer este dato curioso en "¿Sabías que...?": "${fact}". Por favor, explícamelo a profundidad, dándome el contexto científico o histórico, y por qué es relevante hoy en ESPAÑOL.`;
            
        // REQUISITO: Abrir chat nuevo y redactar prompt automáticamente
        await addNewGlobalChat();
        setStartupPrompt(langInstruction);
        setCurrentView('aiStudio');
        window.location.hash = 'aiStudio/chat';
    };

    return (
        <section className="mt-12 mb-12 animate-fade-in relative">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2 bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-600 font-sans">
                    <Icon name="light" className="w-6 h-6 text-amber-500"/> {language === 'en' ? 'Did You Know?' : '¿Sabías que...?'}
                </h2>
                <div className="flex gap-2">
                    <button onClick={prevSlide} className="p-2 rounded-full bg-light-surface dark:bg-dark-surface hover:bg-neutral-200 dark:hover:bg-neutral-700 shadow-sm transition-transform hover:scale-110">
                        <Icon name="chevronLeft" className="w-5 h-5"/>
                    </button>
                    <button onClick={nextSlide} className="p-2 rounded-full bg-light-surface dark:bg-dark-surface hover:bg-neutral-200 dark:hover:bg-neutral-700 shadow-sm transition-transform hover:scale-110">
                        <Icon name="chevronLeft" className="w-5 h-5 rotate-180"/>
                    </button>
                </div>
            </div>
            
            <div onClick={handleFactClick} className="relative overflow-hidden rounded-3xl shadow-2xl border border-white/10 cursor-pointer group transition-all duration-300 hover:scale-[1.01] hover:shadow-brand-primary/30">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-black opacity-90 dark:opacity-100"></div>
                <div className="absolute -top-20 -left-20 w-60 h-60 bg-brand-primary rounded-full blur-[100px] opacity-40 animate-pulse"></div>
                <div className="absolute bottom-0 right-0 w-80 h-80 bg-amber-500 rounded-full blur-[120px] opacity-20"></div>
                
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30"></div>

                <div className="relative z-10 p-8 md:p-12 flex flex-col items-center justify-center text-center min-h-[250px] transition-all duration-500 ease-in-out transform">
                    <div className="mb-6 p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform">
                        <Icon name="brain" className="w-8 h-8 text-white"/>
                    </div>
                    
                    <p className="text-xl md:text-3xl font-bold text-white leading-relaxed drop-shadow-lg animate-subtle-slide-in-up key={currentIndex} font-sans">
                        "{DID_YOU_KNOW_FACTS[currentIndex]}"
                    </p>
                    
                    <div className="mt-6 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 text-white/90 text-sm font-bold bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2 border border-white/20">
                         <Icon name="search" className="w-4 h-4"/> {language === 'en' ? 'Click to dive deeper with AI' : 'Clic para profundizar con IA'}
                    </div>
                </div>
            </div>
        </section>
    );
};

const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";

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

const NewsCard: React.FC<{ 
    article: GoatifyArticle; 
    isNew: boolean;
    isShared: boolean;
    onDownload: () => void;
    onShare: () => void;
    onSendToProject: () => void;
    onEmail: () => void;
    onMassEmail?: () => void;
    isAuthor?: boolean;
    onDelete?: () => void;
    onEdit?: () => void;
}> = ({ article, isNew, isShared, onDownload, onShare, onSendToProject, onEmail, onMassEmail, isAuthor, onDelete, onEdit }) => {
    
    const formatDateSafe = (dateString: string) => {
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return "Reciente";
            return date.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch (e) {
            return "Reciente";
        }
    };

    return (
        <div className="bg-light-surface dark:bg-dark-surface rounded-2xl shadow-md transform hover:-translate-y-1 transition-transform duration-300 flex flex-col group relative h-full border border-light-border dark:border-dark-border overflow-hidden">
            {isAuthor && (
                <div className="absolute top-2 left-2 z-20 flex gap-1">
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit?.(); }} className="p-1.5 bg-white/90 dark:bg-black/60 rounded-full shadow-sm hover:bg-brand-primary hover:text-white transition-colors text-neutral-500" title="Editar Artículo"><Icon name="edit" className="w-3 h-3"/></button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(); }} className="p-1.5 bg-white/90 dark:bg-black/60 rounded-full shadow-sm hover:bg-red-500 hover:text-white transition-colors text-neutral-500" title="Eliminar Artículo"><Icon name="trash" className="w-3 h-3"/></button>
                </div>
            )}

            <div className="p-4 sm:p-5 flex flex-col flex-grow relative bg-white dark:bg-dark-surface">
                {isNew && <span className="absolute top-4 right-4 w-2.5 h-2.5 bg-brand-primary rounded-full animate-pulse ring-2 ring-brand-accent/50"></span>}
                
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <img src={LOGO_URL} alt="Goatify" className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                        <span className="text-[9px] font-black uppercase text-brand-primary tracking-widest bg-brand-primary/10 px-2 py-0.5 rounded-md font-sans">{article.category || article.source}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-neutral-400 uppercase tracking-widest font-sans">
                         <Icon name="calendar" className="w-2.5 h-2.5"/> <span>{formatDateSafe(article.publicationDate)}</span>
                    </div>
                </div>

                <a href={`#/article/${slugify(article.title) || article.id}`} target="_blank" rel="noopener noreferrer" className="block mb-2">
                    <h3 className="text-sm sm:text-base font-black group-hover:text-brand-primary transition-colors line-clamp-3 hover:underline leading-tight text-neutral-900 dark:white font-sans">{article.title}</h3>
                </a>
                <p className="text-neutral-500 dark:text-neutral-400 mb-4 text-xs line-clamp-4 flex-grow font-medium leading-relaxed font-sans">{article.summary}</p>
                
                <div className="mt-auto pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                    <a href={`#/article/${slugify(article.title) || article.id}`} target="_blank" rel="noopener noreferrer" className="text-brand-primary font-black hover:text-brand-secondary text-[10px] uppercase tracking-wider flex items-center gap-1 font-sans">Leer Mas <Icon name="arrowRight" className="w-3 h-3"/></a>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare(); }} className={`text-[9px] font-black uppercase px-2 py-1 rounded-full transition-all ${isShared ? 'bg-green-600 text-white' : 'bg-brand-primary/5 text-brand-primary hover:bg-brand-primary hover:text-white'}`}>
                        {isShared ? 'SE HA COMPARTIDO' : 'Compartir en feed'}
                    </button>
                </div>
            </div>
            
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Button variant="ghost" size="sm" className="!p-1.5 bg-black/5 hover:!bg-black/10 backdrop-blur-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownload(); }} title="Download as PDF"><Icon name="upload" className="w-4 h-4 text-neutral-500"/></Button>
                <Button variant="ghost" size="sm" className="!p-1.5 bg-black/5 hover:!bg-black/10 backdrop-blur-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSendToProject(); }} title="Send to Project"><Icon name="send" className="w-4 h-4 text-neutral-500"/></Button>
                <Button variant="ghost" size="sm" className="!p-1.5 bg-black/5 hover:!bg-black/10 backdrop-blur-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEmail(); }} title="Enviar por correo (Borrador)"><Icon name="mail" className="w-4 h-4 text-neutral-500"/></Button>
                {onMassEmail && <Button variant="ghost" size="sm" className="!p-1.5 bg-blue-500/10 hover:!bg-blue-500/20 backdrop-blur-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMassEmail(); }} title="Envío Masivo (Super Admin)"><Icon name="users" className="w-4 h-4 text-blue-500"/></Button>}
            </div>
        </div>
    );
};

const AdCard: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const [dynamicTextIndex, setDynamicTextIndex] = useState(0);
    const phrases = ["Genera imágenes y videos", "Crea apps web en minutos", "Lanza agentes de IA 24/7"];

    useEffect(() => {
        const interval = setInterval(() => {
            setDynamicTextIndex(prev => (prev + 1) % phrases.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <Card onClick={onClick} className="p-4 sm:p-6 bg-gradient-to-br from-brand-primary to-purple-800 text-white shadow-lg flex flex-col text-left h-full group transform hover:-translate-y-1 transition-transform duration-300">
            <Icon name="studio" className="w-8 h-8 sm:w-10 sm:h-10 text-white/80 mb-3" />
            <h3 className="text-sm sm:text-xl font-bold mb-2 font-sans">Potencia tu Creatividad en el AI Studio</h3>
            <div className="text-xs sm:text-sm opacity-80 mb-4 flex-grow relative h-10 font-sans">
                {phrases.map((phrase, index) => (
                    <span
                        key={index}
                        className={`absolute inset-0 transition-all duration-1000 ${index === dynamicTextIndex ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}`}
                    >
                        {phrase} con el poder de la IA.
                    </span>
                ))}
            </div>
            <Button className="bg-white text-purple-900 hover:bg-neutral-200 w-full mt-auto group-hover:scale-105 transition-transform font-bold text-xs sm:text-sm font-sans">
                Monetiza tu creatividad.
            </Button>
        </Card>
    );
};

const BookCard: React.FC<{ book: Book; isShared: boolean; onDownload: () => void; onShare: () => void; onEmail: () => void; onMassEmail?: () => void; }> = ({ book, isShared, onDownload, onShare, onEmail, onMassEmail }) => {
    const handleSummaryClick = (e: React.MouseEvent) => {
        e.preventDefault();
        window.open(`/#/book/${slugify(book.title)}`, '_blank');
    };
    
    const handlePdfDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (book.sourceUrl) {
            window.open(book.sourceUrl, '_blank');
        } else {
            alert("Enlace de descarga no disponible.");
        }
    }

    return (
        <div onClick={handleSummaryClick} className="bg-gray-900 text-white p-4 rounded-xl shadow-md flex flex-col justify-between h-full transform hover:-translate-y-1 transition-transform duration-300 group relative cursor-pointer border border-gray-800">
            <div>
                <h4 className="font-sans font-bold text-sm sm:text-lg leading-tight group-hover:text-brand-accent transition-colors line-clamp-2">{book.spanishTitle}</h4>
            </div>
            <div className="mt-4 flex flex-col gap-2 font-sans">
                <button onClick={(e) => { e.stopPropagation(); onShare(); }} className={`w-full py-1.5 rounded text-[10px] font-black uppercase transition-all ${isShared ? 'bg-green-600 text-white' : 'bg-brand-primary/20 text-brand-accent hover:bg-brand-primary hover:text-white'}`}>
                    {isShared ? 'SE HA COMPARTIDO' : 'Compartir en feed'}
                </button>
            </div>
             <div className="absolute top-1 right-1 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Button variant="ghost" size="sm" className="!p-1.5 bg-black/40 hover:!bg-black/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Download Summary"><Icon name="upload" className="w-4 h-4 text-white"/></Button>
                <Button variant="ghost" size="sm" className="!p-1.5 bg-black/40 hover:!bg-black/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onEmail(); }} title="Enviar por correo (Borrador)"><Icon name="mail" className="w-4 h-4 text-white"/></Button>
                {onMassEmail && <Button variant="ghost" size="sm" className="!p-1.5 bg-blue-500/40 hover:!bg-blue-500/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onMassEmail(); }} title="Envío Masivo (Super Admin)"><Icon name="users" className="w-4 h-4 text-blue-300"/></Button>}
            </div>
        </div>
    )
};

const CountdownTimer: React.FC<{ targetDate: number }> = ({ targetDate }) => {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date().getTime();
            const distance = targetDate - now;

            if (distance < 0) {
                setTimeLeft("00:00:00");
                return;
            }

            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDate]);

    return <span className="font-mono text-brand-primary font-bold">{timeLeft}</span>;
};

const NewsFilter: React.FC<{ active: string; onChange: (c: string) => void }> = ({ active, onChange }) => {
    const categories = ["Todas", "Tecnología", "Negocios", "IA", "Startups", "Innovación"];
    
    return (
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mb-4">
            {categories.map(cat => (
                <button
                    key={cat}
                    onClick={() => onChange(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap font-sans ${
                        active === cat 
                        ? 'bg-brand-primary text-white shadow-md' 
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                >
                    {cat}
                </button>
            ))}
        </div>
    );
}

const DiscoveryHub: React.FC = () => {
    const { t, language } = useTranslation();
    const { currentUser, setCurrentView, setActiveHubView, allBooks, goatifyNews, areNewsLoading, projects, addHubPost, sendArticleToProject, setToastNotification, nextNewsUpdate, userProfile, setProModalOpen, addNewGlobalChat, setStartupPrompt, isSuperAdmin, allUsers, setMailDraft } = useContext(AppContext);
    
    const [articleForAction, setArticleForAction] = useState<GoatifyArticle | null>(null);
    const [bookForAction, setBookForAction] = useState<Book | null>(null);
    
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isSendToProjectModalOpen, setIsSendToProjectModalOpen] = useState(false);
    const [shareComment, setShareComment] = useState('');
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
    const [showAllNews, setShowAllNews] = useState(false);
    const [activeCategory, setActiveCategory] = useState("Todas");
    const [allHistoricalNews, setAllHistoricalNews] = useState<GoatifyArticle[]>([]);
    
    const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [isEditingArticle, setIsEditingArticle] = useState<string | null>(null);
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
    
    const contentAreaRef = useRef<HTMLTextAreaElement>(null);
    const articleImageInputRef = useRef<HTMLInputElement>(null);
    const [isRewritingSelection, setIsRewritingSelection] = useState(false);

    const fetchAllNews = async () => {
        try {
            const newsRef = collection(db, "system_news");
            const q = query(newsRef, orderBy("createdAt", "desc"), limit(10));
            const snapshot = await getDocs(q);
            
            const allSystemArticles: GoatifyArticle[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.articles && Array.isArray(data.articles)) {
                    allSystemArticles.push(...data.articles);
                }
            });
            
            const communityQ = query(collection(db, "community_articles"), orderBy("publicationDate", "desc"), limit(100));
            const communitySnap = await getDocs(communityQ);
            const communityArticles: GoatifyArticle[] = communitySnap.docs.map(d => ({ ...d.data(), id: d.id } as GoatifyArticle));
            
            const combined = [...communityArticles, ...allSystemArticles];
            
            // Fix flickering by using a stable unique Map
            const uniqueArticlesMap = new Map();
            combined.forEach(a => {
                const key = a.id || (a.title + a.publicationDate);
                if (!uniqueArticlesMap.has(key)) {
                    uniqueArticlesMap.set(key, a);
                }
            });
            
            const uniqueArticles = Array.from(uniqueArticlesMap.values());
            
            uniqueArticles.sort((a, b) => {
                const dateA = new Date(a.publicationDate || 0).getTime();
                const dateB = new Date(b.publicationDate || 0).getTime();
                return dateB - dateA;
            });

            setAllHistoricalNews(uniqueArticles);
        } catch (e) {
            console.error("Error fetching historical news:", e);
        }
    };

    useEffect(() => {
        fetchAllNews();
    }, [goatifyNews]); 

    const baseNews = useMemo(() => {
        if (allHistoricalNews.length > 0) return allHistoricalNews;
        return goatifyNews;
    }, [allHistoricalNews, goatifyNews]);

    const filteredNews = useMemo(() => {
        if (activeCategory === "Todas") return baseNews;
        return baseNews.filter(a => {
            const cat = a.category || a.source || "";
            return cat.toLowerCase().includes(activeCategory.toLowerCase()) || a.title.toLowerCase().includes(activeCategory.toLowerCase());
        });
    }, [baseNews, activeCategory]);
    
    const newsToRender = showAllNews 
        ? filteredNews
        : filteredNews.slice(0, 6);

    const handleDownloadPdf = (item: GoatifyArticle) => {
        const articleSlug = slugify(item.title) || item.id;
        window.open(`/#/article/${articleSlug}`, '_blank');
        setToastNotification({ title: 'Abriendo Artículo', message: 'Puedes descargar el PDF desde la página del artículo.', icon: 'discover' });
    };

    const handleShareItem = (item: GoatifyArticle) => {
        setArticleForAction(item);
        setBookForAction(null);
        setShareComment('');
        setIsShareModalOpen(true);
    };

    const handleSendArticleToProject = (article: GoatifyArticle) => {
        setArticleForAction(article);
        if (projects.length > 0) setTargetProjectId(projects[0].id);
        setIsSendToProjectModalOpen(true);
    };
    
    const handleEditArticle = (article: GoatifyArticle) => {
        setArticleTitle(article.title);
        setArticleSummary(article.summary);
        setArticleContent(article.content);
        setArticleCategory(article.category || '');
        setArticleSource(article.source || '');
        setArticleImage(article.imageUrl || '');
        setGoatifyTakeaway(article.goatifyTakeaway || '');
        setIsEditingArticle(article.id);
        setIsPublishModalOpen(true);
    };

    const handleDeleteArticle = async (article: GoatifyArticle) => {
        if (window.confirm(`¿Estás seguro de eliminar el artículo "${article.title}"? Esta acción es irreversible.`)) {
             try {
                 await deleteDoc(doc(db, 'community_articles', article.id));
                 setToastNotification({ title: "Eliminado", message: "Artículo eliminado correctamente.", icon: "trash" });
                 fetchAllNews();
             } catch (e) {
                 console.error("Error deleting article", e);
                 setToastNotification({ title: "Error", message: "No se pudo eliminar.", icon: "close" });
             }
        }
    };

    const confirmShare = () => {
        let postContent = '';
        if (articleForAction) {
            setSharedIds(prev => new Set(prev).add(articleForAction.id));
            const articleSlug = slugify(articleForAction.title) || articleForAction.id;
            postContent = `
### 📰 REPORTE DE INTELIGENCIA: ${articleForAction.title.toUpperCase()}
**Impacto en la Industria:** ${articleForAction.category || 'Tecnología'}

**Resumen Ejecutivo:**
> "${articleForAction.summary}"

[Leer reporte detallado completo aquí](https://ia.goatify.app/#/article/${articleSlug})
`;
        } else if (bookForAction) {
            setSharedIds(prev => new Set(prev).add(bookForAction.id));
            
            // FILTRADO DE CONTENIDO PARA COMPARTIDO DE LIBRO
            const paragraphs = bookForAction.content
                .split('\n')
                .map(p => p.trim())
                .filter(p => p.length > 0 && !p.startsWith('#') && !p.startsWith('> ') && !p.includes('Descubre los secretos de') && !p.includes('He terminado de analizar'));

            const contentPreview = paragraphs.slice(0, 2).map((p, idx) => {
                const shortText = p.length > 250 ? p.substring(0, 250) + '...' : p;
                return `💡 **Punto Estratégico ${idx + 1}:**\n${shortText}`;
            }).join('\n\n');

            postContent = `
📚 **Análisis Estratégico:** ${bookForAction.spanishTitle}

${contentPreview}

[📖 Leer Guía Maestra completa aquí](${window.location.origin}/#/book/${slugify(bookForAction.title)}?id=${bookForAction.id})
`;
        }
        
        if (postContent) {
            addHubPost(shareComment ? `${shareComment}\n\n${postContent}` : postContent);
            setToastNotification({ title: "Publicado", message: "Se ha compartido en el feed de la comunidad.", icon: 'check' });
        }
        
        setIsShareModalOpen(false);
        setArticleForAction(null);
        setBookForAction(null);
    };
    
    const confirmSendToProject = () => {
        if (articleForAction && targetProjectId) {
            sendArticleToProject(articleForAction, targetProjectId);
            setIsSendToProjectModalOpen(false);
            setArticleForAction(null);
            setToastNotification({ title: "Guardado", message: "Artículo guardado en notas del proyecto.", icon: "check" });
        }
    };
    
    const handleSendToProjectModal = (article: GoatifyArticle) => {
        handleSendArticleToProject(article);
    };
    
    const navigateToPartners = () => { setCurrentView('partners'); window.location.hash = 'partners'; }
    const navigateToHubMarketplace = () => { setCurrentView('hub'); setActiveHubView('marketplace'); window.location.hash = 'hub'; }
    const handleAdClick = () => { setCurrentView('aiStudio'); window.location.hash = 'aiStudio'; };

    const handleDownloadBookSummary = (book: Book) => {
       window.open(`/#/book/${slugify(book.title)}`, '_blank');
       setToastNotification({ title: 'Abriendo Resumen', message: 'Puedes descargar el PDF desde la página del resumen.', icon: 'brain' });
    };
    
    const handleShareBook = (book: Book) => {
        setBookForAction(book);
        setArticleForAction(null);
        setShareComment('');
        setIsShareModalOpen(true);
    };
    
    const parseMarkdownForEmail = (text: string) => {
        if (!text) return '';
        let html = text
            // Bold & Italic
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a; font-weight: 700;">$1</strong>')
            .replace(/\*(.*?)\*/g, '<em style="color: #334155;">$1</em>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #2563eb; text-decoration: underline; font-weight: 600;">$1</a>')
            // Headers
            .replace(/^### (.*$)/gim, '<h3 style="color: #1e293b; margin: 28px 0 12px; font-size: 19px; font-weight: 800; letter-spacing: -0.5px; display: block;">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin: 34px 0 16px; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; display: block;">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 style="color: #0f172a; margin: 36px 0 18px; font-size: 26px; font-weight: 900; letter-spacing: -1px; display: block;">$1</h1>')
            // Blockquotes
            .replace(/^>\s?(.*$)/gim, '<blockquote style="border-left: 4px solid #3b82f6; padding: 14px 20px; margin: 24px 0; color: #475569; font-style: italic; background-color: #f8fafc; border-radius: 6px; font-size: 16px; display: block;">$1</blockquote>')
            // Lists (bullets and numbers)
            .replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-bottom: 10px; padding-left: 6px;">$1</li>')
            .replace(/^\d+\.\s+(.*$)/gim, '<li style="margin-bottom: 10px; padding-left: 6px; list-style-type: decimal;">$1</li>');
            
        // Group li elements into ul
        html = html.replace(/(<li[^>]*>.*?<\/li>(\s*<li[^>]*>.*?<\/li>)*)/gim, '<ul style="margin: 20px 0 20px 20px; padding: 0; color: #334155; display: block;">$1</ul>');
        
        // Convert double newlines to paragraphs
        html = html.replace(/\n\n/g, '</p><p style="margin-top: 0; margin-bottom: 22px; line-height: 1.85; font-size: 16px; color: #334155;">');
        // Single newlines to br
        html = html.replace(/\n/g, '<br/>');
        // Clean up redundant tags around block elements
        html = html.replace(/<br\/>\s*(<h|<ul|<li|<\/ul|<blockquote)/gi, '$1');
        html = html.replace(/(<\/h[1-6]>|<\/ul>|<\/li>|<\/blockquote>)\s*<br\/>/gi, '$1');
        html = html.replace(/<\/p><p[^>]*>\s*(<h|<ul|<blockquote)/gi, '$1');
        html = html.replace(/(<\/h[1-6]>|<\/ul>|<\/blockquote>)\s*<\/p><p[^>]*>/gi, '$1');

        return `<p style="margin-top: 0; margin-bottom: 22px; line-height: 1.85; font-size: 16px; color: #334155;">${html}</p>`;
    };

    const formatArticleEmailHtml = (article: GoatifyArticle) => {
        const platformUrl = `https://ia.goatify.app/#/article/${slugify(article.title) || article.id}`;
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        .email-container { width: 100% !important; max-width: 850px !important; }
    </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc;">
<div class="email-container" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 850px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0; box-sizing: border-box;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 40px 20px; text-align: center; box-sizing: border-box;">
    <div style="display: inline-block; background: rgba(255, 255, 255, 0.1); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 1.5px; border: 1px solid rgba(56, 189, 248, 0.3); margin-bottom: 20px;">
      ${article.category || 'Análisis Especial'}
    </div>
    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; line-height: 1.3; letter-spacing: -0.5px;">
      ${article.title}
    </h1>
  </div>

  <!-- Content Body -->
  <div style="padding: 40px 20px; background-color: #ffffff; box-sizing: border-box;">
    ${article.imageUrl ? `<div style="margin-bottom: 30px; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);"><img src="${article.imageUrl}" alt="Cover" style="width: 100%; height: auto; display: block;" /></div>` : ''}
    
    <!-- Executive Summary Box -->
    <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 24px 16px; border-radius: 0 8px 8px 0; margin-bottom: 35px; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02); box-sizing: border-box;">
      <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">Resumen Ejecutivo</h4>
      <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.7;">${article.summary}</p>
    </div>

    <!-- Main Content Parsed -->
    <div style="font-size: 16px; line-height: 1.8; color: #334155; overflow-wrap: break-word; box-sizing: border-box;">
      ${parseMarkdownForEmail(article.content)}
    </div>

    <!-- Key Takeaway (if exists) -->
    ${article.goatifyTakeaway ? `
    <div style="margin-top: 40px; padding: 24px 16px; background: linear-gradient(to right, #fffbeb, #fef3c7); border-radius: 12px; border: 1px solid #fde68a; box-sizing: border-box;">
      <h4 style="margin: 0 0 10px 0; color: #b45309; font-size: 15px; font-weight: 800; display: flex; align-items: center;">
        <span style="font-size: 20px; margin-right: 8px;">💡</span> Insight Estratégico
      </h4>
      <p style="margin: 0; color: #92400e; font-size: 15px; line-height: 1.7; font-weight: 500;">
        ${article.goatifyTakeaway}
      </p>
    </div>` : ''}

    <!-- Call to Action -->
    <div style="margin-top: 50px; text-align: center; padding-top: 30px; border-top: 1px solid #f1f5f9; box-sizing: border-box;">
      <p style="margin: 0 0 20px 0; color: #64748b; font-size: 14px;">Para una experiencia completa y herramientas adicionales, visita el artículo en nuestra plataforma.</p>
      <a href="${platformUrl}" style="display: inline-block; padding: 16px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2), 0 2px 4px -1px rgba(37, 99, 235, 0.1); margin-bottom: 20px; transition: all 0.2s;">
        Leer Reporte Completo
      </a>
      
      <div style="margin-top:20px; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
         <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #166534;">¿Quieres generar ingresos extra? ¡Es completamente gratis!</p>
         <a href="https://ia.goatify.app" style="display: inline-block; padding: 12px 20px; background-color: #10b981; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 8px;">GENERAR INGRESOS - ES GRATIS</a>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
    };

    const formatBookEmailHtml = (book: Book) => {
        // We present the book content exactly like an article format, removing "Book" terminology
        const platformUrl = `https://ia.goatify.app/#/book/${slugify(book.title) || book.id}`;
        
        let contentToParse = book.content;
        
        // Clean up common AI generation artifacts about "This book" or "Author"
        contentToParse = contentToParse
                .replace(/Descubre los secretos de .* en esta guía maestra definitiva de Goatify IA\./g, '')
                .replace(/💡 He terminado de analizar esta guía maestra en Goatify\. Este análisis extrae el valor más profundo de la obra original, sintetizando conceptos clave para aplicarlos de inmediato\./g, '')
                .replace(/# GUÍA MAESTRA PRO: .*/g, '')
                .replace(/## Por .*/g, '')
                .trim();

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        .email-container { width: 100% !important; max-width: 850px !important; }
    </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc;">
<div class="email-container" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 850px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0; box-sizing: border-box;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #312e81 0%, #1e1b4b 100%); padding: 40px 20px; text-align: center; box-sizing: border-box;">
    <div style="display: inline-block; background: rgba(255, 255, 255, 0.1); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; color: #a5b4fc; text-transform: uppercase; letter-spacing: 1.5px; border: 1px solid rgba(165, 180, 252, 0.3); margin-bottom: 20px;">
      Análisis Estratégico
    </div>
    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 900; line-height: 1.3; letter-spacing: -0.5px;">
      ${book.spanishTitle}
    </h1>
  </div>

  <!-- Content Body -->
  <div style="padding: 40px 20px; background-color: #ffffff; box-sizing: border-box;">
    
    <!-- Main Content Parsed -->
    <div style="font-size: 16px; line-height: 1.8; color: #334155; overflow-wrap: break-word; box-sizing: border-box;">
      ${parseMarkdownForEmail(contentToParse)}
    </div>

    <!-- Call to Action -->
    <div style="margin-top: 50px; text-align: center; padding-top: 30px; border-top: 1px solid #f1f5f9; box-sizing: border-box;">
      <p style="margin: 0 0 20px 0; color: #64748b; font-size: 14px;">Explora la publicación detallada en nuestra plataforma.</p>
      <a href="${platformUrl}" style="display: inline-block; padding: 16px 24px; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2), 0 2px 4px -1px rgba(79, 70, 229, 0.1); transition: all 0.2s; margin-bottom: 20px;">
        Acceder al Contenido
      </a>
      <div style="margin-top:20px; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
         <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #166534;">¿Quieres generar ingresos extra? ¡Es completamente gratis!</p>
         <a href="https://ia.goatify.app" style="display: inline-block; padding: 12px 20px; background-color: #10b981; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 8px;">GENERAR INGRESOS - ES GRATIS</a>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
    };

    const handleEmailArticle = (article: GoatifyArticle, massive: boolean = false) => {
        const allEmails = massive ? allUsers.map(u => u.email).filter(e => e && e.includes('@')).join(',') : '';
        setMailDraft({
            to: '',
            bcc: allEmails,
            subject: `NOTICIA DEL DÍA: ${article.title}`,
            htmlBody: formatArticleEmailHtml(article)
        });
        setCurrentView('mail');
        window.location.hash = 'mail';
    };

    const handleEmailBook = (book: Book, massive: boolean = false) => {
        const allEmails = massive ? allUsers.map(u => u.email).filter(e => e && e.includes('@')).join(',') : '';
        setMailDraft({
            to: '',
            bcc: allEmails,
            subject: `Lectura recomendada: ${book.spanishTitle}`,
            htmlBody: formatBookEmailHtml(book)
        });
        setCurrentView('mail');
        window.location.hash = 'mail';
    };

    const handleOpenPublishModal = () => {
        if (userProfile.plan === 'premium') {
            setIsEditingArticle(null);
            setArticleTitle(''); setArticleSummary(''); setArticleContent(''); setArticleCategory(''); setArticleSource(''); setArticleImage(''); setGoatifyTakeaway('');
            setIsPublishModalOpen(true);
        } else {
            setToastNotification({ title: "Función Premium", message: "Actualiza a Premium para publicar artículos.", icon: "lock", onClick: () => setProModalOpen(true) });
            setProModalOpen(true);
        }
    };

    const insertFormat = (tag: string) => {
        if (!contentAreaRef.current) return;
        const start = contentAreaRef.current.selectionStart;
        const end = contentAreaRef.current.selectionEnd;
        const text = articleContent;
        
        let inserted = '';
        if (tag === 'bold') inserted = `**${text.substring(start, end)}**`;
        if (tag === 'h2') inserted = `\n## ${text.substring(start, end)}`;
        if (tag === 'h3') inserted = `\n### ${text.substring(start, end)}`;
        if (tag === 'list') inserted = `\n* ${text.substring(start, end)}`;
        if (tag === 'quote') inserted = `\n> ${text.substring(start, end)}`;

        const newText = text.substring(0, start) + inserted + text.substring(end);
        setArticleContent(newText);
        setTimeout(() => { contentAreaRef.current?.focus(); }, 0);
    };

    const handleAiRewriteSelection = async () => {
        if (!contentAreaRef.current) return;
        const start = contentAreaRef.current.selectionStart;
        const end = contentAreaRef.current.selectionEnd;
        if (start === end) { setToastNotification({ title: "Selección vacía", message: "Selecciona el texto que quieres reescribir.", icon: 'edit' }); return; }
        const text = articleContent;
        const selectedText = text.substring(start, end);
        setIsRewritingSelection(true);
        try {
            const improvedText = await rewriteText(selectedText, language);
            if (improvedText) {
                const newText = text.substring(0, start) + improvedText + text.substring(end);
                setArticleContent(newText);
                setToastNotification({ title: "Reescrito", message: "Texto mejorado con IA.", icon: 'check' });
            }
        } catch (e) { console.error(e); setToastNotification({ title: "Error", message: "Falló la reescritura.", icon: 'close' }); } finally { setIsRewritingSelection(false); }
    };

    const handleGenerateDraft = async () => {
        if (!aiTopic.trim()) return;
        setIsAiGenerating(true);
        try {
            const result = await generateFullArticleDraft(aiTopic, language);
            setArticleTitle(result.title || '');
            setArticleSummary(result.summary || '');
            setArticleContent(result.content || '');
            setArticleCategory(result.category || '');
            setGoatifyTakeaway(result.goatifyTakeaway || '');
            setToastNotification({ title: "Borrador Generado", message: "La IA ha escrito una base para ti.", icon: 'studio' });
        } catch (e) { console.error(e); setToastNotification({ title: "Error", message: "No se pudo generar el borrador.", icon: 'close' }); } finally { setIsAiGenerating(false); }
    };

    // Fix for missing handleArticleImageUpload function
    const handleArticleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser) return;
        setIsUploadingImage(true);
        try {
            const { url } = await uploadWithQuotaCheck({
                userId: currentUser.uid,
                data: file,
                path: safeStoragePath('article-images', currentUser.uid, `${Date.now()}_${file.name}`),
                sizeBytes: file.size,
                metadata: { contentType: file.type || 'image/*' },
                plan: userProfile.plan
            });
            setArticleImage(url);
            setToastNotification({ title: "Imagen Subida", message: "La imagen se adjuntó correctamente.", icon: "check" });
        } catch (error) {
            console.error("Upload failed", error);
            setToastNotification({ title: "Error", message: "No se pudo subir la imagen.", icon: "close" });
        } finally {
            setIsUploadingImage(false);
            if (articleImageInputRef.current) articleImageInputRef.current.value = '';
        }
    };

    const handlePublishArticle = async () => {
        if (!articleTitle || !articleSummary || !articleContent || !articleCategory || !goatifyTakeaway) { alert("Por favor completa todos los campos obligatorios."); return; }
        if (articleTitle.length < 20) { alert("El título es muy corto (mínimo 20 caracteres)."); return; }
        if (articleSummary.length < 100) { alert("El resumen ejecutivo debe ser más detallado (mínimo 100 caracteres)."); return; }
        if (articleContent.length < 1500) { alert("El contenido del artículo debe ser sustancial (mínimo 1500 caracteres, aprox 1 página)."); return; }
        if (goatifyTakeaway.length < 50) { alert("La conclusión debe ser más completa (mínimo 50 caracteres)."); return; }
        if (!currentUser) return;
        
        setIsPublishing(true);
        try {
            const articleData = {
                title: articleTitle,
                summary: articleSummary,
                content: articleContent,
                category: articleCategory,
                source: articleSource || 'Comunidad Goatify',
                imageUrl: articleImage,
                publicationDate: new Date().toISOString(),
                author: userProfile.name,
                authorLinkedinUrl: userProfile.socials?.linkedin || '',
                goatifyTakeaway: goatifyTakeaway,
                authorUid: currentUser.uid,
                readBy: isEditingArticle ? undefined : []
            };
            
            if (isEditingArticle) {
                 await updateDoc(doc(db, 'community_articles', isEditingArticle), articleData);
                 setToastNotification({ title: "Artículo Actualizado", message: "Los cambios se han guardado.", icon: "check" });
            } else {
                 // Generate slug from title
                 const slug = articleTitle
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .trim()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w-]+/g, '')
                    .replace(/--+/g, '-');
                 
                 const articleId = slug || `article-${Date.now()}`;
                 const newArticle = { ...articleData, id: articleId, readBy: [] };
                 await setDoc(doc(db, 'community_articles', articleId), newArticle);
                 
                 const feedPost = { content: `### 📰 Nueva Publicación de la Comunidad: ${articleTitle}\n\n**Resumen:**\n${articleSummary.substring(0, 200)}...\n\n**Categoría:** ${articleCategory}\n\n[Leer Artículo Completo](#/article/${articleId})`, type: 'article_share', tags: ['Artículo', articleCategory] };
                 await addHubPost(feedPost.content);
                 setToastNotification({ title: "Artículo Publicado", message: "Tu artículo ahora es visible en Noticias y en el Feed.", icon: "check" });
            }

            setIsPublishModalOpen(false);
            fetchAllNews();

        } catch (e) { console.error("Error publishing article:", e); setToastNotification({ title: "Error", message: "No se pudo guardar the artículo.", icon: "close" }); } finally { setIsPublishing(false); }
    };


    return (
        <div className="animate-fade-in space-y-12 pb-24">
            {/* Did you know section deleted or replaced by carousel if needed, keeping structure */}
            {/* Actions Modals */}
             {(articleForAction || bookForAction) && (
                <Modal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} title="Compartir en el Feed">
                     <div className="space-y-4">
                        <p className="font-sans">Añade un comentario (opcional):</p>
                        <Textarea value={shareComment} onChange={e => setShareComment(e.target.value)} rows={3} className="my-2"/>
                        <div className="flex justify-end gap-2 mt-4 font-sans">
                            <Button variant="secondary" onClick={() => setIsShareModalOpen(false)}>Cancelar</Button>
                            <Button onClick={confirmShare}>Compartir</Button>
                        </div>
                    </div>
                </Modal>
             )}
             {articleForAction && (
                <Modal isOpen={isSendToProjectModalOpen} onClose={() => setIsSendToProjectModalOpen(false)} title="Enviar a Proyecto">
                    <div className="space-y-4 font-sans">
                        <p>Selecciona un proyecto para añadir este artículo como una nota:</p>
                        <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                           {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setIsSendToProjectModalOpen(false)}>Cancelar</Button>
                            <Button onClick={confirmSendToProject}>Enviar</Button>
                        </div>
                    </div>
                </Modal>
            )}

             <Modal isOpen={isPublishModalOpen} onClose={() => setIsPublishModalOpen(false)} title={isEditingArticle ? t('edit') : t('publishArticleBtn')} className="max-w-7xl flex flex-col h-full max-h-[90vh] z-[300]" noPadding={true}>
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-6 bg-neutral-50 dark:bg-[#121212] font-sans">
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

            <div>
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4 font-sans">
                    <div className="flex items-center gap-4">
                        <img src={LOGO_URL} alt="Goatify" className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
                        <div>
                            <h1 className="text-3xl font-bold mb-2">Noticias & Artículos de la Comunidad</h1>
                            <div className="text-sm text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                                <Icon name="sync" className="w-4 h-4 text-brand-primary"/> Actualizamos las noticias más relevantes cada 24 horas.
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                         <Button onClick={handleOpenPublishModal} size="sm" className="bg-brand-primary text-white border border-brand-primary shadow-sm font-bold text-xs flex items-center gap-2 h-9 hover:bg-brand-secondary hover:border-brand-secondary">
                            <Icon name="edit" className="w-4 h-4"/> Publicar Artículo
                        </Button>
                        <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-right">
                            <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">Próximas noticias en:</p>
                            <div className="flex items-center justify-end gap-2">
                                {nextNewsUpdate && <CountdownTimer targetDate={nextNewsUpdate} />}
                            </div>
                        </div>
                    </div>
                </div>

                <NewsFilter active={activeCategory} onChange={setActiveCategory} />
                
                <div 
                    className={`grid grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ease-in-out ${showAllNews ? 'max-h-[80vh] overflow-y-auto pr-2 pb-4 border-b border-light-border dark:border-dark-border custom-scrollbar' : ''}`}
                >
                    {(areNewsLoading && filteredNews.length === 0) ? (
                        [...Array(4)].map((_, i) => <NewsCardSkeleton key={i} />)
                    ) : (
                        newsToRender.map((article, index) => (
                            <React.Fragment key={`${article.id}-${index}`}>
                                {index === 3 && !showAllNews && (
                                    <div className="col-span-1 md:col-span-1 h-full"><AdCard onClick={handleAdClick} /></div>
                                )}
                                <div className="col-span-1 md:col-span-1 h-full">
                                    <NewsCard
                                        article={article}
                                        isNew={!article.readBy?.includes(currentUser?.uid || '')}
                                        isShared={sharedIds.has(article.id)}
                                        onDownload={() => handleDownloadPdf(article)}
                                        onShare={() => handleShareItem(article)}
                                        onSendToProject={() => handleSendArticleToProject(article)}
                                        isAuthor={article.author === userProfile.name || (article as any).authorUid === userProfile.uid} 
                                        onDelete={() => handleDeleteArticle(article)}
                                        onEdit={() => handleEditArticle(article)}
                                        onEmail={() => handleEmailArticle(article, false)}
                                        onMassEmail={isSuperAdmin ? () => handleEmailArticle(article, true) : undefined}
                                    />
                                </div>
                            </React.Fragment>
                        ))
                    )}
                </div>
                
                {!showAllNews && filteredNews.length > 6 && (
                    <div className="flex justify-center mt-6 font-sans">
                        <Button onClick={() => setShowAllNews(true)} variant="secondary" className="shadow-md bg-white dark:bg-dark-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 w-full sm:w-auto">
                            Ver todas las noticias ({filteredNews.length}) <Icon name="expand" className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                )}
                
                {showAllNews && (
                    <div className="flex justify-center mt-6 font-sans">
                        <Button onClick={() => setShowAllNews(false)} variant="secondary" className="shadow-md bg-white dark:bg-dark-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 w-full sm:w-auto">
                            Mostrar menos <Icon name="minus" className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                )}
            </div>

            <section>
                <div className="text-center mb-8 font-sans">
                    <h2 className="text-2xl sm:text-3xl font-bold flex items-center justify-center gap-3"><Icon name="wallet" className="w-6 h-6 sm:w-8 sm:h-8"/> Monetiza tus Habilidades</h2>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2 text-sm sm:text-base">Convierte tu conocimiento en ingresos y haz crecer tu impacto con nuestra comunidad.</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-6 font-sans">
                     <a href="#partners" onClick={(e) => { e.preventDefault(); navigateToPartners(); }} className="h-full block group col-span-1 md:col-span-1 md:col-start-1">
                        <Card className="p-4 sm:p-6 bg-red-600 text-white shadow-lg h-full transform hover:-translate-y-1 transition-transform duration-300 flex flex-col">
                            <div className="flex items-center gap-2 sm:gap-3 mb-3">
                                <div className="p-1 border-2 border-white/50 rounded-full">
                                    <Icon name="check" className="w-4 h-4 sm:w-5 sm:h-5"/>
                                </div>
                                <h3 className="text-sm sm:text-xl font-bold leading-tight">Hazte Socio Pro</h3>
                            </div>
                            <p className="text-xs sm:text-sm opacity-90 mb-4 flex-grow">Accede a beneficios y comisiones exclusivas.</p>
                            <span className="font-semibold group-hover:underline mt-auto text-xs sm:text-base">Aprender más &rarr;</span>
                        </Card>
                    </a>
                 <a href="#hub" onClick={(e) => { e.preventDefault(); navigateToHubMarketplace(); }} className="h-full block group col-span-1 md:col-span-1">
                        <Card className="p-4 sm:p-6 h-full transform hover:-translate-y-1 transition-transform duration-300 flex flex-col">
                            <div className="flex items-center gap-2 sm:gap-3 mb-3">
                                <div className="p-2 bg-brand-accent/20 rounded-full">
                                    <Icon name="market" className="w-4 h-4 sm:w-5 sm:h-5 text-brand-primary"/>
                                </div>
                                <h3 className="text-sm sm:text-xl font-bold leading-tight">Vende tus Servicios</h3>
                            </div>
                            <p className="text-xs sm:text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4 flex-grow">Ofrece tus habilidades profesionales en el Hub.</p>
                            <span className="font-semibold text-brand-primary group-hover:underline mt-auto text-xs sm:text-base">Aprender más &rarr;</span>
                        </Card>
                    </a>
                    <div className="hidden md:block col-span-2"></div>
                </div>
            </section>
            
            <section>
                <Card className="p-6 bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border font-sans">
                    <h3 className="font-bold text-xl mb-4">{t('recommendedBooks')}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-6">
                        {allBooks.map(book => 
                            <div key={book.id} className="col-span-1 md:col-span-1 h-full">
                                <BookCard 
                                    book={book} 
                                    isShared={sharedIds.has(book.id)}
                                    onDownload={() => handleDownloadBookSummary(book)}
                                    onShare={() => handleShareBook(book)}
                                    onEmail={() => handleEmailBook(book, false)}
                                    onMassEmail={isSuperAdmin ? () => handleEmailBook(book, true) : undefined}
                                />
                            </div>
                        )}
                    </div>
                </Card>
            </section>

            <DidYouKnowCarousel />
        </div>
    );
};

export default DiscoveryHub;
