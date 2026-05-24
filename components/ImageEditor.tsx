
import React, { useState, useCallback, useContext, useRef, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import { editImage } from '../services/geminiService';
import { AppContext } from '../context/AppContext';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import Card from './ui/Card';
import { getPlanConfig } from '../types';
import DriveFilePicker from './ui/DriveFilePicker';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const ImageEditor: React.FC = () => {
    const { t } = useTranslation();
    const { 
        projects, 
        addHubPost, 
        uploadImageToStorage, 
        sendMediaToProject, 
        setToastNotification, 
        checkMediaLimit,
        releaseMediaLimit,
        userProfile,
        userUsage,
        currentUser,
        startAiTask,
        aiTaskHistory,
        createNotification,
        updateProject,
        selectedProjectId,
        imageToEditUrl,
        setImageToEditUrl
    } = useContext(AppContext);
    
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [originalImageFile, setOriginalImageFile] = useState<any>(null);

    useEffect(() => {
        if (imageToEditUrl) {
            // Load the image URL into a base64 string
            const fetchImage = async () => {
                try {
                    const response = await fetch(imageToEditUrl);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setOriginalImage(reader.result as string);
                        
                        // gemini uses mimeType and base64 string
                        const base64Data = (reader.result as string).split(',')[1];
                        setOriginalImageFile({
                            type: blob.type,
                            base64Data: base64Data
                        });
                        setImageToEditUrl(null); // consume it
                    };
                    reader.readAsDataURL(blob);
                } catch (e) {
                    console.error("Error loading image from URL", e);
                }
            };
            fetchImage();
        }
    }, [imageToEditUrl, setImageToEditUrl]);
    const [editedImage, setEditedImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [isSendToProjectModalOpen, setSendToProjectModalOpen] = useState(false);
    const [isShareModalOpen, setShareModalOpen] = useState(false);
    const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
    const [shareComment, setShareComment] = useState('');
    const [processingAction, setProcessingAction] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).ai_images_monthly || 3;
    const used = userUsage?.counters?.monthly_images_used || 0;

    const processFile = (file: File) => {
        if (file && file.type.startsWith('image/')) {
            setOriginalImageFile(file);
            const reader = new FileReader();
            reader.onload = () => {
                setOriginalImage(reader.result as string);
                setEditedImage(null);
            };
            reader.readAsDataURL(file);
        } else {
            setToastNotification({ title: "Archivo no válido", message: "Por favor sube una imagen (PNG, JPG, WebP).", icon: "close" });
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    };

    const handleEdit = async () => {
        if (!prompt || !originalImageFile) return;

        const isBlocked = await checkMediaLimit('image');
        if (isBlocked) {
            setToastNotification({ title: 'Límite', message: 'No tienes más límite para editar imágenes.', icon: 'close' });
            return;
        }

        setIsLoading(true);
        setError(null);
        
        let promiseFileData = originalImageFile.base64Data 
            ? Promise.resolve({ mimeType: originalImageFile.type, data: originalImageFile.base64Data })
            : new Promise<{mimeType: string, data: string}>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64Data = (reader.result as string).split(',')[1];
                    resolve({ mimeType: originalImageFile.type, data: base64Data });
                };
                reader.onerror = reject;
                reader.readAsDataURL(originalImageFile);
            });

        setToastNotification({
            title: 'Edición Iniciada',
            message: `Procesando en segundo plano. Puedes ir a otra sección.`,
            icon: 'clock'
        });

        // Clear local state so user can queue another one
        setEditedImage(null);
        setOriginalImage(null);
        setOriginalImageFile(null);
        setPrompt('');
        setIsLoading(false);

        try {
            const imageData = await promiseFileData;
            const resultBase64Url = await editImage(prompt, imageData);
            
            // Subir a Drive automáticamente
            const permanentUrl = await uploadImageToStorage(resultBase64Url);
            const size = Math.round((resultBase64Url.length * 3) / 4);

            await startAiTask({
                type: 'image_edit',
                prompt: `Edición: ${prompt}`,
                status: 'completed',
                resultUrl: permanentUrl, 
                size
            });

            if (selectedProjectId) {
                const project = projects.find(p => p.id === selectedProjectId);
                if (project) {
                    const newDoc = {
                        id: `ai-img-${Date.now()}`,
                        name: `AI_Edited_${Date.now()}.png`,
                        content: permanentUrl,
                        uploadedAt: new Date().toISOString(),
                        size: size,
                        fileType: 'image/png'
                    };
                    await updateProject(project.id, { documents: [newDoc, ...(project.documents || [])] });
                }
            }
            
            setToastNotification({
                title: '¡Edición Completa!',
                message: 'Tu imagen editada se ha guardado en Drive e historial',
                icon: 'check'
            });
            if (currentUser) {
                await createNotification(currentUser.uid, {
                    type: 'general',
                    text: `Tu imagen editada con IA ya está lista.`,
                    link: '/#editor'
                }).catch(console.error);
            }
        } catch (e: any) {
            await releaseMediaLimit('image');
            console.error("Editor cycle failed", e);
            setToastNotification({
                title: 'Error de Edición',
                message: e.message || 'Error procesando imagen.',
                icon: 'close'
            });
        }
    };
    
    const handleSave = () => {
        if (!editedImage) return;
        const a = document.createElement('a');
        a.href = editedImage;
        a.download = `edited_${Date.now()}.png`;
        a.click();
    };

    const uploadEditedImage = async () => {
        if (!editedImage) return null;
        try {
            setProcessingAction(true);
            if (editedImage.startsWith('http')) return editedImage;
            const url = await uploadImageToStorage(editedImage);
            return url;
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo guardar la imagen en la nube.", icon: 'close' });
            return null;
        } finally {
            setProcessingAction(false);
        }
    };

    const handleSendToProject = async () => {
        if (!targetProjectId) return;
        const url = await uploadEditedImage();
        if (!url) return;
        
        let size = 0;
        if (editedImage && !editedImage.startsWith('http')) {
             size = Math.round((editedImage.length * 3) / 4);
        }

        const mockTask: any = { resultUrl: url, type: 'image', prompt: prompt || 'Edited Image', size };
        await sendMediaToProject(mockTask, targetProjectId);
        setSendToProjectModalOpen(false);
    };

    const handleShare = async () => {
        const url = await uploadEditedImage();
        if (!url) return;
        await addHubPost(shareComment, undefined, { url: url, type: 'image', name: `edited_image_${Date.now()}.png`, originalType: 'image/png' });
        setToastNotification({ title: "Compartido", message: "Publicado en el Feed.", icon: 'check' });
        setShareModalOpen(false);
        setShareComment('');
    };

    const handleDriveFileSelect = (fileData: { name: string, url: string, type: string, base64Data: string }) => {
        setOriginalImageFile(fileData);
        setOriginalImage(fileData.url);
        setEditedImage(null);
    };

    const handleSaveToDrive = async () => {
        if (!currentUser || !editedImage) return;
        setProcessingAction(true);
        try {
            const url = await uploadEditedImage();
            if (!url) throw new Error("No URL");

            const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'drive');
            const snap = await getDoc(settingsRef);
            let driveData = snap.exists() ? snap.data() : { folders: [], fileFolderMap: {}, personalFiles: [] };
            
            const newFile = {
                id: `drive-personal-${Date.now()}`,
                name: `edited_image_${Date.now()}.png`,
                url: url,
                type: 'image/png',
                size: Math.round((editedImage.length * 3) / 4),
                date: new Date().toISOString()
            };

            driveData.personalFiles = [...(driveData.personalFiles || []), newFile];
            await setDoc(settingsRef, driveData, { merge: true });
            
            setToastNotification({ title: "Guardado", message: "Imagen guardada en Goatify Drive.", icon: "check" });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo guardar en Drive.", icon: "close" });
        } finally {
            setProcessingAction(false);
        }
    };

    const handleEditCreated = async () => {
        if (!editedImage) return;
        const base64Data = editedImage.split(',')[1];
        setOriginalImage(editedImage);
        setOriginalImageFile({
            type: 'image/png',
            base64Data: base64Data
        });
        setEditedImage(null);
    };

    return (
        <div className="space-y-6 p-6 h-full overflow-y-auto custom-scrollbar">
             <DriveFilePicker isOpen={isDrivePickerOpen} onClose={() => setIsDrivePickerOpen(false)} onSelect={handleDriveFileSelect} allowedTypes={['image/']} />
             
             <Modal isOpen={isSendToProjectModalOpen} onClose={() => setSendToProjectModalOpen(false)} title="Enviar a Proyecto">
                <div className="space-y-4">
                    <p>Selecciona un proyecto para guardar esta imagen:</p>
                    <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                     <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setSendToProjectModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSendToProject} disabled={processingAction}>
                            {processingAction ? "Enviando..." : "Confirmar"}
                        </Button>
                    </div>
                </div>
             </Modal>

             <Modal isOpen={isShareModalOpen} onClose={() => setShareModalOpen(false)} title="Compartir en el Feed">
                 <div className="space-y-4">
                    <p>Añade un comentario a tu creación antes de publicarla.</p>
                    <Textarea value={shareComment} onChange={e => setShareComment(e.target.value)} rows={3} placeholder="Escribe algo..."/>
                    {editedImage && <img src={editedImage} alt="preview" className="max-h-40 rounded-lg mx-auto object-contain bg-black/20" />}
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setShareModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleShare} disabled={processingAction}>
                            {processingAction ? "Publicando..." : "Compartir"}
                        </Button>
                    </div>
                </div>
             </Modal>

            <div className="flex justify-between items-center mb-2 px-1">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">Editor de Imágenes IA</h1>
                    <p className="text-xs text-neutral-500 font-medium">Transforma fotos con lenguaje natural.</p>
                </div>
                <div className="bg-brand-primary/5 px-4 py-2 rounded-2xl border border-brand-primary/10 text-right">
                    <p className="text-[9px] font-black uppercase text-brand-primary tracking-widest">Uso</p>
                    <p className="text-xs font-bold text-neutral-800 dark:text-white">{used} de {limit}</p>
                </div>
            </div>

            {!originalImage ? (
                <div className="flex flex-col gap-4">
                    <div 
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-12 border-4 border-dashed rounded-2xl text-center cursor-pointer transition-colors ${isDragging ? 'border-brand-primary bg-brand-accent/10' : 'border-neutral-300 dark:border-neutral-600 hover:border-brand-secondary'}`}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if(file) processFile(file); }} accept="image/*" />
                        <Icon name="upload" className="mx-auto h-12 w-12 text-neutral-400 mb-2" />
                        <p className="font-semibold">Arrastra una imagen o haz clic para subir</p>
                        <p className="text-xs text-neutral-400 mt-2">Formatos: PNG, JPG, WebP</p>
                    </div>
                    <div className="flex justify-center">
                        <Button onClick={() => setIsDrivePickerOpen(true)} variant="secondary" className="flex items-center gap-2 px-8 py-4 rounded-2xl border-brand-primary text-brand-primary font-black uppercase text-xs shadow-md">
                            <Icon name="folder" className="w-5 h-5"/> Seleccionar desde Drive
                        </Button>
                    </div>
                </div>
            ) : (
                 <div className="space-y-6">
                    <div className="bg-white dark:bg-neutral-900 p-4 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xl flex flex-col sm:flex-row gap-4">
                        <Textarea 
                            value={prompt} 
                            onChange={e => setPrompt(e.target.value)} 
                            rows={2} 
                            placeholder="¿Qué quieres cambiar? (ej: cambia el fondo a una oficina moderna)" 
                            className="!mt-0 flex-grow"
                        />
                        <Button onClick={handleEdit} disabled={isLoading || !prompt} className="h-auto px-10 py-4 sm:py-0">
                            {isLoading ? <Spinner className="!p-0" /> : "Editar"}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="p-4 border-neutral-200 dark:border-neutral-800 flex flex-col">
                            <h3 className="font-bold text-center mb-2 text-xs uppercase tracking-wider text-neutral-400">Original</h3>
                            <div className="relative flex-grow bg-black/5 dark:bg-black/20 rounded-2xl overflow-hidden flex items-center justify-center">
                                <img src={originalImage} alt="Original" className="max-h-[400px] w-full object-contain" />
                                <button onClick={() => { setOriginalImage(null); setOriginalImageFile(null); setEditedImage(null); }} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full shadow-md hover:bg-red-600 transition-colors"><Icon name="close" className="w-4 h-4"/></button>
                            </div>
                        </Card>
                        
                        <Card className="p-4 border-neutral-200 dark:border-neutral-800 flex flex-col">
                            <h3 className="font-bold text-center mb-2 text-xs uppercase tracking-wider text-brand-primary">Resultado IBERO</h3>
                            <div className="relative flex-grow bg-black/5 dark:bg-black/20 rounded-2xl overflow-hidden flex items-center justify-center min-h-[300px]">
                                {isLoading ? (
                                    <div className="text-center">
                                        <Spinner text="Transformando..." />
                                    </div>
                                ) : error ? (
                                    <p className="text-red-500 p-4 text-center text-xs font-bold">{error}</p>
                                ) : editedImage ? (
                                    <img src={editedImage} alt="Edited" className="max-h-[400px] w-full object-contain animate-fade-in" />
                                ) : (
                                    <p className="text-neutral-400 text-xs italic">La imagen editada aparecerá aquí.</p>
                                )}
                            </div>
                            
                            {editedImage && !isLoading && (
                                <div className="flex justify-center gap-2 mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex-wrap">
                                    <Button onClick={handleEditCreated} size="sm" variant="secondary" className="flex-1 bg-brand-primary/10 text-brand-primary border-brand-primary border hover:bg-brand-primary hover:text-white">Editar Nueva</Button>
                                    <Button onClick={handleSaveToDrive} size="sm" variant="secondary" className="flex-1" disabled={processingAction}>Drive</Button>
                                    <Button onClick={handleSave} size="sm" className="flex-1 bg-green-600 hover:bg-green-700">Descargar</Button>
                                    <Button onClick={() => setSendToProjectModalOpen(true)} size="sm" variant="secondary" className="flex-1">Proyecto</Button>
                                    <Button onClick={() => setShareModalOpen(true)} size="sm" variant="secondary" className="flex-1">Feed</Button>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageEditor;
