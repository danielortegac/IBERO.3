
import React, { useContext, useState } from 'react';
import Icon from './Icon';
import Button from './ui/Button';
import { AppContext } from '../context/AppContext';
import PayPalWrapper from './ui/PayPalWrapper';
import { useTranslation } from '../hooks/useTranslation';

interface PremiumTrialModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Rates for display reference
const rates: Record<string, number> = {
    USD: 1, MXN: 18.5, COP: 4100,
    PEN: 3.75, ARS: 910, EUR: 0.92,
    CAD: 1.37, BRL: 5.15, CLP: 980, GTQ: 7.8,
};

const PremiumTrialModal: React.FC<PremiumTrialModalProps> = ({ isOpen, onClose }) => {
    const { updateUserProfile, currentUser, createNotification, userProfile } = useContext(AppContext);
    const { t } = useTranslation();
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [step, setStep] = useState<'offer' | 'payment'>('offer');

    if (!isOpen) return null;

    // --- COUNTRY LOGIC ---
    const isMexico = userProfile.country === 'Mexico';
    const currencyCode = isMexico ? 'MXN' : 'USD';
    const planId = isMexico 
        ? 'P-0YJ18157B2153452BNEZAD2Q'  // MX Premium Trial
        : 'P-3EP28851HB800071UNEY74JY'; // Global Premium Trial
        
    // Display Price Logic
    const userCurrency = userProfile.currency || 'USD';
    const exchangeRate = rates[userCurrency] || 1;
    
    let displayPrice = '$12.00 USD';
    
    if (isMexico) {
        displayPrice = '$240 MXN';
    } else if (userCurrency !== 'USD') {
        const localVal = 12 * exchangeRate;
        const formattedLocal = new Intl.NumberFormat(undefined, { 
            style: 'currency', 
            currency: userCurrency, 
            maximumFractionDigits: 0 
        }).format(localVal);
        displayPrice = `$12.00 USD (~ ${formattedLocal})`;
    }

    const handleTrialSuccess = async (subscriptionID: string) => {
        if (!currentUser) return;
        setIsProcessing(true);

        try {
            // Upgrade user to Premium immediately with Trial status
            await updateUserProfile(currentUser.uid, { 
                plan: 'premium',
                subscriptionStatus: 'trialing',
                subscriptionId: subscriptionID
            } as any);
            
            // Send confirmation notification
            await createNotification(currentUser.uid, {
                type: 'general',
                text: `🎉 **PRUEBA PREMIUM GRATIS**: ${t('trialStarted')}`,
                link: '/#profile',
                fromUser: {
                    uid: 'system_goatify',
                    name: 'Goatify System',
                    avatarUrl: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747'
                }
            });

            setShowSuccess(true);
        } catch (e) {
            console.error("Trial activation failed", e);
        } finally {
            setIsProcessing(false);
        }
    };

    if (showSuccess) {
        return (
            <div className="fixed inset-0 z-[12000000] flex items-center justify-center bg-black/90 p-4 animate-fade-in backdrop-blur-md" onClick={onClose}>
                <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl shadow-2xl text-center max-w-md w-full animate-scale-in relative overflow-hidden border border-white/10" onClick={e => e.stopPropagation()}>
                    <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-emerald-500/20 animate-pulse"></div>
                    <div className="relative z-10">
                        <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/50 animate-bounce">
                            <Icon name="check" className="w-10 h-10" />
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2">{t('welcomeToPremium')}</h2>
                        <p className="text-gray-600 dark:text-gray-300 mb-8">{t('trialStarted')}</p>
                        <Button onClick={onClose} className="w-full py-4 text-lg shadow-xl bg-green-600 hover:bg-green-700 text-white font-bold transform hover:scale-[1.05] transition-all">
                            {t('startExploring')}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[12000000] flex items-center justify-center bg-black/80 animate-fade-in backdrop-blur-md p-2 sm:p-4" onClick={onClose}>
            <div className="bg-white dark:bg-[#0f0f0f] w-full max-w-5xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative animate-scale-in sm:border border-white/10 max-h-[95vh] md:max-h-none" onClick={e => e.stopPropagation()}>
                
                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    className="absolute top-3 right-3 z-40 p-1.5 bg-black/20 hover:bg-black/50 rounded-full text-white transition-colors backdrop-blur-sm"
                >
                    <Icon name="close" className="w-5 h-5"/>
                </button>

                {/* Visual Side (Marketing) */}
                <div className="w-full md:w-5/12 bg-gradient-to-br from-purple-900 via-[#2E1065] to-black p-5 sm:p-10 text-white flex flex-col justify-center relative overflow-hidden flex-shrink-0">
                    {/* Background Effects */}
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30"></div>
                    <div className="absolute top-[-20%] left-[-20%] w-80 h-80 bg-brand-primary rounded-full blur-[120px] opacity-60 animate-pulse"></div>
                    
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-600 backdrop-blur-md px-3 py-1 rounded-full text-black text-[10px] font-black uppercase tracking-widest mb-4 shadow-lg transform -rotate-2">
                            <Icon name="star" className="w-3 h-3" /> {t('exclusiveOffer')}
                        </div>
                        
                        <h2 className="text-xl md:text-3xl font-black mb-1 leading-tight tracking-tight uppercase">
                            <span className="text-yellow-400">Prueba nuestros</span> <br/>
                            <span className="text-yellow-400">Vendedores IA Gratis</span>
                            <br/>
                            <span className="text-lg md:text-2xl text-neutral-100">& Genera ingresos Extra</span>
                        </h2>
                        <p className="text-sm md:text-lg text-purple-200 font-medium mb-4 sm:mb-8">Ecosistema de Élite para Crecimiento Masivo</p>

                        <div className="space-y-3 sm:space-y-6">
                            <div className="flex gap-3 items-center group">
                                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/20 shadow-inner group-hover:scale-110 transition-transform">
                                    <Icon name="agent" className="w-5 h-5 text-amber-400"/>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm sm:text-lg leading-none mb-1">Vendedores IA GRATIS</h4>
                                    <p className="text-[10px] sm:text-xs text-gray-300 leading-tight">Prueba el poder de los agentes digitales 24/7 sin costo.</p>
                                </div>
                            </div>
                            
                            <div className="flex gap-3 items-center group">
                                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/20 shadow-inner group-hover:scale-110 transition-transform">
                                    <Icon name="partners" className="w-5 h-5 text-pink-400"/>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm sm:text-lg leading-none mb-1">Programa de Socios</h4>
                                    <p className="text-[10px] sm:text-xs text-gray-300 leading-tight">Genera ingresos extra compartiendo tecnología.</p>
                                </div>
                            </div>
                            
                            <div className="flex gap-3 items-center group">
                                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/20 shadow-inner group-hover:scale-110 transition-transform">
                                    <Icon name="rocket" className="w-10 h-10 text-green-400"/>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm sm:text-lg leading-none mb-1">Sube de nivel</h4>
                                    <p className="text-[10px] sm:text-xs text-gray-300 leading-tight">Sin límites de proyectos ni generación de contenido.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Side (Sales) */}
                <div className="w-full md:w-7/12 p-5 md:p-12 bg-white dark:bg-[#0a0a0a] flex flex-col justify-center relative flex-grow overflow-hidden">
                    
                    <div className="text-center mb-4 sm:mb-8">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em] mb-1">{t('premiumAllInOne')}</p>
                        <div className="flex items-center justify-center gap-3 mb-1">
                             <span className="text-xl text-gray-400 line-through font-bold decoration-red-500">{displayPrice}</span>
                             <span className="text-5xl md:text-7xl font-black text-neutral-900 dark:text-white tracking-tighter">$0</span>
                        </div>
                        <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide bg-green-100 dark:bg-green-900/30 px-3 py-0.5 rounded-full inline-block">{t('todayNothing')}</p>
                    </div>

                    {step === 'offer' ? (
                        <div className="space-y-4 animate-fade-in">
                             <button 
                                onClick={() => setStep('payment')}
                                className="w-full py-4 sm:py-5 rounded-xl text-lg sm:text-xl font-black text-white shadow-[0_10px_40px_rgba(124,58,237,0.5)] bg-gradient-to-r from-brand-primary via-purple-600 to-pink-600 hover:to-purple-700 transform hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group relative overflow-hidden"
                             >
                                 <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out"></div>
                                 <span>SÍ, QUIERO LA OPORTUNIDAD</span>
                                 <Icon name="arrowRight" className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1 transition-transform" />
                             </button>
                             
                             <p className="text-[9px] text-center text-gray-400 leading-tight">
                                 {t('trialDisclaimer')}
                             </p>
                        </div>
                    ) : (
                        <div className="w-full animate-slide-in-right overflow-y-auto custom-scrollbar">
                            <div className="text-center mb-4">
                                <div className="inline-flex items-center gap-2 text-green-600 bg-green-100 dark:bg-green-900/20 px-3 py-1 rounded-full text-[10px] font-bold mb-2 border border-green-200 dark:border-green-800">
                                    <Icon name="lock" className="w-3 h-3"/> {t('secureActivation')}
                                </div>
                                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{t('wontCharge')}</p>
                            </div>

                            {isProcessing ? (
                                <div className="flex flex-col items-center justify-center py-6">
                                    <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                                    <p className="text-brand-primary text-sm font-bold animate-pulse">{t('configuringPremium')}</p>
                                </div>
                            ) : (
                                <div className="relative z-10 px-2">
                                    <PayPalWrapper 
                                        planId={planId} 
                                        currency={currencyCode}
                                        onSuccess={handleTrialSuccess} 
                                        onError={(err) => console.error(err)} 
                                    />
                                    <button 
                                        onClick={() => setStep('offer')} 
                                        className="w-full mt-4 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-medium flex items-center justify-center gap-1 transition-colors"
                                    >
                                        <Icon name="chevronLeft" className="w-3 h-3"/> {t('back')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PremiumTrialModal;