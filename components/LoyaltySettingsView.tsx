import React, { useState, useEffect, useContext } from 'react';
import { Project, LoyaltyClaim, LoyaltyConfig } from '../types';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import Button from './ui/Button';
import Input from './ui/Input';
import Card from './ui/Card';
import { collection, query, where, onSnapshot, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface LoyaltySettingsViewProps {
    project: Project;
}

interface LoyaltyUser {
    email: string;
    totalVisits: number;
    approvedVisits: number;
    pendingVisits: number;
    rejectedVisits: number;
    rewardsRedeemed: number;
    lastVisit: string;
}

const LoyaltySettingsView: React.FC<LoyaltySettingsViewProps> = ({ project }) => {
    const { updateProject, setToastNotification, setCurrentView, setMailDraft } = useContext(AppContext);
    const [claims, setClaims] = useState<LoyaltyClaim[]>([]);
    const [loadingClaims, setLoadingClaims] = useState(true);
    
    // Config state
    const [enabled, setEnabled] = useState(project.publicLinkConfig?.loyaltyProgram?.enabled ?? project.loyaltyConfig?.enabled ?? false);
    const [targetVisits, setTargetVisits] = useState(project.publicLinkConfig?.loyaltyProgram?.requiredVisits || project.loyaltyConfig?.targetVisits || 10);
    const [rewardName, setRewardName] = useState(project.publicLinkConfig?.loyaltyProgram?.rewardName || project.loyaltyConfig?.rewardName || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const q = query(
            collection(db, 'loyaltyClaims'),
            where('projectId', '==', project.id),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const claimsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as LoyaltyClaim[];
            setClaims(claimsData);
            setLoadingClaims(false);
        }, (error) => {
            console.error("Error listening to claims:", error);
            setLoadingClaims(false);
        });

        return () => unsubscribe();
    }, [project.id]);

    const handleSaveConfig = async () => {
        setIsSaving(true);
        try {
            const config: LoyaltyConfig = {
                enabled,
                targetVisits,
                rewardName
            };
            
            // Sync with Public Link Config if it exists
            const updates: Partial<Project> = { loyaltyConfig: config };
            
            if (project.publicLinkConfig) {
                updates.publicLinkConfig = {
                    ...project.publicLinkConfig,
                    loyaltyProgram: {
                        enabled,
                        rewardName,
                        requiredVisits: targetVisits,
                        icon: project.publicLinkConfig.loyaltyProgram?.icon || 'coffee'
                    }
                };
            }

            await updateProject(project.id, updates);
            setToastNotification({ title: 'Configuración Guardada', message: 'El programa de fidelización ha sido actualizado y sincronizado.', icon: 'check' });
        } catch (error) {
            console.error("Error saving loyalty config:", error);
            setToastNotification({ title: 'Error', message: 'No se pudo guardar la configuración.', icon: 'close' });
        } finally {
            setIsSaving(false);
        }
    };

    // Calculate unique users database
    const groupedUsers = claims.reduce((acc, claim) => {
        if (!acc[claim.userEmail]) {
            acc[claim.userEmail] = {
                email: claim.userEmail,
                totalVisits: 0,
                approvedVisits: 0,
                pendingVisits: 0,
                rejectedVisits: 0,
                rewardsRedeemed: 0,
                lastVisit: claim.createdAt
            };
        }
        
        acc[claim.userEmail].totalVisits++;
        
        if (claim.status === 'approved') acc[claim.userEmail].approvedVisits++;
        else if (claim.status === 'pending') acc[claim.userEmail].pendingVisits++;
        else if (claim.status === 'rejected') acc[claim.userEmail].rejectedVisits++;

        if (claim.redeemed) acc[claim.userEmail].rewardsRedeemed++;

        // Update last visit if more recent (assuming claims are ordered desc, first one seen is latest)
        if (new Date(claim.createdAt) > new Date(acc[claim.userEmail].lastVisit)) {
            acc[claim.userEmail].lastVisit = claim.createdAt;
        }

        return acc;
    }, {} as Record<string, LoyaltyUser>);

    const loyaltyDatabase: LoyaltyUser[] = (Object.values(groupedUsers) as LoyaltyUser[]).sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime());

    const formatEmailHtml = (user: LoyaltyUser) => {
        const progressPercentage = Math.min((user.approvedVisits / targetVisits) * 100, 100);
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        .email-container { width: 100% !important; max-width: 850px !important; }
    </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc;">
<div class="email-container" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 850px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0; box-sizing: border-box;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 40px 20px; text-align: center; box-sizing: border-box;">
    <div style="display: inline-block; background: rgba(255, 255, 255, 0.1); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 1.5px; border: 1px solid rgba(56, 189, 248, 0.3); margin-bottom: 20px;">
      Estado de Fidelización
    </div>
    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; line-height: 1.3; letter-spacing: -0.5px;">
      Resumen de tu cuenta
    </h1>
    <p style="margin: 15px 0 0 0; color: #cbd5e1; font-size: 16px; font-weight: 500;">
      En el programa de ${project.name}
    </p>
  </div>

  <!-- Content Body -->
  <div style="padding: 40px 20px; background-color: #ffffff; box-sizing: border-box;">
    <p style="font-size: 16px; color: #334155; line-height: 1.8; margin-bottom: 30px;">Hola <strong>${user.email}</strong>,</p>
    
    <p style="font-size: 16px; color: #334155; line-height: 1.8; margin-bottom: 30px;">
      Queremos compartir contigo el estado actual de tus visitas y el progreso hacia tu recompensa.
    </p>

    <!-- Progress Indicator box -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 24px 16px; border-radius: 12px; margin-bottom: 30px; box-sizing: border-box;">
       <div style="display: flex; justify-content: space-between; margin-bottom: 12px; align-items: flex-end;">
         <span style="font-size: 14px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Tu Progreso</span>
         <span style="font-size: 24px; font-weight: 900; color: #0f172a;">${user.approvedVisits} <span style="font-size: 14px; color: #94a3b8; font-weight: 600;">/ ${targetVisits}</span></span>
       </div>
       <div style="width: 100%; height: 12px; background-color: #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 15px;">
          <div style="width: ${progressPercentage}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); border-radius: 6px;"></div>
       </div>
       <p style="margin: 0; color: #64748b; font-size: 14px; text-align: center;">
         Siguiente recompensa: <strong>${rewardName}</strong>
       </p>
    </div>

    <!-- Data grid -->
    <div style="display: table; width: 100%; border-collapse: separate; border-spacing: 8px 0; margin-bottom: 35px; box-sizing: border-box;">
        <div style="display: table-cell; width: 50%; background-color: #f1f5f9; padding: 16px 8px; border-radius: 8px; text-align: center; box-sizing: border-box;">
             <p style="margin: 0 0 5px 0; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase;">Visitas Pendientes</p>
             <p style="margin: 0; color: #f59e0b; font-size: 22px; font-weight: 900;">${user.pendingVisits}</p>
        </div>
        <div style="display: table-cell; width: 50%; background-color: #f1f5f9; padding: 16px 8px; border-radius: 8px; text-align: center; box-sizing: border-box;">
             <p style="margin: 0 0 5px 0; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase;">Premios Cobrados</p>
             <p style="margin: 0; color: #10b981; font-size: 22px; font-weight: 900;">${user.rewardsRedeemed}</p>
        </div>
    </div>

    <!-- Call to Action -->
    <div style="text-align: center; margin-bottom: 10px;">
      <a href="https://ia.goatify.app/p/${project.id}" style="display: inline-block; padding: 16px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2), 0 2px 4px -1px rgba(37, 99, 235, 0.1); transition: all 0.2s;">
        Reservar otra visita
      </a>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding: 24px 20px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e2e8f0; box-sizing: border-box;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0; font-weight: 500;">© 2026 ${project.name} - Estructurado con Goatify</p>
  </div>
</div>
</body>
</html>`;
    };

    const handleSendStatusEmail = (user: LoyaltyUser) => {
        setMailDraft({
            to: user.email,
            bcc: '',
            subject: `Actualización: Tu estado de Fidelización en ${project.name}`,
            htmlBody: formatEmailHtml(user)
        });
        setCurrentView('mail');
        window.location.hash = 'mail';
    };

    const handleDeleteUser = async (userEmail: string) => {
        if (!confirm(`¿Estás seguro de que quieres eliminar todo el progreso y visitas de fidelización de ${userEmail}?`)) return;
        
        try {
            const userClaims = claims.filter(c => c.userEmail === userEmail);
            const batchPromises = userClaims.map(claim => deleteDoc(doc(db, 'loyaltyClaims', claim.id)));
            await Promise.all(batchPromises);
            setToastNotification({ title: 'Usuario Eliminado', message: `El progreso de ${userEmail} ha sido borrado exitosamente.`, icon: 'check' });
        } catch (error) {
            console.error("Error deleting user claims:", error);
            setToastNotification({ title: 'Error', message: 'No se pudo eliminar el progreso del usuario.', icon: 'close' });
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-8">
            <div className="flex justify-between items-center bg-white dark:bg-dark-surface p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm">
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter">Programa de Fidelización</h2>
                    <p className="text-sm text-neutral-500 mt-1">Configura las reglas del programa y visualiza la base de clientes fidelizados.</p>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${enabled ? 'bg-brand-primary text-white shadow-brand-primary/30' : 'bg-neutral-200 text-neutral-500'}`}>
                    <Icon name="star" className="w-6 h-6" />
                </div>
            </div>

            {/* Configuración */}
            <Card className="p-8 space-y-8 border shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                
                <h3 className="text-sm font-black uppercase tracking-widest text-brand-primary flex items-center gap-2">
                    <Icon name="settings" className="w-4 h-4" />
                    Reglas del Programa
                </h3>

                <div className="flex items-center justify-between p-5 bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-sm relative z-10">
                    <div className="flex items-center gap-4">
                        <div>
                            <h3 className="font-bold text-sm">Estado del Programa</h3>
                            <p className="text-xs text-neutral-500">{enabled ? 'Activo (usuarios pueden registrar visitas en tu link público)' : 'Desactivado (oculto en el link público)'}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setEnabled(!enabled)}
                        className={`w-14 h-8 rounded-full transition-colors relative shadow-inner ${enabled ? 'bg-brand-primary' : 'bg-neutral-300 dark:bg-neutral-600'}`}
                    >
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow ${enabled ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Visitas Mínimas para Recompensa</label>
                        <Input 
                            type="number" 
                            value={targetVisits} 
                            onChange={e => setTargetVisits(parseInt(e.target.value) || 1)}
                            placeholder="Ej: 10"
                            className="text-lg font-bold py-3 bg-neutral-50 dark:bg-neutral-800/50"
                        />
                        <p className="text-[10px] text-neutral-400 ml-1">Número de visitas que el cliente debe registrar para ganar.</p>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Nombre de la Recompensa</label>
                        <Input 
                            value={rewardName} 
                            onChange={e => setRewardName(e.target.value)}
                            placeholder="Ej: Café Gratis, 20% Descuento..."
                            className="text-lg font-bold py-3 bg-neutral-50 dark:bg-neutral-800/50"
                        />
                        <p className="text-[10px] text-neutral-400 ml-1">Lo que el cliente recibirá al completar su tarjeta de fidelización.</p>
                    </div>
                </div>

                <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800 flex justify-end items-center gap-4 relative z-10">
                    <Button 
                        onClick={handleSaveConfig} 
                        isLoading={isSaving}
                        className="px-10 py-3.5 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-brand-primary/20 w-full md:w-auto"
                    >
                        Guardar Configuración
                    </Button>
                </div>
            </Card>

            {/* Base de Datos de Clientes */}
            <Card className="p-8 space-y-6 shadow-md border-t-8 border-t-brand-primary">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-neutral-800 dark:text-neutral-100">
                            Base de Datos de Clientes
                        </h3>
                        <p className="text-sm text-neutral-500 mt-1">Cuentas que han solicitado o registrado fidelización.</p>
                    </div>
                    <div className="bg-brand-primary/10 text-brand-primary px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                        <Icon name="user" className="w-4 h-4" />
                        {loyaltyDatabase.length} Cuentas
                    </div>
                </div>

                {loadingClaims ? (
                    <div className="py-12 flex justify-center">
                        <Icon name="sync" className="w-8 h-8 text-neutral-300 animate-spin" />
                    </div>
                ) : loyaltyDatabase.length === 0 ? (
                    <div className="py-12 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-2xl">
                        <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="star" className="w-8 h-8 text-neutral-400" />
                        </div>
                        <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">No hay clientes registrados aún</p>
                        <p className="text-neutral-400 text-xs mt-2">Comparte tu link público para empezar a fidelizar.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b-2 border-neutral-100 dark:border-neutral-800">
                                    <th className="pb-4 pt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Usuario</th>
                                    <th className="pb-4 pt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 text-center">Aprobadas / Meta</th>
                                    <th className="pb-4 pt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 text-center hidden md:table-cell">Pendientes</th>
                                    <th className="pb-4 pt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 text-center hidden sm:table-cell">Premios</th>
                                    <th className="pb-4 pt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                {loyaltyDatabase.map(user => {
                                    const isComplete = user.approvedVisits >= targetVisits;
                                    return (
                                        <tr key={user.email} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group">
                                            <td className="py-4 font-bold text-sm text-neutral-800 dark:text-neutral-200">
                                                <div className="flex flex-col">
                                                    <span>{user.email}</span>
                                                    <span className="text-[10px] text-neutral-400 font-normal uppercase tracking-wider mt-1">Última act. {new Date(user.lastVisit).toLocaleDateString()}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className={`text-lg font-black ${isComplete ? 'text-green-500' : 'text-neutral-700 dark:text-neutral-300'}`}>
                                                        {user.approvedVisits} <span className="text-xs text-neutral-400 font-normal">/ {targetVisits}</span>
                                                    </span>
                                                    {/* Progress bar */}
                                                    <div className="w-20 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full mt-1 overflow-hidden">
                                                        <div 
                                                            className={`h-full ${isComplete ? 'bg-green-500' : 'bg-brand-primary'}`} 
                                                            style={{ width: `${Math.min((user.approvedVisits / targetVisits) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 text-center hidden md:table-cell">
                                                {user.pendingVisits > 0 ? (
                                                    <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">
                                                        {user.pendingVisits}
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-300">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 text-center hidden sm:table-cell">
                                                {user.rewardsRedeemed > 0 ? (
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center justify-center w-max mx-auto gap-1">
                                                        <Icon name="star" className="w-3 h-3" /> {user.rewardsRedeemed}
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-300">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 text-right">
                                                <div className="flex justify-end items-center gap-2">
                                                    <Button 
                                                        onClick={() => handleSendStatusEmail(user)}
                                                        variant="secondary"
                                                        className="bg-neutral-100 hover:bg-brand-primary hover:text-white dark:bg-neutral-800 dark:hover:bg-brand-primary transition-all text-xs px-3 py-1.5 rounded-lg opacity-80 group-hover:opacity-100 shadow-sm"
                                                    >
                                                        <Icon name="mail" className="w-3 h-3 mr-1.5 inline" />
                                                        Enviar Correo
                                                    </Button>
                                                    <button 
                                                        onClick={() => handleDeleteUser(user.email)}
                                                        className="p-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Eliminar progreso del usuario"
                                                    >
                                                        <Icon name="trash" className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default LoyaltySettingsView;
