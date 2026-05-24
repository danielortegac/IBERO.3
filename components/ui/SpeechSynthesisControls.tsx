
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../Icon';
import Button from './Button';

interface SpeechSynthesisControlsProps {
    textToRead: string;
}

const SpeechSynthesisControls: React.FC<SpeechSynthesisControlsProps> = ({ textToRead }) => {
    const [status, setStatus] = useState<'idle' | 'speaking' | 'paused'>('idle');
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
    const [rate, setRate] = useState(1);
    
    const utteranceQueueRef = useRef<string[]>([]);
    const isProcessingQueueRef = useRef(false);
    const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

    const populateVoiceList = useCallback(() => {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices.length === 0) return;

        const spanishVoices = availableVoices.filter(v => v.lang.startsWith('es-'));
        setVoices(spanishVoices);

        if (!selectedVoiceURI || !spanishVoices.some(v => v.voiceURI === selectedVoiceURI)) {
            const latinVoice = spanishVoices.find(v => v.lang === 'es-US' || v.lang === 'es-MX');
            if (latinVoice) {
                setSelectedVoiceURI(latinVoice.voiceURI);
            } else if (spanishVoices.length > 0) {
                setSelectedVoiceURI(spanishVoices[0].voiceURI);
            }
        }
    }, [selectedVoiceURI]);

    useEffect(() => {
        populateVoiceList();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = populateVoiceList;
        }

        return () => {
            handleStop(); // Clean up on unmount
            if (speechSynthesis.onvoiceschanged !== undefined) {
                speechSynthesis.onvoiceschanged = null;
            }
        };
    }, [populateVoiceList]);

    // Process the queue of sentences
    const processQueue = () => {
        if (utteranceQueueRef.current.length === 0) {
            isProcessingQueueRef.current = false;
            setStatus('idle');
            return;
        }

        isProcessingQueueRef.current = true;
        const textChunk = utteranceQueueRef.current.shift();
        
        if (!textChunk) return;

        const utterance = new SpeechSynthesisUtterance(textChunk);
        const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
        
        utterance.voice = selectedVoice || null;
        utterance.lang = selectedVoice?.lang || 'es-ES';
        utterance.rate = rate;

        utterance.onend = () => {
            // Continue to next chunk
            processQueue();
        };

        utterance.onerror = (e) => {
            console.error("TTS Error", e);
            isProcessingQueueRef.current = false;
            setStatus('idle');
        };

        currentUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    };

    const handlePlayPause = () => {
        if (status === 'speaking') {
            window.speechSynthesis.pause();
            setStatus('paused');
        } else if (status === 'paused') {
            window.speechSynthesis.resume();
            setStatus('speaking');
        } else {
            // New Start
            handleStop(); // Clear previous
            
            // Clean text
            const cleanText = textToRead
                .replace(/\*\*/g, '')
                .replace(/#/g, '')
                .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Remove markdown links

            // Split into sentences to avoid browser timeout on long text
            // Simple regex to split by punctuation
            const chunks = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
            
            utteranceQueueRef.current = chunks.map(s => s.trim()).filter(Boolean);
            setStatus('speaking');
            processQueue();
        }
    };
    
    const handleStop = () => {
        window.speechSynthesis.cancel();
        utteranceQueueRef.current = [];
        isProcessingQueueRef.current = false;
        currentUtteranceRef.current = null;
        setStatus('idle');
    };

    // When text changes significantly (different book/article), stop reading
    useEffect(() => {
        handleStop();
    }, [textToRead]);

    if (!('speechSynthesis' in window)) {
        return null;
    }

    const isPlayingOrPaused = status === 'speaking' || status === 'paused';
    const playPauseIcon = status === 'speaking' ? 'pause' : 'volume';
    const playPauseTitle = status === 'speaking' ? 'Pausar' : 'Leer en voz alta';

    return (
        <div className="flex items-center flex-wrap gap-2 p-2 mb-4 bg-light-bg/80 dark:bg-dark-bg/80 backdrop-blur-sm rounded-full shadow-md sticky top-4 z-10 w-fit not-prose">
            <Button onClick={handlePlayPause} size="sm" className="!p-2.5 rounded-full" title={playPauseTitle}>
                <Icon name={playPauseIcon} className="w-5 h-5" />
            </Button>
            {isPlayingOrPaused && (
                 <Button onClick={handleStop} variant="secondary" size="sm" className="!p-2.5 rounded-full" title="Detener">
                    <Icon name="stop" className="w-5 h-5" />
                </Button>
            )}
            {voices.length > 0 && (
                <select 
                    value={selectedVoiceURI} 
                    onChange={e => setSelectedVoiceURI(e.target.value)}
                    className="bg-transparent text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-brand-primary max-w-[150px]"
                    title="Seleccionar voz"
                >
                    {voices.map(voice => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name}
                        </option>
                    ))}
                </select>
            )}
            {isPlayingOrPaused && (
                <div className="flex items-center gap-1.5 pr-2">
                    <label htmlFor="rate-slider" className="text-xs font-semibold" title="Velocidad de lectura">Vel:</label>
                    <input 
                        id="rate-slider"
                        type="range" 
                        min="0.75" 
                        max="2" 
                        step="0.25" 
                        value={rate} 
                        onChange={e => setRate(parseFloat(e.target.value))}
                        className="w-16 accent-brand-primary"
                    />
                </div>
            )}
        </div>
    );
};

export default SpeechSynthesisControls;
