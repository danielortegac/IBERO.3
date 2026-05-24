
import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import Button from './ui/Button';
import LinkRenderer from './ui/LinkRenderer';
import { useTranslation } from '../hooks/useTranslation';
import { rewriteText } from '../services/geminiService';

const AnnouncementPopup: React.FC = () => {
    const { announcementToShow, dismissAnnouncement } = useContext(AppContext);
    const { t, language } = useTranslation();
    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);

    useEffect(() => {
        if (!announcementToShow) return;
        
        // If language is English and type is text or html, attempt to translate if not already
        if (language === 'en' && (announcementToShow.type === 'text' || announcementToShow.type === 'html')) {
            const translateContent = async () => {
                setIsTranslating(true);
                try {
                     // Use Gemini to translate on the fly
                     const result = await rewriteText(
                         `Translate the following text to English, keeping the original tone and formatting (Markdown/HTML): ${announcementToShow.message}`, 
                         'en'
                     );
                     setTranslatedContent(result);
                } catch (e) {
                    console.error("Translation failed", e);
                    setTranslatedContent(announcementToShow.message); // Fallback
                } finally {
                    setIsTranslating(false);
                }
            };
            translateContent();
        } else {
            setTranslatedContent(announcementToShow.message);
        }
    }, [announcementToShow, language]);

    if (!announcementToShow) return null;

    const contentToDisplay = translatedContent || announcementToShow.message;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-3xl shadow-2xl border border-white/20 dark:border-white/10 relative overflow-hidden animate-scale-in transform transition-all">
                
                {announcementToShow.title ? (
                    <div className="bg-gradient-to-r from-[#0f172a] to-[#1e293b] p-6 pb-12 relative overflow-hidden">
                         <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                         <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-primary rounded-full blur-[60px] opacity-50 animate-pulse"></div>
                         <div className="absolute bottom-0 left-0 w-20 h-20 bg-purple-500 rounded-full blur-[40px] opacity-30"></div>
                         
                         <div className="relative z-10 flex items-center gap-4">
                             <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md shadow-inner border border-white/10">
                                 <Icon name="bell" className="w-6 h-6 text-white"/>
                             </div>
                             <div>
                                 <h2 className="text-xl font-black text-white tracking-tight leading-none">{announcementToShow.title}</h2>
                                 <p className="text-[10px] text-gray-300 font-mono mt-1 uppercase tracking-widest opacity-80">{t('priorityMessage')}</p>
                             </div>
                         </div>
                    </div>
                ) : (
                    <div className="h-4 bg-gradient-to-r from-[#0f172a] to-[#1e293b]"></div>
                )}
                
                <div className={`px-6 py-8 ${announcementToShow.title ? '-mt-6 rounded-t-3xl' : ''} bg-white dark:bg-black/95 relative z-20 min-h-[200px] flex flex-col`}>
                    
                    <div className="flex-grow">
                        {isTranslating ? (
                             <div className="flex items-center justify-center h-32 text-neutral-500 text-sm animate-pulse">
                                 {t('translating')}
                             </div>
                        ) : announcementToShow.type === 'image' ? (
                            <div className="rounded-xl overflow-hidden shadow-lg mb-4 border border-gray-200 dark:border-gray-800">
                                <img src={contentToDisplay} alt="Announcement" className="w-full h-auto object-cover" />
                            </div>
                        ) : announcementToShow.type === 'html' ? (
                             <div 
                                className="html-content-wrapper w-full"
                                dangerouslySetInnerHTML={{ __html: contentToDisplay }} 
                             />
                        ) : (
                            <div className="prose dark:prose-invert prose-sm max-w-none text-neutral-600 dark:text-neutral-300 leading-relaxed font-medium">
                                <LinkRenderer text={contentToDisplay} />
                            </div>
                        )}
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                        <Button 
                            onClick={dismissAnnouncement} 
                            className="w-full py-3.5 shadow-xl bg-gradient-to-r from-brand-primary to-purple-600 hover:to-purple-700 text-white font-bold rounded-xl transform hover:scale-[1.02] transition-all active:scale-95"
                        >
                            {t('understood')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnnouncementPopup;
