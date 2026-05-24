
import React, { useState, useEffect } from 'react';

interface SpinnerProps {
    text?: string;
    className?: string;
    showText?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

const loadingPhrases = [
    "Cargando...",
    "Procesando...",
    "Sincronizando...",
    "Casi listo...",
    "Optimizando..."
];

const Spinner: React.FC<SpinnerProps> = ({ text, className = '', showText = true, size = 'md' }) => {
    const [currentPhrase, setCurrentPhrase] = useState(text || loadingPhrases[0]);

    useEffect(() => {
        if (text || !showText) return; 
        
        const interval = setInterval(() => {
            setCurrentPhrase(prev => {
                const currentIndex = loadingPhrases.indexOf(prev);
                const nextIndex = (currentIndex + 1) % loadingPhrases.length;
                return loadingPhrases[nextIndex];
            });
        }, 2000);

        return () => clearInterval(interval);
    }, [text, showText]);

    const hasTextColor = className.includes('text-');
    const textColorClass = hasTextColor ? '' : 'text-brand-primary';
    const svgColorClass = hasTextColor ? 'text-current' : 'text-brand-primary';

    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-8 w-8',
        lg: 'h-12 w-12'
    };

    const containerPadding = showText ? 'p-4' : 'p-0';

    return (
        <div className={`flex flex-col items-center justify-center gap-2 ${containerPadding} ${className}`}>
            <svg className={`animate-spin ${sizeClasses[size]} ${svgColorClass}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {showText && <p className={`text-sm font-medium animate-pulse ${textColorClass}`}>{text || currentPhrase}</p>}
        </div>
    );
};

export default Spinner;