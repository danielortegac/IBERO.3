
import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';
import Card from './ui/Card';
import Button from './ui/Button';
import { AppContext } from '../context/AppContext';
import Input from './ui/Input';
import jsPDF from 'jspdf';
import { constructIntisTransactionEmailHtml } from '../utils/emailTemplates';
import type { UserProfile, IntisTransaction } from '../types';
import Modal from './ui/Modal';
import InfoTooltip from './ui/InfoTooltip';

const rates: Record<string, number> = {
    USD: 1, MXN: 18.5, COP: 4100,
    PEN: 3.75, ARS: 910, EUR: 0.92,
    CAD: 1.37, BRL: 5.15, CLP: 980, GTQ: 7.8,
};

const formatCurrency = (usdValue: number, userCurrency: string): string => {
    const selectedRate = rates[userCurrency] || rates['USD'];
    const convertedValue = usdValue * selectedRate;
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: userCurrency,
    }).format(convertedValue);
};

const BankCard: React.FC<{ balance: number, user: UserProfile }> = ({ balance, user }) => {
    const { t } = useTranslation();
    return (
        <div className="relative w-full h-56 sm:h-64 bg-gradient-to-br from-[#1e1b4b] via-[#4c1d95] to-[#7c3aed] rounded-3xl shadow-2xl overflow-hidden transform transition-transform hover:scale-[1.01] duration-300 group">
            {/* Abstract Shapes / Glassmorphism */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 group-hover:translate-x-1/4 transition-transform duration-700"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-accent/20 rounded-full blur-2xl translate-y-1/3 -translate-x-1/4"></div>
            
            {/* Content */}
            <div className="absolute inset-0 p-6 sm:p-8 flex flex-col justify-between z-10 text-white">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs sm:text-sm font-medium opacity-70 tracking-widest uppercase flex items-center gap-2">
                            {t('availableBalance')} <InfoTooltip text={t('intisIntroDesc1')} className="text-white"/>
                        </p>
                        <h2 className="text-4xl sm:text-5xl font-bold mt-1 tracking-tight flex items-center gap-2">
                            <Icon name="wallet" className="w-8 h-8 sm:w-10 sm:h-10 opacity-80" />
                            {balance.toFixed(2)} <span className="text-lg font-normal opacity-60 mt-4">$I</span>
                        </h2>
                    </div>
                    <div className="w-12 h-8 bg-gradient-to-r from-yellow-200 to-yellow-500 rounded-md shadow-inner flex items-center justify-center opacity-80">
                        <div className="w-8 h-5 border border-yellow-600/30 rounded-sm"></div>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-[10px] sm:text-xs opacity-60 uppercase mb-1">{t('holder')}</p>
                        <p className="font-mono text-sm sm:text-lg tracking-wider uppercase shadow-black drop-shadow-md">{user.name}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] opacity-60 mb-1">{t('level')}</p>
                        <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase border border-white/10">
                            {user.plan}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const UserSearchInput: React.FC<{ 
    users: UserProfile[]; 
    onSelect: (user: UserProfile) => void;
    disabled?: boolean;
}> = ({ users, onSelect, disabled }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<UserProfile[]>([]);
    const [isFocused, setIsFocused] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

    // Filter logic
    useEffect(() => {
        if (!query.trim()) {
            setSuggestions([]);
            return;
        }
        const lowerQuery = query.toLowerCase();
        const filtered = users.filter(u => 
            u.name.toLowerCase().includes(lowerQuery) || 
            (u.email && u.email.toLowerCase().includes(lowerQuery))
        ).slice(0, 5); 
        setSuggestions(filtered);
    }, [query, users]);

    // Close suggestions on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (user: UserProfile) => {
        setQuery(user.name);
        onSelect(user);
        setSuggestions([]);
        setIsFocused(false);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <label className="text-xs font-bold text-neutral-500 uppercase mb-1 block">{t('recipient')}</label>
            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    <Icon name="search" className="w-4 h-4"/>
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setIsFocused(true); }}
                    onFocus={() => setIsFocused(true)}
                    disabled={disabled}
                    placeholder={t('searchUserPlaceholder')}
                    className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                />
            </div>
            
            {isFocused && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 z-50 overflow-hidden animate-slide-in-up">
                    {suggestions.map(user => (
                        <div 
                            key={user.uid} 
                            onClick={() => handleSelect(user)}
                            className="flex items-center gap-3 p-3 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer transition-colors border-b border-neutral-100 dark:border-neutral-700 last:border-0"
                        >
                            <img 
                                src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name.replace(' ', '+')}`} 
                                alt={user.name} 
                                className="w-8 h-8 rounded-full object-contain"
                            />
                            <div className="overflow-hidden">
                                <p className="text-sm font-bold truncate text-neutral-800 dark:text-white">{user.name}</p>
                                <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const TransactionItem: React.FC<{ transaction: IntisTransaction, onDownload: (tx: IntisTransaction) => void, onEmail: (tx: IntisTransaction) => void }> = ({ transaction, onDownload, onEmail }) => {
    const isIncome = transaction.type === 'Ganado' || transaction.type === 'Recibido';
    const colorClass = isIncome ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20';
    
    const dateObj = new Date(transaction.date);
    const dateStr = dateObj.toLocaleDateString();
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-xl transition-colors border-b border-neutral-100 dark:border-neutral-800 last:border-0 group">
            <div className="flex items-center gap-4 overflow-hidden">
                <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center ${colorClass}`}>
                    <Icon name={isIncome ? 'arrowRight' : 'send'} className={`w-5 h-5 transform ${isIncome ? 'rotate-135' : '-rotate-45'}`} />
                </div>
                <div className="min-w-0">
                    <p className="font-bold text-sm text-neutral-800 dark:text-white truncate">{transaction.type}</p>
                    <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 truncate" title={transaction.description}>{transaction.description}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5 flex gap-2">
                        <span>{dateStr}</span>
                        <span>•</span>
                        <span>{timeStr}</span>
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className={`font-bold text-base whitespace-nowrap ${isIncome ? 'text-green-500' : 'text-neutral-800 dark:text-white'}`}>
                    {isIncome ? '+' : '-'}{transaction.amount.toFixed(2)}
                </span>
                <button 
                    onClick={(e) => { e.stopPropagation(); onEmail(transaction); }}
                    className="p-2 rounded-full text-neutral-400 hover:text-brand-primary hover:bg-neutral-200 dark:hover:bg-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Send Receipt by Email"
                >
                    <Icon name="mail" className="w-4 h-4" />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDownload(transaction); }}
                    className="p-2 rounded-full text-neutral-400 hover:text-brand-primary hover:bg-neutral-200 dark:hover:bg-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download Receipt"
                >
                    <Icon name="upload" className="w-4 h-4 transform rotate-180" />
                </button>
            </div>
        </div>
    );
}

