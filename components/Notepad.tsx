import React, { useState, useContext, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import type { Note, Project, Document } from '../types';
import Button from './ui/Button';
import Icon from './Icon';
import Modal from './ui/Modal';
import Textarea from './ui/Textarea';
import jsPDF from 'jspdf';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { rewriteText } from '../services/geminiService';
import { formatMarkdownToHtmlForNotepad } from '../utils/formatUtils';
import Spinner from './ui/Spinner';
import { getPlanConfig } from '../types';
import { checkAndConsumeLimit } from '../services/subscriptionService';

interface NotepadProps {
    project: Project;
}

const Notepad: React.FC<NotepadProps> = ({ project }) => {
    const { t, language } = useTranslation();
    const { updateProject, setToastNotification, rewardFileUpload, deepLinkTarget, uploadImageToStorage, userProfile, userUsage, checkQueryLimit, getProjectNotes, saveProjectNote, deleteProjectNote, setProModalOpen } = useContext(AppContext);
    
    const initialNoteId = (deepLinkTarget && typeof deepLinkTarget === 'object' && deepLinkTarget.view === 'notepad') ? deepLinkTarget.id : null;
    
    // Local state for notes fetched from subcollection
    const [notes, setNotes] = useState<Note[]>([]);
    const [isLoadingNotes, setIsLoadingNotes] = useState(true);

    const [selectedNote, setSelectedNote] = useState<Note | null>(null);

    const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
    const [counts, setCounts] = useState({ words: 0, chars: 0 });
    const [isAiRewriting, setIsAiRewriting] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [isHtmlModalOpen, setIsHtmlModalOpen] = useState(false);
    const [htmlInput, setHtmlInput] = useState('');

    const editorRef = useRef<HTMLDivElement>(null);
    const saveTimeoutRef = useRef<number | null>(null);

    // Fetch notes on mount
    useEffect(() => {
        const fetchNotes = async () => {
            setIsLoadingNotes(true);
            try {
                const fetchedNotes = await getProjectNotes(project.id);
                
                // Merge strategy:
                // Use fetchedNotes as the source of truth.
                // If a note exists in project.notes but NOT in fetchedNotes, add it to the list (Legacy notes).
                
                const legacyNotes = project.notes || [];
                const fetchedNoteIds = new Set(fetchedNotes.map(n => n.id));
                
                const missingLegacyNotes = legacyNotes.filter(n => !fetchedNoteIds.has(n.id));
                
                const combinedNotes = [...fetchedNotes, ...missingLegacyNotes];
                
                // Sort by updatedAt desc
                combinedNotes.sort((a, b) => {
                    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                    return dateB - dateA;
                });
                
                setNotes(combinedNotes);
                
                if (combinedNotes.length > 0) {
                    if (initialNoteId) {
                        const found = combinedNotes.find(n => n.id === initialNoteId);
                        setSelectedNote(found || combinedNotes[0]);
                    } else {
                        setSelectedNote(combinedNotes[0]);
                    }
                } else {
                    setSelectedNote(null);
                }

            } catch (e) {
                console.error("Error fetching notes", e);
                setToastNotification({ title: "Error", message: "No se pudieron cargar las notas.", icon: "close" });
            } finally {
                setIsLoadingNotes(false);
            }
        };
        fetchNotes();
    }, [project.id, getProjectNotes]);

    const updateCounts = useCallback(() => {
        if (editorRef.current) {
            const text = editorRef.current.innerText || '';
            const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
            const chars = text.length;
            setCounts({ words, chars });
        }
    }, []);

    const updateToolbarState = useCallback(() => {
        const newFormats: Record<string, boolean> = {};
        const simpleCommands = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'];
        simpleCommands.forEach(cmd => {
            try {
                newFormats[cmd] = document.queryCommandState(cmd);
            } catch(e) {}
        });
        setActiveFormats(newFormats);
    }, []);

    useEffect(() => {
        if (selectedNote && editorRef.current) {
            // Only update if content is significantly different to avoid cursor jumping
            if (editorRef.current.innerHTML !== selectedNote.content) {
                editorRef.current.innerHTML = selectedNote.content;
            }
        } else if (!selectedNote && editorRef.current) {
            editorRef.current.innerHTML = '';
        }
        updateCounts();
        updateToolbarState();
    }, [selectedNote?.id, isFullScreen, updateCounts, updateToolbarState]);
    
    const debouncedSave = useCallback(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(async () => {
            if (selectedNote && editorRef.current) {
                const text = editorRef.current.innerText || '';
                const derivedTitle = text.trim().split('\n')[0].substring(0, 150).trim() || t('untitledNote');
                const finalContent = editorRef.current.innerHTML;
                
                // Optimistic update
                const updatedNote = { ...selectedNote, title: derivedTitle, content: finalContent, updatedAt: new Date().toISOString() };
                setNotes(prev => prev.map(n => n.id === selectedNote.id ? updatedNote : n));
                
                // Save to subcollection
                try {
                    await saveProjectNote(project.id, updatedNote);
                    
                    // CLEANUP LEGACY: If note exists in main project doc, remove it to save space
                    // This progressively migrates data out of the main document
                    if (project.notes && project.notes.some(n => n.id === updatedNote.id)) {
                         const cleanNotes = project.notes.filter(n => n.id !== updatedNote.id);
                         updateProject(project.id, { notes: cleanNotes });
                    }
                } catch (e) {
                    console.error("Error saving note", e);
                    setToastNotification({ title: "Error", message: "No se pudo guardar la nota.", icon: "close" });
                }
            }
        }, 1000);
    }, [project.id, project.notes, selectedNote, t, saveProjectNote, updateProject]);

    const confirmInsertHTML = () => {
        if (!htmlInput.trim() || !editorRef.current) return;
        
        const safeHtml = htmlInput.replace(/"/g, '&quot;');
        const iframeHtml = `<div class="html-embed-container" style="margin: 1rem 0; border: 1px solid #e5e7eb; border-radius: 0.5rem; overflow: hidden; background: white;"><iframe srcdoc="${safeHtml}" style="width: 100%; min-height: 600px; height: 100vh; max-height: 800px; border: none;" sandbox="allow-scripts allow-same-origin"></iframe></div><p><br></p>`;
        
        editorRef.current.focus();
        document.execCommand('insertHTML', false, iframeHtml);
        setIsHtmlModalOpen(false);
        setHtmlInput('');
        debouncedSave();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        let hasFile = false;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                hasFile = true;
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    await processPastedFile(file);
                }
            }
        }

        if (!hasFile) {
            // Intercept text/html paste to apply "Pro" styling
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            const html = e.clipboardData.getData('text/html');

            if (html) {
                // Clean and format HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;

                // Recursive function to clean and format elements
                const cleanAndFormat = (el: HTMLElement) => {
                    // Remove all inline styles first
                    el.removeAttribute('style');
                    el.removeAttribute('class'); // Also remove classes to avoid conflicts

                    const tagName = el.tagName.toUpperCase();

                    // Unwrap spans if they don't have semantic meaning (often used for styling)
                    if (tagName === 'SPAN') {
                        // If it has children, process them
                        if (el.hasChildNodes()) {
                            const fragment = document.createDocumentFragment();
                            while (el.firstChild) {
                                const child = el.firstChild;
                                if (child.nodeType === 1) { // Element node
                                    cleanAndFormat(child as HTMLElement);
                                }
                                fragment.appendChild(child);
                            }
                            el.parentNode?.replaceChild(fragment, el);
                        } else {
                             // Empty span or text only, just unwrap
                             const textNode = document.createTextNode(el.textContent || '');
                             el.parentNode?.replaceChild(textNode, el);
                        }
                        return; // Node is gone, stop processing
                    }

                    // Apply specific styles based on tag
                    if (tagName === 'H1') {
                        el.style.color = '#4c1d95';
                        el.style.fontWeight = '900';
                        el.style.fontSize = '2.2rem';
                        el.style.marginTop = '1.5rem';
                        el.style.borderLeft = '6px solid #4c1d95';
                        el.style.paddingLeft = '15px';
                    } else if (tagName === 'H2') {
                        el.style.color = '#4c1d95';
                        el.style.fontWeight = '800';
                        el.style.fontSize = '1.8rem';
                        el.style.marginTop = '1.2rem';
                        el.style.borderBottom = '2px solid rgba(76, 29, 149, 0.15)';
                        el.style.paddingBottom = '5px';
                    } else if (tagName === 'H3') {
                        el.style.color = '#4c1d95';
                        el.style.fontWeight = '700';
                        el.style.fontSize = '1.4rem';
                        el.style.marginTop = '1rem';
                    } else if (tagName === 'P') {
                        el.style.marginBottom = '1.5rem';
                        el.style.lineHeight = '1.85';
                        el.style.color = '#262626';
                    } else if (tagName === 'BLOCKQUOTE') {
                        el.style.borderLeft = '4px solid #e5e7eb';
                        el.style.paddingLeft = '1rem';
                        el.style.fontStyle = 'italic';
                        el.style.color = '#6b7280';
                        el.style.margin = '1.5rem 0';
                    } else if (tagName === 'UL' || tagName === 'OL') {
                        el.style.paddingLeft = '1.5rem';
                        el.style.marginBottom = '1.5rem';
                    } else if (tagName === 'LI') {
                        el.style.marginBottom = '0.5rem';
                    }

                    // Recursively apply to children
                    Array.from(el.children).forEach(child => cleanAndFormat(child as HTMLElement));
                };

                Array.from(tempDiv.children).forEach(child => cleanAndFormat(child as HTMLElement));
                document.execCommand('insertHTML', false, tempDiv.innerHTML);
            } else {
                // Fallback to plain text if no HTML
                document.execCommand('insertText', false, text);
            }
        }
    };

    const processPastedFile = async (file: File) => {
        setIsUploadingFile(true);
        setToastNotification({ title: "Subiendo...", message: "Procesando archivo...", icon: "upload", isLoading: true });
        try {
             // 1. Check Storage Limit
             await checkAndConsumeLimit(userProfile.uid, 'storage', file.size);

             // Convert file to base64
             const base64 = await new Promise<string>((resolve, reject) => {
                 const reader = new FileReader();
                 reader.onload = () => resolve(reader.result as string);
                 reader.onerror = reject;
                 reader.readAsDataURL(file);
             });

             // Upload to Storage
             const downloadUrl = await uploadImageToStorage(base64);
             
             // 2. Add to Project Documents
             const newDoc: Document = {
                id: `proj-doc-${Date.now()}`,
                name: file.name,
                content: downloadUrl,
                uploadedAt: new Date().toISOString(),
                size: file.size,
                fileType: file.type
             };
             const currentDocs = project.documents || [];
             await updateProject(project.id, { documents: [newDoc, ...currentDocs] });

             let htmlToInsert = '';
             if (file.type.startsWith('image/')) {
                 htmlToInsert = `<div class="media-container" style="position: relative; display: inline-block;"><img src="${downloadUrl}" alt="Pasted Image" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);" /><div class="resize-handle" style="width: 15px; height: 15px; background: #4c1d95; position: absolute; bottom: 0; right: 0; cursor: se-resize; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div></div><p><br></p>`;
             } else {
                 htmlToInsert = `<div class="media-container"><a href="${downloadUrl}" target="_blank" class="file-attachment" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: #f3f4f6; border-radius: 8px; color: #4b5563; text-decoration: none; font-weight: 500;">📎 ${file.name}</a></div><p><br></p>`;
             }
             
             document.execCommand('insertHTML', false, htmlToInsert);
             debouncedSave();
             setToastNotification({ title: "Éxito", message: "Archivo adjuntado y guardado en Docs.", icon: "check" });
             rewardFileUpload();

        } catch (e: any) {
            console.error("Paste upload failed", e);
            if (e.code === 'PLAN_LIMIT_REACHED') {
                setProModalOpen(true);
                setToastNotification({ title: "Límite Alcanzado", message: "No tienes suficiente espacio.", icon: "lock" });
            } else {
                setToastNotification({ title: "Error", message: "No se pudo subir el archivo.", icon: "close" });
            }
        } finally {
            setIsUploadingFile(false);
        }
    };

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        let activeHandle: HTMLElement | null = null;
        let startX: number, startWidth: number;

        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('resize-handle')) {
                activeHandle = target;
                const img = activeHandle.previousElementSibling as HTMLElement;
                startX = e.clientX;
                startWidth = img.offsetWidth;
                e.preventDefault();
                e.stopPropagation();
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (activeHandle) {
                const img = activeHandle.previousElementSibling as HTMLElement;
                const deltaX = e.clientX - startX;
                img.style.width = `${Math.max(50, startWidth + deltaX)}px`;
            }
        };

        const onMouseUp = () => {
            if (activeHandle) {
                activeHandle = null;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                debouncedSave();
            }
        };

        editor.addEventListener('mousedown', onMouseDown);
        return () => editor.removeEventListener('mousedown', onMouseDown);
    }, [debouncedSave]);

    useEffect(() => {
        const editorNode = editorRef.current;
        const handleInteraction = () => { setTimeout(updateToolbarState, 0); };
        
        document.addEventListener('selectionchange', handleInteraction);
        editorNode?.addEventListener('keyup', handleInteraction);
        editorNode?.addEventListener('mouseup', handleInteraction);
        editorNode?.addEventListener('click', handleInteraction);
        editorNode?.addEventListener('focus', handleInteraction);
        
        return () => {
            document.removeEventListener('selectionchange', handleInteraction);
            editorNode?.removeEventListener('keyup', handleInteraction);
            editorNode?.removeEventListener('mouseup', handleInteraction);
            editorNode?.removeEventListener('click', handleInteraction);
            editorNode?.removeEventListener('focus', handleInteraction);
        };
    }, [updateToolbarState]);
    
    const handleNewNote = async () => {
        const newNote: Note = { id: `note-${Date.now()}`, title: t('untitledNote'), content: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        setNotes([newNote, ...notes]);
        setSelectedNote(newNote);
        await saveProjectNote(project.id, newNote);
        rewardFileUpload();
    };

    const handleDeleteNote = async (noteId: string) => {
        if (!window.confirm("¿Estás seguro de que deseas eliminar esta nota?")) return;
        const updatedNotes = notes.filter(n => n.id !== noteId);
        setNotes(updatedNotes);
        if (selectedNote?.id === noteId) {
            setSelectedNote(updatedNotes.length > 0 ? updatedNotes[0] : null);
        }
        
        try {
            await deleteProjectNote(project.id, noteId);
            
            // CLEANUP LEGACY
            if (project.notes && project.notes.some(n => n.id === noteId)) {
                 const cleanNotes = project.notes.filter(n => n.id !== noteId);
                 updateProject(project.id, { notes: cleanNotes });
            }
        } catch(e) {
             console.error("Error deleting note", e);
        }
    };
    
    const applyCommand = (command: string, value?: string) => {
        if (editorRef.current) editorRef.current.focus();
        document.execCommand(command, false, value);
        setTimeout(updateToolbarState, 50);
        if (editorRef.current && selectedNote) debouncedSave();
    };

    const handleCreateTable = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const text = selection.toString().trim();
        if (!text) {
            // Insert empty 2x2 table if no selection
            const emptyTable = `
                <table style="width: 100%; border-collapse: collapse; margin: 1rem 0; border: 1px solid #e5e7eb;">
                    <tbody>
                        <tr>
                            <td style="border: 1px solid #e5e7eb; padding: 8px; min-width: 50px;"></td>
                            <td style="border: 1px solid #e5e7eb; padding: 8px; min-width: 50px;"></td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #e5e7eb; padding: 8px; min-width: 50px;"></td>
                            <td style="border: 1px solid #e5e7eb; padding: 8px; min-width: 50px;"></td>
                        </tr>
                    </tbody>
                </table>
                <p><br></p>
            `;
            document.execCommand('insertHTML', false, emptyTable);
            return;
        }

        // Convert selected text to table
        // Split by lines for rows, and by tabs or multiple spaces for columns
        const rows = text.split('\n');
        let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 1rem 0; border: 1px solid #e5e7eb;"><tbody>';
        
        rows.forEach(row => {
            const cols = row.split(/\t| {2,}/);
            tableHtml += '<tr>';
            cols.forEach(col => {
                tableHtml += `<td style="border: 1px solid #e5e7eb; padding: 8px;">${col.trim()}</td>`;
            });
            tableHtml += '</tr>';
        });
        
        tableHtml += '</tbody></table><p><br></p>';
        document.execCommand('insertHTML', false, tableHtml);
        debouncedSave();
    };

    const handleTextTransform = (type: 'uppercase' | 'lowercase') => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        if (range.collapsed) return;

        // 1. Clone content to process it safely
        const fragment = range.cloneContents();
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(fragment);

        // 2. Transform text nodes recursively using TreeWalker
        const transformWalker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
        let currentNode = transformWalker.nextNode();
        while (currentNode) {
            if (currentNode.textContent) {
                currentNode.textContent = type === 'uppercase' 
                    ? currentNode.textContent.toUpperCase() 
                    : currentNode.textContent.toLowerCase();
            }
            currentNode = transformWalker.nextNode();
        }

        // 3. Insert the transformed HTML using execCommand
        // This preserves the undo stack and handles the replacement robustly
        document.execCommand('insertHTML', false, tempDiv.innerHTML);
        
        debouncedSave();
    };

    const handleAiRewrite = async () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
             setToastNotification({ title: "Info", message: "Selecciona el texto que deseas que Shivo diseñe.", icon: 'edit' });
             return;
        }

        const isBlocked = await checkQueryLimit();
        if (isBlocked) return;

        const textToRewrite = selection.toString();
        setIsAiRewriting(true);
        setToastNotification({ title: "Shivo Redactando...", message: "Diseñando contenido de alta calidad...", icon: 'ai', isLoading: true });
        
        try {
            const rawRewritedText = await rewriteText(textToRewrite, language);
            if (rawRewritedText) { 
                const htmlFormatted = formatMarkdownToHtmlForNotepad(rawRewritedText);
                // INSERTAR DIRECTAMENTE SIN CONTENEDOR MORADO NI BORDE
                document.execCommand('insertHTML', false, htmlFormatted); 
                debouncedSave(); 
                setToastNotification({ title: "Diseño Listo", message: "El texto se ha estructurado profesionalmente.", icon: 'check' });
            }
        } catch (error) { 
            console.error("Rewrite failed", error); 
        } finally { 
            setIsAiRewriting(false); 
        }
    };

    const handleDownloadPDF = async () => {
        if (!editorRef.current || !selectedNote) return;
        
        const element = editorRef.current;
        const opt = {
            margin: [10, 10, 20, 10] as [number, number, number, number], // Added bottom margin to prevent cut-off
            filename: `${selectedNote.title || 'Nota'}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        try {
            setToastNotification({ title: "Generando PDF...", message: "Por favor espera.", icon: "download", isLoading: true });
            await html2pdf().set(opt).from(element).save();
            setToastNotification({ title: "PDF Descargado", message: "Tu nota se ha guardado.", icon: "check" });
        } catch (e) {
            console.error("PDF generation failed", e);
            setToastNotification({ title: "Error", message: "No se pudo generar el PDF.", icon: "close" });
        }
    };

    const toggleFullScreen = () => {
        if (editorRef.current && selectedNote) {
            const currentContent = editorRef.current.innerHTML;
            const updatedNote = { ...selectedNote, content: currentContent };
            setSelectedNote(updatedNote);
            setNotes(prev => prev.map(n => n.id === selectedNote.id ? updatedNote : n));
        }
        setIsFullScreen(!isFullScreen);
    };

    const toolbarButtons = [
        { cmd: 'fullScreen', icon: isFullScreen ? 'close' : 'expand', title: isFullScreen ? 'Salir Pantalla Completa' : 'Pantalla Completa', action: toggleFullScreen },
        { separator: true },
        { cmd: 'undo', icon: 'undo', title: 'Deshacer' }, { cmd: 'redo', icon: 'redo', title: 'Rehacer' }, { separator: true },
        { cmd: 'bold', icon: 'bold', title: 'Negrita' }, { cmd: 'italic', icon: 'italic', title: 'Cursiva' }, { cmd: 'underline', icon: 'underline', title: 'Subrayado' }, { cmd: 'strikeThrough', icon: 'strikethrough', title: 'Tachado' }, 
        { action: handleCreateTable, icon: 'table', title: 'Crear Tabla desde Selección' },
        { separator: true },
        { action: () => handleTextTransform('uppercase'), icon: 'type', title: 'MAYÚSCULAS', label: 'AA' },
        { action: () => handleTextTransform('lowercase'), icon: 'type', title: 'minúsculas', label: 'aa' },
        { separator: true },
        { cmd: 'formatBlock', value: 'H1', icon: 'heading', title: 'Título Principal', label: 'H1' },
        { cmd: 'formatBlock', value: 'H2', icon: 'heading', title: 'Subtítulo Pro', label: 'H2' },
        { cmd: 'formatBlock', value: 'H3', icon: 'heading', title: 'Sección', label: 'H3' },
        { cmd: 'formatBlock', value: 'P', icon: 'paragraph', title: 'Párrafo', label: '¶' },
        { cmd: 'formatBlock', value: 'BLOCKQUOTE', icon: 'quote', title: 'Cita', label: '""' },
        { separator: true },
        { cmd: 'insertOrderedList', icon: 'list-ol', title: 'Lista Numerada' }, 
        { cmd: 'insertUnorderedList', icon: 'list-ul', title: 'Viñetas' }, 
        { separator: true },
        { cmd: 'justifyLeft', icon: 'alignLeft', title: 'Izquierda' }, { cmd: 'justifyCenter', icon: 'alignCenter', title: 'Centro' }, { cmd: 'justifyRight', icon: 'alignRight', title: 'Derecha' }, { cmd: 'justifyFull', icon: 'alignJustify', title: 'Justificado' },
        { separator: true },
        { cmd: 'foreColor', value: '#ef4444', icon: 'palette', title: 'Rojo', label: '🔴' },
        { cmd: 'foreColor', value: '#3b82f6', icon: 'palette', title: 'Azul', label: '🔵' },
        { cmd: 'foreColor', value: '#10b981', icon: 'palette', title: 'Verde', label: '🟢' },
        { cmd: 'foreColor', value: '#000000', icon: 'palette', title: 'Negro', label: '⚫' },
        { cmd: 'hiliteColor', value: '#fef08a', icon: 'highlighter', title: 'Resaltar Amarillo', label: '🖊️' },
        { separator: true },
        { cmd: 'removeFormat', icon: 'eraser', title: 'Borrar Formato' },
        { cmd: 'insertHorizontalRule', icon: 'minus', title: 'Línea Horizontal' },
        { separator: true },
        { action: () => setIsHtmlModalOpen(true), icon: 'code', title: 'Insertar HTML' },
        { action: handleDownloadPDF, icon: 'download', title: 'Descargar PDF' },
    ];

    const planConfig = getPlanConfig(userProfile.plan);
    const chatLimit = (planConfig.limits as any).ai_chat_daily_queries || 30;
    const chatUsed = userUsage?.counters?.daily_chat_count || 0;

    const content = (
        <div className={`flex flex-col md:flex-row gap-6 animate-fade-in bg-white dark:bg-neutral-900 p-4 rounded-lg ${isFullScreen ? 'fixed inset-0 !z-[300000] !m-0 !rounded-none !p-0' : 'h-full'}`}>
            
            <div className={`${selectedNote && !isFullScreen ? 'hidden' : isFullScreen ? 'hidden md:flex' : 'flex'} md:flex w-full md:w-1/3 md:max-w-xs flex-col bg-light-surface dark:bg-dark-surface rounded-xl shadow-sm p-0 overflow-hidden h-full border-r border-light-border dark:border-dark-border`}>
                <div className="p-4 border-b border-light-border dark:border-dark-border">
                    <Button onClick={handleNewNote} variant="primary" className="w-full">
                        <Icon name="plus" className="w-4 h-4"/> {t('newNote')}
                    </Button>
                </div>
                {isLoadingNotes ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Spinner />
                    </div>
                ) : notes.length > 0 ? (
                    <ul className="flex-1 overflow-y-auto custom-scrollbar">
                        {notes.map(note => (
                            <li key={note.id} className="group relative">
                                <button onClick={() => setSelectedNote(note)} className={`w-full text-left p-4 pr-12 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${selectedNote?.id === note.id ? 'bg-brand-accent/20 border-l-4 border-brand-primary shadow-sm' : ''}`}>
                                    <p className="font-bold truncate text-sm text-neutral-800 dark:text-neutral-200">{note.title}</p>
                                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mt-1">{new Date(note.createdAt).toLocaleDateString()}</p>
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Eliminar Nota"
                                >
                                    <Icon name="trash" className="w-4 h-4"/>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center p-4 opacity-40">
                        <div>
                            <Icon name="notepad" className="w-16 h-16 mx-auto text-neutral-400" />
                            <p className="mt-4 text-sm text-neutral-500 font-bold">{t('noNotesInProject')}</p>
                        </div>
                    </div>
                )}
            </div>

            <div className={`${selectedNote ? 'flex' : 'hidden'} md:flex flex-1 flex-col h-full overflow-hidden bg-white dark:bg-dark-surface rounded-xl shadow-2xl ${isFullScreen ? '!rounded-none' : ''}`}>
                {selectedNote ? (
                    <>
                        <div className="flex-shrink-0 p-2 border-b border-light-border dark:border-dark-border sticky top-0 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md z-20 overflow-x-auto no-scrollbar">
                             <div className="flex items-center gap-1 p-1 min-w-max">
                                <Button variant="ghost" size="sm" className="!p-2 md:hidden text-neutral-900 dark:text-white" onClick={() => setSelectedNote(null)}>
                                    <Icon name="chevronDown" className="w-5 h-5 transform rotate-90"/>
                                </Button>
                                {toolbarButtons.map((btn, i) => {
                                    if (btn.separator) return <div key={`sep-${i}`} className="h-6 border-l border-gray-300 dark:border-gray-600 mx-1"></div>;
                                    const isActive = btn.cmd && activeFormats[btn.cmd];
                                    return (
                                        <button 
                                            key={btn.cmd + (btn.value || '') + i} 
                                            className={`p-2 rounded-lg transition-colors flex items-center justify-center min-w-[32px] ${isActive ? 'bg-brand-accent/30 text-brand-primary' : 'text-neutral-800 dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700'}`} 
                                            onMouseDown={(e) => { 
                                                e.preventDefault(); 
                                                if (btn.action) {
                                                    btn.action();
                                                } else {
                                                    applyCommand(btn.cmd!, btn.value); 
                                                }
                                            }} 
                                            title={btn.title}
                                        >
                                            {btn.label ? <span className="text-[10px] font-black">{btn.label}</span> : <Icon name={btn.icon as any} className="w-5 h-5"/>}
                                        </button>
                                    )
                                })}
                                <div className="flex-grow"></div>
                                <div className="bg-brand-primary/5 px-3 py-1 rounded-xl border border-brand-primary/10 flex flex-col items-end justify-center mr-2">
                                     <span className="text-[7px] font-black uppercase text-brand-primary tracking-tighter leading-none">Consultas IA</span>
                                     <span className="text-[10px] font-bold text-neutral-700 dark:text-white leading-none">{chatUsed}/{chatLimit}</span>
                                </div>
                                <Button variant="ghost" size="sm" className={`!p-2 ${isAiRewriting ? 'animate-pulse text-brand-primary' : 'text-neutral-800 dark:text-white'}`} onClick={handleAiRewrite} disabled={isAiRewriting} title="Diseño IA Avanzado">
                                    <Icon name="ai" className="w-6 h-6"/>
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-8 h-full flex flex-col custom-scrollbar bg-white dark:bg-neutral-900">
                             <div className="mx-auto min-h-full w-full relative flex justify-center pb-20">
                                <style>{`
                                    .notepad-editor {
                                        min-height: 100%;
                                        width: 100%;
                                        max-width: 850px;
                                        background-color: transparent;
                                        color: black;
                                        padding: 0 20px;
                                        line-height: 1.6;
                                        font-size: 11pt;
                                        overflow-wrap: break-word;
                                    }
                                    
                                    /* Force black text base, but allow overrides */
                                    .notepad-editor {
                                        color: black;
                                    }

                                    /* Print & PDF optimizations */
                                    @media print {
                                        .notepad-editor {
                                            box-shadow: none;
                                            margin: 0;
                                            width: 100%;
                                            background-image: none;
                                        }
                                    }
                                    
                                    .notepad-editor p, .notepad-editor h1, .notepad-editor h2, .notepad-editor h3, .notepad-editor img, .notepad-editor li, .notepad-editor blockquote {
                                        page-break-inside: avoid;
                                        break-inside: avoid;
                                    }

                                    .notepad-editor h1 {
                                        font-size: 24pt;
                                        font-weight: 900;
                                        color: #4c1d95 !important;
                                        margin-top: 24pt;
                                        margin-bottom: 12pt;
                                        line-height: 1.2;
                                    }
                                    .notepad-editor h2 {
                                        font-size: 18pt;
                                        font-weight: 800;
                                        color: #4c1d95 !important;
                                        margin-top: 18pt;
                                        margin-bottom: 9pt;
                                        border-bottom: 2px solid rgba(76, 29, 149, 0.15);
                                        padding-bottom: 4pt;
                                    }
                                    .notepad-editor h3 {
                                        font-size: 14pt;
                                        font-weight: 700;
                                        color: #4c1d95 !important;
                                        margin-top: 14pt;
                                        margin-bottom: 6pt;
                                    }
                                    .notepad-editor p {
                                        margin-bottom: 12pt;
                                    }
                                    .notepad-editor ul {
                                        margin-bottom: 12pt;
                                        padding-left: 24pt;
                                        list-style-type: disc;
                                    }
                                    .notepad-editor ol {
                                        margin-bottom: 12pt;
                                        padding-left: 24pt;
                                        list-style-type: decimal;
                                    }
                                    .notepad-editor li {
                                        margin-bottom: 4pt;
                                    }
                                    .notepad-editor blockquote {
                                        border-left: 4px solid #e5e7eb;
                                        padding-left: 12pt;
                                        font-style: italic;
                                        color: #6b7280 !important;
                                        margin: 12pt 0;
                                    }
                                    
                                    .media-container {
                                        margin: 12pt 0;
                                    }
                                    .media-container img {
                                        max-width: 100%;
                                        height: auto;
                                        border-radius: 4px;
                                    }
                                `}</style>

                                <div 
                                    ref={editorRef} 
                                    onInput={() => { updateCounts(); debouncedSave(); }} 
                                    onPaste={handlePaste}
                                    contentEditable 
                                    suppressContentEditableWarning 
                                    className="focus:outline-none font-sans outline-none notepad-editor" 
                                />
                            </div>
                        </div>

                        <div className="flex-shrink-0 p-3 border-t border-light-border dark:border-dark-border text-right bg-neutral-50 dark:bg-neutral-900/50 flex justify-between items-center px-6">
                            <div className="flex items-center gap-3">
                                {isUploadingFile && <Spinner className="!w-4 !h-4 !p-0" text="Sincronizando con Drive del proyecto..." />}
                                <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] animate-pulse">Tip: Pega archivos para asignarlos a este proyecto automáticamente</span>
                            </div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{counts.words} palabras | {counts.chars} caracteres</p>
                        </div>
                    </>
                ) : (
                    <div className="hidden md:flex flex-1 items-center justify-center text-neutral-400 opacity-50">
                        <div className="text-center">
                            <Icon name="notepad" className="w-20 h-20 mx-auto mb-4" />
                            <p className="text-xl font-bold uppercase tracking-widest">Selecciona una nota para editar</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const fullContent = (
        <>
            {content}
            <Modal isOpen={isHtmlModalOpen} onClose={() => setIsHtmlModalOpen(false)} title="Insertar Código HTML">
                <div className="p-4 flex flex-col gap-4">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        Pega tu código HTML aquí. Se renderizará perfectamente aislado dentro de la nota.
                    </p>
                    <Textarea
                        value={htmlInput}
                        onChange={(e) => setHtmlInput(e.target.value)}
                        placeholder="<h1>Hola Mundo</h1>..."
                        className="min-h-[300px] font-mono text-sm"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <Button variant="ghost" onClick={() => setIsHtmlModalOpen(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={confirmInsertHTML}>Insertar HTML</Button>
                    </div>
                </div>
            </Modal>
        </>
    );

    if (isFullScreen) return createPortal(fullContent, document.body);
    return fullContent;
};

export default Notepad;