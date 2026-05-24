import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Inbox, Send, FileText, Trash2, AlertOctagon, Search, Menu, Edit3, MoreVertical, Reply, Forward,
  Archive, Clock, Star, ArrowLeft, ExternalLink, Bold, Italic, Underline, Link2, Image as ImageIcon, 
  AlignLeft, AlignCenter, AlignRight, X, Maximize2, Paperclip, Mail, MailOpen, CheckCircle2, 
  ChevronDown, Plus, File as FileIcon, Loader2, Layers, Minimize2, HardDrive, Download, Eye, EyeOff,
  LogOut, ChevronLeft, ChevronRight, Check, ShieldCheck, Info, Megaphone, Users, Calendar, Code,
  Monitor,
  Sparkles, Copy, Save, PenTool, Zap, Wand2, Edit
} from 'lucide-react';
import { db, auth } from '../firebaseConfig';
import { 
  doc, onSnapshot, collection, query, addDoc, serverTimestamp, setDoc, deleteDoc, getDocs, where, updateDoc 
} from 'firebase/firestore';
import { SYSTEM_TEMPLATES } from '../utils/systemTemplates';

import { AppContext } from '../context/AppContext';

import DOMPurify from 'dompurify';
import { executeAiWithFallback, Type } from '../services/geminiService';
import { MailSignature } from '../types';

// --- TIPOS ---
interface Email {
  id: string;
  accountId?: string;
  accountEmail?: string;
  sender: { name: string; email: string };
  subject: string;
  snippet: string;
  body: string;
  date: string;
  displayDate?: string;
  read: boolean;
  starred?: boolean;
  folder: string;
  hasAttachments?: boolean;
  attachments?: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }[];
  to?: { name: string; email: string }[];
}

interface Account {
  id: string;
  email: string;
  provider: 'zoho' | 'custom';
}

interface DriveFile {
  id: string;
  name: string;
  url?: string;
  type: string;
  size: number;
  isLocal?: boolean;
  file?: File;
}

interface MailContact {
  id: string;
  email: string;
  name?: string;
  addedAt: string;
}

interface MailList {
  id: string;
  name: string;
  emails: string[];
  createdAt: string;
}

const extractHtmlShell = (html: string) => {
  const bodyMatch = html.match(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i);
  if (bodyMatch) {
    const prefixIndex = html.indexOf(bodyMatch[1]) + bodyMatch[1].length;
    const suffixIndex = html.lastIndexOf(bodyMatch[3]);
    return {
      prefix: html.substring(0, prefixIndex),
      inner: html.substring(prefixIndex, suffixIndex),
      suffix: html.substring(suffixIndex)
    };
  }
  return { prefix: '', inner: html, suffix: '' };
};

