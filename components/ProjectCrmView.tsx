import React, { useState, useContext, useMemo, useEffect, useRef } from 'react';
import { CrmServiceItem, ProjectClient, ProjectClientTodo, ClientActivity, ClientFile, Document, Note, ClientChangeRequest } from '../types';
import type { Project } from '../types';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Modal from './ui/Modal';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import { generateAiQuotation, generateClientAgreement, generateClientPreInvoice, investigateClientWithAi } from '../services/geminiService';
import jsPDF from 'jspdf';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { storage, db } from '../firebaseConfig';
import { getPlanConfig } from '../types';
import ChatMessageRenderer from './ui/ChatMessageRenderer';

interface ProjectCrmViewProps {
    project: Project;
}

const CRM_STATUSES = ['Prospecto', 'Reunión', 'Negociación', 'Ganado', 'Perdido'];

const ProjectCrmView: React.FC<ProjectCrmViewProps> = ({ project }) => {
    // Fix: Added 'projects' to destructuring from AppContext
    const { projects, updateProject, userProfile, setToastNotification, currentUser, setProModalOpen, addProject, setSelectedProjectId, setCurrentView, checkQueryLimit, userUsage, setMailDraft } = useContext(AppContext);
    // Added scheduleMeeting and joinMeeting from CallContext
    const { scheduleMeeting, joinMeeting } = useContext(CallContext);
    
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<ProjectClient | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    const [activeTabInEdit, setActiveTabInEdit] = useState<'info' | 'files' | 'activity' | 'room'>('info');
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

    const [isSchedulingMeeting, setIsSchedulingMeeting] = useState<ProjectClient | null>(null);
    const [meetingDate, setMeetingDate] = useState('');
    const [meetingTime, setMeetingTime] = useState('');
    const [meetingNotes, setMeetingNotes] = useState('');

    const [docPreview, setDocPreview] = useState<{ title: string, content: string, type: 'proposalText' | 'contractText' | 'preInvoiceText' } | null>(null);
    const [isEditingDoc, setIsEditingDoc] = useState(false);

    const [clientName, setClientName] = useState('');
    const [clientContact, setClientContact] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientTaxId, setClientTaxId] = useState('');
    const [clientStatus, setClientStatus] = useState('Prospecto');
    const [clientValue, setClientValue] = useState('');
    const [deliveryTime, setDeliveryTime] = useState('');
    const [applyTax, setApplyTax] = useState(false);
    const [taxPercentage, setTaxPercentage] = useState('15');
    const [currency, setCurrency] = useState('USD');
    const [enableAdvances, setEnableAdvances] = useState(false);
    const [advancePercentage, setAdvancePercentage] = useState('50');
    const [businessNotes, setBusinessNotes] = useState('');
    const [notes, setNotes] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [issuerLogoUrl, setIssuerLogoUrl] = useState('');
    
    const [tempProposalText, setTempProposalText] = useState('');
    const [tempContractText, setTempContractText] = useState('');
    const [tempPreInvoiceText, setTempPreInvoiceText] = useState('');

    const [brandName, setBrandName] = useState('');
    const [businessDescription, setBusinessDescription] = useState(''); 
    const [providerName, setProviderName] = useState('');
    const [providerTaxId, setProviderTaxId] = useState('');
    const [providerContact, setProviderContact] = useState('');
    const [issuerPhone, setIssuerPhone] = useState(''); 
    const [issuerCountryCode, setIssuerCountryCode] = useState('+593');
    const [issuerEmail, setIssuerEmail] = useState(''); 
    const [businessType, setBusinessType] = useState('');

    const [manualServices, setManualServices] = useState<CrmServiceItem[]>([]);
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');

    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [isInvestigating, setIsInvestigating] = useState(false);
    const [isGeneratingDoc, setIsGeneratingDoc] = useState<'proposal' | 'contract' | 'preinvoice' | null>(null);
    
    // Estado para manejar actividades locales de un prospecto que aún no se guarda
    const [tempActivities, setTempActivities] = useState<ClientActivity[]>([]);

    const logoInputRef = useRef<HTMLInputElement>(null);
    const issuerLogoInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const clients = useMemo(() => project.clients || [], [project.clients]);
    const pipelineTotal = useMemo(() => clients.reduce((acc, c) => acc + (c.value || 0), 0), [clients]);
    
    // MONITOR DE CRÉDITOS PARA BLOQUEO VISUAL
    const planConfig = getPlanConfig(userProfile.plan);
    const chatLimit = (planConfig.limits as any).ai_chat_daily_queries || 30;
    const chatUsed = userUsage?.counters?.daily_chat_count || 0;
    const hasEnergy = chatUsed < chatLimit;
    // Fix: Defined crmLimit from planConfig
    const crmLimit = (planConfig.limits as any).crm_clients_monthly || 4;

    useEffect(() => {
        if (manualServices.length > 0) {
            const sum = manualServices.reduce((acc, s) => acc + s.price, 0);
            setClientValue(sum.toString());
        }
    }, [manualServices]);

    const handleOpenAdd = () => {
        const limitValue = (planConfig.limits as any).crm_clients_monthly || 4;
        if (clients.length >= limitValue) {
            setToastNotification({
                title: "Límite Alcanzado",
                message: `Tu plan permite hasta ${limitValue} prospectos. Sube a Premium para ilimitados.`,
                icon: "lock",
                onClick: () => setProModalOpen(true)
            });
            setProModalOpen(true);
            return;
        }

        setEditingClient(null); setClientName(''); setClientContact(''); setClientPhone(''); setClientTaxId(''); setClientStatus('Prospecto'); setClientValue(''); setDeliveryTime(''); setApplyTax(false); setTaxPercentage('15'); setCurrency('USD'); setEnableAdvances(false); setAdvancePercentage('50'); setBusinessNotes(''); setNotes(''); setManualServices([]); setBrandName(userProfile.businessName || ''); setBusinessDescription(''); setProviderName(userProfile.businessName || userProfile.name); setProviderTaxId(''); setProviderContact(userProfile.email || ''); setIssuerPhone(userProfile.phoneNumber || ''); setIssuerEmail(userProfile.email || ''); setBusinessType(''); 
        setLogoUrl(''); 
        setIssuerLogoUrl(userProfile.avatarUrl || ''); 
        setTempProposalText(''); setTempContractText(''); setTempPreInvoiceText('');
        setTempActivities([]); 
        setActiveTabInEdit('info');
        setAddModalOpen(true);
    };

    const handleOpenEdit = (client: ProjectClient) => {
        setEditingClient(client); setClientName(client.name); setClientContact(client.contact); setClientPhone(client.phone || ''); setClientTaxId(client.taxId || ''); setClientStatus(client.status); setClientValue(client.value.toString()); setDeliveryTime(client.deliveryTime || ''); setApplyTax(!!client.applyTax); setTaxPercentage(String(client.taxPercentage || '15')); setCurrency(client.currency || 'USD'); setEnableAdvances(!!client.enableAdvances); setAdvancePercentage(String(client.advancePercentage || '50')); setBusinessNotes(client.businessNotes || ''); setNotes(client.notes || ''); setManualServices(client.services || []); setBrandName(client.brandName || ''); setBusinessDescription(client.businessDescription || ''); setProviderName(client.providerName || ''); setProviderTaxId(client.providerTaxId || ''); setProviderContact(client.providerContact || ''); setIssuerPhone(client.issuerPhone || ''); setIssuerEmail(client.issuerEmail || ''); setBusinessType(client.businessType || ''); setLogoUrl(client.logoUrl || ''); setIssuerLogoUrl(client.issuerLogoUrl || '');
        setTempProposalText(client.proposalText || '');
        setTempContractText(client.contractText || '');
        setTempPreInvoiceText(client.preInvoiceText || '');
        setTempActivities([]);
        setActiveTabInEdit('info');
        setAddModalOpen(true);
    };

    const logActivity = async (clientId: string | null, text: string, type: ClientActivity['type'] = 'system') => {
        const activity: ClientActivity = { id: `act-${Date.now()}`, type, text, date: new Date().toISOString(), user: userProfile.name };
        
        if (!clientId) {
            setTempActivities(prev => [activity, ...prev]);
            return;
        }

        const client = clients.find(c => c.id === clientId);
        if (!client) return;
        
        const updatedClients = clients.map(c => c.id === clientId ? { ...c, activityFeed: [activity, ...(c.activityFeed || [])] } : c);
        await updateProject(project.id, { clients: updatedClients });
        if (editingClient?.id === clientId) {
            setEditingClient(prev => prev ? { ...prev, activityFeed: [activity, ...(prev.activityFeed || [])] } : null);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser) return;
        setIsAiProcessing(true);
        try {
            const { url } = await uploadWithQuotaCheck({
                userId: currentUser.uid,
                data: file,
                path: safeStoragePath('crm-logos', currentUser.uid, `${Date.now()}_${file.name}`),
                sizeBytes: file.size,
                metadata: { contentType: file.type || 'image/*' },
                plan: userProfile.plan
            });
            setLogoUrl(url);
            setToastNotification({ title: "Identidad Actualizada", message: "Logo subido correctamente.", icon: "image" });
        } catch (err) { console.error(err); } finally { setIsAiProcessing(false); }
    };

    const handleIssuerLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser) return;
        setIsAiProcessing(true);
        try {
            const { url } = await uploadWithQuotaCheck({
                userId: currentUser.uid,
                data: file,
                path: safeStoragePath('crm-issuer-logos', currentUser.uid, `${Date.now()}_${file.name}`),
                sizeBytes: file.size,
                metadata: { contentType: file.type || 'image/*' },
                plan: userProfile.plan
            });
            setIssuerLogoUrl(url);
            setToastNotification({ title: "Foto Emisor Actualizada", message: "Cargada correctamente.", icon: "image" });
        } catch (err) { console.error(err); } finally { setIsAiProcessing(false); }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editingClient || !currentUser) return;
        setIsAiProcessing(true);
        try {
            const uploaded = await uploadWithQuotaCheck({
                userId: currentUser.uid,
                data: file,
                path: safeStoragePath('crm-docs', currentUser.uid, editingClient.id, `${Date.now()}_${file.name}`),
                sizeBytes: file.size,
                metadata: { contentType: file.type || 'application/octet-stream' },
                plan: userProfile.plan
            });
            const url = uploaded.url;
            const newFile: ClientFile = { id: `file-${Date.now()}`, name: file.name, url, type: file.type, size: file.size, uploadedAt: new Date().toISOString() };
            
            const updatedClients = clients.map(c => c.id === editingClient.id ? { ...c, files: [newFile, ...(c.files || [])] } : c);
            await updateProject(project.id, { clients: updatedClients });
            
            setEditingClient(prev => prev ? { ...prev, files: [newFile, ...(prev.files || [])] } : null);
            await logActivity(editingClient.id, `Archivo subido: ${file.name}`, 'document');
            setToastNotification({ title: "Expediente Actualizado", message: "Archivo añadido.", icon: "folder" });
        } catch (err) { console.error(err); } finally { setIsAiProcessing(false); }
    };

    const handleStatusUpdate = async (clientId: string, newStatus: string) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;
        const oldStatus = client.status;
        if (newStatus === oldStatus) return;
        const activity: ClientActivity = { id: `act-stat-${Date.now()}`, type: 'system', text: `Estado: ${oldStatus} → ${newStatus}`, date: new Date().toISOString() };
        if (newStatus === 'Ganado' && oldStatus !== 'Ganado') {
             const activeProjectsCount = projects.filter(p => !p.isLocked).length;
             const limitValue = (planConfig.limits as any).active_projects || 3;
             const isLocked = activeProjectsCount >= limitValue && limitValue !== 999999;

             const newProjectId = await addProject({
                 name: `${client.name} - Seguimiento e Implementación`,
                 ownerId: currentUser!.uid,
                 members: [userProfile],
                 memberIds: [currentUser!.uid],
                 folders: [
                     { id: 'onboarding', name: 'Onboarding Cliente', tasks: [ { id: `t-welcome-${Date.now()}`, title: 'Enviar kit de bienvenida', status: 'Por Hacer', date: new Date().toISOString().split('T')[0], projectId: '', folderId: 'onboarding' }, { id: `t-kickoff-${Date.now()}`, title: 'Agendar Sesión de Kickoff', status: 'Por Hacer', date: new Date().toISOString().split('T')[0], projectId: '', folderId: 'onboarding' } ] },
                     { id: 'implementation', name: 'Implementación Técnica', tasks: [ { id: `t-config-${Date.now()}`, title: 'Configuración inicial de entorno IA', status: 'Por Hacer', date: new Date().toISOString().split('T')[0], projectId: '', folderId: 'implementation' } ] }
                 ],
                 documents: client.files ? client.files.map(f => ({ id: f.id, name: f.name, content: f.url, uploadedAt: f.uploadedAt, size: f.size, fileType: f.type })) : [],
                 notes: [ { id: `n-agreed-${Date.now()}`, title: 'Propuesta Aprobada (Resumen)', content: client.proposalText || "Sin propuesta detallada guardada.", createdAt: new Date().toISOString() } ],
                 drawings: [], chats: [], spreadsheets: [],
                 finances: { income: client.value, expenses: 0, transactions: [{ id: `tx-won-${Date.now()}`, type: 'income', amount: client.value, description: 'Contrato Ganado - CRM', date: new Date().toISOString().split('T')[0] }], adn: 'business', fiscalCountry: 'OTHER' },
                 statuses: [ { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true }, { id: 'status-inprogress', name: 'En Pregreso', color: '#3B82F6', isFixed: true }, { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true } ],
                 clients: [],
                 createdAt: new Date().toISOString(),
                 isLocked: isLocked
             });
             setToastNotification({ title: "¡Venta Cerrada!", message: `Se ha creado el proyecto de implementación para ${client.name}.`, icon: "rocket", onClick: () => { setSelectedProjectId(newProjectId); setCurrentView('projects'); } });
        }
        const updatedClients = clients.map(c => c.id === clientId ? { ...c, status: newStatus, activityFeed: [activity, ...(c.activityFeed || [])] } : c);
        await updateProject(project.id, { clients: updatedClients });
        if (editingClient?.id === clientId) {
            setEditingClient(prev => prev ? { ...prev, status: newStatus, activityFeed: [activity, ...(prev.activityFeed || [])] } : null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            const finalActivityFeed = [
                ...tempActivities,
                ...(editingClient?.activityFeed || [])
            ];

            const clientData: ProjectClient = {
                id: editingClient?.id || `client-${Date.now()}`, name: clientName, contact: clientContact, phone: clientPhone, taxId: clientTaxId, status: clientStatus, value: parseFloat(clientValue) || 0, deliveryTime, applyTax, taxPercentage: parseFloat(taxPercentage) || 0, currency, enableAdvances, advancePercentage: parseFloat(advancePercentage) || 50, businessNotes, notes, todoList: editingClient?.todoList || [], services: manualServices, brandName, businessDescription, providerName, providerTaxId, providerContact, issuerPhone: issuerPhone.startsWith('+') ? issuerPhone : `${issuerCountryCode}${issuerPhone}`, issuerEmail, businessType, logoUrl, issuerLogoUrl, createdAt: editingClient?.createdAt || new Date().toISOString(), files: editingClient?.files || [], activityFeed: finalActivityFeed, salesRoomId: editingClient?.salesRoomId || '', viewsCount: editingClient?.viewsCount || 0, proformaGenerated: editingClient?.proformaGenerated || false, preInvoiceGenerated: editingClient?.preInvoiceGenerated || false, agreementGenerated: editingClient?.agreementGenerated || false, meetingUrl: editingClient?.meetingUrl || '', meetingDate: editingClient?.meetingDate || '',
                proposalText: tempProposalText,
                contractText: tempContractText,
                preInvoiceText: tempPreInvoiceText,
                changeRequests: editingClient?.changeRequests || [],
                proposalApproved: editingClient?.proposalApproved || false,
                preInvoicePaid: editingClient?.preInvoicePaid || false,
                contractSigned: editingClient?.contractSigned || false
            };

            const updatedClients = editingClient ? clients.map(c => c.id === editingClient.id ? clientData : c) : [clientData, ...clients];
            await updateProject(project.id, { clients: updatedClients });
            setAddModalOpen(false);
            setToastNotification({ title: "Guardado", message: "Prospecto actualizado con éxito.", icon: 'check' });
        } catch (err) { setToastNotification({ title: "Error", message: "Error al guardar.", icon: 'close' }); } finally { setIsSaving(false); }
    };

    const handleGenerateProposal = async () => {
        await logActivity(editingClient?.id || null, "Abrió editor de Propuesta Estratégica", "system");
        setDocPreview({ title: "PROPUESTA ESTRATÉGICA", content: tempProposalText || "", type: 'proposalText' });
        setIsEditingDoc(!tempProposalText);
    };

    const handleGenerateAgreement = async () => {
        await logActivity(editingClient?.id || null, "Abrió editor de Contrato Maestro", "system");
        setDocPreview({ title: "CONTRATO MAESTRO DE SERVICIOS", content: tempContractText || "", type: 'contractText' });
        setIsEditingDoc(!tempContractText);
    };

    const handleGeneratePreInvoiceDoc = (client: any) => {
        logActivity(editingClient?.id || null, "Abrió editor de Prefactura Digital", "system");
        setDocPreview({ title: "PREFACTURA DIGITAL", content: tempPreInvoiceText || "", type: 'preInvoiceText' });
        setIsEditingDoc(!tempPreInvoiceText);
    };

    const startAiGeneration = async (type: 'proposal' | 'contract' | 'preinvoice') => {
        const isBlocked = await checkQueryLimit();
        
        if (isBlocked) {
            setToastNotification({ 
                title: "Energía Agotada", 
                message: "No tienes créditos para generación automática. Se habilitará el modo de edición manual.", 
                icon: "lock"
            });
            // ABRIR EN BLANCO PARA EDICION MANUAL COMO PIDIÓ EL USUARIO
            if (type === 'proposal') setDocPreview({ title: "PROPUESTA ESTRATÉGICA (EDICIÓN MANUAL)", content: "", type: 'proposalText' });
            else if (type === 'contract') setDocPreview({ title: "CONTRATO MAESTRO (EDICIÓN MANUAL)", content: "", type: 'contractText' });
            else setDocPreview({ title: "PREFACTURA DIGITAL (EDICIÓN MANUAL)", content: "", type: 'preInvoiceText' });
            
            setIsEditingDoc(true);
            return;
        }

        setIsGeneratingDoc(type as any);
        setToastNotification({ 
            title: "IA Operando", 
            message: `Redactando corporativamente...`, 
            icon: "ai", 
            isLoading: true 
        });
        
        const issuerInfo = { 
            brandName, 
            businessDescription, 
            providerName, 
            providerTaxId, 
            providerContact, 
            issuerPhone, 
            issuerEmail,
            applyTax,
            taxPercentage,
            enableAdvances,
            advancePercentage,
            services: manualServices
        };

        try {
            let content = "";
            if (type === 'proposal') {
                content = await generateAiQuotation(clientName, businessType || 'Servicios Especializados', businessNotes || notes, parseFloat(clientValue), userProfile.name, issuerInfo, businessDescription) || "";
                setDocPreview({ title: "PROPUESTA ESTRATÉGICA", content, type: 'proposalText' });
            } else if (type === 'contract') {
                content = await generateClientAgreement({ ...editingClient, name: clientName, value: parseFloat(clientValue), brandName, providerName, businessDescription, businessNotes, notes } as any, userProfile.name) || "";
                setDocPreview({ title: "CONTRATO MAESTRO DE SERVICIOS", content, type: 'contractText' });
            } else if (type === 'preinvoice') {
                content = await generateClientPreInvoice({ ...editingClient, name: clientName, value: parseFloat(clientValue), taxPercentage: parseFloat(taxPercentage) || 0, applyTax, businessNotes, notes, services: manualServices } as any, userProfile.name, issuerInfo) || "";
                setDocPreview({ title: "PREFACTURA DIGITAL", content, type: 'preInvoiceText' });
            }
            setIsEditingDoc(false);
            setToastNotification({ title: "Documento Listo", message: "Se ha descontado 1 crédito de Chat.", icon: "check" });
        } catch (e) { console.error(e); } finally { setIsGeneratingDoc(null); }
    };

    const generatePDFManual = async (title: string) => {
        const element = document.getElementById('crm-document-editor-content');
        if (!element) {
             setToastNotification({ title: "Error", message: "No se encontró el contenido para generar PDF.", icon: 'close' });
             return;
        }

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile) {
            window.print();
            return;
        }

        const opt = {
            margin: 10,
            filename: `${clientName.replace(/\s+/g, '_')}_${title.replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        try {
            await html2pdf().set(opt).from(element).save();

            const pdfBlob = await html2pdf().set(opt).from(element).output('blob');
            const fileName = `${clientName.replace(/\s+/g, '_')}_${title.replace(/\s+/g, '_')}.pdf`;
            
            const reader = new FileReader();
            reader.onload = async () => {
                const base64data = reader.result as string;
                const newDoc: Document = {
                    id: `doc-auto-${Date.now()}`,
                    name: fileName,
                    content: base64data,
                    uploadedAt: new Date().toISOString(),
                    size: pdfBlob.size,
                    fileType: 'application/pdf'
                };
                const existingDocs = project.documents || [];
                await updateProject(project.id, { documents: [newDoc, ...existingDocs] });
                setToastNotification({ title: "Copia Guardada", message: "Documento respaldado en tu Goatify Drive.", icon: 'folder' });
            };
            reader.readAsDataURL(pdfBlob);
        } catch (e) {
            console.error("Auto-save PDF failed", e);
        }
    };

    const isDocFixed = (type: 'proposalText' | 'contractText' | 'preInvoiceText') => {
        if (type === 'proposalText') return tempProposalText === docPreview?.content;
        if (type === 'contractText') return tempContractText === docPreview?.content;
        if (type === 'preInvoiceText') return tempPreInvoiceText === docPreview?.content;
        return false;
    };

    const handleSavePersistentDoc = async () => {
        if (!docPreview) return;
        
        const field = docPreview.type;
        const label = field === 'proposalText' ? 'Propuesta' : field === 'contractText' ? 'Contrato' : 'Prefactura';
        
        if (field === 'proposalText') setTempProposalText(docPreview.content);
        if (field === 'contractText') setTempContractText(docPreview.content);
        if (field === 'preInvoiceText') setTempPreInvoiceText(docPreview.content);
        
        if (editingClient) {
            try {
                const updates: any = { [field]: docPreview.content };
                
                // Generar salesRoomId si no existe
                if (!editingClient.salesRoomId) {
                    const cleanName = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    updates.salesRoomId = cleanName || `room-${Date.now()}`;
                }

                const updatedClients = clients.map(c => c.id === editingClient.id ? { ...c, ...updates } : c);
                await updateProject(project.id, { clients: updatedClients });
                setEditingClient(prev => prev ? { ...prev, ...updates } : null);
                
                await logActivity(editingClient.id, `Se ha fijado y guardado la ${label} oficial.`, 'document');
                setToastNotification({ title: "Fijado", message: "Guardado en el expediente.", icon: 'check' });
            } catch (e) { console.error(e); }
        } else {
            setToastNotification({ title: "Documento Fijado", message: "Se guardará al crear el prospecto.", icon: 'check' });
        }
        setDocPreview(null);
    };

    const handleResolveRequest = async (requestId: string, section: 'proposal' | 'contract' | 'preInvoice') => {
        if (!editingClient) return;
        
        const updatedRequests = (editingClient.changeRequests || []).map(r => r.id === requestId ? { ...r, status: 'resolved' as const } : r);
        const updatedClients = clients.map(c => c.id === editingClient.id ? { ...c, changeRequests: updatedRequests } : c);
        await updateProject(project.id, { clients: updatedClients });
        setEditingClient(prev => prev ? { ...prev, changeRequests: updatedRequests } : null);
        
        if (section === 'proposal') handleGenerateProposal();
        if (section === 'contract') handleGenerateAgreement();
        if (section === 'preInvoice') handleGeneratePreInvoiceDoc(editingClient);
        
        setToastNotification({ title: "Abriendo Editor", message: "Resolviendo solicitud de cambio...", icon: 'edit' });
    };

    const handleConfirmScheduleMeeting = async () => {
        if (!isSchedulingMeeting || !meetingDate || !meetingTime) return;
        setIsSaving(true);
        try {
            const scheduledAt = `${meetingDate}T${meetingTime}:00`;
            const link = await scheduleMeeting(`Cierre Comercial: ${isSchedulingMeeting.name || clientName}`, scheduledAt, [], meetingNotes);
            
            if (editingClient) {
                await logActivity(editingClient.id, `Reunión de cierre agendada para ${scheduledAt}`, 'call');
                const updatedClients = clients.map(c => c.id === editingClient.id ? { ...c, meetingUrl: link, meetingDate: scheduledAt, status: 'Reunión' } : c);
                await updateProject(project.id, { clients: updatedClients });
                setEditingClient(prev => prev ? { ...prev, meetingUrl: link, meetingDate: scheduledAt, status: 'Reunión' } : null);
            } else {
                setToastNotification({ title: "Meet Agendado", message: "La reunión se vinculará al guardar el prospecto.", icon: "check" });
                setEditingClient(prev => ({ ...prev, meetingUrl: link, meetingDate: scheduledAt, status: 'Reunión' } as any));
            }
            setIsSchedulingMeeting(null);
        } catch (e) { console.error(e); } finally { setIsSaving(false); }
    };

    const handleConfirmSalesRoom = async (client: ProjectClient) => {
        if (!project.id) return;
        setIsSaving(true);
        try {
            const cleanName = client.name ? client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'cliente';
            const roomId = cleanName || `room-${Date.now()}`;
            const updatedClients = clients.map(c => c.id === client.id ? { ...c, salesRoomId: roomId } : c);
            await updateProject(project.id, { clients: updatedClients });
            setEditingClient(prev => prev ? { ...prev, salesRoomId: roomId } : null);
            setToastNotification({ title: "Sales Room Activada", message: "Enlace generado con éxito.", icon: 'rocket' });
        } catch (e) { console.error(e); } finally { setIsSaving(false); }
    };

    const handleInvestigate = async () => {
        if (!clientName.trim()) return;
        const isBlocked = await checkQueryLimit();
        if (isBlocked) return;

        setIsInvestigating(true);
        try {
            const brief = await investigateClientWithAi(clientName, businessType, businessNotes);
            setBusinessNotes(brief);
            setToastNotification({ title: "Briefing Listo", message: "Se ha descontado 1 crédito de Chat.", icon: 'check' });
        } catch (e) { console.error(e); } finally { setIsInvestigating(false); }
    };

    const handleAddManualService = () => {
        if (!newServiceName.trim() || !newServicePrice) return;
        const newItem: CrmServiceItem = { id: `svc-${Date.now()}`, name: newServiceName.trim(), price: parseFloat(newServicePrice) };
        setManualServices(prev => [...prev, newItem]);
        setNewServiceName(''); setNewServicePrice('');
    };

    const removeManualService = (id: string) => { setManualServices(prev => prev.filter(s => s.id !== id)); };

    const handleDeleteClient = async (id: string) => {
        if (!window.confirm("¿Eliminar prospecto permanentemente?")) return;
        const updatedClients = clients.filter(c => c.id !== id);
        await updateProject(project.id, { clients: updatedClients });
        setAddModalOpen(false);
        setToastNotification({ title: "Eliminado", message: "Prospecto borrado.", icon: 'trash' });
    };

    const handleDuplicateClient = async (client: ProjectClient) => {
        setIsSaving(true);
        try {
            const duplicatedClient: ProjectClient = {
                ...client,
                id: `client-${Date.now()}`,
                name: `${client.name} (Copia)`,
                createdAt: new Date().toISOString(),
                // Reset unique identifying data
                salesRoomId: '',
                viewsCount: 0,
                proformaGenerated: false,
                preInvoiceGenerated: false,
                agreementGenerated: false,
                meetingUrl: '',
                meetingDate: '',
                proposalApproved: false,
                preInvoicePaid: false,
                contractSigned: false,
                changeRequests: [],
                activityFeed: [{
                    id: `act-${Date.now()}`,
                    type: 'system',
                    text: `Prospecto duplicado desde ${client.name}`,
                    date: new Date().toISOString(),
                    user: userProfile.name
                }]
            };

            const updatedClients = [duplicatedClient, ...clients];
            await updateProject(project.id, { clients: updatedClients });
            setToastNotification({ title: "Duplicado", message: "Prospecto duplicado con éxito.", icon: 'copy' });
        } catch (err) {
            setToastNotification({ title: "Error", message: "No se pudo duplicar el prospecto.", icon: 'close' });
        } finally {
            setIsSaving(false);
        }
    };

    const liveTotal = useMemo(() => {
        const base = parseFloat(clientValue) || 0;
        if (!applyTax) return base;
        const pct = parseFloat(taxPercentage) || 0;
        return base + (base * (pct / 100));
    }, [clientValue, applyTax, taxPercentage]);

    const crmUsed = clients.length;

    const pendingRequests = useMemo(() => {
        if (!editingClient) return [];
        return (editingClient.changeRequests || []).filter(r => r.status === 'pending');
    }, [editingClient]);

    return (
        <div className="animate-fade-in h-full flex flex-col pt-0 relative">
            <div className="bg-white dark:bg-dark-surface p-4 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-lg flex flex-col md:flex-row justify-between gap-4 items-start md:items-center flex-none">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary"><Icon name="users" className="w-5 h-5"/></div>
                    <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white uppercase tracking-tighter leading-none">Market CRM Elite</h3>
                        <div className="flex gap-4 mt-1">
                            <span className="text-[9px] text-neutral-400 font-black uppercase tracking-widest">
                                Uso: {crmUsed}/{crmLimit === 999999 ? '∞' : crmLimit}
                            </span>
                            <span className="text-[9px] text-brand-primary font-black uppercase tracking-widest">Total: ${pipelineTotal.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto items-center">
                    {!hasEnergy && (
                        <div className="bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-xl border border-red-100 dark:border-red-900/30 flex items-center gap-2 animate-pulse">
                            <Icon name="lock" className="w-3.5 h-3.5 text-red-500"/>
                            <span className="text-[9px] font-black text-red-600 uppercase tracking-tighter">Sin Energía IA - Modo Manual</span>
                        </div>
                    )}
                    <button onClick={() => setIsHelpModalOpen(true)} className="p-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-neutral-500 hover:text-brand-primary transition-colors"><Icon name="help" className="w-4 h-4"/></button>
                    <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl">
                        <button onClick={() => setViewMode('kanban')} className={`p-1.5 px-3 rounded-lg text-[9px] font-black transition-all ${viewMode === 'kanban' ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-400'}`}>KANBAN</button>
                        <button onClick={() => setViewMode('list')} className={`p-1.5 px-3 rounded-lg text-[9px] font-black transition-all ${viewMode === 'list' ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-400'}`}>LISTA</button>
                    </div>
                    <Button onClick={handleOpenAdd} className="shadow-lg px-6 font-black uppercase text-[9px] tracking-widest h-10">Nuevo Prospecto</Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto mt-4 px-1 custom-scrollbar pb-32">
                {viewMode === 'kanban' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-start overflow-x-hidden">
                        {CRM_STATUSES.map(status => (
                            <div key={status} onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-brand-primary/5'); }} onDragLeave={(e) => e.currentTarget.classList.remove('bg-brand-primary/5')} onDrop={async (e) => { e.preventDefault(); e.currentTarget.classList.remove('bg-brand-primary/5'); const id = e.dataTransfer.getData("clientId"); if (id) await handleStatusUpdate(id, status); }} className="bg-neutral-100 dark:bg-[#0d0d0d] rounded-[2rem] p-3 flex flex-col border border-transparent transition-all h-fit">
                                <div className="flex justify-between items-center mb-3 px-2 flex-none">
                                    <h4 className="font-black text-[9px] uppercase tracking-widest text-neutral-500">{status}</h4>
                                    <span className="bg-white dark:bg-neutral-800 px-3 py-0.5 rounded-full text-[9px] font-black shadow-sm text-brand-primary">{clients.filter(c => c.status === status).length}</span>
                                </div>
                                <div className="space-y-2 overflow-y-auto max-h-[350px] custom-scrollbar pr-1">
                                    {clients.filter(c => c.status === status).map(client => (
                                        <div key={client.id} draggable onDragStart={(e) => e.dataTransfer.setData("clientId", client.id)} onClick={() => handleOpenEdit(client)} className="bg-white dark:bg-dark-surface p-3 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 cursor-pointer group hover:shadow-lg transition-all active:scale-[0.98] relative overflow-hidden">
                                            {!hasEnergy && (
                                                <div className="absolute inset-0 bg-red-50/10 backdrop-blur-[1px] pointer-events-none z-10"></div>
                                            )}
                                            <div className="flex items-center justify-between gap-2 mb-2 relative z-20">
                                                <div className="flex items-center gap-2 truncate">
                                                    {client.logoUrl ? <img src={client.logoUrl} className="w-7 h-7 rounded-lg object-cover" /> : <div className="w-7 h-7 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center text-brand-primary flex-shrink-0"><Icon name="user" className="w-3.5 h-3.5"/></div>}
                                                    <p className="font-bold text-xs truncate">{client.name}</p>
                                                </div>
                                                <div className="flex gap-1 items-center">
                                                    {client.meetingUrl && <span className="bg-blue-100 text-blue-600 p-1 rounded-md animate-pulse"><Icon name="video" className="w-3.5 h-3.5"/></span>}
                                                    <button onClick={(e) => { e.stopPropagation(); handleDuplicateClient(client); }} className="p-1.5 text-neutral-400 hover:text-brand-primary" title="Duplicar"><Icon name="copy" className="w-3.5 h-3.5"/></button>
                                                    {client.status === 'Perdido' && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id); }} className="p-1.5 text-neutral-400 hover:text-red-500" title="Eliminar"><Icon name="trash" className="w-3.5 h-3.5"/></button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-end border-t border-neutral-50 dark:border-neutral-800 pt-2 relative z-20">
                                                 <p className="text-[10px] font-black text-brand-primary">${client.value.toLocaleString()}</p>
                                                 <p className="text-[8px] text-neutral-400 font-bold uppercase">{new Date(client.createdAt).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {clients.filter(c => c.status === status).length === 0 && (
                                        <div className="py-8 text-center opacity-20 italic text-[9px] font-bold uppercase tracking-widest">Sin Prospectos</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                        {clients.map(client => (
                            <Card key={client.id} className="p-4 border border-neutral-200 dark:border-neutral-800 shadow-md rounded-2xl bg-white dark:bg-dark-surface hover:shadow-xl transition-all group overflow-hidden relative flex flex-col h-fit">
                                {!hasEnergy && (
                                    <div className="absolute inset-0 bg-red-50/5 backdrop-blur-[0.5px] pointer-events-none z-10"></div>
                                )}
                                <div className="flex justify-between items-center relative z-20">
                                    <div className="flex items-center gap-3">
                                        {client.logoUrl ? <img src={client.logoUrl} className="w-10 h-10 rounded-xl object-cover" /> : <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-brand-primary"><Icon name="user" className="w-5 h-5"/></div>}
                                        <div className="min-w-0"><h4 className="font-black text-sm text-neutral-900 dark:text-white truncate">{client.name}</h4><p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">{client.status}</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                         {client.status === 'Perdido' && <button onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar"><Icon name="trash" className="w-4 h-4"/></button>}
                                         <button onClick={(e) => { e.stopPropagation(); handleDuplicateClient(client); }} className="p-2 text-neutral-500 hover:bg-brand-primary/10 hover:text-brand-primary rounded-lg transition-colors" title="Duplicar"><Icon name="copy" className="w-4 h-4"/></button>
                                         <button onClick={(e) => { e.stopPropagation(); setIsSchedulingMeeting(client); }} className={`p-2 rounded-lg transition-all shadow-sm ${client.meetingUrl ? 'bg-blue-500 text-white' : 'bg-neutral-50 dark:bg-neutral-800 text-brand-primary hover:bg-brand-primary hover:text-white'}`}><Icon name="calendar" className="w-4 h-4"/></button>
                                         <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(client)} className="text-[10px] font-black uppercase py-1 px-4 h-9">Gestionar</Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <Modal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} title="Manual Operativo: Market CRM Elite" zIndex="z-[150000]">
                <div className="space-y-6 p-1">
                    <div className="p-6 bg-brand-primary/5 rounded-[2rem] border border-brand-primary/10">
                        <h4 className="text-sm font-black text-brand-primary uppercase tracking-widest mb-4 flex items-center gap-2"><Icon name="help" className="w-5 h-5"/> Gestión de Pipeline</h4>
                        <ul className="space-y-4">
                            <li className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center font-black text-xs shadow-md">1</div>
                                <div><p className="font-bold text-sm">Registro Estratégico</p><p className="text-xs text-neutral-500 leading-relaxed">Crea fichas detalladas de leads. Shivo IA usará esta info para redactar tus contratos y propuestas automáticamente.</p></div>
                            </li>
                            <li className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center font-black text-xs shadow-md">2</div>
                                <div><p className="font-bold text-sm">Flujo Kanban</p><p className="text-xs text-neutral-500 leading-relaxed">Arrastra prospectos entre etapas. Mover un lead a 'Ganado' creará automáticamente un proyecto de implementación.</p></div>
                            </li>
                            <li className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center font-black text-xs shadow-md">3</div>
                                <div><p className="font-bold text-sm">Sales Room VIP</p><p className="text-xs text-neutral-500 leading-relaxed">Activa el micro-sitio inmersivo. Envía el link al cliente para que vea su propuesta, valide la inversión y firme el acuerdo legalmente.</p></div>
                            </li>
                        </ul>
                    </div>
                    <Button onClick={() => setIsHelpModalOpen(false)} className="w-full h-12 shadow-xl">Entendido</Button>
                </div>
            </Modal>

            <Modal 
                isOpen={!!isSchedulingMeeting} 
                onClose={() => setIsSchedulingMeeting(null)} 
                title={`Agendar Meets: ${isSchedulingMeeting?.name || clientName || 'Prospecto'}`} 
                className="max-w-2xl"
                zIndex="z-[1000002]"
            >
                 <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800">
                        <p className="text-xs text-blue-600 font-medium">Define la fecha y hora para el cierre con este cliente. El link de Goatify Meet se sincronizará automáticamente.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] font-black uppercase text-neutral-500 mb-1 block">Fecha</label><Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} /></div>
                        <div><label className="text-[10px] font-black uppercase text-neutral-500 mb-1 block">Hora</label><Input type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} /></div>
                    </div>
                    <div><label className="text-[10px] font-black uppercase text-neutral-500 mb-1 block">Agenda de Sesión</label><Textarea value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} rows={3} placeholder="Temas a tratar en el cierre..." /></div>
                    
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-neutral-800">
                        <Button variant="secondary" onClick={() => setIsSchedulingMeeting(null)}>Cerrar</Button>
                        <Button onClick={handleConfirmScheduleMeeting} disabled={!meetingDate || !meetingTime || isSaving}>
                            {isSaving ? <Spinner className="w-4 h-4 text-white" /> : (editingClient?.meetingUrl || isSchedulingMeeting?.meetingUrl) ? "Actualizar Fecha" : "Generar Meet Sincronizado"}
                        </Button>
                    </div>
                 </div>
            </Modal>

            <Modal 
                isOpen={!!docPreview} 
                onClose={() => setDocPreview(null)} 
                title={docPreview?.title || ''} 
                className="max-w-[95vw] lg:max-w-6xl h-[95vh]"
                zIndex="z-[1100001]"
                noPadding
            >
                <div className="flex flex-col h-full bg-neutral-100 dark:bg-[#050505] overflow-hidden">
                    <div className="flex flex-col sm:flex-row justify-between items-center p-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 gap-2 flex-none z-20 shadow-sm">
                        <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg w-full sm:w-auto">
                            <button onClick={() => setIsEditingDoc(false)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${!isEditingDoc ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'}`}><Icon name="image" className="w-3 h-3 inline mr-1.5"/> Formato</button>
                            <button onClick={() => setIsEditingDoc(true)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${isEditingDoc ? 'bg-white dark:bg-neutral-700 shadow text-brand-primary' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'}`}><Icon name="edit" className="w-3 h-3 inline mr-1.5"/> Editar</button>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
                             <Button onClick={() => startAiGeneration(docPreview?.type === 'contractText' ? 'contract' : docPreview?.type === 'proposalText' ? 'proposal' : 'preinvoice')} disabled={isAiProcessing} variant="secondary" className="flex-1 sm:flex-none border-brand-primary/30 h-8 text-[9px] font-black uppercase tracking-widest text-black bg-white hover:bg-neutral-50 px-3">
                                {isGeneratingDoc ? <Spinner className="!w-3 !h-3 !p-0" /> : <><Icon name="sync" className="w-3 h-3 text-black"/> {docPreview?.content ? "Regenerar IA" : "Generar con IA"}</>}
                             </Button>
                             <Button onClick={() => generatePDFManual(docPreview?.title || 'Documento')} variant="secondary" className="flex-1 sm:flex-none border-neutral-300 h-8 text-[9px] font-black uppercase tracking-widest px-3"><Icon name="upload" className="w-3 h-3"/> PDF</Button>
                             <Button onClick={handleSavePersistentDoc} disabled={isSaving || (docPreview ? isDocFixed(docPreview.type) : false)} className={`flex-1 sm:flex-none px-4 border-none shadow-lg h-8 text-[9px] font-black uppercase tracking-widest ${docPreview && isDocFixed(docPreview.type) ? 'bg-green-100 text-green-700' : 'bg-brand-primary text-white'}`}>
                                {isSaving ? <Spinner className="!w-3 !h-3 !p-0 !text-white" /> : docPreview && isDocFixed(docPreview.type) ? <><Icon name="check" className="w-3 h-3"/> Guardado</> : "Fijar Documento"}
                             </Button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-10 bg-white dark:bg-[#050505]">
                        <div id="crm-document-editor-content" className={`w-full h-full max-w-5xl mx-auto transition-all ${isEditingDoc ? 'ring-2 ring-brand-primary/20 rounded-xl p-4' : ''}`}>
                            {isEditingDoc ? (
                                <Textarea 
                                    value={docPreview?.content || ''} 
                                    onChange={e => setDocPreview(prev => prev ? { ...prev, content: e.target.value } : null)}
                                    className="w-full h-full font-mono text-sm leading-relaxed bg-transparent border-none focus:ring-0 p-0 !mt-0 min-h-[60vh] text-left text-neutral-900 dark:text-white"
                                    placeholder="Edita el contenido aquí..."
                                />
                            ) : (
                                <div className="prose prose-sm sm:prose-lg max-w-none text-justify font-sans leading-relaxed dark:prose-invert">
                                    <ChatMessageRenderer text={docPreview?.content || ''} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>

            <Modal 
                isOpen={isAddModalOpen} 
                onClose={() => setAddModalOpen(false)} 
                title={editingClient ? "Ficha Market CRM Elite" : "Nuevo Lead Estratégico"} 
                className="w-full max-w-[95vw] h-[95vh] !p-0 shadow-[0_30px_100px_rgba(0,0,0,0.5)]"
                zIndex="z-[1000001]"
            >
                <div className="flex flex-col h-full relative bg-white dark:bg-[#0a0a0a]">
                    <div className="flex gap-2 p-2 border-b dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex-none overflow-x-auto no-scrollbar">
                        {['info', 'files', 'activity', 'room'].map(tab => (
                            <button key={tab} onClick={() => setActiveTabInEdit(tab as any)} className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg whitespace-nowrap ${activeTabInEdit === tab ? 'bg-brand-primary text-white shadow-lg' : 'text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>
                                {tab === 'info' ? 'Ficha Principal' : tab === 'files' ? 'Expediente Pro' : tab === 'activity' ? 'Historial CRM' : 'Sales Room'}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 sm:p-12 custom-scrollbar pb-32">
                        {activeTabInEdit === 'info' && (
                            <div className="space-y-12 animate-fade-in">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                    <div className="space-y-8">
                                        <h5 className="text-[11px] font-black text-brand-primary uppercase tracking-[0.2em] border-b pb-2 border-brand-primary/10">Identidad del Receptor (Cliente)</h5>
                                        <div className="flex items-center gap-6">
                                             <div onClick={() => logoInputRef.current?.click()} className="w-24 h-24 bg-neutral-100 dark:bg-neutral-800 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-neutral-300 dark:border-neutral-700 cursor-pointer overflow-hidden relative group shadow-inner">
                                                 {logoUrl ? <img src={logoUrl} className="w-full h-full object-cover" /> : <Icon name="image" className="w-8 h-8 text-neutral-400" />}
                                                 <input type="file" ref={logoInputRef} className="hidden" onChange={handleLogoUpload} accept="image/*"/>
                                             </div>
                                             <div className="flex-1 space-y-4">
                                                 <div><label className="text-[10px] font-black text-neutral-500 uppercase block mb-1">Nombre / Razón Social *</label><Input value={clientName} onChange={e => setClientName(e.target.value)} required /></div>
                                                 <div className="grid grid-cols-2 gap-4">
                                                     <div><label className="text-[10px] font-bold uppercase text-neutral-500">Email *</label><Input value={clientContact} onChange={e => setClientContact(e.target.value)} required /></div>
                                                     <div><label className="text-[10px] font-bold uppercase text-neutral-500">ID Fiscal</label><Input value={clientTaxId} onChange={e => setClientTaxId(e.target.value)} /></div>
                                                 </div>
                                             </div>
                                        </div>
                                        <div className="bg-neutral-900 p-6 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden ring-1 ring-white/10">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
                                            <div className="flex justify-between items-center mb-3 relative z-10">
                                                <h5 className="text-[9px] font-black uppercase text-brand-accent tracking-widest flex items-center gap-2"><Icon name="ai" className="w-3 h-3"/> Inteligencia Shivo</h5>
                                                <button type="button" onClick={handleInvestigate} disabled={!hasEnergy || isInvestigating} className={`text-[9px] px-4 py-1 rounded-full font-black uppercase transition-all ${(hasEnergy && !isInvestigating) ? 'bg-brand-primary hover:bg-brand-secondary' : 'bg-neutral-600 cursor-not-allowed opacity-50'}`}>
                                                    {isInvestigating ? 'Analizando...' : 'Analizar'}
                                                </button>
                                            </div>
                                            <Textarea value={businessNotes} onChange={e => setBusinessNotes(e.target.value)} rows={4} className="bg-white/5 border-white/10 text-white text-[11px] placeholder-neutral-600 relative z-10" placeholder="Análisis del sector y proyecciones IA..." />
                                        </div>
                                        <div className="p-6 bg-blue-500/10 rounded-3xl border border-blue-500/20">
                                            <h5 className="text-10px font-black text-blue-500 uppercase tracking-widest mb-4">Reunión de Cierre</h5>
                                            <div className="flex flex-col gap-3">
                                                <Button onClick={() => setIsSchedulingMeeting(editingClient || { id: 'temp' } as any)} variant="secondary" className="w-full bg-white dark:bg-neutral-800 border-blue-500/50 text-blue-600 font-black uppercase text-xs">
                                                    <Icon name="calendar" className="w-4 h-4"/> {(editingClient?.meetingUrl || (editingClient as any)?.meetingUrl) ? "Reprogramar" : "Agendar Cierre"}
                                                </Button>
                                                {(editingClient?.meetingUrl || (editingClient as any)?.meetingUrl) && (
                                                    <div className="flex gap-2">
                                                        <Button onClick={() => joinMeeting((editingClient?.meetingUrl || (editingClient as any)?.meetingUrl).split('/calls/')[1])} className="flex-1 bg-blue-600 text-white shadow-lg font-black uppercase text-xs">
                                                            <Icon name="video" className="w-4 h-4"/> Unirse
                                                        </Button>
                                                        <Button onClick={() => { navigator.clipboard.writeText(editingClient?.meetingUrl || (editingClient as any)?.meetingUrl); setToastNotification({title:"Link Copiado", message:"Listo para enviar", icon:"copy"}) }} variant="secondary" className="p-3">
                                                            <Icon name="share" className="w-4 h-4"/>
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-8">
                                        <h5 className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.2em] border-b pb-2">Datos del Emisor (Tus Datos)</h5>
                                        <div className="flex items-center gap-6 mb-4">
                                             <div onClick={() => issuerLogoInputRef.current?.click()} className="w-20 h-20 bg-neutral-100 dark:bg-neutral-800 rounded-[2rem] flex items-center justify-center border-2 border-dashed border-neutral-300 dark:border-neutral-700 cursor-pointer overflow-hidden relative group shadow-inner">
                                                 {issuerLogoUrl ? <img src={issuerLogoUrl} className="w-full h-full object-cover" /> : <Icon name="image" className="w-6 h-6 text-neutral-400" />}
                                                 <input type="file" ref={issuerLogoInputRef} className="hidden" onChange={handleIssuerLogoUpload} accept="image/*"/>
                                             </div>
                                             <div className="flex-1"><p className="text-[10px] font-black text-neutral-500 uppercase mb-1">Logotipo del Emisor</p><p className="text-[9px] text-neutral-400 font-bold leading-tight">Esta imagen aparecerá en el Sales Room y PDF oficial de tu marca.</p></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="text-[10px] font-bold uppercase">Tu Marca Comercial</label><Input value={brandName} onChange={e => setBrandName(e.target.value)} /></div>
                                            <div><label className="text-[10px] font-bold uppercase text-brand-primary">Giro del Negocio</label><Input value={businessDescription} onChange={e => setBusinessDescription(e.target.value)} placeholder="Ej: Consultoría en IA, Agencia Web..." /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold uppercase">Tu Teléfono (WhatsApp)</label>
                                                <div className="flex gap-2">
                                                    <select 
                                                        value={issuerCountryCode} 
                                                        onChange={e => setIssuerCountryCode(e.target.value)}
                                                        className="w-28 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-bold px-2 focus:ring-2 focus:ring-brand-primary outline-none"
                                                    >
                                                        <option value="+593">+593 (EC)</option>
                                                        <option value="+52">+52 (MX)</option>
                                                        <option value="+57">+57 (CO)</option>
                                                        <option value="+34">+34 (ES)</option>
                                                        <option value="+1">+1 (US/CA)</option>
                                                        <option value="+54">+54 (AR)</option>
                                                        <option value="+56">+56 (CL)</option>
                                                        <option value="+51">+51 (PE)</option>
                                                        <option value="+506">+506 (CR)</option>
                                                        <option value="+507">+507 (PA)</option>
                                                        <option value="+502">+502 (GT)</option>
                                                        <option value="+1">+1 (DO)</option>
                                                    </select>
                                                    <Input 
                                                        value={issuerPhone} 
                                                        onChange={e => setIssuerPhone(e.target.value)} 
                                                        placeholder="998877665" 
                                                        className="flex-1"
                                                    />
                                                </div>
                                                <p className="text-[8px] text-neutral-400 mt-1 font-bold uppercase tracking-widest">Asegúrate de incluir el código de país para WhatsApp.</p>
                                            </div>
                                            <div><label className="text-[10px] font-bold uppercase">Tu Email de Cierre</label><Input value={issuerEmail} onChange={e => setIssuerEmail(e.target.value)} /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="text-[10px] font-bold uppercase">Razón Social Legal</label><Input value={providerName} onChange={e => setProviderName(e.target.value)} /></div>
                                            <div><label className="text-[10px] font-bold uppercase">ID Fiscal Emisor</label><Input value={providerTaxId} onChange={e => setProviderTaxId(e.target.value)} /></div>
                                        </div>
                                        <div className="flex justify-between items-center border-b pb-2 mt-4">
                                            <h5 className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.2em]">Cotización Detallada</h5>
                                            <div className="flex items-center gap-2">
                                                <label className="text-[9px] font-black text-neutral-400 uppercase">Moneda:</label>
                                                <select 
                                                    value={currency} 
                                                    onChange={e => setCurrency(e.target.value)}
                                                    className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[10px] font-bold px-2 py-1 outline-none text-brand-primary"
                                                >
                                                    <option value="USD">USD ($)</option>
                                                    <option value="EUR">EUR (€)</option>
                                                    <option value="MXN">MXN ($)</option>
                                                    <option value="COP">COP ($)</option>
                                                    <option value="ARS">ARS ($)</option>
                                                    <option value="CLP">CLP ($)</option>
                                                    <option value="PEN">PEN (S/)</option>
                                                    <option value="GTQ">GTQ (Q)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="bg-neutral-50 dark:bg-neutral-900 p-5 rounded-2xl space-y-4 border border-neutral-100 dark:border-neutral-800">
                                            <div className="flex gap-2 items-center">
                                                <div className="flex-1">
                                                    <Input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder="Concepto..." className="w-full !mt-0" />
                                                </div>
                                                <div className="w-24">
                                                    <Input type="number" value={newServicePrice} onChange={e => setNewServicePrice(e.target.value)} placeholder="0.00" className="w-full !mt-0"/>
                                                </div>
                                                <button type="button" onClick={handleAddManualService} className="p-3 bg-brand-primary text-white rounded-xl shadow-lg active:scale-90 transition-all flex-shrink-0">
                                                    <Icon name="plus" className="w-4 h-4"/>
                                                </button>
                                            </div>
                                            <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">{manualServices.map(s => (<div key={s.id} className="flex justify-between p-3 bg-white dark:bg-neutral-800 rounded-xl text-[10px] font-bold shadow-sm border border-neutral-50 dark:border-neutral-700 group"><span>{s.name}</span><div className="flex gap-2 items-center"><span className="text-brand-primary">${s.price.toLocaleString()}</span><button onClick={() => removeManualService(s.id)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="trash" className="w-3.5 h-3.5"/></button></div></div>))}</div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-6 bg-neutral-100 dark:bg-neutral-900/50 p-6 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800">
                                            {/* 1. TOTAL GENERAL DESTACADO */}
                                            <div className="bg-brand-primary text-white p-6 rounded-3xl text-center shadow-xl">
                                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-2">Inversión Final Proyectada</p>
                                                <p className="text-4xl font-black tracking-tighter">{currency} {liveTotal.toLocaleString()}</p>
                                            </div>

                                            {/* 2. TABLA DE CONCEPTOS (PREVIEW) */}
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Conceptos Detallados</p>
                                                <div className="space-y-2">
                                                    {manualServices.length > 0 ? manualServices.map(s => (
                                                        <div key={s.id} className="flex justify-between items-center p-3 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                                                            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase">{s.name}</span>
                                                            <span className="text-xs font-black text-neutral-900 dark:text-white">{currency} {s.price.toLocaleString()}</span>
                                                        </div>
                                                    )) : (
                                                        <div className="p-3 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center text-xs text-neutral-400 italic">
                                                            Sin conceptos manuales (se usará el valor base)
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 3. TABLA DE TOTALES Y CONFIGURACIÓN */}
                                            <div className="space-y-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-brand-primary/10 rounded-xl text-brand-primary">
                                                            <Icon name="security" className="w-5 h-5" />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase text-neutral-500">Impuesto Opcional</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input type="checkbox" checked={applyTax} onChange={e => setApplyTax(e.target.checked)} className="w-5 h-5 rounded text-brand-primary focus:ring-brand-primary" />
                                                        <Input type="number" value={taxPercentage} onChange={e => setTaxPercentage(e.target.value)} placeholder="15" className="w-16 !mt-0 h-9 text-center font-bold" />
                                                        <span className="text-xs font-bold text-neutral-400">%</span>
                                                    </div>
                                                </div>

                                                <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 space-y-2">
                                                    <div className="flex justify-between text-[10px] font-bold text-neutral-400 uppercase">
                                                        <span>Subtotal</span>
                                                        <span className="text-neutral-900 dark:text-white">{currency} {parseFloat(clientValue || '0').toLocaleString()}</span>
                                                    </div>
                                                    {applyTax && (
                                                        <div className="flex justify-between text-[10px] font-bold text-neutral-400 uppercase">
                                                            <span>IVA ({taxPercentage}%)</span>
                                                            <span className="text-neutral-900 dark:text-white">{currency} {(parseFloat(clientValue || '0') * (parseFloat(taxPercentage) / 100)).toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between text-sm font-black text-brand-primary uppercase border-t border-neutral-100 dark:border-neutral-700 pt-2">
                                                        <span>Total Final</span>
                                                        <span>{currency} {liveTotal.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 4. BOX DE ANTICIPOS */}
                                            <div className="space-y-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-brand-primary/10 rounded-xl text-brand-primary">
                                                            <Icon name="rocket" className="w-5 h-5" />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase text-neutral-500">Anticipos</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input type="checkbox" checked={enableAdvances} onChange={e => setEnableAdvances(e.target.checked)} className="w-5 h-5 rounded text-brand-primary focus:ring-brand-primary" />
                                                        <Input type="number" value={advancePercentage} onChange={e => setAdvancePercentage(e.target.value)} placeholder="50" className="w-16 !mt-0 h-9 text-center font-bold" />
                                                        <span className="text-xs font-bold text-neutral-400">%</span>
                                                    </div>
                                                </div>
                                                
                                                {enableAdvances && (
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800">
                                                            <p className="text-[8px] font-black text-emerald-600 uppercase mb-1">Pago Inicial ({advancePercentage}%)</p>
                                                            <p className="text-lg font-black text-emerald-900 dark:text-emerald-400">{currency} {(liveTotal * (parseFloat(advancePercentage) / 100)).toLocaleString()}</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                                                            <p className="text-[8px] font-black text-neutral-400 uppercase mb-1">Pago Final ({100 - parseFloat(advancePercentage)}%)</p>
                                                            <p className="text-lg font-black text-neutral-900 dark:text-white">{currency} {(liveTotal * (1 - parseFloat(advancePercentage) / 100)).toLocaleString()}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTabInEdit === 'files' && (
                             <div className="space-y-8 animate-fade-in">
                                <div className="p-6 bg-brand-primary/5 rounded-[2.5rem] border border-brand-primary/10 mb-8">
                                    <h5 className="text-[11px] font-black text-brand-primary uppercase tracking-[0.2em] mb-4">Accesos Directos IA (Expediente)</h5>
                                    <div className="flex flex-wrap gap-3">
                                        {(tempProposalText || editingClient?.proposalText) && (
                                            <button onClick={() => handleGenerateProposal()} className="flex items-center gap-3 px-6 py-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 shadow-sm hover:border-brand-primary transition-all">
                                                <Icon name="ai" className="w-5 h-5 text-brand-primary"/>
                                                <div className="text-left"><p className="text-xs font-black text-neutral-900 dark:text-white uppercase leading-none">Propuesta</p><p className="text-[8px] text-neutral-400 mt-1 uppercase font-bold">Fijado / IA</p></div>
                                            </button>
                                        )}
                                        {(tempPreInvoiceText || editingClient?.preInvoiceText) && (
                                            <button onClick={() => handleGeneratePreInvoiceDoc(editingClient)} className="flex items-center gap-3 px-6 py-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 shadow-sm hover:border-brand-primary transition-all">
                                                <Icon name="table" className="w-5 h-5 text-orange-500"/>
                                                <div className="text-left"><p className="text-xs font-black text-neutral-900 dark:text-white uppercase leading-none">Prefactura</p><p className="text-[8px] text-neutral-400 mt-1 uppercase font-bold">Fijado / IA</p></div>
                                            </button>
                                        )}
                                        {(tempContractText || editingClient?.contractText) && (
                                            <button onClick={() => handleGenerateAgreement()} className="flex items-center gap-3 px-6 py-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 shadow-sm hover:border-brand-primary transition-all">
                                                <Icon name="security" className="w-5 h-5 text-green-500"/>
                                                <div className="text-left"><p className="text-xs font-black text-neutral-900 dark:text-white uppercase leading-none">Acuerdo Maestro</p><p className="text-[8px] text-neutral-400 mt-1 uppercase font-bold">Fijado / IA</p></div>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <h5 className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.2em] border-b pb-2">Archivos Adjuntos Manuales</h5>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {editingClient?.files?.map(file => (
                                        <Card key={file.id} className="p-5 bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 flex items-center justify-between group shadow-sm hover:shadow-md transition-all rounded-2xl">
                                            <div className="flex items-center gap-4 overflow-hidden">
                                                <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl text-brand-primary"><Icon name="folder" className="w-6 h-6"/></div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold truncate text-neutral-800 dark:text-white" title={file.name}>{file.name}</p>
                                                    <p className="text-[10px] text-neutral-400 uppercase font-medium">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="p-2 text-neutral-400 hover:text-brand-primary transition-colors"><Icon name="externalLink" className="w-4 h-4"/></a>
                                        </Card>
                                    ))}
                                    {(!editingClient?.files || editingClient.files.length === 0) && (
                                        <div className="col-span-full py-20 text-center opacity-40 italic text-sm">El expediente está vacío. Sube RUCs, cédulas o contratos.</div>
                                    )}
                                </div>
                                <div className="flex justify-center pt-10 border-t dark:border-neutral-800">
                                     <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 bg-brand-primary text-white px-8 py-4 rounded-[1.5rem] text-sm font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all"><Icon name="plus" className="w-5 h-5"/> Subir Documento al Expediente</button>
                                     <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                                </div>
                             </div>
                        )}

                        {activeTabInEdit === 'activity' && (
                             <div className="animate-fade-in space-y-6">
                                <h5 className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.2em] border-b pb-2">Historial de Interacciones CRM</h5>
                                <div className="space-y-4 max-w-2xl">
                                    {pendingRequests.length > 0 && (
                                        <div className="mb-8 p-6 bg-red-50 dark:bg-red-900/10 rounded-[2.5rem] border-2 border-red-500 shadow-xl animate-pulse-subtle">
                                            <h6 className="text-red-600 font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2"><Icon name="edit" className="w-4 h-4"/> AJUSTES REQUERIDOS POR EL CLIENTE</h6>
                                            <div className="space-y-3">
                                                {pendingRequests.map(req => (
                                                    <div key={req.id} className="p-4 bg-white dark:bg-neutral-800 rounded-2xl border border-red-200 flex justify-between items-center gap-4">
                                                        <div className="flex-1">
                                                            <p className="text-[9px] font-black text-red-500 uppercase">Sección: {req.section}</p>
                                                            <p className="text-sm font-bold mt-1">"{req.description}"</p>
                                                        </div>
                                                        <button 
                                                            onClick={() => handleResolveRequest(req.id, req.section as any)}
                                                            className="bg-red-500 text-white px-6 py-2 rounded-xl font-black uppercase text-[10px] shadow-lg hover:bg-red-600 transition-all"
                                                        >
                                                            IR AL CAMBIO
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {[...tempActivities, ...(editingClient?.activityFeed || [])].map(act => (
                                        <div key={act.id} className="flex gap-4 group">
                                            <div className="flex flex-col items-center">
                                                <div className={`p-2 rounded-full shadow-sm z-10 ${act.type === 'call' ? 'bg-blue-500 text-white' : act.type === 'document' ? 'bg-purple-500 text-white' : 'bg-neutral-200 text-neutral-500'}`}><Icon name={act.type === 'call' ? 'video' : act.type === 'document' ? 'folder' : 'sync'} className="w-3 h-3"/></div>
                                                <div className="flex-1 w-0.5 bg-neutral-200 dark:bg-neutral-800"></div>
                                            </div>
                                            <div className="flex-1 pb-6">
                                                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{act.text}</p>
                                                <p className="text-[10px] text-neutral-400 mt-1">{new Date(act.date).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {(!editingClient?.activityFeed || editingClient.activityFeed.length === 0) && tempActivities.length === 0 && (
                                        <div className="text-center py-20 opacity-40 italic text-sm">Sin actividad registrada en este lead.</div>
                                    )}
                                </div>
                             </div>
                        )}

                        {activeTabInEdit === 'room' && (
                            <div className="animate-fade-in space-y-8">
                                <h5 className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.2em] border-b pb-2">Sales Room Elite</h5>
                                <div className="p-10 bg-neutral-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/10 text-center">
                                    <div className="absolute top-0 right-0 w-80 h-80 bg-brand-primary/10 rounded-full blur-[100px]"></div>
                                    <div className="relative z-10">
                                        <div className="w-20 h-20 bg-brand-primary rounded-3xl flex items-center justify-center shadow-xl mx-auto mb-6 transform rotate-3"><Icon name="rocket" className="w-10 h-10"/></div>
                                        <h4 className="text-3xl font-black uppercase tracking-tighter">Sala de Cierre Digital</h4>
                                        <p className="text-sm text-neutral-400 mt-4 max-w-md mx-auto leading-relaxed font-medium">Comparte este entorno inmersivo con tu cliente para que revise la propuesta estratégica, valide la inversión y firme el acuerdo legalmente.</p>
                                        
                                        {editingClient?.salesRoomId ? (
                                            <div className="mt-12 space-y-6">
                                                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between">
                                                    <div className="text-left overflow-hidden mr-4">
                                                        <p className="text-[9px] font-black text-brand-accent uppercase tracking-widest">Enlace Público Seguro</p>
                                                        <p className="text-xs font-mono truncate opacity-60 mt-1">{window.location.origin}/#/sales-room/{editingClient.salesRoomId}</p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button type="button" onClick={() => handleConfirmSalesRoom(editingClient)} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-lg" title="Regenerar Enlace Digerible"><Icon name="sync" className="w-5 h-5"/></button>
                                                        <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/#/sales-room/${editingClient.salesRoomId}`); setToastNotification({title:"Copiado", message: "Link de cierre copiado", icon: 'copy'}); }} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-lg"><Icon name="copy" className="w-5 h-5"/></button>
                                                        <button type="button" onClick={() => {
                                                            setMailDraft({
                                                                to: editingClient?.contactEmail || '',
                                                                subject: `Link Seguro: Sala de Cierre - ${project.name}`,
                                                                htmlBody: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">
<div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); background-color: #ffffff;">
    <div style="background-color: #111827; padding: 40px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #1e3a8a 100%);">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; text-transform: uppercase;">Sala de Cierre Digital</h1>
        <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;">${project.name}</p>
    </div>
    <div style="padding: 40px 30px;">
        <p style="font-size: 16px; color: #1e293b; font-weight: 700; margin: 0 0 15px 0;">Hola <span style="color: #6366f1;">${editingClient?.name}</span>,</p>
        <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 30px 0;">He preparado un entorno seguro para formalizar nuestro proyecto. A través de este portal, podrás gestionar todo el proceso de cierre de forma rápida, transparente y con validez legal.</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 25px 20px; margin-bottom: 40px; border-radius: 8px;">
            <p style="margin: 0 0 20px 0; font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 1px;">Pasos a seguir:</p>
            <div style="margin-bottom: 15px; display: flex; align-items: flex-start;">
                <span style="background-color: #1e3a8a; color: #ffffff; border-radius: 50%; min-width: 24px; height: 24px; display: inline-block; text-align: center; font-size: 12px; line-height: 24px; font-weight: bold; margin-right: 15px;">1</span>
                <span style="font-size: 15px; color: #334155; line-height: 1.6; font-weight: 600;">Revisa la propuesta de valor</span>
            </div>
            <div style="margin-bottom: 15px; display: flex; align-items: flex-start;">
                <span style="background-color: #1e3a8a; color: #ffffff; border-radius: 50%; min-width: 24px; height: 24px; display: inline-block; text-align: center; font-size: 12px; line-height: 24px; font-weight: bold; margin-right: 15px;">2</span>
                <span style="font-size: 15px; color: #334155; line-height: 1.6; font-weight: 600;">Visualiza la inversión y prefactura</span>
            </div>
            <div style="display: flex; align-items: flex-start;">
                <span style="background-color: #1e3a8a; color: #ffffff; border-radius: 50%; min-width: 24px; height: 24px; display: inline-block; text-align: center; font-size: 12px; line-height: 24px; font-weight: bold; margin-right: 15px;">3</span>
                <span style="font-size: 15px; color: #334155; line-height: 1.6; font-weight: 600;">Aprueba el convenio de servicios</span>
            </div>
        </div>

        <div style="text-align: center; margin-bottom: 35px;">
            <a href="${window.location.origin}/#/sales-room/${editingClient?.salesRoomId}" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #6366f1; color: #ffffff; padding: 18px 20px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 15px; text-transform: uppercase; letter-spacing: 1px; flex-shrink: 0;">Entrar a la Sala de Cierre</a>
        </div>
        
        <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0; text-align: center;">Quedo atento a tus comentarios.<br/><span style="font-weight: 700; color: #1e293b;">Saludos cordiales.</span></p>
    </div>
</div>
</body>
</html>`
                                                            });
                                                            setCurrentView('mail');
                                                        }} className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl shadow-lg hover:scale-105 transition-all" title="Enviar enlace por correo"><Icon name="mail" className="w-5 h-5"/></button>
                                                        <button type="button" onClick={() => window.open(`${window.location.origin}/#/sales-room/${editingClient.salesRoomId}`, '_blank')} className="p-3 bg-brand-primary text-white rounded-xl shadow-lg hover:scale-105 transition-all"><Icon name="externalLink" className="w-5 h-5"/></button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                     <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-center"><p className="text-[9px] font-black text-neutral-500 uppercase">Vistas</p><p className="text-2xl font-black">{editingClient.viewsCount || 0}</p></div>
                                                     <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-center"><p className="text-[9px] font-black text-neutral-500 uppercase">Aprobación</p><p className={`text-sm font-black ${editingClient.contractSigned ? 'text-green-400' : 'text-amber-400'}`}>{editingClient.contractSigned ? 'FIRMADO' : 'PENDIENTE'}</p></div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-12">
                                                {editingClient ? (
                                                    <Button onClick={() => handleConfirmSalesRoom(editingClient)} className="w-full sm:w-auto px-12 py-5 rounded-[2rem] bg-white text-neutral-900 hover:bg-neutral-100 border-none font-black uppercase text-xs tracking-widest shadow-2xl transition-all active:scale-95">Activar Sala de Ventas Ahora</Button>
                                                ) : (
                                                    <p className="text-xs text-brand-accent font-bold">Guarda el prospecto primero para habilitar la sala.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                             </div>
                        )}
                    </div>

                    <div className="p-6 border-t dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] flex flex-col sm:flex-row justify-between items-center gap-4 flex-none sticky bottom-0 z-30 shadow-2xl">
                         <div className="flex gap-4 items-center">
                            <div className="flex gap-2">
                                <Button onClick={handleGenerateProposal} variant="secondary" className="h-12 px-6 border-brand-primary/30 text-brand-primary font-black uppercase text-[10px] tracking-widest relative group">
                                     {isGeneratingDoc === 'proposal' ? <Spinner className="!p-0" /> : <><Icon name="ai" className="w-4 h-4"/> Propuesta IA</>}
                                     {(tempProposalText || editingClient?.proposalText) && <div className="absolute -top-2 -right-2 bg-green-500 text-white w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-md"><Icon name="check" className="w-3 h-3"/></div>}
                                </Button>
                                <Button onClick={() => handleGeneratePreInvoiceDoc(editingClient)} variant="secondary" className="h-12 px-6 border-brand-primary/30 text-brand-primary font-black uppercase text-[10px] tracking-widest relative group">
                                     {isGeneratingDoc === 'preinvoice' ? <Spinner className="!p-0" /> : <><Icon name="table" className="w-4 h-4"/> Prefactura IA</>}
                                     {(tempPreInvoiceText || editingClient?.preInvoiceText) && <div className="absolute -top-2 -right-2 bg-green-500 text-white w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-md"><Icon name="check" className="w-3 h-3"/></div>}
                                </Button>
                                <Button onClick={handleGenerateAgreement} variant="secondary" className="h-12 px-6 border-brand-primary/30 text-brand-primary font-black uppercase text-[10px] tracking-widest relative group">
                                     {isGeneratingDoc === 'contract' ? <Spinner className="!p-0" /> : <><Icon name="security" className="w-4 h-4"/> Contrato IA</>}
                                     {(tempContractText || editingClient?.contractText) && <div className="absolute -top-2 -right-2 bg-green-500 text-white w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-md"><Icon name="check" className="w-3 h-3"/></div>}
                                </Button>
                            </div>
                         </div>
                         <div className="flex gap-2 w-full sm:w-auto">
                            <Button variant="secondary" onClick={() => setAddModalOpen(false)} className="flex-1 sm:flex-none px-8 font-black uppercase text-[10px] tracking-widest">Descartar</Button>
                            <Button onClick={handleSubmit} disabled={isSaving || !clientName} className="flex-1 sm:flex-none px-12 shadow-xl shadow-brand-primary/30 font-black uppercase text-[10px] tracking-widest">
                                {isSaving ? <Spinner className="w-4 h-4 text-white" /> : "Fijar Prospecto"}
                            </Button>
                         </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ProjectCrmView;