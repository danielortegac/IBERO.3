
import React, { useState, useRef, useContext } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import { transcribeAudio, generateSpeech } from '../services/geminiService';
import type { TtsVoice } from '../types';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import { AppContext } from '../context/AppContext';
import { getPlanConfig } from '../types';

const TranscriptionTool: React.FC = () => {
    const { t } = useTranslation();
    const { checkQueryLimit, setToastNotification } = useContext(AppContext);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [transcription, setTranscription] = useState<string>('');
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                audioChunksRef.current = [];
                stream.getTracks().forEach(track => track.stop());
            };
            audioChunksRef.current = [];
            mediaRecorderRef.current.start();
            setIsRecording(true);
            setAudioBlob(null);
            setTranscription('');
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleTranscribe = async () => {
        if (!audioBlob) return;
        
        // VALIDACIÓN DE CRÉDITOS (Descuenta 1 crédito de chat)
        const isBlocked = await checkQueryLimit();
        if (isBlocked) return;

        setIsLoading(true);
        setTranscription('');
        try {
            const result = await transcribeAudio(audioBlob);
            setTranscription(result);
            setToastNotification({ title: "Transcripción Exitosa", message: "Se ha descontado 1 crédito de chat.", icon: "check" });
        } catch (error) {
            console.error("Transcription failed:", error);
            setTranscription("Error: Could not transcribe audio.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAudioBlob(file);
            setTranscription('');
            setToastNotification({ title: "Archivo cargado", message: `${file.name} listo para transcribir.`, icon: "check" });
        }
    };

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2"><Icon name="mic" className="w-5 h-5 text-brand-primary"/> Voz a Texto</h3>
            <div className="text-center bg-neutral-50 dark:bg-neutral-900/50 p-8 rounded-3xl border border-neutral-100 dark:border-neutral-800">
                <div className="flex justify-center items-center gap-6">
                    <Button
                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                        size="lg"
                        className={`h-16 w-16 rounded-full !p-0 shadow-xl transform hover:scale-105 active:scale-95 transition-all ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-brand-primary hover:bg-brand-secondary'}`}
                    >
                        <Icon name={isRecording ? 'stop' : 'mic'} className="w-8 h-8" />
                    </Button>
                    <span className="text-neutral-400 font-bold">ó</span>
                    <label className="cursor-pointer h-16 w-16 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-full flex flex-col items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 text-brand-primary">
                        <Icon name="upload" className="w-6 h-6" />
                        <input type="file" accept="audio/*,video/*" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest mt-4 text-neutral-400">
                    {isRecording ? "Grabando..." : "Grabar o Subir Archivo"}
                </p>
            </div>
            {audioBlob && !isRecording && (
                <div className="bg-light-surface dark:bg-dark-surface p-6 rounded-2xl shadow-md text-center space-y-4 border border-neutral-100 dark:border-neutral-800">
                    <audio src={URL.createObjectURL(audioBlob)} controls className="w-full" />
                    <Button onClick={handleTranscribe} disabled={isLoading} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white border-none shadow-lg">
                        {isLoading ? <Spinner className="!p-0" /> : <><Icon name="sync" className="w-4 h-4"/> Transcribir</>}
                    </Button>
                </div>
            )}
            {(isLoading || transcription) && (
                 <div className="animate-fade-in">
                     <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-2">Resultado:</h4>
                     <div className="w-full min-h-[100px] bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-6 whitespace-pre-wrap text-sm leading-relaxed border border-neutral-200 dark:border-neutral-700 shadow-inner">
                        {isLoading ? <Spinner text="Procesando audio con IA..." /> : transcription}
                     </div>
                </div>
            )}
        </div>
    );
}

// Helper to decode base64 and create a playable WAV blob
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createWavBlob(pcmData: Uint8Array): Blob {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length, true);

    return new Blob([view, pcmData], { type: 'audio/wav' });
}


