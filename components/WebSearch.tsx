
import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import Button from './ui/Button';
import Input from './ui/Input';
import Spinner from './ui/Spinner';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import type { AiTask } from '../types';
import { getPlanConfig } from '../types';

interface GroundingChunk {
    web?: {
        uri: string;
        title: string;
    }
}

const SearchResult: React.FC<{ task: AiTask }> = ({ task }) => {
    const { setToastNotification } = useContext(AppContext);
    const [result, setResult] = useState<{ text: string, sources: GroundingChunk[] } | null>(null);
    useEffect(() => {
        if (task.status === 'completed' && task.resultText) {
            try {
                const parsed = JSON.parse(task.resultText);
                setResult(parsed);
            } catch (e) {
                console.error("Failed to parse search result:", e);
                setResult({ text: task.resultText, sources: [] });
            }
        }
    }, [task]);
    const handleCite = (source: GroundingChunk) => {
        const citation = `[${source.web?.title || 'Source'}](${source.web?.uri})`;
        navigator.clipboard.writeText(citation);
        setToastNotification({ title: 'Citation Copied', message: 'Markdown link copied to clipboard.', icon: 'copy' });
    };
    if (!result) return <p>Error loading result.</p>;
    return (
        <div className="animate-fade-in space-y-6">
            <div><ChatMessageRenderer text={result.text} /></div>
            {result.sources.length > 0 && (
                <div>
                    <h3 className="text-lg font-bold mb-3 border-b border-light-border dark:border-dark-border pb-2">Sources</h3>
                    <div className="space-y-3">
                        {result.sources.map((source, index) => (
                            source.web && (
                                <div key={index} className="bg-light-bg dark:bg-dark-bg p-3 rounded-lg flex items-center justify-between gap-2">
                                    <div className="overflow-hidden">
                                        <a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-primary hover:underline truncate block">{source.web.title || source.web.uri}</a>
                                         <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{source.web.uri}</p>
                                    </div>
                                    <Button onClick={() => handleCite(source)} variant="secondary" size="sm" className="flex-shrink-0" title="Cite source"><Icon name="copy" className="w-4 h-4" /></Button>
                                </div>
                            )
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const WebSearch: React.FC = () => {
    const { startAiTask, aiTaskHistory, setToastNotification, checkWebSearchLimit, userProfile, userUsage } = useContext(AppContext);
    const [query, setQuery] = useState('');
    const webSearches = aiTaskHistory.filter(t => t.type === 'web_search');
    
    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).ai_chat_daily_queries || 30;
    const used = userUsage?.counters?.daily_chat_count || 0;

    const handleSearch = async () => {
        if (!query.trim()) return;
        const isBlocked = await checkWebSearchLimit();
        if (isBlocked) return;
        startAiTask({ type: 'web_search', prompt: query });
        setToastNotification({ title: "Search Started", message: "You'll be notified when your results are ready.", icon: 'search' });
        setQuery('');
    };

    return (
        <div className="h-full flex flex-col p-4 sm:p-6">
            <div className="flex-shrink-0 flex items-center gap-4 mb-6">
                <div className="flex-1 flex items-center gap-2">
                    <Input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search with AI..."
                        className="!mt-0"
                    />
                    <Button onClick={handleSearch} disabled={!query.trim()}><Icon name="search" className="w-5 h-5" /></Button>
                </div>
                {/* MONITOR DE LÍMITE */}
                <div className="hidden sm:flex flex-col items-end px-3 py-1.5 bg-brand-primary/5 rounded-xl border border-brand-primary/10">
                    <p className="text-[9px] font-black uppercase text-brand-primary tracking-widest">Consultas Diarias</p>
                    <p className="text-xs font-bold text-neutral-800 dark:text-white">{used} de {limit === 999999 ? '∞' : limit}</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {webSearches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-light-text-secondary dark:text-dark-text-secondary">
                        <Icon name="search" className="w-16 h-16 mb-4 text-neutral-300 dark:text-neutral-700"/>
                        <p className="font-semibold">Your AI-powered search results will appear here.</p>
                        <p className="text-sm">Get summarized answers with cited sources.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {webSearches.map(task => (
                             <details key={task.id} className="bg-light-surface dark:bg-dark-surface rounded-lg shadow-sm" open>
                                <summary className="p-4 cursor-pointer flex justify-between items-center font-semibold">
                                    <span className="truncate pr-4">{task.prompt}</span>
                                    {task.status === 'pending' && <Spinner text="Processing..."/>}
                                    {task.status === 'completed' && <span className="text-xs text-green-500 font-bold">Completed</span>}
                                    {task.status === 'failed' && <span className="text-xs text-red-500 font-bold">Failed</span>}
                                </summary>
                                <div className="p-4 border-t border-light-border dark:border-dark-border">
                                    {task.status === 'completed' && <SearchResult task={task} />}
                                    {task.status === 'failed' && <p className="text-red-500">The search failed. Please try again.</p>}
                                </div>
                            </details>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WebSearch;
