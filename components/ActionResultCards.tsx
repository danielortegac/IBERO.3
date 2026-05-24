
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Icon from './Icon';
import { exportComponentAsPDF, exportComponentAsImage } from '../utils/exportUtils';

interface ArtifactCardProps {
    artifact: {
        id: string;
        name: string;
        type: string;
        downloadUrl: string;
        sizeBytes?: number;
        driveSaved?: boolean;
        artifactId?: string;
        driveError?: string;
        primaryFormat?: string;
        variants?: any;
    };
    onOpenDrive?: () => void;
    onSendToProject?: () => void;
}

export const ArtifactResultCard: React.FC<ArtifactCardProps> = ({ artifact, onOpenDrive, onSendToProject }) => {
    const isSheet = artifact.type?.includes('sheet') || artifact.name?.endsWith('.xlsx') || artifact.name?.endsWith('.xls') || artifact.primaryFormat === 'xlsx';
    const isDoc = artifact.type?.includes('word') || artifact.name?.endsWith('.docx') || artifact.primaryFormat === 'docx';
    const isPdf = artifact.type?.includes('pdf') || artifact.name?.endsWith('.pdf') || artifact.primaryFormat === 'pdf';
    const isCsv = artifact.type?.includes('csv') || artifact.name?.endsWith('.csv') || artifact.primaryFormat === 'csv';
    const isImageLike = artifact.type?.includes('image') || artifact.name?.endsWith('.png') || artifact.name?.endsWith('.jpg');
    
    const cardId = `artifact-${artifact.id || Date.now()}`;
    const [isExporting, setIsExporting] = useState(false);

    const downloadFile = (url: string, filename: string) => {
        if (!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownload = (format: string, url: string) => {
        const ext = format.toLowerCase();
        const base = artifact.name.split('.')[0] || 'Goatify_Doc';
        downloadFile(url, `${base}_${Date.now()}.${ext}`);
    };

    const handleCaptureImage = async () => {
        setIsExporting(true);
        const filename = `${artifact.name.split('.')[0]}_${new Date().getTime()}`;
        setTimeout(async () => {
            try {
                await exportComponentAsImage(cardId, filename);
            } finally {
                setIsExporting(false);
            }
        }, 150);
    };

    const hasVariant = (fmt: string) => artifact.variants && artifact.variants[fmt];

    const showPdfBtn = isPdf || isDoc || isImageLike;
    const showWordBtn = isDoc || isPdf;
    const showExcelBtn = isSheet;
    const showCsvBtn = isCsv || (artifact.variants && artifact.variants['csv']);
    const showImageBtn = isImageLike;

    return (
        <motion.div 
            id={cardId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-3 p-4 bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xl my-2 group overflow-hidden relative"
        >
            <div className="absolute top-0 right-0 p-1 bg-brand-primary text-white text-[8px] font-black uppercase tracking-widest px-3 rounded-bl-xl shadow-lg">Goatify Docs</div>
            
            <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner bg-brand-primary border border-brand-primary/20 text-white">
                    <Icon name="goat" className="w-10 h-10"/>
                </div>
                
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-neutral-800 dark:text-white uppercase truncate tracking-tight">{artifact.name}</h4>
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-1 flex items-center gap-2">
                        <span>{artifact.sizeBytes ? `${(artifact.sizeBytes / 1024).toFixed(1)} KB` : 'Archivo Generado'}</span>
                        <span className="w-1 h-1 rounded-full bg-neutral-400"></span>
                        <span>{(artifact.primaryFormat || artifact.type?.split('/')[1] || 'FILE').toUpperCase()}</span>
                    </p>
                </div>
            </div>

            <div className={`grid grid-cols-2 gap-2 mt-2 transition-opacity duration-200 ${isExporting ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
                
                {showPdfBtn && (
                    <button 
                        onClick={() => handleDownload('pdf', isPdf ? artifact.downloadUrl : (artifact.variants?.pdf?.downloadUrl || artifact.downloadUrl))}
                        className="flex items-center justify-center gap-2 py-3 bg-brand-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg hover:shadow-brand-primary/20"
                    >
                        <Icon name="download" className="w-3 h-3"/> Descargar PDF
                    </button>
                )}

                {showWordBtn && (
                    <button 
                        onClick={() => handleDownload('docx', isDoc ? artifact.downloadUrl : (artifact.variants?.docx?.downloadUrl || artifact.downloadUrl))}
                        className="flex items-center justify-center gap-2 py-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-blue-500/20 hover:bg-blue-500/20 shadow-sm"
                    >
                        <Icon name="download" className="w-3 h-3"/> Descargar DOCX
                    </button>
                )}

                {showExcelBtn && (
                    <button 
                        onClick={() => handleDownload('xlsx', artifact.downloadUrl)}
                        className="flex items-center justify-center gap-2 py-3 bg-brand-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg hover:shadow-brand-primary/20"
                    >
                        <Icon name="download" className="w-3 h-3"/> Descargar Excel
                    </button>
                )}

                {showCsvBtn && (
                    <button 
                        onClick={() => handleDownload('csv', isCsv ? artifact.downloadUrl : (artifact.variants?.csv?.downloadUrl || artifact.downloadUrl))}
                        className="flex items-center justify-center gap-2 py-3 bg-brand-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg hover:shadow-brand-primary/20"
                    >
                        <Icon name="download" className="w-3 h-3"/> Descargar CSV
                    </button>
                )}

                {showImageBtn && (
                    <button 
                        onClick={handleCaptureImage}
                        disabled={isExporting}
                        className="flex items-center justify-center gap-2 py-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-blue-500/20 hover:bg-blue-500/20 shadow-sm"
                    >
                        <Icon name="image" className="w-3 h-3"/> Como Imagen
                    </button>
                )}

                {artifact.driveSaved && (
                    <button 
                        onClick={onOpenDrive || (() => {
                            const fileId = artifact.artifactId || artifact.id || '';
                            window.location.hash = `drive?fileId=${fileId}`;
                        })}
                        className="flex items-center justify-center gap-2 py-3 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 shadow-sm"
                    >
                        <Icon name="folder" className="w-3 h-3"/> Abrir Drive
                    </button>
                )}

                {onSendToProject && (
                    <button 
                        onClick={onSendToProject}
                        className={`${artifact.driveSaved ? 'col-span-full' : 'col-span-full'} flex items-center justify-center gap-2 py-3 bg-neutral-900 dark:bg-neutral-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-transparent hover:bg-brand-primary shadow-lg`}
                    >
                        <Icon name="layers" className="w-3 h-3"/> Enviar a Proyecto
                    </button>
                )}
            </div>
            
            {artifact.driveSaved && (
                <p className="text-[8px] text-green-500 font-bold uppercase mt-2 px-1 text-center">
                    Documento guardado en Goatify Docs
                </p>
            )}
        </motion.div>
    );
};

interface TaskCardProps {
    task: any;
    onViewTask?: () => void;
}

export const TaskResultCard: React.FC<TaskCardProps> = ({ task, onViewTask }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-xl my-2 relative"
        >
            <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center">
                    <Icon name="check-square" className="w-6 h-6"/>
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-black text-neutral-800 dark:text-white uppercase tracking-tight">{task.title}</h4>
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-1 flex items-center gap-2">
                        <Icon name="clock" className="w-3 h-3 text-amber-500"/>
                        <span>{task.date} • {task.time}</span>
                    </p>
                </div>
                <div className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter ${
                    task.priority === 'high' || task.priority === 'critical' ? 'bg-red-500 text-white' : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}>
                    {task.priority || 'Normal'}
                </div>
            </div>

            <div className="flex gap-2">
                <button 
                    onClick={onViewTask || (() => {
                        window.location.hash = task.id ? `#/globalCalendar?taskId=${task.id}` : '#/globalCalendar';
                    })}
                    className="flex-1 w-full flex items-center justify-center gap-2 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all"
                >
                    Ver Tarea
                </button>
            </div>
        </motion.div>
    );
};

export const ProjectResultCard: React.FC<{ project: any }> = ({ project }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-xl my-2 relative"
        >
            <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                    <Icon name="layout" className="w-6 h-6"/>
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-black text-neutral-800 dark:text-white uppercase tracking-tight">{project.name}</h4>
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-1">PROYECTO CREADO EXITOSAMENTE</p>
                </div>
            </div>
            <button 
                onClick={() => window.location.hash = `projects/${project.id || ''}`}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
            >
                Abrir Proyecto
            </button>
        </motion.div>
    );
};

export const MailDraftResultCard: React.FC<{ draft: any }> = ({ draft }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-xl my-2 relative"
        >
            <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-2xl flex items-center justify-center">
                    <Icon name="mail" className="w-6 h-6"/>
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-black text-neutral-800 dark:text-white uppercase tracking-tight truncate">{draft.subject || '(Sin Asunto)'}</h4>
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-1">BORRADOR GUARDADO</p>
                </div>
            </div>
            
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl p-3 mb-4 border border-neutral-100 dark:border-neutral-800">
                <p className="text-[10px] text-neutral-600 dark:text-neutral-400 font-medium line-clamp-2 italic">
                    {draft.body?.replace(/<[^>]*>/g, '').substring(0, 100) || 'Sin contenido previo...'}
                </p>
            </div>

            <button 
                onClick={() => {
                    // Emitir evento global para que GoatifyMail lo capture
                    const event = new CustomEvent('goatify-open-draft', { 
                        detail: { 
                            subject: draft.subject, 
                            body: draft.body, 
                            to: draft.to 
                        } 
                    });
                    window.dispatchEvent(event);
                    // Navegar a Goatify Mail si no estamos ahí
                    window.location.hash = 'goatify-mail';
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-pink-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-pink-700 transition-all shadow-lg shadow-pink-600/20"
            >
                Abrir en Redactar Mensaje
            </button>
        </motion.div>
    );
};

export const EmailSentResultCard: React.FC<{ email: any }> = ({ email }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-3xl shadow-xl my-2"
        >
            <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Icon name="check" className="w-6 h-6"/>
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-black text-neutral-800 dark:text-white uppercase tracking-tight">Email Enviado</h4>
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-1">
                        Destinatario: {email.to}
                    </p>
                </div>
            </div>
            <button 
                onClick={() => {
                    window.location.hash = 'goatify-mail';
                    // Pequeño delay para asegurar que el componente cargue antes de intentar cambiar de pestaña
                    setTimeout(() => {
                        const event = new CustomEvent('goatify-switch-folder', { detail: 'sent' });
                        window.dispatchEvent(event);
                    }, 100);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all"
            >
                Ir a Bandeja de Salida
            </button>
        </motion.div>
    );
};

interface MeetingCardProps {
    event: any;
    onViewCalendar?: () => void;
}

export const MeetingResultCard: React.FC<MeetingCardProps> = ({ event, onViewCalendar }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/50 rounded-3xl shadow-xl my-2"
        >
            <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <Icon name="calendar" className="w-6 h-6"/>
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-black text-neutral-800 dark:text-white uppercase tracking-tight">{event.title}</h4>
                    <div className="flex flex-col gap-0.5 mt-1">
                        <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                            {new Date(event.startDate).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </p>
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                            {new Date(event.startDate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} • 30 MIN
                        </p>
                    </div>
                </div>
            </div>

            {event.videoCall && (
                <div className="mb-4 p-2 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-[9px] font-black uppercase text-green-600 dark:text-green-400">Videollamada Habilitada</span>
                </div>
            )}

            <button 
                onClick={onViewCalendar || (() => window.location.hash = 'productivity/agenda')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30"
            >
                Abrir Calendario Shivo
            </button>
        </motion.div>
    );
};
