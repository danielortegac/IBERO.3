
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import Button from './Button';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
    noPadding?: boolean;
    zIndex?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className = '', noPadding = false, zIndex = 'z-[10000000]' }) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (isOpen) {
            // Prevenir scroll en el fondo cuando el modal está abierto
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen || !mounted) return null;

    const modalContent = (
        <div 
            className={`fixed inset-0 bg-black/60 flex items-center justify-center ${zIndex} p-4 animate-fade-in backdrop-blur-sm`}
            onClick={onClose}
        >
            <div 
                className={`bg-light-surface dark:bg-dark-surface rounded-2xl shadow-2xl w-full ${className.includes('max-w-') ? '' : 'max-w-lg'} transform animate-scale-in flex flex-col max-h-[90vh] ${className}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
                    <h3 className="text-xl font-bold">{title}</h3>
                    <Button onClick={onClose} variant="ghost" size="sm" className="!p-1">
                        <Icon name="close" />
                    </Button>
                </div>
                <div className={noPadding ? "flex-1 flex flex-col min-h-0 overflow-hidden" : "p-6 overflow-y-auto custom-scrollbar"}>
                    {children}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default Modal;
