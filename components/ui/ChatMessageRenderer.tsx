import React, { useState, useContext } from 'react';
import CodeBlock from './CodeBlock';
import Icon from '../Icon';
import Button from './Button';
import LinkRenderer from './LinkRenderer';
import MermaidChart from '../MermaidChart';
import { cleanTextForSpeech } from '../../services/geminiService';
import { AppContext } from '../../context/AppContext';

interface ChatMessageRendererProps {
  text: string;
  imageUrl?: string;
  onDownload?: () => void;
  onShare?: () => void;
  onSendToProject?: () => void;
  onSpeak?: () => void;
  className?: string;
}

const cleanMarkdownSymbols = (text: string) => {
    return text
        .replace(/\*\*/g, '') 
        .replace(/__/g, '')   
        .replace(/\*\*/g, '') // Extra safety
        .replace(/\*/g, '')   
        .replace(/_/g, '')    
        .replace(/`/g, '')    
        .replace(/#/g, '')    
        .trim();
};

const TableRenderer: React.FC<{ text: string }> = ({ text }) => {
    const { setToastNotification } = useContext(AppContext);
    const lines = text.trim().split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) return <p className="whitespace-pre-wrap">{text}</p>;

    const headerLineIndex = lines.findIndex(l => l.includes('|'));
    if (headerLineIndex === -1) return <p className="whitespace-pre-wrap">{text}</p>;
    
    const separatorLineIndex = headerLineIndex + 1;
    if (!lines[separatorLineIndex] || !lines[separatorLineIndex].includes('---')) {
        return <p className="whitespace-pre-wrap">{text}</p>;
    }

    const parseRow = (row: string) => {
        let cells = row.trim();
        if (cells.startsWith('|')) cells = cells.slice(1);
        if (cells.endsWith('|')) cells = cells.slice(0, -1);
        return cells.split('|').map(cell => cell.trim());
    };
    
    const headers = parseRow(lines[headerLineIndex]);
    const bodyRows = lines.slice(separatorLineIndex + 1)
        .filter(l => l.trim().includes('|'))
        .map(parseRow);

    if (headers.length === 0) return <p className="whitespace-pre-wrap">{text}</p>;

    const downloadCSV = () => {
        const csvContent = [
            headers.join(','),
            ...bodyRows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `goatify_export_${Date.now()}.csv`;
        link.click();
    };

    const copyTableData = () => {
        const tableText = [
            headers.join('\t'),
            ...bodyRows.map(r => r.join('\t'))
        ].join('\n');
        navigator.clipboard.writeText(tableText);
        setToastNotification({ title: "Copiado", message: "Datos de la tabla copiados al portapapeles.", icon: "copy" });
    };

    return (
        <div className="my-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xl bg-white dark:bg-[#050505] overflow-hidden flex flex-col font-sans animate-fade-in relative group/table">
            <div className="flex justify-between items-center px-4 py-3 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-brand-primary/10 rounded-lg">
                        <Icon name="table" className="w-4 h-4 text-brand-primary"/>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Datos Estructurados</span>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={copyTableData} 
                        className="text-[9px] font-black text-brand-primary hover:text-white hover:bg-brand-primary flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-primary transition-all active:scale-95 uppercase tracking-tighter"
                    >
                        <Icon name="copy" className="w-3 h-3"/> Copiar
                    </button>
                    <button 
                        onClick={downloadCSV} 
                        className="text-[9px] font-black text-brand-primary hover:text-white hover:bg-brand-primary flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-primary transition-all active:scale-95 uppercase tracking-tighter"
                    >
                        <Icon name="upload" className="w-3 h-3 transform rotate-180"/> Excel
                    </button>
                </div>
            </div>
            
            <div className="overflow-x-auto custom-scrollbar w-full shadow-inner">
                <table className="w-full text-left border-collapse min-w-full">
                    <thead className="bg-neutral-50 dark:bg-neutral-900/50">
                        <tr>
                            {headers.map((h, i) => (
                                <th key={i} className="px-6 py-4 font-black text-neutral-800 dark:text-white uppercase text-[10px] tracking-widest border-r border-neutral-200 dark:border-neutral-800 last:border-r-0">
                                    {cleanMarkdownSymbols(h)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
                        {bodyRows.map((row, i) => (
                            <tr key={i} className="transition-colors hover:bg-brand-primary/5 even:bg-neutral-50/20 dark:even:bg-neutral-900/10">
                                {row.map((cell, j) => (
                                    <td key={j} className="px-6 py-4 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 font-medium leading-relaxed border-r border-neutral-100 dark:border-neutral-800 last:border-r-0">
                                        <LinkRenderer text={cell} />
                                    </td>
                                ))}
                                {row.length < headers.length && Array.from({length: headers.length - row.length}).map((_, k) => (
                                    <td key={`empty-${k}`} className="px-6 py-4 border-r border-neutral-100 dark:border-neutral-800 last:border-r-0"></td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
                <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-widest">{bodyRows.length} registros encontrados</span>
            </div>
        </div>
    );
};

const InternalLinkButton: React.FC<{ href: string; text: string; isUserMessage: boolean }> = ({ href, text, isUserMessage }) => {
    const { setCurrentView, setSelectedProjectId, setDeepLinkTarget } = useContext(AppContext);
    
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const cleanHash = href.replace('/#', '').replace('#', '');
        const parts = cleanHash.split('/');
        
        // Manejo de navegación interna manual para SPA
        if (parts[0] === 'projects' && parts[1]) {
            setCurrentView('projects');
            setSelectedProjectId(parts[1]);
            if (parts[2] === 'task' && parts[3]) {
                setDeepLinkTarget({ view: 'task', id: parts[3] });
            }
        } else if (['dashboard', 'wallet', 'partners', 'aiStudio', 'discovery', 'hub'].includes(parts[0])) {
            // @ts-ignore
            setCurrentView(parts[0]);
        }
        
        window.location.hash = cleanHash;
    };

    const baseClass = "inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest transition-all shadow-md transform active:scale-95 my-1";
    const styleClass = isUserMessage 
        ? "bg-white text-brand-primary hover:bg-neutral-100" 
        : "bg-brand-primary text-white hover:bg-brand-secondary";

    return (
        <button onClick={handleClick} className={`${baseClass} ${styleClass}`}>
            <Icon name="arrowRight" className="w-3 h-3" />
            {text}
        </button>
    );
};

const formatInlineStyles = (text: string, linkClass: string, isUserMessage: boolean) => {
    const parts = text.split(/(\*\*.*?\*\*|__.*?__)/g);
    return parts.map((part, idx) => {
         if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
             return <strong key={idx} className="font-bold text-inherit">{part.slice(2, -2)}</strong>;
         }
         const italicParts = part.split(/(\*.*?\*|_.*?_)/g);
         return italicParts.map((iPart, iIdx) => {
              if ((iPart.startsWith('*') && iPart.endsWith('*') && iPart.length > 2) || (iPart.startsWith('_') && iPart.endsWith('_') && iPart.length > 2)) {
                  return <em key={`${idx}-${iIdx}`} className="italic">{iPart.slice(1, -1)}</em>;
              }
              
              const linkRegex = /\[(.*?)\]\((.*?)\)/g;
              const linkParts = iPart.split(linkRegex);
              
              if (linkParts.length > 1) {
                  const elements = [];
                  for (let k = 0; k < linkParts.length; k += 3) {
                      const normalText = linkParts[k];
                      if(normalText) elements.push(<span key={`${idx}-${iIdx}-${k}-txt`}><LinkRenderer text={normalText} className={linkClass}/></span>);
                      if (k + 2 < linkParts.length) {
                          const linkText = linkParts[k+1];
                          const linkUrl = linkParts[k+2];
                          const isInternal = linkUrl.startsWith('/#') || linkUrl.startsWith('#');
                          
                          if (isInternal) {
                              elements.push(
                                <InternalLinkButton 
                                    key={`${idx}-${iIdx}-${k}-link`} 
                                    href={linkUrl} 
                                    text={linkText} 
                                    isUserMessage={isUserMessage}
                                />
                              );
                          } else {
                              elements.push(
                                <a 
                                    key={`${idx}-${iIdx}-${k}-link`} 
                                    href={linkUrl} 
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`${linkClass} cursor-pointer font-bold`}
                                    onClick={(e) => { e.stopPropagation(); }}
                                >
                                    {linkText}
                                </a>
                              );
                          }
                      }
                  }
                  return <span key={`${idx}-${iIdx}`}>{elements}</span>;
              }
              return <span key={`${idx}-${iIdx}`}><LinkRenderer text={iPart} className={linkClass}/></span>;
         });
    });
};

const MarkdownRenderer: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
    const isUserMessage = className?.includes('text-white') || false;
    // Ocultar IDs técnicos del usuario final pero mantenerlos en el historial para la IA
    const processedText = text.replace(/\[ID: [^\]]+\]/gi, '');
    
    // Si es un mensaje de usuario, forzamos texto blanco incluso dentro de los párrafos del markdown
    const colorClass = isUserMessage ? '!text-white' : (className || 'text-gray-800 dark:text-gray-200');
    const linkClass = isUserMessage ? "!text-white underline hover:text-gray-200" : "text-brand-primary dark:text-brand-accent hover:underline font-bold";
    
    if (!processedText) return null;
    
    // FORMATO ESPECIAL PARA CITACIONES (PERPLEXITY SONAR) v2.7
    // Detectamos el bloque de fuentes y lo renderizamos con fuente más pequeña
    const citationsHeader = "### 🔗 FUENTES Y ENLACES ENCONTRADOS:";
    if (processedText.includes(citationsHeader)) {
        const parts = processedText.split(citationsHeader);
        return (
            <div className={`markdown-body text-sm sm:text-base leading-snug tracking-normal ${colorClass}`}>
                <MarkdownRenderer text={parts[0]} className={className} />
                <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 opacity-80">
                    <h3 className="text-[11px] font-black text-brand-primary uppercase tracking-[0.2em] mb-3">{citationsHeader.replace('### ', '')}</h3>
                    <div className="text-[11px] font-medium leading-relaxed">
                        <MarkdownRenderer text={parts[1]} className="!text-[10.5px] opacity-70" />
                    </div>
                </div>
            </div>
        );
    }

    const tableRegex = /((?:\n|^)\|.*\|[\r\n]+\|[-:| ]+\|[\r\n]+(?:\|.*\|(?:[\r\n]+|$))+)/g;
    const parts = processedText.split(tableRegex);
    
    return (
        <div className={`markdown-body text-sm sm:text-base leading-snug tracking-normal ${colorClass}`}>
            {parts.map((part, index) => {
                if (part.trim().startsWith('|') && part.includes('---')) {
                     return <TableRenderer key={`table-${index}`} text={part} />;
                }
                
                if (part.includes('```')) {
                    const codeParts = part.split(/(```[\s\S]*?```)/g);
                    return (
                        <div key={`mixed-${index}`}>
                            {codeParts.map((cp, i) => {
                                if (cp.startsWith('```')) {
                                    const content = cp.slice(3, -3).trim();
                                    const firstLineBreak = content.indexOf('\n');
                                    let language = 'text';
                                    let code = content;
                                    if (firstLineBreak > -1) {
                                        const possibleLang = content.substring(0, firstLineBreak).trim();
                                        if (possibleLang && !possibleLang.includes(' ')) {
                                            language = possibleLang;
                                            code = content.substring(firstLineBreak + 1);
                                        }
                                    }
                                    
                                    if (language.toLowerCase() === 'mermaid') {
                                        return <MermaidChart key={`mermaid-${index}-${i}`} chart={code} />;
                                    }
                                    
                                    return <CodeBlock key={`code-${index}-${i}`} code={code} language={language} />;
                                }
                                return <div key={`text-${index}-${i}`}>{renderTextLines(cp, linkClass, colorClass, isUserMessage)}</div>;
                            })}
                        </div>
                    );
                }

                return <div key={`text-${index}`}>{renderTextLines(part, linkClass, colorClass, isUserMessage)}</div>;
            })}
        </div>
    );
};

