
import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../../context/AppContext';
import Icon from '../Icon';
import Modal from './Modal';
import Button from './Button';
import Spinner from './Spinner';

interface DriveFilePickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (fileData: { name: string, url: string, type: string, base64Data: string }) => void;
    allowedTypes?: string[]; // e.g., ['image/', 'video/']
}

const DriveFilePicker: React.FC<DriveFilePickerProps> = ({ isOpen, onClose, onSelect, allowedTypes }) => {
    const { projects, aiTaskHistory } = useContext(AppContext);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const allFiles = useMemo(() => {
        const files: any[] = [];
        projects.forEach(p => {
            if (p.documents) {
                p.documents.forEach(d => {
                    files.push({
                        id: d.id,
                        name: d.name,
                        url: d.content,
                        type: d.fileType || 'application/octet-stream',
                        size: d.size || 0,
                        date: d.uploadedAt,
                        origin: p.name
                    });
                });
            }
            if (p.clients) {
                p.clients.forEach(c => {
                    if (c.files) {
                        c.files.forEach(f => {
                            files.push({
                                id: f.id,
                                name: f.name,
                                url: f.url,
                                type: f.type || 'application/octet-stream',
                                size: f.size || 0,
                                date: f.uploadedAt,
                                origin: `CRM: ${c.name}`
                            });
                        });
                    }
                });
            }
        });

        aiTaskHistory.forEach(task => {
            if (task.status === 'completed' && task.resultUrl) {
                files.push({
                    id: task.id || `task-${task.createdAt}`,
                    name: `IA_Gen_${task.prompt.substring(0, 15)}.png`,
                    url: task.resultUrl,
                    type: 'image/png',
                    size: 0,
                    date: task.createdAt,
                    origin: 'AI Studio'
                });
            }
        });

        let filtered = files;
        if (allowedTypes) {
            filtered = files.filter(f => allowedTypes.some(type => f.type.startsWith(type)));
        }
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            filtered = filtered.filter(f => f.name.toLowerCase().includes(low) || f.origin.toLowerCase().includes(low));
        }

        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [projects, aiTaskHistory, allowedTypes, searchTerm]);

    const handleSelect = async (file: any) => {
        setIsProcessing(true);
        try {
            // CRÍTICO: Descargar como blob y convertir a Base64 para evitar errores de CORS
            const response = await fetch(file.url);
            const blob = await response.blob();
            const reader = new FileReader();
            
            const base64Data = await new Promise<string>((resolve) => {
                reader.onloadend = () => {
                    const result = reader.result as string;
                    resolve(result.split(',')[1]);
                };
                reader.readAsDataURL(blob);
            });

            onSelect({
                name: file.name,
                url: file.url,
                type: file.type,
                base64Data: base64Data
            });
            onClose();
        } catch (error) {
            console.error("Error al procesar archivo del Drive:", error);
            alert("No se pudo procesar el archivo. Revisa los permisos de red.");
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Seleccionar desde Goatify Drive" className="max-w-4xl h-[80vh]" zIndex="z-[99999999]">
            <div className="flex flex-col h-full space-y-4">
                <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"><Icon name="search" className="w-4 h-4"/></div>
                    <input 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar en mi nube..."
                        className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-sm border-none focus:ring-2 focus:ring-brand-primary"
                    />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                    {isProcessing ? (
                        <div className="h-full flex flex-col items-center justify-center">
                            <Spinner text="Preparando archivo para transferencia segura..." />
                        </div>
                    ) : allFiles.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {allFiles.map((file) => (
                                <div 
                                    key={file.id} 
                                    onClick={() => handleSelect(file)}
                                    className="p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl hover:border-brand-primary hover:shadow-lg transition-all cursor-pointer group"
                                >
                                    <div className="aspect-square bg-neutral-100 dark:bg-neutral-900 rounded-xl mb-2 flex items-center justify-center overflow-hidden border border-neutral-100 dark:border-neutral-700">
                                        {file.type.startsWith('image/') ? (
                                            <img src={file.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={file.name} />
                                        ) : (
                                            <Icon name={file.type.includes('pdf') ? 'upload' : 'folder'} className="w-8 h-8 text-neutral-400" />
                                        )}
                                    </div>
                                    <p className="text-[10px] font-black text-neutral-900 dark:text-white truncate uppercase" title={file.name}>{file.name}</p>
                                    <p className="text-[8px] text-brand-primary font-bold uppercase truncate">{file.origin}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-30 italic">
                            <Icon name="folder" className="w-12 h-12 mb-2"/>
                            <p>No se encontraron archivos compatibles.</p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default DriveFilePicker;
