import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../Icon';
import { motion, AnimatePresence } from 'motion/react';

interface MemoryMatchProps {
    onBack: () => void;
    onGameEnd: (score: number, xp: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen: () => void;
    isFullscreen: boolean;
}

interface Card {
    id: number;
    content: string;
    isFlipped: boolean;
    isMatched: boolean;
    type: 'icon' | 'emoji';
}

const THEMES = {
    tech: {
        name: 'Tecnología',
        items: ['cpu', 'database', 'cloud', 'server', 'monitor', 'smartphone', 'wifi', 'bluetooth', 'code', 'terminal', 'layers', 'activity', 'shield', 'trending-up', 'circle-dot', 'layout', 'layers', 'activity', 'target', 'feather', 'mountain'],
        type: 'icon' as const
    },
    emojis: {
        name: 'Emojis',
        items: ['🔥', '🚀', '💎', '🌈', '🍕', '🎮', '🎸', '🛸', '👻', '👑', '🍀', '⚡', '🌟', '🍭', '🎈', '🎨', '🎭', '🎪', '🎬', '🎤', '🎧', '🎷', '🎲', '🧩', '🎨', '🎭', '🎪', '🎬'],
        type: 'emoji' as const
    },
    goats: {
        name: 'Cabras',
        items: ['🐐', '🏔️', '🥛', '🧀', '🌾', '🔔', '🚜', '🌲', '☀️', '🧗', '👟', '🧣', '🧶', '🧺', '🛖', '🪕', '🪗', '🥧', '🍯', '🍎', '🍐', '🍓', '🍒', '🍑', '🍇', '🍉', '🍊', '🍋'],
        type: 'emoji' as const
    }
};

const LEVELS = [
    { name: 'Fácil', rows: 4, cols: 4, pairs: 8 },
    { name: 'Medio', rows: 4, cols: 6, pairs: 12 },
    { name: 'Difícil', rows: 6, cols: 6, pairs: 18 }
];

const MemoryMatch: React.FC<MemoryMatchProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const [theme, setTheme] = useState<keyof typeof THEMES>('tech');
    const [level, setLevel] = useState(0);
    const [cards, setCards] = useState<Card[]>([]);
    const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
    const [moves, setMoves] = useState(0);
    const [matches, setMatches] = useState(0);
    const [gameStarted, setGameStarted] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const [isMemorizing, setIsMemorizing] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const initializeGame = useCallback(() => {
        const currentLevel = LEVELS[level];
        const currentTheme = THEMES[theme];
        const items = currentTheme.items.slice(0, currentLevel.pairs);
        
        const shuffledCards = [...items, ...items]
            .sort(() => Math.random() - 0.5)
            .map((content, index) => ({
                id: index,
                content,
                isFlipped: true, // Start flipped for memorization
                isMatched: false,
                type: currentTheme.type
            }));

        setCards(shuffledCards);
        setFlippedIndices([]);
        setMoves(0);
        setMatches(0);
        setScore(0);
        setGameOver(false);
        setGameStarted(true);
        setIsMemorizing(true);
        setTimeLeft(0);

        // Memorization phase
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setCards(prev => prev.map(c => ({ ...c, isFlipped: false })));
            setIsMemorizing(false);
            
            // Start game timer
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => prev + 1);
            }, 1000);
        }, 3000); // 3 seconds to memorize
    }, [level, theme]);

    const handleCardClick = (index: number) => {
        if (!gameStarted || gameOver || isMemorizing || flippedIndices.length === 2 || cards[index].isFlipped || cards[index].isMatched) {
            return;
        }

        const newFlippedIndices = [...flippedIndices, index];
        setFlippedIndices(newFlippedIndices);

        const newCards = [...cards];
        newCards[index].isFlipped = true;
        setCards(newCards);

        if (newFlippedIndices.length === 2) {
            setMoves(m => m + 1);
            const [firstIndex, secondIndex] = newFlippedIndices;
            
            if (newCards[firstIndex].content === newCards[secondIndex].content) {
                // Match
                newCards[firstIndex].isMatched = true;
                newCards[secondIndex].isMatched = true;
                setCards(newCards);
                setFlippedIndices([]);
                setMatches(m => m + 1);
                
                // Calculate score: base 100 + time bonus
                const timeBonus = Math.max(0, 50 - timeLeft);
                const newScore = score + 100 + timeBonus;
                setScore(newScore);

                if (matches + 1 === LEVELS[level].pairs) {
                    // Game Over
                    setGameOver(true);
                    if (timerRef.current) clearInterval(timerRef.current);
                    
                    const moveBonus = Math.max(0, (LEVELS[level].pairs * 5) - moves) * 20;
                    const finalScore = newScore + moveBonus;
                    setScore(finalScore);
                    
                    const xp = Math.floor(finalScore / 10);
                    const hitMilestone = finalScore >= (level + 1) * 500;
                    
                    setTimeout(() => {
                        onGameEnd(finalScore, xp, hitMilestone);
                    }, 1000);
                }
            } else {
                // No match
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    setCards(prev => {
                        const reset = [...prev];
                        reset[firstIndex].isFlipped = false;
                        reset[secondIndex].isFlipped = false;
                        return reset;
                    });
                    setFlippedIndices([]);
                }, 1000);
            }
        }
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const handleBack = () => {
        if (isFullscreen && toggleFullscreen) toggleFullscreen();
        onBack();
    };

    return (
        <div className="h-full flex flex-col bg-neutral-950 relative overflow-hidden select-none">
            {/* Header */}
            <div className="p-4 md:p-6 flex justify-between items-center z-30 bg-neutral-950/50 backdrop-blur-md border-b border-white/5">
                <div className="flex gap-3">
                    <button onClick={handleBack} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all text-white">
                        <Icon name="arrow-left" className="w-5 h-5" />
                    </button>
                    <button onClick={toggleFullscreen} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all text-white">
                        <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex gap-4 md:gap-8 bg-black/40 px-6 py-2 rounded-2xl border border-white/10">
                    <div className="text-center">
                        <span className="text-[10px] text-neutral-500 uppercase block font-black tracking-widest mb-1">Tiempo</span>
                        <span className="text-xl font-mono font-black text-white">{timeLeft}s</span>
                    </div>
                    <div className="w-px h-8 bg-white/10"></div>
                    <div className="text-center">
                        <span className="text-[10px] text-neutral-500 uppercase block font-black tracking-widest mb-1">Movimientos</span>
                        <span className="text-xl font-mono font-black text-indigo-400">{moves}</span>
                    </div>
                    <div className="w-px h-8 bg-white/10 hidden sm:block"></div>
                    <div className="text-center hidden sm:block">
                        <span className="text-[10px] text-neutral-500 uppercase block font-black tracking-widest mb-1">Puntos</span>
                        <span className="text-xl font-mono font-black text-emerald-400">{score}</span>
                    </div>
                </div>

                <div className="hidden md:flex gap-2">
                    <div className="bg-white/5 px-3 py-1 rounded-lg border border-white/10 text-[10px] font-black uppercase text-neutral-400">
                        {LEVELS[level].name}
                    </div>
                    <div className="bg-white/5 px-3 py-1 rounded-lg border border-white/10 text-[10px] font-black uppercase text-neutral-400">
                        {THEMES[theme].name}
                    </div>
                </div>
            </div>

            {/* Game Board */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
                {(!gameStarted || gameOver) ? (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-neutral-900/80 backdrop-blur-xl p-8 rounded-3xl border border-white/10 flex flex-col items-center justify-center z-20 max-w-lg w-full text-center shadow-2xl"
                    >
                        <div className="w-24 h-24 bg-emerald-500/20 rounded-3xl flex items-center justify-center mb-6 border border-emerald-500/30">
                            <Icon name="grid" className="w-12 h-12 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
                        </div>
                        
                        <h2 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase">MEMORIA CABRA</h2>
                        
                        {gameOver ? (
                            <div className="mb-8 w-full">
                                <p className="text-xl text-emerald-400 font-black mb-4 uppercase tracking-widest">¡NIVEL COMPLETADO!</p>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                                        <p className="text-[10px] text-neutral-500 uppercase font-bold mb-1">Puntos</p>
                                        <p className="text-2xl font-black text-white">{score}</p>
                                    </div>
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                                        <p className="text-[10px] text-neutral-500 uppercase font-bold mb-1">Tiempo</p>
                                        <p className="text-2xl font-black text-white">{timeLeft}s</p>
                                    </div>
                                </div>
                                <p className="text-xs text-neutral-500 uppercase tracking-widest">Mejor Puntuación: {Math.max(score, bestScore)}</p>
                            </div>
                        ) : (
                            <div className="mb-8 w-full space-y-6">
                                <p className="text-neutral-400 text-sm">
                                    Memoriza las cartas antes de que se den la vuelta. ¡Sé rápido para ganar más puntos!
                                </p>
                                
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] text-neutral-500 uppercase font-black tracking-widest mb-2 text-left">Dificultad</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {LEVELS.map((l, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setLevel(i)}
                                                    className={`py-2 rounded-xl text-xs font-black transition-all border ${level === i ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'}`}
                                                >
                                                    {l.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <p className="text-[10px] text-neutral-500 uppercase font-black tracking-widest mb-2 text-left">Tema</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(Object.keys(THEMES) as Array<keyof typeof THEMES>).map((t) => (
                                                <button
                                                    key={t}
                                                    onClick={() => setTheme(t)}
                                                    className={`py-2 rounded-xl text-xs font-black transition-all border ${theme === t ? 'bg-emerald-600 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'}`}
                                                >
                                                    {THEMES[t].name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button 
                            onClick={initializeGame}
                            className="w-full py-4 bg-white text-neutral-950 rounded-2xl font-black text-xl transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                        >
                            {gameOver ? 'REINTENTAR' : 'JUGAR AHORA'}
                        </button>
                    </motion.div>
                ) : (
                    <div 
                        className="grid gap-3 md:gap-4 w-full max-w-4xl"
                        style={{ 
                            gridTemplateColumns: `repeat(${LEVELS[level].cols}, 1fr)`,
                            gridTemplateRows: `repeat(${LEVELS[level].rows}, 1fr)`,
                            aspectRatio: `${LEVELS[level].cols} / ${LEVELS[level].rows}`
                        }}
                    >
                        <AnimatePresence>
                            {cards.map((card, index) => (
                                <motion.div 
                                    key={card.id}
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => handleCardClick(index)}
                                    className={`relative cursor-pointer transition-all duration-300 ${card.isMatched ? 'opacity-40 scale-90 pointer-events-none' : 'hover:scale-105 active:scale-95'}`}
                                    style={{ perspective: '1000px' }}
                                >
                                    <div 
                                        className="w-full h-full absolute top-0 left-0 transition-all duration-500 rounded-xl md:rounded-2xl"
                                        style={{ 
                                            transformStyle: 'preserve-3d',
                                            transform: card.isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                                        }}
                                    >
                                        {/* Front (Hidden) */}
                                        <div 
                                            className="absolute w-full h-full backface-hidden bg-neutral-800 border border-white/5 rounded-xl md:rounded-2xl flex items-center justify-center shadow-xl overflow-hidden"
                                            style={{ backfaceVisibility: 'hidden' }}
                                        >
                                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, #fff 5px, #fff 10px)' }}></div>
                                            <img 
                                                src="/favicon.ico" 
                                                alt="Logo"
                                                className="w-8 h-8 md:w-12 md:h-12 object-contain opacity-30 z-10"
                                                referrerPolicy="no-referrer"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";
                                                }}
                                            />
                                        </div>
                                        
                                        {/* Back (Revealed) */}
                                        <div 
                                            className={`absolute w-full h-full backface-hidden rounded-xl md:rounded-2xl flex items-center justify-center shadow-2xl border ${card.isMatched ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-gradient-to-br from-neutral-800 to-neutral-900 border-white/10'}`}
                                            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                                        >
                                            {card.type === 'icon' ? (
                                                <Icon name={card.content} className={`w-6 h-6 md:w-10 md:h-10 ${card.isMatched ? 'text-emerald-400' : 'text-indigo-400'} drop-shadow-lg`} />
                                            ) : (
                                                <span className="text-2xl md:text-4xl drop-shadow-lg">{card.content}</span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Memorize Overlay */}
            {isMemorizing && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-8 py-3 rounded-full font-black text-sm tracking-widest shadow-2xl animate-bounce">
                    ¡MEMORIZA LAS CARTAS!
                </div>
            )}
        </div>
    );
};

export default MemoryMatch;