const renderTextLines = (textBlock: string, linkClass: string, colorClass: string, isUserMessage: boolean) => {
    const lines = textBlock.split('\n');
    return lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === '') return <div key={i} className="h-2"></div>;
        
        const h3Match = trimmed.match(/^###\s?(.*)/);
        if (h3Match) return <h3 key={i} className={`text-lg sm:text-xl font-bold mt-4 mb-2 text-brand-primary dark:text-brand-accent uppercase tracking-tighter border-l-4 border-brand-primary pl-3`}>{formatInlineStyles(h3Match[1], linkClass, isUserMessage)}</h3>;
        
        const h2Match = trimmed.match(/^##\s?(.*)/);
        if (h2Match) return <h2 key={i} className={`text-xl sm:text-2xl font-black mt-6 mb-3 pb-2 border-b border-brand-primary/10 dark:border-brand-primary/20 leading-tight uppercase tracking-tight text-brand-primary dark:text-brand-accent`}>{formatInlineStyles(h2Match[1], linkClass, isUserMessage)}</h2>;
        
        const h1Match = trimmed.match(/^#\s?(.*)/);
        if (h1Match) return <h1 key={i} className="text-2xl sm:text-3xl font-black mt-8 mb-4 leading-tight uppercase tracking-tighter text-brand-primary dark:text-brand-accent">{formatInlineStyles(h1Match[1], linkClass, isUserMessage)}</h1>;
        
        const quoteMatch = trimmed.match(/^>\s?(.*)/);
        if (quoteMatch) return <blockquote key={i} className="border-l-4 border-brand-primary/50 pl-4 py-1 my-3 italic opacity-90 bg-brand-primary/5 rounded-r-xl text-base sm:text-lg">{formatInlineStyles(quoteMatch[1], linkClass, isUserMessage)}</blockquote>;
        
        const listMatch = trimmed.match(/^[-*]\s+(.*)/);
        if (listMatch) return <div key={i} className="flex items-start gap-3 mb-1.5 ml-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0 opacity-80"></span><span className={colorClass}>{formatInlineStyles(listMatch[1], linkClass, isUserMessage)}</span></div>;
        
        const numListMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numListMatch) return <div key={i} className="flex items-start gap-3 mb-1.5 ml-2"><span className="font-black text-brand-primary min-w-[1rem] text-right text-xs">{numListMatch[1]}.</span><span className={colorClass}>{formatInlineStyles(numListMatch[2], linkClass, isUserMessage)}</span></div>;

        return <p key={i} className={`mb-1 whitespace-pre-wrap leading-snug ${colorClass}`}>{formatInlineStyles(line, linkClass, isUserMessage)}</p>;
    });
};

