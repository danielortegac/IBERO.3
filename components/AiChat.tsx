import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import Icon from './Icon';
import type { ChatMessage, Note, UserProfile } from '../types';
import { getAiChatResponseStream, buildPersonalizedSystemInstruction, cleanTextForSpeech } from '../services/geminiService';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import Textarea from './ui/Textarea';
import Button from './ui/Button';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import { useSwipe } from '../hooks/useSwipe';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import DriveFilePicker from './ui/DriveFilePicker';
import { executeAssistantActions, extractActions, cleanTextFromActions } from '../services/actionExecutor';
import { detectActionIntent } from '../services/actionRouter';
import { ArtifactResultCard, TaskResultCard, MeetingResultCard, ProjectResultCard, MailDraftResultCard, EmailSentResultCard } from './ActionResultCards';
import Modal from './ui/Modal';
import { ChatChart } from './ChatChart';

interface AiChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const AiChat: React.FC<AiChatProps> = ({ isOpen, onClose }) => {
  const { t, language } = useTranslation();
  const { setCurrentView, globalChats, setGlobalChats, activeGlobalChatId, isAiMuted, setIsAiMuted, userProfile, checkQueryLimit, checkWebSearchLimit, projects, createTask, addProject, updateProject, currentUser, addNewGlobalChat, setToastNotification, setSelectedProjectId, allUsers, sendDirectMessage, setLiveSessionMode, setLiveSessionContext, allLeads, setProModalOpen, emailAccounts, setMailDraft, mailLists, mailContacts } = useContext(AppContext);
  const { scheduleMeeting } = useContext(CallContext);
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const { onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
      onSwipedRight: onClose
  });
  
  const quickChat = globalChats.find(c => c.id === activeGlobalChatId) || globalChats[0];
  
  const streamingBufferRef = useRef('');
  const displayedTextRef = useRef('');
  const isStreamingActiveRef = useRef(false);
  const typewriterIntervalRef = useRef<number | null>(null);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Fix: base64Data must be optional to match the updated ChatMessage type (it's stripped when loading from DB)
  const [attachedFiles, setAttachedFiles] = useState<{ name: string, url: string, type: string, base64Data?: string }[]>([]);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);

  const [assigningArtifact, setAssigningArtifact] = useState<any>(null);
  const [isAssignModalOpen, setAssignModalOpen] = useState(false);

  const handleSendToProject = (artifact: any) => {
      setAssigningArtifact(artifact);
      setAssignModalOpen(true);
  };

  const finalizeSendToProject = async (artifact: any, pId: string) => {
      try {
          const project = projects.find(p => p.id === pId);
          if (!project) return;
          const newDoc = {
              id: `doc-${Date.now()}`,
              name: artifact.name,
              content: artifact.downloadUrl,
              url: artifact.downloadUrl,
              uploadedAt: new Date().toISOString(),
              size: artifact.sizeBytes || 0,
              fileType: artifact.type,
              primaryFormat: artifact.primaryFormat || artifact.type?.split('/')[1] || 'pdf',
              variants: artifact.variants || {},
              artifactId: artifact.artifactId || artifact.id,
              source: "Goatify Docs"
          };
          const projectRef = doc(db, "projects", pId);
          const updatedDocs = [...(project.documents || []), newDoc];
          await updateDoc(projectRef, { documents: updatedDocs });
          setToastNotification({title: "Guardado", message: `"${artifact.name}" se guardó en documentos de ${project.name}`, type: "success"});
      } catch (e: any) {
          setToastNotification({title: "Error", message: "No se pudo guardar en el proyecto", type: "error"});
      } finally {
          setAssignModalOpen(false);
          setAssigningArtifact(null);
      }
  };

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');

  const shouldAutoScrollRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const messageList = useMemo(() => quickChat?.history || [], [quickChat?.history]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    shouldAutoScrollRef.current = nearBottom;
    setIsAtBottom(nearBottom);
  };

  const saveChatHistoryToDb = async (chatId: string, history: ChatMessage[]) => {
      if (!currentUser || !chatId) return;
      
      // LIMPIEZA CRÍTICA: Eliminar Base64 antes de guardar para no romper el límite de 1MB
      const rawSanitized = history.filter(m => !m.isLoading).map(m => {
          const cleanMsg = { ...m };
          if (cleanMsg.files) {
              cleanMsg.files = cleanMsg.files.map(f => {
                  const { base64Data, ...rest } = f;
                  return rest;
              });
          }
          return cleanMsg;
      });

      const sanitizedHistory = JSON.parse(JSON.stringify(rawSanitized, (key, value) => 
        value === undefined ? null : value
      ));

      if (sanitizedHistory.length > 0) {
         try {
             const chatRef = doc(db, `users/${currentUser.uid}/globalChats`, chatId);
             const saveData = JSON.parse(JSON.stringify({ 
                history: sanitizedHistory, 
                updatedAt: new Date().toISOString(), 
                id: chatId, 
                name: quickChat?.name || 'Chat' 
             }, (key, value) => value === undefined ? null : value));
             await setDoc(chatRef, saveData, { merge: true });
         } catch(e) { 
             console.error("Error al guardar historial sanetizado:", e); 
         }
      }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (isOpen && chatRef.current && !chatRef.current.contains(event.target as Node)) {
            onClose();
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);
  
  const scrollToBottom = (force = false) => {
    const container = messagesContainerRef.current;
    if (container && (shouldAutoScrollRef.current || force)) {
        container.scrollTop = container.scrollHeight;
    }
  };

  useEffect(() => {
    if (isOpen) {
        shouldAutoScrollRef.current = true;
        scrollToBottom(true);
        setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [isOpen, activeGlobalChatId]);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
        scrollToBottom();
    }
  }, [quickChat?.history.length, isLoading]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const url = event.target?.result as string;
                    if (attachedFiles.length < 5) {
                        setAttachedFiles(prev => [...prev, { name: `Pasted_${Date.now()}.png`, type: 'image/png', url, base64Data: url.split(',')[1] }]);
                    }
                };
                reader.readAsDataURL(blob);
            }
        }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    selectedFiles.forEach((file: File) => {
        if (attachedFiles.length >= 5) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const url = ev.target?.result as string;
            setAttachedFiles(prev => {
                if (prev.length >= 5) return prev;
                return [...prev, { name: file.name, type: file.type, url, base64Data: url.split(',')[1] }];
            });
        };
        reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDriveFileSelect = (fileData: { name: string, url: string, type: string, base64Data: string }) => {
      setAttachedFiles(prev => [...prev, fileData]);
  };

  const removeFile = (idx: number) => setAttachedFiles(prev => prev.filter((_, i) => i !== idx));

  const handleStartEdit = (msg: ChatMessage) => {
      setEditingMessageId(msg.id);
      setEditInput(msg.text);
  };

  const cancelEdit = () => {
      setEditingMessageId(null);
      setEditInput('');
  };

  const saveEdit = async (msgId: string) => {
      const h = quickChat.history;
      const idx = h.findIndex(m => m.id === msgId);
      if (idx === -1) return;
      
      const newBaseHistory = h.slice(0, idx);
      const editedMsg = { ...h[idx], text: editInput };
      setEditingMessageId(null);
      setEditInput('');
      
      await handleSend(editInput, editedMsg.files || [], newBaseHistory);
  };

  const handleSend = async (promptOverride?: string, overrideFiles?: ChatMessage['files'], baseHistory?: ChatMessage[]) => {
    const messageText = promptOverride !== undefined ? promptOverride : input;
    const filesToSend = overrideFiles || attachedFiles;
    
    if ((messageText.trim() === '' && filesToSend.length === 0) || isLoading) return;
    
    // LIMIT CHECK
    const isBlocked = await checkQueryLimit();
    if (isBlocked) return;

    // --- DETERMINISTIC ROUTER ---
    const intent = detectActionIntent(messageText);

    setIsLoading(true);
    let finalFilesToSend = [...filesToSend];
    if (finalFilesToSend.length > 0 && currentUser) {
        const { uploadStringWithQuotaCheck, safeStoragePath } = await import('../services/storageQuotaService');
        const { doc, setDoc, arrayUnion } = await import('firebase/firestore');

        for (let i = 0; i < finalFilesToSend.length; i++) {
            const f = finalFilesToSend[i];
            if (f.url && f.url.startsWith('data:')) {
                try {
                    const safeFileName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const { url: downloadUrl } = await uploadStringWithQuotaCheck({
                        userId: currentUser.uid,
                        data: f.base64Data || '',
                        format: 'base64',
                        sizeBytes: f.base64Data ? Math.floor(f.base64Data.length * 0.75) : 0,
                        path: safeStoragePath('drive', currentUser.uid, 'ai-chat', `${Date.now()}_${safeFileName}`),
                        metadata: { contentType: f.type || 'application/octet-stream' },
                        plan: userProfile?.plan
                    });
                    
                    finalFilesToSend[i] = { ...f, url: downloadUrl };

                    const driveFileId = `aichat-file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    const driveFile = {
                        id: driveFileId,
                        name: f.name,
                        url: downloadUrl,
                        type: f.type || 'application/octet-stream',
                        size: f.base64Data ? Math.floor(f.base64Data.length * 0.75) : 0,
                        date: new Date().toISOString(),
                        origin: 'Quick Assistant',
                        parentId: 'personal',
                        parentName: 'Personal',
                        isUnassigned: true
                    };
                    const driveSettingsRef = doc(db, 'users', currentUser.uid, 'settings', 'drive');
                    await setDoc(
                        driveSettingsRef,
                        { personalFiles: arrayUnion(driveFile), updatedAt: new Date().toISOString() },
                        { merge: true }
                    );
                } catch (e) {
                    console.error('Failed to upload file to Drive during chat', e);
                }
            }
        }
    }

    const userMessage: ChatMessage = { id: `msg-u-${Date.now()}`, role: 'user', text: messageText, files: finalFilesToSend };
    const chatId = quickChat.id;
    let currentHistory = [...(baseHistory || quickChat.history), userMessage];
    
    setGlobalChats(prev => prev.map(c => c.id === chatId ? { ...c, history: currentHistory } : c));
    setInput(''); setAttachedFiles([]);

    if (intent && intent.type !== 'GENERATE_ARTIFACT') {
        const modelMsgId = `msg-m-${Date.now()}`;
        const appContext = {
            userProfile, projects, currentUser, allUsers, sendDirectMessage,
            createTask, addProject, updateProject, scheduleMeeting: scheduleMeeting || (() => {}), setCurrentView,
            setToastNotification, emailAccounts, setMailDraft
        } as any;

        try {
            const results = await executeAssistantActions([{ ...intent.params, ACTION: intent.type }], appContext, chatId);
            const result = results[0];
            
            const modelMsg: ChatMessage = {
                id: modelMsgId,
                role: 'model',
                text: result.success ? `✅ Acción ejecutada: ${result.message}` : `❌ Falló la acción: ${result.message}`,
                actionResults: results.map(r => ({ type: r.actionType as any, success: r.success, message: r.message, data: r.data })),
                isLoading: false
            };

            const finalHistory = [...currentHistory, modelMsg];
            setGlobalChats(prev => prev.map(c => c.id === chatId ? { ...c, history: finalHistory } : c));
            setIsLoading(false);
            await saveChatHistoryToDb(chatId, finalHistory);
            return;
        } catch (err) {
            console.error("[ACTION ROUTER] Execution failed:", err);
        }
    }

    const lowerText = messageText.toLowerCase();
    const isInternalQuery = /mis? proyectos|mi agenda|calendario|mis? tareas|mi crm|mi perfil|mi cuenta|mis finanzas|mis? actividades|qué tengo para|mis datos|mails?|correos?/i.test(lowerText);
    const isExplicitSearch = /busca|investiga|google|internet|noticias|tendencias|web|enlace|link|quién es|qué pasó/i.test(lowerText);
    const needsSearch = /hoy|ahora|actual|noticia|precio|clima|evento|reciente/i.test(lowerText);
    
    const isGroundedRequest = isExplicitSearch || (needsSearch && !isInternalQuery);
    
    let groundingLimitReached = false;
    if (isGroundedRequest) {
        try {
            const blocked = await checkWebSearchLimit();
                if (blocked) groundingLimitReached = true;
        } catch (e: any) {
            if (e.code === "PLAN_LIMIT_REACHED") {
                groundingLimitReached = true;
            }
        }
    }

    streamingBufferRef.current = ''; displayedTextRef.current = ''; isStreamingActiveRef.current = true;
    
    shouldAutoScrollRef.current = true;
    setTimeout(() => scrollToBottom(true), 30);

    try {
        const systemInstruction = buildPersonalizedSystemInstruction(userProfile, 'Eres Shivo.', { projects, leads: allLeads, allUsers, accounts: emailAccounts, mailLists, mailContacts }, language);
        const stream = await getAiChatResponseStream(currentHistory, { 
            systemInstruction, 
            language,
            userPlan: userProfile.plan,
            groundingLimitReached,
            isGroundedRequest
        });
        const modelMessageId = `msg-m-${Date.now()}`;
        
        if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
        
        typewriterIntervalRef.current = window.setInterval(() => {
            const cleanTarget = streamingBufferRef.current.replace(/<<<ACTION:[\s\S]*?(?:>>>|$)/g, '\n\n*⏳ Procesando solicitud en Goatify...*').trim();
            if (displayedTextRef.current.length < cleanTarget.length) {
                const inc = Math.ceil((cleanTarget.length - displayedTextRef.current.length) / 8) + 12;
                displayedTextRef.current = cleanTarget.slice(0, displayedTextRef.current.length + inc);
                setGlobalChats(prev => prev.map(c => {
                    if (c.id === chatId) {
                         const h = [...c.history]; const mIdx = h.findIndex(m => m.id === modelMessageId);
                         const newMsg = { id: modelMessageId, role: 'model' as const, text: displayedTextRef.current, isLoading: true };
                         if (mIdx > -1) h[mIdx] = newMsg; else h.push(newMsg);
                         return { ...c, history: h };
                    }
                    return c;
                }));
                if (shouldAutoScrollRef.current) scrollToBottom();
            } else if (!isStreamingActiveRef.current) {
                clearInterval(typewriterIntervalRef.current!); typewriterIntervalRef.current = null;
                finalizeResponse(chatId, modelMessageId, currentHistory);
            }
        }, 20);
        
        for await (const chunk of stream) { if (chunk.text) streamingBufferRef.current += chunk.text; }
        isStreamingActiveRef.current = false;
    } catch (error) { setIsLoading(false); isStreamingActiveRef.current = false; }
  };

  const finalizeResponse = async (chatId: string, modelMessageId: string, currentHistory: ChatMessage[]) => {
    const fullRawText = streamingBufferRef.current;
    const actions = extractActions(fullRawText);
    
    let actionResults: any[] = [];
    let newArtifacts: any[] = [];

    if (actions.length > 0) {
        const appContext = {
            userProfile, projects, currentUser, allUsers, sendDirectMessage,
            createTask, addProject, updateProject, scheduleMeeting: scheduleMeeting || (() => {}), setCurrentView,
            setToastNotification, emailAccounts, setMailDraft
        } as any;

        const results = await executeAssistantActions(actions, appContext, chatId);
        
        actionResults = results
            .filter(r => !(r.actionType === 'GENERATE_ARTIFACT' && r.success))
            .map(r => ({
                type: r.actionType,
                success: r.success,
                message: r.message,
                data: r.data
            }));

        newArtifacts = results
            .filter(r => r.actionType === 'GENERATE_ARTIFACT' && r.success && r.data?.downloadUrl)
            .map(r => ({
                id: r.data.id || `art-${Date.now()}`,
                artifactId: r.data.artifactId,
                name: r.data.name,
                type: r.data.type,
                downloadUrl: r.data.downloadUrl,
                sizeBytes: r.data.sizeBytes,
                content: r.data.content,
                driveSaved: r.data.driveSaved,
                drivePath: r.data.drivePath,
                primaryFormat: r.data.primaryFormat,
                variants: r.data.variants
            }));
    }

    const cleanText = cleanTextFromActions(fullRawText);
    const finalModelMsg: ChatMessage = { 
        id: modelMessageId, 
        role: 'model', 
        text: cleanText, 
        isLoading: false,
        artifacts: newArtifacts,
        actionResults: actionResults
    };

    // Si hay resultados de listas (email/contactos), disparar interpretación automática LOCAL (sin handleSend)
    if (actionResults.some((r: any) => r.type === 'LIST_EMAILS' || r.type === 'LIST_CONTACTS')) {
        const listResult = actionResults.find((r: any) => r.type === 'LIST_EMAILS');
        if (listResult && listResult.data) {
            const emails = listResult.data;
            let summaryString = `\n\n📬 **Resumen de correos recientes (${emails.length} encontrados):**\n`;
            emails.slice(0, 10).forEach((e: any, idx: number) => {
                const icon = e.important ? '🔥' : (e.read ? '✉️' : '🔵');
                const adj = e.hasAttachments ? '📎' : '';
                summaryString += `${idx + 1}. ${icon} **${e.from}**: ${e.subject} ${adj}\n   *${e.summary}*\n   _${e.date}_\n\n`;
            });
            
            if (cleanText.includes("Acción ejecutada") || !cleanText.trim()) {
                finalModelMsg.text = summaryString;
            } else {
                finalModelMsg.text += `\n---` + summaryString;
            }
        }
    }

    const finalHistory = [...currentHistory, finalModelMsg];
    setGlobalChats(prev => prev.map(c => c.id === chatId ? { ...c, history: finalHistory } : c));
    setIsLoading(false); 
    window.dispatchEvent(new CustomEvent('goatify:usage-updated', { detail: { source: 'quick_chat_stream_finished' } }));
    await saveChatHistoryToDb(chatId, finalHistory);
  };

  const handleStartLiveAudio = () => {
    setLiveSessionContext({ chatId: quickChat.id, isGlobal: true, history: quickChat.history });
    setLiveSessionMode('audio');
  };

  const handleStartLiveVideo = () => {
    setLiveSessionContext({ chatId: quickChat.id, isGlobal: true, history: quickChat.history });
    setLiveSessionMode('video');
  };

  return (
    <div
      ref={chatRef}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      className={`fixed top-0 right-0 h-full bg-light-surface dark:bg-dark-surface shadow-2xl transition-transform duration-300 ease-in-out flex flex-col z-[13000] ${isOpen ? 'translate-x-0' : 'translate-x-full'} w-full sm:w-[450px] lg:w-1/2 border-l border-light-border dark:border-dark-border`}
    >
      <DriveFilePicker isOpen={isDrivePickerOpen} onClose={() => setIsDrivePickerOpen(false)} onSelect={handleDriveFileSelect} />
      
      <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border flex-none bg-white dark:bg-dark-surface z-10 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary rounded-full flex items-center justify-center text-white shadow-md"><Icon name="ai" className="w-6 h-6"/></div>
            <div><h2 className="text-lg font-bold">Shivo</h2><div className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><p className="text-xs text-brand-primary dark:text-brand-accent font-medium">Activo</p></div></div>
        </div>
        <div className="flex items-center gap-1">
          <Button onClick={() => { setCurrentView('aiStudio'); window.location.hash = 'aiStudio/chat'; onClose(); }} variant="ghost" size="sm" className="!p-2 text-neutral-500 hover:text-brand-primary transition-colors"><Icon name="expand" className="w-4 h-4" /></Button>
          <Button onClick={onClose} variant="ghost" size="sm" className="!p-2 text-neutral-500 hover:text-red-500 transition-colors"><Icon name="close" className="w-4 h-4" /></Button>
        </div>
      </div>

      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-6 bg-neutral-50 dark:bg-[#0a0a0a] custom-scrollbar relative pb-32">
        {messageList.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-subtle-slide-in-up group`}>
            <div className={`relative max-w-[90%] rounded-2xl px-5 py-3 shadow-sm text-sm ${msg.role === 'user' ? 'bg-brand-primary text-white rounded-br-none' : 'bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-100 dark:border-gray-700'}`}>
              
              {msg.files && msg.files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {msg.files.map((f, i) => (
                        <div key={i} className="p-1 bg-black/10 rounded-lg max-w-[120px] cursor-pointer" onClick={() => window.open(f.url, '_blank')}>
                            {f.type.startsWith('image/') ? <img src={f.url} className="rounded h-20 w-auto object-contain" /> : <div className="flex items-center gap-2 p-2 text-[10px] font-bold text-white"><Icon name="folder" className="w-3 h-3"/><span className="truncate">{f.name}</span></div>}
                        </div>
                    ))}
                </div>
              )}

              {editingMessageId === msg.id ? (
                  <div className="space-y-2 min-w-[200px]">
                      <Textarea value={editInput} onChange={e => setEditInput(e.target.value)} className="w-full text-white bg-black/20" />
                      <div className="flex justify-end gap-2">
                          <button onClick={cancelEdit} className="text-[10px] uppercase font-bold text-white/70">Cancelar</button>
                          <button onClick={() => saveEdit(msg.id)} className="text-[10px] uppercase font-bold text-white">Guardar</button>
                      </div>
                  </div>
              ) : (
                  <>
                    {msg.isLoading && !msg.text ? <div className="flex gap-1.5 h-5 items-center px-1"><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-150"></div></div> : <ChatMessageRenderer text={msg.text} className={msg.role === 'user' ? 'text-white' : ''} />}

                    {msg.artifacts && msg.artifacts.length > 0 && (
                        <div className="flex flex-col gap-2 mb-3 mt-1">
                            {msg.artifacts.map((art, i) => (
                                <ArtifactResultCard key={i} artifact={art} onSendToProject={() => handleSendToProject(art)} />
                            ))}
                        </div>
                    )}
                    {msg.actionResults && msg.actionResults.length > 0 && (
                        <div className="flex flex-col gap-3 mb-1 mt-2">
                            {msg.actionResults.map((result, i) => (
                                <React.Fragment key={i}>
                                    {result.type === 'GENERATE_CHART' && result.data && (
                                        <ChatChart 
                                            type={result.data.chartType || 'bar'} 
                                            title={result.data.title || 'Gráfica IA'} 
                                            data={result.data.data} 
                                            analysis={result.data.analysis} 
                                        />
                                    )}
                                    {result.type === 'CREATE_TASK' && result.data && result.success && (
                                        <TaskResultCard task={result.data} />
                                    )}
                                    {(result.type === 'CREATE_MEETING' || result.type === 'CREATE_EVENT') && result.data && result.success && (
                                        <MeetingResultCard event={result.data} />
                                    )}
                                    {result.type === 'CREATE_PROJECT' && result.data && result.success && (
                                        <ProjectResultCard project={result.data} />
                                    )}
                                    {result.type === 'SAVE_DRAFT' && result.data && result.success && (
                                        <MailDraftResultCard draft={result.data} />
                                    )}
                                    {result.type === 'SEND_EMAIL' && result.data && result.success && (
                                        <EmailSentResultCard email={result.data} />
                                    )}
                                    {result.type === 'GENERATE_ARTIFACT' && result.data && !result.success && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-[10px] font-bold text-red-500 uppercase tracking-widest leading-relaxed">
                                            ❌ Error: {result.message}
                                        </div>
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                    {msg.role === 'user' && !isLoading && !editingMessageId && (
                        <button onClick={() => handleStartEdit(msg)} className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="edit" className="w-4 h-4"/></button>
                    )}
                  </>
              )}
            </div>
          </div>
        ))}
        {!isAtBottom && isLoading && (
            <div className="sticky bottom-2 left-1/2 -translate-x-1/2 z-50">
                <button 
                    onClick={() => scrollToBottom(true)}
                    className="bg-brand-primary text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-2xl flex items-center gap-2 border border-white/20 animate-bounce"
                >
                    <Icon name="chevronDown" className="w-3 h-3" /> Nuevos Mensajes
                </button>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-none p-2 bg-white dark:bg-dark-surface border-t border-light-border dark:border-dark-border z-[150] fixed bottom-0 left-0 right-0 lg:relative lg:bottom-0">
        <div className="p-4">
            {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2.5 mb-3 p-2.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl animate-subtle-slide-in-up shadow-sm">
                    {attachedFiles.map((file, idx) => (
                        <div key={idx} className="relative group/file">
                            {file.type.startsWith('image/') ? (
                                <img src={file.url} className="w-14 h-14 object-contain rounded-xl border border-white/20 shadow-md" alt="Preview" />
                            ) : (
                                <div className="w-14 h-14 bg-white dark:bg-neutral-800 rounded-xl flex items-center justify-center text-brand-primary border border-neutral-200 dark:border-neutral-700 shadow-sm">
                                    <Icon name="folder" className="w-6 h-6" />
                                </div>
                            )}
                            <button type="button" onClick={() => removeFile(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-lg hover:bg-red-600 transition-all"><Icon name="close" className="w-3 h-3"/></button>
                        </div>
                    ))}
                </div>
            )}
            <div className="relative flex items-end bg-gray-100 dark:bg-neutral-800 rounded-2xl p-1 shadow-inner border border-transparent focus-within:border-brand-primary/20 transition-all">
            <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <div className="flex flex-col gap-1 pb-1">
                <Button variant="ghost" size="sm" className="!p-2.5 text-gray-500" onClick={() => fileInputRef.current?.click()} title="Adjuntar desde PC"><Icon name="plus" className="w-6 h-6" /></Button>
                <Button variant="ghost" size="sm" className="!p-2.5 text-brand-primary" onClick={() => setIsDrivePickerOpen(true)} title="Goatify Drive"><Icon name="folder" className="w-6 h-6" /></Button>
            </div>
            <Textarea 
                ref={textareaRef} value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} 
                onPaste={handlePaste}
                placeholder="Escribe fluido a Shivo..." 
                className="!mt-0 w-full bg-transparent border-none focus:ring-0 text-sm py-3" 
            />
            <div className="flex items-center gap-1 pr-1 pb-1">
                <button onClick={() => handleSend()} disabled={isLoading || (!input.trim() && attachedFiles.length === 0)} className="p-3 rounded-full bg-brand-primary text-white shadow-md hover:scale-105 active:scale-95 transition-transform">
                    <Icon name={isLoading ? "sync" : "send"} className={`w-4 h-4 ${isLoading ? 'animate-spin' : 'translate-x-0.5'}`} />
                </button>
                <button onClick={handleStartLiveAudio} className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700 text-brand-primary hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-md" title="Voz"><Icon name="mic" className="w-4 h-4"/></button>
                <button onClick={handleStartLiveVideo} className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700 text-purple-600 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-md" title="Video"><Icon name="video" className="w-4 h-4"/></button>
            </div>
            </div>
        </div>
      </div>

      <Modal isOpen={isAssignModalOpen} onClose={() => { setAssignModalOpen(false); setAssigningArtifact(null); }} title="Enviar a Proyecto">
          <div className="p-2 space-y-4">
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest text-center">
                  Elige un proyecto para guardar "{assigningArtifact?.name}"
              </p>
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 goat-scroll">
                  {projects.map(p => (
                      <button 
                          key={p.id}
                          onClick={() => assigningArtifact ? finalizeSendToProject(assigningArtifact, p.id) : null}
                          className="flex items-center gap-3 p-4 bg-neutral-100 dark:bg-neutral-800/50 hover:bg-brand-primary/10 hover:border-brand-primary/40 border border-transparent rounded-2xl transition-all text-left group"
                      >
                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-neutral-800 flex items-center justify-center shadow-sm group-hover:bg-brand-primary group-hover:text-white transition-colors">
                              <Icon name="folder" className="w-5 h-5"/>
                          </div>
                          <div>
                              <h4 className="text-sm font-black text-neutral-800 dark:text-white uppercase tracking-tight">{p.name}</h4>
                              <p className="text-[10px] font-bold text-neutral-500 mt-0.5">{p.documents?.length || 0} Documentos</p>
                          </div>
                      </button>
                  ))}
              </div>
          </div>
      </Modal>

    </div>
  );
};

export default AiChat;