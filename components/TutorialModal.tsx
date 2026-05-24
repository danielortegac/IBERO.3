import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';

interface TutorialModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const Feature: React.FC<{ icon: React.ComponentProps<typeof Icon>['name']; title: string; desc: string }> = ({ icon, title, desc }) => (
    <div className="flex items-start space-x-4">
        <Icon name={icon} className="w-8 h-8 text-brand-primary mt-1 flex-shrink-0" />
        <div>
            <h4 className="font-bold">{title}</h4>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{desc}</p>
        </div>
    </div>
);

const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-light-surface dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-lg p-8 transform animate-slide-in-up">
                <div className="text-center">
                    <Icon name="ai" className="w-16 h-16 mx-auto text-brand-secondary mb-4" />
                    <h2 className="text-2xl font-bold mb-2">{t('tutorialTitle')}</h2>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mb-8">{t('tutorialIntro')}</p>
                </div>

                <div className="space-y-6">
                    <Feature icon="dashboard" title={t('tutorialDashboard')} desc={t('tutorialDashboardDesc')} />
                    <Feature icon="projects" title={t('tutorialProjects')} desc={t('tutorialProjectsDesc')} />
                    <Feature icon="wallet" title={t('tutorialWallet')} desc={t('tutorialWalletDesc')} />
                    <Feature icon="ai" title={t('tutorialAIAssistant')} desc={t('tutorialAIAssistantDesc')} />
                </div>

                <button 
                    onClick={onClose} 
                    className="w-full mt-8 bg-brand-primary text-white font-bold py-3 rounded-lg hover:bg-brand-secondary transition-colors"
                >
                    {t('tutorialStart')}
                </button>
            </div>
        </div>
    );
};

export default TutorialModal;