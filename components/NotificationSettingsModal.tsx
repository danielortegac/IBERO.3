
import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import type { NotificationSettings } from '../types';
import Modal from './ui/Modal';
import Button from './ui/Button';

interface NotificationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingToggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
    <div className="flex items-center justify-between p-3 bg-light-bg dark:bg-dark-bg rounded-lg">
        <label htmlFor={`toggle-${label}`} className="font-medium">{label}</label>
        <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
            <input 
                type="checkbox" 
                name={`toggle-${label}`}
                id={`toggle-${label}`}
                checked={checked}
                onChange={e => onChange(e.target.checked)}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
            />
            <label htmlFor={`toggle-${label}`} className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 dark:bg-gray-600 cursor-pointer"></label>
        </div>
    </div>
);

const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({ isOpen, onClose }) => {
    const { userProfile, updateUserProfile, currentUser } = useContext(AppContext);
    
    const [settings, setSettings] = useState<NotificationSettings>({
        likes: true,
        comments: true,
        groupPosts: true,
        projectInvites: true,
        projectUpdates: true,
        newJobs: true,
        newMessages: true,
        taskDue: true,
        general: true,
        ai_task_complete: true,
        newsAlerts: true,
        agentMessages: true,
        ...userProfile.notificationSettings,
    });
    
    useEffect(() => {
        setSettings({
            likes: true,
            comments: true,
            groupPosts: true,
            projectInvites: true,
            projectUpdates: true,
            newJobs: true,
            newMessages: true,
            taskDue: true,
            general: true,
            ai_task_complete: true,
            newsAlerts: true,
            agentMessages: true,
            ...userProfile.notificationSettings,
        });
    }, [userProfile.notificationSettings, isOpen]);

    const handleSave = () => {
        if (currentUser) {
            updateUserProfile(currentUser.uid, { notificationSettings: settings });
        }
        onClose();
    };

    const handleSettingChange = (key: keyof NotificationSettings, value: boolean) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Configuración de Notificaciones">
            <style>{`
                .toggle-checkbox:checked { right: 0; border-color: #4c1d95; }
                .toggle-checkbox:checked + .toggle-label { background-color: #4c1d95; }
            `}</style>
            <div className="space-y-4">
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Elige qué notificaciones deseas recibir.</p>
                <SettingToggle label="Me gusta en publicaciones" checked={settings.likes} onChange={v => handleSettingChange('likes', v)} />
                <SettingToggle label="Comentarios" checked={settings.comments} onChange={v => handleSettingChange('comments', v)} />
                <SettingToggle label="Actividad en Grupos" checked={settings.groupPosts} onChange={v => handleSettingChange('groupPosts', v)} />
                <SettingToggle label="Invitaciones a Proyectos" checked={settings.projectInvites} onChange={v => handleSettingChange('projectInvites', v)} />
                <SettingToggle label="Actualizaciones de Proyectos" checked={settings.projectUpdates} onChange={v => handleSettingChange('projectUpdates', v)} />
                <SettingToggle label="Nuevos Mensajes Directos" checked={settings.newMessages} onChange={v => handleSettingChange('newMessages', v)} />
                <SettingToggle label="Mensajes de Agentes IA" checked={settings.agentMessages} onChange={v => handleSettingChange('agentMessages', v)} />
                <SettingToggle label="Tareas Vencidas" checked={settings.taskDue} onChange={v => handleSettingChange('taskDue', v)} />
                <SettingToggle label="Tareas IA Completadas" checked={settings.ai_task_complete} onChange={v => handleSettingChange('ai_task_complete', v)} />
                <SettingToggle label="Alertas de Noticias" checked={settings.newsAlerts} onChange={v => handleSettingChange('newsAlerts', v)} />
                <SettingToggle label="Sistema y General" checked={settings.general} onChange={v => handleSettingChange('general', v)} />
                <div className="flex justify-end pt-4">
                    <Button onClick={handleSave}>Guardar Cambios</Button>
                </div>
            </div>
        </Modal>
    );
};

export default NotificationSettingsModal;
