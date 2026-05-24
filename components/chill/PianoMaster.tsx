import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Tone from 'tone';
import Icon from '../Icon';
import { motion, AnimatePresence } from 'motion/react';

interface PianoMasterProps {
  onBack: () => void;
  onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
  bestScore: number;
  toggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

type GameMode = 'free' | 'learn' | 'hero';

interface NoteInfo {
  note: string;
  label: string;
  key: string;
  type: 'white' | 'black';
}

interface SongNote {
  note: string;
  time: number; // For hero mode (seconds from start)
  duration?: number; // seconds
}

interface Song {
  name: string;
  artist?: string;
  notes: string[]; // For learn mode
  heroNotes?: SongNote[]; // For hero mode
  difficulty: 'Fácil' | 'Medio' | 'Pro' | 'Maestro';
  color: string;
  description?: string;
}
// Notas extendidas (C2 a C7)
const NOTES: NoteInfo[] = [
  // Octava 2 & 3 (Fila Q-P)
  { note: 'C2', label: 'Do', key: 'q', type: 'white' },
  { note: 'C#2', label: 'Do#', key: '1', type: 'black' },
  { note: 'D2', label: 'Re', key: 'w', type: 'white' },
  { note: 'D#2', label: 'Re#', key: '2', type: 'black' },
  { note: 'E2', label: 'Mi', key: 'e', type: 'white' },
  { note: 'F2', label: 'Fa', key: 'r', type: 'white' },
  { note: 'F#2', label: 'Fa#', key: '3', type: 'black' },
  { note: 'G2', label: 'Sol', key: 't', type: 'white' },
  { note: 'G#2', label: 'Sol#', key: '4', type: 'black' },
  { note: 'A2', label: 'La', key: 'y', type: 'white' },
  { note: 'A#2', label: 'La#', key: '5', type: 'black' },
  { note: 'B2', label: 'Si', key: 'u', type: 'white' },
  { note: 'C3', label: 'Do', key: 'i', type: 'white' },
  { note: 'C#3', label: 'Do#', key: '6', type: 'black' },
  { note: 'D3', label: 'Re', key: 'o', type: 'white' },
  { note: 'D#3', label: 'Re#', key: '7', type: 'black' },
  { note: 'E3', label: 'Mi', key: 'p', type: 'white' },
  // Octava 3 & 4 (Fila A-L)
  { note: 'F3', label: 'Fa', key: 'a', type: 'white' },
  { note: 'F#3', label: 'Fa#', key: '8', type: 'black' },
  { note: 'G3', label: 'Sol', key: 's', type: 'white' },
  { note: 'G#3', label: 'Sol#', key: '9', type: 'black' },
  { note: 'A3', label: 'La', key: 'd', type: 'white' },
  { note: 'A#3', label: 'La#', key: '0', type: 'black' },
  { note: 'B3', label: 'Si', key: 'f', type: 'white' },
  { note: 'C4', label: 'Do', key: 'g', type: 'white' },
  { note: 'C#4', label: 'Do#', key: '-', type: 'black' },
  { note: 'D4', label: 'Re', key: 'h', type: 'white' },
  { note: 'D#4', label: 'Re#', key: '=', type: 'black' },
  { note: 'E4', label: 'Mi', key: 'j', type: 'white' },
  { note: 'F4', label: 'Fa', key: 'k', type: 'white' },
  { note: 'F#4', label: 'Fa#', key: '[', type: 'black' },
  { note: 'G4', label: 'Sol', key: 'l', type: 'white' },
  { note: 'G#4', label: 'Sol#', key: ']', type: 'black' },
  // Octava 4 & 5 (Fila Z-M)
  { note: 'A4', label: 'La', key: 'z', type: 'white' },
  { note: 'A#4', label: 'La#', key: '\\', type: 'black' },
  { note: 'B4', label: 'Si', key: 'x', type: 'white' },
  { note: 'C5', label: 'Do', key: 'c', type: 'white' },
  { note: 'C#5', label: 'Do#', key: '', type: 'black' },
  { note: 'D5', label: 'Re', key: 'v', type: 'white' },
  { note: 'D#5', label: 'Re#', key: '', type: 'black' },
  { note: 'E5', label: 'Mi', key: 'b', type: 'white' },
  { note: 'F5', label: 'Fa', key: 'n', type: 'white' },
  { note: 'F#5', label: 'Fa#', key: '', type: 'black' },
  { note: 'G5', label: 'Sol', key: 'm', type: 'white' },
  { note: 'G#5', label: 'Sol#', key: '', type: 'black' },
  { note: 'A5', label: 'La', key: '', type: 'white' },
  { note: 'A#5', label: 'La#', key: '', type: 'black' },
  { note: 'B5', label: 'Si', key: '', type: 'white' },
  // Octava 6
  { note: 'C6', label: 'Do', key: '', type: 'white' },
  { note: 'C#6', label: 'Do#', key: '', type: 'black' },
  { note: 'D6', label: 'Re', key: '', type: 'white' },
  { note: 'D#6', label: 'Re#', key: '', type: 'black' },
  { note: 'E6', label: 'Mi', key: '', type: 'white' },
  { note: 'F6', label: 'Fa', key: '', type: 'white' },
  { note: 'F#6', label: 'Fa#', key: '', type: 'black' },
  { note: 'G6', label: 'Sol', key: '', type: 'white' },
  { note: 'G#6', label: 'Sol#', key: '', type: 'black' },
  { note: 'A6', label: 'La', key: '', type: 'white' },
  { note: 'A#6', label: 'La#', key: '', type: 'black' },
  { note: 'B6', label: 'Si', key: '', type: 'white' },
  { note: 'C7', label: 'Do', key: '', type: 'white' },
];

const SONGS: Song[] = [
  {
    name: 'Estrellita',
    artist: 'Tradicional',
    notes: ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'],
    difficulty: 'Fácil',
    color: 'from-yellow-400 to-orange-500',
    description: 'La canción más fácil para empezar.'
  },
  {
    name: 'Mary Had a Little Lamb',
    artist: 'Tradicional',
    notes: ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', 'D4', 'D4', 'D4', 'E4', 'G4', 'G4'],
    difficulty: 'Fácil',
    color: 'from-pink-400 to-rose-500',
    description: 'Un clásico infantil muy sencillo.'
  },
  {
    name: 'Jingle Bells',
    artist: 'Tradicional',
    notes: ['E4', 'E4', 'E4', 'E4', 'E4', 'E4', 'E4', 'G4', 'C4', 'D4', 'E4'],
    difficulty: 'Fácil',
    color: 'from-red-500 to-green-600',
    description: '¡Navidad en el piano!'
  },
  {
    name: 'Escala de Do Mayor',
    artist: 'Ejercicio',
    notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    difficulty: 'Fácil',
    color: 'from-blue-400 to-indigo-600',
    description: 'El ejercicio más básico para soltar los dedos.'
  },
  {
    name: 'Still D.R.E.',
    artist: 'Dr. Dre',
    notes: ['A4', 'A4', 'A4', 'A4', 'A4', 'A4', 'A4', 'A4', 'G4', 'G4', 'G4', 'G4', 'E4', 'E4', 'E4', 'E4'],
    heroNotes: [
      { note: 'A4', time: 1 }, { note: 'A4', time: 1.5 }, { note: 'A4', time: 2 }, { note: 'A4', time: 2.5 },
      { note: 'A4', time: 3 }, { note: 'A4', time: 3.5 }, { note: 'A4', time: 4 }, { note: 'A4', time: 4.5 },
      { note: 'G4', time: 5 }, { note: 'G4', time: 5.5 }, { note: 'G4', time: 6 }, { note: 'G4', time: 6.5 },
      { note: 'E4', time: 7 }, { note: 'E4', time: 7.5 }, { note: 'E4', time: 8 }, { note: 'E4', time: 8.5 },
    ],
    difficulty: 'Medio',
    color: 'from-neutral-800 to-neutral-950',
    description: 'El riff de piano más icónico del hip-hop.'
  },
  {
    name: 'Verano (Presto)',
    artist: 'Vivaldi',
    notes: ['G4', 'G4', 'G4', 'G4', 'G4', 'G4', 'G4', 'G4'],
    heroNotes: [
      { note: 'G4', time: 1 }, { note: 'G4', time: 1.1 }, { note: 'G4', time: 1.2 }, { note: 'G4', time: 1.3 },
      { note: 'G4', time: 1.4 }, { note: 'G4', time: 1.5 }, { note: 'G4', time: 1.6 }, { note: 'G4', time: 1.7 },
    ],
    difficulty: 'Maestro',
    color: 'from-orange-600 to-red-700',
    description: 'Tormenta de verano. Muy rápido.'
  },
  {
    name: 'Primavera',
    artist: 'Vivaldi',
    notes: ['E4', 'G#4', 'G#4', 'G#4', 'F#4', 'E4', 'B4', 'B4', 'A4', 'G#4', 'G#4', 'G#4', 'F#4', 'E4', 'B4'],
    heroNotes: [
      { note: 'E4', time: 1 }, { note: 'G#4', time: 1.5 }, { note: 'G#4', time: 1.75 }, { note: 'G#4', time: 2 },
      { note: 'F#4', time: 2.5 }, { note: 'E4', time: 3 }, { note: 'B4', time: 3.5 }, { note: 'B4', time: 4 },
    ],
    difficulty: 'Pro',
    color: 'from-emerald-400 to-green-600',
    description: 'Las Cuatro Estaciones: Un clásico vibrante.'
  },
  {
    name: 'Toccata y Fuga',
    artist: 'Bach',
    notes: ['A4', 'G4', 'A4', 'F4', 'E4', 'D4', 'C#4', 'D4'],
    heroNotes: [
      { note: 'A4', time: 1 }, { note: 'G4', time: 1.2 }, { note: 'A4', time: 1.4 }, { note: 'F4', time: 1.8 },
      { note: 'E4', time: 2.2 }, { note: 'D4', time: 2.6 }, { note: 'C#4', time: 3 }, { note: 'D4', time: 3.5 },
    ],
    difficulty: 'Maestro',
    color: 'from-neutral-900 to-red-900',
    description: 'Barroco puro. Oscuro y majestuoso.'
  },
  {
    name: 'Minuet en Sol',
    artist: 'Bach',
    notes: ['D4', 'G3', 'A3', 'B3', 'C4', 'D4', 'G3', 'G3'],
    difficulty: 'Pro',
    color: 'from-purple-500 to-pink-600'
  },
  {
    name: 'Para Elisa',
    artist: 'Beethoven',
    notes: ['E4', 'D#4', 'E4', 'D#4', 'E4', 'B3', 'D4', 'C4', 'A3'],
    difficulty: 'Pro',
    color: 'from-amber-500 to-orange-600'
  },
  {
    name: 'Himno a la Alegría',
    artist: 'Beethoven',
    notes: ['E3', 'E3', 'F3', 'G3', 'G3', 'F3', 'E3', 'D3', 'C3', 'C3', 'D3', 'E3', 'E3', 'D3', 'D3'],
    difficulty: 'Medio',
    color: 'from-blue-500 to-indigo-600'
  },
  {
    name: 'The Next Episode',
    artist: 'Dr. Dre',
    notes: ['A4', 'A4', 'A4', 'A4', 'F4', 'F4', 'F4', 'F4'],
    heroNotes: [
      { note: 'A4', time: 1 }, { note: 'A4', time: 1.5 }, { note: 'A4', time: 2 }, { note: 'A4', time: 2.5 },
      { note: 'F4', time: 3 }, { note: 'F4', time: 3.5 }, { note: 'F4', time: 4 }, { note: 'F4', time: 4.5 },
      { note: 'A4', time: 5 }, { note: 'A4', time: 5.5 }, { note: 'A4', time: 6 }, { note: 'A4', time: 6.5 },
      { note: 'F4', time: 7 }, { note: 'F4', time: 7.5 }, { note: 'F4', time: 8 }, { note: 'F4', time: 8.5 },
    ],
    difficulty: 'Medio',
    color: 'from-neutral-700 to-neutral-900',
    description: 'Smoke weed everyday.'
  },
  {
    name: 'In the End',
    artist: 'Linkin Park',
    notes: ['D#4', 'A#3', 'A#3', 'D#4', 'D#4', 'D#4', 'D#4', 'C#4'],
    heroNotes: [
      { note: 'D#4', time: 1 }, { note: 'A#3', time: 2 }, { note: 'A#3', time: 2.5 }, { note: 'D#4', time: 3 },
      { note: 'D#4', time: 3.5 }, { note: 'D#4', time: 4 }, { note: 'D#4', time: 4.5 }, { note: 'C#4', time: 5 },
    ],
    difficulty: 'Medio',
    color: 'from-blue-900 to-black',
    description: 'It starts with one thing...'
  },
  {
    name: 'Seven Nation Army',
    artist: 'The White Stripes',
    notes: ['E4', 'E4', 'G4', 'E4', 'D4', 'C4', 'B3'],
    heroNotes: [
      { note: 'E4', time: 1 }, { note: 'E4', time: 1.7 }, { note: 'G4', time: 2 }, { note: 'E4', time: 2.5 },
      { note: 'D4', time: 3 }, { note: 'C4', time: 3.5 }, { note: 'B3', time: 4 },
    ],
    difficulty: 'Fácil',
    color: 'from-red-600 to-black',
    description: 'El riff más coreado del mundo.'
  },
  {
    name: 'Claro de Luna',
    artist: 'Beethoven',
    notes: ['C#3', 'E3', 'G#3', 'C#3', 'E3', 'G#3', 'C#3', 'E3', 'G#3'],
    difficulty: 'Maestro',
    color: 'from-indigo-700 to-slate-900'
  },
  {
    name: 'Cumpleaños Feliz',
    notes: ['C3', 'C3', 'D3', 'C3', 'F3', 'E3', 'C3', 'C3', 'D3', 'C3', 'G3', 'F3'],
    difficulty: 'Fácil',
    color: 'from-emerald-500 to-teal-600'
  }
];

const PianoMaster: React.FC<PianoMasterProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<GameMode>('free');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [songIndex, setSongIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [fallingNotes, setFallingNotes] = useState<{ id: number, note: string, startTime: number, isHero?: boolean, targetTime?: number }[]>([]);
  const [heroActiveNotes, setHeroActiveNotes] = useState<SongNote[]>([]);
  const [gameTime, setGameTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showKeys, setShowKeys] = useState(true);
  const [showTheory, setShowTheory] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  
  const samplerRef = useRef<Tone.Sampler | null>(null);
  const polySynthRef = useRef<Tone.PolySynth | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const nextNoteId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const initAudio = async () => {
    if (audioReady && polySynthRef.current) {
      if (Tone.getContext().state !== 'running') {
        await Tone.getContext().resume();
      }
      return;
    }
    
    try {
      await Tone.start();
      const context = Tone.getContext();
      if (context.state !== 'running') {
        await context.resume();
      }
      console.log("Audio context started, state:", context.state);
      
      // Initialize PolySynth immediately as a reliable fallback
      const polySynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 },
      }).toDestination();
      polySynth.maxPolyphony = 64;
      
