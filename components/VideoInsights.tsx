
import React, { useState, useCallback, useContext, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import { AppContext } from '../context/AppContext';
import Input from './ui/Input';
import Button from './ui/Button';
import Card from './ui/Card';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import type { AiTask } from '../types';
import Modal from './ui/Modal';
import Textarea from './ui/Textarea';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { analyzeVideoData } from '../services/geminiService';
import { getPlanConfig } from '../types';

const VideoInsights: React.FC = () => {
    const { t, language } = useTranslation();
    const { 
        startAiTask, 
        aiTaskHistory, 
        deleteAiTask, 
        projects, 
        addHubPost, 
        sendArticleToProject, 
        currentUser, 
        setToastNotification,
        checkMediaLimit,
        releaseMediaLimit,
        userProfile,
        userUsage
    } = useContext(AppContext);
    
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const [selectedTask, setSelectedTask] = useState<AiTask | null>(null);
    const [isSendToProjectModalOpen, setSendToProjectModalOpen] = useState(false);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).ai_video_analysis_monthly || 2;
    const used = userUsage?.counters?.monthly_videos_analyzed || 0;

    const processFile = (file: File) => {
        if (file && file.type.startsWith('video/')) {
            if (file.size > 20 * 1024 * 1024) {
                setToastNotification({ 
                    title: "Video muy grande", 
                    message: "Este video es demasiado pesado para transcripción directa. Usa un clip más corto o comprimido (máx 20MB).", 
                    icon: "close" 
                });
                return;
            }
            setVideoFile(file);
        } else {
            setToastNotification({ title: "Archivo no válido", message: "Sube un archivo de video (MP4, WebM).", icon: "close" });
        }
    };

    const handleAnalysis = async (mode: 'analysis' | 'transcription' = 'analysis') => {
        if (!videoFile) {
            setError("Sube un video.");
            return;
        }

        const isBlocked = await checkMediaLimit('video');
        if (isBlocked) return;

        setIsLoading(true);
        setError(null);
        setLoadingText(mode === 'transcription' ? 'Transcribiendo audio...' : 'Analizando video...');
        
        try {
            let resultText = "";
            let finalUrl = "";

            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onload = () => {
                    const result = reader.result as string;
                    const base64 = result.split(',')[1]; 
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(videoFile);
            });

            const base64Data = await base64Promise;
            resultText = await analyzeVideoData(base64Data, videoFile.type, mode, language);
            
            if (currentUser) {
                 const uploaded = await uploadWithQuotaCheck({
                     userId: currentUser.uid,
                     data: videoFile,
                     sizeBytes: videoFile.size,
                     path: safeStoragePath('video-uploads', currentUser.uid, `${Date.now()}_${videoFile.name}`),
                     metadata: { contentType: videoFile.type || 'video/mp4' },
                     plan: userProfile.plan
                 });
                 finalUrl = uploaded.url;
            }

            await startAiTask({
                type: 'video_analysis',
                prompt: `${mode === 'transcription' ? 'Transcripción' : 'Análisis'} de: ${videoFile.name}`,
                videoUrl: finalUrl,
                resultText: resultText,
                status: 'completed' 
            });
            
            setVideoFile(null);
            setToastNotification({ title: 'Análisis Exitoso', message: 'Se ha descontado 1 crédito de medios.', icon: 'check' });

        } catch (e: any) {
            console.error(e);
            setError(`Error: ${e.message}`);
            // REGLA: Liberar límite si falla después de consumir
            await releaseMediaLimit('video');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    };
    
    const myTasks = aiTaskHistory
        .filter(t => t.type === 'video_analysis')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
        <div className="p-6 space-y-8 h-full overflow-y-auto animate-fade-in pb-32 custom-scrollbar">
             <Modal isOpen={isSendToProjectModalOpen} onClose={() => setSendToProjectModalOpen(false)} title="Enviar a Proyecto">
                <div className="space-y-4">
                    <p>Selecciona un proyecto:</p>
                    <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                     <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setSendToProjectModalOpen(false)}>Cancelar</Button>
                        <Button onClick={() => { sendArticleToProject({id: `vid-${Date.now()}`, title: 'Video Analysis', summary: selectedTask?.resultText || '', content: selectedTask?.resultText || '', goatifyTakeaway: 'AI Analysis', source: 'Video', publicationDate: new Date().toISOString(), imageUrl: ''}, targetProjectId); setSendToProjectModalOpen(false); }}>Guardar</Button>
                    </div>
                </div>
             </Modal>

            <div className="flex justify-between items-center mb-2 px-1">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">Perspectivas de Video</h1>
                    <p className="text-xs text-neutral-500 font-medium">Auditoría multimodal profunda.</p>
                </div>
                <div className="bg-brand-primary/5 px-4 py-2 rounded-2xl border border-brand-primary/10 text-right">
                    <p className="text-[9px] font-black uppercase text-brand-primary tracking-widest">IA Video (Mes)</p>
                    <p className="text-xs font-bold text-neutral-800 dark:text-white">{used} de {limit}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <Card className="space-y-6 bg-white dark:bg-dark-surface p-6 rounded-3xl border border-light-border dark:border-dark-border shadow-lg relative overflow-hidden">
                    {isLoading && (
                        <div className="absolute inset-0 bg-white/80 dark:bg-neutral-900/80 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
                            <Spinner text={loadingText || "Procesando..."} />
                            <p className="text-[10px] text-neutral-400 mt-2 font-bold uppercase tracking-widest animate-pulse">Analizando cada fotograma</p>
                        </div>
                    )}
                    
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-full text-red-600"><Icon name="video" className="w-6 h-6"/></div>
                        <div><h3 className="text-xl font-bold text-neutral-900 dark:text-white">Analizador de Video</h3><p className="text-sm text-neutral-500">Sube tu video para auditoría.</p></div>
                    </div>
                    
                    <div 
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if(f) processFile(f); }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-10 border-4 border-dashed rounded-3xl text-center cursor-pointer transition-all duration-300 group ${isDragging ? 'border-brand-primary bg-brand-accent/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-brand-primary/50'}`}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) processFile(f); }} accept="video/*,audio/*" />
                        <Icon name="upload" className="mx-auto h-12 w-12 text-neutral-300 group-hover:text-brand-primary transition-colors mb-3" />
                        <p className="font-bold text-neutral-500 uppercase text-xs tracking-widest">Arrastra un video o audio aquí o haz clic</p>
                        {videoFile && <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2"><Icon name="check" className="w-4 h-4"/> {videoFile.name}</div>}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mt-6">
                        <button onClick={() => handleAnalysis('analysis')} disabled={isLoading || !videoFile} className="w-full py-4 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-brand-secondary transition-all">
                            <Icon name="brain" className="w-4 h-4"/> Analizar
                        </button>
                        <button onClick={() => handleAnalysis('transcription')} disabled={isLoading || !videoFile} className="w-full py-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-xl font-bold flex items-center justify-center gap-2 border border-neutral-300 hover:bg-neutral-200 transition-all">
                            <Icon name="mic" className="w-4 h-4"/> Transcribir
                        </button>
                    </div>
                    
                    {error && <p className="text-red-500 text-xs font-bold text-center bg-red-50 dark:bg-red-900/10 p-2 rounded-lg border border-red-100">{error}</p>}
                </Card>

                <div className="space-y-4">
                     <h3 className="font-bold text-xl flex items-center gap-2 px-1 text-neutral-800 dark:text-white"><Icon name="history" className="w-5 h-5 text-brand-primary"/> Historial de Auditorías</h3>
                     <div className="space-y-4">
                        {myTasks.length > 0 ? myTasks.map(task => (
                            <Card key={task.id} className="p-5 border-neutral-100 dark:border-neutral-800 shadow-sm transition-all hover:shadow-md animate-fade-in bg-white dark:bg-dark-surface">
                                <div className="flex justify-between items-start mb-3">
                                    <p className="font-black text-xs uppercase tracking-widest text-brand-primary truncate max-w-[80%]">{task.prompt}</p>
                                    <button onClick={() => deleteAiTask(task)} className="text-neutral-300 hover:text-red-500 p-1 transition-colors"><Icon name="trash" className="w-4 h-4"/></button>
                                </div>
                                {task.resultText && (
                                    <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 max-h-60 overflow-y-auto mb-4 custom-scrollbar border border-neutral-100 dark:border-neutral-800">
                                        <ChatMessageRenderer text={task.resultText} />
                                    </div>
                                )}
                                <div className="flex gap-2">
                                     <Button size="sm" variant="secondary" className="text-[10px] uppercase font-black tracking-widest" onClick={() => { setSelectedTask(task); setTargetProjectId(projects[0]?.id || ''); setSendToProjectModalOpen(true); }}><Icon name="send" className="w-3.5 h-3.5"/> Guardar en Proyecto</Button>
                                </div>
                            </Card>
                        )) : (
                            <div className="py-20 text-center opacity-30 italic flex flex-col items-center">
                                <Icon name="video" className="w-12 h-12 mb-2"/>
                                <p className="text-sm font-bold uppercase">Sin registros previos</p>
                            </div>
                        )}
                     </div>
                </div>
            </div>
        </div>
    );
};

export default VideoInsights;