const TextToSpeechTool: React.FC = () => {
    const { t } = useTranslation();
    const { checkQueryLimit, setToastNotification } = useContext(AppContext);
    const [text, setText] = useState('');
    const [voice, setVoice] = useState<TtsVoice>('Kore');
    const [isLoading, setIsLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const voices: {name: TtsVoice, gender: string}[] = [
        { name: 'Zephyr', gender: 'Hombre' },
        { name: 'Kore', gender: 'Mujer' },
        { name: 'Puck', gender: 'Hombre' },
        { name: 'Charon', gender: 'Hombre' },
        { name: 'Fenrir', gender: 'Mujer' },
    ];

    const handleGenerateSpeech = async () => {
        if (!text.trim()) return;

        // VALIDACIÓN DE CRÉDITOS (Descuenta 1 crédito de chat)
        const isBlocked = await checkQueryLimit();
        if (isBlocked) return;

        setIsLoading(true);
        setAudioUrl(null);
        try {
            const base64Audio = await generateSpeech(text, voice);
            const pcmData = decode(base64Audio);
            const wavBlob = createWavBlob(pcmData);
            setAudioUrl(URL.createObjectURL(wavBlob));
            setToastNotification({ title: "Audio Generado", message: "Se ha descontado 1 crédito de chat.", icon: "check" });
        } catch (error) {
            console.error("Speech generation failed:", error);
            alert("Failed to generate speech.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2"><Icon name="volume" className="w-5 h-5 text-brand-primary"/> Texto a Voz Profesional</h3>
            <div className="space-y-4">
                <Textarea 
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={5}
                    placeholder="Escribe el texto que deseas convertir en audio profesional..."
                    className="p-4"
                />
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-neutral-50 dark:bg-neutral-900/50 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                    <label htmlFor="voice" className="text-xs font-black uppercase text-neutral-500">Voz Seleccionada:</label>
                    <select id="voice" value={voice} onChange={e => setVoice(e.target.value as TtsVoice)} className="flex-1 bg-white dark:bg-dark-surface border border-neutral-300 dark:border-neutral-600 rounded-xl p-2 text-sm font-bold shadow-sm outline-none">
                        {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.gender})</option>)}
                    </select>
                </div>
                <Button onClick={handleGenerateSpeech} disabled={isLoading || !text.trim()} className="w-full py-4 bg-brand-primary text-white shadow-xl h-14">
                    {isLoading ? <Spinner className="!p-0" text="Generando ondas de audio..." /> : <><Icon name="volume" className="w-5 h-5"/> Generar Audio Profesional</>}
                </Button>
            </div>
            {audioUrl && (
                <div className="bg-light-surface dark:bg-dark-surface p-6 rounded-3xl shadow-lg text-center space-y-4 border border-brand-primary/20 animate-scale-in">
                     <p className="text-[10px] font-black uppercase text-brand-primary tracking-widest">Vista Previa del Audio</p>
                     <audio ref={audioRef} src={audioUrl} controls className="w-full" />
                     <a href={audioUrl} download="goatify-speech.wav" className="block">
                        <Button variant="secondary" className="w-full h-12 bg-neutral-100 text-neutral-800 border-none font-bold uppercase text-xs"><Icon name="upload" className="w-4 h-4 transform rotate-180"/> Descargar Archivo .WAV</Button>
                     </a>
                </div>
            )}
        </div>
    )
}

const AudioTools: React.FC = () => {
    const { userProfile, userUsage } = useContext(AppContext);
    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).ai_chat_daily_queries || 30;
    const used = userUsage?.counters?.daily_chat_count || 0;

    return (
        <div className="p-6 h-full overflow-y-auto custom-scrollbar">
            {/* MONITOR DE CRÉDITOS */}
            <div className="flex justify-between items-center mb-8 px-1">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">Herramientas de Audio</h1>
                    <p className="text-xs text-neutral-500 font-medium">Transcripción y síntesis de voz.</p>
                </div>
                <div className="bg-brand-primary/5 px-4 py-2 rounded-2xl border border-brand-primary/10 text-right">
                    <p className="text-[9px] font-black uppercase text-brand-primary tracking-widest">Créditos de Chat</p>
                    <p className="text-xs font-bold text-neutral-800 dark:text-white">{used} de {limit} diarios</p>
                </div>
            </div>

            <div className="max-w-3xl mx-auto space-y-12">
                <TranscriptionTool />
                <div className="border-t border-neutral-100 dark:border-neutral-800"></div>
                <TextToSpeechTool />
            </div>
        </div>
    );
};

export default AudioTools;