      // Add a limiter to prevent distortion and buffer issues
      const limiter = new Tone.Limiter(-1).toDestination();
      polySynth.connect(limiter);
      
      polySynthRef.current = polySynth;

      // Load Sampler in background
      const sampler = new Tone.Sampler({
        urls: {
          A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
          A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
          A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
          A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
          A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
          A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
          A6: "A6.mp3", C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
          A7: "A7.mp3", C8: "C8.mp3"
        },
        release: 1,
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        onload: () => {
          console.log("High-quality piano samples loaded");
        },
        onerror: (err) => {
          console.warn("Sampler failed to load, using Synth fallback", err);
        }
      });

      const reverb = new Tone.Reverb({
        decay: 3,
        wet: 0.3
      }).toDestination();

      sampler.connect(reverb);
      samplerRef.current = sampler;
      reverbRef.current = reverb;

      setAudioReady(true);
    } catch (error) {
      console.error("Failed to initialize audio:", error);
      // Even if it fails, we try to set audioReady if Tone.start() worked
      if (Tone.getContext().state === 'running') {
        setAudioReady(true);
      }
    }
  };

  // Hero Mode Game Loop
  useEffect(() => {
    if (mode !== 'hero' || !currentSong || !isPlaying) return;

    let lastTime = performance.now();
    let frameId: number;

    const loop = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      
      setGameTime(prev => {
        const nextTime = prev + delta;
        
        // Check for notes to spawn
        if (currentSong.heroNotes) {
          const notesToSpawn = currentSong.heroNotes.filter(n => 
            n.time > prev + 2 && n.time <= nextTime + 2
          );
          
          if (notesToSpawn.length > 0) {
            setHeroActiveNotes(current => [...current, ...notesToSpawn]);
          }
        }
        
        return nextTime;
      });
      
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [mode, currentSong, isPlaying]);

  const playNote = useCallback(async (noteName: string, isAuto = false) => {
    if (!audioReady) {
      console.warn("Audio not ready, skipping note:", noteName);
      return;
    }

    // Prevent double triggers for the same note if it's already active
    if (!isAuto && activeNotes.has(noteName)) return;

    // Ensure context is running (important for mobile/safari)
    if (Tone.getContext().state !== 'running') {
      try {
        await Tone.getContext().resume();
      } catch (e) {
        console.error("Failed to resume audio context:", e);
      }
    }

    try {
      if (samplerRef.current && samplerRef.current.loaded) {
        samplerRef.current.triggerAttack(noteName);
      } else if (polySynthRef.current) {
        polySynthRef.current.triggerAttack(noteName);
      }
    } catch (err) {
      console.error("Error playing note:", noteName, err);
      // If PolySynth throws "No available buffers", try to release all and play again
      if (err instanceof Error && err.message.includes("buffers") && polySynthRef.current) {
        polySynthRef.current.releaseAll();
        try {
          polySynthRef.current.triggerAttack(noteName);
        } catch (retryErr) {
          console.error("Retry failed:", retryErr);
        }
      }
    }

    if (!isAuto) {
      setActiveNotes(prev => new Set(prev).add(noteName));
      
      // Hero Mode Hit Detection
      if (mode === 'hero' && currentSong) {
        const hitNote = heroActiveNotes.find(n => 
          n.note === noteName && Math.abs(n.time - gameTime) < 0.3
        );
        
        if (hitNote) {
          const bonus = Math.floor(combo / 5) * 10;
          setScore(s => s + 50 + bonus);
          setCombo(c => {
            const next = c + 1;
            if (next > maxCombo) setMaxCombo(next);
            return next;
          });
          setHeroActiveNotes(current => current.filter(n => n !== hitNote));
        } else {
          setCombo(0);
        }
      }

      // Visual effect
      const newNote = { id: nextNoteId.current++, note: noteName, startTime: Date.now() };
      setFallingNotes(prev => [...prev, newNote]);
      setTimeout(() => {
        setFallingNotes(prev => prev.filter(n => n.id !== newNote.id));
      }, 3000);

      // Learn Mode Logic
      if (mode === 'learn' && currentSong) {
        if (noteName === currentSong.notes[songIndex]) {
          const nextIndex = songIndex + 1;
          setScore(prev => prev + 100);
          
          if (nextIndex >= currentSong.notes.length) {
            setSongIndex(0);
            setCurrentSong(null);
            setMode('free');
            onGameEnd(score + 100, 50, true);
          } else {
            setSongIndex(nextIndex);
          }
        }
      }
    }
  }, [audioReady, mode, currentSong, songIndex, score, onGameEnd, heroActiveNotes, gameTime]);

  const stopNote = useCallback((noteName: string) => {
    if (samplerRef.current && samplerRef.current.loaded) {
      samplerRef.current.triggerRelease(noteName);
    } else if (polySynthRef.current) {
      polySynthRef.current.triggerRelease(noteName);
    }
    
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(noteName);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const noteObj = NOTES.find(n => n.key === e.key.toLowerCase());
      if (noteObj) {
        playNote(noteObj.note);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const noteObj = NOTES.find(n => n.key === e.key.toLowerCase());
      if (noteObj) {
        stopNote(noteObj.note);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playNote, stopNote]);

  // Learn Mode: Play the target note when it changes so the user hears it
  // Removed to avoid "double press" feeling when user plays the correct note
  /*
  useEffect(() => {
    if (mode === 'learn' && currentSong && audioReady) {
      const targetNote = currentSong.notes[songIndex];
      if (targetNote) {
        // Play target note softly/briefly as a guide
        const timer = setTimeout(() => {
          playNote(targetNote, true);
          setTimeout(() => stopNote(targetNote), 400);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [mode, currentSong, songIndex, audioReady, playNote, stopNote]);
  */

  // Dedicated audio disposal effect
  useEffect(() => {
    return () => {
      if (polySynthRef.current) {
        polySynthRef.current.releaseAll();
        polySynthRef.current.dispose();
      }
      if (samplerRef.current) {
        samplerRef.current.releaseAll();
        samplerRef.current.dispose();
      }
      if (reverbRef.current) reverbRef.current.dispose();
    };
  }, []);

  // Cleanup notes when mode changes
  useEffect(() => {
    if (polySynthRef.current) polySynthRef.current.releaseAll();
    if (samplerRef.current && samplerRef.current.loaded) samplerRef.current.releaseAll();
    setActiveNotes(new Set());
    setFallingNotes([]);
  }, [mode]);

  const startSong = async (song: Song) => {
    if (!audioReady) await initAudio();
    setCurrentSong(song);
    setSongIndex(0);
    setGameTime(0);
    setCombo(0);
    setMaxCombo(0);
    setHeroActiveNotes([]);
    setMode(song.heroNotes ? 'hero' : 'learn');
    setIsPlaying(true);
    setIsPreviewing(false);
    setScore(0);
  };

  const previewSong = async (song: Song) => {
    if (!audioReady) await initAudio();
    setIsPreviewing(true);
    
    const now = Tone.now();
    let timeOffset = 0.5;
    
    song.notes.forEach((note, i) => {
      setTimeout(() => {
        if (!isPreviewing) return;
        playNote(note, true);
        setTimeout(() => stopNote(note), 300);
      }, timeOffset * 1000);
      timeOffset += 0.4;
    });

    setTimeout(() => setIsPreviewing(false), timeOffset * 1000);
  };

  const whiteKeys = NOTES.filter(n => n.type === 'white');

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-neutral-950 text-white overflow-hidden font-sans relative">
      {/* Overlay de inicio de audio */}
      {!audioReady && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-3xl"
        >
          <div className="text-center p-12 bg-neutral-900 border border-white/10 rounded-[40px] shadow-2xl max-w-md mx-4">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(79,70,229,0.5)] animate-pulse">
              <Icon name="music" className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-3xl font-black mb-4 tracking-tight">Piano Maestro Pro</h2>
            <p className="text-neutral-400 mb-10 text-sm leading-relaxed">
              Motor de audio de alta fidelidad. Teclado: Q-P (Bajos), A-L (Medios), Z-M (Altos).
            </p>
            <button 
              onClick={initAudio}
              className="w-full py-5 bg-white text-black font-black rounded-2xl transition-all hover:scale-[1.05] active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            >
              INICIAR PIANO
            </button>
          </div>
        </motion.div>
      )}

      {/* Header */}
      <div className="p-4 flex justify-between items-center border-b border-white/5 shrink-0 bg-neutral-900/60 backdrop-blur-2xl z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 hover:bg-white/10 rounded-2xl transition-all active:scale-90 border border-white/5">
            <Icon name="arrow-left" className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-white to-neutral-500 bg-clip-text text-transparent">Piano Maestro</h2>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${audioReady ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></div>
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                {mode === 'free' ? 'Modo Libre' : `Aprendiendo: ${currentSong?.name}`}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (audioReady) {
                playNote('C4', true);
                setTimeout(() => stopNote('C4'), 200);
              }
            }}
            className="p-3 hover:bg-white/10 rounded-2xl transition-all border border-white/5 text-neutral-400 hover:text-white"
            title="Probar Sonido"
          >
            <Icon name="volume-2" className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setShowTheory(!showTheory)}
            className="p-3 hover:bg-white/10 rounded-2xl transition-all border border-white/5 text-neutral-400 hover:text-white"
            title="Teoría Musical"
          >
            <Icon name="book-open" className="w-5 h-5" />
          </button>
          
          <div className="hidden sm:flex flex-col items-end mr-4">
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Combo</span>
            <span className="text-xl font-black text-indigo-400 tabular-nums">{combo}x</span>
          </div>
          
          <div className="hidden sm:flex flex-col items-end mr-4">
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Puntos</span>
            <span className="text-xl font-black text-white tabular-nums">{score.toLocaleString()}</span>
          </div>
          
          <button 
            onClick={() => setMode(mode === 'free' ? 'learn' : 'free')} 
            className={`px-6 py-2.5 rounded-2xl text-xs font-black transition-all active:scale-95 border ${mode === 'free' ? 'bg-white text-black border-white' : 'bg-transparent text-white border-white/20 hover:bg-white/5'}`}
          >
            {mode === 'free' ? 'APRENDER' : 'SALIR'}
          </button>
          
          <button onClick={toggleFullscreen} className="p-3 hover:bg-white/10 rounded-2xl transition-all border border-white/5">
            <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Visualizer / Falling Notes Area */}
        <div className="flex-1 relative overflow-hidden bg-neutral-950">
          {/* Background Grid */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="h-full w-full bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          </div>

          {/* Falling Notes Visualization (Synthesia Style) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex justify-center">
            <div className="flex-1 min-w-[1400px] md:min-w-full h-full relative">
              <AnimatePresence>
                {/* Target Line for Guitar Hero feel */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500/30 blur-[2px] z-10" />
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-indigo-400/50 z-10" />

                {/* Free Play / Learn Mode Notes */}
                {fallingNotes.map((fn) => {
                  const noteInfo = NOTES.find(n => n.note === fn.note);
                  const whiteIndex = whiteKeys.findIndex(n => n.note === fn.note);
                  const isBlack = noteInfo?.type === 'black';
                  
                  let left = 0;
                  const keyWidth = 100 / whiteKeys.length;
                  
                  if (!isBlack) {
                    left = whiteIndex * keyWidth + (keyWidth / 2);
                  } else {
                    const noteIdx = NOTES.findIndex(orig => orig.note === fn.note);
                    const prevWhiteIdx = whiteKeys.findIndex((n) => {
                      const originalIdx = NOTES.findIndex(orig => orig.note === n.note);
                      return originalIdx === noteIdx - 1;
                    });
                    left = (prevWhiteIdx + 1) * keyWidth;
                  }

                  return (
                    <motion.div
                      key={fn.id}
                      initial={{ y: -800, opacity: 0, height: 100 }}
                      animate={{ y: 800, opacity: [0, 1, 1, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 3, ease: "linear" }}
                      className={`absolute w-[2%] rounded-full blur-[1px] -translate-x-1/2 ${isBlack ? 'bg-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.6)]' : 'bg-white shadow-[0_0_30px_rgba(255,255,255,0.4)]'}`}
                      style={{ left: `${left}%`, top: '0' }}
                    />
                  );
                })}
              </AnimatePresence>

              {/* Learning Mode Falling Notes (Synthesia Style) */}
              {mode === 'learn' && currentSong && (
                <AnimatePresence mode="popLayout">
                  {currentSong.notes.slice(songIndex, songIndex + 12).map((note, i) => {
                    const noteInfo = NOTES.find(n => n.note === note);
                    const whiteIndex = whiteKeys.findIndex(n => n.note === note);
                    const isBlack = noteInfo?.type === 'black';
                    
                    let left = 0;
                    const keyWidth = 100 / whiteKeys.length;

                    if (!isBlack) {
                      left = whiteIndex * keyWidth + (keyWidth / 2);
                    } else {
                      const noteIdx = NOTES.findIndex(orig => orig.note === note);
                      const prevWhiteIdx = whiteKeys.findIndex((n) => {
                        const originalIdx = NOTES.findIndex(orig => orig.note === n.note);
                        return originalIdx === noteIdx - 1;
                      });
                      left = (prevWhiteIdx + 1) * keyWidth;
                    }

                    // Calculate vertical position: i=0 is at bottom (0), i=1 is above, etc.
                    // We'll use a larger spacing for a "falling" look
                    const verticalSpacing = 140; 

                    return (
                      <motion.div
                        key={`${songIndex}-${i}-${note}`}
                        initial={{ y: -600, opacity: 0, scale: 0.8 }}
                        animate={{ 
                          y: 0, 
                          opacity: 1,
                          scale: i === 0 ? 1.3 : 1,
                          bottom: `${i * verticalSpacing}px`,
                        }}
                        exit={{ 
                          y: 200, 
                          opacity: 0, 
                          scale: 3,
                          filter: 'brightness(5) blur(15px)',
                        }}
                        transition={{ 
                          type: "spring", 
                          stiffness: 400, 
                          damping: 35,
                          opacity: { duration: 0.15 }
                        }}
                        className={`absolute w-[3.5%] h-28 rounded-3xl z-10 flex flex-col items-center justify-center border-4 -translate-x-1/2 ${
                          i === 0 
                            ? 'bg-indigo-500 border-white shadow-[0_0_80px_rgba(99,102,241,1)]' 
                            : 'bg-white/10 border-white/20 backdrop-blur-md'
                        }`}
                        style={{ left: `${left}%`, bottom: `${i * verticalSpacing}px` }}
                      >
                        {/* Target Indicator for Learn Mode */}
                        {i === 0 && (
                          <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: [1, 1.2, 1], opacity: 1 }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            className="absolute -top-14 left-1/2 -translate-x-1/2 whitespace-nowrap"
                          >
                            <span className="bg-indigo-600 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-[0_0_30px_rgba(79,70,229,0.9)] border border-white/30 uppercase tracking-tighter">
                              TOCA
                            </span>
                          </motion.div>
                        )}
                        
                        <span className={`text-2xl font-black ${i === 0 ? 'text-white' : 'text-white/30'}`}>
                          {note.replace(/[0-9]/g, '')}
                        </span>
                        <span className={`text-xs font-bold ${i === 0 ? 'text-white/80' : 'text-white/10'}`}>
                          {note.slice(-1)}
                        </span>
                        
                        {i === 0 && (
                          <motion.div 
                            animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                            className="absolute inset-0 bg-white rounded-2xl"
                          />
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}

              {/* Hero Mode Falling Notes */}
              {mode === 'hero' && heroActiveNotes.map((fn, i) => {
                const noteInfo = NOTES.find(n => n.note === fn.note);
                const whiteIndex = whiteKeys.findIndex(n => n.note === fn.note);
                const isBlack = noteInfo?.type === 'black';
                
                let left = 0;
                const keyWidth = 100 / whiteKeys.length;

                if (!isBlack) {
                  left = whiteIndex * keyWidth + (keyWidth / 2);
                } else {
                  const noteIdx = NOTES.findIndex(orig => orig.note === fn.note);
                  const prevWhiteIdx = whiteKeys.findIndex((n) => {
                    const originalIdx = NOTES.findIndex(orig => orig.note === n.note);
                    return originalIdx === noteIdx - 1;
                  });
                  left = (prevWhiteIdx + 1) * keyWidth;
                }

                // Calculate vertical position based on time difference
                const timeDiff = fn.time - gameTime;
                const yPos = (1 - (timeDiff / 2)) * 100; // 2 seconds lead time

                if (timeDiff < -0.5) return null; // Remove old notes

                return (
                  <div
                    key={`${fn.note}-${fn.time}`}
                    className={`absolute w-[3%] h-16 rounded-full blur-[1px] z-10 -translate-x-1/2 ${isBlack ? 'bg-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.8)]' : 'bg-white shadow-[0_0_30px_rgba(255,255,255,0.6)]'}`}
                    style={{ 
                      left: `${left}%`, 
                      top: `${yPos}%`,
                      opacity: timeDiff < 0 ? 0.3 : 1,
                      transform: 'translateY(-100%) translateX(-50%)'
                    }}
                  >
                    {Math.abs(timeDiff) < 0.1 && (
                      <div className="absolute inset-0 animate-ping bg-white/50 rounded-full" />
                    )}
                  </div>
                );
              })}

              {/* Hit Line for Hero Mode */}
              {mode === 'hero' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.3)] z-20" />
              )}
              
              {/* Target Line for Learn Mode */}
              {mode === 'learn' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.5)]" />
              )}
            </div>
          </div>

          {/* Learning HUD */}
          {mode === 'learn' && currentSong && (
            <div className="absolute top-8 left-0 right-0 z-20 flex flex-col items-center px-6">
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={`p-6 rounded-[32px] bg-gradient-to-br ${currentSong.color} shadow-2xl w-full max-w-2xl border border-white/20 backdrop-blur-md`}
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-white leading-tight">{currentSong.name}</h3>
                    <p className="text-white/70 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{currentSong.artist || 'Tradicional'} • {currentSong.difficulty}</p>
                  </div>
                  <div className="bg-black/30 backdrop-blur-xl rounded-2xl px-4 py-2 border border-white/10">
                    <span className="text-white font-black tabular-nums">{songIndex + 1} / {currentSong.notes.length}</span>
                  </div>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                  {currentSong.notes.map((note, i) => (
                    <div 
                      key={i} 
                      className={`
                        min-w-[56px] h-14 rounded-2xl flex flex-col items-center justify-center transition-all duration-500 shrink-0 border
                        ${i === songIndex ? 'bg-white text-black scale-110 shadow-2xl border-white' : 
                          i < songIndex ? 'bg-black/20 text-white/30 border-white/5' : 
                          'bg-white/10 text-white/60 border-white/10'}
                      `}
                    >
                      <span className="text-sm font-black">{note.replace(/[0-9]/g, '')}</span>
                      <span className="text-[8px] font-bold opacity-60">{note.slice(-1)}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
              <motion.p 
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em] mt-8"
              >
                Toca la nota resaltada para avanzar
              </motion.p>
            </div>
          )}

          {/* Theory Panel */}
          <AnimatePresence>
            {showTheory && (
              <motion.div 
                initial={{ x: 300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 300, opacity: 0 }}
                className="absolute right-6 top-6 w-72 bg-neutral-900/90 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 z-40 shadow-2xl"
              >
                <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                  <Icon name="book-open" className="w-5 h-5 text-indigo-400" />
                  Teoría Musical
                </h3>
                <div className="space-y-4 text-xs text-neutral-400 leading-relaxed">
                  <p><strong className="text-white">Do, Re, Mi...</strong> Son las notas básicas. En inglés se usan letras: C, D, E, F, G, A, B.</p>
                  <p><strong className="text-white">Teclas Negras:</strong> Son sostenidos (#) o bemoles (b). Suben o bajan medio tono.</p>
                  <p><strong className="text-white">Octavas:</strong> El número (C3, C4) indica la altura. C4 es el "Do central".</p>
                  <div className="pt-4 border-t border-white/5">
                    <p className="font-bold text-white mb-2">Atajos de Teclado:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/5 p-2 rounded-lg">Q-P: Octava 2+</div>
                      <div className="bg-white/5 p-2 rounded-lg">A-L: Octava 3+</div>
                      <div className="bg-white/5 p-2 rounded-lg">Z-M: Octava 4+</div>
                      <div className="bg-white/5 p-2 rounded-lg">1-0: Sostenidos</div>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setShowTheory(false)}
                  className="w-full mt-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cerrar
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Piano Keyboard Container */}
        <div className="h-80 md:h-[400px] w-full bg-neutral-900 p-2 md:p-6 shrink-0 relative z-30 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
          <div className="h-full w-full flex relative select-none overflow-x-auto no-scrollbar rounded-xl bg-neutral-900 justify-center">
            <div className="flex-1 flex min-w-[1400px] md:min-w-full h-full relative justify-center bg-neutral-900">
              {whiteKeys.map((whiteKey, idx) => (
                <div key={whiteKey.note} className="flex-1 relative">
                  {/* White Key */}
                  <div
                    onMouseDown={() => playNote(whiteKey.note)}
                    onMouseUp={() => stopNote(whiteKey.note)}
                    onMouseLeave={() => stopNote(whiteKey.note)}
                    onTouchStart={(e) => { e.preventDefault(); playNote(whiteKey.note); }}
                    onTouchEnd={(e) => { e.preventDefault(); stopNote(whiteKey.note); }}
                    className={`
                      h-full border-r border-neutral-200 last:border-0 rounded-b-xl transition-all duration-75 relative cursor-pointer
                      ${activeNotes.has(whiteKey.note) ? 'bg-neutral-300 translate-y-2 shadow-inner' : 'bg-white hover:bg-neutral-50'}
                      ${mode === 'learn' && currentSong?.notes[songIndex] === whiteKey.note ? 'shadow-[inset_0_-40px_60px_rgba(99,102,241,0.5)] z-20 scale-[1.02]' : ''}
                    `}
                  >
                    {/* Key Label */}
                    <div className="absolute bottom-8 left-0 right-0 text-center flex flex-col items-center gap-1 opacity-30 pointer-events-none">
                      {showLabels && <span className="text-[10px] font-black text-neutral-500 uppercase">{whiteKey.label}</span>}
                      {showKeys && <span className="text-[8px] font-bold text-neutral-400">{whiteKey.key.toUpperCase()}</span>}
                    </div>
                    
                    {/* Active Indicator */}
                    {activeNotes.has(whiteKey.note) && (
                      <motion.div 
                        layoutId={`active-${whiteKey.note}`}
                        className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)]"
                      />
                    )}
                    
                    {/* Learning Target Indicator */}
                    {mode === 'learn' && currentSong?.notes[songIndex] === whiteKey.note && (
                      <>
                        <motion.div 
                          animate={{ opacity: [0.2, 0.5, 0.2] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="absolute inset-0 bg-indigo-500/30 z-10 pointer-events-none"
                        />
                        <div className="absolute inset-x-1 bottom-4 h-4 bg-indigo-500 rounded-full animate-bounce shadow-[0_0_20px_rgba(99,102,241,0.8)] flex items-center justify-center">
                          <span className="text-[8px] font-black text-white uppercase tracking-tighter">TOCA</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Black Key (if follows) */}
                  {(() => {
                    const originalIdx = NOTES.findIndex(n => n.note === whiteKey.note);
                    const nextNote = NOTES[originalIdx + 1];
                    if (nextNote && nextNote.type === 'black') {
                      return (
                        <div
                          onMouseDown={(e) => { e.stopPropagation(); playNote(nextNote.note); }}
                          onMouseUp={(e) => { e.stopPropagation(); stopNote(nextNote.note); }}
                          onMouseLeave={(e) => { e.stopPropagation(); stopNote(nextNote.note); }}
                          onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); playNote(nextNote.note); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); stopNote(nextNote.note); }}
                          className={`
                            absolute top-0 right-0 translate-x-1/2 h-[60%] w-[65%] bg-gradient-to-b from-neutral-800 to-black rounded-b-xl transition-all duration-75 z-40 shadow-2xl border-x border-white/5 cursor-pointer
                            ${activeNotes.has(nextNote.note) ? 'brightness-150 translate-y-2 shadow-inner' : 'hover:brightness-125'}
                            ${mode === 'learn' && currentSong?.notes[songIndex] === nextNote.note ? 'border-b-4 border-indigo-500 shadow-[0_10px_30px_rgba(99,102,241,0.6)] scale-110 z-50' : ''}
                          `}
                        >
                          {mode === 'learn' && currentSong?.notes[songIndex] === nextNote.note && (
                            <motion.div 
                              animate={{ opacity: [0.3, 0.6, 0.3] }}
                              transition={{ duration: 1, repeat: Infinity }}
                              className="absolute inset-0 bg-indigo-500/40 z-10 pointer-events-none rounded-b-xl"
                            />
                          )}
                          <div className="absolute bottom-4 left-0 right-0 text-center flex flex-col items-center gap-1 opacity-50 pointer-events-none">
                            {showLabels && <span className="text-[8px] font-black text-white/60 uppercase">{nextNote.label}</span>}
                            {showKeys && <span className="text-[7px] font-bold text-white/50">{nextNote.key.toUpperCase()}</span>}
                          </div>
                          
                          {/* Learning Target Indicator */}
                          {mode === 'learn' && currentSong?.notes[songIndex] === nextNote.note && (
                            <div className="absolute inset-x-1 bottom-1 h-1 bg-indigo-400 rounded-full animate-pulse"></div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Song Selection Modal */}
      <AnimatePresence>
        {mode === 'learn' && !currentSong && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/98 backdrop-blur-3xl p-6 overflow-hidden"
          >
            <div className="w-full max-w-6xl max-h-full flex flex-col">
              <div className="flex justify-between items-center mb-12 shrink-0">
                <div>
                  <h3 className="text-5xl font-black text-white tracking-tighter italic uppercase">Biblioteca Musical</h3>
                  <p className="text-neutral-500 text-sm font-bold uppercase tracking-[0.3em] mt-2">Domina las piezas más famosas de la historia</p>
                </div>
                <button onClick={() => setMode('free')} className="p-5 hover:bg-white/10 rounded-full transition-all border border-white/10">
                  <Icon name="close" className="w-8 h-8" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 overflow-y-auto pr-4 custom-scrollbar pb-20 max-h-[70vh]">
                {SONGS.map((song, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => startSong(song)}
                    className={`group relative p-6 md:p-8 rounded-[32px] md:rounded-[48px] bg-gradient-to-br ${song.color} transition-all cursor-pointer hover:scale-[1.03] active:scale-95 shadow-2xl overflow-hidden border border-white/10`}
                  >
                    <div className="absolute top-0 right-0 p-4 md:p-8 opacity-10 group-hover:opacity-30 transition-opacity">
                      <Icon name="music" className="w-24 h-24 md:w-32 h-32" />
                    </div>
                    
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-8 md:mb-16">
                        <div className="flex gap-2">
                          <div 
                            onClick={(e) => { e.stopPropagation(); startSong(song); }}
                            className="w-12 h-12 md:w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl md:rounded-3xl flex items-center justify-center border border-white/20 shadow-xl hover:bg-white/30 transition-all"
                          >
                            <Icon name="play" className="w-6 h-6 md:w-8 h-8 text-white" />
                          </div>
                          <div 
                            onClick={(e) => { e.stopPropagation(); previewSong(song); }}
                            className="w-12 h-12 md:w-16 h-16 bg-black/20 backdrop-blur-xl rounded-2xl md:rounded-3xl flex items-center justify-center border border-white/10 shadow-xl hover:bg-black/30 transition-all"
                          >
                            <Icon name="volume-2" className="w-6 h-6 md:w-8 h-8 text-white" />
                          </div>
                        </div>
                        <span className="px-3 py-1 md:px-5 md:py-2 bg-black/30 backdrop-blur-xl rounded-full text-[8px] md:text-[10px] font-black text-white uppercase tracking-widest border border-white/10">
                          {song.difficulty}
                        </span>
                      </div>
                      <h4 className="text-xl md:text-3xl font-black text-white mb-1 md:mb-2 leading-tight tracking-tight">{song.name}</h4>
                      <p className="text-white/80 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-2 md:mb-4">{song.artist || 'Tradicional'}</p>
                      <p className="text-white/50 text-[9px] md:text-[10px] leading-relaxed line-clamp-2">{song.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer / Controls */}
      <div className="p-4 bg-neutral-900/90 backdrop-blur-xl border-t border-white/5 flex flex-wrap justify-between items-center gap-6 shrink-0 z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${audioReady ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]' : 'bg-red-500'}`}></div>
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.25em]">Audio Engine: {audioReady ? 'High Fidelity' : 'Initializing...'}</span>
          </div>
          
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(!showLabels)} className="hidden" />
              <div className={`w-10 h-5 rounded-full transition-colors relative ${showLabels ? 'bg-indigo-500' : 'bg-neutral-800'}`}>
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showLabels ? 'left-6' : 'left-1'}`}></div>
              </div>
              <span className="text-[10px] font-bold text-neutral-500 uppercase group-hover:text-neutral-300 transition-colors">Notas</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={showKeys} onChange={() => setShowKeys(!showKeys)} className="hidden" />
              <div className={`w-10 h-5 rounded-full transition-colors relative ${showKeys ? 'bg-indigo-500' : 'bg-neutral-800'}`}>
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showKeys ? 'left-6' : 'left-1'}`}></div>
              </div>
              <span className="text-[10px] font-bold text-neutral-500 uppercase group-hover:text-neutral-300 transition-colors">Teclas</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-4 text-neutral-500">
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Controles:</span>
          <div className="flex gap-2">
            <kbd className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white shadow-lg">Z-M</kbd>
            <kbd className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white shadow-lg">A-L</kbd>
            <kbd className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white shadow-lg">Q-P</kbd>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PianoMaster;
