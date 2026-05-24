
import React, { useState, useContext, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import Icon from './Icon';
import type { UserProfile } from '../types';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';

interface DirectMessageModalProps {
    isOpen: boolean;
    onClose: () => void;
    recipient: UserProfile;
    initialMessage?: string;
}

const DirectMessageModal: React.FC<DirectMessageModalProps> = ({ isOpen, onClose, recipient, initialMessage = '' }) => {
    const { t } = useTranslation();
    const { sendDirectMessage, currentUser, isUserBlocked, setToastNotification, setProModalOpen } = useContext(AppContext);
    const [message, setMessage] = useState(initialMessage);
    const [files, setFiles] = useState<File[]>([]);
    const [isSending, setIsSending] = useState(false);
    const blocked = isUserBlocked(recipient.uid);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSend = async () => {
        if (blocked) return;
        if (!message.trim() && files.length === 0) return;
        setIsSending(true);

        try {
            let firstFilePayload = undefined;
            const remainingFiles = [...files];

            // Handle first file attachment for the main message
            if (remainingFiles.length > 0) {
                 const firstFile = remainingFiles.shift();
                 if (firstFile && currentUser) {
                     const { url: downloadUrl } = await uploadWithQuotaCheck({
                         userId: currentUser.uid,
                         data: firstFile,
                         sizeBytes: firstFile.size,
                         path: safeStoragePath('direct-messages', currentUser.uid, `${Date.now()}_${firstFile.name}`),
                         metadata: { contentType: firstFile.type || 'application/octet-stream' }
                     });
                     firstFilePayload = { name: firstFile.name, type: firstFile.type, url: downloadUrl };
                 }
            }

            // Send main message
            if (message.trim() || firstFilePayload) {
                await sendDirectMessage(recipient, message, firstFilePayload);
            }

            // Send remaining files as separate messages
            for (const file of remainingFiles) {
                if (currentUser) {
                    const { url: downloadUrl } = await uploadWithQuotaCheck({
                        userId: currentUser.uid,
                        data: file,
                        sizeBytes: file.size,
                        path: safeStoragePath('direct-messages', currentUser.uid, `${Date.now()}_${file.name}`),
                        metadata: { contentType: file.type || 'application/octet-stream' }
                    });
                    const filePayload = { name: file.name, type: file.type, url: downloadUrl };
                    await sendDirectMessage(recipient, '', filePayload);
                }
            }

            onClose();
            setMessage('');
            setFiles([]);
        } catch (error: any) {
            console.error("Failed to send DM", error);
            if (error?.code === 'PLAN_LIMIT_REACHED') {
                setProModalOpen?.(true);
                setToastNotification?.({ title: 'Espacio insuficiente', message: error.message || 'Sube de plan para enviar más archivos.', icon: 'lock' });
            } else {
                setToastNotification?.({ title: 'No se pudo enviar', message: 'Revisa tu conexión o intenta de nuevo.', icon: 'close' });
            }
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Message to ${recipient.name}`}>
            <div className="space-y-4">
                {blocked && <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-xs font-bold">Esta conversación está bloqueada por privacidad.</div>}
                <Textarea 
                    value={message} 
                    onChange={e => setMessage(e.target.value)}
                    disabled={blocked} 
                    placeholder={blocked ? "Interacción bloqueada" : "Write a message..."} 
                    rows={4}
                    autoFocus
                />
                
                {files.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {files.map((file, i) => (
                            <div key={i} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs">
                                <span className="truncate max-w-[150px]">{file.name}</span>
                                <button onClick={() => removeFile(i)}><Icon name="close" className="w-3 h-3"/></button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                        <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title="Attach files">
                            <Icon name="upload" className="w-5 h-5" />
                        </Button>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSend} disabled={isSending || (!message.trim() && files.length === 0)}>
                            {isSending ? 'Sending...' : 'Send'}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default DirectMessageModal;
