
import React, { useState, useContext, useRef, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import type { Project, Document } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Icon from './Icon';
import Modal from './ui/Modal';
import { analyzeDocuments } from '../services/geminiService';
import Spinner from './ui/Spinner';
import { getPlanConfig } from '../types';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import { canUseLimit } from '../services/subscriptionService';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';

interface DocumentsViewProps {
    project: Project;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const dataURItoBlob = (dataURI: string) => {
    try {
        const byteString = atob(dataURI.split(',')[1]);
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
    } catch (e) {
        console.error("Error converting data URI to blob", e);
        return null;
    }
};

const DocumentsView: React.FC<DocumentsViewProps> = ({ project }) => {
    const { t, language } = useTranslation();
    const { updateProject, rewardFileUpload, userProfile, userUsage, checkQueryLimit, setCurrentView, setToastNotification, setProModalOpen } = useContext(AppContext);
    const [isAnalysisModalOpen, setAnalysisModalOpen] = useState(false);
    const [analysisResult, setAnalysisResult] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFiles = async (files: FileList | null) => {
        if (!files) return;
        
        const fileArray = Array.from(files);
        let totalSize = 0;
        for (const f of fileArray) totalSize += f.size;

        try {
            const hasSpace = await canUseLimit(userProfile.uid, 'storage', totalSize, userProfile.plan);
            if (!hasSpace) {
                const err: any = new Error('Espacio insuficiente');
                err.code = 'PLAN_LIMIT_REACHED';
                throw err;
            }
        } catch (error: any) {
            if (error.code === 'PLAN_LIMIT_REACHED') {
                setProModalOpen(true);
                setToastNotification({ title: "Límite Alcanzado", message: "No tienes suficiente espacio.", icon: "lock" });
            } else {
                setToastNotification({ title: "Error", message: "No se pudo verificar el almacenamiento.", icon: "error" });
            }
            return;
        }

        setIsUploading(true);
        
        const newDocs: Document[] = [];

        try {
            for (const file of fileArray) {
                let content = '';
                // If it's a small text file (< 500KB), store content directly for easier analysis
                if (file.type.startsWith('text/') && file.size < 500 * 1024) {
                    content = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });
                } else {
                    // Upload to Firebase Storage with centralized Drive quota.
                    const uploaded = await uploadWithQuotaCheck({
                        userId: userProfile.uid,
                        data: file,
                        path: safeStoragePath('projects', userProfile.uid, project.id, 'documents', `${Date.now()}_${file.name}`),
                        sizeBytes: file.size,
                        metadata: { contentType: file.type || 'application/octet-stream' },
                        plan: userProfile.plan
                    });
                    content = uploaded.url;
                }

                newDocs.push({
                    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    name: file.name,
                    content: content,
                    uploadedAt: new Date().toISOString(),
                    size: file.size,
                    fileType: file.type || 'unknown',
                });
            }

            await updateProject(project.id, { documents: [...newDocs, ...(project.documents || [])] });
            rewardFileUpload();
            setToastNotification({
                title: "Archivos Subidos",
                message: `${newDocs.length} archivo(s) subido(s) correctamente.`,
                icon: "check"
            });
        } catch (error) {
            console.error("Error uploading files:", error);
            setToastNotification({
                title: "Error",
                message: "Hubo un problema al subir los archivos.",
                icon: "close"
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleAnalyze = async () => {
        const textDocs = (project.documents || []).filter(d => d.fileType?.startsWith('text/'));
        if (textDocs.length === 0) { alert("No hay documentos de texto para analizar."); return; }
        const isBlocked = await checkQueryLimit();
        if (isBlocked) return;
        setAnalysisModalOpen(true); setIsAnalyzing(true);
        try {
            const result = await analyzeDocuments(textDocs, language);
            setAnalysisResult(result);
        } catch (error) { setAnalysisResult('Error durante el análisis.'); } finally { setIsAnalyzing(false); }
    };

    const handleViewDocument = (doc: Document) => {
        if (doc.fileType === 'interactive_presentation') {
            setCurrentView('aiStudio');
            window.location.hash = `aiStudio/presentations/present/${doc.content}`;
            return;
        }
        
        // Si el contenido es una URL (empieza por http)
        if (doc.content?.startsWith('http')) {
            if (doc.fileType === 'text/html') {
                window.open(doc.content, '_blank');
                return;
            }
            if (doc.fileType === 'application/zip' || doc.fileType?.includes('zip')) {
                const a = document.createElement('a');
                a.href = doc.content;
                a.download = doc.name;
                a.click();
                return;
            }
        }

        if (doc.fileType === 'application/pdf') {
            try {
                const blob = dataURItoBlob(doc.content);
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                } else { setViewingDoc(doc); }
            } catch (e) { setViewingDoc(doc); }
        } else { setViewingDoc(doc); }
    };

    const getDocIcon = (fileType: string): React.ComponentProps<typeof Icon>['name'] => {
        if (fileType === 'interactive_presentation') return 'rocket';
        if (fileType.startsWith('image/')) return 'image';
        if (fileType.startsWith('video/')) return 'video';
        return 'folder';
    };

    const getIconColor = (type: string) => {
        if (type === 'interactive_presentation') return 'bg-brand-primary text-white';
        if (type.includes('pdf')) return 'text-red-500 bg-red-50';
        if (type.includes('image')) return 'text-blue-500 bg-blue-50';
        if (type.includes('video')) return 'text-purple-500 bg-purple-50';
        return 'text-brand-primary bg-brand-primary/5';
    };

    const planConfig = getPlanConfig(userProfile.plan);
    const chatLimit = (planConfig.limits as any).ai_chat_daily_queries || 30;
    const chatUsed = userUsage?.counters?.daily_chat_count || 0;

    return (
        <div className="space-y-6 animate-fade-in">
            <style>{`
                .presentation-shortcut {
                    border: 2px solid #8b5cf6 !important;
                    background: linear-gradient(135deg, #ffffff 0%, #f3f0ff 100%) !important;
                }
                .dark .presentation-shortcut {
                    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%) !important;
                    border-color: #6d28d9 !important;
                }
            `}</style>
            <Modal isOpen={isAnalysisModalOpen} onClose={() => setAnalysisModalOpen(false)} title="Análisis de Inteligencia">
                {isAnalyzing ? <Spinner text="Analizando..." /> : <div className="whitespace-pre-wrap"><ChatMessageRenderer text={analysisResult} /></div>}
            </Modal>
            <Modal isOpen={!!viewingDoc} onClose={() => setViewingDoc(null)} title={viewingDoc?.name || ''}>
                {viewingDoc?.fileType?.startsWith('image/') ? ( 
                    <img src={viewingDoc.content} alt={viewingDoc.name} className="max-w-full h-auto rounded-lg mx-auto max-h-[70vh]" /> 
                ) : viewingDoc?.fileType?.startsWith('video/') ? ( 
                    <video src={viewingDoc.content} controls className="max-w-full h-auto rounded-lg mx-auto max-h-[70vh]" /> 
                ) : viewingDoc?.content?.startsWith('http') ? (
                    <div className="p-8 text-center space-y-4">
                        <Icon name={viewingDoc.fileType.includes('zip') ? 'box' : 'globe'} className="w-16 h-16 mx-auto text-brand-primary opacity-20" />
                        <p className="text-sm text-neutral-500">Este archivo está guardado en la nube.</p>
                        <div className="flex justify-center gap-3">
                            <Button onClick={() => window.open(viewingDoc.content, '_blank')}>
                                <Icon name="externalLink" className="w-4 h-4" /> {viewingDoc.fileType.includes('zip') ? 'Descargar Archivo' : 'Abrir en Nueva Pestaña'}
                            </Button>
                        </div>
                    </div>
                ) : ( 
                    <pre className="whitespace-pre-wrap bg-light-bg dark:bg-dark-bg p-4 rounded-lg max-h-[60vh] overflow-auto font-sans text-sm">{viewingDoc?.content}</pre> 
                )}
            </Modal>
            <div className="flex justify-between items-center px-1">
                <div><h2 className="text-2xl font-bold">{t('documents')}</h2><p className="text-xs text-neutral-500 font-medium">Gestión de archivos del proyecto.</p></div>
                <div className="flex gap-4 items-center">
                    <div className="bg-brand-primary/5 px-4 py-2 rounded-2xl border border-brand-primary/10 text-right hidden sm:block"><p className="text-[9px] font-black uppercase text-brand-primary tracking-widest leading-none">Análisis</p><p className="text-xs font-bold text-neutral-800 dark:text-white">{chatUsed} de {chatLimit}</p></div>
                    <Button onClick={handleAnalyze} disabled={!project.documents?.length} className="shadow-lg"><Icon name="brain" className="w-5 h-5" /> Analizar</Button>
                </div>
            </div>
            <Card onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }} onClick={() => !isUploading && fileInputRef.current?.click()} className={`p-12 border-4 border-dashed text-center cursor-pointer transition-all duration-300 ${isDragging ? 'border-brand-primary bg-brand-accent/20 scale-[1.01]' : 'border-light-border dark:border-dark-border hover:border-brand-secondary hover:bg-neutral-50 dark:hover:bg-neutral-800/50'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input type="file" ref={fileInputRef} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} accept=".txt,.pdf,.html,.htm,.jpg,.jpeg,.png"/>
                {isUploading ? (
                    <div className="flex flex-col items-center">
                        <Spinner className="w-12 h-12 text-brand-primary mb-2" />
                        <p className="font-semibold text-brand-primary">Subiendo archivos...</p>
                    </div>
                ) : (
                    <>
                        <Icon name="upload" className={`mx-auto h-12 w-12 mb-2 transition-colors ${isDragging ? 'text-brand-primary' : 'text-neutral-400'}`}/>
                        <p className="font-semibold">{t('uploadDocument')}</p>
                        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Arrastra archivos aquí o haz clic (TXT, PDF, PNG, JPG)</p>
                    </>
                )}
            </Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
                {(project.documents || []).map(doc => {
                    const isPres = doc.fileType === 'interactive_presentation';
                    return (
                        <Card key={doc.id} className={`p-4 flex flex-col justify-between group hover:shadow-xl transition-all border border-neutral-100 dark:border-neutral-800 ${isPres ? 'presentation-shortcut animate-pulse-subtle' : ''}`}>
                            <div onClick={() => handleViewDocument(doc)} className="flex items-start gap-3 flex-grow overflow-hidden cursor-pointer">
                                <div className={`p-3 rounded-xl shadow-sm ${getIconColor(doc.fileType || '')}`}><Icon name={getDocIcon(doc.fileType || '')} className="w-6 h-6 flex-shrink-0" /></div>
                                <div className="overflow-hidden min-w-0 flex-1">
                                    <p className={`font-bold truncate transition-colors ${isPres ? 'text-brand-primary dark:text-brand-accent' : 'group-hover:text-brand-primary'}`}>{doc.name}</p>
                                    <p className="text-[10px] font-black uppercase text-neutral-400">{isPres ? 'Presentación Interactiva' : (doc.fileType?.split('/')[1] || doc.fileType)}</p>
                                </div>
                            </div>
                            <div className="flex justify-between items-end mt-4 pt-2 border-t border-light-border dark:border-dark-border">
                                <div className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary font-bold uppercase tracking-widest"><p>{new Date(doc.uploadedAt).toLocaleDateString()}</p><p className="text-brand-primary">{isPres ? 'ACCESO DIRECTO' : formatBytes(doc.size)}</p></div>
                                <Button onClick={(e) => { e.stopPropagation(); updateProject(project.id, { documents: project.documents.filter(d => d.id !== doc.id) }); }} variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 !p-2"><Icon name="trash" className="w-5 h-5"/></Button>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

export default DocumentsView;
