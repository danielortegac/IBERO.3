
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { ProjectClient, ClientActivity, ClientChangeRequest } from '../types';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import Button from './ui/Button';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import Modal from './ui/Modal';
import Textarea from './ui/Textarea';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PublicSalesRoomPageProps {
    roomId: string;
}

const PublicSalesRoomPage: React.FC<PublicSalesRoomPageProps> = ({ roomId }) => {
    const [client, setClient] = useState<ProjectClient | null>(null);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState(1); 
    const [maxStep, setMaxStep] = useState(1);
    const [timeLeft, setTimeLeft] = useState(3600 * 48); 
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
    const [changeDescription, setChangeDescription] = useState('');

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [step]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try { 
                    await signInAnonymously(auth); 
                } catch (err) { 
                    console.error("Anonym auth error", err); 
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!isAuthReady) return;

        const fetchRoom = async () => {
            try {
                const projectsRef = collection(db, "projects");
                const snapshot = await getDocs(projectsRef);
                let foundClient: ProjectClient | null = null;
                let foundPid: string | null = null;
                let foundOid: string | null = null;
                
                snapshot.forEach(d => {
                    const data = d.data();
                    if (data.clients) {
                        const c = data.clients.find((cl: ProjectClient) => cl.salesRoomId === roomId);
                        if (c) { 
                            foundClient = c; 
                            foundPid = d.id; 
                            foundOid = data.ownerId;
                        }
                    }
                });

                if (foundClient && foundPid) {
                    setClient(foundClient);
                    setProjectId(foundPid);
                    setOwnerId(foundOid);
                    
                    const updatedClients = (await getDoc(doc(db, 'projects', foundPid))).data()?.clients.map((c: any) => 
                        c.id === foundClient!.id ? { ...c, viewsCount: (c.viewsCount || 0) + 1, lastViewedAt: new Date().toISOString() } : c
                    );
                    await updateDoc(doc(db, 'projects', foundPid), { clients: updatedClients });
                    
                    // LÓGICA DE PASO INICIAL MEJORADA v4.2
                    let initialStep = 1;
                    if (foundClient.contractSigned) {
                        initialStep = 3;
                    } else if (foundClient.preInvoicePaid) {
                        initialStep = 3; // Si ya pagó, va a ver el contrato
                    } else if (foundClient.proposalApproved) {
                        initialStep = 2; // Si ya aprobó, va a ver la factura
                    }
                    
                    setStep(initialStep);
                    setMaxStep(initialStep);
                } else { setError('Sala de ventas no encontrada o enlace expirado.'); }
            } catch (e) { console.error(e); setError('Error al establecer conexión con el servidor.'); } 
            finally { setLoading(false); }
        };
        fetchRoom();
    }, [roomId, isAuthReady]);

    useEffect(() => {
        const timer = setInterval(() => setTimeLeft(prev => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTimer = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const sendOwnerNotification = async (text: string) => {
        if (!ownerId || !projectId || !client) return;
        try {
            await addDoc(collection(db, `users/${ownerId}/notifications`), {
                type: 'general',
                text,
                timestamp: new Date().toISOString(),
                read: false,
                link: `/#/projects/${projectId}/crm`,
                fromUser: { uid: 'public_guest', name: client.name, avatarUrl: client.logoUrl || null }
            });
        } catch (e) { console.error("Notify fail", e); }
    };

    const handleApproveStep = async () => {
        if (!client || !projectId) return;
        setLoading(true);
        try {
            const currentSectionName = step === 1 ? 'Propuesta' : step === 2 ? 'Inversión' : 'Acuerdo Final';
            const activity: ClientActivity = {
                id: `act-${Date.now()}`,
                type: 'system',
                text: `Sales Room: ${step === 1 ? 'Propuesta Aprobada' : step === 2 ? 'Inversión Validada' : 'Contrato Firmado Digitalmente'}`,
                date: new Date().toISOString()
            };
            
            const updatedClients = (await getDoc(doc(db, 'projects', projectId))).data()?.clients.map((c: any) => {
                if (c.id === client.id) {
                    const updated = { ...c, activityFeed: [activity, ...(c.activityFeed || [])] };
                    if (step === 1) updated.proposalApproved = true;
                    if (step === 2) updated.preInvoicePaid = true;
                    if (step === 3) updated.contractSigned = true;
                    return updated;
                }
                return c;
            });
            
            await updateDoc(doc(db, 'projects', projectId), { clients: updatedClients });
            await sendOwnerNotification(`🚀 **${client.name}** ha validado la sección de **${currentSectionName}** en su Sales Room.`);
            
            if (step === 3) {
                 const cSnap = await getDoc(doc(db, 'projects', projectId));
                 const cData = cSnap.data()?.clients.find((cl: any) => cl.id === client.id);
                 setClient(cData);
                 setStep(4);
                 setMaxStep(4);
            } else {
                 setStep(prev => prev + 1);
                 setMaxStep(prev => Math.max(prev, step + 1));
            }
        } catch (e) { console.error(e); } 
        finally { setLoading(false); }
    };

    const handleSubmitChangeRequest = async () => {
        if (!client || !projectId || !changeDescription.trim()) return;
        setLoading(true);
        try {
            const section = step === 1 ? 'proposal' : step === 2 ? 'preInvoice' : 'contract';
            const sectionName = step === 1 ? 'Propuesta' : step === 2 ? 'Inversión' : 'Contrato';
            
            const newRequest: ClientChangeRequest = {
                id: `req-${Date.now()}`,
                section,
                description: changeDescription.trim(),
                date: new Date().toISOString(),
                status: 'pending'
            };

            const updatedClients = (await getDoc(doc(db, 'projects', projectId))).data()?.clients.map((c: any) => {
                if (c.id === client.id) {
                    return { ...c, changeRequests: [...(c.changeRequests || []), newRequest] };
                }
                return c;
            });

            await updateDoc(doc(db, 'projects', projectId), { clients: updatedClients });
            await sendOwnerNotification(`🔔 **${client.name}** ha solicitado un cambio en su **${sectionName}**: "${changeDescription.substring(0, 40)}..."`);
            
            setChangeDescription('');
            setIsChangeModalOpen(false);
            alert("Solicitud enviada correctamente. El profesional revisará tu ajuste.");
        } catch (e) { console.error(e); } 
        finally { setLoading(false); }
    };

    const handleDownloadPDF = () => {
        if (!client) return;
        const docPDF = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const margin = 20; 
        
        let title = "DOCUMENTO CORPORATIVO";
        let content = "";
        
        if (step === 1) { title = "PROPUESTA ESTRATÉGICA"; content = client.proposalText || "Contenido no disponible."; }
        else if (step === 2) { title = "PREFACTURA DIGITAL"; content = client.preInvoiceText || ""; }
        else { title = "CONTRATO MAESTRO"; content = client.contractText || "Contenido no disponible."; }

        // DISEÑO DE CABECERA PREMIUM
        docPDF.setFillColor(15, 15, 15); 
        docPDF.rect(0, 0, 210, 60, 'F'); 
        
        // LOGO EMISOR
        if (client.issuerLogoUrl) { 
            try { docPDF.addImage(client.issuerLogoUrl, 'PNG', margin, 10, 25, 25); } catch(e) {} 
        }

        docPDF.setTextColor(255, 255, 255); 
        docPDF.setFontSize(24); 
        docPDF.setFont("helvetica", "bold"); 
        docPDF.text(title, margin, 50);
        
        docPDF.setFontSize(10);
        docPDF.setFont("helvetica", "normal");
        docPDF.text(`ID: ${client.salesRoomId || 'DOC-OFFICIAL'}`, 190, 50, { align: 'right' });

        // INFO DE PARTES
        let y = 75;
        docPDF.setTextColor(124, 58, 237);
        docPDF.setFontSize(9);
        docPDF.setFont("helvetica", "bold");
        docPDF.text("EMISOR ESTRATÉGICO", margin, y);
        docPDF.text("RECEPTOR DEL PROYECTO", 110, y);
        
        y += 6;
        docPDF.setTextColor(40, 40, 40);
        docPDF.setFontSize(12);
        docPDF.text(client.brandName?.toUpperCase() || "ALIADO ESTRATÉGICO", margin, y);
        docPDF.text(client.name.toUpperCase(), 110, y);
        
        y += 5;
        docPDF.setFontSize(9);
        docPDF.setFont("helvetica", "normal");
        docPDF.text(client.providerName || "", margin, y);
        docPDF.text(client.contact || "", 110, y);
        
        y += 4;
        docPDF.text(client.issuerEmail || client.providerContact || "", margin, y);
        docPDF.text(client.taxId || "ID FISCAL: PENDIENTE", 110, y);

        y += 15;
        docPDF.setDrawColor(230, 230, 230);
        docPDF.line(margin, y, 190, y);
        y += 10;

        // FUNCIÓN PARA PROCESAR CONTENIDO (TEXTO Y TABLAS)
        const processContent = (text: string, currentY: number) => {
            const lines = text.split('\n');
            let tempY = currentY;
            let tableLines: string[] = [];
            let inTable = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Detectar inicio de tabla Markdown
                if (line.startsWith('|') && line.endsWith('|')) {
                    if (!inTable) {
                        inTable = true;
                        tableLines = [line];
                    } else {
                        tableLines.push(line);
                    }
                    continue;
                }

                // Si estábamos en una tabla y la línea ya no es parte de ella
                if (inTable && (!line.startsWith('|') || i === lines.length - 1)) {
                    if (i === lines.length - 1 && line.startsWith('|')) tableLines.push(line);
                    
                    // Procesar tabla acumulada
                    const headers = tableLines[0].split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim());
                    const data = tableLines.slice(2).map(row => 
                        row.split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim())
                    );

                    autoTable(docPDF, {
                        startY: tempY,
                        head: [headers],
                        body: data,
                        margin: { left: margin, right: margin },
                        theme: 'striped',
                        headStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
                        bodyStyles: { fontSize: 8, textColor: [60, 60, 60] },
                        alternateRowStyles: { fillColor: [250, 250, 250] },
                        columnStyles: { 0: { fontStyle: 'bold' } }
                    });

                    tempY = (docPDF as any).lastAutoTable.finalY + 10;
                    inTable = false;
                    tableLines = [];
                    if (!line.startsWith('|')) {
                        // Continuar procesando la línea actual como texto
                    } else {
                        continue;
                    }
                }

                if (!inTable && line !== '') {
                    const isHeader = line.startsWith('#');
                    
                    if (tempY > 270) {
                        docPDF.addPage();
                        tempY = 25;
                        docPDF.setFillColor(15, 15, 15);
                        docPDF.rect(0, 0, 210, 15, 'F');
                        docPDF.setTextColor(255, 255, 255);
                        docPDF.setFontSize(8);
                        docPDF.text(`${title} - ${client.name.toUpperCase()}`, margin, 10);
                        docPDF.setTextColor(60, 60, 60);
                        docPDF.setFontSize(10);
                    }

                    if (isHeader) {
                        docPDF.setFont("helvetica", "bold");
                        docPDF.setFontSize(12);
                        docPDF.setTextColor(15, 15, 15);
                        const cleanLine = line.replace(/#/g, '').trim();
                        const splitText = docPDF.splitTextToSize(cleanLine, 170);
                        splitText.forEach((t: string) => {
                            if (tempY > 280) {
                                docPDF.addPage();
                                tempY = 25;
                                docPDF.setFillColor(15, 15, 15);
                                docPDF.rect(0, 0, 210, 15, 'F');
                                docPDF.setTextColor(255, 255, 255);
                                docPDF.setFontSize(8);
                                docPDF.text(`${title} - ${client.name.toUpperCase()}`, margin, 10);
                                docPDF.setTextColor(60, 60, 60);
                                docPDF.setFontSize(10);
                            }
                            docPDF.text(t, margin, tempY);
                            tempY += 7;
                        });
                    } else {
                        // RENDERIZADO DE TEXTO CON NEGRILLAS MIXTAS
                        let currentX = margin;
                        const parts = line.split(/(\*\*.*?\*\*)/g);
                        
                        parts.forEach(part => {
                            if (part === '') return;
                            const isBoldPart = part.startsWith('**') && part.endsWith('**');
                            const cleanPart = isBoldPart ? part.slice(2, -2) : part;
                            
                            docPDF.setFont("helvetica", isBoldPart ? "bold" : "normal");
                            docPDF.setFontSize(10);
                            docPDF.setTextColor(isBoldPart ? 40 : 60, isBoldPart ? 40 : 60, isBoldPart ? 40 : 60);
                            
                            const subWords = cleanPart.split(' ');
                            subWords.forEach((word, idx) => {
                                const textToPrint = word + (idx < subWords.length - 1 ? ' ' : '');
                                const wordWidth = docPDF.getTextWidth(textToPrint);
                                
                                if (currentX + wordWidth > margin + 170) {
                                    tempY += 6;
                                    currentX = margin;
                                    if (tempY > 280) {
                                        docPDF.addPage();
                                        tempY = 25;
                                        docPDF.setFillColor(15, 15, 15);
                                        docPDF.rect(0, 0, 210, 15, 'F');
                                        docPDF.setTextColor(255, 255, 255);
                                        docPDF.setFontSize(8);
                                        docPDF.text(`${title} - ${client.name.toUpperCase()}`, margin, 10);
                                        docPDF.setTextColor(60, 60, 60);
                                        docPDF.setFontSize(10);
                                    }
                                }
                                docPDF.text(textToPrint, currentX, tempY);
                                currentX += wordWidth;
                            });
                        });
                        tempY += 7; // Espacio para la siguiente línea
                    }
                    tempY += 2; // Espacio entre párrafos
                }
            }
            return tempY;
        };

        // CONTENIDO PRINCIPAL
        if (step === 2 && !client.preInvoiceText) {
            // DISEÑO ESPECIAL PARA PREFACTURA SI NO HAY TEXTO IA
            const totalFinal = client.value * (client.applyTax ? (1 + (client.taxPercentage || 15)/100) : 1);
            const currency = client.currency || 'USD';

            // 1. TOTAL GENERAL DESTACADO
            docPDF.setFillColor(245, 245, 245);
            docPDF.roundedRect(margin, y, 170, 25, 5, 5, 'F');
            docPDF.setFont("helvetica", "bold");
            docPDF.setFontSize(10);
            docPDF.setTextColor(100, 100, 100);
            docPDF.text("INVERSIÓN TOTAL", margin + 5, y + 8);
            docPDF.setFontSize(18);
            docPDF.setTextColor(124, 58, 237);
            docPDF.text(`$${totalFinal.toLocaleString()} ${currency}`, margin + 5, y + 18);
            y += 35;

            // 2. TABLA DE CONCEPTOS
            docPDF.setFont("helvetica", "bold");
            docPDF.setFontSize(12);
            docPDF.setTextColor(15, 15, 15);
            docPDF.text("CONCEPTOS DETALLADOS", margin, y);
            y += 8;
            
            const services = client.services || [];
            const tableData = services.length > 0 
                ? services.map(s => [s.name.toUpperCase(), `$${s.price.toLocaleString()}`])
                : [["SERVICIOS PROFESIONALES ESPECIALIZADOS", `$${client.value.toLocaleString()}`]];

            autoTable(docPDF, {
                startY: y,
                head: [['CONCEPTO DEL SERVICIO', `VALOR (${currency})`]],
                body: tableData,
                margin: { left: margin, right: margin },
                theme: 'grid',
                headStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold' },
                bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
                columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
            });

            y = (docPDF as any).lastAutoTable.finalY + 10;
            
            // Evaluar margin bottom y crear página si es necesario
            const checkPageSpace = (neededHeight: number) => {
                if (y + neededHeight > docPDF.internal.pageSize.getHeight() - 20) {
                    docPDF.addPage();
                    y = 20;
                }
            };

            checkPageSpace(30);

            // 3. TABLA DE TOTALES
            docPDF.setFont("helvetica", "normal");
            docPDF.setFontSize(10);
            docPDF.text("SUBTOTAL", 130, y);
            docPDF.text(`$${client.value.toLocaleString()}`, 185, y, { align: 'right' });
            
            if (client.applyTax) {
                y += 6;
                docPDF.text(`IVA (${client.taxPercentage || 15}%)`, 130, y);
                docPDF.text(`$${(client.value * ((client.taxPercentage || 15)/100)).toLocaleString()}`, 185, y, { align: 'right' });
            }
            
            y += 10;
            docPDF.setFont("helvetica", "bold");
            docPDF.setFontSize(14);
            docPDF.setTextColor(124, 58, 237);
            docPDF.text("TOTAL FINAL", 130, y);
            docPDF.text(`$${totalFinal.toLocaleString()}`, 185, y, { align: 'right' });
            y += 15;

            // 4. BOX DE ANTICIPOS
            if (client.enableAdvances) {
                checkPageSpace(35);
                
                docPDF.setFillColor(236, 253, 245); // emerald-50
                docPDF.roundedRect(margin, y, 170, 30, 5, 5, 'F');
                docPDF.setFont("helvetica", "bold");
                docPDF.setFontSize(10);
                docPDF.setTextColor(5, 150, 105); // emerald-600
                docPDF.text("ESQUEMA DE ANTICIPOS HABILITADO", margin + 5, y + 8);
                
                docPDF.setFontSize(8);
                docPDF.setTextColor(6, 78, 59); // emerald-900
                docPDF.text(`PAGO INICIAL (${client.advancePercentage}%)`, margin + 5, y + 18);
                docPDF.setFontSize(12);
                docPDF.text(`$${(totalFinal * (client.advancePercentage / 100)).toLocaleString()}`, margin + 5, y + 26);

                docPDF.setFontSize(8);
                docPDF.text(`PAGO FINAL (${100 - (client.advancePercentage || 50)}%)`, margin + 85, y + 18);
                docPDF.setFontSize(12);
                docPDF.text(`$${(totalFinal * (1 - (client.advancePercentage / 100))).toLocaleString()}`, margin + 85, y + 26);
            }
        } else {
            // RENDERIZADO DE TEXTO IA CON SOPORTE PARA TABLAS
            processContent(content, y);
        }
        
        // PIE DE PÁGINA
        const pageCount = (docPDF as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            docPDF.setPage(i);
            docPDF.setFontSize(8);
            docPDF.setTextColor(150, 150, 150);
            docPDF.text(`Página ${i} de ${pageCount} | Digital Trust Verified by Goatify IA`, 105, 290, { align: 'center' });
        }

        docPDF.save(`${client.name}_${title.replace(/\s+/g, '_')}.pdf`);
    };

    if (loading && !client) return <div className="min-h-screen bg-black flex items-center justify-center"><Spinner text="Estableciendo conexión encriptada..." /></div>;
    if (error) return <div className="min-h-screen bg-black flex items-center justify-center text-white p-8 text-center"><Icon name="close" className="w-12 h-12 mx-auto text-red-500 mb-4"/><p className="text-xl font-bold">{error}</p></div>;
    if (!client) return null;

    const isSigned = !!client.contractSigned;

    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans overflow-y-auto h-screen w-full selection:bg-brand-primary/30 pb-32">
            <Modal isOpen={isChangeModalOpen} onClose={() => setIsChangeModalOpen(false)} title="Solicitar Ajuste en el Documento">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500 font-medium">Describe el cambio que deseas realizar en esta sección. El profesional será notificado inmediatamente para procesar tu solicitud.</p>
                    <Textarea value={changeDescription} onChange={e => setChangeDescription(e.target.value)} placeholder="Ej: Cambiar el plazo de entrega a 15 días, o ajustar el precio del servicio X..." rows={4} autoFocus />
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button variant="secondary" onClick={() => setIsChangeModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSubmitChangeRequest} disabled={!changeDescription.trim() || loading}>Enviar Solicitud</Button>
                    </div>
                </div>
            </Modal>

            <header className="sticky top-0 z-[100] bg-white/95 backdrop-blur-2xl border-b border-gray-100 p-3 sm:p-5 flex justify-between items-center px-4 sm:px-10 md:px-20 shadow-sm">
                <div className="flex items-center gap-6 sm:gap-12">
                    {/* EMISOR INFO */}
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="relative flex-shrink-0">
                            {client.issuerLogoUrl ? (
                                <img src={client.issuerLogoUrl} className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl object-cover shadow-md border border-white ring-4 ring-brand-primary/5" alt="Emisor"/>
                            ) : (
                                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-neutral-900 rounded-2xl flex flex-col items-center justify-center shadow-lg border border-white ring-4 ring-neutral-50">
                                    <span className="text-[8px] font-black text-white leading-none uppercase">EMISOR</span>
                                </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-green-500 border-2 border-white rounded-full"></div>
                        </div>
                        <div className="block">
                            <h1 className="font-black text-[10px] sm:text-xs uppercase tracking-tighter leading-none text-neutral-900 mb-1">{client.brandName || "Aliado Estratégico"}</h1>
                            <p className="text-[8px] sm:text-[10px] text-brand-primary font-black uppercase tracking-[0.2em]">Proveedor Estratégico</p>
                            <div className="flex items-center gap-2 mt-1.5 hidden xs:flex">
                                <span className="px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary text-[7px] font-black rounded uppercase">Verificado</span>
                                <span className="text-[7px] text-neutral-400 font-bold uppercase tracking-widest">{client.issuerEmail || client.providerContact}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-px h-10 bg-neutral-100 hidden md:block"></div>

                    {/* CLIENTE INFO */}
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="relative flex-shrink-0">
                            {client.logoUrl ? (
                                <img src={client.logoUrl} className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl object-cover shadow-md border border-white ring-4 ring-neutral-50" alt="Cliente"/>
                            ) : (
                                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-neutral-900 rounded-2xl flex flex-col items-center justify-center shadow-lg border border-white ring-4 ring-neutral-50">
                                    <span className="text-[8px] font-black text-white leading-none">CLIENTE</span>
                                    <span className="text-[10px] font-black text-brand-primary leading-none mt-1 italic">VIP</span>
                                </div>
                            )}
                        </div>
                        <div className="block">
                            <h1 className="font-black text-[10px] sm:text-xs uppercase tracking-tighter leading-none text-neutral-900 mb-1">{client.name}</h1>
                            <p className="text-[8px] sm:text-[10px] text-neutral-400 font-black uppercase tracking-[0.2em]">Socio Estratégico</p>
                            <div className="flex items-center gap-2 mt-1.5 hidden xs:flex">
                                <span className="text-[7px] text-neutral-400 font-bold uppercase tracking-widest">{client.contact}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-5">
                    {!isSigned && (
                        <div className="hidden lg:flex bg-red-50 border border-red-100 px-4 py-2 rounded-2xl items-center gap-3 shadow-sm">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                            <div className="flex flex-col">
                                <span className="text-[7px] font-black text-red-400 uppercase tracking-widest leading-none mb-1">Oferta Expira en:</span>
                                <span className="text-[10px] font-mono font-black text-red-600 uppercase leading-none">{formatTimer(timeLeft)}</span>
                            </div>
                        </div>
                    )}
                    <button onClick={handleDownloadPDF} className="p-3 sm:p-4 bg-neutral-50 rounded-2xl hover:bg-neutral-100 transition-all border border-neutral-200 shadow-sm group" title="Descargar documento actual">
                        <Icon name="download" className="w-5 h-5 text-neutral-600 group-hover:scale-110 transition-transform"/>
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto pt-4 sm:pt-8 px-0 sm:px-6">
                <div className="flex justify-between mb-6 sm:mb-10 relative max-w-2xl mx-auto px-4 sm:px-0">
                    <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-100 -translate-y-1/2 z-0 rounded-full"></div>
                    <div className="absolute top-1/2 left-0 h-1 bg-brand-primary -translate-y-1/2 z-0 rounded-full transition-all duration-700" style={{ width: `${(step-1) * 33.33}%` }}></div>
                    
                    {[1, 2, 3, 4].map(i => {
                        const canNavigate = i <= maxStep;
                        return (
                            <div 
                                key={i} 
                                onClick={() => canNavigate && setStep(i)}
                                className={`relative z-10 flex flex-col items-center gap-2 sm:gap-3 transition-all duration-500 ${step >= i ? 'scale-105 sm:scale-110' : 'opacity-30 blur-[1px]'} ${canNavigate ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                            >
                                <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center font-black text-sm sm:text-lg shadow-2xl border-2 sm:border-4 transition-colors ${step > i ? 'bg-green-500 border-green-200 text-white' : step === i ? 'bg-brand-primary border-brand-primary/20 text-white' : 'bg-white border-gray-100 text-gray-400'}`}>
                                    {step > i ? <Icon name="check" className="w-4 h-4 sm:w-6 sm:h-6"/> : i}
                                </div>
                                <span className="text-[7px] sm:text-[10px] font-black uppercase tracking-widest text-neutral-500">{i === 1 ? 'Propuesta' : i === 2 ? 'Inversión' : i === 3 ? 'Acuerdo' : 'Misión'}</span>
                            </div>
                        )
                    })}
                </div>

                <div className="bg-white rounded-none sm:rounded-[3.5rem] sm:shadow-[0_40px_100px_rgba(0,0,0,0.08)] border-b sm:border border-gray-50 overflow-hidden min-h-[500px] sm:min-h-[600px] flex flex-col relative group">
                    
                    {!isSigned && step < 4 && (
                        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 flex flex-row items-center gap-3">
                             <div className="hidden sm:block bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-neutral-100 shadow-xl pointer-events-none animate-fade-in text-left max-w-[220px]">
                                <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Nota del Especialista</p>
                                <p className="text-[11px] font-bold leading-relaxed text-neutral-600">Si tienes algún cambio que hacer, usa este botón. Si no, sigue avanzando.</p>
                             </div>
                             <button onClick={() => setIsChangeModalOpen(true)} className="bg-blue-600 text-white font-black text-[10px] sm:text-xs uppercase px-4 sm:px-6 py-2 sm:py-3 rounded-full shadow-2xl border border-white/20 hover:scale-105 transition-all flex items-center gap-2 flex-shrink-0">
                                <Icon name="edit" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> Solicitar Ajuste
                             </button>
                        </div>
                    )}

                    <div className="p-5 sm:p-10 lg:p-12 space-y-6 sm:space-y-8 flex-grow">
                        {step === 1 && (
                            <div className="animate-fade-in space-y-6 sm:space-y-8">
                                <div className="border-b border-gray-100 pb-4 sm:pb-6">
                                    <span className="text-[9px] sm:text-[10px] font-black text-brand-primary uppercase tracking-[0.3em] sm:tracking-[0.4em] mb-2 block">Portafolio de Soluciones Estratégicas</span>
                                    <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-neutral-900 uppercase tracking-tighter leading-tight">PROPUESTA PARA <span className="text-brand-primary">{client.name.toUpperCase()}</span></h2>
                                    <p className="text-gray-400 font-bold mt-1 sm:mt-2 text-xs sm:text-sm uppercase tracking-widest">{client.businessDescription || 'Fase de Implementación'}</p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                                    <div className="p-5 sm:p-6 bg-neutral-50 rounded-2xl sm:rounded-[2rem] border border-neutral-100 relative overflow-hidden group/emisor">
                                        <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-brand-primary/5 rounded-full blur-2xl -mr-12 sm:-mr-16 -mt-12 sm:-mt-16 group-hover/emisor:bg-brand-primary/10 transition-colors"></div>
                                        <p className="mb-2 sm:mb-3 text-brand-primary text-[7px] sm:text-[8px]">ESPECIALISTA EMISOR:</p>
                                        <p className="text-neutral-900 text-lg sm:text-xl tracking-tighter font-black">{client.providerName?.toUpperCase()}</p>
                                        <p className="font-medium lowercase text-[10px] sm:text-xs tracking-normal text-neutral-500 mt-1">{client.issuerEmail || client.providerContact}</p>
                                        {client.issuerPhone && <p className="font-black text-brand-primary mt-2 flex items-center gap-2 text-[10px] sm:text-[11px]"><Icon name="phone" className="w-3 h-3 sm:w-3.5 sm:h-3.5"/> {client.issuerPhone}</p>}
                                    </div>
                                    <div className="p-5 sm:p-6 bg-neutral-50 rounded-2xl sm:rounded-[2rem] border border-neutral-100">
                                        <p className="mb-2 sm:mb-3 text-brand-primary text-[7px] sm:text-[8px]">RECEPTOR ESTRATÉGICO:</p>
                                        <p className="text-neutral-900 text-lg sm:text-xl tracking-tighter font-black">{client.name.toUpperCase()}</p>
                                        <p className="font-medium text-[10px] sm:text-xs tracking-normal text-neutral-500 mt-1">{client.contact}</p>
                                        <p className="text-[8px] sm:text-[9px] text-neutral-400 mt-2">ID FISCAL: {client.taxId || 'PENDIENTE'}</p>
                                    </div>
                                </div>

                                <div className="bg-white p-0.5 sm:p-1 rounded-2xl sm:rounded-[2.5rem] border border-neutral-100 shadow-inner">
                                    <div className="bg-neutral-50 p-5 sm:p-10 rounded-2xl sm:rounded-[2.4rem] leading-relaxed text-gray-800 text-base sm:text-xl font-medium prose dark:prose-invert max-w-none text-justify">
                                        {client.proposalText ? (
                                            <ChatMessageRenderer text={client.proposalText} />
                                        ) : (
                                            <div className="text-center py-20 opacity-30 italic text-sm">Propuesta en proceso de redacción estratégica...</div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="p-6 sm:p-12 bg-neutral-50 dark:bg-neutral-900/50 rounded-[2.5rem] sm:rounded-[3.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 sm:mb-10 gap-4">
                                        <div>
                                            <h4 className="font-black text-brand-primary uppercase text-[10px] sm:text-xs tracking-[0.3em] flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-brand-primary/10 rounded-lg"><Icon name="list" className="w-4 h-4"/></div>
                                                Desglose de Soluciones
                                            </h4>
                                            <p className="text-[10px] sm:text-xs text-neutral-400 font-bold uppercase tracking-widest">Inversión detallada por componente estratégico</p>
                                        </div>
                                        <div className="px-4 py-2 bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-100 dark:border-neutral-700 shadow-sm">
                                            <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block leading-none mb-1">Total Proyectado</span>
                                            <span className="text-xl sm:text-2xl font-black text-brand-primary tracking-tighter">${client.value.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                                        {client.services?.map(s => (
                                            <div key={s.id} className="flex justify-between items-center p-5 sm:p-6 bg-white dark:bg-neutral-800 rounded-2xl sm:rounded-3xl shadow-sm border border-neutral-50 dark:border-neutral-700 group hover:border-brand-primary/30 transition-all">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-neutral-900 dark:text-white uppercase text-[10px] sm:text-xs tracking-wider mb-1">{s.name}</span>
                                                    <span className="text-[8px] text-neutral-400 font-bold uppercase tracking-widest">Servicio Profesional</span>
                                                </div>
                                                <span className="font-black text-brand-primary text-base sm:text-xl tracking-tighter">${s.price.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="animate-fade-in space-y-8 sm:space-y-12">
                                <div className="border-b border-gray-100 pb-6 sm:pb-10"><h2 className="text-3xl sm:text-6xl font-black text-neutral-900 uppercase tracking-tighter leading-none">Validación de <span className="text-emerald-600">Inversión</span></h2><p className="text-gray-400 font-bold mt-2 sm:mt-4 text-base sm:text-xl uppercase tracking-widest">Documento de Valor Fiscal e Impuestos</p></div>
                                
                                <div className="bg-white p-0.5 sm:p-1 rounded-2xl sm:rounded-[2.5rem] border border-neutral-100 shadow-inner mb-6 sm:mb-8">
                                    <div className="bg-neutral-50 p-5 sm:p-10 rounded-2xl sm:rounded-3xl leading-relaxed text-gray-800 text-sm sm:text-base font-medium prose dark:prose-invert max-w-none">
                                        {client.preInvoiceText ? (
                                            <ChatMessageRenderer text={client.preInvoiceText} />
                                        ) : (
                                            <div className="space-y-6">
                                                <div className="text-center py-6 border-b border-neutral-200">
                                                    <p className="text-xs font-black text-brand-primary uppercase tracking-widest mb-1">Documento de Inversión</p>
                                                    <h3 className="text-xl font-black text-neutral-900 uppercase tracking-tighter">Desglose de Servicios y Valores</h3>
                                                </div>

                                                {/* 1. TOTAL GENERAL DESTACADO */}
                                                <div className="bg-neutral-900 text-white p-6 rounded-3xl text-center shadow-xl">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400 mb-2">Inversión Total</p>
                                                    <p className="text-4xl font-black tracking-tighter">${(client.value * (client.applyTax ? (1 + (client.taxPercentage || 15)/100) : 1)).toLocaleString()} <span className="text-sm font-medium text-neutral-500">{client.currency || 'USD'}</span></p>
                                                </div>

                                                {/* 2. TABLA DE CONCEPTOS */}
                                                <div className="space-y-3">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Conceptos Detallados</p>
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="border-b border-neutral-200">
                                                                <th className="py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">Concepto</th>
                                                                <th className="py-3 text-right text-[10px] font-black uppercase tracking-widest text-neutral-400">Valor</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {client.services && client.services.length > 0 ? (
                                                                client.services.map(s => (
                                                                    <tr key={s.id} className="border-b border-neutral-100">
                                                                        <td className="py-4 text-xs font-bold text-neutral-700 uppercase">{s.name}</td>
                                                                        <td className="py-4 text-right text-xs font-black text-neutral-900">${s.price.toLocaleString()}</td>
                                                                    </tr>
                                                                ))
                                                            ) : (
                                                                <tr className="border-b border-neutral-100">
                                                                    <td className="py-4 text-xs font-bold text-neutral-700 uppercase">Servicios Profesionales Especializados</td>
                                                                    <td className="py-4 text-right text-xs font-black text-neutral-900">${client.value.toLocaleString()}</td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* 3. TABLA DE TOTALES */}
                                                <div className="flex justify-end pt-4">
                                                    <div className="w-full max-w-[240px] space-y-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
                                                        <div className="flex justify-between text-[10px] font-bold text-neutral-400 uppercase">
                                                            <span>Subtotal</span>
                                                            <span className="text-neutral-900">${client.value.toLocaleString()}</span>
                                                        </div>
                                                        {client.applyTax && (
                                                            <div className="flex justify-between text-[10px] font-bold text-neutral-400 uppercase">
                                                                <span>IVA ({client.taxPercentage || 15}%)</span>
                                                                <span className="text-neutral-900">${(client.value * ((client.taxPercentage || 15)/100)).toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between text-sm font-black text-brand-primary uppercase border-t border-neutral-200 pt-3">
                                                            <span>Total Final</span>
                                                            <span>${(client.value * (client.applyTax ? (1 + (client.taxPercentage || 15)/100) : 1)).toLocaleString()} {client.currency || 'USD'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 4. BOX DE ANTICIPOS */}
                                                {client.enableAdvances && (
                                                    <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                                                            <Icon name="security" className="w-6 h-6"/>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Esquema de Anticipos Habilitado</p>
                                                            <div className="flex gap-6">
                                                                <div>
                                                                    <p className="text-[8px] font-bold text-emerald-800/50 uppercase">Pago Inicial ({client.advancePercentage}%)</p>
                                                                    <p className="text-lg font-black text-emerald-900">${((client.value * (client.applyTax ? (1 + (client.taxPercentage || 15)/100) : 1)) * (client.advancePercentage / 100)).toLocaleString()}</p>
                                                                </div>
                                                                <div className="w-px h-8 bg-emerald-200 self-center"></div>
                                                                <div>
                                                                    <p className="text-[8px] font-bold text-emerald-800/50 uppercase">Pago Final ({100 - (client.advancePercentage || 50)}%)</p>
                                                                    <p className="text-lg font-black text-emerald-900">${((client.value * (client.applyTax ? (1 + (client.taxPercentage || 15)/100) : 1)) * (1 - (client.advancePercentage / 100))).toLocaleString()}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-[#0a0a0a] p-6 sm:p-20 rounded-[2.5rem] sm:rounded-[4rem] text-white shadow-3xl relative overflow-hidden ring-1 ring-white/10">
                                    <div className="absolute top-0 right-0 w-64 h-64 sm:w-80 h-80 bg-emerald-500/10 rounded-full blur-[120px]"></div>
                                    <div className="relative z-10 space-y-6 sm:space-y-10">
                                        <div className="flex justify-between items-end border-b border-white/10 pb-6 sm:pb-10">
                                            <div><p className="text-[8px] sm:text-[10px] font-black text-neutral-500 uppercase tracking-[0.3em] mb-1 sm:mb-2">Subtotal Neto</p><p className="text-3xl sm:text-6xl font-black tracking-tighter">${client.value.toLocaleString()} <span className="text-sm sm:text-xl font-medium text-neutral-600">USD</span></p></div>
                                            {client.applyTax && <div className="text-right"><p className="text-[8px] sm:text-[10px] font-black text-neutral-500 uppercase tracking-[0.3em] mb-1 sm:mb-2">IVA ({client.taxPercentage || 15}%)</p><p className="text-xl sm:text-2xl font-black text-neutral-300">${(client.value * ((client.taxPercentage || 15)/100)).toLocaleString()}</p></div>}
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-[10px] sm:text-sm font-black text-emerald-500 uppercase tracking-[0.4em]">TOTAL FINAL</p>
                                            <p className="text-4xl sm:text-8xl font-black text-white tracking-tighter">${(client.value * (client.applyTax ? (1 + (client.taxPercentage || 15)/100) : 1)).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 sm:p-8 bg-amber-50 rounded-2xl sm:rounded-[2.5rem] border border-amber-100 flex flex-col sm:flex-row gap-4 sm:gap-6 items-center shadow-sm">
                                    <div className="p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl shadow-md flex-shrink-0"><Icon name="security" className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600"/></div>
                                    <div className="text-center sm:text-left"><p className="text-base sm:text-lg text-amber-800 font-black uppercase tracking-tight leading-none mb-1">Esquema de Pago Seguro</p><p className="text-xs sm:text-sm text-amber-700/80 font-medium">Tras la aprobación, se emitirá el cobro del 50% inicial para dar comienzo formal al cronograma de ejecución.</p></div>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="animate-fade-in space-y-8 sm:space-y-12">
                                <div className="border-b border-gray-100 pb-6 sm:pb-10"><h2 className="text-3xl sm:text-6xl font-black text-neutral-900 uppercase tracking-tighter leading-none">Convenio de <span className="text-blue-600">Servicios</span></h2><p className="text-gray-400 font-bold mt-2 sm:mt-4 text-base sm:text-xl uppercase tracking-widest">Protocolo Legal y Garantías del Acuerdo</p></div>
                                
                                <div className="p-5 sm:p-16 bg-neutral-50 rounded-2xl sm:rounded-[3.5rem] border border-neutral-100 shadow-inner relative">
                                    <div className="absolute top-8 right-12 opacity-10 hidden sm:block"><Icon name="security" className="w-32 h-32"/></div>
                                    <div className="max-h-[500px] sm:max-h-[600px] overflow-y-auto pr-2 sm:pr-6 custom-scrollbar font-serif text-base sm:text-lg leading-relaxed text-gray-700 text-justify">
                                        {client.contractText ? (
                                            <ChatMessageRenderer text={client.contractText} />
                                        ) : (
                                            <div className="py-20 text-center opacity-40 text-sm">Contrato en proceso de generación legal...</div>
                                        )}
                                        
                                        {isSigned ? (
                                             <div className="mt-12 sm:mt-20 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 p-6 sm:p-10 bg-green-50 border-2 sm:border-4 border-green-500 rounded-2xl sm:rounded-[3rem] shadow-2xl animate-scale-in">
                                                <div className="text-center sm:border-r border-green-200 pr-0 sm:pr-4">
                                                    <p className="text-[8px] sm:text-[10px] font-black text-green-700 uppercase tracking-[0.3em] mb-3 sm:mb-4">Firmado Digitalmente</p>
                                                    <p className="text-2xl sm:text-4xl font-serif italic text-neutral-900 border-b-2 border-green-500/30 pb-2 inline-block px-4">{client.clientRepresentative || client.name}</p>
                                                    <p className="text-[8px] sm:text-[9px] text-green-600 mt-4 sm:mt-6 uppercase font-black tracking-tighter">Validado Protocol v2.5</p>
                                                </div>
                                                <div className="text-center flex flex-col items-center justify-center">
                                                    <p className="text-[8px] sm:text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 sm:mb-4">Sello Digital Emisor</p>
                                                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-brand-primary p-2.5 sm:p-3 rounded-xl sm:rounded-2xl mb-3 sm:mb-4 shadow-lg"><Icon name="check" className="w-full h-full text-white"/></div>
                                                    <p className="text-sm sm:text-xl font-black text-neutral-900 uppercase tracking-tighter">{client.providerName}</p>
                                                </div>
                                             </div>
                                        ) : (
                                            <div className="mt-12 sm:mt-20 p-8 sm:p-12 border-2 sm:border-4 border-dashed border-neutral-200 rounded-2xl sm:rounded-[3rem] text-center bg-white/50">
                                                <Icon name="edit" className="w-12 h-12 sm:w-16 h-16 mx-auto mb-4 sm:mb-6 text-brand-primary opacity-30 animate-pulse"/>
                                                <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] sm:tracking-[0.5em] text-neutral-400">Su firma digital será estampada al confirmar</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="text-center py-12 sm:py-24 space-y-8 sm:space-y-12 animate-scale-in">
                                <div className="relative inline-block">
                                    <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-500 text-white rounded-xl sm:rounded-[1.5rem] flex items-center justify-center mx-auto shadow-[0_20px_50px_rgba(34,197,94,0.4)] relative z-10"><Icon name="check" className="w-8 h-8 sm:w-10 sm:h-10"/></div>
                                </div>
                                <div className="space-y-4 sm:space-y-6">
                                    <h2 className="text-4xl sm:text-7xl font-black uppercase text-neutral-900 tracking-tighter leading-none italic">¡Misión Iniciada!</h2>
                                    <p className="text-neutral-500 text-base sm:text-2xl max-w-2xl mx-auto font-medium leading-relaxed px-4">Hemos recibido su validación integral. El equipo de arquitectura tecnológica ha sido desplegado para su proyecto.</p>
                                </div>
                                <div className="pt-4 sm:pt-8 px-4">
                                     <button className="w-full sm:w-auto px-8 sm:px-16 py-4 sm:py-6 bg-black text-white shadow-2xl text-xs sm:text-lg font-black uppercase tracking-widest rounded-2xl sm:rounded-3xl transform hover:scale-105 transition-all flex items-center justify-center gap-3 mx-auto" onClick={handleDownloadPDF}>
                                        <Icon name="upload" className="w-5 h-5 sm:w-6 sm:h-6"/> Descargar Expediente Firmado
                                     </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-12 sm:mt-20 p-6 sm:p-16 bg-neutral-50 rounded-[2.5rem] sm:rounded-[4rem] border border-neutral-200 text-center space-y-6 sm:space-y-8 animate-fade-in">
                    <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tighter">¿Alguna consulta inmediata?</h3>
                    <p className="text-sm sm:text-base text-neutral-500 max-w-lg mx-auto px-4">Nuestro equipo está listo para asistirte. Puedes contactar directamente al especialista a cargo.</p>
                    
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-6">
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Email Directo</span>
                            <a href={`mailto:${client.issuerEmail || client.providerContact}`} className="text-base sm:text-lg font-bold text-brand-primary hover:underline">{client.issuerEmail || client.providerContact}</a>
                        </div>
                        <div className="w-px h-12 bg-neutral-200 hidden sm:block"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">WhatsApp Profesional</span>
                            <a 
                                href={`https://wa.me/${client.issuerPhone?.replace(/\+/g, '').replace(/\s/g, '')}?text=${encodeURIComponent(`Hola, estoy revisando la propuesta en el Sales Room de ${client.brandName || 'tu marca'}. Me gustaría consultar sobre...`)}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-base sm:text-lg font-bold text-brand-primary hover:underline"
                            >
                                {client.issuerPhone || "No disponible"}
                            </a>
                        </div>
                    </div>

                    <div className="pt-6 sm:pt-8 flex flex-col items-center gap-4 px-4">
                        <p className="text-xs sm:text-sm font-bold text-neutral-600">Para una comunicación encriptada y gestión de archivos:</p>
                        <Button 
                            onClick={() => window.open(`${window.location.origin}/#/onboarding`, '_blank')} 
                            className="w-full sm:w-auto bg-neutral-900 hover:bg-black text-white border-none px-8 sm:px-12 py-3 sm:py-5 rounded-2xl sm:rounded-[2rem] font-black text-sm sm:text-lg shadow-2xl transform hover:scale-[1.03] transition-all flex items-center justify-center gap-3"
                        >
                            <Icon name="message" className="w-5 h-5 sm:w-6 sm:h-6"/> Enviar Mensaje Directo en App
                        </Button>
                        <p className="text-[8px] sm:text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Inicia sesión o crea tu usuario para chatear con el especialista.</p>
                    </div>
                </div>
            </main>

            {step < 4 && (
                <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-white/95 backdrop-blur-3xl border-t border-gray-100 flex flex-col items-center z-[200] shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                    {isSigned && step === 3 ? (
                        <Button onClick={() => setStep(4)} className="w-full max-w-lg py-3 sm:py-3.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-base font-black uppercase shadow-2xl bg-green-600 text-white hover:bg-green-700 border-none transition-all">
                            Finalizar y Ver Expediente
                        </Button>
                    ) : (
                        <Button onClick={handleApproveStep} className="w-full max-w-lg py-3 sm:py-3.5 rounded-xl sm:rounded-2xl text-[10px] sm:text-sm font-black uppercase shadow-2xl shadow-brand-primary/30 transform active:scale-95 transition-all tracking-[0.15em] bg-brand-primary text-white hover:bg-brand-secondary border-none">
                            {step === 1 ? 'Acepto Propuesta Estratégica' : step === 2 ? 'Validar e Ir a Firma' : 'Firmar y Comenzar Desarrollo'}
                        </Button>
                    )}
                    <div className="mt-2 flex items-center gap-2 sm:gap-3 text-neutral-400 font-black uppercase text-[6px] sm:text-[8px] tracking-[0.3em]">
                        <Icon name="security" className="w-2 h-2 sm:w-2.5 sm:h-2.5 opacity-50"/> <span>DIGITAL TRUST VERIFIED BY GOATIFY AI</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PublicSalesRoomPage;