const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({ text, imageUrl, onDownload, onShare, onSendToProject, onSpeak, className }) => {
    const [copied, setCopied] = useState(false);
    const { isAiMuted, setIsAiMuted } = useContext(AppContext);

    if (!text && !imageUrl) return null;
    
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSpeak = () => {
        if (onSpeak) { onSpeak(); return; }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const cleanText = cleanTextForSpeech(text);
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = 'es-ES';
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.lang === 'es-US' || v.lang === 'es-MX') || voices.find(v => v.lang.startsWith('es'));
            if (preferredVoice) utterance.voice = preferredVoice;
            window.speechSynthesis.speak(utterance);
        }
    };

    const toggleMute = () => {
         if (!isAiMuted && 'speechSynthesis' in window) { window.speechSynthesis.cancel(); }
         setIsAiMuted(!isAiMuted);
    };

    return (
        <div className={`flex flex-col gap-1 w-full ${className || ''}`}>
            {imageUrl && (
                <div className="relative group/image w-fit mb-2">
                    <img src={imageUrl} alt="Content" className="rounded-xl max-h-80 object-contain shadow-md" />
                    <div className="absolute top-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity flex gap-1 bg-black/40 p-1 rounded-lg backdrop-blur-sm">
                        {onDownload && <Button onClick={onDownload} variant="ghost" size="sm" className="!p-1.5 text-white hover:bg-white/20"><Icon name="upload" className="w-4 h-4"/></Button>}
                        {onShare && <Button onClick={onShare} variant="ghost" size="sm" className="!p-1.5 text-white hover:bg-white/20"><Icon name="share" className="w-4 h-4"/></Button>}
                        {onSendToProject && <Button onClick={onSendToProject} variant="ghost" size="sm" className="!p-1.5 text-white hover:bg-white/20"><Icon name="send" className="w-4 h-4"/></Button>}
                    </div>
                </div>
            )}
            
            {text && (
                <div className="relative group/text w-full">
                    <MarkdownRenderer text={text} className={className} />
                    
                    <div className="absolute -bottom-6 right-0 opacity-0 group-hover/text:opacity-100 transition-opacity flex gap-2 bg-white/80 dark:bg-neutral-800/80 backdrop-blur-md px-2 py-1 rounded-full shadow-sm z-20 border border-neutral-200 dark:border-neutral-700 scale-90 origin-right">
                        <button onClick={handleCopy} className="text-neutral-500 hover:text-brand-primary transition-colors" title="Copiar"><Icon name={copied ? 'check' : 'copy'} className="w-3 h-3"/></button>
                        <button onClick={toggleMute} className={`transition-colors ${isAiMuted ? 'text-red-500' : 'text-green-500'}`} title={isAiMuted ? "Activar Voz" : "Silenciar"}><Icon name={isAiMuted ? "volumeMute" : "volume"} className="w-3 h-3"/></button>
                        <button onClick={handleSpeak} className="text-neutral-500 hover:text-brand-primary transition-colors" title="Leer"><Icon name="mic" className="w-3 h-3"/></button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatMessageRenderer;