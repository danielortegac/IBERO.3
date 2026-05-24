
import React, { useContext, useMemo, useState, useRef, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { Project, ProjectClient, ClientFile, Document, AiTask } from '../types';
import Icon from './Icon';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Spinner from './ui/Spinner';
import Modal from './ui/Modal';
import { getPlanConfig } from '../types';
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, increment } from 'firebase/firestore';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';

interface DriveFile {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    date: string;
    origin: string; 
    parentId: string;
    parentName: string;
    folderId?: string | null;
    isUnassigned?: boolean;
}

interface DriveFolder {
    id: string;
    name: string;
    createdAt: string;
}

type ViewMode = 'grid' | 'compact' | 'list';
type SortCriteria = 'name' | 'size' | 'date';

const GoatifyDrive: React.FC = () => {
    const { projects, userUsage, userProfile, aiTaskHistory, currentUser, setToastNotification, updateProject, setProModalOpen, deleteAiTask, setCurrentView } = useContext(AppContext);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<'all' | 'docs' | 'images' | 'videos'>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortCriteria, setSortCriteria] = useState<SortCriteria>('date');
    const [isUploading, setIsUploading] = useState(false);
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    
    // Estados para Renombrar Carpeta
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [folderToRenameId, setFolderToRenameId] = useState<string | null>(null);
    const [fileToRenameId, setFileToRenameId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const [isAssignModalOpen, setAssignModalOpen] = useState(false);
    const [fileToAssign, setFileToAssign] = useState<DriveFile | null>(null);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');

    const [folders, setFolders] = useState<DriveFolder[]>([]);
    const [fileFolderMap, setFileFolderMap] = useState<Record<string, string>>({}); 
    const [personalFiles, setPersonalFiles] = useState<DriveFile[]>([]);
    const [highlightedFileId, setHighlightedFileId] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (highlightedFileId) {
            const timer = setTimeout(() => setHighlightedFileId(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [highlightedFileId]);

    useEffect(() => {
        if (!currentUser) return;
        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'drive');
        const unsub = onSnapshot(settingsRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setFolders(data.folders || []);
                setFileFolderMap(data.fileFolderMap || {});
                setPersonalFiles(data.personalFiles || []);
            }
        });
        return () => unsub();
    }, [currentUser]);

    const saveDriveMetadata = async (newFolders: DriveFolder[], newMap: Record<string, string>, newPersonalFiles: DriveFile[]) => {
        if (!currentUser) return;
        try {
            const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'drive');
            await setDoc(settingsRef, {
                folders: newFolders,
                fileFolderMap: newMap,
                personalFiles: newPersonalFiles,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (e) { console.error("Error saving drive settings:", e); }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const newFolder: DriveFolder = { id: `folder-${Date.now()}`, name: newFolderName.trim(), createdAt: new Date().toISOString() };
        const updatedFolders = [...folders, newFolder];
        setFolders(updatedFolders);
        await saveDriveMetadata(updatedFolders, fileFolderMap, personalFiles);
        setNewFolderName(''); setIsCreateFolderModalOpen(false);
        setToastNotification({ title: "Carpeta Creada", message: `"${newFolder.name}" lista.`, icon: "folder" });
    };

    const handleOpenRenameModal = (e: React.MouseEvent, item: DriveFolder | DriveFile, type: 'folder' | 'file') => {
        e.stopPropagation();
        if (type === 'folder') {
            setFolderToRenameId(item.id);
            setFileToRenameId(null);
        } else {
            setFileToRenameId(item.id);
            setFolderToRenameId(null);
        }
        setRenameValue(item.name);
        setIsRenameModalOpen(true);
    };

    const handleRenameItem = async () => {
        if (!renameValue.trim()) return;

        if (folderToRenameId) {
            const updatedFolders = folders.map(f => f.id === folderToRenameId ? { ...f, name: renameValue.trim() } : f);
            setFolders(updatedFolders);
            await saveDriveMetadata(updatedFolders, fileFolderMap, personalFiles);
            setToastNotification({ title: "Carpeta Renombrada", message: "Cambios guardados.", icon: "edit" });
        } else if (fileToRenameId) {
            const updatedFiles = personalFiles.map(f => f.id === fileToRenameId ? { ...f, name: renameValue.trim() } : f);
            setPersonalFiles(updatedFiles);
            await saveDriveMetadata(folders, fileFolderMap, updatedFiles);
            setToastNotification({ title: "Archivo Renombrado", message: "Cambios guardados.", icon: "edit" });
        }

        setIsRenameModalOpen(false);
        setFolderToRenameId(null);
        setFileToRenameId(null);
    };

    const handleDeleteFolder = async (e: React.MouseEvent, folderId: string) => {
        e.stopPropagation();
        if (!window.confirm("¿Estás seguro de eliminar esta carpeta? Los archivos dentro volverán a la raíz.")) return;
        const updatedFolders = folders.filter(f => f.id !== folderId);
        const newMap = { ...fileFolderMap };
        Object.keys(newMap).forEach(fileId => { if (newMap[fileId] === folderId) delete newMap[fileId]; });
        setFolders(updatedFolders);
        setFileFolderMap(newMap);
        await saveDriveMetadata(updatedFolders, newMap, personalFiles);
        if (activeFolderId === folderId) setActiveFolderId(null);
        setToastNotification({ title: "Carpeta Eliminada", message: "Estructura actualizada.", icon: "trash" });
    };

    const allFiles = useMemo(() => {
        const files: DriveFile[] = [];
        
        // 1. Personal Files (Unassigned)
        personalFiles.forEach(f => {
            files.push({
                ...f,
                origin: 'Mi Unidad',
                parentId: 'personal',
                parentName: 'Personal',
                folderId: fileFolderMap[f.id] || null,
                isUnassigned: true
            });
        });

        // 2. Project Files
        projects.forEach(p => {
            if (p.documents) {
                p.documents.forEach(d => {
                    const isFromNote = d.id.startsWith('proj-doc-');
                    files.push({
                        id: d.id, name: d.name, url: d.content, type: d.fileType || 'application/octet-stream',
                        size: d.size || 0, date: d.uploadedAt,
                        origin: isFromNote ? `Nota: ${p.name}` : 'Proyecto',
                        parentId: p.id, parentName: p.name, folderId: fileFolderMap[d.id] || null, isUnassigned: false
                    });
                });
            }
            if (p.clients) {
                p.clients.forEach(c => {
                    if (c.files) {
                        c.files.forEach(f => {
                            files.push({
                                id: f.id, name: f.name, url: f.url, type: f.type || 'application/octet-stream',
                                size: f.size || 0, date: f.uploadedAt, origin: `CRM: ${c.name}`,
                                parentId: c.id, parentName: p.name, folderId: fileFolderMap[f.id] || null
                            });
                        });
                    }
                });
            }
        });
        
        // 3. AI Task Results
        aiTaskHistory.forEach(task => {
            if (task.status === 'completed' && task.resultUrl) {
                const taskId = task.id || `task-${task.createdAt}`;
                files.push({
                    id: taskId, name: `AI_Gen_${task.prompt.substring(0, 15).replace(/\s+/g, '_')}.png`,
                    url: task.resultUrl, type: 'image/png', size: 500 * 1024, date: task.createdAt,
                    origin: 'AI Studio', parentId: 'ai-studio', parentName: 'Generaciones IA',
                    folderId: fileFolderMap[taskId] || null, isUnassigned: true 
                });
            }
        });
        return files;
    }, [projects, aiTaskHistory, fileFolderMap, personalFiles]);

    // Deep Link Logic
    useEffect(() => {
        const handleDeepLink = () => {
            const hash = window.location.hash;
            if (hash.includes('fileId=')) {
                const urlParams = new URLSearchParams(hash.split('?')[1]);
                const fileId = urlParams.get('fileId');
                if (fileId) {
                    setHighlightedFileId(fileId);
                    // Optionally search for it to make sure it's visible if it's in a folder
                    const file = allFiles.find(f => f.id === fileId);
                    if (file && file.folderId) {
                        setActiveFolderId(file.folderId);
                    } else if (file) {
                        setActiveFolderId(null);
                    }
                }
            }
        };
        handleDeepLink();
        window.addEventListener('hashchange', handleDeepLink);
        return () => window.removeEventListener('hashchange', handleDeepLink);
    }, [allFiles]);

    const filteredFiles = useMemo(() => {
        let list = [...allFiles];
        if (activeFolderId) { list = list.filter(f => f.folderId === activeFolderId); } 
        else if (!searchTerm) { list = list.filter(f => !f.folderId); }
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            list = list.filter(f => f.name.toLowerCase().includes(low) || f.parentName.toLowerCase().includes(low) || f.origin.toLowerCase().includes(low));
        }
        if (filter === 'docs') list = list.filter(f => f.type.includes('pdf') || f.type.includes('text') || f.type.includes('html') || f.type.includes('document') || f.type.includes('presentation'));
        if (filter === 'images') list = list.filter(f => f.type.startsWith('image/'));
        if (filter === 'videos') list = list.filter(f => f.type.startsWith('video/'));
        if (sortCriteria === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
        else if (sortCriteria === 'size') list.sort((a, b) => b.size - a.size);
        else if (sortCriteria === 'date') list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return list;
    }, [allFiles, searchTerm, filter, activeFolderId, sortCriteria]);

    const planConfig = getPlanConfig(userProfile.plan);
    const limitGB = (planConfig.limits as any).storage_gb || 1;
    const limitBytes = limitGB * 1024 * 1024 * 1024;
    const usedBytes = userUsage?.counters?.current_storage_bytes || 0;
    const usagePercent = Math.min(100, (usedBytes / limitBytes) * 100);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
    };

    const getFolderStats = (fId: string) => {
        const folderFiles = allFiles.filter(f => f.folderId === fId);
        return { count: folderFiles.length, sizeStr: formatSize(folderFiles.reduce((acc, f) => acc + f.size, 0)) };
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !currentUser) return;
        
        let totalSize = 0;
        for (let i = 0; i < files.length; i++) totalSize += files[i].size;

        setIsUploading(true);
        try {
            const newPersonalFiles: DriveFile[] = [];
            const newMap = { ...fileFolderMap };
            let updatedFolders = [...folders];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const { url } = await uploadWithQuotaCheck({
                    userId: currentUser.uid,
                    data: file,
                    sizeBytes: file.size,
                    path: safeStoragePath('drive', currentUser.uid, `${Date.now()}_${file.name}`),
                    metadata: { contentType: file.type || 'application/octet-stream' },
                    plan: userProfile.plan
                });
                
                const docId = `drive-personal-${Date.now()}-${i}`;
                
                // Handle Folder Structure from webkitRelativePath
                let targetFolderId = activeFolderId;
                
                if (file.webkitRelativePath) {
                    const pathParts = file.webkitRelativePath.split('/');
                    if (pathParts.length > 1) {
                        // It's inside a folder. Get the top-level folder name.
                        const folderName = pathParts[0];
                        let folder = updatedFolders.find(f => f.name === folderName);
                        
                        if (!folder) {
                            folder = { id: `folder-${Date.now()}-${Math.random()}`, name: folderName, createdAt: new Date().toISOString() };
                            updatedFolders.push(folder);
                        }
                        targetFolderId = folder.id;
                    }
                }

                newPersonalFiles.push({
                    id: docId,
                    name: file.name,
                    url: url,
                    type: file.type,
                    size: file.size,
                    date: new Date().toISOString(),
                    origin: 'Mi Unidad',
                    parentId: 'personal',
                    parentName: 'Personal',
                    isUnassigned: true
                });
                
                if (targetFolderId) newMap[docId] = targetFolderId;
            }

            const finalPersonalFiles = [...personalFiles, ...newPersonalFiles];
            setPersonalFiles(finalPersonalFiles);
            setFolders(updatedFolders);
            setFileFolderMap(newMap);
            await saveDriveMetadata(updatedFolders, newMap, finalPersonalFiles);
            
            setToastNotification({ title: "Subida Exitosa", message: `${files.length} archivo(s) guardado(s) en Mi Unidad.`, icon: "check" });
        } catch (error) { 
            console.error(error); 
            setToastNotification({ title: "Error", message: "Falló la subida de archivos.", icon: "close" });
        } finally { 
            setIsUploading(false); 
            if (e.target) e.target.value = ''; 
        }
    };

    const handleCopyLink = (e: React.MouseEvent, url: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(url);
        setToastNotification({ title: "Copiado", message: "Enlace copiado al portapapeles.", icon: "check" });
    };

    const handleCopyFolderLinks = (e: React.MouseEvent, folderId: string) => {
        e.stopPropagation();
        const folderFiles = allFiles.filter(f => f.folderId === folderId);
        if (folderFiles.length === 0) {
            setToastNotification({ title: "Carpeta Vacía", message: "No hay archivos para copiar.", icon: "info" });
            return;
        }
        const linksText = folderFiles.map(f => `${f.name}: ${f.url}`).join('\n');
        
        const blob = new Blob([linksText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `links_carpeta_${folders.find(f => f.id === folderId)?.name || 'archivos'}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setToastNotification({ title: "Enlaces Descargados", message: "Lista de enlaces generada.", icon: "check" });
    };

    const handleDeleteDriveFile = async (file: DriveFile) => {
        if (!window.confirm(`¿Eliminar permanentemente "${file.name}"?`)) return;
        try {
            // 1. Check if it's a project file
            const project = projects.find(p => p.id === file.parentId);
            if (project) {
                const updatedDocs = project.documents.filter(d => d.id !== file.id);
                const updatedClients = (project.clients || []).map(c => c.id === file.parentId ? { ...c, files: (c.files || []).filter(f => f.id !== file.id) } : c);
                await updateProject(project.id, { documents: updatedDocs, clients: updatedClients });
            }
            // 2. Check if it's an AI Task
            if (file.parentId === 'ai-studio') {
                const task = aiTaskHistory.find(t => (t.id || `task-${t.createdAt}`) === file.id);
                if (task) await deleteAiTask(task);
            }
            // 3. Check if it's a Personal File
            if (file.parentId === 'personal') {
                const updatedPersonal = personalFiles.filter(f => f.id !== file.id);
                setPersonalFiles(updatedPersonal);
                await saveDriveMetadata(folders, fileFolderMap, updatedPersonal);
            }

            const newMap = { ...fileFolderMap };
            delete newMap[file.id];
            setFileFolderMap(newMap);
            await saveDriveMetadata(folders, newMap, personalFiles.filter(f => f.id !== file.id)); // Ensure sync
            
            setToastNotification({ title: "Eliminado", message: "Archivo borrado.", icon: "trash" });
        } catch (e) { console.error(e); }
    };

    const handleAssignToProject = async () => {
        if (!fileToAssign || !targetProjectId) return;
        const project = projects.find(p => p.id === targetProjectId);
        if (!project) return;

        const newDoc: Document = {
            id: fileToAssign.id.startsWith('drive-unassigned') ? `doc-assigned-${Date.now()}` : fileToAssign.id,
            name: fileToAssign.name,
            content: fileToAssign.url,
            uploadedAt: new Date().toISOString(),
            size: fileToAssign.size,
            fileType: fileToAssign.type
        };

        const existingDocs = project.documents || [];
        if (existingDocs.some(d => d.content === newDoc.content)) {
            setToastNotification({ title: "Aviso", message: "Este archivo ya está en el proyecto.", icon: "info" });
            setAssignModalOpen(false);
            return;
        }

        try {
            await updateProject(targetProjectId, { documents: [newDoc, ...existingDocs] });
            setToastNotification({ title: "Asignado", message: `"${fileToAssign.name}" vinculado a ${project.name}.`, icon: "check" });
            setAssignModalOpen(false);
            setFileToAssign(null);
        } catch (e) {
            console.error("Error assigning to project:", e);
        }
    };

    const handleActionClick = (file: DriveFile) => {
        if (file.type === 'interactive_presentation') {
            setCurrentView('aiStudio');
            window.location.hash = `aiStudio/presentations/present/${file.url}`;
            return;
        }
        window.open(file.url, '_blank');
    };

    const getFileIcon = (type: string): React.ComponentProps<typeof Icon>['name'] => {
        if (type === 'interactive_presentation') return 'rocket';
        if (type.includes('pdf')) return 'upload';
        if (type.includes('image')) return 'image';
        if (type.includes('video')) return 'video';
        if (type.includes('html')) return 'code';
        if (type.includes('table') || type.includes('sheet')) return 'table';
        return 'folder';
    };

    const getIconColor = (type: string) => {
        if (type === 'interactive_presentation') return 'bg-brand-primary text-white';
        if (type.includes('pdf')) return 'text-red-500 bg-red-50';
        if (type.includes('image')) return 'text-blue-500 bg-blue-50';
        if (type.includes('video')) return 'text-purple-500 bg-purple-50';
        if (type.includes('html')) return 'text-orange-500 bg-orange-50';
        if (type.includes('table')) return 'text-green-500 bg-green-50';
        return 'text-brand-primary bg-brand-primary/5';
    };

    const onDragStart = (e: React.DragEvent, fileId: string) => { e.dataTransfer.setData("fileId", fileId); };
    const onDropOnFile = async (e: React.DragEvent, targetFolderId: string) => {
        e.preventDefault();
        const fileId = e.dataTransfer.getData("fileId");
        if (fileId && fileId !== targetFolderId) {
            const newMap = { ...fileFolderMap, [fileId]: targetFolderId };
            setFileFolderMap(newMap);
            await saveDriveMetadata(folders, newMap, personalFiles);
            setToastNotification({ title: "Organizado", message: "Movido a carpeta.", icon: "check" });
        }
    };

    return (
        <div className="flex flex-col h-full bg-light-bg dark:bg-dark-bg animate-fade-in overflow-hidden">
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
            
            <Modal isOpen={isCreateFolderModalOpen} onClose={() => setIsCreateFolderModalOpen(false)} title="Crear Nueva Carpeta">
                <div className="space-y-4">
                    <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Nombre..." autoFocus onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}/>
                    <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setIsCreateFolderModalOpen(false)}>Cancelar</Button><Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Crear</Button></div>
                </div>
            </Modal>

            <Modal isOpen={isRenameModalOpen} onClose={() => setIsRenameModalOpen(false)} title={folderToRenameId ? "Renombrar Carpeta" : "Renombrar Archivo"}>
                <div className="space-y-4">
                    <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} placeholder="Nuevo nombre..." autoFocus onKeyDown={e => e.key === 'Enter' && handleRenameItem()}/>
                    <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setIsRenameModalOpen(false)}>Cancelar</Button><Button onClick={handleRenameItem} disabled={!renameValue.trim()}>Guardar</Button></div>
                </div>
            </Modal>

            <Modal isOpen={isAssignModalOpen} onClose={() => setAssignModalOpen(false)} title="Asignar a Proyecto">
                <div className="space-y-4">
                    <p className="text-sm">Selecciona el proyecto para asignar "{fileToAssign?.name}":</p>
                    <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setAssignModalOpen(false)}>Cancelar</Button><Button onClick={handleAssignToProject}>Asignar</Button></div>
                </div>
            </Modal>

            <div className="flex-none p-4 sm:p-6 border-b border-light-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm z-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-brand-primary rounded-2xl flex items-center justify-center text-white shadow-xl cursor-pointer" onClick={() => setActiveFolderId(null)}><Icon name="folder" className="w-7 h-7"/></div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter">Goatify Drive</h1>
                                {activeFolderId && <div className="flex items-center gap-2"><Icon name="chevronLeft" className="w-4 h-4 text-neutral-300 rotate-180"/><span className="text-xl font-bold text-brand-primary truncate max-w-[150px]">{folders.find(f => f.id === activeFolderId)?.name}</span></div>}
                            </div>
                            <p className="text-[10px] sm:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-1">Gestión Centralizada y Respaldo Total</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
                        <Card className="p-3 bg-neutral-50 dark:bg-neutral-800 border-none shadow-inner w-full md:w-64">
                            <div className="flex justify-between items-center mb-1.5"><span className="text-[9px] font-black uppercase text-neutral-500">Espacio en Nube</span><span className={`text-[10px] font-black ${usagePercent > 90 ? 'text-red-500' : 'text-brand-primary'}`}>{usagePercent.toFixed(1)}%</span></div>
                            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1"><div className={`h-full ${usagePercent > 90 ? 'bg-red-500' : 'bg-brand-primary'} transition-all duration-1000`} style={{ width: `${usagePercent}%` }}></div></div>
                            <p className="text-[8px] text-neutral-400 font-bold uppercase text-right">{formatSize(usedBytes)} / {limitGB} GB</p>
                        </Card>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button variant="secondary" onClick={() => setIsCreateFolderModalOpen(true)} className="flex-1 sm:flex-none h-12 px-4 border-brand-primary text-brand-primary font-black uppercase text-[10px] tracking-widest"><Icon name="plus" className="w-4 h-4"/> Carpeta</Button>
                            <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
                            <input type="file" ref={folderInputRef} className="hidden" multiple webkitdirectory="" directory="" onChange={handleFileUpload} />
                            <Button onClick={() => folderInputRef.current?.click()} className="flex-1 sm:flex-none h-12 px-4 shadow-xl bg-gradient-to-r from-blue-500 to-indigo-600 border-none font-black uppercase text-[10px] tracking-widest" disabled={isUploading}>{isUploading ? <Spinner className="w-4 h-4 text-white" /> : <><Icon name="upload" className="w-4 h-4"/> Subir Carpeta</>}</Button>
                            <Button onClick={() => fileInputRef.current?.click()} className="flex-1 sm:flex-none h-12 px-6 shadow-xl bg-gradient-to-r from-brand-primary to-purple-600 border-none font-black uppercase text-[10px] tracking-widest" disabled={isUploading}>{isUploading ? <Spinner className="w-4 h-4 text-white" /> : <><Icon name="plus" className="w-4 h-4"/> Subir</>}</Button>
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full"><div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"><Icon name="search" className="w-5 h-5"/></div><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-primary shadow-inner" placeholder="Buscar en mi nube..."/></div>
                    <div className="flex gap-2 w-full md:w-auto flex-none overflow-x-auto no-scrollbar">
                        <select value={sortCriteria} onChange={e => setSortCriteria(e.target.value as any)} className="px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[10px] font-black uppercase tracking-widest outline-none"><option value="date">Fecha</option><option value="name">Nombre</option><option value="size">Tamaño</option></select>
                        <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
                            {['all', 'docs', 'images', 'videos'].map(f => ( <button key={f} onClick={() => setFilter(f as any)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === f ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500'}`}>{f === 'all' ? 'Todos' : f === 'docs' ? 'Docs' : f === 'images' ? 'Fotos' : 'Videos'}</button> ))}
                        </div>
                        <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
                            {(['grid', 'compact', 'list'] as ViewMode[]).map(m => ( <button key={m} onClick={() => setViewMode(m)} className={`p-2 rounded-lg transition-all ${viewMode === m ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-400'}`}><Icon name={m === 'grid' ? 'grid' : m === 'compact' ? 'kanban' : 'list'} className="w-4 h-4"/></button> ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-neutral-50/50 dark:bg-black/20">
                <div className={`${viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6' : viewMode === 'compact' ? 'grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-3' : 'flex flex-col gap-2'}`}>
                    {!searchTerm && !activeFolderId && folders.map(folder => (
                        <Card key={folder.id} onDragOver={e => e.preventDefault()} onDrop={e => onDropOnFile(e, folder.id)} onClick={() => setActiveFolderId(folder.id)} className={`p-5 bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800 hover:shadow-2xl transition-all group rounded-[2rem] cursor-pointer flex flex-col items-center text-center h-56 justify-between relative ${viewMode === 'list' ? '!h-20 !flex-row !text-left !p-4' : ''}`}>
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => handleCopyFolderLinks(e, folder.id)} className="p-1.5 text-neutral-400 hover:text-blue-500" title="Descargar enlaces"><Icon name="link" className="w-4 h-4"/></button>
                                <button onClick={(e) => handleOpenRenameModal(e, folder, 'folder')} className="p-1.5 text-neutral-400 hover:text-brand-primary"><Icon name="edit" className="w-4 h-4"/></button>
                                <button onClick={(e) => handleDeleteFolder(e, folder.id)} className="p-1.5 text-neutral-400 hover:text-red-500"><Icon name="trash" className="w-4 h-4"/></button>
                            </div>
                            <div className={`w-16 h-16 rounded-[1.5rem] bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform ${viewMode === 'list' ? '!w-12 !h-12' : ''}`}><Icon name="folder" className="w-10 h-10"/></div>
                            <div className="min-w-0 flex-1">
                                <h4 className="font-black text-sm text-neutral-900 dark:text-white truncate px-2">{folder.name}</h4>
                                <div className="flex flex-col gap-0.5 mt-1"><span className="text-[9px] font-black text-brand-primary uppercase tracking-widest">{getFolderStats(folder.id).count} Archivos</span><span className="text-[9px] font-bold text-neutral-400 uppercase">{getFolderStats(folder.id).sizeStr} Peso</span></div>
                            </div>
                        </Card>
                    ))}

                    {filteredFiles.map(file => {
                        const isPres = file.type === 'interactive_presentation';
                        const isImage = file.type.startsWith('image/');
                        const isVideo = file.type.startsWith('video/');

                        if (viewMode === 'list') {
                            return (
                                <Card key={file.id} draggable onDragStart={e => onDragStart(e, file.id)} className={`p-3 bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800 hover:shadow-md transition-all flex items-center gap-4 rounded-xl group ${isPres ? 'presentation-shortcut animate-pulse-subtle' : ''} ${file.id === highlightedFileId ? 'ring-2 ring-brand-primary ring-offset-2 dark:ring-offset-black z-50' : ''}`}>
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getIconColor(file.type)} flex-shrink-0`}><Icon name={getFileIcon(file.type)} className="w-5 h-5"/></div>
                                    <div className="min-w-0 flex-1" onClick={() => handleActionClick(file)}>
                                        <h4 className={`font-bold text-sm truncate ${isPres ? 'text-brand-primary dark:text-brand-accent' : 'text-neutral-800 dark:text-white'}`}>{file.name}</h4>
                                        <div className="flex items-center gap-2"><p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">{isPres ? 'Presentación Interactiva' : file.origin} • {file.parentName}</p></div>
                                    </div>
                                    <div className="flex gap-1.5 flex-shrink-0">
                                        <button onClick={(e) => handleCopyLink(e, file.url)} className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-neutral-400 hover:text-blue-500 transition-all shadow-sm" title="Copiar enlace"><Icon name="link" className="w-4 h-4"/></button>
                                        {file.isUnassigned && <button onClick={() => { setFileToAssign(file); setAssignModalOpen(true); }} className="p-2 bg-brand-primary/10 text-brand-primary rounded-lg hover:bg-brand-primary hover:text-white transition-all shadow-sm"><Icon name="send" className="w-4 h-4"/></button>}
                                        <button onClick={(e) => { e.stopPropagation(); handleOpenRenameModal(e, file, 'file'); }} className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-neutral-400 hover:text-brand-primary transition-all shadow-sm" title="Renombrar"><Icon name="edit" className="w-4 h-4"/></button>
                                        <button onClick={() => handleDeleteDriveFile(file)} className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-neutral-400 hover:text-red-500 transition-all shadow-sm"><Icon name="trash" className="w-4 h-4"/></button>
                                    </div>
                                </Card>
                            );
                        }

                        return (
                            <Card key={file.id} draggable onDragStart={e => onDragStart(e, file.id)} className={`p-0 bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800 hover:shadow-2xl transition-all group rounded-[2rem] relative overflow-hidden flex flex-col h-56 ${isPres ? 'presentation-shortcut animate-pulse-subtle' : 'border-b-4 border-b-transparent hover:border-b-brand-primary'} ${file.id === highlightedFileId ? 'ring-4 ring-brand-primary ring-offset-4 dark:ring-offset-black z-50 scale-105' : ''}`}>
                                <div className="aspect-video w-full relative bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center overflow-hidden border-b dark:border-neutral-700" onClick={() => handleActionClick(file)}>
                                    {isImage ? <img src={file.url} alt={file.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /> : isVideo ? <div className="w-full h-full relative"><video src={file.url} className="w-full h-full object-cover opacity-60" /><div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors"><Icon name="video" className="w-10 h-10 text-white/80" /></div></div> : <div className={`w-full h-full flex flex-col items-center justify-center p-6 ${getIconColor(file.type)} opacity-40 group-hover:opacity-60 transition-opacity`}><Icon name={getFileIcon(file.type)} className="w-12 h-12 mb-2"/><span className="text-[9px] font-black uppercase tracking-widest">{isPres ? 'PRES' : (file.type.split('/')[1] || 'DOC')}</span></div>}
                                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none gap-2">
                                        <button onClick={(e) => handleCopyLink(e, file.url)} className="p-2.5 bg-white text-blue-500 rounded-xl shadow-2xl pointer-events-auto transform translate-y-4 group-hover:translate-y-0 transition-all duration-300" title="Copiar enlace"><Icon name="link" className="w-5 h-5"/></button>
                                        {file.isUnassigned && <button onClick={(e) => { e.stopPropagation(); setFileToAssign(file); setAssignModalOpen(true); }} className="p-2.5 bg-brand-primary text-white rounded-xl shadow-2xl pointer-events-auto transform translate-y-4 group-hover:translate-y-0 transition-all duration-300"><Icon name="send" className="w-5 h-5"/></button>}
                                        <button onClick={(e) => { e.stopPropagation(); handleOpenRenameModal(e, file, 'file'); }} className="p-2.5 bg-white text-brand-primary rounded-xl shadow-2xl pointer-events-auto transform translate-y-4 group-hover:translate-y-0 transition-all duration-300" title="Renombrar"><Icon name="edit" className="w-5 h-5"/></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteDriveFile(file); }} className="p-2.5 bg-white text-red-500 rounded-xl shadow-2xl pointer-events-auto transform translate-y-4 group-hover:translate-y-0 transition-all duration-300"><Icon name="trash" className="w-5 h-5"/></button>
                                    </div>
                                </div>
                                <div className="p-4 flex flex-col flex-1 min-w-0" onClick={() => handleActionClick(file)}>
                                    <div className="mb-2 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1 overflow-hidden">
                                            {file.isUnassigned && <span className="text-[7px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black uppercase flex-shrink-0">Drive</span>}
                                            <h4 className={`font-black text-xs truncate flex-1 ${isPres ? 'text-brand-primary dark:text-brand-accent' : 'text-neutral-900 dark:text-white'}`} title={file.name}>{file.name}</h4>
                                        </div>
                                        <div className="flex items-center gap-1.5"><span className="text-[7px] font-black uppercase text-brand-primary bg-brand-primary/5 px-1.5 py-0.5 rounded-full border border-brand-primary/10">{isPres ? 'ACCESO DIRECTO' : file.origin.split(':')[0]}</span><span className="text-[7px] text-neutral-400 font-bold uppercase truncate">{file.parentName}</span></div>
                                    </div>
                                    <div className="mt-auto flex justify-between items-center pt-2 border-t border-neutral-50 dark:border-neutral-800"><div className="text-[8px] text-neutral-500 font-black uppercase">{formatSize(file.size)}</div><div className="text-[8px] text-neutral-400 font-bold">{new Date(file.date).toLocaleDateString()}</div></div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default GoatifyDrive;