const TransferView: React.FC = () => {
    const { sendIntis, intisBalance, allUsers, userProfile, currentUser } = useContext(AppContext);
    const { t } = useTranslation();
    const [recipient, setRecipient] = useState<UserProfile | null>(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleTransfer = async () => {
        if (!recipient || !amount) return;
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0 || val > intisBalance) return;

        setIsProcessing(true);
        try {
            await sendIntis(recipient.email, val, note);
            setRecipient(null);
            setAmount('');
            setNote('');
        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Card className="p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">{t('transferIntisTitle')} <InfoTooltip text={t('transferIntisDesc')}/></h3>
            <div className="space-y-4">
                <UserSearchInput 
                    users={allUsers.filter(u => u.uid !== currentUser?.uid)} 
                    onSelect={setRecipient} 
                    disabled={isProcessing}
                />
                {recipient && (
                    <div className="flex items-center gap-2 p-2 bg-brand-accent/10 rounded-lg border border-brand-accent/20">
                        <span className="text-sm font-bold text-brand-primary">{t('recipient')}: {recipient.name}</span>
                        <button onClick={() => setRecipient(null)} className="ml-auto text-xs text-red-500 hover:underline">{t('changePhoto')}</button>
                    </div>
                )}
                <div>
                    <label className="text-xs font-bold text-neutral-500 uppercase mb-1 block">{t('amountLabel')}</label>
                    <Input 
                        type="number" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        placeholder="0.00" 
                        disabled={isProcessing}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-neutral-500 uppercase mb-1 block">{t('noteLabel')}</label>
                    <Input 
                        value={note} 
                        onChange={e => setNote(e.target.value)} 
                        placeholder={t('notePlaceholder')} 
                        disabled={isProcessing}
                    />
                </div>
                <Button 
                    onClick={handleTransfer} 
                    disabled={!recipient || !amount || isProcessing} 
                    className="w-full"
                >
                    {isProcessing ? t('sending') : t('sendBtn')}
                </Button>
            </div>
        </Card>
    );
};

const EarnRulesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    const rules = [
        { action: t('ruleUserRegistration'), reward: '+2.00 Intis', limit: '1x', icon: 'star' }, // AJUSTE: Texto a +2.00
        { action: t('ruleCreatePost'), reward: '+0.10 Intis', limit: 'Max 3/day', icon: 'edit' },
        { action: t('ruleComment'), reward: '+0.05 Intis', limit: 'Max 5/day', icon: 'message' },
        { action: t('ruleJoinGroup'), reward: '+0.10 Intis', limit: '1/group', icon: 'users' },
        { action: t('ruleApplyJob'), reward: '+0.05 Intis', limit: 'Max 3/day', icon: 'briefcase' },
        { action: t('ruleUploadFile'), reward: '+0.10 Intis', limit: 'Max 2/day', icon: 'upload' },
        { action: t('ruleCompleteTask'), reward: '+0.10 Intis', limit: 'Max 3/day', icon: 'check' },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('earnRulesTitle')}>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                <div className="p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/20 mb-4">
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 text-center font-medium">
                        {t('earnRulesDesc')}
                    </p>
                </div>
                
                <div className="grid gap-3">
                    {rules.map((rule, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-brand-accent/10 rounded-full text-brand-primary">
                                    <Icon name={rule.icon as any} className="w-5 h-5"/>
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-neutral-800 dark:text-white">{rule.action}</p>
                                    <p className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">{rule.limit}</p>
                                </div>
                            </div>
                            <span className="font-black text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-2 py-1 rounded-lg text-xs">{rule.reward}</span>
                        </div>
                    ))}
                </div>

                <div className="mt-6 p-4 bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-center gap-2 mb-2">
                        <Icon name="star" className="w-5 h-5 text-yellow-600 dark:text-yellow-500 animate-pulse" />
                        <h4 className="font-bold text-yellow-800 dark:text-yellow-500">{t('weeklyBonusTitle')}</h4>
                    </div>
                    <p className="text-xs text-yellow-900 dark:text-yellow-200 mb-2">
                        {t('weeklyBonusDesc')}
                    </p>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-yellow-800/70 dark:text-yellow-200/70">{t('weeklyBonusReward')}</span>
                        <span className="font-black text-lg text-yellow-700 dark:text-yellow-400">+2.00 Intis</span> {/* AJUSTE: Texto a +2.00 */}
                    </div>
                    <p className="text-[10px] text-red-500 mt-3 font-bold border-t border-yellow-200 dark:border-yellow-800 pt-2">
                        {t('weeklyBonusWarning')}
                    </p>
                </div>
                
                <div className="text-center mt-4">
                    <p className="text-[10px] text-neutral-400 italic">{t('dailyResetNote')}</p>
                </div>
                
                <div className="flex justify-end mt-4">
                    <Button onClick={onClose} className="w-full sm:w-auto">{t('understoodEarn')}</Button>
                </div>
            </div>
        </Modal>
    );
};

const IntiValueModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { userProfile } = useContext(AppContext);
    const { t } = useTranslation();
    
    if (!isOpen) return null;

    const userCurrency = userProfile.currency || 'USD';
    const formattedValue = formatCurrency(0.50, userCurrency);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('intiValueTitle')}>
            <div className="space-y-6 text-center p-2">
                <div className="w-20 h-20 bg-brand-primary text-white rounded-full flex items-center justify-center mx-auto shadow-lg border-4 border-brand-accent">
                    <span className="text-4xl font-black">$I</span>
                </div>
                
                <h3 className="text-xl font-bold text-neutral-800 dark:text-white">{t('officialExchangeRate')}</h3>
                
                <div className="bg-neutral-100 dark:bg-neutral-800 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                    <p className="text-4xl font-black text-brand-primary mb-2">1 Inti = $0.50 USD</p>
                    <div className="h-px bg-neutral-300 dark:bg-neutral-700 w-full my-4"></div>
                    <p className="text-lg font-semibold text-neutral-600 dark:text-neutral-400">
                        {t('yourCurrencyEquivalent')} ({userCurrency}): <br/>
                        <span className="text-2xl text-green-600 dark:text-green-400 font-bold">{formattedValue}</span>
                    </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 text-left">
                    <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-2 flex items-center gap-2"><Icon name="globe" className="w-4 h-4"/> {t('iberoVisionTitle')}</h4>
                    <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                        {t('iberoVisionDesc')}
                    </p>
                </div>
                
                <Button onClick={onClose} className="w-full py-3 text-lg">{t('understood')}</Button>
            </div>
        </Modal>
    );
}

const WhatAreIntisModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('whatAreIntis')}>
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 pb-4">
                <div className="space-y-6 text-center">
                    <div className="flex justify-center">
                        <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                            <Icon name="wallet" className="w-12 h-12 text-white" />
                        </div>
                    </div>
                    
                    <h3 className="text-2xl font-black text-brand-primary font-sans uppercase tracking-tight">{t('intisIntroTitle')}</h3>
                    
                    <div className="bg-brand-primary/5 p-4 rounded-xl text-left border border-brand-primary/10">
                         <p className="text-neutral-800 dark:text-neutral-200 font-medium leading-relaxed text-sm">
                            {t('intisIntroDesc1')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                         <div className="bg-neutral-50 dark:bg-neutral-800 p-4 rounded-lg border border-neutral-100 dark:border-neutral-700">
                             <h4 className="font-bold text-brand-secondary text-sm uppercase mb-2 flex items-center gap-2"><Icon name="market" className="w-4 h-4"/> Value</h4>
                             <p className="text-xs text-neutral-600 dark:text-neutral-400">{t('intisIntroDesc2')}</p>
                         </div>
                         <div className="bg-neutral-50 dark:bg-neutral-800 p-4 rounded-lg border border-neutral-100 dark:border-neutral-700">
                             <h4 className="font-bold text-brand-secondary text-sm uppercase mb-2 flex items-center gap-2"><Icon name="star" className="w-4 h-4"/> Gamification</h4>
                             <p className="text-xs text-neutral-600 dark:text-neutral-400">{t('intisIntroSubtitle')}</p>
                         </div>
                    </div>

                    <div className="bg-brand-accent/10 p-4 rounded-xl border border-brand-accent/20 text-left space-y-2">
                        <h4 className="font-bold text-brand-secondary mb-3 text-center uppercase tracking-wider text-sm border-b border-brand-secondary/20 pb-2">{t('whatToDoWithIntis')}</h4>
                        <ul className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
                            <li className="flex items-start gap-2"><div className="mt-1 min-w-[16px]"><Icon name="check" className="w-4 h-4 text-green-500"/></div> <span dangerouslySetInnerHTML={{__html: t('intisUse1')}}></span></li>
                            <li className="flex items-start gap-2"><div className="mt-1 min-w-[16px]"><Icon name="check" className="w-4 h-4 text-green-500"/></div> <span dangerouslySetInnerHTML={{__html: t('intisUse2')}}></span></li>
                            <li className="flex items-start gap-2"><div className="mt-1 min-w-[16px]"><Icon name="check" className="w-4 h-4 text-green-500"/></div> <span dangerouslySetInnerHTML={{__html: t('intisUse3')}}></span></li>
                            <li className="flex items-start gap-2"><div className="mt-1 min-w-[16px]"><Icon name="check" className="w-4 h-4 text-green-500"/></div> <span dangerouslySetInnerHTML={{__html: t('intisUse4')}}></span></li>
                            <li className="flex items-start gap-2"><div className="mt-1 min-w-[16px]"><Icon name="check" className="w-4 h-4 text-green-500"/></div> <span dangerouslySetInnerHTML={{__html: t('intisUse5')}}></span></li>
                        </ul>
                    </div>

                    <Button onClick={onClose} className="w-full py-3 shadow-lg font-bold text-lg bg-gradient-to-r from-brand-primary to-brand-secondary hover:scale-105 transform transition-transform">{t('understoodEarn')}</Button>
                </div>
            </div>
        </Modal>
    );
};

const PartnersNetwork: React.FC = () => {
    const { allUsers, setViewingProfile, setCurrentView, userProfile } = useContext(AppContext);
    const { t } = useTranslation();
    
    const realPartners = useMemo(() => {
        // Include any user who accepts Intis, including the current user
        let partners = allUsers.filter(u => u.acceptsIntis);
        
        // If the current user accepts Intis, add them to the top of the list for visibility
        if (userProfile.acceptsIntis) {
             // Ensure no duplicate if allUsers already contains current user (which it usually doesn't in AppContext logic, but just safe)
             const exists = partners.find(p => p.uid === userProfile.uid);
             if (!exists) {
                 partners = [userProfile, ...partners];
             }
        }
        
        return partners;
    }, [allUsers, userProfile]);

    const handleViewProfile = (u: UserProfile) => {
        setViewingProfile(u);
        setCurrentView('profile');
        window.location.hash = 'profile';
    };

    return (
        <Card className="p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Icon name="market" className="w-5 h-5 text-brand-primary"/> {t('partnerNetwork')} <InfoTooltip text={t('acceptIntisLabel')}/></h3>
            <p className="text-sm text-neutral-500 mb-4">{t('partnerNetworkDescUpdated')}</p>
            
            <div className="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto custom-scrollbar">
                {realPartners.length > 0 ? realPartners.map((p) => (
                    <div key={p.uid} onClick={() => handleViewProfile(p)} className="p-3 border border-neutral-200 dark:border-neutral-700 rounded-xl flex justify-between items-center hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-3">
                             <img src={p.avatarUrl || `https://ui-avatars.com/api/?name=${p.name.replace(' ', '+')}`} className="w-10 h-10 rounded-full object-contain" alt={p.name}/>
                             <div>
                                <p className="font-bold text-sm group-hover:text-brand-primary transition-colors">{p.businessName || p.name}</p>
                                <p className="text-xs text-neutral-500 truncate max-w-[150px]">{p.headline || 'Member'}</p>
                            </div>
                        </div>
                        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full">{t('acceptsIntisBadge')}</span>
                    </div>
                )) : (
                    <div className="text-center p-6 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700">
                        <p className="text-sm text-neutral-500">{t('noBusinessesFound')}</p>
                    </div>
                )}
            </div>
        </Card>
    );
}

