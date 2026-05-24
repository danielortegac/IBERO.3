
import React, { useState } from 'react';
import Icon from '../Icon';

interface InfoTooltipProps {
    text: string;
    className?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, className = '', position = 'top' }) => {
    const [isVisible, setIsVisible] = useState(false);

    // Dynamic positioning logic could be enhanced, but simple CSS adjustments work best for reliability
    // Mobile override: ensure it doesn't go off screen by restricting width and using a safer default transform
    
    let positionClasses = 'bottom-full left-1/2 -translate-x-1/2 mb-2';
    if (position === 'bottom') positionClasses = 'top-full left-1/2 -translate-x-1/2 mt-2';
    if (position === 'left') positionClasses = 'right-full top-1/2 -translate-y-1/2 mr-2';
    if (position === 'right') positionClasses = 'left-full top-1/2 -translate-y-1/2 ml-2';

    return (
        <div 
            className={`relative inline-flex items-center justify-center ${className}`}
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            onClick={(e) => { e.stopPropagation(); setIsVisible(!isVisible); }}
        >
            <div className="w-5 h-5 rounded-full bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white transition-colors flex items-center justify-center cursor-help border border-brand-primary/20">
                <span className="text-xs font-bold font-serif italic">i</span>
            </div>
            
            {isVisible && (
                <div className={`absolute z-[100] p-3 bg-gray-900 text-white text-xs rounded-xl shadow-2xl animate-scale-in pointer-events-none
                    w-max max-w-[150px] sm:max-w-[250px] whitespace-normal
                    ${position === 'left' ? 'right-full top-1/2 -translate-y-1/2 mr-2' : ''}
                    ${position === 'right' ? 'left-full top-1/2 -translate-y-1/2 ml-2' : ''}
                    ${position === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2 sm:left-1/2 sm:-translate-x-1/2 -translate-x-3/4' : ''} 
                    ${position === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-2' : ''}
                `}>
                    {/* Mobile adjustment for top position: -translate-x-3/4 helps keep it on screen if near right edge */}
                    
                    <div className="relative z-10 leading-relaxed">
                        {text}
                    </div>
                    
                    {/* Arrow (Hidden on very small screens or adjusted) */}
                    <div className={`absolute w-2 h-2 bg-gray-900 transform rotate-45 
                        ${position === 'top' ? 'bottom-[-4px] left-3/4 sm:left-1/2 sm:-translate-x-1/2' : ''}
                        ${position === 'bottom' ? 'top-[-4px] left-1/2 -translate-x-1/2' : ''}
                        ${position === 'left' ? 'right-[-4px] top-1/2 -translate-y-1/2' : ''}
                        ${position === 'right' ? 'left-[-4px] top-1/2 -translate-y-1/2' : ''}
                    `}></div>
                </div>
            )}
        </div>
    );
};

export default InfoTooltip;
