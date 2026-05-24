
import { db } from '../firebaseConfig';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { PartnerLead, ClientActivity, ClientChangeRequest, SUPER_ADMIN_EMAILS } from '../types';

export const handlePublicSiteMessage = async (event: MessageEvent, siteData: any) => {
    if (event.data?.type === 'CLIENT_SITE_FINAL_APPROVAL') {
        const { leadId, signature } = event.data;
        try {
            const leadRef = doc(db, 'partnerLeads', leadId);
            const leadSnap = await getDoc(leadRef);
            if (!leadSnap.exists()) return;
            
            const lead = leadSnap.data() as PartnerLead;
            const activity: ClientActivity = {
                id: `act-sign-${Date.now()}`,
                type: 'system',
                text: `Sales Room: Contrato Firmado Digitalmente por "${signature || lead.clientName}"`,
                date: new Date().toISOString()
            };

            await updateDoc(leadRef, { 
                status: 'won', 
                paid: true, 
                contractSigned: true, 
                proposalApproved: true,
                preInvoicePaid: true,
                activityFeed: arrayUnion(activity),
                clientRepresentative: signature || lead.clientName
            } as any);

            const adminQuery = query(collection(db, "users"), where("email", "in", SUPER_ADMIN_EMAILS));
            const adminSnap = await getDocs(adminQuery);
            let targetAdminUid = siteData.ownerId; 
            if (!adminSnap.empty) { targetAdminUid = adminSnap.docs[0].id; }

            await addDoc(collection(db, 'projects'), {
                name: `${lead.clientName} - Implementación (GANADO)`,
                ownerId: targetAdminUid,
                memberIds: [targetAdminUid, lead.partnerId], 
                members: [],
                folders: [{ id: 'general', name: 'General', tasks: [
                    { id: `task-kickoff-${Date.now()}`, title: 'Sesión de Kickoff con: ' + lead.clientName, status: 'Por Hacer', date: new Date().toISOString().split('T')[0] },
                    { id: `task-setup-${Date.now()}`, title: 'Configuración de Entorno IA', status: 'Por Hacer', date: new Date().toISOString().split('T')[0] }
                ] }],
                documents: [], notes: [], drawings: [], chats: [], spreadsheets: [],
                finances: { income: lead.finalValue || lead.estimatedValue, expenses: 0, transactions: [], adn: 'business', fiscalCountry: 'OTHER' },
                statuses: [
                    { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true },
                    { id: 'status-inprogress', name: 'En Pregreso', color: '#3B82F6', isFixed: true },
                    { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true }
                ],
                clients: [], createdAt: new Date().toISOString()
            });

            await addDoc(collection(db, `users/${siteData.ownerId}/notifications`), {
                type: 'general',
                text: `🎉 **¡VENTA CERRADA!** El cliente **${lead.clientName}** ha firmado. Se ha creado el proyecto de seguimiento.`,
                timestamp: new Date().toISOString(),
                read: false,
                link: '/#partners'
            });

            if (targetAdminUid !== siteData.ownerId) {
                await addDoc(collection(db, `users/${targetAdminUid}/notifications`), {
                    type: 'general',
                    text: `💰 **NUEVO PROYECTO GANADO**: El cliente **${lead.clientName}** (vía Socio: ${lead.partnerName}) ha firmado. Revisa Proyectos.`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    link: '/#projects'
                });
            }
        } catch (e) { console.error(e); }
    }

    if (event.data?.type === 'LEAD_CHANGE_REQUEST_STATUS') {
        const { leadId, section, approved } = event.data;
        try {
            const leadRef = doc(db, 'partnerLeads', leadId);
            const updateObj: any = {};
            if (section === 'Estrategia') updateObj.proposalApproved = approved;
            if (section === 'Prefactura') updateObj.preInvoicePaid = approved;
            await updateDoc(leadRef, updateObj);
        } catch (e) { console.error(e); }
    }

    if (event.data?.type === 'LEAD_CHANGE_REQUEST') {
        const { leadId, section, comment } = event.data;
        try {
            const leadRef = doc(db, 'partnerLeads', leadId);
            const newRequest: ClientChangeRequest = {
                id: `req-${Date.now()}`,
                section, description: comment, date: new Date().toISOString(), status: 'pending'
            };
            const updateObj: any = { 
                changeRequests: arrayUnion(newRequest),
                clientSiteUrl: null 
            };
            if (section === 'Estrategia') updateObj.proposalApproved = false;
            if (section === 'Prefactura') updateObj.preInvoicePaid = false;
            if (section === 'Contrato') updateObj.contractSigned = false;
            await updateDoc(leadRef, updateObj);
            await addDoc(collection(db, `users/${siteData.ownerId}/notifications`), {
                type: 'general',
                text: `🔔 **AJUSTE SOLICITADO:** El cliente solicita un cambio en **${section}**: "${comment.substring(0, 30)}..."`,
                timestamp: new Date().toISOString(),
                read: false,
                link: '/#partners'
            });
        } catch (e) { console.error(e); }
    }

    if (event.data?.type === 'TALK_TO_AGENT') {
        try {
            const adminQuery = query(collection(db, "users"), where("email", "in", SUPER_ADMIN_EMAILS));
            const adminSnap = await getDocs(adminQuery);
            if (!adminSnap.empty) {
                const adminUid = adminSnap.docs[0].id;
                const { leadId } = event.data;
                const leadSnap = await getDoc(doc(db, 'partnerLeads', leadId));
                const leadName = leadSnap.exists() ? leadSnap.data().clientName : "propuesta";
                const autoMsg = encodeURIComponent(`Hola, acabo de revisar la Sales Room de ${leadName} y me gustaría hablar directamente con un especialista de Goatify.`);
                window.open(`https://ia.goatify.app/#hub/messages/${adminUid}?msg=${autoMsg}`, '_blank');
            }
        } catch (e) { console.error(e); }
    }
};