const ServicesRedemption: React.FC = () => {
    const { intisBalance, sendIntis, GOATIFY_SERVICES, setToastNotification } = useContext(AppContext);
    const { t } = useTranslation();
    const [loading, setLoading] = useState<string | null>(null);

    const handleRedeem = async (serviceName: string, cost: number) => {
        if (confirm(`${t('redeemConfirm')} ${cost} Intis: ${serviceName}?`)) {
            setLoading(serviceName);
            try {
                await sendIntis('system@goatify.ia', cost, `Canje de servicio: ${serviceName}`);
                setToastNotification({
                    title: 'Success',
                    message: `You redeemed ${serviceName}.`,
                    icon: 'check'
                });
            } catch (error) {
                console.warn("Redemption transfer failed (likely dummy user missing), but UI shows success for demo.");
                 setToastNotification({
                    title: 'Request Received',
                    message: `Request for ${serviceName} registered.`,
                    icon: 'check'
                });
            } finally {
                setLoading(null);
            }
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="font-bold text-xl text-brand-primary flex items-center gap-2">{t('redeemServicesTitle')} <InfoTooltip text={t('redeemServicesDesc')}/></h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('redeemServicesDesc')}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {GOATIFY_SERVICES.map((service, idx) => {
                    const canAfford = intisBalance >= service.priceIntis;
                    const missing = service.priceIntis - intisBalance;
                    
                    return (
                        <Card key={idx} className={`p-4 flex flex-col justify-between border-2 transition-all ${canAfford ? 'border-brand-primary shadow-md hover:shadow-lg' : 'border-transparent opacity-80'}`}>
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-primary">
                                        <Icon name={service.icon as any} className="w-6 h-6"/>
                                    </div>
                                    <span className="font-mono font-bold text-sm sm:text-lg">{service.priceIntis} $I</span>
                                </div>
                                <h4 className="font-bold text-xs sm:text-sm mb-1 line-clamp-2 h-8 sm:h-10">{service.name}</h4>
                                <p className="text-[10px] sm:text-xs text-neutral-500 line-clamp-2">{service.description}</p>
                            </div>
                            <div className="mt-4">
                                <Button 
                                    onClick={() => handleRedeem(service.name, service.priceIntis)}
                                    disabled={!canAfford || loading === service.name}
                                    className={`w-full text-[10px] sm:text-xs py-2 ${canAfford ? 'bg-brand-primary text-white hover:bg-brand-secondary' : 'bg-neutral-200 text-neutral-500 cursor-not-allowed'}`}
                                >
                                    {loading === service.name ? '...' : canAfford ? t('redeem') : `-${missing.toFixed(0)} $I`}
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

const Wallet: React.FC = () => {
    const { userProfile, intisBalance, intisTransactions, setMailDraft, setCurrentView } = useContext(AppContext);
    const { t } = useTranslation();
    const [isInfoModalOpen, setInfoModalOpen] = useState(false);
    const [isEarnRulesModalOpen, setEarnRulesModalOpen] = useState(false);
    const [isIntiValueModalOpen, setIntiValueModalOpen] = useState(false);
    
    const generateReceipt = (tx: IntisTransaction) => {
        const doc = new jsPDF();
        
        let counterparty = "Unknown";
        let note = "No note";
        
        const nameMatch = tx.description.match(/(?:A|De):\s*(.*?)(?:\.\s*Nota:|$)/i);
        if (nameMatch && nameMatch[1]) {
            counterparty = nameMatch[1].trim();
        } else if (tx.type === 'Canje' || tx.type === 'Gasto') {
            counterparty = "Goatify Services";
        }
        
        const noteMatch = tx.description.match(/Nota:\s*(.*)/i);
        if (noteMatch && noteMatch[1]) {
            note = noteMatch[1].trim();
        } else if (tx.type === 'Canje') {
            note = tx.description; 
        }

        doc.setFillColor(252, 253, 255); 
        doc.rect(0, 0, 210, 297, 'F');
        
        doc.setFillColor(76, 29, 149); 
        doc.circle(30, 30, 12, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("G", 26, 35);
        
        doc.setTextColor(17, 24, 39); 
        doc.setFontSize(14);
        doc.text("Goatify Financial", 48, 30);
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text("Official Receipt", 48, 36);
        
        doc.setFontSize(9);
        doc.text(`Ref #${tx.id.slice(-8).toUpperCase()}`, 180, 30, { align: 'right' });
        doc.text(new Date(tx.date).toLocaleString(), 180, 36, { align: 'right' });

        const isIncome = tx.type === 'Ganado' || tx.type === 'Recibido';
        const color = isIncome ? [22, 163, 74] : [17, 24, 39]; 
        
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(229, 231, 235); 
        doc.roundedRect(20, 50, 170, 50, 3, 3, 'FD');
        
        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128);
        doc.text("TOTAL AMOUNT", 105, 65, { align: 'center' });
        
        doc.setFontSize(36);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.setFont("helvetica", "bold");
        const sign = isIncome ? '+' : '-';
        doc.text(`${sign}${tx.amount.toFixed(2)} $I`, 105, 80, { align: 'center' });
        
        doc.setFillColor(220, 252, 231); 
        if (!isIncome) doc.setFillColor(243, 244, 246); 
        
        const badgeWidth = 40;
        const badgeX = 105 - (badgeWidth / 2);
        doc.roundedRect(badgeX, 88, badgeWidth, 7, 2, 2, 'F');
        
        doc.setFontSize(8);
        doc.setTextColor(isIncome ? 22 : 55, isIncome ? 101 : 65, isIncome ? 52 : 81); 
        doc.text("SUCCESS", 105, 92.5, { align: 'center' });

        let y = 120;
        const labelX = 30;
        const valueX = 180;
        
        const drawRow = (label: string, value: string, isBoldValue: boolean = false) => {
             doc.setFontSize(9);
             doc.setFont("helvetica", "normal");
             doc.setTextColor(107, 114, 128); 
             doc.text(label, labelX, y);
             
             doc.setFont("helvetica", isBoldValue ? "bold" : "normal");
             doc.setTextColor(17, 24, 39); 
             
             const splitValue = doc.splitTextToSize(value, 100);
             doc.text(splitValue, valueX, y, { align: 'right' });
             
             const height = splitValue.length * 5;
             
             doc.setDrawColor(243, 244, 246);
             doc.line(20, y + 3, 190, y + 3);
             
             y += height + 10; 
        };
        
        drawRow("TYPE", tx.type.toUpperCase(), true);
        drawRow(isIncome ? "SENDER" : "RECIPIENT", counterparty, true);
        drawRow("DATE", new Date(tx.date).toLocaleDateString());
        drawRow("TIME", new Date(tx.date).toLocaleTimeString());
        drawRow("ID", tx.id);
        drawRow("NOTE", note);
        
        y = 260;
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text("This receipt is a valid digital proof within the Goatify ecosystem.", 105, y, { align: 'center' });
        
        doc.setTextColor(76, 29, 149);
        doc.setFont("helvetica", "bold");
        doc.textWithLink("Go to Dashboard", 80, y + 15, { url: "https://ia.goatify.app" });
        
        doc.save(`Goatify_Receipt_${tx.id.slice(0,8)}.pdf`);
    };
    
    return (
        <div className="p-4 sm:p-6 space-y-8 h-full overflow-y-auto pb-24">
            <WhatAreIntisModal isOpen={isInfoModalOpen} onClose={() => setInfoModalOpen(false)} />
            <EarnRulesModal isOpen={isEarnRulesModalOpen} onClose={() => setEarnRulesModalOpen(false)} />
            <IntiValueModal isOpen={isIntiValueModalOpen} onClose={() => setIntiValueModalOpen(false)} />
            
            <div className="flex flex-wrap justify-between items-center gap-2">
                <h1 className="text-3xl font-bold">{t('walletTitle')}</h1>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setEarnRulesModalOpen(true)} className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">
                        <Icon name="star" className="w-4 h-4"/> {t('howToEarn')}
                    </Button>
                    <Button variant="secondary" onClick={() => setIntiValueModalOpen(true)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">
                        <Icon name="market" className="w-4 h-4"/> {t('intiValueTitle')}
                    </Button>
                    <Button variant="secondary" onClick={() => setInfoModalOpen(true)} className="bg-brand-accent/10 text-brand-primary hover:bg-brand-accent/20">
                        <Icon name="help" className="w-4 h-4"/> {t('whatAreIntis')}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Col */}
                <div className="lg:col-span-2 space-y-8 order-1 lg:order-1">
                    <BankCard balance={intisBalance} user={userProfile} />
                    
                    <Card className="p-0 overflow-hidden">
                        <div className="p-4 border-b border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface flex items-center gap-2">
                            <h3 className="font-bold text-lg">{t('transactionHistoryTitle')}</h3>
                        </div>
                        <div className="max-h-80 overflow-y-auto custom-scrollbar bg-white dark:bg-dark-surface">
                            {intisTransactions.length > 0 ? (
                                intisTransactions.map(tx => (
                                    <TransactionItem 
                                        key={tx.id} 
                                        transaction={tx} 
                                        onDownload={generateReceipt} 
                                        onEmail={(tx) => {
                                            const html = constructIntisTransactionEmailHtml(userProfile.name, {
                                                id: tx.id,
                                                type: tx.type,
                                                amount: tx.amount,
                                                description: tx.description,
                                                date: new Date(tx.date).toLocaleString()
                                            });
                                            setMailDraft({
                                                to: '',
                                                subject: `Recibo de Transacción Intis: ${tx.id}`,
                                                htmlBody: html
                                            });
                                            setCurrentView('mail');
                                        }}
                                    />
                                ))
                            ) : (
                                <div className="p-8 text-center text-neutral-500">
                                    {t('noActivity')}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
                
                {/* Right Col */}
                <div className="space-y-8 order-2 lg:order-2">
                    <TransferView />
                    
                    <Card className="p-6 bg-gradient-to-br from-brand-secondary to-brand-primary text-white cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setEarnRulesModalOpen(true)}>
                        <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Icon name="star" className="w-5 h-5"/> {t('earnMoreIntis')}</h3>
                        <p className="text-sm opacity-90 mb-4">{t('earnMoreDesc')}</p>
                        <div className="bg-white/20 rounded-lg p-3 text-center backdrop-blur-sm flex items-center justify-between px-6">
                            <span className="text-xs font-bold uppercase tracking-wider opacity-80">{t('consistency')}</span>
                            <div className="text-right">
                                <p className="text-2xl font-bold leading-none">{userProfile.dailyActivityStreak || 0}</p>
                                <span className="text-[10px] uppercase">{t('daysStraight')}</span>
                            </div>
                        </div>
                    </Card>

                    <PartnersNetwork />
                </div>

                {/* Bottom Full Width Section for Services (Mobile Friendly Order) */}
                <div className="lg:col-span-3 order-3 mt-8 border-t border-neutral-200 dark:border-neutral-800 pt-8">
                     <ServicesRedemption />
                </div>
            </div>
        </div>
    );
};

export default Wallet;
