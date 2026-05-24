
import React, { useState, useContext, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';
import type { AspectRatio, AiTask, Document } from '../types';
import Spinner from './ui/Spinner';
import { AppContext } from '../context/AppContext';
import Modal from './ui/Modal';
import Textarea from './ui/Textarea';
import Button from './ui/Button';
import { generateImage } from '../services/geminiService';
import { getPlanConfig } from '../types';

const MediaGenerator: React.FC = () => {
    const { t } = useTranslation();
    const { startAiTask, aiTaskHistory, sendMediaToProject, addHubPost, checkMediaLimit, releaseMediaLimit, deleteAiTask, setToastNotification, projects, uploadImageToStorage, selectedProjectId, updateProject, userUsage, userProfile, startupPrompt, setStartupPrompt, createNotification, setImageToEditUrl } = useContext(AppContext);
    
    // items is an array where the user can define multiple prompts to be processed in background
    const [items, setItems] = useState<{prompt: string, aspectRatio: AspectRatio}[]>([{ prompt: '', aspectRatio: '1:1' }]);
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    
    const [sharingTask, setSharingTask] = useState<AiTask | null>(null);
    const [sendingTask, setSendingTask] = useState<AiTask | null>(null);
    
    const [targetProjectId, setTargetProjectId] = useState(selectedProjectId || projects[0]?.id || '');
    const [shareComment, setShareComment] = useState('');

    // --- LISTENER DE REDIRECCIÓN INTELIGENTE DESDE CHAT AVANZADO ---
    useEffect(() => {
        if (startupPrompt && !isGenerating) {
            setItems([{ prompt: startupPrompt, aspectRatio: '1:1' }]);
            setStartupPrompt(null);
            setToastNotification({
                title: "Prompt Cargado",
                message: "Shivo ha transferido tu idea. Solo presiona 'Generar'.",
                icon: "ai"
            });
        }
    }, [startupPrompt]);

    const executeBatchGeneration = async (batch: { prompt: string, aspectRatio: AspectRatio }[]) => {
        const validBatch = batch.filter(b => b.prompt.trim());
        if (validBatch.length === 0) return;
        
        setIsGenerating(true);
        // Clear UI so user knows they can add new or leave
        setItems([{ prompt: '', aspectRatio: '1:1' }]); 
        
        setToastNotification({
            title: 'Generación Iniciada',
            message: `Procesando ${validBatch.length} imagen(es) en segundo plano. Puedes minimizar o ir a otra sección.`,
            icon: 'clock'
        });

        let anySuccess = false;

        for (let i = 0; i < validBatch.length; i++) {
            const currentItem = validBatch[i];
            const targetPrompt = currentItem.prompt;
            const aspect = currentItem.aspectRatio;

            try {
                const isBlocked = await checkMediaLimit('image');
                if (isBlocked) {
                     setToastNotification({ title: 'Límite', message: 'Límite mensual alcanzado.', icon: 'close' });
                     break;
                }

                const base64ImageUri = await generateImage(targetPrompt, aspect);
                let permanentUrl = '';
                
                try {
                    permanentUrl = await uploadImageToStorage(base64ImageUri);
                } catch (uploadError) {
                    await releaseMediaLimit('image');
                    throw new Error("Error al subir al almacenamiento.");
                }

                const size = Math.round((base64ImageUri.length * 3) / 4);
                await startAiTask({
                    type: 'image',
                    prompt: targetPrompt,
                    status: 'completed',
                    resultUrl: permanentUrl, 
                    aspectRatio: aspect,
                    size
                });

                if (selectedProjectId) {
                    const project = projects.find(p => p.id === selectedProjectId);
                    if (project) {
                        const newDoc: Document = {
                            id: `ai-img-${Date.now()}`,
                            name: `AI_Gen_${targetPrompt.substring(0, 15).replace(/\s+/g, '_')}.png`,
                            content: permanentUrl,
                            uploadedAt: new Date().toISOString(),
                            size: size,
                            fileType: 'image/png'
                        };
                        await updateProject(project.id, { documents: [newDoc, ...(project.documents || [])] });
                    }
                }
                
                anySuccess = true;
            } catch (e: any) {
                await releaseMediaLimit('image');
                console.error("Generation cycle failed", e);
                setToastNotification({
                    title: 'Error Individual',
                    message: `Fallo en imagen ${i + 1}: ${e.message}`,
                    icon: 'close'
                });
            }
        }

        setIsGenerating(false);
        setLoadingStep('');
        
        if (anySuccess) {
            setToastNotification({
                title: '¡Generación Completa!',
                message: 'Verifica tu historial de imágenes o nube.',
                icon: 'check'
            });
            // Opcional: Usar createNotification si existe, para notificar al hub
            await createNotification(userProfile.uid, {
                type: 'general',
                text: `Se completaron tus ${validBatch.length} generaciones de imágenes.`,
                link: '/#media',
                timestamp: new Date().toISOString()
            }).catch(console.error);
        }
    };

    const handleGenerate = () => executeBatchGeneration(items);
    
    const updateItem = (index: number, key: keyof typeof items[0], value: string) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [key]: value } as any;
        setItems(newItems);
    };

    const addItem = () => setItems([...items, { prompt: '', aspectRatio: '1:1' }]);
    const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
    
    const handleDownload = async (task: AiTask) => {
        if (!task.resultUrl) return;
        const fileExtension = 'png';

        try {
            const response = await fetch(task.resultUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${task.prompt.substring(0, 20).replace(/\s+/g, '_')}.${fileExtension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);

            // TAMBIEN GUARDAR EN DRIVE AL DESCARGAR SI NO ESTABA GUARDADO
            if (selectedProjectId) {
                 const project = projects.find(p => p.id === selectedProjectId);
                 const exists = project?.documents.some(d => d.content === task.resultUrl);
                 if (project && !exists) {
                     const newDoc: Document = {
                        id: `ai-dl-${Date.now()}`,
                        name: `Downloaded_AI_${task.prompt.substring(0, 10)}.png`,
                        content: task.resultUrl,
                        uploadedAt: new Date().toISOString(),
                        size: blob.size,
                        fileType: 'image/png'
                    };
                    updateProject(project.id, { documents: [newDoc, ...(project.documents || [])] });
                 }
            }
        } catch (error) {
            console.error("Download failed:", error);
            window.open(task.resultUrl, '_blank');
        }
    };
    
    const handleShare = () => {
        if (!sharingTask || !sharingTask.resultUrl) return;
        addHubPost(shareComment || sharingTask.prompt, undefined, {
            url: sharingTask.resultUrl,
            type: 'image',
            name: `image_${Date.now()}.png`,
            originalType: 'image/png'
        });
        setToastNotification({ title: 'Compartido', message: 'Imagen publicada en el feed.', icon: 'share' });
        setSharingTask(null);
        setShareComment('');
    };

    const handleSendToProject = () => {
        if (!sendingTask || !targetProjectId || !sendingTask.resultUrl) return;
        
        const mediaObject = {
            resultUrl: sendingTask.resultUrl,
            type: 'image',
            prompt: sendingTask.prompt,
            size: sendingTask.size || 0
        };
        
        sendMediaToProject(mediaObject, targetProjectId);
        setSendingTask(null);
    }
    
    const recentTasks = aiTaskHistory.filter(t => t.type === 'image');
    
    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).ai_images_monthly || 3;
    const used = userUsage?.counters?.monthly_images_used || 0;

    return (
        <div className="animate-fade-in space-y-8 p-6 h-full overflow-y-auto">
            {previewImage && (
                <Modal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} title="Previsualización">
                    <img src={previewImage} className="w-full max-h-[70vh] object-contain rounded-lg" alt="Preview" />
                    <div className="flex justify-end mt-4">
                        <Button 
                            onClick={() => {
                                setPreviewImage(null);
                                setImageToEditUrl(previewImage);
                                window.location.hash = 'aiStudio/imageEditor';
                            }}
                            className="bg-brand-primary"
                        >
                            <Icon name="edit" className="w-4 h-4 mr-2" />
                            Editar Imagen
                        </Button>
                    </div>
                </Modal>
            )}
            {sharingTask && (
                <Modal isOpen={!!sharingTask} onClose={() => setSharingTask(null)} title="Compartir en el Feed">
                    <div className="space-y-4">
                        <p>Añade un comentario a tu creación antes de publicarla.</p>
                        <Textarea value={shareComment} onChange={e => setShareComment(e.target.value)} rows={3} className="my-2" placeholder="Escribe algo..."/>
                        {sharingTask.type === 'image' && <img src={sharingTask.resultUrl} alt="preview" className="max-h-40 rounded-lg mx-auto object-contain bg-black/20" />}
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="secondary" onClick={() => setSharingTask(null)}>Cancelar</Button>
                            <Button onClick={handleShare}>Compartir</Button>
                        </div>
                    </div>
                </Modal>
            )}
             {sendingTask && (
                <Modal isOpen={!!sendingTask} onClose={() => setSendingTask(null)} title="Enviar a Proyecto">
                    <div className="space-y-4">
                        <p>Selecciona un proyecto para añadir este archivo a sus documentos:</p>
                        <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                           {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setSendingTask(null)}>Cancelar</Button>
                            <Button onClick={handleSendToProject}>Enviar</Button>
                        </div>
                    </div>
                </Modal>
            )}

            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold">{t('mediaGeneratorSuite')}</h1>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">{t('mediaGeneratorDescription')}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Uso Mensual</p>
                    <p className="text-xs font-bold text-brand-primary">{used} de {limit} imágenes</p>
                </div>
            </div>

            <div className="bg-light-bg dark:bg-dark-bg p-6 rounded-2xl shadow-md border border-light-border dark:border-dark-border relative overflow-hidden">
                {isGenerating && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-neutral-900/80 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
                        <Spinner text={loadingStep || "Procesando..."} className="text-white font-bold text-lg" />
                        <p className="text-xs text-neutral-300 mt-2">Esto consume almacenamiento de tu plan.</p>
                    </div>
                )}
                
                <div className="space-y-4">
                    {items.map((item, index) => (
                        <div key={index} className="flex flex-col gap-2 relative bg-black/5 dark:bg-black/20 p-3 rounded-xl border border-light-border dark:border-dark-border">
                            {items.length > 1 && (
                                <button onClick={() => removeItem(index)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors z-10" disabled={isGenerating}>
                                    <Icon name="close" className="w-3 h-3" />
                                </button>
                            )}
                            <Textarea 
                                value={item.prompt} 
                                onChange={e => updateItem(index, 'prompt', e.target.value)} 
                                rows={2} 
                                placeholder={`${t('promptPlaceholder')} (Imagen ${index + 1})`} 
                                className="w-full bg-light-surface dark:bg-dark-surface border-neutral-300 dark:border-neutral-600 rounded-lg p-2" 
                                disabled={isGenerating}
                            />
                            <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                                    <Icon name="layout" className="w-4 h-4"/>
                                    Formato:
                                    <select 
                                        value={item.aspectRatio} 
                                        onChange={e => updateItem(index, 'aspectRatio', e.target.value)}
                                        disabled={isGenerating}
                                        className="bg-transparent font-medium border-b border-dashed border-neutral-400 outline-none hover:border-brand-primary"
                                    >
                                        <option value="1:1">1:1 (Cuadrado)</option>
                                        <option value="16:9">16:9 (Horizontal)</option>
                                        <option value="9:16">9:16 (Vertical)</option>
                                        <option value="4:3">4:3</option>
                                        <option value="3:4">3:4</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                    ))}
                    
                    <div className="flex items-center justify-between mt-4">
                        <button onClick={addItem} disabled={isGenerating || items.length >= 10} className="text-sm font-semibold text-brand-primary flex items-center gap-1 hover:underline disabled:opacity-50">
                            <Icon name="plus" className="w-4 h-4" /> Añadir otra imagen a la cola
                        </button>
                        <Button onClick={handleGenerate} disabled={items.filter(i => i.prompt.trim()).length === 0 || isGenerating} className="shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
                            <Icon name="image" className="w-4 h-4"/>
                            Generar {items.filter(i => i.prompt.trim()).length > 1 ? `(${items.filter(i => i.prompt.trim()).length})` : ''} Todas
                        </Button>
                    </div>
                </div>
            </div>
            
            <div>
                <h2 className="text-2xl font-bold mb-4">{t('generationHistory')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recentTasks.length > 0 ? (
                        recentTasks.map(task => (
                            <div key={task.id} className="bg-light-surface dark:bg-dark-surface rounded-xl shadow-sm overflow-hidden group border border-light-border dark:border-dark-border flex flex-col h-full">
                                <div className="w-full aspect-square bg-black/5 dark:bg-black/40 relative overflow-hidden">
                                    {task.status === 'failed' && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 p-4 text-center">
                                            <Icon name="close" className="w-8 h-8 mb-2"/>
                                            <span className="text-sm font-bold">Falló</span>
                                        </div>
                                    )}
                                    {task.status === 'completed' && task.resultUrl ? (
                                         <img src={task.resultUrl} alt={task.prompt} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" onClick={() => setPreviewImage(task.resultUrl!)} />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Icon name="image" className="w-12 h-12 text-neutral-300 dark:text-neutral-700"/>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="p-3 flex flex-col flex-grow">
                                    <p className="text-xs font-medium line-clamp-2 mb-2 h-8 leading-tight text-light-text-primary dark:text-dark-text-primary" title={task.prompt}>{task.prompt}</p>
                                    <div className="mt-auto pt-2 border-t border-light-border dark:border-dark-border flex justify-between items-center">
                                        <span className="text-[10px] text-neutral-500">{new Date(task.createdAt).toLocaleDateString()}</span>
                                        
                                        {task.status === 'completed' && (
                                            <div className="flex gap-1">
                                                <button onClick={() => setSharingTask(task)} className="p-1.5 text-neutral-500 hover:text-brand-primary hover:bg-brand-accent/10 rounded-md" title="Compartir"><Icon name="share" className="w-4 h-4"/></button>
                                                <button onClick={() => setSendingTask(task)} className="p-1.5 text-neutral-500 hover:text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md" title="Enviar a Proyecto"><Icon name="send" className="w-4 h-4"/></button>
                                                <button onClick={() => handleDownload(task)} className="p-1.5 text-neutral-500 hover:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md" title="Descargar"><Icon name="upload" className="w-4 h-4"/></button>
                                                <button onClick={() => deleteAiTask(task)} className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md" title="Eliminar"><Icon name="trash" className="w-4 h-4"/></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full text-center p-12 bg-light-surface dark:bg-dark-surface rounded-xl border border-dashed border-light-border dark:border-dark-border">
                            <Icon name="image" className="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-3" />
                            <p className="text-light-text-secondary dark:text-dark-text-secondary">No has generado imágenes aún.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MediaGenerator;
