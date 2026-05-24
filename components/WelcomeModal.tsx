
import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Icon from './Icon';
import { useTranslation } from '../hooks/useTranslation';

interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
    const { setIsManualOpen } = useContext(AppContext);
    const { t } = useTranslation();

    if (!isOpen) return null;

    const handleOpenManual = () => {
        setIsManualOpen(true);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[12000000] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
            <div className="bg-white dark:bg-[#0f0f0f] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/10 relative animate-scale-in">
                {/* Hero Banner */}
                <div className="relative h-48 bg-gradient-to-r from-[#2E1065] via-[#4C1D95] to-[#6D28D9] flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
                    <div className="absolute top-[-50%] left-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
                    <div className="absolute bottom-[-50%] right-[-10%] w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
                    
                    <div className="relative z-10 text-center flex flex-col items-center">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl mb-3 border-4 border-white/20">
                             <Icon name="goat" className="w-12 h-12 text-brand-primary"/>
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">{t('welcomeTitle')}</h1>
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 text-center">
                    <h2 className="text-xl font-bold text-neutral-800 dark:text-white mb-4">{t('welcomeSubtitle')}</h2>
                    
                    <p className="text-neutral-600 dark:text-neutral-300 mb-6 leading-relaxed text-sm sm:text-base">
                        {t('welcomeDesc')}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 text-left">
                        <div className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded-xl border border-neutral-100 dark:border-neutral-700">
                            <div className="text-brand-primary mb-2"><Icon name="brain" className="w-6 h-6"/></div>
                            <h3 className="font-bold text-sm">{t('intelligence')}</h3>
                            <p className="text-xs text-neutral-500">{t('intelligenceDesc')}</p>
                        </div>
                        <div className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded-xl border border-neutral-100 dark:border-neutral-700">
                            <div className="text-brand-primary mb-2"><Icon name="wallet" className="w-6 h-6"/></div>
                            <h3 className="font-bold text-sm">{t('economy')}</h3>
                            <p className="text-xs text-neutral-500">{t('economyDesc')}</p>
                        </div>
                        <div className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded-xl border border-neutral-100 dark:border-neutral-700">
                            <div className="text-brand-primary mb-2"><Icon name="rocket" className="w-6 h-6"/></div>
                            <h3 className="font-bold text-sm">{t('speed')}</h3>
                            <p className="text-xs text-neutral-500">{t('speedDesc')}</p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                         <Button onClick={handleOpenManual} className="w-full sm:w-auto py-3 px-6 bg-brand-primary text-white shadow-lg hover:shadow-brand-primary/40 text-base transform hover:scale-105 transition-all">
                            <Icon name="book" className="w-5 h-5"/> {t('openManual')}
                        </Button>
                        <Button onClick={onClose} variant="secondary" className="w-full sm:w-auto py-3 px-6 text-base">
                            {t('startExploring')}
                        </Button>
                    </div>
                    
                    <p className="text-xs text-neutral-400 mt-6">
                        {t('manualTip')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default WelcomeModal;