const DrivePicker: React.FC<{ onSelect: (file: DriveFile) => void; onClose: () => void }> = ({ onSelect, onClose }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const driveRef = doc(db, 'users', user.uid, 'settings', 'drive');
    return onSnapshot(driveRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        // Combine personal files and project files if needed
        const allFiles = [
          ...(data.personalFiles || []),
          // You could add more logic here to fetch project files if needed
        ];
        // Enforce all properties for DriveFile
        setFiles(allFiles.map(f => ({
          ...f,
          id: f.id || Math.random().toString(36).substr(2, 9),
          type: f.type || 'application/octet-stream'
        })));
      }
      setLoading(false);
    });
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[10000005] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[32px] w-full max-w-2xl h-[600px] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 uppercase tracking-tight">Goatify Drive</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Selecciona un archivo para adjuntar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
            </div>
          ) : files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 space-y-4">
              <FileIcon className="w-16 h-16 opacity-20" />
              <p className="font-bold">No hay archivos en tu Drive</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {files.map(file => (
                <button 
                  key={file.id}
                  onClick={() => onSelect(file)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-gray-100 hover:border-brand-primary hover:bg-brand-primary/5 transition-all text-center group"
                >
                  <div className="w-full aspect-square rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-brand-primary transition-colors overflow-hidden relative">
                    {(file.previewUrl || file.url || (file.type && file.type.startsWith('image/'))) ? (
                      <img src={file.previewUrl || file.url || file.path} alt={file.name} className="w-full h-full object-contain" />
                    ) : (
                      <FileIcon className="w-8 h-8" />
                    )}
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="font-bold text-[11px] text-gray-900 truncate">{file.name}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

const CampaignManager: React.FC<{
  currentUser: any;
  accounts: Account[];
  activeAccountId: string;
  setToastNotification: any;
  userProfile: any;
  checkAndConsumeLimit: (limitName: string, amount: number) => Promise<boolean>;
  mailLists: MailList[];
  contacts: MailContact[];
  updateUserProfile: any;
}> = ({ currentUser, accounts, activeAccountId, setToastNotification, userProfile, checkAndConsumeLimit, mailLists, contacts, updateUserProfile }) => {
  const [templates, setTemplates] = useState<{ id: string, name: string, html: string, subject: string, isSystem?: boolean }[]>(() => {
    const saved = localStorage.getItem('goatify_campaign_templates');
    const userTemplates = saved ? JSON.parse(saved) : [];
    const combined = [...SYSTEM_TEMPLATES];
    userTemplates.forEach((ut: any) => {
      if (!SYSTEM_TEMPLATES.some(st => st.id === ut.id)) {
        combined.push(ut);
      }
    });
    return combined;
  });
  
  const [history, setHistory] = useState<{ id: string, name: string, list: string, date: string, status: string, opens: number, clicks: number }[]>(() => {
    const saved = localStorage.getItem('goatify_campaign_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [recurrence, setRecurrence] = useState('none');
  
  // UI Tabs
  const [activeTab, setActiveTab] = useState<'create' | 'lists' | 'templates' | 'history' | 'firmas'>('create');
  
  // Signature management states
  const [editingSignatureId, setEditingSignatureId] = useState<string | null>(null);
  const [newSignatureName, setNewSignatureName] = useState('');
  const [newSignatureType, setNewSignatureType] = useState<'plain' | 'html' | 'image'>('plain');
  const [newSignatureContent, setNewSignatureContent] = useState('');
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const signatureImageInputRef = useRef<HTMLInputElement>(null);

  const PRO_SIGNATURE_TEMPLATES = [
    {
      name: "Minimalista Pro",
      html: `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; color: #111827; border-top: 1px solid #e5e7eb; padding-top: 20px; width: 100%;">
  <tr>
    <td>
      <div style="font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.02em;">[Tu Nombre]</div>
      <div style="font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">[Tu Cargo] @ [Tu Empresa]</div>
      <div style="margin-top: 10px; font-size: 13px; color: #4b5563;">
        [Teléfono] | [Sitio Web]
      </div>
    </td>
  </tr>
</table>`
    },
    {
      name: "Modern Sidebar",
      html: `<table cellpadding="0" cellspacing="0" border="0" style="font-family: 'Inter', Helvetica, sans-serif; color: #1f2937; border-top: 2px solid #6366f1; padding-top: 20px;">
  <tr>
    <td style="border-right: 2px solid #6366f1; padding-right: 20px; vertical-align: top;">
      <div style="font-size: 18px; font-weight: 900; color: #6366f1; margin-bottom: 2px;">[Tu Nombre]</div>
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af;">[Tu Cargo]</div>
    </td>
    <td style="padding-left: 20px; vertical-align: top;">
        <div style="font-size: 12px; font-weight: 600; margin-bottom: 2px;">[Tu Empresa]</div>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">[Dirección Física o Contacto]</div>
        <div style="font-size: 12px; color: #6366f1; font-weight: 700;">[Sitio Web]</div>
    </td>
  </tr>
</table>`
    }
  ];

  const [newListName, setNewListName] = useState('');
  const [newListEmails, setNewListEmails] = useState('');
  
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateSubject, setNewTemplateSubject] = useState('');
  const [newTemplateHtml, setNewTemplateHtml] = useState('');
  const [isAiGeneratorOpen, setIsAiGeneratorOpen] = useState(false);

  useEffect(() => {
    // Al guardar plantillas, solo guardamos las que NO son de sistema para evitar duplicados en el próximo inicio
    const userOnlyTemplates = templates.filter(t => !t.isSystem);
    localStorage.setItem('goatify_campaign_templates', JSON.stringify(userOnlyTemplates));
    localStorage.setItem('goatify_campaign_history', JSON.stringify(history));
  }, [templates, history]);

  const handleLaunchCampaign = async () => {
    const list = mailLists.find(l => l.id === selectedListId);
    const tpl = templates.find(t => t.id === selectedTemplate);
    const token = localStorage.getItem('goatify_token');

    if (!list || list.emails.length === 0) return setToastNotification({ title: "Error", message: "Selecciona una lista con correos", icon: "close" });
    if (!tpl) return setToastNotification({ title: "Error", message: "Selecciona una plantilla", icon: "close" });
    
    let sendAt = Date.now();
    if (scheduleDate && scheduleTime) {
      sendAt = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
    }
    
    let actualAccountId = activeAccountId === 'all' ? (userProfile.primaryEmailAccountId || accounts[0]?.id) : activeAccountId;
    if (!accounts.some(a => a.id === actualAccountId)) {
      actualAccountId = accounts[0]?.id;
    }
    if (!actualAccountId) return setToastNotification({ title: "Error", message: "Selecciona una cuenta remitente", icon: "close" });

    // Enviar batch (Schedule)
    for (const email of list.emails) {
      if (!email.trim() || !email.includes('@')) continue;
      try {
        await fetch('/api/campaigns/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
              ownerId: currentUser?.uid,
              accountId: actualAccountId,
              mailOptions: {
                from: accounts.find(a => a.id === actualAccountId)?.email,
                to: email.trim(),
                subject: tpl.subject,
                html: tpl.html
              },
              sendAt,
              recurrence
          })
        });
      } catch (err) {
        console.error("Error scheduling for", email, err);
      }
    }
    
    // Register History
    const newCampaign = {
      id: Date.now().toString(),
      name: tpl.name,
      list: list.name,
      date: sendAt > Date.now() ? new Date(sendAt).toLocaleString() : 'Enviado ahora',
      status: sendAt > Date.now() ? 'Programada' : 'En proceso',
      opens: 0,
      clicks: 0
    };
    setHistory([newCampaign, ...history]);
    
    setToastNotification({ title: "Campaña Programada", message: `Se enviarán correos a ${list.emails.length} contactos.`, icon: "check" });
    setScheduleDate('');
    setScheduleTime('');
    setRecurrence('none');
  };

  const handleCreateList = async () => {
    if (!newListName || !currentUser) return;
    const extractedEmails = newListEmails.replace(/[;\s]+/g, ',').split(',').map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));
    
    try {
      await addDoc(collection(db, 'users', currentUser.uid, 'mail_lists'), {
        name: newListName,
        emails: extractedEmails,
        createdAt: new Date().toISOString()
      });
      setNewListName('');
      setNewListEmails('');
      setToastNotification({ title: "Lista Creada", message: `${extractedEmails.length} contactos añadidos`, icon: "check" });
    } catch (e) {
      console.error("Error creating list", e);
    }
  };

  const handleDeleteList = async (id: string) => {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'mail_lists', id));
      setToastNotification({ title: "Lista Eliminada", message: "La audiencia ha sido removida", icon: "check" });
    } catch (e) {
      console.error("Error deleting list", e);
    }
  };
  
  const handleRemoveEmailFromList = async (listId: string, email: string) => {
    if (!currentUser) return;
    const list = mailLists.find(l => l.id === listId);
    if (!list) return;
    try {
      const updatedEmails = list.emails.filter(e => e !== email);
      await updateDoc(doc(db, 'users', currentUser.uid, 'mail_lists', listId), {
        emails: updatedEmails
      });
      setToastNotification({ title: "Email Removido", message: "El correo ha sido eliminado de la lista", icon: "check" });
    } catch (e) {
      console.error("Error removing email", e);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'mail_contacts', contactId));
      setToastNotification({ title: "Contacto Eliminado", message: "El contacto ha sido removido de tu lista personal", icon: "trash" });
    } catch (e) {
      console.error("Error deleting contact", e);
    }
  };
  
  const handleCreateTemplate = () => {
    if (!newTemplateName || !newTemplateHtml) return;
    setTemplates([...templates, { id: Date.now().toString(), name: newTemplateName, subject: newTemplateSubject, html: newTemplateHtml }]);
    setNewTemplateName('');
    setNewTemplateSubject('');
    setNewTemplateHtml('');
    setToastNotification({ title: "Plantilla Guardada", message: "Lista para usarse en campañas", icon: "check" });
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-gray-50/50">
      <div className="w-full md:w-64 bg-white border-r border-gray-100 p-4 shrink-0 overflow-y-auto">
        <h3 className="font-black text-sm uppercase text-gray-500 mb-4 tracking-widest pl-2">Mailing Avanzado</h3>
        <button onClick={() => setActiveTab('create')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all mb-2 ${activeTab === 'create' ? 'bg-brand-primary text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
          <Megaphone className="w-4 h-4" /> <span className="text-[11px] font-bold uppercase tracking-tighter">Lanzar Campaña</span>
        </button>
        <button onClick={() => setActiveTab('lists')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all mb-2 ${activeTab === 'lists' ? 'bg-brand-primary text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
          <Users className="w-4 h-4" /> <span className="text-[11px] font-bold uppercase tracking-tighter">Audiencias</span>
        </button>
        <button onClick={() => setActiveTab('templates')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all mb-2 ${activeTab === 'templates' ? 'bg-brand-primary text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
          <FileText className="w-4 h-4" /> <span className="text-[11px] font-bold uppercase tracking-tighter">Plantillas HTML</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all mb-2 ${activeTab === 'history' ? 'bg-brand-primary text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
          <Archive className="w-4 h-4" /> <span className="text-[11px] font-bold uppercase tracking-tighter">Historial (Rastreo)</span>
        </button>
        <div className="h-px bg-gray-100 my-4 w-full" />
        <button onClick={() => setActiveTab('firmas')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all mb-2 ${activeTab === 'firmas' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
          <PenTool className="w-4 h-4" /> <span className="text-[11px] font-bold uppercase tracking-tighter">Firmas (Profesional)</span>
        </button>
      </div>

      <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar">
        {activeTab === 'create' && (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase mb-8">Nueva Acción</h2>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6">
              
              <div>
                <label className="font-bold text-xs text-gray-500 uppercase block mb-2">1. Selecciona tu Audiencia</label>
                <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-brand-primary">
                  <option value="">-- Elige una lista --</option>
                  {mailLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.emails.length} contactos)</option>)}
                </select>
              </div>

              <div>
                <label className="font-bold text-xs text-gray-500 uppercase block mb-2">2. Selecciona tu Plantilla HTML</label>
                <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-brand-primary">
                  <option value="">-- Elige una plantilla --</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} - {t.subject}</option>)}
                </select>
              </div>

              <div>
                <label className="font-bold text-xs text-gray-500 uppercase block mb-2">3. ¿Cuándo enviar? (Opcional)</label>
                <div className="flex gap-4 mb-4">
                  <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-brand-primary" />
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} title="Hora de envío y recurrencia" className="w-32 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-brand-primary" />
                </div>
                
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                  <label className="font-bold text-xs text-gray-900 uppercase block mb-3 flex items-center gap-2"><Calendar className="w-3 h-3 text-brand-primary" /> Recurrencia del Envío (Autónomo)</label>
                  <select value={recurrence} onChange={e => setRecurrence(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-brand-primary focus:ring-2 ring-brand-primary/20 appearance-none">
                    <option value="none">Un único envío</option>
                    <option value="daily">Todos los días (Envío Autónomo)</option>
                    <option value="weekly">Semanalmente (Fijo)</option>
                    <option value="monthly">Mensualmente (Fijo)</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-2"><b>Nota:</b> La app enviará estos correos automáticamente. Si el servidor se apaga, los correos se encolarán y se enviarán apenas se restaure el sistema o abras la app.</p>
                </div>

                <div className="mt-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                  <p className="text-[10px] text-blue-700 font-black uppercase tracking-tight mb-1 flex items-center gap-2">
                    <Info className="w-3 h-3" /> Estado de Autonomía de Envío
                  </p>
                  <p className="text-[10px] text-blue-600 font-bold leading-relaxed">
                    Para asegurar que los correos automáticos se disparen sin fallos todos los días, recomendamos abrir la App al menos una vez al día para refrescar tus tokens de seguridad. Si el usuario no está conectado, Goatify intentará usar la cuenta principal o encolará el envío hasta detectar una sesión activa.
                  </p>
                </div>

                <p className="text-[10px] text-gray-400 font-bold mt-3">Si dejas la fecha y hora vacía, comenzará de inmediato.</p>
              </div>

              <div className="pt-4 border-t border-gray-50 mt-6 flex justify-end">
                <button onClick={handleLaunchCampaign} className="flex items-center gap-2 bg-brand-primary text-white px-8 py-3 rounded-xl font-black text-xs hover:bg-[#2d1b69] transition-colors shadow-lg shadow-brand-primary/20">
                  <Megaphone className="w-4 h-4" /> PROGRAMAR CAMPAÑA
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'firmas' && (
          <div className="max-w-4xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Gestión de Firmas</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Configura cómo te ven tus clientes al final de cada correo</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Nueva Firma Form */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden">
                  {editingSignatureId && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                  )}
                  <h3 className="font-black text-sm uppercase text-gray-900 mb-4 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                       {editingSignatureId ? <Edit className="w-4 h-4 text-amber-500" /> : <Plus className="w-4 h-4 text-indigo-600" />} {editingSignatureId ? 'Editando Firma' : 'Nueva Firma'}
                    </span>
                    {editingSignatureId && (
                      <button 
                        onClick={() => {
                          setEditingSignatureId(null);
                          setNewSignatureName('');
                          setNewSignatureContent('');
                        }}
                        className="text-[9px] font-black text-gray-400 hover:text-red-500 uppercase flex items-center gap-1"
                      >
                       <X className="w-3 h-3" /> Cancelar
                      </button>
                    )}
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">Nombre Interno</label>
                      <input 
                        value={newSignatureName} 
                        onChange={e => setNewSignatureName(e.target.value)} 
                        placeholder="Ej. Comercial, Personal" 
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:bg-white focus:border-indigo-200 transition-all" 
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">Tipo de Firma</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['plain', 'html', 'image'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setNewSignatureType(t)}
                            className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${newSignatureType === t ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm' : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'}`}
                          >
                            {t === 'plain' ? 'Texto' : t === 'html' ? 'HTML Pro' : 'Imagen'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">Contenido</label>
                        {newSignatureType === 'html' && (
                          <div className="flex gap-2">
                            {PRO_SIGNATURE_TEMPLATES.map((tmpl, idx) => (
                              <button 
                                key={idx}
                                onClick={() => {
                                  setNewSignatureContent(tmpl.html);
                                  setToastNotification({ title: "Plantilla Cargada", message: `Cargada la plantilla ${tmpl.name}`, icon: "check" });
                                }}
                                className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md uppercase hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                              >
                                {tmpl.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {newSignatureType === 'image' ? (
                        <div className="space-y-3">
                          <input 
                            type="file" 
                            hidden 
                            ref={signatureImageInputRef} 
                            accept="image/*" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) return setToastNotification({ title: "Error", message: "La imagen es demasiado grande (Máx 2MB)", icon: "close" });
                              
                              const reader = new FileReader();
                              reader.onload = () => {
                                setNewSignatureContent(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          <button 
                            onClick={() => signatureImageInputRef.current?.click()}
                            className="w-full aspect-video rounded-2xl border-2 border-dashed border-gray-100 hover:border-indigo-200 bg-gray-50 flex flex-col items-center justify-center gap-2 group transition-all"
                          >
                            {newSignatureContent ? (
                              <img src={newSignatureContent} alt="Preview" className="w-full h-full object-contain p-2 rounded-2xl" />
                            ) : (
                              <>
                                <ImageIcon className="w-8 h-8 text-gray-300 group-hover:text-indigo-400" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Subir Imagen</span>
                              </>
                            )}
                          </button>
                          {newSignatureContent && (
                            <button onClick={() => setNewSignatureContent('')} className="text-[9px] font-black text-red-500 uppercase hover:underline w-full text-center">Remover imagen</button>
                          )}
                        </div>
                      ) : (
                        <textarea 
                          value={newSignatureContent} 
                          onChange={e => setNewSignatureContent(e.target.value)} 
                          placeholder={newSignatureType === 'html' ? '<!-- Tu HTML Pro aquí -->' : 'Atentamente,\nTu Nombre'} 
                          rows={6} 
                          className={`w-full ${newSignatureType === 'html' ? 'font-mono text-indigo-400 bg-gray-900 border-none' : 'bg-gray-50 border-gray-100'} border rounded-xl px-4 py-3 text-xs outline-none focus:border-indigo-200 transition-all custom-scrollbar`} 
                        />
                      )}
                    </div>

                    <button 
                      onClick={async () => {
                        if (!newSignatureName || !newSignatureContent) return setToastNotification({ title: "Atención", message: "Completa el nombre y contenido", icon: "alert" });
                        setIsSavingSignature(true);
                        try {
                          let updatedSignatures: MailSignature[] = [];
                          
                          if (editingSignatureId) {
                            updatedSignatures = (userProfile.mailSignatures || []).map((s: MailSignature) => 
                              s.id === editingSignatureId 
                                ? { ...s, name: newSignatureName, type: newSignatureType, content: newSignatureContent }
                                : s
                            );
                            setEditingSignatureId(null);
                          } else {
                            const newSig: MailSignature = {
                              id: Math.random().toString(36).substr(2, 9),
                              name: newSignatureName,
                              type: newSignatureType,
                              content: newSignatureContent,
                              active: (userProfile.mailSignatures || []).length === 0
                            };
                            updatedSignatures = [...(userProfile.mailSignatures || []), newSig];
                          }
                          
                          await updateUserProfile(userProfile.uid, { mailSignatures: updatedSignatures } as any);
                          
                          setNewSignatureName('');
                          setNewSignatureContent('');
                          setToastNotification({ title: editingSignatureId ? "Firma Actualizada" : "Firma Guardada", message: editingSignatureId ? "Los cambios se guardaron con éxito" : "Ahora puedes usarla en tus correos", icon: "check" });
                        } catch (e) {
                          setToastNotification({ title: "Error", message: "No se pudo guardar la firma", icon: "close" });
                        } finally {
                          setIsSavingSignature(false);
                        }
                      }}
                      disabled={isSavingSignature}
                      className={`w-full ${editingSignatureId ? 'bg-amber-600' : 'bg-[#111827]'} text-white py-4 rounded-xl font-black text-xs uppercase shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2`}
                    >
                      {isSavingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : editingSignatureId ? "Actualizar Firma" : "Guardar Firma"}
                    </button>
                  </div>
                </div>

                <div className="bg-amber-50 p-5 rounded-[32px] border border-amber-100/50">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 fill-amber-600" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-amber-900 uppercase mb-1">Activación Automática</h4>
                      <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                        La firma que marques como <b>"Activa"</b> se adjuntará automáticamente a todos los correos que envíes (Borradores o Enviados).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista de Firmas */}
              <div className="lg:col-span-2 space-y-6">
                {(userProfile.mailSignatures || []).length === 0 ? (
                  <div className="bg-white rounded-[40px] border border-dashed border-gray-200 p-16 text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200">
                      <PenTool className="w-10 h-10" />
                    </div>
                    <h3 className="text-gray-400 font-black uppercase text-xs tracking-[0.2em]">No tienes firmas configuradas</h3>
                    <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase">Crea tu primera firma profesional a la izquierda</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(userProfile.mailSignatures as MailSignature[]).map((sig) => (
                      <div 
                        key={sig.id} 
                        className={`bg-white rounded-[32px] border transition-all p-6 group/item relative overflow-hidden ${sig.active ? 'border-brand-primary shadow-lg shadow-brand-primary/10' : 'border-gray-100 shadow-sm hover:shadow-md'} ${editingSignatureId === sig.id ? 'ring-2 ring-amber-500' : ''}`}
                      >
                        {sig.active && (
                          <div className="absolute top-0 right-0 bg-brand-primary text-white text-[8px] font-black px-4 py-1.5 uppercase tracking-widest rounded-bl-2xl">
                            Activa
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex-1 mr-4">
                            <h4 className="font-black text-gray-900 uppercase tracking-tight text-sm truncate">{sig.name}</h4>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Formato: {sig.type}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button 
                              onClick={async () => {
                                const updated = (userProfile.mailSignatures as MailSignature[]).map(s => ({
                                  ...s,
                                  active: s.id === sig.id
                                }));
                                await updateUserProfile(userProfile.uid, { mailSignatures: updated } as any);
                                setToastNotification({ title: "Firma Activada", message: `"${sig.name}" ahora es tu firma principal`, icon: "check" });
                              }}
                              className={`p-2 rounded-lg transition-all shadow-sm ${sig.active ? 'bg-brand-primary text-white' : 'bg-gray-50 text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10'}`}
                              title={sig.active ? "Esta firma está activa" : "Activar esta firma"}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => {
                                setEditingSignatureId(sig.id);
                                setNewSignatureName(sig.name);
                                setNewSignatureType(sig.type);
                                setNewSignatureContent(sig.content);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="p-2 rounded-lg bg-gray-50 text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all shadow-sm border border-transparent hover:border-amber-100"
                              title="Editar esta firma"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={async () => {
                                if (!confirm(`¿Estás seguro de eliminar la firma "${sig.name}"?`)) return;
                                const updated = (userProfile.mailSignatures as MailSignature[]).filter(s => s.id !== sig.id);
                                await updateUserProfile(userProfile.uid, { mailSignatures: updated } as any);
                                setToastNotification({ title: "Eliminada", message: `Firma "${sig.name}" removida`, icon: "trash" });
                              }}
                              className="p-2 rounded-lg bg-red-50 text-red-500 opacity-0 group-hover/item:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="bg-gray-50/50 rounded-2xl border border-gray-100 p-4 min-h-[140px] max-h-[180px] overflow-y-auto custom-scrollbar flex items-center justify-center">
                          {sig.type === 'image' ? (
                            <img src={sig.content} alt={sig.name} className="max-w-full max-h-full object-contain rounded-lg" />
                          ) : sig.type === 'plain' ? (
                            <p className="text-[11px] font-medium text-gray-600 whitespace-pre-wrap text-center">{sig.content}</p>
                          ) : (
                            <iframe 
                              srcDoc={`<html><body style="margin:0; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">${sig.content}</body></html>`} 
                              className="w-full h-32 border-none scale-75 origin-center pointer-events-none"
                              title={`Preview ${sig.name}`}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'lists' && (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase mb-8">Audiencias y Contactos</h2>
            
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-10">
              <h3 className="font-black text-sm uppercase text-gray-900 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-brand-primary" /> Crear Nueva Audiencia (Grupo)</h3>
              <input value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="Nombre de la lista (ej. Oficina, Amigos)" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none mb-4 focus:bg-white focus:border-brand-primary/20 transition-all" />
              <textarea value={newListEmails} onChange={e => setNewListEmails(e.target.value)} placeholder="pega, los, correos, aquí, separados, por, comas" rows={4} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none mb-4 focus:bg-white focus:border-brand-primary/20 transition-all custom-scrollbar" />
              <button onClick={handleCreateList} className="bg-brand-primary text-white px-8 py-3 rounded-xl font-black text-xs uppercase shadow-lg shadow-brand-primary/10 hover:bg-[#2d1b69]">Guardar Audiencia</button>
            </div>
            
            <div className="space-y-10">
              {/* Grupos (MailLists) */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 px-1">
                  <Users className="w-3.5 h-3.5" /> Grupos de Audiencia ({mailLists.length})
                </h3>
                <div className="space-y-4">
                  {mailLists.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-gray-200">
                      <p className="text-[10px] uppercase font-bold text-gray-400">No hay grupos creados</p>
                    </div>
                  ) : (
                    mailLists.map(l => (
                      <div key={l.id} className="bg-white p-6 rounded-3xl border border-gray-100 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all group/list">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-brand-primary/5 flex items-center justify-center text-brand-primary">
                              <Users className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="font-black text-gray-900 uppercase tracking-tight text-sm">{l.name}</h4>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{l.emails.length} contactos en este grupo</p>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteList(l.id)} className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors border border-red-100" title="Borrar Grupo Completo"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50 mt-1">
                          {l.emails.map((email, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-xl text-[10px] font-bold border border-gray-100 group/chip hover:bg-red-50 hover:border-red-100 hover:text-red-600 transition-all cursor-default">
                              <span>{email}</span>
                              <button 
                                onClick={() => handleRemoveEmailFromList(l.id, email)}
                                className="opacity-0 group-hover/chip:opacity-100 transition-opacity hover:scale-110"
                                title="Eliminar de este grupo"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Contactos Únicos (Contacts) */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 px-1">
                  <Plus className="w-3.5 h-3.5" /> Contactos Únicos ({contacts.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {contacts.length === 0 ? (
                    <div className="col-span-full text-center py-10 bg-white rounded-3xl border border-dashed border-gray-200">
                      <p className="text-[10px] uppercase font-bold text-gray-400">No hay contactos guardados</p>
                    </div>
                  ) : (
                    contacts.map(c => (
                      <div key={c.id} className="bg-white p-5 rounded-3xl border border-gray-100 flex items-center justify-between shadow-sm hover:shadow-md transition-all group/contact">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
                            {c.name ? c.name.charAt(0).toUpperCase() : <Mail className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-gray-900 text-sm truncate">{c.name || 'Sin Nombre'}</h4>
                            <p className="text-[10px] font-medium text-gray-400 truncate">{c.email}</p>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteContact(c.id)} className="w-8 h-8 rounded-xl bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors border border-gray-100" title="Borrar Contacto"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Plantillas HTML</h2>
              <button 
                onClick={() => setIsAiGeneratorOpen(true)}
                className="flex items-center gap-2 bg-brand-primary text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-brand-primary/20 hover:scale-[1.02] transition-all active:scale-95"
              >
                <Sparkles className="w-4 h-4" /> Crear con IA Mágica
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-8">
              <h3 className="font-black text-sm uppercase text-gray-900 mb-4">Nueva Plantilla Manual</h3>
              <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="Nombre (ej. Promoción de Verano)" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none mb-4" />
              <input value={newTemplateSubject} onChange={e => setNewTemplateSubject(e.target.value)} placeholder="Asunto del correo" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none mb-4" />
              <textarea value={newTemplateHtml} onChange={e => setNewTemplateHtml(e.target.value)} placeholder="<!-- Pega aquí el código HTML -->" rows={6} className="w-full font-mono bg-gray-900 text-green-400 border border-gray-800 rounded-xl px-4 py-3 text-xs outline-none mb-4 custom-scrollbar" />
              <button onClick={handleCreateTemplate} className="bg-gray-900 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase">Guardar Plantilla HTML</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(t => (
                <div key={t.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group/card">
                  {t.isSystem && (
                    <div className="absolute top-0 right-0 bg-brand-primary text-white text-[8px] font-black px-3 py-1 uppercase tracking-widest rounded-bl-xl z-10">
                      Sistema
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-gray-900 truncate">{t.name}</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase truncate">Asunto: {t.subject}</p>
                    </div>
                    <div className="flex gap-1">
                       <button 
                        onClick={() => {
                          navigator.clipboard.writeText(t.html);
                          setToastNotification({ title: "Copiado", message: "HTML copiado al portapapeles", icon: "check" });
                        }}
                        className="p-2 rounded-lg bg-gray-50 text-gray-400 hover:text-brand-primary"
                        title="Copiar HTML"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {!t.isSystem && (
                        <button onClick={() => setTemplates(templates.filter(x => x.id !== t.id))} className="p-2 rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="aspect-[4/3] w-full bg-gray-50 rounded-xl border border-gray-100 overflow-hidden flex items-center justify-center p-4">
                     <iframe 
                        srcDoc={t.html} 
                        className="w-full h-full border-none pointer-events-none transform scale-50 origin-center"
                        style={{ width: '200%', height: '200%' }}
                        title={`Preview ${t.name}`}
                     />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="max-w-4xl">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase mb-8">Rastreo de Campañas</h2>
            <div className="space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-3xl border border-gray-100">
                  <p className="text-gray-400 font-bold text-sm uppercase">No hay campañas registradas</p>
                </div>
              ) : (
                history.map(c => (
                  <div key={c.id} className="bg-white p-5 rounded-2xl border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex-1">
                      <h4 className="font-black text-gray-900">{c.name}</h4>
                      <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Audiencia: {c.list} • {c.date}</p>
                    </div>
                    <div className="flex items-center gap-5 shrink-0 bg-gray-50 px-5 py-3 rounded-xl">
                      <div className="text-center w-16">
                        <span className="block text-xl font-black text-blue-600">{c.opens}</span>
                        <span className="text-[9px] text-gray-400 uppercase font-bold tracking-tighter">Opens</span>
                      </div>
                      <div className="text-center w-16">
                        <span className="block text-xl font-black text-emerald-600">{c.clicks}</span>
                        <span className="text-[9px] text-gray-400 uppercase font-bold tracking-tighter">Clicks</span>
                      </div>
                      <div className="w-px h-8 bg-gray-200"></div>
                      <span className={`text-[10px] uppercase font-black px-3 py-1.5 rounded-lg w-24 text-center ${c.status === 'Programada' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-700'}`}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-4 font-medium">* El rastreo de aperturas y clics funciona mediante la inserción automática de un píxel invisible de 1x1 con hash único en el código HTML de cada destinatario. Los datos pueden tardar unos minutos en actualizarse tras la lectura.</p>
          </div>
        )}

        {isAiGeneratorOpen && createPortal(
          <AiEmailGenerator 
            onClose={() => setIsAiGeneratorOpen(false)}
            onSave={(template) => {
              setTemplates([...templates, { id: Date.now().toString(), ...template }]);
              setIsAiGeneratorOpen(false);
              setToastNotification({ title: "Plantilla creada", message: "La magia ha funcionado correctamente.", icon: "check" });
            }}
            setToastNotification={setToastNotification}
            checkAndConsumeLimit={checkAndConsumeLimit}
            currentUser={currentUser}
            userProfile={userProfile}
          />,
          document.body
        )}
      </div>
    </div>
  );
};

const AiEmailGenerator: React.FC<{
  onClose: () => void;
  onSave: (template: { name: string, subject: string, html: string }) => void;
  setToastNotification: any;
  checkAndConsumeLimit: any;
  currentUser: any;
  userProfile?: any;
}> = ({ onClose, onSave, setToastNotification, checkAndConsumeLimit, currentUser, userProfile }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    objective: '',
    type: 'marketing',
    brand: '',
    audience: '',
    message: '',
    data: ''
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{
    subjectLines: string[];
    preheaders: string[];
    html: string[];
    plainText: string;
    shortVersion: string;
  } | null>(null);
  const [selectedHtmlIndex, setSelectedHtmlIndex] = useState(0);

  const handleGenerate = async () => {
    if (checkAndConsumeLimit && currentUser?.uid && userProfile?.plan !== 'pro' && userProfile?.plan !== 'ultimate' && userProfile?.plan !== 'admin') {
      try {
      } catch (e: any) {
          if (e.code === "PLAN_LIMIT_REACHED") {
              setToastNotification({ title: 'Límite alcanzado', message: 'Necesitas 2 créditos para usar la Magia HTML Premium.', icon: 'error' });
              return;
          }
      }
    }

    setIsGenerating(true);
    setToastNotification({ title: "Invocando Magia", message: "Nuestro director creativo está diseñando tu correo...", icon: "loader" });

    try {
      const prompt = `Actúa como director creativo senior de email marketing y experto en HTML premium.
Genera un correo electrónico PROFESIONAL, MODERNO y PREMIUM basado en:
- Objetivo: ${formData.objective}
- Tipo: ${formData.type}
- Marca: ${formData.brand}
- Audiencia: ${formData.audience}
- Mensaje Clave: ${formData.message}
- Datos Específicos: ${formData.data}

REGLAS DE DISEÑO ESTRICTAS (Premium UI/UX - Pro Edge-to-Edge):
1. Usa tablas HTML para toda la estructura principal.
2. El body debe tener margin:0; padding:0; width:100%; background:#f3f4f6 o similar.
3. El contenedor principal del email debe ocupar todo el ancho disponible en móvil: width:100%; max-width:100% en móvil. (En escritorio usa max-width: 680px).
4. NO uses un contenedor interno angosto dentro de otro contenedor. NO uses max-width de 520px, 560px o similares en el bloque principal.
5. El email debe verse ancho en celular, casi como la plantilla original, sin sensación de columna estrecha.
6. El padding lateral en móvil debe ser mínimo o cero (preferencia móvil: 0px a 12px máximo). No pongas una "tarjeta dentro de otra tarjeta".
7. Si hay borde redondeado, que en móvil se reduzca o elimine.
8. El contenido principal debe ir directo dentro del contenedor principal, sin wrappers adicionales innecesarios. El header debe ocupar todo el ancho del contenedor.
9. Usa CSS inline compatible con Gmail, Outlook y Apple Mail. Incluye media query móvil para eliminar márgenes, paddings y anchos restringidos: @media (max-width: 640px) { ... }
10. AÑO OBLIGATORIO: SIEMPRE incluye el año 2026 en los derechos reservados del footer.
11. IMÁGENES PROHIBIDAS: NUNCA incluyas la etiqueta <img>, ni logotipos ni fotos, está prohibido cargar media externo. Usa texto o CSS para compensar.
12. UNSUBSCRIBE PROHIBIDO: NUNCA escribas la palabra "Unsubscribe", "Darse de baja", ni incluyas ningún enlace para desuscribirse. ¡Terminantemente prohibido por orden corporativa!

ENTREGABLE REQUERIDO (Formato JSON):
{
  "subjectLines": ["5 opciones potentes"],
  "preheaders": ["5 opciones descriptivas"],
  "html": "El código HTML completo y listo para enviar (Sin markdown ni bloques \`\`\`)",
  "plainText": "Versión texto plano",
  "shortVersion": "Resumen para Gmail/WhatsApp"
}

Devuelve SOLO un JSON válido.`;

      const schema = {
        type: Type.OBJECT,
        properties: {
            subjectLines: { type: Type.ARRAY, items: { type: Type.STRING } },
            preheaders: { type: Type.ARRAY, items: { type: Type.STRING } },
            html: { type: Type.STRING },
            plainText: { type: Type.STRING },
            shortVersion: { type: Type.STRING }
        },
        required: ["subjectLines", "preheaders", "html", "plainText", "shortVersion"]
      };

      const result = await executeAiWithFallback(prompt, "Director Creativo Email Marketing Premium", true, schema, 'web');
      const parsed = JSON.parse(result || "{}");
      
      setGeneratedResult({
        subjectLines: parsed.subjectLines || [],
        preheaders: parsed.preheaders || [],
        html: [parsed.html],
        plainText: parsed.plainText || '',
        shortVersion: parsed.shortVersion || ''
      });
      setStep(3);
    } catch (err) {
      console.error(err);
      setToastNotification({ title: "Error Mágico", message: "La IA no pudo completar la tarea. Reintenta.", icon: "close" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000005] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden border border-gray-100"
      >
        <div className="p-8 border-b border-gray-50 flex items-center justify-between shrink-0 bg-gray-50/50">
          <div>
             <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-primary/20">
                <Sparkles className="w-5 h-5" />
              </div>
              Magia HTML Premium
             </h2>
             <p className="text-[10px] font-black italic text-brand-primary mt-1 uppercase tracking-widest">Powered by Goatify Creative Director</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-gray-200 rounded-2xl transition-all">
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {step === 1 && (
            <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="text-center mb-10">
                <h3 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Cuentame tu visión</h3>
                <p className="text-gray-500 font-bold">Define los pilares de tu campaña para obtener un diseño de clase mundial.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Objetivo de la Campaña</label>
                    <input 
                      placeholder="Ej: Vender el curso de Trading" 
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-brand-primary/10 outline-none transition-all font-bold text-sm"
                      value={formData.objective}
                      onChange={e => setFormData({...formData, objective: e.target.value})}
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Tipo de Correo</label>
                    <select 
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-brand-primary/10 outline-none transition-all font-bold text-sm"
                      value={formData.type}
                      onChange={e => setFormData({...formData, type: e.target.value})}
                    >
                      <option value="marketing">Marketing / Venta</option>
                      <option value="newsletter">Newsletter Semanal</option>
                      <option value="transactional">Bienvenida / Onboarding</option>
                      <option value="event">Invitación Evento</option>
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Nombre de Marca</label>
                    <input 
                      placeholder="Ej: Goatify Academy" 
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-brand-primary/10 outline-none transition-all font-bold text-sm"
                      value={formData.brand}
                      onChange={e => setFormData({...formData, brand: e.target.value})}
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Audiencia</label>
                    <input 
                      placeholder="Ej: Emprendedores digitales" 
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-brand-primary/10 outline-none transition-all font-bold text-sm"
                      value={formData.audience}
                      onChange={e => setFormData({...formData, audience: e.target.value})}
                    />
                 </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Mensaje Clave (Gancho)</label>
                <textarea 
                  placeholder="¿Cuál es la gran idea? Ej: Solo 24 horas para cambiar tu vida con el descuento del 50%..." 
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-brand-primary/10 outline-none transition-all font-bold text-sm custom-scrollbar"
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Datos Específicos (Precios, Fechas, Enlaces)</label>
                <textarea 
                  placeholder="Ej: Precio $97, Enlace: google.com, Fecha fin: Mañana" 
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-brand-primary/10 outline-none transition-all font-bold text-sm custom-scrollbar"
                  value={formData.data}
                  onChange={e => setFormData({...formData, data: e.target.value})}
                />
              </div>

              <div className="pt-4 flex justify-center">
                <button 
                  onClick={() => formData.objective && formData.brand ? handleGenerate() : setToastNotification({ title: "Faltan datos", message: "Por favor llena el objetivo y la marca.", icon: "info" })}
                  disabled={isGenerating}
                  className="w-full max-w-sm bg-brand-primary text-white py-5 rounded-[24px] font-black text-lg shadow-2xl shadow-brand-primary/30 hover:scale-[1.03] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      CALIBRANDO MAGIA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6" /> 
                      GENERAR CORREO MAESTRO
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 3 && generatedResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-in fade-in zoom-in duration-500">
               {/* Columna de Preview */}
               <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Vista Previa</h3>
                    <div className="flex gap-2">
                       <button 
                        onClick={() => {
                          const blob = new Blob([generatedResult.html[0]], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank');
                        }}
                        className="p-2 bg-gray-100 rounded-xl text-gray-600 hover:text-brand-primary transition-all"
                        title="Ver en nueva pestaña"
                      >
                         <ExternalLink className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                  <div className="bg-gray-100 rounded-[32px] p-1 border border-gray-200 shadow-inner h-[600px] overflow-hidden">
                    <div className="bg-white rounded-[28px] h-full overflow-y-auto custom-scrollbar">
                       <iframe 
                        srcDoc={generatedResult.html[selectedHtmlIndex]} 
                        className="w-full h-full border-none"
                        title="Email Preview"
                       />
                    </div>
                  </div>
               </div>

               {/* Columna de Datos y Variaciones */}
               <div className="space-y-8 flex flex-col h-[600px]">
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
                     <section>
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Copywriting Sugerido</h4>
                        <div className="space-y-4">
                           <div>
                              <label className="text-[9px] font-bold text-brand-primary block mb-1">ASUNTOS (Subject Lines)</label>
                              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
                                 {generatedResult.subjectLines.map((s, idx) => (
                                   <p key={idx} className="text-xs font-bold text-gray-700 leading-relaxed">• {s}</p>
                                 ))}
                              </div>
                           </div>
                           <div>
                              <label className="text-[9px] font-bold text-brand-primary block mb-1">PREHEADERS</label>
                              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
                                 {generatedResult.preheaders.map((s, idx) => (
                                   <p key={idx} className="text-xs font-bold text-gray-500 leading-relaxed">• {s}</p>
                                 ))}
                              </div>
                           </div>
                        </div>
                     </section>

                     <section>
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Otras Versiones</h4>
                       <div className="grid grid-cols-2 gap-4">
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(generatedResult.plainText);
                              setToastNotification({ title: "Copiado", message: "Versión Texto Plano copiada", icon: "check" });
                            }}
                            className="bg-gray-50 border border-gray-100 p-4 rounded-2xl hover:border-brand-primary transition-all text-left group"
                          >
                             <div className="text-[8px] font-black text-gray-400 group-hover:text-brand-primary transition-colors">TEXTO PLANO</div>
                             <p className="text-[10px] font-bold text-gray-600 line-clamp-2 mt-1">Copia la versión sin formato para mayor entregabilidad.</p>
                          </button>
                          <button 
                             onClick={() => {
                              navigator.clipboard.writeText(generatedResult.shortVersion);
                              setToastNotification({ title: "Copiado", message: "Versión Móvil/WhatsApp copiada", icon: "check" });
                            }}
                            className="bg-gray-50 border border-gray-100 p-4 rounded-2xl hover:border-brand-primary transition-all text-left group"
                          >
                             <div className="text-[8px] font-black text-gray-400 group-hover:text-brand-primary transition-colors">MÓVIL / WHATSAPP</div>
                             <p className="text-[10px] font-bold text-gray-600 line-clamp-2 mt-1">Un resumen directo para canales de gratificación instantánea.</p>
                          </button>
                       </div>
                     </section>
                  </div>

                  <div className="pt-6 border-t border-gray-100 flex gap-4">
                     <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generatedResult.html[selectedHtmlIndex]);
                        setToastNotification({ title: "¡Copiado!", message: "El código HTML está listo para tu mailing.", icon: "check" });
                      }}
                      className="flex-1 bg-gray-100 text-gray-900 py-4 rounded-2xl font-black text-xs hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                     >
                        <Copy className="w-4 h-4" /> COPIAR HTML
                     </button>
                     <button 
                      onClick={() => {
                        const name = prompt("Nombre para esta plantilla:", formData.objective || "Nueva Plantilla Mágica");
                        if (name) {
                          onSave({
                            name,
                            subject: generatedResult.subjectLines[0],
                            html: generatedResult.html[selectedHtmlIndex]
                          });
                        }
                      }}
                      className="flex-1 bg-brand-primary text-white py-4 rounded-2xl font-black text-xs shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        <Save className="w-4 h-4" /> GUARDAR EN GOATIFY
                     </button>
                  </div>
               </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const GoatifyMail: React.FC = () => {
  const { isFullScreenActive, setIsFullScreenActive, userProfile, deepLinkTarget, setDeepLinkTarget, setToastNotification, updateUserProfile, mailDraft, setMailDraft, checkAndConsumeLimit, currentUser, setCurrentView } = React.useContext(AppContext);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>(() => localStorage.getItem('goatify_mail_active_account') || (userProfile?.primaryEmailAccountId ? userProfile.primaryEmailAccountId : 'all'));
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState(() => localStorage.getItem('goatify_mail_current_folder') || 'inbox');
  const [filterType, setFilterType] = useState<'all'|'unread'>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);

  const currentCacheKey = `${currentFolder}-${activeAccountId}-${filterType}-${searchQuery}-${currentPage}`;




  useEffect(() => {
    localStorage.setItem('goatify_mail_active_account', activeAccountId);
  }, [activeAccountId]);

  useEffect(() => {
    if (deepLinkTarget && deepLinkTarget.view === 'email' && deepLinkTarget.id) {
      const emailId = deepLinkTarget.id;
      const token = localStorage.getItem('goatify_token');
      fetch(`/api/emails/${emailId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(email => {
        if (email && !email.error) {
          setSelectedEmail(email);
          if (!email.read) {
            handleToggleRead(email, true);
          }
        }
      })
      .catch(err => console.error("Error fetching deep linked email", err))
      .finally(() => {
        setDeepLinkTarget(null);
      });
    }
  }, [deepLinkTarget, setDeepLinkTarget]);

  useEffect(() => {
    localStorage.setItem('goatify_mail_current_folder', currentFolder);
  }, [currentFolder]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [mailLists, setMailLists] = useState<any[]>([]);
  const [isSavingListModalOpen, setIsSavingListModalOpen] = useState(false);
  const [listNameToSave, setListNameToSave] = useState('');

  const composeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentUser) return;

    // Sync Contacts
    const contactsRef = collection(db, 'users', currentUser.uid, 'mail_contacts');
    const unsubscribeContacts = onSnapshot(contactsRef, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setContacts(list);
    });

    // Sync Lists
    const listsRef = collection(db, 'users', currentUser.uid, 'mail_lists');
    const unsubscribeLists = onSnapshot(listsRef, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMailLists(list);
    });

    return () => {
      unsubscribeContacts();
      unsubscribeLists();
    };
  }, [currentUser]);

  const saveContactsBatch = async (emailsStr: string) => {
    if (!emailsStr || !currentUser) return;
    const emails = emailsStr.replace(/[;\s]+/g, ',').split(',').map(e => e.trim()).filter(e => e.includes('@'));
    
    for (const email of emails) {
      // Check if contact already exists in state to avoid redundant writes
      const exists = contacts.some(c => c.email.toLowerCase() === email.toLowerCase());
      if (!exists) {
        try {
          await addDoc(collection(db, 'users', currentUser.uid, 'mail_contacts'), {
            email: email.toLowerCase(),
            addedAt: new Date().toISOString()
          });
        } catch (e) {
          console.error("Error saving contact", e);
        }
      }
    }
  };

  const handleSaveAsList = async () => {
    if (!listNameToSave || !currentUser) return;
    const combinedEmails = `${composeState.to},${composeState.cc},${composeState.bcc}`;
    const emails = combinedEmails.replace(/[;\s]+/g, ',').split(',').map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));
    
    if (emails.length === 0) return;

    try {
      await addDoc(collection(db, 'users', currentUser.uid, 'mail_lists'), {
        name: listNameToSave,
        emails: emails,
        createdAt: new Date().toISOString()
      });
      setToastNotification({ title: "Lista Guardada", message: `Grupo '${listNameToSave}' guardado con éxito`, icon: "check" });
      setIsSavingListModalOpen(false);
      setListNameToSave('');
    } catch (e) {
      console.error("Error saving list", e);
      setToastNotification({ title: "Error", message: "No se pudo guardar la lista", icon: "close" });
    }
  };

  const renderEmailBody = (body: string) => {
    if (!body) return "";
    // Inyectar <base target="_blank"> para que todos los links se abran en pestaña nueva
    const baseTag = '<base target="_blank">';
    const contentWithBase = body.includes('<head>') 
      ? body.replace('<head>', `<head>${baseTag}`)
      : `${baseTag}${body}`;
    
    // Forzar que el contenido se ajuste al ancho disponible de forma elegante
    return `<style>
      body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      img { max-width: 100% !important; height: auto !important; }
      table { max-width: 100% !important; width: 100% !important; table-layout: fixed !important; }
    </style>${contentWithBase}`;
  };
  const [inboxUnseen, setInboxUnseen] = useState(0);
  const [contextMenu, setContextMenu] = useState<{visible: boolean, x: number, y: number, email: Email | null}>({visible: false, x: 0, y: 0, email: null});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isPasswordUpdateModalOpen, setIsPasswordUpdateModalOpen] = useState(false);
  const [selectedAccountForUpdate, setSelectedAccountForUpdate] = useState<Account | null>(null);
  const [lastEmailCount, setLastEmailCount] = useState(0);
  const ITEMS_PER_PAGE = 50;
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isAiGeneratorOpen, setIsAiGeneratorOpen] = useState(false);
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [newContactData, setNewContactData] = useState({ name: '', email: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
  const [isRawHtmlMode, setIsRawHtmlMode] = useState(false);
  const [isSessionIdentified, setIsSessionIdentified] = useState(false);
  const [recipientDropdownField, setRecipientDropdownField] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState('');
  
  const [composeState, setComposeState] = useState({
    isOpen: false, 
    type: 'new' as 'new'|'reply'|'forward', 
    isMaximized: false,
    attachments: [] as DriveFile[],
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    fromAccountId: '' as string,
    senderName: '' as string,
    showCc: false,
    showBcc: false,
    isSending: false
  });

  const htmlShellRef = useRef({ prefix: '', suffix: '' });

  useEffect(() => {
    const handleOpenDraft = (e: any) => {
      const { detail } = e;
      if (detail) {
        setComposeState(prev => ({
          ...prev,
          isOpen: true,
          to: detail.to || '',
          cc: '',
          bcc: '',
          subject: detail.subject || '',
          body: detail.body || '',
          attachments: []
        }));
      }
    };

    window.addEventListener('goatify-open-draft', handleOpenDraft);
    const handleSwitchFolder = (e: any) => {
      if (e.detail) setCurrentFolder(e.detail);
    };
    window.addEventListener('goatify-switch-folder', handleSwitchFolder);
    return () => {
      window.removeEventListener('goatify-open-draft', handleOpenDraft);
      window.removeEventListener('goatify-switch-folder', handleSwitchFolder);
    };
  }, []);

  useEffect(() => {
    if (mailDraft) {
      setComposeState({
        isOpen: true,
        type: 'new',
        isMaximized: true,
        attachments: [],
        to: mailDraft.to,
        cc: mailDraft.cc || '',
        bcc: mailDraft.bcc || '',
        subject: mailDraft.subject,
        body: mailDraft.htmlBody,
        fromAccountId: mailDraft.accountId || userProfile.primaryEmailAccountId || (activeAccountId === 'all' ? accounts[0]?.id : activeAccountId),
        senderName: userProfile?.name || 'Goatify Mail',
        showCc: !!mailDraft.cc,
        showBcc: !!mailDraft.bcc,
        isSending: false
      });
      setMailDraft(null);
    }
  }, [mailDraft, accounts, activeAccountId, userProfile]);

  const handleConnectGoogle = async () => {
    try {
      const redirectUri = `${window.location.origin}/api/auth/google/callback`;
      const res = await fetch(`/api/auth/google/url?redirectUri=${encodeURIComponent(redirectUri)}`);
      const { url } = await res.json();
      
      const width = 600;
      const height = 700;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;
      
      const authWindow = window.open(
        url,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!authWindow) {
        setToastNotification({ title: "Bloqueador Activado", message: "El bloqueador de ventanas emergentes está activado. Por favor, permítelas para conectar tu cuenta.", icon: "alert" });
      }
    } catch (e) {
      console.error("Error getting Google Auth URL", e);
      setToastNotification({ title: "Error", message: "Error al conectar con Google", icon: "close" });
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setToastNotification({ title: "Éxito", message: "¡Cuenta de Google conectada!", icon: "check" });
        setIsAddAccountModalOpen(false);
        fetchAccounts();
        fetchEmails();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (composeState.isOpen && !isRawHtmlMode && editorRef.current) {
      const shell = extractHtmlShell(composeState.body);
      htmlShellRef.current = { prefix: shell.prefix, suffix: shell.suffix };
      if (editorRef.current.innerHTML !== shell.inner) {
        editorRef.current.innerHTML = shell.inner;
      }
    }
  }, [composeState.isOpen, isRawHtmlMode, composeState.body]);

  const token = localStorage.getItem('goatify_token');

  useEffect(() => {
    if (!token && userProfile?.uid) {
      const autoLogin = async () => {
        try {
          const firebaseToken = await auth.currentUser?.getIdToken();
          if (!firebaseToken) throw new Error('Firebase token no disponible');
          const res = await fetch('/api/auth/login', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firebaseToken}` },
            body: JSON.stringify({ userId: userProfile.uid })
          });
          const data = await res.json();
          if (data.token) {
            localStorage.setItem('goatify_token', data.token);
            window.location.reload();
          }
        } catch (e) {
          console.error("Auto-login error", e);
        }
      };
      autoLogin();
    }
  }, [token, userProfile?.uid]);

  useEffect(() => {
    if (token && userProfile?.uid) {
      const savedAccounts = (userProfile as any).mailAccounts || [];
      if (savedAccounts.length > 0 || accounts.length > 0) {
        setIsSessionIdentified(false); // Reset to ensure we wait if re-identifying
      }
      auth.currentUser?.getIdToken().then(firebaseToken => fetch(`/api/auth/identify?token=${token}&userId=${userProfile.uid}`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(firebaseToken ? { 'Authorization': `Bearer ${firebaseToken}` } : {}) },
        body: JSON.stringify({ 
          accounts: savedAccounts.length > 0 ? savedAccounts : accounts,
          isSuperAdmin: (userProfile as any).email === 'info@goatify.app' || (userProfile as any).email === 'deoc29@gmail.com'
        })
      }))
      .then(res => res.json())
      .then((data) => {
        if (data.success) {
          setIsSessionIdentified(true);
        } else {
           // Si el token es inválido, forzamos re-login
           localStorage.removeItem('goatify_token');
           window.location.reload();
        }
      })
      .catch(err => console.error("Identity link error:", err));
    }
  }, [token, userProfile?.uid, userProfile?.mailAccounts?.length]);

  const folderTitles: Record<string, string> = {
    'inbox': 'Bandeja de entrada',
    'starred': 'Destacados',
    'sent': 'Enviados',
    'drafts': 'Borradores',
    'archive': 'Todos',
    'spam': 'Spam',
    'trash': 'Papelera'
  };

  const [isAccountsDropdownOpen, setIsAccountsDropdownOpen] = useState(false);
  const [isFullEmailViewOpen, setIsFullEmailViewOpen] = useState(false);

  // Listen for OAuth success via localStorage as a fallback
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'oauth_success') {
        localStorage.setItem('show_welcome_toast', 'true');
        window.location.reload();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (localStorage.getItem('show_welcome_toast') === 'true') {
      localStorage.removeItem('show_welcome_toast');
      setToastNotification({
        title: "¡Log In Exitoso!",
        message: "Ya puedes disfrutar del ecosistema Goatify para productividad: envía, recibe y gestiona tus correos sin límites.",
        icon: "check"
      });
    }
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      let newAccounts = [];
      if (data.accounts && data.accounts.length > 0) {
        newAccounts = Array.from(new Map(data.accounts.map((a: any) => [a.email.toLowerCase(), a])).values());
        setAccounts(newAccounts as Account[]);
      } else {
        const savedAccounts = (userProfile as any).mailAccounts || [];
        if (savedAccounts.length > 0) {
          for (const acc of savedAccounts) {
            await fetch('/api/accounts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(acc)
            });
          }
          const res2 = await fetch('/api/accounts', { headers: { 'Authorization': `Bearer ${token}` } });
          const data2 = await res2.json();
          newAccounts = Array.from(new Map((data2.accounts || []).map((a: any) => [a.email.toLowerCase(), a])).values());
          setAccounts(newAccounts as Account[]);
        } else {
          setAccounts([]);
        }
      }

      // Check if activeAccountId is invalid and reset to 'all' or primary account
      if (activeAccountId !== 'all') {
         const isValid = newAccounts.some((a: any) => a.id === activeAccountId);
         if (!isValid) {
            const isPrimaryValid = newAccounts.some((a: any) => a.id === userProfile?.primaryEmailAccountId);
            setActiveAccountId(isPrimaryValid ? userProfile.primaryEmailAccountId : 'all');
         }
      }
    } catch (e) {
      console.error("Error fetching accounts", e);
    }
  };



  const fetchEmails = async (isLoadMore = false, forceRefresh = false, isSilent = false) => {
    // No cache optimization for real-time requirement
    if (!isLoadMore && !isSilent) {
      setEmails([]); // Reset list for better visual feedback when switching folders
      setSelectedEmails([]);
    }

    if (!isSilent) {
      if (isLoadMore) setIsMoreLoading(true);
      else setIsLoading(true);
    }
    
    try {
      const offset = currentPage * ITEMS_PER_PAGE;
      const res = await fetch(`/api/emails?folder=${currentFolder}&accountId=${activeAccountId}&q=${searchQuery}&filter=${filterType}&offset=${offset}&limit=${ITEMS_PER_PAGE}${forceRefresh ? '&refresh=true' : ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const newEmails = data.emails || [];
      
      if (isLoadMore) {
        setEmails(prev => {
          const combined = [...prev, ...newEmails];
          const seen = new Set();
          return combined.filter(e => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          });
        });
      } else {
        setEmails(newEmails);

        // Notificaciones para nuevos correos
        if (currentFolder === 'inbox' && currentPage === 0 && lastEmailCount > 0 && newEmails.length > lastEmailCount) {
          const reallyNew = newEmails.slice(0, newEmails.length - lastEmailCount);
          reallyNew.forEach((email: any) => {
            if (!email.read) {
              setToastNotification({ 
                title: "Nuevo Correo", 
                message: `De ${email.sender.name} (${email.accountEmail})`, 
                icon: "mail" 
              });
            }
          });
        }
        if (currentFolder === 'inbox' && currentPage === 0) setLastEmailCount(newEmails.length);
      }
      
      setInboxUnseen(data.inboxUnseenCount || 0);
      setHasMore(data.hasMore);
    } catch (e) {
      console.error("Error fetching emails", e);
    } finally {
      if (!isSilent) {
        setIsLoading(false);
        setIsMoreLoading(false);
      }
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (token && currentFolder === 'inbox' && accounts.length > 0) {
      interval = setInterval(() => {
        if (currentPage === 0 && !searchQuery) {
          fetchEmails(false, true, true);
        }
      }, 15000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [token, currentFolder, accounts, currentPage, filterType, searchQuery, activeAccountId]);

  useEffect(() => { 
    if (token) {
      fetchAccounts();
    }
  }, [token]);

  useEffect(() => { 
    if (token && isSessionIdentified) {
      fetchEmails(); 
    }
  }, [currentFolder, activeAccountId, filterType, token, currentPage, isSessionIdentified]);

  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({...prev, visible: false}));
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleLogoutAccount = async (accId: string) => {
    // Remove native confirm as it gets blocked in the iframe
    try {
      const res = await fetch(`/api/accounts/${accId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setToastNotification({ title: "Éxito", message: "Cuenta eliminada", icon: "trash" });
        setAccounts(data.accounts);
        // También eliminar de Firestore si existe
        const saved = (userProfile as any).mailAccounts || [];
        const accToRemove = accounts.find(a => a.id === accId);
        if (accToRemove) {
          const newSaved = saved.filter((s: any) => s.email !== accToRemove.email);
          await updateUserProfile(userProfile.uid, { mailAccounts: newSaved } as any);
        }
        if (activeAccountId === accId) setActiveAccountId('all');
      }
    } catch (e) {
      setToastNotification({ title: "Error", message: "Error al cerrar sesión", icon: "close" });
    }
  };

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: DriveFile[] = Array.from(files).map((file: File) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.type,
      size: file.size,
      isLocal: true,
      file: file
    }));
    setComposeState(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...newAttachments]
    }));
    setToastNotification({ title: "Adjunto", message: `Archivo "${files[0].name}" adjuntado`, icon: "check" });
  };

  const handleMove = async (emailId: string, dest: string) => {
    setEmails(prev => prev.filter(e => e.id !== emailId));
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    try {
      const res = await fetch(`/api/emails/${emailId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sourceFolder: currentFolder, destinationFolder: dest })
      });
      if (!res.ok) throw new Error('Failed');
      setToastNotification({ title: "Movido", message: `Movido a ${dest === 'trash' ? 'Papelera' : 'Archivo'}`, icon: "check" });
    } catch (e) {
      setToastNotification({ title: "Error", message: "Error al mover el correo", icon: "close" });
      fetchEmails();
    }
  };

  const handleBulkMove = async (dest: string) => {
    if (selectedEmails.length === 0) return;
    
    // Optimistic UI update
    const idsToMove = [...selectedEmails];
    setEmails(prev => prev.filter(e => !idsToMove.includes(e.id)));
    if (selectedEmail && idsToMove.includes(selectedEmail.id)) setSelectedEmail(null);
    setSelectedEmails([]);
    
    try {
      const res = await fetch(`/api/emails/bulk-move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ids: idsToMove, sourceFolder: currentFolder, destinationFolder: dest })
      });
      if (!res.ok) throw new Error('Failed');
      setToastNotification({ title: "Múltiples movidos", message: `${idsToMove.length} correos a ${dest === 'trash' ? 'Papelera' : 'Archivo'}`, icon: "check" });
    } catch (e) {
      setToastNotification({ title: "Error", message: "Error al mover los correos en masa", icon: "close" });
      fetchEmails();
    }
  };

  const handleToggleRead = async (email: Email, forceRead?: boolean) => {
    const newReadStatus = forceRead !== undefined ? forceRead : !email.read;
    if (email.read === newReadStatus) return;

    const updateEmails = (emailsList: Email[]) => emailsList.map(e => e.id === email.id ? { ...e, read: newReadStatus } : e);
    
    setEmails(prev => updateEmails(prev));

    try {
      const res = await fetch(`/api/emails/${email.id}/read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sourceFolder: currentFolder, read: newReadStatus })
      });
      if (!res.ok) throw new Error('Failed');
    } catch (e) {
      fetchEmails();
    }
  };

  const getSignatureHtml = () => {
    const activeSignature = userProfile?.mailSignatures?.find((s: any) => s.active);
    if (!activeSignature) return '';
    if (activeSignature.type === 'plain') {
      return `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6; color: #4b5563; font-family: sans-serif; font-size: 14px; line-height: 1.5;">${activeSignature.content.replace(/\n/g, '<br/>')}</div>`;
    } else if (activeSignature.type === 'image') {
      return `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;"><img src="${activeSignature.content}" style="max-width: 400px; border-radius: 8px;" alt="Firma" /></div>`;
    } else {
      return `<br/><br/><div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">${activeSignature.content}</div>`;
    }
  };

  const handleReply = () => {
    if (!selectedEmail) return;
    const signatureHtml = getSignatureHtml();
    setComposeState({
      isOpen: true,
      type: 'reply',
      isMaximized: false,
      attachments: [],
      to: selectedEmail.sender.email,
      cc: '',
      bcc: '',
      subject: `Re: ${selectedEmail.subject}`,
      body: `<br/>${signatureHtml}<br/><blockquote>${selectedEmail.body}</blockquote>`,
      fromAccountId: selectedEmail.accountId || (activeAccountId === 'all' ? accounts[0]?.id : activeAccountId),
      showCc: false,
      showBcc: false,
      isSending: false
    });
  };

  const handleForward = () => {
    if (!selectedEmail) return;
    const signatureHtml = getSignatureHtml();
    setComposeState({
      isOpen: true,
      type: 'forward',
      isMaximized: false,
      attachments: [],
      to: '',
      cc: '',
      bcc: '',
      subject: `Fwd: ${selectedEmail.subject}`,
      body: `<br/>${signatureHtml}<br/>--- Mensaje reenviado ---<br/>De: ${selectedEmail.sender.name} (${selectedEmail.sender.email})<br/>Fecha: ${selectedEmail.date}<br/>Asunto: ${selectedEmail.subject}<br/><br/>${selectedEmail.body}`,
      fromAccountId: activeAccountId === 'all' ? accounts[0]?.id : activeAccountId,
      showCc: false,
      showBcc: false,
      isSending: false
    });
  };

  const handleNewCompose = () => {
    const signatureHtml = getSignatureHtml();
    setComposeState({
      isOpen: true,
      type: 'new',
      isMaximized: false,
      attachments: [],
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: signatureHtml,
      fromAccountId: userProfile.primaryEmailAccountId || (activeAccountId === 'all' ? accounts[0]?.id : activeAccountId),
      senderName: userProfile?.name || 'Goatify Mail',
      showCc: false,
      showBcc: false,
      isSending: false
    });
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = signatureHtml;
      }
    }, 100);
  };

  const handleCloseCompose = async () => {
    if (composeState.to || composeState.subject || composeState.body) {
      const accId = composeState.fromAccountId || (activeAccountId === 'all' ? accounts[0]?.id : activeAccountId);
      if (accId) {
        setToastNotification({ title: "Guardado", message: "Guardado en borradores", icon: "check" });
        try {
          await fetch('/api/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              accountId: accId,
              to: composeState.to,
              cc: composeState.cc,
              bcc: composeState.bcc,
              subject: composeState.subject,
              body: composeState.body
            })
          });
          if (currentFolder === 'drafts') fetchEmails();
        } catch (e) {
          console.error("Error saving draft", e);
        }
      }
    }
    setComposeState({ ...composeState, isOpen: false, to: '', subject: '', body: '', attachments: [], isSending: false, senderName: userProfile?.displayName || 'Goatify Mail' });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (composeState.isOpen && composeRef.current && !composeRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest('button') && !target.closest('a')) {
          handleCloseCompose();
        }
      }
      if (isAccountsDropdownOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.relative')) {
          setIsAccountsDropdownOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [composeState, isAccountsDropdownOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEmails();
  };

  if (!token) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-8 p-12 bg-white rounded-[40px] shadow-2xl border border-gray-100 max-w-md mx-4">
          <div className="w-24 h-24 bg-brand-primary rounded-[30px] flex items-center justify-center mx-auto shadow-2xl shadow-brand-primary/20 rotate-3">
            <Mail className="w-12 h-12 text-white -rotate-3" />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Mailing & Campañas</h1>
            <p className="text-gray-500 text-lg">Tu correo corporativo, elevado al siguiente nivel.</p>
          </div>
          <button 
            onClick={async () => {
              const firebaseToken = await auth.currentUser?.getIdToken();
              if (!firebaseToken) throw new Error('Firebase token no disponible');
              const res = await fetch('/api/auth/login', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firebaseToken}` },
                body: JSON.stringify({ userId: userProfile.uid })
              });
              const data = await res.json();
              localStorage.setItem('goatify_token', data.token);
              window.location.reload();
            }}
            className="w-full bg-brand-primary text-white px-8 py-5 rounded-2xl text-xl font-bold shadow-xl hover:scale-[1.03] transition-all active:scale-95"
          >
            Acceder ahora
          </button>
        </div>
      </div>
    );
  }

  // --- SIDEBAR Z-INDEX FIX & BACKDROP ---
  // Aumentar z-index para que esté por encima del backdrop
  const sidebarZIndex = isSidebarOpen ? 'z-[1000000]' : 'z-40';

  const renderSidebar = () => (
    <aside className={`fixed inset-y-0 left-0 ${sidebarZIndex} w-64 bg-gray-50 border-r border-gray-100 md:relative md:translate-x-0 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="h-full flex flex-col">
        {/* Header del sidebar removido para ahorrar espacio ya que está arriba */}
        
        {/* Selector de cuenta estilo foto - Más compacto */}
        <div className="p-4 space-y-2">
          <div className="relative">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setActiveAccountId('all')}
                className={`flex-1 flex items-center justify-between p-3 border rounded-xl shadow-sm transition-all ${activeAccountId === 'all' ? 'bg-brand-primary/5 border-brand-primary/20' : 'bg-white border-gray-100 hover:border-brand-primary/30'}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeAccountId === 'all' ? 'bg-brand-primary text-white' : 'bg-gray-50 text-gray-400'}`}>
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className={`text-[10px] font-black leading-none ${activeAccountId === 'all' ? 'text-brand-primary' : 'text-gray-900'}`}>Todas las cuentas</p>
                    <p className="text-[8px] font-bold text-gray-400 uppercase mt-0.5">Buzón Unificado</p>
                  </div>
                </div>
              </button>
              <button 
                onClick={() => setIsAccountsDropdownOpen(!isAccountsDropdownOpen)}
                className={`p-3 border rounded-xl shadow-sm transition-all ${isAccountsDropdownOpen ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white border-gray-100 hover:border-brand-primary/30 text-gray-400'}`}
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${isAccountsDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isAccountsDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  {accounts.map(acc => (
                    <button 
                      key={acc.id}
                      onClick={() => {
                        setActiveAccountId(acc.id);
                        setIsAccountsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-all ${activeAccountId === acc.id ? 'bg-brand-primary/5' : ''}`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${activeAccountId === acc.id ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                        {acc.email[0].toUpperCase()}
                      </div>
                      <div className="flex-grow text-left overflow-hidden">
                        <p className={`text-[10px] font-bold truncate ${activeAccountId === acc.id ? 'text-brand-primary' : 'text-gray-700'}`}>{acc.email}</p>
                      </div>
                      {activeAccountId === acc.id && <Check className="w-3 h-3 text-brand-primary" />}
                    </button>
                  ))}
                </div>
                <div className="p-2 border-t border-gray-50 mt-1">
                  <button 
                    onClick={() => {
                      setIsAddAccountModalOpen(true);
                      setIsAccountsDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-gray-200 text-[9px] font-black text-gray-400 hover:border-brand-primary hover:text-brand-primary hover:bg-brand-primary/5 transition-all"
                  >
                    <Plus className="w-3 h-3" /> AÑADIR CUENTA
                  </button>
                </div>
              </div>
            )}
          </div>

          <a 
            href="#compose"
            onClick={(e) => { e.preventDefault(); handleNewCompose(); }}
            className="w-full bg-[#2d1b69] text-white h-11 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/10 hover:bg-[#3b22a1] hover:-translate-y-0.5 transition-all text-xs"
          >
            <Edit3 className="w-4 h-4" /> Redactar
          </a>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {[
            { id: 'inbox', label: 'Bandeja de entrada', icon: Inbox, count: inboxUnseen },
            { id: 'starred', label: 'Destacados', icon: Star, count: undefined },
            { id: 'sent', label: 'Enviados', icon: Send },
            { id: 'drafts', label: 'Borradores', icon: FileText },
            { id: 'campaigns', label: 'Mailing', icon: Megaphone },
            { id: 'archive', label: 'Archivo', icon: Archive },
            { id: 'spam', label: 'Spam', icon: AlertOctagon },
            { id: 'trash', label: 'Papelera', icon: Trash2 }
          ].map((f) => (
            <button 
              key={f.id} 
              onClick={(e) => { e.preventDefault(); setCurrentFolder(f.id); setIsSidebarOpen(false); }} 
              className={`w-full flex items-center justify-between px-5 py-3 rounded-2xl text-sm font-bold transition-all ${currentFolder === f.id ? 'bg-brand-primary/10 text-brand-primary shadow-sm' : 'text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
            >
              <div className="flex items-center gap-4 pointer-events-none">
                <f.icon className={`w-5 h-5 ${currentFolder === f.id ? 'text-brand-primary' : 'text-gray-400'}`} />
                <span>{f.label}</span>
              </div>
              {f.count !== undefined && (
                <span className={`text-[10px] font-black pointer-events-none ${currentFolder === f.id ? 'text-brand-primary' : 'text-gray-400'}`}>{f.count}</span>
              )}
            </button>
          ))}

          <div className="pt-6 pb-2 px-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cuentas</p>
          </div>
          <div className="space-y-1">
            <button 
              onClick={() => { setActiveAccountId('all'); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeAccountId === 'all' ? 'bg-brand-primary/10 text-brand-primary' : 'hover:bg-gray-50 text-gray-600'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${activeAccountId === 'all' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                <Layers className="w-4 h-4" />
              </div>
              <div className="flex-grow text-left overflow-hidden">
                <p className="text-xs font-bold truncate">Todas las cuentas</p>
                <p className="text-[10px] opacity-60 uppercase font-black tracking-tighter">Bandeja Unificada</p>
              </div>
            </button>

            {accounts.map(acc => (
              <div key={acc.id} className="group relative">
                <button 
                  onClick={() => { setActiveAccountId(acc.id); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeAccountId === acc.id ? 'bg-brand-primary/10 text-brand-primary' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${activeAccountId === acc.id ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {acc.email[0].toUpperCase()}
                  </div>
                  <div className="flex-grow text-left overflow-hidden">
                    <p className="text-xs font-bold truncate">{acc.email}</p>
                    <p className="text-[10px] opacity-60 uppercase font-black tracking-tighter">{acc.provider === 'zoho' ? 'Goatify' : acc.provider || 'Goatify'}</p>
                  </div>
                  {userProfile.primaryEmailAccountId === acc.id && (
                    <div className="absolute top-2 right-2">
                       <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    </div>
                  )}
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={(e) => { e.stopPropagation(); updateUserProfile(userProfile.uid, { primaryEmailAccountId: acc.id }); }}
                    className={`p-1.5 bg-white shadow-sm border border-gray-100 rounded-lg transition-all ${userProfile.primaryEmailAccountId === acc.id ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                    title="Establecer como principal"
                  >
                    <Star className={`w-3 h-3 ${userProfile.primaryEmailAccountId === acc.id ? 'fill-yellow-500' : ''}`} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedAccountForUpdate(acc); setIsPasswordUpdateModalOpen(true); }}
                    className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-lg text-gray-400 hover:text-brand-primary transition-all"
                    title="Actualizar Contraseña"
                  >
                    <ShieldCheck className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleLogoutAccount(acc.id); }}
                    className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-all"
                    title="Cerrar sesión"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button onClick={() => { setIsAddAccountModalOpen(true); setIsSidebarOpen(false); }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-200 text-[10px] font-black text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
            <Plus className="w-3 h-3" /> AÑADIR CUENTA
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className={`flex h-full bg-white overflow-hidden text-gray-900 font-sans selection:bg-brand-primary/10 transition-all duration-500 ${isFullScreenActive ? 'fixed inset-0 z-[9999] rounded-none' : 'relative rounded-[40px]'}`}>
      {/* Sidebar Izquierdo */}
      {/* Mobile Portal for Sidebar to avoid stacking context issues */}
      <div className="hidden md:block">
        {renderSidebar()}
      </div>
      {isSidebarOpen && createPortal(
         <div className="md:hidden">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1000000]" onClick={() => setIsSidebarOpen(false)} />
            <div className="fixed inset-y-0 left-0 z-[1000001] w-72 pointer-events-auto">
               {renderSidebar()}
            </div>
         </div>,
         document.body
      )}

      {/* Contenido Principal (Vista Dividida) */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-16 md:h-20 border-b border-gray-100 flex items-center px-4 md:px-8 bg-white shrink-0 gap-3 md:gap-6">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 bg-gray-50 rounded-xl"><Menu className="w-5 h-5 text-gray-600" /></button>
          <form onSubmit={handleSearch} className="flex-1 max-w-2xl relative">
            <Search className="w-4 h-4 absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchQuery ? "Buscando..." : "Buscar..."} 
              className="w-full pl-10 md:pl-12 pr-4 md:pr-6 py-2 md:py-3 bg-gray-50 border border-gray-100 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-medium focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all" 
            />
          </form>
          <div className="flex items-center gap-3">
             {accounts.length > 0 && (
               <div className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                 <Mail className="w-4 h-4 text-gray-400" />
                 <span className="text-[10px] font-bold text-gray-600">
                   {activeAccountId === 'all' ? 'Todas las cuentas' : (accounts.find(a => a.id === activeAccountId)?.email || 'Cuenta')}
                 </span>
               </div>
             )}
             <button 
               onClick={() => setIsFullScreenActive(!isFullScreenActive)} 
               className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-[10px] font-black text-gray-500 transition-all border border-gray-100"
               title={isFullScreenActive ? "Salir de pantalla completa" : "Modo pantalla completa"}
             >
               {isFullScreenActive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
               {isFullScreenActive ? 'SALIR' : 'PANTALLA COMPLETA'}
             </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {currentFolder === 'campaigns' ? (
              <CampaignManager 
                  currentUser={currentUser} 
                  accounts={accounts} 
                  activeAccountId={activeAccountId} 
                  setToastNotification={setToastNotification} 
                  userProfile={userProfile} 
                  checkAndConsumeLimit={checkAndConsumeLimit} 
                  mailLists={mailLists}
                  contacts={contacts}
                  updateUserProfile={updateUserProfile}
              />
          ) : (
            <>
          {/* Columna Izquierda: Lista de Correos */}
          <div className={`w-full md:w-[400px] lg:w-[450px] border-r border-gray-100 flex flex-col bg-white ${selectedEmail ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-6 shrink-0">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">{folderTitles[currentFolder] || 'Bandeja De Entrada'}</h2>
                <button 
                  onClick={() => fetchEmails(false, true)}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all border border-gray-100 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
                  title="Actualizar bandeja"
                >
                  <motion.div animate={isLoading ? { rotate: 360 } : {}} transition={isLoading ? { repeat: Infinity, duration: 1, ease: "linear" } : {}}>
                    <Clock className="w-3 h-3 text-gray-400" />
                  </motion.div>
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">Actualizar</span>
                </button>
              </div>
              
              {/* Tabs Estilizados - Más finos */}
              <div className="flex p-1 bg-gray-100/60 rounded-xl gap-1 border border-gray-100">
                <button 
                  onClick={() => setFilterType('all')}
                  className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg ${filterType === 'all' ? 'bg-white text-brand-primary shadow-sm border border-gray-50' : 'text-gray-400 hover:text-gray-900'}`}
                >
                  Todos
                </button>
                <button 
                  onClick={() => setFilterType('unread')}
                  className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg ${filterType === 'unread' ? 'bg-white text-brand-primary shadow-sm border border-gray-50' : 'text-gray-400 hover:text-gray-900'}`}
                >
                  No leídos
                </button>
              </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedEmails.length > 0 && (
              <div className="bg-brand-primary/5 border-y border-brand-primary/10 px-4 py-2 flex items-center justify-between shadow-[inset_0_-1px_3px_rgba(0,0,0,0.02)] shrink-0 relative z-10 transition-all">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSelectedEmails(selectedEmails.length === emails.length ? [] : emails.map(e => e.id))}
                      className="w-4 h-4 rounded-[4px] border-2 border-brand-primary flex items-center justify-center bg-brand-primary text-white"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] font-black text-brand-primary tracking-widest uppercase">{selectedEmails.length} seleccionados</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleBulkMove('archive')}
                    className="p-1.5 text-brand-primary hover:bg-white rounded-lg transition-colors border border-transparent hover:border-brand-primary/20 shadow-sm"
                    title="Archivar"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleBulkMove('trash')}
                    className="p-1.5 text-red-500 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-red-100 shadow-sm"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={async () => {
                      const emailsToToggle = emails.filter(e => selectedEmails.includes(e.id));
                      emailsToToggle.forEach(e => handleToggleRead(e, true));
                      setSelectedEmails([]);
                    }}
                    className="p-1.5 text-brand-primary hover:bg-white rounded-lg transition-colors border border-transparent hover:border-brand-primary/20 shadow-sm ml-1"
                    title="Marcar como leídos"
                  >
                    <MailOpen className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
              {!isSessionIdentified ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sincronizando sesión segura con Goatify...</p>
                </div>
              ) : isLoading && emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sincronizando Goatify Mail...</p>
                </div>
              ) : emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-12">
                  <div className="w-24 h-24 bg-gray-50 rounded-[32px] flex items-center justify-center border border-gray-100 mx-auto mb-6">
                    <Mail className="w-10 h-10 text-gray-200" />
                  </div>
                  {accounts.length === 0 ? (
                    <>
                      <h3 className="text-lg font-black text-gray-900 mb-2">Bienvenido a Goatify Mail</h3>
                      <p className="text-[11px] text-gray-400 font-bold max-w-[200px] mx-auto mb-6">Para empezar a recibir y enviar correos, conecta tu primera cuenta.</p>
                      <button 
                        onClick={() => setIsAddAccountModalOpen(true)}
                        className="bg-[#2d1b69] text-white px-8 py-3 rounded-xl font-black text-xs shadow-xl hover:scale-105 transition-all"
                      >
                        Conectar cuenta
                      </button>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-black text-gray-900 mb-2">Nada por aquí</h3>
                      <p className="text-[11px] text-gray-400 font-bold max-w-[200px] mx-auto mb-6">No hay correos en esta bandeja o búsqueda.</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-50">
                    {emails.map(email => (
                      <div key={email.id} className={`w-full text-left p-0 border-b border-gray-50 flex items-stretch transition-all hover:bg-gray-50/80 group relative ${selectedEmail?.id === email.id ? 'bg-brand-primary/5' : ''} ${!email.read ? 'bg-brand-primary/5' : ''}`}>
                        
                        <div className="pl-4 pr-2 flex items-center justify-center">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEmails(prev => prev.includes(email.id) ? prev.filter(id => id !== email.id) : [...prev, email.id]);
                            }}
                            className={`w-4 h-4 rounded-[4px] border-2 flex items-center justify-center transition-all ${
                              selectedEmails.includes(email.id) 
                                ? 'bg-brand-primary border-brand-primary text-white' 
                                : 'border-gray-200 text-transparent hover:border-brand-primary'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                          </button>
                        </div>
                      
                        <button 
                          onClick={() => {
                            if (currentFolder === 'drafts') {
                              setComposeState({
                                isOpen: true,
                                type: 'new',
                                isMaximized: false,
                                attachments: [],
                                to: email.to?.map(t => t.email).join(', ') || '',
                                cc: '',
                                bcc: '',
                                subject: email.subject,
                                body: email.body,
                                fromAccountId: userProfile.primaryEmailAccountId || email.accountId || (activeAccountId === 'all' ? accounts[0]?.id : activeAccountId),
                                showCc: false,
                                showBcc: false,
                                isSending: false
                              });
                            } else {
                              setSelectedEmail(email);
                              // Fetch full details for attachments
                              fetch(`/api/emails/${email.id}?folder=${email.folder || ''}`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                              })
                              .then(res => res.json())
                              .then(fullEmail => {
                                if (fullEmail && !fullEmail.error) {
                                  setSelectedEmail(fullEmail);
                                }
                              })
                              .catch(err => console.error("Error fetching full email", err));

                              if (!email.read) {
                                handleToggleRead(email, true);
                              }
                            }
                          }} 
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ visible: true, x: e.pageX, y: e.pageY, email });
                          }}
                          className={`flex-1 p-5 pl-2 flex items-start gap-4 bg-transparent outline-none text-left`}
                        >
                        <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black shrink-0 uppercase text-sm shadow-sm relative">
                          {email.sender.name[0]}
                          {(email.provider === 'google' || email.provider === 'gmail_manual') && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full p-0.5 shadow-sm border border-gray-100">
                              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-full h-full" />
                            </div>
                          )}
                          {(email.provider === 'microsoft' || email.provider === 'outlook_manual') && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-600 rounded-full p-0.5 shadow-sm border border-white flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 21 21"><path fill="#f25022" d="M0 0h10v10H0z"/><path fill="#7fba00" d="M11 0h10v10H11z"/><path fill="#00a4ef" d="M0 11h10v10H0z"/><path fill="#ffb900" d="M11 11h10v10H11z"/></svg>
                            </div>
                          )}
                          {(email.provider === 'zoho' || email.provider === 'custom' || !email.provider) && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden p-[1px]">
                              <img src="https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747" alt="Goatify" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className={`text-[11px] truncate ${!email.read ? 'font-black text-gray-900' : 'font-bold text-gray-500'}`}>{email.sender.name}</span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase">
                              {new Date(email.date).toLocaleDateString() === new Date().toLocaleDateString() 
                                ? new Date(email.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : new Date(email.date).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                          <div className={`text-xs truncate mb-1 ${!email.read ? 'font-black text-gray-900' : 'font-bold text-gray-700'}`}>{email.subject}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-[10px] text-gray-400 line-clamp-1 font-medium flex-1">{email.snippet}</div>
                            {email.hasAttachments && <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />}
                          </div>
                        </div>
                        {!email.read && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-brand-primary rounded-full shadow-lg shadow-brand-primary/20" />}
                      </button>
                      </div>
                    ))}
                  </div>
                  
                  {/* Pagination Controls */}
                  <div className="p-4 border-t border-gray-50 flex items-center justify-between bg-white sticky bottom-0 z-20">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Página {currentPage + 1}
                    </p>
                    <div className="flex gap-2">
                      <button 
                        disabled={currentPage === 0}
                        onClick={() => setCurrentPage(prev => prev - 1)}
                        className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-30 transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button 
                        disabled={!hasMore}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-30 transition-all"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Columna Derecha: Detalle del Correo */}
          <div className={`flex-1 bg-white flex flex-col ${!selectedEmail ? 'hidden md:flex' : 'flex'}`}>
            <AnimatePresence mode="wait">
              {selectedEmail ? (
                <motion.div 
                  key={selectedEmail.id}
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -10 }}
                  className="h-full flex flex-col"
                >
                  <div className="h-16 md:h-20 border-b border-gray-100 flex items-center px-4 md:px-8 justify-between shrink-0 bg-white/80 backdrop-blur-md sticky top-0 z-30">
                    <button onClick={() => setSelectedEmail(null)} className="md:hidden p-2 hover:bg-gray-100 rounded-xl transition-colors"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
                    <div className="flex gap-1 md:gap-2">
                      <button onClick={handleReply} className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all" title="Responder"><Reply className="w-4 h-4" /></button>
                      <button onClick={handleForward} className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all" title="Reenviar"><Forward className="w-4 h-4" /></button>
                      <div className="w-px h-5 bg-gray-100 mx-1 self-center" />
                      <button onClick={() => handleMove(selectedEmail.id, 'archive')} className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all" title="Archivar"><Archive className="w-4 h-4" /></button>
                      <button onClick={() => handleMove(selectedEmail.id, 'trash')} className="p-2.5 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-600 transition-all" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                      <div className="w-px h-5 bg-gray-100 mx-1 self-center" />
                      <button onClick={() => handleToggleRead(selectedEmail)} className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all" title={selectedEmail.read ? "Marcar como no leído" : "Marcar como leído"}><MailOpen className="w-4 h-4" /></button>
                      <div className="w-px h-5 bg-gray-100 mx-1 self-center" />
                      <button onClick={() => setIsFullEmailViewOpen(true)} className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all" title="Ver en pantalla completa"><Maximize2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 custom-scrollbar">
                    <div className="max-w-3xl mx-auto">
                      <h1 className="text-xl md:text-3xl font-black text-gray-900 mb-6 md:mb-10 leading-tight tracking-tight">{selectedEmail.subject}</h1>
                      <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-10 pb-4 md:pb-6 border-b border-gray-50">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-brand-primary text-white flex items-center justify-center font-black text-base md:text-lg uppercase shadow-xl shadow-brand-primary/20">
                          {selectedEmail.sender.name[0]}
                        </div>
                        <div>
                          <div className="font-black text-sm md:text-base text-gray-900">{selectedEmail.sender.name}</div>
                          <div className="text-[10px] md:text-[11px] font-bold text-gray-400">De: {selectedEmail.sender.email}</div>
                          {selectedEmail.to && selectedEmail.to.length > 0 && (
                            <div className="text-[10px] md:text-[11px] font-bold text-gray-400 mt-0.5">
                              Para: {selectedEmail.to.map(t => t.email).join(', ')}
                            </div>
                          )}
                        </div>
                        <div className="ml-auto text-[9px] md:text-[10px] font-black text-gray-300 uppercase tracking-widest">
                          {new Date(selectedEmail.date).toLocaleDateString()}
                        </div>
                      </div>
                      <iframe 
                        className="w-full min-h-[500px] border-none bg-white rounded-lg shadow-sm"
                        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                        srcDoc={renderEmailBody(selectedEmail.body)}
                        title="Email Content"
                      />

                      {/* Botones de acción estilo Gmail al final del cuerpo */}
                      <div className="flex items-center gap-4 mb-12">
                        <button 
                          onClick={handleReply}
                          className="flex items-center gap-2 px-6 py-2.5 border border-gray-200 rounded-full text-sm font-bold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
                        >
                          <Reply className="w-4 h-4" />
                          Responder
                        </button>
                        <button 
                          onClick={handleForward}
                          className="flex items-center gap-2 px-6 py-2.5 border border-gray-200 rounded-full text-sm font-bold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
                        >
                          <Forward className="w-4 h-4" />
                          Reenviar
                        </button>
                      </div>

                      {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                        <div className="mt-12 pt-8 border-t border-gray-50">
                          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Paperclip className="w-3 h-3" /> Adjuntos ({selectedEmail.attachments.length})
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedEmail.attachments.map((att) => (
                              <a 
                                key={att.id}
                                href={`/api/emails/${selectedEmail.id}/attachments/${att.id}?token=${token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-brand-primary hover:bg-brand-primary/5 transition-all group"
                              >
                                <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-brand-primary transition-colors overflow-hidden">
                                  {att.contentType.startsWith('image/') ? (
                                    <img 
                                      src={`/api/emails/${selectedEmail.id}/attachments/${att.id}?token=${token}`} 
                                      alt={att.filename} 
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <FileIcon className="w-5 h-5" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-gray-900 truncate">{att.filename}</p>
                                  <p className="text-[9px] font-bold text-gray-400 uppercase">{(att.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <Download className="w-4 h-4 text-gray-300 group-hover:text-brand-primary transition-colors" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                  <div className="w-24 h-24 bg-gray-50 rounded-[32px] flex items-center justify-center border border-gray-100 mx-auto mb-6">
                    <Mail className="w-10 h-10 text-gray-200" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900 mb-2">Ningún correo seleccionado</h3>
                  <p className="text-[11px] text-gray-400 font-bold max-w-[200px] mx-auto">Selecciona un correo de la lista de la izquierda para leer su contenido aquí.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Modal Redactar (Estilo Floating SaaS Mega Pro - Refinado) */}
      {composeState.isOpen && createPortal(
        <div className="fixed inset-0 z-[999999] pointer-events-none">
          <motion.div 
            ref={composeRef}
            initial={{ y: 200, opacity: 0, scale: 0.95 }} 
            animate={{ y: 0, opacity: 1, scale: 1 }} 
            className={`bg-white shadow-[0_32px_64px_-12px_rgba(0,0,0,0.25)] border border-gray-200 flex flex-col pointer-events-auto overflow-hidden transition-all duration-300 ${
              composeState.isMaximized 
                ? 'absolute inset-0 rounded-none' 
                : 'absolute bottom-0 right-0 md:right-6 w-full md:w-[600px] lg:w-[800px] h-[90vh] md:h-[600px] lg:h-[700px] max-h-[100vh] md:max-h-[calc(100vh-1.5rem)] rounded-t-[24px] md:rounded-t-[32px]'
            }`}
          >
            <div className="bg-[#2d1b69] text-white p-4 md:p-5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white/10">
                  {userProfile?.avatarUrl ? (
                    <img src={userProfile.avatarUrl} alt="Profile" className="w-full h-full object-contain p-0.5" />
                  ) : (
                    <Edit3 className="w-4 h-4 text-white" />
                  )}
                </div>
                <span className="font-black text-[11px] uppercase tracking-widest">Nuevo Mensaje</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setComposeState({...composeState, isMaximized: !composeState.isMaximized})} className="p-2 hover:bg-white/10 rounded-lg transition-colors hidden md:block">
                  {composeState.isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={handleCloseCompose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="px-6 py-4 space-y-3 border-b border-gray-50 bg-white shrink-0">
              <datalist id="contacts-list">
                {contacts.map((c, i) => <option key={i} value={c} />)}
              </datalist>

              {/* From Selector */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4 group">
                  <span className="text-[9px] font-black text-gray-300 uppercase w-10 group-focus-within:text-brand-primary transition-colors">Desde</span>
                  <select 
                    value={composeState.fromAccountId || (activeAccountId === 'all' ? accounts[0]?.id : activeAccountId)}
                    onChange={e => setComposeState({...composeState, fromAccountId: e.target.value})}
                    className="flex-1 outline-none text-xs font-bold text-gray-900 bg-transparent cursor-pointer"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.email}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-4 group">
                  <span className="text-[9px] font-black text-gray-300 uppercase w-10 group-focus-within:text-brand-primary transition-colors">Nombre</span>
                  <input 
                    type="text"
                    value={composeState.senderName}
                    onChange={e => setComposeState({...composeState, senderName: e.target.value})}
                    placeholder="Nombre a mostrar (p.ej. Mi Empresa)"
                    className="flex-1 outline-none font-bold text-xs text-gray-900 placeholder:text-gray-200"
                  />
                </div>
              </div>

              <div className="h-px bg-gray-50 w-full" />
              
              {/* Recipient Input with Chips */}
              {['to', 'cc', 'bcc'].map((field) => {
                if (field === 'cc' && !composeState.showCc) return null;
                if (field === 'bcc' && !composeState.showBcc) return null;
                
                const label = field === 'to' ? 'Para' : field === 'cc' ? 'CC' : 'CCO';
                const recipients = composeState[field as 'to'|'cc'|'bcc'].split(',').map(s => s.trim()).filter(s => s && s.includes('@'));
                const isDropdownOpen = recipientDropdownField === field;

                return (
                  <div key={field} className="flex flex-col gap-2 relative">
                    {field !== 'to' && <div className="h-px bg-gray-50 w-full" />}
                    <div className="flex items-start gap-4 group">
                      <span className="text-[9px] font-black text-gray-300 uppercase w-10 mt-2 group-focus-within:text-brand-primary transition-colors">{label}</span>
                      <div className="flex-1 flex flex-wrap gap-2 items-center min-h-[32px]">
                        {recipients.map((email, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 bg-brand-primary/10 text-brand-primary px-2 py-1 rounded-lg text-[10px] font-bold border border-brand-primary/20">
                            <span>{email}</span>
                            <button 
                              onClick={() => {
                                const newRecipients = recipients.filter((_, i) => i !== idx);
                                setComposeState({...composeState, [field]: newRecipients.join(', ')});
                              }}
                              className="hover:text-brand-primary/70"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <div className="flex-1 flex items-center gap-2 relative min-w-[150px]">
                          <input 
                            placeholder={recipients.length === 0 ? (field === 'to' ? "destinatario@correo.com" : field === 'cc' ? "cc@correo.com" : "cco@correo.com") : ""}
                            className="flex-1 outline-none text-xs font-bold text-gray-900 placeholder:text-gray-200" 
                            value={recipientDropdownField === field ? recipientSearchQuery : ''}
                            onChange={(e) => {
                              const val = e.currentTarget.value;
                              setRecipientSearchQuery(val);
                              if (val.trim()) {
                                setRecipientDropdownField(field as 'to'|'cc'|'bcc');
                              } else {
                                setRecipientDropdownField(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === ',' || e.key === ';' || e.key === 'Enter' || e.key === 'Tab') {
                                if (e.currentTarget.value.trim()) {
                                  e.preventDefault();
                                  const val = e.currentTarget.value.trim().toLowerCase();
                                  // Expansion Logic: Check if it's a list name
                                  const matchedList = mailLists.find(l => l.name.toLowerCase() === val.toLowerCase());
                                  if (matchedList) {
                                    let updatedList = [...recipients, ...matchedList.emails.map((m: string) => m.toLowerCase())];
                                    const uniqueRecipients = Array.from(new Set(updatedList));
                                    setComposeState(prev => ({ ...prev, [field]: uniqueRecipients.join(', ') }));
                                    setToastNotification({ title: "Grupo Expandido", message: `Se añadieron ${matchedList.emails.length} correos de '${matchedList.name}'`, icon: "users" });
                                  } else {
                                    if (!recipients.includes(val) && val.includes('@')) {
                                      setComposeState(prev => ({ ...prev, [field]: [...recipients, val].join(', ') }));
                                    } else if (!val.includes('@')) {
                                       const matchedContact = contacts.find(c => c.name?.toLowerCase() === val || c.email.toLowerCase().includes(val));
                                       if (matchedContact && !recipients.includes(matchedContact.email)) {
                                         setComposeState(prev => ({ ...prev, [field]: [...recipients, matchedContact.email].join(', ') }));
                                       }
                                    }
                                  }
                                  setRecipientSearchQuery('');
                                }
                              } else if (e.key === 'Backspace' && !e.currentTarget.value && recipients.length > 0) {
                                const newRecipients = recipients.slice(0, -1);
                                setComposeState(prev => ({ ...prev, [field]: newRecipients.join(', ') }));
                              }
                            }}
                            onBlur={(e) => {
                              setTimeout(() => {
                                const val = e.target.value.trim().toLowerCase();
                                if (val && val.includes('@')) {
                                  if (!recipients.includes(val)) {
                                    setComposeState(prev => ({ ...prev, [field]: [...recipients, val].join(', ') }));
                                  }
                                }
                                setRecipientSearchQuery('');
                                setRecipientDropdownField(null);
                              }, 200);
                            }}
                          />
                          <button 
                            onClick={() => setRecipientDropdownField(isDropdownOpen ? null : field as 'to'|'cc'|'bcc')}
                            className={`p-1 rounded-md transition-colors ${isDropdownOpen ? 'bg-brand-primary text-white' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'}`}
                          >
                             <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </div>

                        {/* Custom Dropdown */}
                        <AnimatePresence>
                          {isDropdownOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute top-full left-14 right-0 z-[50] mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
                            >
                               <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                                  {(() => {
                                     const filteredLists = mailLists.filter(l => 
                                        !recipientSearchQuery || l.name.toLowerCase().includes(recipientSearchQuery.toLowerCase())
                                     );
                                     const filteredContacts = contacts.filter(c => 
                                        !recipientSearchQuery || 
                                        c.email.toLowerCase().includes(recipientSearchQuery.toLowerCase()) || 
                                        (c.name && c.name.toLowerCase().includes(recipientSearchQuery.toLowerCase()))
                                     );

                                     if (filteredLists.length === 0 && filteredContacts.length === 0) {
                                        return (
                                           <div className="p-10 text-center">
                                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sin coincidencias</p>
                                           </div>
                                        );
                                     }

                                     return (
                                        <>
                                           {filteredLists.length > 0 && (
                                              <>
                                                 <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 py-1 bg-gray-50/50 rounded-lg">Grupos</p>
                                                 {filteredLists.map(l => (
                                                    <button 
                                                       key={l.id}
                                                       onClick={() => {
                                                          const updatedList = [...recipients, ...l.emails.map((m: string) => m.toLowerCase())];
                                                          const unique = Array.from(new Set(updatedList));
                                                          setComposeState(prev => ({ ...prev, [field]: unique.join(', ') }));
                                                          setToastNotification({ title: "Grupo Añadido", message: `${l.name} listo`, icon: "users" });
                                                          setRecipientDropdownField(null);
                                                          setRecipientSearchQuery('');
                                                       }}
                                                       className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-brand-primary/5 text-left group/item transition-all"
                                                    >
                                                       <div className="flex items-center gap-3">
                                                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                                             <Users className="w-4 h-4" />
                                                          </div>
                                                          <div>
                                                             <p className="text-xs font-bold text-gray-900 group-hover/item:text-brand-primary uppercase tracking-tight">{l.name}</p>
                                                             <p className="text-[9px] font-medium text-gray-400">{l.emails.length} correos</p>
                                                          </div>
                                                       </div>
                                                       <Plus className="w-3.5 h-3.5 text-gray-300 group-hover/item:text-brand-primary opacity-0 group-hover/item:opacity-100 transition-all" />
                                                    </button>
                                                 ))}
                                              </>
                                           )}
                                           
                                           {filteredContacts.length > 0 && (
                                              <>
                                                 <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 py-1 bg-gray-50/50 rounded-lg mt-2">Contactos Individuales</p>
                                                 {filteredContacts.map(c => (
                                                    <button 
                                                       key={c.id || c.email}
                                                       onClick={() => {
                                                          if (!recipients.includes(c.email)) {
                                                            setComposeState(prev => ({ ...prev, [field]: [...recipients, c.email].join(', ') }));
                                                          }
                                                          setRecipientDropdownField(null);
                                                          setRecipientSearchQuery('');
                                                       }}
                                                       className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-brand-primary/5 text-left group/item transition-all"
                                                    >
                                                       <div className="flex items-center gap-3">
                                                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 text-[10px] font-black uppercase">
                                                             {c.name ? c.name.charAt(0) : <Mail className="w-3 h-3" />}
                                                          </div>
                                                          <div>
                                                             <p className="text-xs font-bold text-gray-900 group-hover/item:text-brand-primary">{c.name || 'Sin Nombre'}</p>
                                                             <p className="text-[9px] font-medium text-gray-400">{c.email}</p>
                                                          </div>
                                                       </div>
                                                       <Plus className="w-3.5 h-3.5 text-gray-300 group-hover/item:text-brand-primary opacity-0 group-hover/item:opacity-100 transition-all" />
                                                    </button>
                                                 ))}
                                              </>
                                           )}
                                        </>
                                     );
                                  })()}
                               </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="flex items-center gap-2">
                           <button 
                              onClick={() => setIsAddContactModalOpen(true)}
                              className="p-1 px-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all text-[9px] font-black uppercase tracking-tight flex items-center gap-1"
                              title="Guardar un contacto nuevo"
                            >
                              <Plus className="w-3 h-3" /> Contacto
                            </button>
                          {field === 'to' && (
                            <>
                             <button 
                                onClick={() => setIsSavingListModalOpen(true)}
                                className="p-1 px-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all text-[9px] font-black uppercase tracking-tight flex items-center gap-1"
                                title="Guardar estos correos como un grupo"
                              >
                                <Save className="w-3 h-3" /> Grupo
                              </button>
                              {!composeState.showCc && (
                                <button onClick={() => setComposeState({...composeState, showCc: true})} className="text-[10px] font-bold text-gray-400 hover:text-brand-primary transition-colors">CC</button>
                              )}
                              {!composeState.showBcc && (
                                <button onClick={() => setComposeState({...composeState, showBcc: true})} className="text-[10px] font-bold text-gray-400 hover:text-brand-primary transition-colors">CCO</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="h-px bg-gray-50 w-full" />
              <div className="flex items-center justify-between group gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <span className="text-[9px] font-black text-gray-300 uppercase w-10 group-focus-within:text-brand-primary transition-colors">Asunto</span>
                  <input 
                    value={composeState.subject}
                    onChange={e => setComposeState({...composeState, subject: e.target.value})}
                    placeholder="Escribe el título aquí..." 
                    className="flex-1 outline-none font-black text-xs text-gray-900 placeholder:text-gray-200" 
                  />
                </div>
                <button
                  onClick={() => {
                    setComposeState({ ...composeState, isOpen: false });
                    setCurrentFolder('campaigns');
                  }}
                  className="bg-[#ebf5ff] text-[#0066ff] hover:bg-[#0066ff] hover:text-white transition-all px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[9px] font-black uppercase shrink-0 border border-[#0066ff]/20 hover:border-[#0066ff] shadow-sm ml-2"
                  title="Cambiar a panel de envíos masivos/recurrentes"
                >
                  <Megaphone className="w-3 h-3" /> CAMPAÑA / RECURRENTE
                </button>
              </div>
            </div>

            {/* Toolbar Mega Pro - Más compacto */}
              <div className="px-4 py-2 border-b border-gray-50 flex items-center justify-between bg-gray-50/30 shrink-0 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-0.5">
                  <button 
                    onClick={() => setIsRawHtmlMode(!isRawHtmlMode)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] font-black transition-all shadow-sm shrink-0 mr-2 border ${isRawHtmlMode ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-500 border-gray-200 hover:text-brand-primary hover:border-brand-primary'}`}
                    title="Editar código fuente HTML manualmente"
                  >
                    <Code className="w-3 h-3" />
                    HTML
                  </button>
                  <div className="w-px h-4 bg-gray-200 mx-1"></div>
                  {[
                    { icon: Bold, action: 'bold', title: 'Negrita' },
                    { icon: Italic, action: 'italic', title: 'Cursiva' },
                    { icon: Underline, action: 'underline', title: 'Subrayado' },
                    { icon: AlignLeft, action: 'justifyLeft', title: 'Alinear Izquierda' },
                    { icon: AlignCenter, action: 'justifyCenter', title: 'Centrar' },
                    { icon: AlignRight, action: 'justifyRight', title: 'Alinear Derecha' },
                    { icon: Link2, action: 'createLink', title: 'Insertar Link' },
                  ].map((tool, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        if (tool.action === 'createLink') {
                          const url = prompt('Introduce la URL del enlace (ej. https://google.com):');
                          if (url) document.execCommand('createLink', false, url);
                        } else {
                          document.execCommand(tool.action, false);
                        }
                      }}
                      disabled={isRawHtmlMode}
                      className={`p-2 rounded-lg text-gray-400 transition-all ${isRawHtmlMode ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white hover:text-brand-primary active:scale-90'}`}
                      title={tool.title}
                    >
                      <tool.icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-[9px] font-black hover:bg-gray-200 transition-all shadow-sm shrink-0"
                    title="Adjuntar desde mi ordenador"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    PC / MÓVIL
                  </button>
                  <button 
                    onClick={() => setIsDrivePickerOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-500 text-white rounded-xl text-[9px] font-black hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 shrink-0"
                    title="Adjuntar desde Goatify Drive"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    GOATIFY DRIVE
                  </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
              {/* Logo de fondo (Watermark) */}
              {!composeState.body && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.05] select-none">
                  <img 
                    src="https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747" 
                    alt="Goatify Logo" 
                    className="w-48 h-48 md:w-64 md:h-64 object-contain"
                  />
                </div>
              )}

              <textarea 
                value={composeState.body}
                onChange={(e) => setComposeState({...composeState, body: e.target.value})}
                className={`flex-1 p-6 md:p-10 outline-none overflow-y-auto text-green-400 bg-gray-900 font-mono text-xs md:text-sm custom-scrollbar relative z-10 w-full resize-none ${!isRawHtmlMode ? 'hidden' : ''}`}
                placeholder="<!-- Pega HTML aquí -->"
              />
              <div 
                ref={editorRef} 
                contentEditable 
                onInput={(e) => {
                  const fullHtml = htmlShellRef.current.prefix + (e.currentTarget.innerHTML || '') + htmlShellRef.current.suffix;
                  setComposeState({...composeState, body: fullHtml});
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData('text/plain');
                  const html = e.clipboardData.getData('text/html');
                  if (html) {
                    // Try to preserve shell if pasting full HTML document into visual editor
                    if (html.includes('<body')) {
                        const parsed = extractHtmlShell(html);
                        htmlShellRef.current = { prefix: parsed.prefix, suffix: parsed.suffix };
                        document.execCommand('insertHTML', false, parsed.inner);
                    } else {
                        document.execCommand('insertHTML', false, html);
                    }
                  } else {
                    document.execCommand('insertText', false, text);
                  }
                }}
                className={`flex-1 p-6 md:p-10 outline-none overflow-y-auto text-gray-800 text-sm md:text-base font-medium custom-scrollbar relative z-10 ${isRawHtmlMode ? 'hidden' : ''}`} 
                placeholder="Escribe tu mensaje aquí..."
              />
              
              {composeState.attachments.length > 0 && (
                <div className="px-6 py-4 border-t border-gray-50 flex flex-wrap gap-3 bg-gray-50/20 relative z-10 max-h-40 overflow-y-auto custom-scrollbar">
                  {composeState.attachments.map((file, idx) => (
                    <motion.div 
                      key={idx} 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-3 bg-white border border-gray-100 p-2 pr-3 rounded-2xl shadow-sm group hover:border-brand-primary transition-all relative"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                        {(file.previewUrl || (file.isLocal && file.type?.startsWith('image/')) || (!file.isLocal && file.type?.startsWith('image/'))) ? (
                          <img 
                            src={file.previewUrl || file.path} 
                            alt={file.name} 
                            className="w-full h-full object-cover" 
                            onError={(e) => {
                              (e.target as any).src = "https://cdn-icons-png.flaticon.com/512/136/136521.png";
                            }}
                          />
                        ) : (
                          <FileIcon className="w-5 h-5 text-brand-primary" />
                        )}
                      </div>
                      <div className="min-w-0 max-w-[150px]">
                        <p className="text-[10px] font-black text-gray-800 truncate leading-tight mb-0.5">{file.name}</p>
                        <p className="text-[8px] font-black text-gray-400 tracking-tighter uppercase">{file.isLocal ? 'Móvil / PC' : 'Nube Drive'}</p>
                      </div>
                      <button 
                        onClick={() => setComposeState({...composeState, attachments: composeState.attachments.filter((_, i) => i !== idx)})}
                        className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center ml-2"
                        title="Quitar adjunto"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 md:p-6 border-t border-gray-50 flex justify-between items-center bg-white shrink-0">
              <div className="flex items-center gap-4">
                <button 
                  disabled={composeState.isSending}
                  onClick={async () => {
                    if (!(composeState.to || composeState.cc || composeState.bcc) || !composeState.subject) return setToastNotification({ title: "Error", message: "Faltan campos obligatorios (destinatario y asunto)", icon: "close" });
                    let accId = composeState.fromAccountId || userProfile.primaryEmailAccountId || (activeAccountId === 'all' ? accounts[0]?.id : activeAccountId);
                    if (!accounts.some(a => a.id === accId)) {
                      accId = accounts[0]?.id;
                    }
                    if (!accId) return setToastNotification({ title: "Error", message: "No se seleccionó o encontró ninguna cuenta válida remitente.", icon: "close" });
                    
                    setComposeState(prev => ({ ...prev, isSending: true }));
                    setToastNotification({ title: "Enviando", message: "Enviando correo...", icon: "loader" });
                    try {
                      const processedAttachments = await Promise.all(composeState.attachments.map(async (att) => {
                        if (att.isLocal && att.file) {
                          return new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              resolve({
                                name: att.name,
                                type: att.type,
                                size: att.size,
                                content: (reader.result as string).split(',')[1],
                                isLocal: true
                              });
                            };
                            reader.readAsDataURL(att.file!);
                          });
                        }
                        return att;
                      }));

                      let finalBody = composeState.body;
                      
                      // Inject Active Signature
                      const activeSignature = (userProfile.mailSignatures || []).find((s: any) => s.active);
                      if (activeSignature && !finalBody.includes('data-signature-id')) {
                        let sigHtml = '';
                        if (activeSignature.type === 'plain') {
                          sigHtml = `<div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6; color: #4b5563; font-family: sans-serif; font-size: 14px; line-height: 1.5;">${activeSignature.content.replace(/\n/g, '<br/>')}</div>`;
                        } else if (activeSignature.type === 'image') {
                          sigHtml = `<div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;"><img src="${activeSignature.content}" style="max-width: 400px; border-radius: 8px;" alt="Firma" /></div>`;
                        } else {
                          sigHtml = `<div data-signature-id="${activeSignature.id}" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">${activeSignature.content}</div>`;
                        }
                        finalBody += sigHtml;
                      }

                      const isFullHtml = finalBody.toLowerCase().includes('<html') || finalBody.toLowerCase().includes('<table');
                      if (!isFullHtml && finalBody.trim()) {
                        finalBody = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;background-color:#F9FAFB;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:850px;margin:0 auto;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;box-shadow:0 10px 25px rgba(0,0,0,0.05);">
    <tr>
      <td style="padding:40px;padding-bottom:30px;">
        <div style="font-size:15px;line-height:1.6;color:#374151;">
          ${finalBody.replace(/\n(?!(?:<|\/))/g, '<br/>')}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
                      }

                      const res = await fetch('/api/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                          accountId: accId,
                          senderName: composeState.senderName,
                          to: composeState.to,
                          cc: composeState.cc,
                          bcc: composeState.bcc,
                          subject: composeState.subject,
                          body: finalBody,
                          attachments: processedAttachments
                        })
                      });
                      
                      let data;
                      try {
                        data = await res.json();
                      } catch(err) {
                        setToastNotification({ title: "Error de Servidor", message: "Archivo muy pesado o error desconocido. No se pudo conectar.", icon: "close" });
                        setComposeState(prev => ({ ...prev, isSending: false }));
                        return;
                      }

                      if (data.success) {
                        saveContactsBatch(`${composeState.to},${composeState.cc},${composeState.bcc}`);
                        setToastNotification({ title: "Éxito", message: "¡Mensaje enviado!", icon: "check" });
                        setTimeout(() => {
                          setComposeState({ ...composeState, isOpen: false, to: '', subject: '', body: '', attachments: [], isSending: false, senderName: userProfile?.displayName || 'Goatify Mail' });
                        }, 1000);
                        if (currentFolder === 'sent') fetchEmails();
                      } else {
                        setToastNotification({ title: "Error", message: data.error || "Error al enviar", icon: "close" });
                        setComposeState(prev => ({ ...prev, isSending: false }));
                      }
                    } catch (e) {
                      setToastNotification({ title: "Error", message: "Error de conexión", icon: "close" });
                      setComposeState(prev => ({ ...prev, isSending: false }));
                    }
                  }}
                  className={`px-6 md:px-8 py-3 md:py-4 rounded-xl font-black shadow-xl transition-all flex items-center gap-2 text-xs ${composeState.isSending ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-brand-primary text-white shadow-brand-primary/20 hover:bg-brand-primary/90 hover:-translate-y-0.5 active:scale-95'}`}
                >
                  {composeState.isSending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar
                    </>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  <button 
                      disabled={isGeneratingHtml}
                      onClick={() => setIsAiGeneratorOpen(true)}
                      className={`p-3 hidden md:flex rounded-xl font-bold transition-all text-xs items-center gap-1 ${isGeneratingHtml ? 'text-brand-primary opacity-50' : 'text-brand-primary hover:bg-brand-primary/10'}`}
                      title="Abrir Generador de IA Mágica (Cuesta 3 Créditos)"
                    >
                      <Sparkles className="w-4 h-4 fill-brand-primary" />
                      Dar Magia HTML
                    </button>
                  <input 
                    type="file" 
                    multiple 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleLocalFileChange}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleCloseCompose}
                  className="text-gray-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-xl"
                  title="Guardar como borrador y cerrar"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {isAddContactModalOpen && createPortal(
        <div className="fixed inset-0 z-[2000000] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] w-full max-w-md p-8 shadow-2xl border border-gray-100"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 leading-tight">Nuevo Contacto</h3>
                <p className="text-xs text-gray-400 font-bold uppercase">Guarda un contacto en tu lista personal</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 mb-2 block">Nombre y Apellido</label>
                <input 
                  value={newContactData.name}
                  onChange={e => setNewContactData({...newContactData, name: e.target.value})}
                  placeholder="Ej: Juan Pérez"
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 font-bold text-gray-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 mb-2 block">Correo Electrónico</label>
                <input 
                  value={newContactData.email}
                  onChange={e => setNewContactData({...newContactData, email: e.target.value.toLowerCase()})}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 font-bold text-gray-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => setIsAddContactModalOpen(false)}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-xs text-gray-500 hover:bg-gray-50 transition-all uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                   if (!newContactData.email || !currentUser) return;
                   const exists = contacts.some(c => c.email.toLowerCase() === newContactData.email.toLowerCase());
                   if (exists) {
                      setToastNotification({ title: "Atención", message: "Este correo ya está en tus contactos", icon: "alert" });
                      return;
                   }
                   try {
                     await addDoc(collection(db, 'users', currentUser.uid, 'mail_contacts'), {
                       name: newContactData.name,
                       email: newContactData.email.toLowerCase(),
                       addedAt: new Date().toISOString()
                     });
                     setToastNotification({ title: "Contacto Guardado", message: `${newContactData.name || newContactData.email} ha sido añadido`, icon: "check" });
                     setIsAddContactModalOpen(false);
                     setNewContactData({ name: '', email: '' });
                   } catch (e) {
                      console.error("Error saving contact", e);
                   }
                }}
                disabled={!newContactData.email.includes('@')}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-xs bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0 uppercase tracking-widest"
              >
                Guardar
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {isSavingListModalOpen && createPortal(
        <div className="fixed inset-0 z-[2000000] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] w-full max-w-md p-8 shadow-2xl border border-gray-100"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 leading-tight">Guardar como Grupo</h3>
                <p className="text-xs text-gray-400 font-bold uppercase">Asigna un nombre a esta lista de correos</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 mb-2 block">Nombre del Grupo (ej: Oficina, Clientes)</label>
                <input 
                  value={listNameToSave}
                  onChange={e => setListNameToSave(e.target.value)}
                  placeholder="Nombre de la etiqueta"
                  autoFocus
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 font-bold text-gray-900 outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                />
              </div>
              
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Correos a guardar:</p>
                <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto custom-scrollbar">
                  {`${composeState.to},${composeState.cc},${composeState.bcc}`.split(',').map(e => e.trim()).filter(e => e.includes('@')).map((e, idx) => (
                    <span key={idx} className="text-[10px] font-bold text-emerald-600 bg-emerald-100/50 px-2 py-0.5 rounded-full">{e}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => setIsSavingListModalOpen(false)}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-xs text-gray-500 hover:bg-gray-50 transition-all uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveAsList}
                disabled={!listNameToSave.trim()}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-xs bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0 uppercase tracking-widest"
              >
                Guardar Grupo
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {isDrivePickerOpen && (
        <DrivePicker 
          onClose={() => setIsDrivePickerOpen(false)} 
          onSelect={(file) => {
            // Check if it's already attached to avoid duplicates
            if (!composeState.attachments.some(a => a.id === file.id)) {
              setComposeState({
                ...composeState, 
                attachments: [...composeState.attachments, file]
              });
              setToastNotification({ title: "Adjunto", message: `Archivo "${file.name}" adjuntado`, icon: "check" });
            }
            setIsDrivePickerOpen(false);
          }} 
        />
      )}

      {isAiGeneratorOpen && createPortal(
        <AiEmailGenerator 
          onClose={() => setIsAiGeneratorOpen(false)}
          onSave={(template) => {
            // Si el compose modal está abierto, aplicamos el HTML al cuerpo
            if (composeState.isOpen) {
              setComposeState(prev => ({ ...prev, body: template.html, subject: template.subject }));
              setToastNotification({ title: "Magia Aplicada", message: "Tu correo ha sido transformado.", icon: "check" });
            } else {
              // Si no, lo guardamos como plantilla local
              const saved = localStorage.getItem('goatify_campaign_templates');
              const templates = saved ? JSON.parse(saved) : [];
              localStorage.setItem('goatify_campaign_templates', JSON.stringify([...templates, { id: Date.now().toString(), ...template }]));
              setToastNotification({ title: "Plantilla Guardada", message: "Revisa la sección de Mailing.", icon: "check" });
            }
            setIsAiGeneratorOpen(false);
          }}
          setToastNotification={setToastNotification}
          checkAndConsumeLimit={checkAndConsumeLimit}
          currentUser={currentUser}
        />,
        document.body
      )}


      {/* Modal Ver Email Completo */}
      {isFullEmailViewOpen && selectedEmail && createPortal(
        <div className="fixed inset-0 z-[1000000] bg-gray-50 flex flex-col animate-in fade-in zoom-in duration-300">
          <div className="h-16 border-b border-gray-100 flex items-center px-4 md:px-8 justify-between shrink-0 bg-white sticky top-0 z-50">
            <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-brand-primary text-white flex items-center justify-center font-black text-xs md:text-sm uppercase shrink-0">
                {selectedEmail.sender.name[0]}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-black text-gray-900 truncate max-w-[200px] md:max-w-md">{selectedEmail.subject}</h2>
                <p className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase truncate">{selectedEmail.sender.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsFullEmailViewOpen(false)} 
                className="p-2 md:p-3 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
              >
                <X className="w-5 h-5 md:w-6 h-6" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-12 lg:p-16 custom-scrollbar bg-gray-50">
            <div className="max-w-5xl mx-auto">
              <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden mb-12">
                <div className="p-6 md:p-12 border-b border-gray-50 bg-white">
                  <h1 className="text-3xl md:text-5xl font-black text-gray-900 mb-6 leading-tight tracking-tight">{selectedEmail.subject}</h1>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-black text-gray-500 uppercase tracking-widest">De: {selectedEmail.sender.name}</span>
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-black text-gray-500 uppercase tracking-widest">{new Date(selectedEmail.date).toLocaleString()}</span>
                  </div>
                </div>
                
                <div className="p-0 bg-white">
                  <iframe 
                    className="w-full min-h-[700px] border-none"
                    sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                    srcDoc={renderEmailBody(selectedEmail.body)}
                    title="Email Content Full"
                  />
                </div>
              </div>

              {/* Botones de acción estilo Gmail al final del cuerpo */}
              <div className="flex items-center gap-4 mb-12">
                <button 
                  onClick={() => { setIsFullEmailViewOpen(false); handleReply(); }}
                  className="flex items-center gap-2 px-8 py-3 border border-gray-200 rounded-full text-base font-bold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
                >
                  <Reply className="w-5 h-5" />
                  Responder
                </button>
                <button 
                  onClick={() => { setIsFullEmailViewOpen(false); handleForward(); }}
                  className="flex items-center gap-2 px-8 py-3 border border-gray-200 rounded-full text-base font-bold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
                >
                  <Forward className="w-5 h-5" />
                  Reenviar
                </button>
              </div>

              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div className="mt-12 pt-12 border-t border-gray-100">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Paperclip className="w-4 h-4" /> Adjuntos ({selectedEmail.attachments.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedEmail.attachments.map((att) => (
                      <a 
                        key={att.id}
                        href={`/api/emails/${selectedEmail.id}/attachments/${att.id}?token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 hover:border-brand-primary hover:bg-brand-primary/5 transition-all group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-brand-primary transition-colors overflow-hidden">
                          {att.contentType.startsWith('image/') ? (
                            <img 
                              src={`/api/emails/${selectedEmail.id}/attachments/${att.id}?token=${token}`} 
                              alt={att.filename} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <FileIcon className="w-6 h-6" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-gray-900 truncate">{att.filename}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">{(att.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <Download className="w-5 h-5 text-gray-300 group-hover:text-brand-primary transition-colors" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Agregar Cuenta (Estilo Foto - Más Compacto) */}
      {isAddAccountModalOpen && createPortal(
        <div className="fixed inset-0 z-[1000000] bg-black/60 flex items-center justify-center p-4 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            className="bg-white rounded-[24px] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden relative"
          >
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-900 tracking-tight">Nueva cuenta</h2>
              <button onClick={() => setIsAddAccountModalOpen(false)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Proveedor</label>
                <div className="relative">
                  <select id="acc-provider" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 font-bold text-gray-900 appearance-none outline-none focus:border-brand-primary/20 transition-all text-sm">
                    <option value="zoho">Goatify Mail</option>
                    <option value="gmail">Gmail (App Password)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Correo electrónico</label>
                <input id="acc-email" placeholder="ejemplo@correo.com" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 font-bold text-gray-900 focus:bg-white focus:border-brand-primary/20 outline-none transition-all text-sm" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contraseña</label>
                <div className="relative">
                  <input id="acc-pass" type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 pr-12 font-bold text-gray-900 focus:bg-white focus:border-brand-primary/20 outline-none transition-all text-sm" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[9px] text-gray-400 font-bold leading-relaxed flex items-center gap-2">
                  Usa contraseña de aplicación si tienes 2FA activado (válido para Goatify y Gmail).
                  <button 
                    type="button" 
                    onClick={() => setIsInstructionsModalOpen(true)}
                    className="text-brand-primary hover:underline flex items-center gap-1"
                  >
                    <Info className="w-4 h-4" />
                    Instrucciones
                  </button>
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsAddAccountModalOpen(false)} className="flex-1 py-3.5 rounded-xl font-black text-gray-500 border border-gray-100 hover:bg-gray-50 transition-all text-xs">Cancelar</button>
                <button 
                  disabled={isLoading}
                  className="flex-1 bg-[#2d1b69] text-white py-3.5 rounded-xl font-black shadow-lg hover:bg-[#3b22a1] transition-all active:scale-95 text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  onClick={async () => {
                    const email = (document.getElementById('acc-email') as HTMLInputElement).value;
                    const password = (document.getElementById('acc-pass') as HTMLInputElement).value;
                    const provider = (document.getElementById('acc-provider') as HTMLSelectElement).value;
                    if (!email || !password) return setToastNotification({ title: "Atención", message: "Completa los campos", icon: "alert" });
                    
                    setIsLoading(true);
                    try {
                      const res = await fetch('/api/accounts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ email, password, provider })
                      });
                      
                      const data = await res.json();
                      
                      if (res.ok && data.success) {
                        const saved = (userProfile as any).mailAccounts || [];
                        if (!saved.some((a: any) => a.email === email)) {
                          // The backend now securely saves passwords, we only save metadata in userProfile for UI defaults if needed, but we don't save passwords in plain text anymore
                          const newId = crypto.randomUUID();
                          saved.push({ id: newId, email, provider });
                          await updateUserProfile(userProfile.uid, { mailAccounts: saved } as any);
                        }

                        localStorage.setItem('show_welcome_toast', 'true');
                        setIsAddAccountModalOpen(false);
                        window.location.reload();
                      } else {
                        const errorMsg = data.error?.toLowerCase().includes('credenciales') || data.error?.toLowerCase().includes('password') || data.error?.toLowerCase().includes('contraseña')
                          ? "❌ Contraseña incorrecta. Revisa tus datos e intenta de nuevo."
                          : (data.error || "Error al conectar la cuenta");
                        setToastNotification({ title: "Error", message: errorMsg, icon: "close" });
                      }
                    } catch (e) {
                      console.error("Error connecting account:", e);
                      setToastNotification({ title: "Error", message: "Error de conexión con el servidor", icon: "close" });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Conectar cuenta"}
                </button>
              </div>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-400 font-bold">O conecta con</span>
                </div>
              </div>

              <div className="flex gap-3">
                {/* 
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/auth/google/url?redirectUri=${encodeURIComponent(window.location.origin + '/api/auth/google/callback')}`);
                      const { url } = await res.json();
                      
                      const width = 500;
                      const height = 600;
                      const left = window.screenX + (window.outerWidth - width) / 2;
                      const top = window.screenY + (window.outerHeight - height) / 2;
                      
                      window.open(url, 'GoogleAuth', `width=${width},height=${height},left=${left},top=${top}`);
                      
                      const handleMessage = (event: MessageEvent) => {
                        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
                          window.removeEventListener('message', handleMessage);
                          localStorage.setItem('show_welcome_toast', 'true');
                          window.location.reload();
                        }
                      };
                      window.addEventListener('message', handleMessage);
                    } catch (e) {
                      console.error("Error starting Google auth:", e);
                      setToastNotification({ title: "Error", message: "Error al iniciar sesión con Google", icon: "close" });
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-xs font-black text-gray-700"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                  Google
                </button> 
                */}
                
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/auth/microsoft/url?redirectUri=${encodeURIComponent(window.location.origin + '/api/auth/microsoft/callback')}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      const { url } = await res.json();
                      
                      const width = 500;
                      const height = 600;
                      const left = window.screenX + (window.outerWidth - width) / 2;
                      const top = window.screenY + (window.outerHeight - height) / 2;
                      
                      window.open(url, 'MicrosoftAuth', `width=${width},height=${height},left=${left},top=${top}`);
                      
                      const handleMessage = (event: MessageEvent) => {
                        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
                          window.removeEventListener('message', handleMessage);
                          localStorage.setItem('show_welcome_toast', 'true');
                          window.location.reload();
                        }
                      };
                      window.addEventListener('message', handleMessage);
                    } catch (e) {
                      console.error("Error starting Microsoft auth:", e);
                      setToastNotification({ title: "Error", message: "Error al iniciar sesión con Microsoft", icon: "close" });
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-xs font-black text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 21 21"><path fill="#f25022" d="M0 0h10v10H0z"/><path fill="#7fba00" d="M11 0h10v10H11z"/><path fill="#00a4ef" d="M0 11h10v10H0z"/><path fill="#ffb900" d="M11 11h10v10H11z"/></svg>
                  Microsoft
                </button>
              </div>
            </div>

            {/* Modal de Instrucciones - Ahora DENTRO del mismo contenedor para evitar fallos de visibilidad */}
            <AnimatePresence>
              {isInstructionsModalOpen && (
                <motion.div 
                  initial={{ opacity: 0, x: '100%' }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-0 bg-white z-[100] flex flex-col"
                >
                  <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-gray-900">Instrucciones</h3>
                        <p className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">Seguridad Cifrada</p>
                      </div>
                    </div>
                    <button onClick={() => setIsInstructionsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-xl transition-colors">
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                      <p className="text-xs font-bold text-gray-700 leading-relaxed">
                        Todo es seguro y cifrado. Usamos contraseñas de aplicación porque es el método más seguro. Todo está en orden.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Gmail" className="w-4 h-4" />
                          <h4 className="font-black text-sm text-gray-900">Gmail</h4>
                        </div>
                        <ul className="text-[11px] font-bold text-gray-500 space-y-1.5 list-disc pl-4">
                          <li>Ve a <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">Seguridad de Google</a>.</li>
                          <li>Activa la <strong>Verificación en 2 pasos</strong>.</li>
                          <li>Busca <strong>"Contraseñas de aplicaciones"</strong>.</li>
                          <li>Crea una para "Goatify" y copia el código de 16 letras.</li>
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-blue-600">
                          <Mail className="w-4 h-4" />
                          <h4 className="font-black text-sm text-gray-900">Outlook / Hotmail</h4>
                        </div>
                        <ul className="text-[11px] font-bold text-gray-500 space-y-1.5 list-disc pl-4">
                          <li>Solo tienes que hacer clic en el botón <strong>"Microsoft"</strong> en la pantalla anterior y seguir los pasos oficiales.</li>
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-brand-primary">
                          <div className="w-4 h-4 rounded-full shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden p-0.5 bg-white">
                            <img src="https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747" alt="Goatify" className="w-full h-full object-cover" />
                          </div>
                          <h4 className="font-black text-sm text-gray-900">Goatify Mail</h4>
                        </div>
                        <p className="text-[11px] font-bold text-gray-500 leading-relaxed">
                          El correo de Goatify Mail es corporativo, configurado por Goatify. Se agrega automáticamente aquí cuando se completa la configuración previa con el cliente.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-gray-50 border-t border-gray-100">
                    <button 
                      onClick={() => setIsInstructionsModalOpen(false)}
                      className="w-full py-4 bg-brand-primary text-white rounded-2xl font-black shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-[0.98]"
                    >
                      Entendido
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Modal de Actualización de Contraseña */}
      {isPasswordUpdateModalOpen && selectedAccountForUpdate && createPortal(
        <div className="fixed inset-0 z-[1000000] bg-black/60 flex items-center justify-center p-4 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            className="bg-white rounded-[24px] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden"
          >
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-900 tracking-tight">Seguridad: {selectedAccountForUpdate.email.split('@')[0]}</h2>
              <button onClick={() => setIsPasswordUpdateModalOpen(false)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-[11px] text-amber-700 font-black uppercase mb-2">Cambio de Contraseña Real</p>
                <p className="text-[12px] text-gray-700 font-bold leading-relaxed mb-4">
                  Para cambiar tu contraseña de <b>Zoho</b> o <b>Google</b> de forma oficial y real, debes hacerlo en sus portales de seguridad:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <a 
                    href="https://accounts.zoho.com/u/h#security/password" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 bg-white border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors group"
                  >
                    <span className="font-black text-[11px] text-gray-900 uppercase">Seguridad Zoho Mail</span>
                    <ExternalLink className="w-4 h-4 text-amber-600 group-hover:translate-x-1 transition-transform" />
                  </a>
                  <a 
                    href="https://myaccount.google.com/security" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 bg-white border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors group"
                  >
                    <span className="font-black text-[11px] text-gray-900 uppercase">Seguridad Gmail</span>
                    <ExternalLink className="w-4 h-4 text-amber-600 group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>
              </div>

              <div className="pt-2">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Actualizar Conexión en Goatify</h4>
                <p className="text-[11px] text-gray-500 font-bold mb-4 leading-relaxed">
                  Si ya cambiaste tu contraseña en el sitio oficial, actualízala aquí para que Goatify pueda seguir sincronizando tus correos.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contraseña de App / Cuenta</label>
                    <button 
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[10px] font-black text-brand-primary uppercase hover:underline"
                    >
                      {showPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                  <div className="relative">
                    <input 
                      id="update-pass" 
                      type={showPassword ? "text" : "password"} 
                      placeholder="Nueva contraseña" 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 pr-12 font-bold text-gray-900 focus:bg-white focus:border-brand-primary/20 outline-none transition-all text-sm" 
                    />
                    <ShieldCheck className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-gray-200" />
                  </div>
                </div>
              </div>

              <button 
                disabled={isLoading}
                className="w-full bg-[#111827] text-white py-4 rounded-xl font-black shadow-lg hover:bg-black transition-all active:scale-95 text-xs disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={async () => {
                   const newPass = (document.getElementById('update-pass') as HTMLInputElement).value;
                   if (!newPass) return setToastNotification({ title: "Atención", message: "Ingresa la nueva contraseña", icon: "alert" });
                   
                   const token = localStorage.getItem('goatify_token');
                   setIsLoading(true);
                   try {
                     const res = await fetch(`/api/accounts/${selectedAccountForUpdate.id}`, {
                       method: 'PATCH',
                       headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                       body: JSON.stringify({ password: newPass })
                     });
                     
                     if (res.ok) {
                        setToastNotification({ title: "Éxito", message: "Contraseña actualizada en Goatify", icon: "check" });
                        setIsPasswordUpdateModalOpen(false);
                     } else {
                        const data = await res.json();
                        setToastNotification({ title: "Error", message: data.error || "No se pudo validar la nueva contraseña", icon: "close" });
                     }
                   } catch (e) {
                      setToastNotification({ title: "Error", message: "Error al actualizar", icon: "close" });
                   } finally {
                      setIsLoading(false);
                   }
                }}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualizar en Goatify"}
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.email && createPortal(
        <div 
          className="fixed z-[9999999] bg-white rounded-xl shadow-2xl border border-gray-100 py-2 w-48"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 150), left: Math.min(contextMenu.x, window.innerWidth - 200) }}
        >
          <button onClick={() => handleMove(contextMenu.email!.id, 'archive')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"><Archive className="w-4 h-4"/> Archivar</button>
          <button onClick={() => handleMove(contextMenu.email!.id, 'trash')} className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4"/> Eliminar</button>
          <div className="h-px bg-gray-100 my-1 w-full" />
          <button onClick={() => handleToggleRead(contextMenu.email!)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"><MailOpen className="w-4 h-4"/> Marcar como {contextMenu.email!.read ? 'no leído' : 'leído'}</button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GoatifyMail;
