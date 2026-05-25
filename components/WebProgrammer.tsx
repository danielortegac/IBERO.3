import React, { useState, useContext, useRef, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import { generateWebCodeStream, parseSpreadsheet } from '../services/geminiService';
import type { WebDevMessage, WebDevSession, WebFile } from '../types';
import Icon from './Icon';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import Spinner from './ui/Spinner';
import Modal from './ui/Modal';
import Input from './ui/Input';
import { addDoc, collection, setDoc, getDoc, doc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { getPlanConfig, SUPER_ADMIN_EMAILS } from '../types';
import { recalculateUserStats } from '../services/subscriptionService';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import { motion, AnimatePresence } from 'motion/react';

interface WebProgrammerProps {
    isModuleFullScreen?: boolean;
    setIsModuleFullScreen?: (val: boolean) => void;
}

const WebProgrammer: React.FC<WebProgrammerProps> = ({ isModuleFullScreen = false, setIsModuleFullScreen }) => {
    const { t } = useTranslation();
    const { 
        projects,
        webDevSessions, 
        activeWebDevSessionId, 
        setActiveWebDevSessionId,
        addNewWebDevSession,
        deleteWebDevSession,
        updateWebDevSession,
        updateWebDevFile,
        assignCodeToProject,
        setToastNotification,
        checkAndConsumeLimit,
        userProfile,
        setProModalOpen,
        currentUser,
        userUsage,
        setIsFullScreenActive
    } = useContext(AppContext);

    const [prompt, setPrompt] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isAssignModalOpen, setAssignModalOpen] = useState(false);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
    const [rightPaneView, setRightPaneView] = useState<'preview' | 'code'>('preview');
    const [editingSession, setEditingSession] = useState<{ id: string, name: string} | null>(null);
    const [isPreviewFullScreen, setIsPreviewFullScreen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isMobileView, setIsMobileView] = useState(false);
    
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [brandName, setBrandName] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    
    const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    // NUEVO ESTADO PARA VISUALIZACIÓN DIRECTA (SIN CRÉDITOS)
    const [isDirectPasteModalOpen, setIsDirectPasteModalOpen] = useState(false);
    const [directHtmlInput, setDirectHtmlInput] = useState('');

    // NUEVO: Selector de tipo de proyecto
    const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
    const [isAddPageModalOpen, setIsAddPageModalOpen] = useState(false);
    const [newPageName, setNewPageName] = useState('nueva-pagina.html');
    const [urlContext, setUrlContext] = useState('');
    const [isUrlInputOpen, setIsUrlInputOpen] = useState(false);

    const handleAddPage = () => {
        if (newPageName.trim()) {
            addNewFile(newPageName.trim());
            setIsAddPageModalOpen(false);
            setNewPageName('nueva-pagina.html');
        }
    };
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activeSession = webDevSessions.find(s => s.id === activeWebDevSessionId);
    const activeFileIndex = activeSession?.activeFileIndex ?? 0;
    const activeFile = activeSession?.files?.[activeFileIndex] || activeSession?.files?.[0];

    // LÓGICA DE LÍMITES v2.7
    const planConfig = getPlanConfig(userProfile.plan);
    const opsLimit = (planConfig.limits as any).web_programmer_ops || 10;
    const opsUsed = userUsage?.counters?.monthly_web_ops_used || 0;
    const isPaidPremiumActive = userProfile.plan === 'premium' && userProfile.subscriptionStatus === 'active';
    const modelInUse = userProfile.plan === 'free' ? 'Gemini Lite (Básico)' : isPaidPremiumActive ? 'Gemini Pro (Premium activo)' : 'Gemini Flash (Optimizado)';

    useEffect(() => {
        if (webDevSessions.length > 0 && !activeWebDevSessionId) {
            setActiveWebDevSessionId(webDevSessions[0].id);
        }
        
        // Ensure active file has versions initialized
        if (activeFile && (!activeFile.versions || activeFile.versions.length === 0)) {
            updateActiveFile({
                versions: [activeFile.code || ''],
                currentVersionIndex: 0
            });
        }
    }, [webDevSessions, activeWebDevSessionId, setActiveWebDevSessionId, activeFile]);

    useEffect(() => {
        if (isPreviewFullScreen || isModuleFullScreen) {
            setIsFullScreenActive(true);
        } else {
            setIsFullScreenActive(false);
        }
        return () => setIsFullScreenActive(false);
    }, [isPreviewFullScreen, isModuleFullScreen, setIsFullScreenActive]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeFile?.history]);
    
    const updateSession = (updates: Partial<WebDevSession>) => {
        if (activeWebDevSessionId) {
            updateWebDevSession(activeWebDevSessionId, updates);
        }
    };

    const updateActiveFile = (updates: Partial<WebFile>) => {
        if (!activeSession || !activeSession.files) return;
        const newFiles = [...activeSession.files];
        newFiles[activeFileIndex] = { ...newFiles[activeFileIndex], ...updates };
        updateSession({ files: newFiles });
    };

    const addNewFile = (name: string = 'nueva-pagina.html') => {
        if (!activeSession) return;
        const files = activeSession.files || [];
        const newFile: WebFile = {
            name: name.endsWith('.html') ? name : `${name}.html`,
            code: '',
            history: [],
            isGenerating: false,
            agentStatus: 'Agente listo para diseñar esta página',
            versions: [''],
            currentVersionIndex: 0
        };
        const newFiles = [...files, newFile];
        updateSession({ 
            files: newFiles, 
            activeFileIndex: newFiles.length - 1 
        });
        setToastNotification({ title: "Página Añadida", message: `Se ha creado ${newFile.name} en el proyecto.`, icon: "plus" });
    };

    const deleteFile = (index: number) => {
        if (!activeSession || !activeSession.files || activeSession.files.length <= 1) return;
        const newFiles = activeSession.files.filter((_, i) => i !== index);
        const newIndex = activeFileIndex >= newFiles.length ? newFiles.length - 1 : activeFileIndex;
        updateSession({ 
            files: newFiles, 
            activeFileIndex: newIndex 
        });
    };

    const handleZipUpload = async (zipFile: File) => {
        setToastNotification({ title: "Importando ZIP", message: "Analizando archivos...", icon: "box", isLoading: true });
        try {
            const zip = await JSZip.loadAsync(zipFile);
            const filesToAdd: WebFile[] = [];
            
            const filePromises = Object.keys(zip.files).map(async (filename) => {
                const file = zip.files[filename];
                if (!file.dir && (filename.endsWith('.html') || filename.endsWith('.htm'))) {
                    const content = await file.async('string');
                    const name = filename.split('/').pop() || filename;
                    filesToAdd.push({
                        name: name,
                        code: content,
                        history: [{ role: 'model', text: `Archivo ${name} importado desde ZIP.` }],
                        isGenerating: false,
                        agentStatus: 'Importado desde ZIP',
                        versions: [content],
                        currentVersionIndex: 0
                    });
                }
            });

            await Promise.all(filePromises);

            if (filesToAdd.length > 0) {
                if (activeSession) {
                    const currentFiles = activeSession.files || [];
                    // Evitar duplicados por nombre si es posible, o simplemente añadir
                    const newFiles = [...currentFiles];
                    filesToAdd.forEach(f => {
                        if (!newFiles.find(nf => nf.name === f.name)) {
                            newFiles.push(f);
                        }
                    });
                    
                    updateSession({ 
                        files: newFiles,
                        activeFileIndex: newFiles.length - 1
                    });
                }
                setToastNotification({ title: "Importación Exitosa", message: `Se han añadido ${filesToAdd.length} páginas al proyecto.`, icon: "check" });
            } else {
                setToastNotification({ title: "Aviso", message: "No se encontraron archivos HTML válidos en el ZIP.", icon: "info" });
            }
        } catch (error) {
            console.error("Error unzipping:", error);
            setToastNotification({ title: "Error", message: "No se pudo procesar el archivo ZIP.", icon: "close" });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (selectedFile.name.endsWith('.zip') || selectedFile.type === 'application/zip' || selectedFile.type === 'application/x-zip-compressed') {
            handleZipUpload(selectedFile);
        } else if (selectedFile.type === 'text/html' || selectedFile.name.endsWith('.html') || selectedFile.name.endsWith('.txt')) {
            setFile(selectedFile);
            setToastNotification({ title: "Proyecto Importado", message: "El código se usará como base para la IA.", icon: 'code' });
        } else {
            setFile(selectedFile);
            setToastNotification({ title: "Archivo Seleccionado", message: `${selectedFile.name} se usará como referencia de contenido.`, icon: 'upload' });
        }
    };
    
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile || !currentUser) return;
        setUploadingImage(true);
        try {
            const { url } = await uploadWithQuotaCheck({
                userId: currentUser.uid,
                data: selectedFile,
                sizeBytes: selectedFile.size,
                path: safeStoragePath('web-dev-images', currentUser.uid, `${Date.now()}_${selectedFile.name}`),
                metadata: { contentType: selectedFile.type || 'application/octet-stream' },
                plan: userProfile?.plan
            });
            setPrompt(prev => prev + `\n[Imagen Agregada: ${url}] - Usa esta imagen en el código.`);
            setToastNotification({ title: "Imagen Subida", message: "Imagen lista para usar en tu sitio.", icon: "check" });
        } catch (error) {
            console.error("Upload failed", error);
            setToastNotification({ title: "Error", message: "No se pudo subir la imagen.", icon: "close" });
        } finally {
            setUploadingImage(false);
            if (imageInputRef.current) imageInputRef.current.value = '';
        }
    };
    
    const updateFileByIndex = (index: number, updates: Partial<WebFile>) => {
        if (activeWebDevSessionId) {
            updateWebDevFile(activeWebDevSessionId, index, updates);
        }
    };

    const saveVersion = (newCode: string) => {
        if (!activeSession || !activeFile) return;
        
        const currentVersions = activeFile.versions || [activeFile.code || ''];
        const currentIndex = activeFile.currentVersionIndex ?? (currentVersions.length - 1);
        
        // Remove any "future" versions if we're in the middle of the history
        const truncatedVersions = currentVersions.slice(0, currentIndex + 1);
        
        // Don't save if it's the same as the last version
        if (truncatedVersions[truncatedVersions.length - 1] === newCode) return;
        
        const newVersions = [...truncatedVersions, newCode];
        const newIndex = newVersions.length - 1;
        
        updateActiveFile({
            versions: newVersions,
            currentVersionIndex: newIndex,
            code: newCode
        });
    };

    const handleUndo = () => {
        if (!activeFile) return;
        const versions = activeFile.versions || [activeFile.code || ''];
        const currentIndex = activeFile.currentVersionIndex ?? (versions.length - 1);
        
        if (currentIndex <= 0) return;
        
        const newIndex = currentIndex - 1;
        updateActiveFile({
            currentVersionIndex: newIndex,
            code: versions[newIndex],
            versions: versions // Ensure versions are preserved
        });
        setToastNotification({ title: "Deshacer", message: "Regresando a la versión anterior.", icon: "undo" });
    };

    const handleRedo = () => {
        if (!activeFile || !activeFile.versions) return;
        const currentIndex = activeFile.currentVersionIndex ?? 0;
        
        if (currentIndex >= activeFile.versions.length - 1) return;
        
        const newIndex = currentIndex + 1;
        updateActiveFile({
            currentVersionIndex: newIndex,
            code: activeFile.versions[newIndex],
            versions: activeFile.versions // Ensure versions are preserved
        });
        setToastNotification({ title: "Rehacer", message: "Avanzando a la siguiente versión.", icon: "redo" });
    };

    useEffect(() => {
        const handleIframeMessage = (event: MessageEvent) => {
            if (event.data.type === 'IFRAME_NAVIGATION' && activeSession) {
                const targetFile = event.data.file;
                const fileIndex = activeSession.files.findIndex(f => f.name === targetFile);
                if (fileIndex !== -1) {
                    updateSession({ activeFileIndex: fileIndex });
                    setToastNotification({ title: "Navegación", message: `Cargando ${targetFile}...`, icon: "externalLink" });
                }
            }
        };
        window.addEventListener('message', handleIframeMessage);
        return () => window.removeEventListener('message', handleIframeMessage);
    }, [activeSession, updateSession, setToastNotification]);

    const getEnhancedCode = (code: string) => {
        if (!code) return '';
        // Inject script to intercept clicks and prevent app-in-app recursion
        const script = `
            <script>
                document.addEventListener('click', (e) => {
                    const link = e.target.closest('a');
                    if (link && link.getAttribute('href')) {
                        const href = link.getAttribute('href');
                        // Si el enlace es una página del proyecto (.html) o no es externo
                        if (href.endsWith('.html') || (!href.startsWith('http') && !href.startsWith('//'))) {
                            e.preventDefault();
                            const fileName = href.split('/').pop().split('#')[0];
                            window.parent.postMessage({ type: 'IFRAME_NAVIGATION', file: fileName }, '*');
                        }
                    }
                });
            </script>
        `;
        if (code.includes('</body>')) {
            return code.replace('</body>', `${script}\n</body>`);
        }
        return code + script;
    };

    const handleGenerate = async () => {
        if ((!prompt && !file) || !activeWebDevSessionId || !currentUser || !activeSession || !activeFile) return;
        
        const targetIndex = activeFileIndex; // CAPTURE INDEX FOR BACKGROUND GENERATION
        const targetFile = activeSession.files[targetIndex];

        // REGLA SOLICITADA: CONSUME 2 CRÉDITOS DEL PLAN DIARIO (ai_chat)
        try {
        } catch(e: any) {
            if (e.code === "PLAN_LIMIT_REACHED") {
                setProModalOpen(true);
                return;
            }
        }

        // TAMBIÉN CONSUME CUOTA MENSUAL DE PROGRAMADOR
        try {
            const isBlockedMonthly = await checkAndConsumeLimit(currentUser.uid, 'web_programmer', 1);
            if (isBlockedMonthly) return;
        } catch(e) {}

        updateFileByIndex(targetIndex, { isGenerating: true, code: '', agentStatus: `Agente ${targetIndex + 1} diseñando ${targetFile.name}...` }); 
        setRightPaneView('code'); 

        let userMessage: WebDevMessage = { role: 'user', text: prompt };
        if (urlContext) userMessage.urlContext = urlContext;
        if (file) {
            try {
                // Determine file analysis method
                let content = '';
                const isDoc = file.type === 'application/pdf' || file.name.endsWith('.pdf') || 
                              file.name.endsWith('.docx') || file.name.endsWith('.doc');
                const isData = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
                
                if (isDoc || isData) {
                    setToastNotification({ title: "Analizando Archivo", message: `Shivo está procesando ${file.name} para usar su información en el diseño.`, icon: "search" });
                }

                if (isData) {
                    setToastNotification({ title: "Analizando Datos", message: `Shivo está procesando la base de datos ${file.name}...`, icon: "search" });
                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(',')[1]);
                        reader.readAsDataURL(file);
                    });
                    content = parseSpreadsheet(base64);
                } else {
                    content = await file.text();
                }
                
                userMessage.file = { name: file.name, content };
                if (!prompt) {
                    userMessage.text = isDoc || isData 
                        ? `Analiza el contenido de este archivo "${file.name}" y conviértelo en un diseño web profesional, usando toda la información, textos y estructura que encuentres dentro.`
                        : "Analiza este código adjunto y prepárate para editarlo según mis instrucciones.";
                }
            } catch (e) {
                console.error("Error reading file:", e);
                updateFileByIndex(targetIndex, { isGenerating: false, agentStatus: 'Error al leer archivo' });
                return;
            }
        }

        const updatedHistory = [...(targetFile.history || []), userMessage];
        updateFileByIndex(targetIndex, { history: updatedHistory });
        setPrompt('');
        setFile(null);
        if(fileInputRef.current) fileInputRef.current.value = '';

        try {
            const allFilesContext = activeSession.files.map(f => ({ name: f.name, code: f.code }));
            const stream = await generateWebCodeStream(
                updatedHistory, 
                targetFile.code || '', 
                userProfile.plan,
                activeSession.type,
                allFilesContext,
                urlContext || undefined
            );
            
            // Clear URL context after starting generation
            setUrlContext('');
            setIsUrlInputOpen(false);

            let accumulatedRaw = '';
            let accumulatedExplanation = '';
            let accumulatedCode = '';
            let lastUpdateTime = Date.now();

            for await (const chunk of stream) {
                if (chunk.text) {
                    accumulatedRaw += chunk.text;
                    
                    const codeStartMatch = accumulatedRaw.match(/```html\n?|<!DOCTYPE html>|<html\s/is);
                    
                    if (codeStartMatch) {
                        const splitIndex = accumulatedRaw.indexOf(codeStartMatch[0]);
                        accumulatedExplanation = accumulatedRaw.substring(0, splitIndex).replace(/\[\/?EXPLANATION\]/gi, '').trim();
                        accumulatedCode = accumulatedRaw.substring(splitIndex);
                        if (accumulatedCode.startsWith('```html')) {
                            accumulatedCode = accumulatedCode.replace(/^```html\n?/, '');
                        }
                    } else {
                        accumulatedExplanation = accumulatedRaw.replace(/\[\/?EXPLANATION\]/gi, '').trim();
                    }
                    
                    // THROTTLE FIRESTORE UPDATES (every 1.5 seconds) to prevent lag/cutoff
                    if (Date.now() - lastUpdateTime > 1500) {
                        const historyUpdate = [...updatedHistory, { 
                            role: 'model' as const, 
                            text: accumulatedExplanation || "Generando..." 
                        }];
                        
                        updateFileByIndex(targetIndex, { 
                            code: accumulatedCode || targetFile.code || '',
                            history: historyUpdate
                        });
                        lastUpdateTime = Date.now();
                    }
                }
            }
            
            // Final cleanup of the parsed code
            if (accumulatedCode.endsWith('```')) {
                accumulatedCode = accumulatedCode.slice(0, -3).trim();
            }

            if (!accumulatedCode || accumulatedCode.length < 50) {
                throw new Error("La IA generó un código demasiado corto o vacío. Por favor intenta de nuevo con más detalles.");
            }

            // FINAL UPDATE & SAVE VERSION & UPDATE HISTORY
            const currentVersions = targetFile.versions || [targetFile.code || ''];
            const currentIndex = targetFile.currentVersionIndex ?? (currentVersions.length - 1);
            const truncatedVersions = currentVersions.slice(0, currentIndex + 1);
            let newVersions = truncatedVersions;
            if (truncatedVersions[truncatedVersions.length - 1] !== accumulatedCode) {
                newVersions = [...truncatedVersions, accumulatedCode];
            }

            const finalHistory = [...updatedHistory, { 
                role: 'model' as const, 
                text: accumulatedExplanation || `He actualizado el código de ${targetFile.name} según tus instrucciones.` 
            }];

            updateFileByIndex(targetIndex, { 
                code: accumulatedCode,
                isGenerating: false, 
                agentStatus: `Agente ${targetIndex + 1} finalizó el diseño de ${targetFile.name}`,
                history: finalHistory,
                versions: newVersions,
                currentVersionIndex: newVersions.length - 1
            });

            setToastNotification({ title: 'Web Programmer', message: '¡Código finalizado! (-2 créditos diarios)', icon: 'code' });
        } catch (e) {
            console.error(e);
            updateFileByIndex(targetIndex, { isGenerating: false, agentStatus: 'Error en la generación' });
            setToastNotification({ title: 'Error', message: 'Hubo un problema generando el código.', icon: 'close' });
        }
    };

    const handleVisualizeDirect = () => {
        if (!directHtmlInput.trim() || !activeWebDevSessionId || !activeFile) return;
        
        const newCode = directHtmlInput;
        updateActiveFile({ code: newCode });
        saveVersion(newCode); // Save version for direct paste too
        
        setRightPaneView('preview');
        setIsDirectPasteModalOpen(false);
        setDirectHtmlInput('');
        setToastNotification({ title: "Código Visualizado", message: "Previsualización actualizada instantáneamente (0 créditos usados).", icon: "image" });
    };

    const handleCopy = () => {
        if (!activeFile?.code) return;
        navigator.clipboard.writeText(activeFile.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        if (!activeFile?.code) return;
        const blob = new Blob([activeFile.code], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeFile.name}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const handleDownloadZip = async () => {
        if (!activeSession || !activeSession.files) return;
        setToastNotification({ title: "Preparando ZIP...", message: "Empaquetando tu proyecto multi-página.", icon: "box", isLoading: true });
        try {
            const zip = new JSZip();
            const cleanName = activeSession.name.replace(/\s+/g, '_');
            
            activeSession.files.forEach(f => {
                let code = f.code;
                // Enforce branding if missing
                if (!code.includes('Goatify IA')) {
                    const footer = `
    <footer class="mt-12 py-8 border-t border-gray-100 text-center font-sans text-gray-400 text-sm">
        <p>&copy; 2026 - Desarrollado en <a href="https://ia.goatify.app" target="_blank" class="text-purple-600 font-bold hover:underline">Goatify IA</a></p>
    </footer>`;
                    if (code.includes('</body>')) {
                        code = code.replace('</body>', `${footer}\n</body>`);
                    } else {
                        code += footer;
                    }
                }
                zip.file(f.name, code);
            });

            zip.file("readme.txt", `Proyecto: ${activeSession.name}\nTipo: ${activeSession.type === 'web' ? 'Sitio Web' : 'PWA App'}\nGenerado por Goatify IA\n\nEstructura:\n${activeSession.files.map(f => `- ${f.name}`).join('\n')}\n- assets/: Carpeta para tus imágenes`);
            const assets = zip.folder("assets");
            assets?.file(".keep", "");
            
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${cleanName}_Project.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setToastNotification({ title: "Descarga Lista", message: "Tu proyecto multi-página se ha descargado como ZIP.", icon: "check" });
        } catch (error) {
            console.error("ZIP Error", error);
            setToastNotification({ title: "Error", message: "No se pudo crear el ZIP.", icon: "close" });
        }
    };

    const handlePreview = () => {
        if (!activeFile?.code) return;
        const previewWindow = window.open('', '_blank');
        if (previewWindow) {
            previewWindow.document.write(activeFile.code);
            previewWindow.document.close();
        }
    };

    const handleOpenPublishModal = () => {
        if (!activeFile?.code) return;
        setIsPublishModalOpen(true);
        setBrandName('');
    };

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

    const getCurrentPublishedSiteCount = async () => {
        if (!currentUser) return 0;
        const sitesSnap = await getDocs(query(collection(db, 'published_sites'), where('ownerId', '==', currentUser.uid)));
        return sitesSnap.docs.filter(d => d.data()?.active !== false).length;
    };

    const getCurrentSitePublishLimit = () => {
        const planKey = userProfile?.plan || userUsage?.plan_id || 'free';
        const isSuperAdmin = Boolean(currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email.toLowerCase()));
        if (isSuperAdmin) return 999999;
        return getPlanConfig(planKey).limits.publish_sites ?? 0;
    };

    const syncPublishedSiteCounter = async (_count: number) => {
        if (!currentUser) return;
        await recalculateUserStats(currentUser.uid);
    };

    const handlePublishSite = async () => {
        if (!brandName.trim() || !currentUser || !activeSession?.files) return;

        setIsPublishing(true);
        try {
            const slug = slugify(brandName);
            let finalId = slug || Math.random().toString(36).substring(2, 10);
            let isUpdatingOwnSite = false;
            let existingCreatedAt: string | undefined;
            
            // Si el slug ya existe y pertenece al mismo usuario, se republica/actualiza sin consumir otro cupo.
            // Esto corrige el plan gratis: 1 sitio publicado gratis sí debe funcionar.
            const checkRef = doc(db, 'published_sites', finalId);
            const checkSnap = await getDoc(checkRef);
            if (checkSnap.exists()) {
                const existingData = checkSnap.data();
                if (existingData.ownerId === currentUser.uid) {
                    isUpdatingOwnSite = true;
                    existingCreatedAt = existingData.createdAt;
                } else {
                    finalId = `${finalId}-${Math.random().toString(36).substring(2, 6)}`;
                }
            }

            const publishedSiteCount = await getCurrentPublishedSiteCount();
            const publishLimit = getCurrentSitePublishLimit();
            if (!isUpdatingOwnSite && publishLimit !== 999999 && publishedSiteCount + 1 > publishLimit) {
                await syncPublishedSiteCounter(publishedSiteCount);
                setToastNotification({
                    title: "Límite de sitios",
                    message: `Tu plan actual permite ${publishLimit} sitio${publishLimit === 1 ? '' : 's'} publicado${publishLimit === 1 ? '' : 's'}. Puedes actualizar un sitio existente o subir de plan para publicar más.`,
                    icon: "lock"
                });
                setProModalOpen(true);
                return;
            }

            const nowIso = new Date().toISOString();
            const preparedFiles = activeSession.files.map(f => {
                let code = f.code || '';
                // Enforce branding if missing
                if (code && !code.includes('Goatify IA')) {
                    const footer = `
    <footer class="mt-12 py-8 border-t border-gray-100 text-center font-sans text-gray-400 text-sm">
        <p>&copy; 2026 - Desarrollado en <a href="https://ia.goatify.app" target="_blank" class="text-purple-600 font-bold hover:underline">Goatify IA</a></p>
    </footer>`;
                    if (code.includes('</body>')) {
                        code = code.replace('</body>', `${footer}
</body>`);
                    } else {
                        code += footer;
                    }
                }
                return { name: f.name, code };
            });
            const homeFile = preparedFiles.find(f => /^index\.html?$/i.test(f.name)) || preparedFiles.find(f => (f.code || '').trim().length > 0) || preparedFiles[0];
            await setDoc(doc(db, 'published_sites', finalId), {
                ownerId: currentUser.uid,
                brandName: brandName.trim(),
                type: activeSession.type || 'web',
                files: preparedFiles,
                htmlCode: homeFile?.code || '<!doctype html><html><body><h1>Sitio publicado sin contenido</h1></body></html>',
                homeFileName: homeFile?.name || 'index.html',
                pages: preparedFiles.map(f => f.name),
                createdAt: existingCreatedAt || nowIso,
                updatedAt: nowIso,
                active: true
            }, { merge: true });


            const finalCount = isUpdatingOwnSite ? publishedSiteCount : publishedSiteCount + 1;
            await syncPublishedSiteCounter(finalCount);

            const link = `${window.location.origin}/#/site/${finalId}`;
            setToastNotification({ title: isUpdatingOwnSite ? "Sitio Actualizado" : "Sitio Publicado", message: isUpdatingOwnSite ? "Tu sitio fue actualizado y el enlace se copió." : "Tu proyecto multi-página ha sido publicado.", icon: "check" });
            navigator.clipboard.writeText(link);
            const linkMsg: WebDevMessage = { role: 'model', text: `🎉 **${isUpdatingOwnSite ? '¡Sitio Actualizado!' : '¡Proyecto Publicado!'}**\n\nTu proyecto multi-página está en vivo aquí:\n[${link}](${link})\n\nPlan actual: ${userProfile?.plan || userUsage?.plan_id || 'free'} · Sitios publicados: ${finalCount}/${publishLimit === 999999 ? '∞' : publishLimit}.` };
            
            // Update the active file's history
            const updatedFiles = [...activeSession.files];
            updatedFiles[activeFileIndex] = {
                ...updatedFiles[activeFileIndex],
                history: [...(updatedFiles[activeFileIndex].history || []), linkMsg]
            };
            updateSession({ files: updatedFiles });
            
            setIsPublishModalOpen(false);
        } catch (error) {
            console.error("Error publishing site:", error);
            setToastNotification({ title: "Error", message: "No se pudo generar el enlace.", icon: "close" });
        } finally {
            setIsPublishing(false);
        }
    };
    
    const handleDownloadGuide = () => {
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text("Manual Maestro: Programador Web Goatify IA", 10, 20);
        doc.setFontSize(12);
        let y = 40;
        const sections = [
            { title: "Paso 1: Define tu Visión", content: "Describe detalladamente qué tipo de aplicación o sitio web necesitas. No escatimes en detalles: 'Crea una landing page para mi gimnasio, usa un fondo oscuro con gradientes morados y una sección de testimonios en cuadrícula'." },
            { title: "Paso 2: Estructura y Componentes", content: "Pide elementos específicos: 'Agrega una barra de navegación fija', 'Diseña un formulario de contacto con validación', 'Pon una sección de precios con 3 tarjetas'." },
            { title: "Paso 3: Estilo Visual (Tailwind CSS)", content: "Goatify utiliza Tailwind CSS por defecto. Puedes pedir estilos exactos: 'Usa sombras suaves', 'Bordes redondeados de 2xl', 'Tipografía elegante sans-serif', 'Botones con efecto de brillo al pasar el mouse'." },
            { title: "Paso 4: Multimedia y Recursos", content: "Usa el icono de imagen para subir tus propios recursos. Shivo las integrará automáticamente en el código con URLs seguras. También puedes pedirle que use imágenes de stock de Unsplash." },
            { title: "Paso 5: Lógica e Interactividad", content: "Define cómo debe comportarse la web: 'Que el botón abra un modal', 'Crea una calculadora de ROI en JavaScript', 'Haz que las imágenes tengan un efecto de zoom'." },
            { title: "Paso 6: Publicación y Enlace Único", content: "Presiona 'Publicar' para generar un enlace único (ia.goatify.app/#/site/ID). Tu sitio estará en vivo para el mundo instantáneamente." },
            { title: "Paso 7: Iteración Continua", content: "Si algo no te gusta, simplemente dile a Shivo: 'El menú se ve mal en móvil', 'Cambia todos los textos a color blanco', 'Mueve la sección de contacto arriba de los precios'." },
            { title: "Conceptos: ¿Qué es el Código?", content: "HTML (Los Cimientos): Define qué hay en la página. Son los ladrillos: títulos, párrafos, imágenes y botones.\nCSS (La Pintura y Decoración): Define cómo se ve. Usamos Tailwind CSS para un diseño de élite.\nJavaScript (La Inteligencia): Define qué hace la página. Es el motor: animaciones, cálculos y formularios." },
            { title: "Conceptos Básicos de Programación", content: "Variables: 'Cajitas con nombre' donde guardamos información.\nFunciones: 'Pequeñas máquinas' que hacen una tarea específica.\nCondicionales: Caminos de decisión (SI... ENTONCES).\nBucles (Loops): Tareas repetitivas ejecutadas en milisegundos." },
            { title: "Glosario para No Programadores", content: "Frontend: La 'cara' de tu negocio (lo que el cliente ve).\nBackend: El 'cerebro' oculto (procesos y datos).\nAPI: Un 'mesero' que conecta dos aplicaciones entre sí.\nBase de Datos: Un archivero digital gigante y seguro.\nResponsive Design: Tu web se adapta como el agua a cualquier pantalla." },
            { title: "Ecosistema Moderno", content: "Frameworks: Kits de construcción avanzados como React.\nHosting: El espacio en internet donde vive tu web.\nDominios: Tu dirección personalizada (www.tuweb.com)." },
            { title: "SEO y Rendimiento", content: "SEO: Técnicas para aparecer en Google.\nPerformance: Velocidad de carga. Goatify optimiza tu código para que sea ultra rápido." },
            { title: "Diseño UX/UI", content: "UI (Interfaz): Lo visual y estético.\nUX (Experiencia): Qué tan fácil y agradable es usar tu web.\nCTA (Llamada a la Acción): Botones clave para convertir visitantes en clientes." },
            { title: "Mantenimiento", content: "Bugs: Errores que pueden surgir y que la IA puede corregir.\nDeploy: El acto de lanzar tus cambios a la web real." },
            { title: "Prompting Maestro (Reglas de Oro)", content: "1. Sé un Director de Cine: Sé específico con colores, estilos y secciones.\n2. Itera sin Miedo: Pide cambios pequeños y constantes.\n3. Usa Referencias Visuales: Sube capturas de pantalla para que la IA las replique." }
        ];
        sections.forEach(sec => {
            doc.setFont("helvetica", "bold");
            doc.text(sec.title, 10, y);
            y += 7;
            doc.setFont("helvetica", "normal");
            const splitText = doc.splitTextToSize(sec.content, 180);
            doc.text(splitText, 10, y);
            y += (splitText.length * 6) + 10;
            if (y > 270) { doc.addPage(); y = 20; }
        });
        doc.save("Manual_Web_Programmer_Goatify.pdf");
    };

    const getArchitecture = () => {
        const code = activeSession?.code || '';
        const hasCSS = code.includes('<style>');
        const hasJS = code.includes('<script>');
        const lines = code.split('\n').length;
        const images = (code.match(/<img/g) || []).length;
        return (
            <div className="font-mono text-sm space-y-2">
                <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                    <Icon name="folder" className="w-4 h-4 text-yellow-500"/> <span>root/</span>
                </div>
                <div className="pl-6 space-y-1">
                    <div className="flex items-center gap-2">
                        <Icon name="code" className="w-4 h-4 text-orange-500"/> <span>index.html <span className="text-xs text-gray-400">({lines} líneas)</span></span>
                    </div>
                    {hasCSS && (
                        <div className="flex items-center gap-2 opacity-80">
                             <Icon name="code" className="w-4 h-4 text-blue-500"/> <span>styles.css <span className="text-xs text-gray-400">(Integrado)</span></span>
                        </div>
                    )}
                    {hasJS && (
                         <div className="flex items-center gap-2 opacity-80">
                             <Icon name="code" className="w-4 h-4 text-yellow-400"/> <span>script.js <span className="text-xs text-gray-400">(Integrado)</span></span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                         <Icon name="folder" className="w-4 h-4 text-green-500"/> <span>assets/ <span className="text-xs text-gray-400">({images} archivos)</span></span>
                    </div>
                </div>
            </div>
        );
    };
    
    return (
        <div className={`h-full flex flex-col lg:flex-row bg-neutral-50 dark:bg-black/20 overflow-hidden ${isModuleFullScreen ? 'fixed inset-0 z-[999999999] w-screen h-screen bg-white dark:bg-neutral-900' : ''}`}>
             <Modal isOpen={isTypeSelectorOpen} onClose={() => setIsTypeSelectorOpen(false)} title="¿Qué quieres construir hoy?">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
                    <button 
                        onClick={() => { addNewWebDevSession('web'); setIsTypeSelectorOpen(false); }}
                        className="relative overflow-hidden p-8 rounded-[2.5rem] border-2 border-neutral-100 dark:border-neutral-800 hover:border-brand-primary transition-all text-left group bg-white dark:bg-neutral-900 shadow-sm hover:shadow-2xl hover:-translate-y-1"
                    >
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all" />
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
                            <Icon name="globe" className="w-8 h-8 text-white"/>
                        </div>
                        <h3 className="font-black text-2xl mb-3 text-neutral-900 dark:text-white">Sitio Web Pro</h3>
                        <p className="text-sm text-neutral-500 leading-relaxed">Landing pages, blogs y portafolios multi-página con diseño ultra moderno y SEO optimizado.</p>
                        <div className="mt-6 flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-widest">
                            Empezar Proyecto <Icon name="arrow-right" className="w-4 h-4"/>
                        </div>
                    </button>

                    <button 
                        onClick={() => { addNewWebDevSession('app'); setIsTypeSelectorOpen(false); }}
                        className="relative overflow-hidden p-8 rounded-[2.5rem] border-2 border-neutral-100 dark:border-neutral-800 hover:border-brand-primary transition-all text-left group bg-white dark:bg-neutral-900 shadow-sm hover:shadow-2xl hover:-translate-y-1"
                    >
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl group-hover:bg-purple-500/10 transition-all" />
                        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform">
                            <Icon name="smartphone" className="w-8 h-8 text-white"/>
                        </div>
                        <h3 className="font-black text-2xl mb-3 text-neutral-900 dark:text-white">Aplicación PWA</h3>
                        <p className="text-sm text-neutral-500 leading-relaxed">Apps instalables que funcionan offline, con soporte para bases de datos y experiencia nativa.</p>
                        <div className="mt-6 flex items-center gap-2 text-purple-600 font-black text-xs uppercase tracking-widest">
                            Crear Aplicación <Icon name="arrow-right" className="w-4 h-4"/>
                        </div>
                    </button>
                </div>
            </Modal>

            <Modal isOpen={isAssignModalOpen} onClose={() => setAssignModalOpen(false)} title={t('assignToProject')}>
                    <div className="space-y-4">
                        <p>Selecciona un proyecto para guardar el código:</p>
                        <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                         <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setAssignModalOpen(false)}>{t('cancel')}</Button>
                            <Button onClick={() => { assignCodeToProject(activeWebDevSessionId, targetProjectId); setAssignModalOpen(false); }}>{t('confirm')}</Button>
                        </div>
                    </div>
                 </Modal>

            <Modal isOpen={isDirectPasteModalOpen} onClose={() => setIsDirectPasteModalOpen(false)} title="Visualizar Código HTML">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500 font-medium">Pega tu código HTML/CSS/JS aquí para visualizarlo instantáneamente. Esto no consume créditos de IA.</p>
                    <Textarea 
                        value={directHtmlInput}
                        onChange={e => setDirectHtmlInput(e.target.value)}
                        placeholder="<!DOCTYPE html>..."
                        rows={12}
                        className="font-mono text-xs p-4 shadow-inner bg-neutral-50 dark:bg-black/40"
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsDirectPasteModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleVisualizeDirect} className="bg-brand-primary">Visualizar</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isPublishModalOpen} onClose={() => setIsPublishModalOpen(false)} title="Generar Link Único">
                <div className="space-y-4">
                    <div className="p-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white shadow-lg text-center">
                        <Icon name="rocket" className="w-12 h-12 mx-auto mb-2 text-white"/>
                        <p className="font-bold text-lg">Publicación Profesional</p>
                        <p className="text-xs opacity-90">Tu sitio estará en línea instantáneamente con un enlace seguro.</p>
                    </div>
                    <div>
                        <label className="font-bold text-sm mb-1 block">Nombre del Sitio / Proyecto</label>
                        <Input 
                            value={brandName} 
                            onChange={(e) => setBrandName(e.target.value)} 
                            placeholder="Ej: Landing Page Cliente X" 
                            autoFocus
                            className="font-bold text-lg"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="secondary" onClick={() => setIsPublishModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handlePublishSite} disabled={!brandName.trim() || isPublishing} className="bg-green-500 hover:bg-green-600 text-white border-none shadow-lg px-6">
                            {isPublishing ? <Spinner className="w-4 h-4 text-white" /> : "Publicar Ahora"}
                        </Button>
                    </div>
                </div>
            </Modal>
            
            <Modal isOpen={isAddPageModalOpen} onClose={() => setIsAddPageModalOpen(false)} title="Añadir Nueva Página">
                <div className="space-y-6">
                    <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 flex items-center gap-4">
                        <div className="w-12 h-12 bg-brand-primary rounded-xl flex items-center justify-center text-white shadow-lg">
                            <Icon name="plus" className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="font-bold text-neutral-900 dark:text-white">Nueva Página</p>
                            <p className="text-xs text-neutral-500">Crea un nuevo archivo para expandir tu proyecto.</p>
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2 block">Nombre del Archivo</label>
                        <Input 
                            value={newPageName}
                            onChange={(e) => setNewPageName(e.target.value)}
                            placeholder="ej: contacto.html"
                            className="font-bold text-lg py-6 rounded-2xl border-2 focus:border-brand-primary"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleAddPage()}
                        />
                        <p className="mt-2 text-[10px] text-neutral-400 italic">* Si no incluyes extensión, se añadirá .html automáticamente.</p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                        <Button variant="secondary" onClick={() => setIsAddPageModalOpen(false)} className="rounded-xl px-6">Cancelar</Button>
                        <Button onClick={handleAddPage} className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl px-8 shadow-lg shadow-brand-primary/20">Añadir Página</Button>
                    </div>
                </div>
            </Modal>
            
            <Modal isOpen={isGuideModalOpen} onClose={() => setIsGuideModalOpen(false)} title="Manual Maestro: Programador Web (Super Mega Edición)" className="max-w-5xl h-[90vh]">
                <div className="space-y-8 p-1 overflow-y-auto custom-scrollbar pb-20">
                    <div className="bg-brand-primary/5 p-6 rounded-3xl border border-brand-primary/20">
                        <p className="text-lg font-bold text-brand-primary mb-2">Construye el futuro digital de tu empresa o de tus clientes sin tocar una sola línea de código manual.</p>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">Esta herramienta democratiza el desarrollo de software para todos, permitiéndote crear desde landing pages hasta aplicaciones complejas usando solo tu voz o texto.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* SECCIÓN 1: CONCEPTOS FUNDAMENTALES */}
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">01</div> 
                                    ¿Qué es el Código? (Explicado para Humanos)
                                </h4>
                                <div className="space-y-4">
                                    <p className="text-sm text-neutral-700 dark:text-neutral-300 italic mb-2">El código no es magia, es una serie de instrucciones lógicas. Imagina que es una receta de cocina o las instrucciones de un mueble:</p>
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">HTML (Los Cimientos)</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Define qué hay en la página. Son los ladrillos: títulos, párrafos, imágenes y botones. Sin HTML, no hay nada.</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">CSS (La Pintura y Decoración)</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Define cómo se ve. Usamos <strong>Tailwind CSS</strong>, una herramienta de diseño de élite que permite que todo se vea moderno, limpio y profesional al instante.</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">JavaScript (La Inteligencia)</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Define qué hace la página. Es el motor: animaciones, cálculos de precios, formularios que se envían y menús que se abren.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">02</div> 
                                    Conceptos Básicos de Programación
                                </h4>
                                <div className="space-y-4">
                                    <p className="text-sm text-neutral-700 dark:text-neutral-300 italic mb-2">Para que Shivo te entienda mejor, es útil conocer estos 4 términos:</p>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl">
                                            <p className="text-xs font-black text-brand-primary uppercase">1. Variables</p>
                                            <p className="text-xs text-neutral-600 dark:text-neutral-400">Son "cajitas con nombre" donde guardamos información. Ejemplo: una cajita llamada "NombreCliente" que guarda el texto "Juan".</p>
                                        </div>
                                        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl">
                                            <p className="text-xs font-black text-brand-primary uppercase">2. Funciones</p>
                                            <p className="text-xs text-neutral-600 dark:text-neutral-400">Son "pequeñas máquinas" que hacen una tarea específica. Ejemplo: una función que calcula el IVA automáticamente.</p>
                                        </div>
                                        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl">
                                            <p className="text-xs font-black text-brand-primary uppercase">3. Condicionales</p>
                                            <p className="text-xs text-neutral-600 dark:text-neutral-400">Son caminos de decisión. "SI el usuario es VIP, dale un 20% de descuento; SI NO, dale el precio normal".</p>
                                        </div>
                                        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl">
                                            <p className="text-xs font-black text-brand-primary uppercase">4. Bucles (Loops)</p>
                                            <p className="text-xs text-neutral-600 dark:text-neutral-400">Son tareas repetitivas. "Muestra estas 10 fotos de productos una por una". La IA lo hace en milisegundos.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN 2: ARQUITECTURA Y GLOSARIO */}
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">03</div> 
                                    Glosario para No Programadores
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex gap-3">
                                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full mt-1.5 flex-shrink-0"></div>
                                        <p className="text-sm"><strong>Frontend:</strong> Es la "cara" de tu negocio. Todo lo que el cliente ve y toca en su pantalla.</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full mt-1.5 flex-shrink-0"></div>
                                        <p className="text-sm"><strong>Backend:</strong> Es el "cerebro" oculto. Donde se procesan los pagos, se guardan los datos y ocurre la lógica pesada.</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full mt-1.5 flex-shrink-0"></div>
                                        <p className="text-sm"><strong>API:</strong> Imagina un mesero. Tú le pides algo (datos), él va a la cocina (servidor) y te trae la respuesta.</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full mt-1.5 flex-shrink-0"></div>
                                        <p className="text-sm"><strong>Base de Datos:</strong> Es un archivero digital gigante y seguro donde se guarda todo (usuarios, pedidos, fotos).</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full mt-1.5 flex-shrink-0"></div>
                                        <p className="text-sm"><strong>Responsive Design:</strong> Significa que tu web se adapta como el agua a cualquier pantalla (celular, tablet o PC) automáticamente.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-neutral-900 text-white p-6 rounded-3xl border border-white/10 shadow-2xl">
                                <h4 className="font-black text-brand-accent uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-accent text-black rounded-lg flex items-center justify-center text-[10px]">04</div> 
                                    Cómo Hablarle a la IA (Prompting Maestro)
                                </h4>
                                <div className="space-y-4">
                                    <p className="text-xs text-neutral-400 italic">Para obtener resultados de élite, sigue estas 3 reglas de oro:</p>
                                    <div className="space-y-3">
                                        <div className="flex gap-3">
                                            <div className="font-black text-brand-accent">1.</div>
                                            <p className="text-sm"><strong>Sé un Director de Cine:</strong> No digas "haz una web de comida". Di "haz una landing page elegante para un restaurante de sushi de lujo, usa colores negro y dorado, y añade un botón de reserva en la parte superior".</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="font-black text-brand-accent">2.</div>
                                            <p className="text-sm"><strong>Itera sin Miedo:</strong> Si no te gusta algo, pide un cambio pequeño: "Haz el texto más grande", "Cambia el fondo a blanco", "Añade una sección de testimonios".</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="font-black text-brand-accent">3.</div>
                                            <p className="text-sm"><strong>Usa Referencias Visuales:</strong> Sube una captura de pantalla de una web que te guste y dile a Shivo: "Usa esta imagen como referencia para el diseño de mi sitio".</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-brand-primary/10 p-8 rounded-[2.5rem] border border-brand-primary/20 flex flex-col md:flex-row items-center gap-8 shadow-xl">
                        <div className="w-24 h-24 bg-brand-primary text-white rounded-3xl flex items-center justify-center shadow-lg flex-shrink-0"><Icon name="image" className="w-12 h-12"/></div>
                        <div>
                            <h4 className="text-xl font-black text-brand-primary uppercase tracking-tighter">Estrategia Pro: El Truco de la Imagen</h4>
                            <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-2">¿Viste una web increíble en internet o hiciste un dibujo en una servilleta? Tómale una foto o captura, súbela al chat y dile a Shivo: <strong>"Usa esta imagen como referencia para el diseño de mi sitio"</strong>. Ella analizará la estructura y los colores para replicarlos profesionalmente.</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-neutral-800 p-8 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-700 shadow-sm">
                        <h4 className="font-black text-brand-primary uppercase text-sm mb-6 flex items-center gap-2">
                            <div className="w-8 h-8 bg-brand-primary text-white rounded-xl flex items-center justify-center text-xs">05</div> 
                            Flujo de Trabajo Maestro
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { step: "1", title: "Define el Objetivo", desc: "¿Qué quieres que haga tu web? (Vender, informar, captar leads)." },
                                { step: "2", title: "Sube Referencias", desc: "Si tienes un boceto o una web que te gusta, súbela al chat." },
                                { step: "3", title: "Refina con IA", desc: "Ajusta los detalles pidiéndolo como si hablaras con un experto." },
                                { step: "4", title: "Publica con un Clic", desc: "Una vez estés feliz, lanza tu web al mundo real. ¡Ya eres un desarrollador!" }
                            ].map((item, idx) => (
                                <div key={idx} className="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                                    <div className="text-2xl font-black text-neutral-200 dark:text-neutral-700 mb-2">{item.step}</div>
                                    <p className="font-bold text-sm mb-1">{item.title}</p>
                                    <p className="text-xs text-neutral-500">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">06</div> 
                                    El Ecosistema Moderno
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">Frameworks (Marcos de Trabajo)</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Son como "kits de construcción" avanzados. Goatify usa <strong>React</strong> y <strong>Tailwind CSS</strong>, las tecnologías que usan empresas como Facebook, Netflix y Airbnb para que tu web sea ultra rápida y escalable.</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">Hosting y Servidores</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Es el "alquiler" del espacio en internet donde vive tu web. Al publicar con Goatify, nosotros nos encargamos de que tu sitio esté en servidores de alta velocidad 24/7.</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">Dominios</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Es la dirección de tu casa en internet (ej: www.tuempresa.com). Es lo que la gente escribe para encontrarte.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">07</div> 
                                    SEO y Rendimiento
                                </h4>
                                <div className="space-y-4">
                                    <p className="text-sm text-neutral-700 dark:text-neutral-300">No solo basta con tener una web, la gente debe encontrarla:</p>
                                    <ul className="space-y-3">
                                        <li className="flex gap-3">
                                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                                            <p className="text-sm"><strong>SEO (Optimización):</strong> Son técnicas para que Google te ponga en los primeros resultados cuando alguien busca lo que tú ofreces.</p>
                                        </li>
                                        <li className="flex gap-3">
                                            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0"></div>
                                            <p className="text-sm"><strong>Performance:</strong> Qué tan rápido carga tu web. Una web lenta pierde clientes; Goatify genera código optimizado para cargar en menos de 2 segundos.</p>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-neutral-900 text-white p-6 rounded-3xl border border-white/10 shadow-2xl">
                                <h4 className="font-black text-brand-accent uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-accent text-black rounded-lg flex items-center justify-center text-[10px]">08</div> 
                                    Diseño UX/UI (Experiencia de Usuario)
                                </h4>
                                <div className="space-y-4">
                                    <p className="text-xs text-neutral-400 italic">La diferencia entre una web que vende y una que no:</p>
                                    <div className="space-y-3">
                                        <div className="flex gap-3">
                                            <div className="font-black text-brand-accent">UI:</div>
                                            <p className="text-sm"><strong>Interfaz de Usuario:</strong> Los colores, botones, fuentes y estética. Es lo "bonito" de la web.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="font-black text-brand-accent">UX:</div>
                                            <p className="text-sm"><strong>Experiencia de Usuario:</strong> Qué tan fácil es navegar. Si el cliente encuentra lo que busca rápido, tienes una buena UX.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="font-black text-brand-accent">CTA:</div>
                                            <p className="text-sm"><strong>Llamada a la Acción:</strong> Botones como "Comprar Ahora" o "Contactar". Son el objetivo final de tu sitio.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">09</div> 
                                    Mantenimiento e Iteración
                                </h4>
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="font-black text-2xl text-neutral-200 dark:text-neutral-700">BUG</div>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300"><strong>¿Qué es un Bug?</strong> Es un error en el código. Si algo no funciona como esperas, dile a Shivo: "Hay un error en el menú móvil, corrígelo".</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="font-black text-2xl text-neutral-200 dark:text-neutral-700">DEP</div>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300"><strong>Deploy (Despliegue):</strong> Es el acto de subir tus cambios a internet. Con Goatify, cada vez que publicas, haces un "deploy" instantáneo.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-brand-primary to-purple-700 p-8 rounded-[2.5rem] border border-white/10 flex items-center gap-8 shadow-2xl shadow-brand-primary/20">
                         <div className="w-20 h-20 bg-white/20 backdrop-blur-md text-white rounded-3xl flex items-center justify-center shadow-inner border border-white/20"><Icon name="code" className="w-12 h-12"/></div>
                         <div>
                             <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Arquitecto Digital Maestro</h3>
                             <p className="text-sm text-white/80 mt-2 font-bold uppercase tracking-widest">Guía Definitiva de Programación e IA</p>
                         </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* SECCIÓN 1: CONCEPTOS FUNDAMENTALES */}
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">01</div> 
                                    Glosario Técnico para Humanos
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">¿Qué es un Token?</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Los tokens son las "piezas" de información que la IA procesa. Imagina que cada palabra se divide en sílabas o fragmentos; eso son los tokens. A más tokens, más compleja puede ser la respuesta. Goatify optimiza esto para que obtengas el máximo código con el menor consumo.</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">¿Qué es un Prompt?</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Es la instrucción que le das a la IA. Un buen prompt es específico: "Crea un botón azul con bordes redondeados" es mejor que "Haz un botón".</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-neutral-400 uppercase mb-1">HTML / CSS / JS</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300"><strong>HTML</strong> es el esqueleto (textos, botones). <strong>CSS (Tailwind)</strong> es la pintura y diseño. <strong>JavaScript</strong> es el cerebro que hace que las cosas se muevan o funcionen.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">02</div> 
                                    Modelos de Lenguaje (LLMs)
                                </h4>
                                <div className="space-y-4">
                                    <p className="text-sm text-neutral-700 dark:text-neutral-300">Existen motores especializados en código que Goatify utiliza según tu plan:</p>
                                    <ul className="space-y-3">
                                        <li className="flex gap-3">
                                            <div className="w-1.5 h-1.5 bg-brand-primary rounded-full mt-1.5 flex-shrink-0"></div>
                                            <p className="text-sm"><strong>Gemini 2.5 Flash:</strong> El motor más rápido y moderno de Google, optimizado para entender estructuras web complejas en milisegundos.</p>
                                        </li>
                                        <li className="flex gap-3">
                                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-1.5 flex-shrink-0"></div>
                                            <p className="text-sm"><strong>GPT-4o / Claude 3.5:</strong> Modelos de razonamiento profundo que destacan por su lógica matemática y resolución de bugs difíciles.</p>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN 2: ARQUITECTURA Y FLUJO */}
                        <div className="space-y-6">
                            <div className="bg-neutral-900 text-white p-6 rounded-3xl border border-white/10 shadow-2xl">
                                <h4 className="font-black text-brand-accent uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-accent text-black rounded-lg flex items-center justify-center text-[10px]">03</div> 
                                    Arquitectura del Proyecto
                                </h4>
                                <div className="font-mono text-[11px] space-y-2 opacity-90">
                                    <div className="flex items-center gap-2"><Icon name="folder" className="w-3 h-3 text-yellow-500"/> root/</div>
                                    <div className="pl-4 space-y-1">
                                        <div className="flex items-center gap-2"><Icon name="code" className="w-3 h-3 text-orange-500"/> index.html <span className="text-neutral-500">(Código base)</span></div>
                                        <div className="flex items-center gap-2"><Icon name="code" className="w-3 h-3 text-blue-400"/> styles.css <span className="text-neutral-500">(Tailwind JIT)</span></div>
                                        <div className="flex items-center gap-2"><Icon name="code" className="w-3 h-3 text-yellow-400"/> script.js <span className="text-neutral-500">(Lógica JS)</span></div>
                                        <div className="flex items-center gap-2"><Icon name="folder" className="w-3 h-3 text-green-500"/> assets/ <span className="text-neutral-500">(Imágenes en la nube)</span></div>
                                    </div>
                                    <p className="mt-4 text-[10px] text-neutral-400 italic">Goatify integra todo en un solo archivo portable para que puedas descargarlo y usarlo en cualquier servidor sin configuraciones extras.</p>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-neutral-800 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                <h4 className="font-black text-brand-primary uppercase text-xs mb-4 flex items-center gap-2">
                                    <div className="w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px]">04</div> 
                                    Dominio del Flujo Maestro
                                </h4>
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="font-black text-2xl text-neutral-200 dark:text-neutral-700">01</div>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300"><strong>Define:</strong> Empieza con la idea general. "Crea una web de venta de café con estilo rústico".</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="font-black text-2xl text-neutral-200 dark:text-neutral-700">02</div>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300"><strong>Itera:</strong> Pide cambios granulares. "Haz que el encabezado sea pegajoso", "Cambia el color de los botones a dorado".</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="font-black text-2xl text-neutral-200 dark:text-neutral-700">03</div>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300"><strong>Publica:</strong> Usa el botón de cohete para obtener una URL real. Tu sitio estará en vivo para todo el mundo.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-brand-accent/10 p-6 rounded-3xl border border-brand-accent/20">
                        <h4 className="font-black text-brand-primary uppercase text-xs mb-3 flex items-center gap-2">Pro-Tip de Programador</h4>
                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Puedes subir una imagen de un diseño que te guste (un boceto o una captura de pantalla) y decirle a la IA: <strong>"Usa esta imagen como referencia para el diseño de mi web"</strong>. Shivo analizará los colores y la estructura para replicarlos en código.</p>
                    </div>

                    <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row justify-end gap-3 sticky bottom-0 bg-white dark:bg-dark-surface py-4">
                        <Button variant="secondary" onClick={handleDownloadGuide} className="font-black uppercase text-[10px] tracking-widest px-8">
                             <Icon name="upload" className="w-4 h-4"/> Guardar Manual PDF
                        </Button>
                        <Button onClick={() => setIsGuideModalOpen(false)} className="font-black uppercase text-[10px] tracking-widest px-10">¡Listo, soy un Pro!</Button>
                    </div>
                </div>
            </Modal>

            <div className="w-full lg:w-64 bg-white dark:bg-dark-surface p-2 flex lg:flex-col flex-row overflow-x-auto lg:overflow-y-auto gap-2 border-b lg:border-b-0 lg:border-r border-light-border dark:border-dark-border z-10 lg:h-full h-auto flex-shrink-0 scrollbar-hide">
                {/* MONITOR DE CUPO POR PLAN */}
                <div className="flex-shrink-0 lg:w-full w-40 bg-brand-primary/5 p-2 sm:p-3 rounded-2xl border border-brand-primary/10 mb-0 lg:mb-2">
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-[8px] sm:text-[9px] font-black uppercase text-brand-primary tracking-widest">Cupo</p>
                        <p className="text-[9px] sm:text-[10px] font-bold text-neutral-800 dark:text-white">{opsUsed} / {opsLimit}</p>
                    </div>
                    <div className="w-full h-1 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-primary transition-all duration-1000" style={{ width: `${Math.min(100, (opsUsed / opsLimit) * 100)}%` }}></div>
                    </div>
                    <div className="mt-2 text-[8px] text-neutral-400 font-bold text-center">Motor: {modelInUse}</div>
                </div>

                <div className="flex-shrink-0 lg:w-full w-32">
                    <Button onClick={() => setIsTypeSelectorOpen(true)} size="sm" className="w-full h-full lg:h-10 bg-brand-primary text-white border-none shadow-md !px-2 !py-1 text-[10px] sm:text-xs">
                        <Icon name="plus" className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="truncate">{t('newWebSession')}</span>
                    </Button>
                </div>
                <div className="flex-1 lg:space-y-1 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto custom-scrollbar">
                    {webDevSessions.map(session => (
                        <div 
                            key={session.id}
                            onClick={() => setActiveWebDevSessionId(session.id)}
                            className={`flex-shrink-0 lg:w-full w-36 p-2 sm:p-3 rounded-xl cursor-pointer border transition-all ${activeWebDevSessionId === session.id ? 'bg-brand-primary/10 border-brand-primary shadow-sm' : 'bg-neutral-50 dark:bg-neutral-800 border-transparent hover:border-neutral-200'} group relative`}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <Icon name={session.type === 'app' ? "smartphone" : "code"} className={`w-3.5 h-3.5 flex-shrink-0 ${activeWebDevSessionId === session.id ? 'text-brand-primary' : 'text-neutral-400'}`} />
                                <span className={`text-[10px] sm:text-xs font-bold truncate ${activeWebDevSessionId === session.id ? 'text-brand-primary' : 'text-neutral-600 dark:text-neutral-300'}`}>
                                    {session.name}
                                </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1">
                                <span className={`text-[7px] font-black uppercase px-1 rounded ${session.type === 'app' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {session.type === 'app' ? 'PWA App' : 'Website'}
                                </span>
                                <span className="text-[7px] text-neutral-400 font-bold">{session.files?.length || 1} pág.</span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteWebDevSession(session.id); }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition-all"
                            >
                                <Icon name="trash" className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
                {activeSession ? (
                    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
                        {/* Editor/Chat Pane - Optimized for Mobile Split */}
                        <div className="w-full lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 h-[50%] lg:h-full overflow-hidden bg-white dark:bg-neutral-900/50 min-h-0">
                            {/* FILE TABS */}
                            <div className="flex bg-neutral-100 dark:bg-neutral-800/50 p-1 gap-1 overflow-x-auto scrollbar-hide border-b border-neutral-200 dark:border-neutral-800">
                                {activeSession.files?.map((f, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => updateSession({ activeFileIndex: idx })}
                                        className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all border ${activeFileIndex === idx ? 'bg-white dark:bg-neutral-700 border-neutral-200 dark:border-neutral-600 shadow-sm' : 'border-transparent hover:bg-neutral-200/50 dark:hover:bg-neutral-700/30'}`}
                                    >
                                        <Icon name="code" className={`w-3 h-3 ${activeFileIndex === idx ? 'text-brand-primary' : 'text-neutral-400'}`} />
                                        <span className={`text-[10px] font-bold ${activeFileIndex === idx ? 'text-brand-primary' : 'text-neutral-500'}`}>{f.name}</span>
                                        {activeSession.files.length > 1 && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); deleteFile(idx); }}
                                                className="p-0.5 hover:text-red-500 transition-colors"
                                            >
                                                <Icon name="close" className="w-2.5 h-2.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button 
                                    onClick={() => setIsAddPageModalOpen(true)}
                                    className="flex-shrink-0 p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-neutral-400 transition-all"
                                    title="Añadir página"
                                >
                                    <Icon name="plus" className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-2 sm:p-4 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-800/50 flex-none sticky top-0 z-30 backdrop-blur-md">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-[9px] sm:text-sm uppercase tracking-widest text-neutral-500">Desarrollo {activeSession.type === 'app' ? '(PWA)' : '(Web)'}</h3>
                                    {isModuleFullScreen && (
                                        <button 
                                            onClick={() => setIsModuleFullScreen?.(false)}
                                            className="flex items-center gap-1 px-2 py-1 bg-brand-primary/10 text-brand-primary rounded-lg text-[8px] sm:text-[10px] font-black uppercase hover:bg-brand-primary/20 transition-all"
                                        >
                                            <Icon name="close" className="w-3 h-3" />
                                            <span>Regresar</span>
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <button 
                                        onClick={handleDownloadZip}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-[10px] sm:text-xs font-black uppercase hover:bg-green-700 transition-all shadow-sm"
                                        title="Descargar Todo el Proyecto (ZIP)"
                                    >
                                        <Icon name="box" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/>
                                        <span>ZIP</span>
                                    </button>
                                    <button 
                                        onClick={() => setIsGuideModalOpen(true)} 
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-xl text-[10px] sm:text-xs font-black uppercase hover:bg-brand-primary/20 transition-all shadow-sm border border-brand-primary/10" 
                                        title="Manual Maestro"
                                    >
                                        <Icon name="book" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/>
                                        <span>Manual</span>
                                    </button>
                                </div>
                            </div>

                            {/* AGENT STATUS VISUALIZATION */}
                            <AnimatePresence mode="wait">
                                {activeFile?.agentStatus && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="bg-brand-primary/5 border-b border-brand-primary/10 px-4 py-2 flex items-center gap-3"
                                    >
                                        <div className="relative">
                                            <div className="w-8 h-8 bg-brand-primary rounded-full flex items-center justify-center text-white shadow-lg">
                                                <Icon name="sync" className={`w-4 h-4 ${activeFile.isGenerating ? 'animate-spin' : ''}`} />
                                            </div>
                                            {activeFile.isGenerating && (
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-neutral-900 animate-pulse" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] font-black text-brand-primary uppercase tracking-tighter leading-none">Agente Shivo en acción</p>
                                            <p className="text-[11px] text-neutral-600 dark:text-neutral-400 font-medium">{activeFile.agentStatus}</p>
                                        </div>
                                        {activeFile.isGenerating && (
                                            <div className="flex gap-0.5">
                                                {[0, 1, 2].map(i => (
                                                    <motion.div 
                                                        key={i}
                                                        animate={{ scale: [1, 1.5, 1] }}
                                                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                                                        className="w-1 h-1 bg-brand-primary rounded-full"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            
                            <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 sm:space-y-4 custom-scrollbar">
                                {activeFile?.history?.map((msg, i) => (
                                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-subtle-slide-in-up`}>
                                        <div className={`max-w-[92%] rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-sm ${msg.role === 'user' ? 'bg-brand-primary text-white rounded-br-none' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-bl-none border border-neutral-200 dark:border-neutral-700'}`}>
                                            {msg.file && (
                                                <div className="mb-1.5 p-1 bg-black/10 rounded-lg flex items-center gap-1.5 border border-black/5">
                                                    <Icon name="code" className="w-3" />
                                                    <span className="text-[8px] font-bold truncate">{msg.file.name}</span>
                                                </div>
                                            )}
                                            {msg.urlContext && (
                                                <div className={`mb-1.5 p-1 rounded-lg flex items-center gap-1.5 border ${msg.role === 'user' ? 'bg-white/10 border-white/20' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800'}`}>
                                                    <Icon name="globe" className={`w-3 h-3 ${msg.role === 'user' ? 'text-white/60' : 'text-blue-500'}`} />
                                                    <span className={`text-[8px] font-bold truncate ${msg.role === 'user' ? 'text-white/80' : 'text-blue-600 dark:text-blue-400'}`}>Ref: {msg.urlContext}</span>
                                                </div>
                                            )}
                                            <div className="whitespace-pre-wrap leading-tight sm:leading-relaxed">
                                                <ChatMessageRenderer text={msg.text} className={msg.role === 'user' ? 'text-white' : ''} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {activeFile?.isGenerating && (
                                    <div className="flex flex-col items-start animate-pulse">
                                        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl rounded-bl-none px-3 py-2 shadow-sm">
                                            <Spinner className="!p-0" text="Programando..." />
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="p-1 sm:p-4 border-t border-neutral-200 dark:border-neutral-800 space-y-1 bg-white dark:bg-dark-surface flex-none sticky bottom-0 z-30">
                                {/* STYLING SUGGESTIONS */}
                                <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide mb-1">
                                    {[
                                        { label: 'Modo Oscuro', prompt: 'Aplica un tema oscuro elegante (dark mode) con contrastes suaves.' },
                                        { label: 'Minimalista', prompt: 'Haz el diseño extremadamente minimalista, con mucho espacio en blanco y tipografía limpia.' },
                                        { label: 'Animaciones', prompt: 'Añade animaciones sutiles de entrada (fade-in, slide-up) a los elementos principales.' },
                                        { label: 'Tipografía Serif', prompt: 'Cambia la tipografía principal a una Serif elegante (ej: Playfair Display) para un look editorial.' },
                                        { label: 'Vidrio (Glass)', prompt: 'Aplica un efecto de vidrio esmerilado (glassmorphism) a las tarjetas y contenedores.' }
                                    ].map((s, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => { setPrompt(s.prompt); setTimeout(handleGenerate, 100); }}
                                            className="flex-shrink-0 px-3 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-brand-primary/10 hover:text-brand-primary rounded-full text-[9px] font-black uppercase tracking-widest transition-all border border-neutral-200 dark:border-neutral-700"
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>

                                {file && (
                                    <div className="bg-brand-primary/5 p-1 sm:p-1.5 rounded-lg border border-brand-primary/20 flex items-center justify-between animate-slide-in-up mb-2">
                                        <div className="flex items-center gap-1.5 overflow-hidden">
                                            <Icon name="code" className="w-3 h-3 text-brand-primary flex-shrink-0" />
                                            <span className="text-[9px] font-bold text-brand-primary truncate">{file.name}</span>
                                        </div>
                                        <button onClick={() => setFile(null)} className="text-brand-primary/40 hover:text-brand-primary"><Icon name="close" className="w-3 h-3" /></button>
                                    </div>
                                )}

                                {isUrlInputOpen && (
                                    <div className="px-2 pb-2 animate-slide-in-up">
                                        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-xl border border-blue-100 dark:border-blue-800">
                                            <Icon name="globe" className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                            <input 
                                                type="url" 
                                                value={urlContext}
                                                onChange={(e) => setUrlContext(e.target.value)}
                                                placeholder="Pega una URL para que la IA la analice (ej: https://apple.com)"
                                                className="flex-1 bg-transparent border-none focus:ring-0 text-[10px] sm:text-xs text-blue-800 dark:text-blue-300 font-medium"
                                            />
                                            <button onClick={() => setIsUrlInputOpen(false)} className="text-blue-400 hover:text-blue-600"><Icon name="close" className="w-3 h-3" /></button>
                                        </div>
                                    </div>
                                )}

                                <div className="relative flex items-center gap-1 sm:gap-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl sm:rounded-2xl p-1 shadow-inner border border-transparent focus-within:border-brand-primary/30 min-h-[44px]">
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="*" />
                                    <button onClick={() => fileInputRef.current?.click()} className="p-1.5 sm:p-2 text-neutral-400 hover:text-brand-primary rounded-full transition-colors" title="Adjuntar código o TXT"><Icon name="upload" className="w-4 h-4 sm:w-5 sm:h-5"/></button>
                                    
                                    <input type="file" ref={imageInputRef} className="hidden" onChange={handleImageUpload} accept="image/*" />
                                    <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} className="p-1.5 sm:p-2 text-neutral-400 hover:text-brand-primary rounded-full transition-colors" title="Subir imagen">
                                        {uploadingImage ? <Spinner className="!w-3.5 !h-3.5 !p-0" /> : <Icon name="image" className="w-4 h-4 sm:w-5 sm:h-5" />}
                                    </button>

                                    <button 
                                        onClick={() => setIsUrlInputOpen(!isUrlInputOpen)} 
                                        className={`p-1.5 sm:p-2 rounded-full transition-all ${isUrlInputOpen ? 'bg-blue-100 text-blue-600' : 'text-neutral-400 hover:text-blue-500'}`}
                                        title="Referencia de URL Externa"
                                    >
                                        <Icon name="globe" className="w-4 h-4 sm:w-5 sm:h-5"/>
                                    </button>

                                    <Textarea 
                                        value={prompt} 
                                        onChange={e => setPrompt(e.target.value)} 
                                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleGenerate())}
                                        placeholder="Pide cambios..." 
                                        className="!mt-0 w-full bg-transparent border-none focus:ring-0 text-[11px] sm:text-sm py-1 max-h-12 sm:max-h-32 min-h-0"
                                        rows={1}
                                        disabled={activeSession.isGenerating}
                                    />
                                    <button onClick={handleGenerate} disabled={activeSession.isGenerating || (!prompt.trim() && !file)} className="p-2 sm:p-3 bg-brand-primary text-white rounded-lg sm:rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex-shrink-0">
                                        <Icon name={activeSession.isGenerating ? "sync" : "send"} className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeSession.isGenerating ? 'animate-spin' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Preview/Code Pane - Optimized for Mobile Split */}
                        <div className={`flex flex-col overflow-hidden bg-white dark:bg-[#050505] ${isPreviewFullScreen ? 'fixed inset-0 z-[999999999] w-screen h-screen !max-w-none !max-h-none p-0' : 'relative w-full lg:w-1/2 h-[50%] lg:h-full'} min-h-0`}>
                            <div className="p-1 sm:p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-nowrap justify-between items-center bg-white dark:bg-neutral-900 z-30 flex-none gap-1 sm:gap-2 overflow-x-auto custom-scrollbar sticky top-0 backdrop-blur-md">
                                <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg sm:rounded-xl flex-shrink-0">
                                    <button onClick={() => setRightPaneView('preview')} className={`px-2 sm:px-4 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${rightPaneView === 'preview' ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500'}`}>Preview</button>
                                    <button onClick={() => setRightPaneView('code')} className={`px-2 sm:px-4 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${rightPaneView === 'code' ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500'}`}>Código</button>
                                </div>
                                        <div className="flex gap-1 items-center flex-shrink-0">
                                            {/* SELECTOR DE VERSIONES (Estilo Google AI Studio) */}
                                            {activeFile?.versions && activeFile.versions.length > 1 && (
                                                <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-tighter">Versión</span>
                                                    <select 
                                                        value={activeFile.currentVersionIndex ?? 0}
                                                        onChange={(e) => {
                                                            const idx = parseInt(e.target.value);
                                                            updateActiveFile({
                                                                currentVersionIndex: idx,
                                                                code: activeFile.versions![idx]
                                                            });
                                                        }}
                                                        className="bg-transparent border-none text-[10px] font-black text-brand-primary focus:ring-0 p-0 cursor-pointer"
                                                    >
                                                        {activeFile.versions.map((_, i) => (
                                                            <option key={i} value={i} className="bg-white dark:bg-neutral-900">v{i + 1}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            {/* BOTONES UNDO/REDO PARA VERSIONES */}
                                            <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg">
                                        <button 
                                            onClick={handleUndo}
                                            disabled={(activeFile?.currentVersionIndex ?? 0) <= 0}
                                            className={`p-1 transition-colors ${(activeFile?.currentVersionIndex ?? 0) <= 0 ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-400 hover:text-brand-primary'}`} 
                                            title="Undo"
                                        >
                                            <Icon name="undo" className="w-3.5 h-3.5"/>
                                        </button>
                                        <button 
                                            onClick={handleRedo}
                                            disabled={(activeFile?.currentVersionIndex ?? 0) >= (activeFile?.versions?.length ?? 0) - 1}
                                            className={`p-1 transition-colors ${(activeFile?.currentVersionIndex ?? 0) >= (activeFile?.versions?.length ?? 0) - 1 ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-400 hover:text-brand-primary'}`} 
                                            title="Redo"
                                        >
                                            <Icon name="redo" className="w-3.5 h-3.5"/>
                                        </button>
                                    </div>

                                    {/* BOTÓN VISUALIZAR CÓDIGO HTML */}
                                    <Button onClick={() => setIsDirectPasteModalOpen(true)} variant="secondary" size="sm" className="bg-brand-accent/10 border-brand-accent/20 text-brand-primary font-black uppercase text-[7px] sm:text-[9px] px-1.5 sm:px-2 h-7 sm:h-8">
                                        <Icon name="image" className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Visualizar Código HTML</span><span className="sm:hidden">Visualizar</span>
                                    </Button>
                                    
                                    <button onClick={() => setIsMobileView(!isMobileView)} className={`p-1 sm:p-1.5 rounded-lg transition-all ${isMobileView ? 'text-brand-primary bg-brand-primary/10' : 'text-neutral-400'}`} title="Vista móvil"><Icon name="phone" className="w-3.5 h-3.5 sm:w-5 sm:h-5"/></button>
                                    <button onClick={handlePreview} className="p-1 sm:p-1.5 text-neutral-400 hover:text-brand-primary" title="Pestaña nueva"><Icon name="externalLink" className="w-3.5 h-3.5 sm:w-5 sm:h-5"/></button>
                                    <button onClick={() => setIsPreviewFullScreen(!isPreviewFullScreen)} className="p-1 sm:p-1.5 text-neutral-400 hover:text-brand-primary" title="Full screen"><Icon name={isPreviewFullScreen ? "close" : "expand"} className="w-3.5 h-3.5 sm:w-5 sm:h-5"/></button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-hidden relative bg-neutral-200 dark:bg-black/40 min-h-0">
                                {rightPaneView === 'preview' ? (
                                    <div className="p-1 sm:p-4 h-full">
                                        <div 
                                            className={`mx-auto h-full bg-white shadow-2xl transition-all duration-500 overflow-hidden origin-top ${isMobileView ? 'w-[280px] sm:w-[375px] rounded-[1.5rem] sm:rounded-[3rem] border-[6px] sm:border-[12px] border-neutral-900' : 'w-full rounded-lg sm:rounded-2xl'}`}
                                        >
                                            {activeFile?.code ? (
                                                <iframe title="preview" srcDoc={getEnhancedCode(activeFile.code)} className="w-full h-full border-none" />
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-full text-neutral-400 opacity-30 text-center p-2 sm:p-4">
                                                    <Icon name="code" className="w-8 h-8 sm:w-20 sm:h-20 mb-2 sm:mb-4" />
                                                    <p className="text-[10px] sm:text-xl font-bold uppercase tracking-widest">Preview</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full w-full overflow-auto custom-scrollbar bg-neutral-900 shadow-inner flex group relative">
                                        {/* Numeración de Líneas Dinámica */}
                                        <div className="sticky left-0 top-0 h-full bg-black/30 text-neutral-500 text-[8px] sm:text-[10px] font-mono text-right p-3 pr-2 select-none border-r border-white/5 min-w-[1.8rem] sm:min-w-[3.5rem] z-20">
                                            {(activeFile?.code || '').split('\n').map((_, i) => (
                                                <div key={i} className="leading-[1.5] h-[1.5em]">{i + 1}</div>
                                            ))}
                                        </div>
                                        <div className="flex-1 p-0 relative min-h-full">
                                            <div className="absolute top-1 sm:top-2 right-1 sm:right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30 sticky">
                                                <button 
                                                    onClick={() => saveVersion(activeFile?.code || '')} 
                                                    className="p-1 sm:p-2 bg-brand-primary/20 hover:bg-brand-primary/40 text-brand-primary rounded-md sm:rounded-lg backdrop-blur-md transition-all"
                                                    title="Guardar Versión"
                                                >
                                                    <Icon name="save" className="w-3 h-3 sm:w-4 sm:h-4"/>
                                                </button>
                                                <button onClick={handleCopy} className="p-1 sm:p-2 bg-white/10 hover:bg-white/20 text-white rounded-md sm:rounded-lg backdrop-blur-md transition-all" title="Copiar código"><Icon name={copied ? "check" : "copy"} className="w-3 h-3 sm:w-4 sm:h-4"/></button>
                                            </div>
                                            <textarea 
                                                value={activeFile?.code || ''}
                                                onChange={(e) => {
                                                    const newCode = e.target.value;
                                                    updateActiveFile({ code: newCode });
                                                }}
                                                onBlur={(e) => {
                                                    saveVersion(e.target.value);
                                                }}
                                                spellCheck={false}
                                                rows={(activeFile?.code || '').split('\n').length || 1}
                                                className="w-full h-auto min-h-full bg-transparent border-none focus:ring-0 font-mono text-[9px] sm:text-xs text-white leading-[1.5] whitespace-pre selection:bg-brand-primary/30 m-0 p-3 resize-none outline-none overflow-hidden"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-1.5 sm:p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-dark-surface flex flex-nowrap justify-between items-center gap-1.5 sm:gap-4 flex-none sticky bottom-0 z-30 overflow-x-auto scrollbar-hide">
                                <div className="flex gap-1 w-auto overflow-x-auto no-scrollbar flex-shrink-0">
                                    <button onClick={() => setAssignModalOpen(true)} disabled={!activeFile?.code} className="flex-none px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-[7px] sm:text-[10px] font-black uppercase text-neutral-600 dark:text-neutral-300 flex items-center gap-1 hover:bg-neutral-200 transition-all"><Icon name="folder" className="w-2.5 h-2.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">Proyecto</span><span className="sm:hidden">Proj</span></button>
                                    <button onClick={handleDownloadZip} disabled={!activeFile?.code} className="flex-none px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-[7px] sm:text-[10px] font-black uppercase text-neutral-600 dark:text-neutral-300 flex items-center gap-1 hover:bg-neutral-200 transition-all"><Icon name="box" className="w-2.5 h-2.5 sm:w-4 sm:h-4"/> ZIP</button>
                                    <button onClick={handleDownload} disabled={!activeFile?.code} className="flex-none px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-[7px] sm:text-[10px] font-black uppercase text-neutral-600 dark:text-neutral-300 flex items-center gap-1 hover:bg-neutral-200 transition-all"><Icon name="upload" className="w-2.5 h-2.5 sm:w-4 sm:h-4 transform rotate-180"/> HTML</button>
                                </div>
                                <Button onClick={handleOpenPublishModal} disabled={!activeFile?.code} className="w-auto h-9 sm:h-12 px-3 sm:px-8 bg-green-600 hover:bg-green-700 text-white border-none shadow-xl transform hover:scale-105 transition-all font-black text-[8px] sm:text-xs uppercase tracking-widest flex-shrink-0">
                                    <Icon name="rocket" className="w-3 h-3 sm:w-5 sm:h-5"/> Publicar Web
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-400">
                        <Icon name="code" className="w-16 h-16 sm:w-20 sm:h-20 mb-4 opacity-10" />
                        <p className="text-sm sm:text-xl font-bold uppercase tracking-widest opacity-20">Selecciona o crea una sesión</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WebProgrammer;