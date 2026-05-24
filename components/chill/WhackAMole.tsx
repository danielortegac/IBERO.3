import React, { useEffect, useState, useCallback, useRef } from 'react';
import Icon from '../Icon';

interface WhackAMoleProps {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const WhackAMole: React.FC<WhackAMoleProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const [moles, setMoles] = useState<boolean[]>(Array(9).fill(false));
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [highScore, setHighScore] = useState(bestScore);
    
    const timerRef = useRef<number>();
    const moleTimerRef = useRef<number>();

    const startGame = useCallback(() => {
        setScore(0);
        setTimeLeft(30);
        setGameOver(false);
        setIsPlaying(true);
        setMoles(Array(9).fill(false));
    }, []);

    const whack = (index: number) => {
        if (moles[index] && isPlaying) {
            setScore(s => s + 1);
            const newMoles = [...moles];
            newMoles[index] = false;
            setMoles(newMoles);
        }
    };

    const spawnMole = useCallback(() => {
        if (!isPlaying) return;
        const index = Math.floor(Math.random() * 9);
        const newMoles = [...moles];
        newMoles[index] = true;
        setMoles(newMoles);

        setTimeout(() => {
            setMoles(prev => {
                const updated = [...prev];
                updated[index] = false;
                return updated;
            });
        }, 800 + Math.random() * 400);
    }, [isPlaying, moles]);

    useEffect(() => {
        if (isPlaying && timeLeft > 0) {
            timerRef.current = window.setInterval(() => {
                setTimeLeft(t => t - 1);
            }, 1000);

            moleTimerRef.current = window.setInterval(() => {
                spawnMole();
            }, 600);
        } else if (timeLeft === 0) {
            setIsPlaying(false);
            setGameOver(true);
            const xpGained = Math.floor(score / 5);
            onGameEnd(score, xpGained, score >= 20);
        }

        return () => {
            clearInterval(timerRef.current);
            clearInterval(moleTimerRef.current);
        };
    }, [isPlaying, timeLeft, spawnMole]);

    return (
        <div className="h-full flex flex-col items-center justify-center bg-neutral-950 p-4 select-none">
            {/* Header */}
            <div className="w-full max-w-md flex justify-between items-center mb-6">
                <div className="flex gap-2">
                    <button 
                        onClick={onBack}
                        className="p-2 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                    >
                        <Icon name="arrow-left" className="w-5 h-5" />
                    </button>
                    {toggleFullscreen && (
                        <button 
                            onClick={toggleFullscreen}
                            className="p-2 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                        >
                            <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                        </button>
                    )}
                </div>
                
                <div className="flex gap-4 text-center">
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Tiempo</div>
                        <div className="text-lg font-black text-red-400">{timeLeft}s</div>
                    </div>
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Puntos</div>
                        <div className="text-lg font-black text-white">{score}</div>
                    </div>
                </div>
            </div>

            {/* Game Board */}
            <div className="relative bg-neutral-900 p-4 rounded-2xl border border-neutral-800 shadow-[0_0_40px_rgba(239,68,68,0.1)] w-full max-w-[400px] grid grid-cols-3 gap-4">
                {moles.map((active, index) => (
                    <div 
                        key={index}
                        onClick={() => whack(index)}
                        className="aspect-square bg-neutral-950 rounded-full border-4 border-neutral-800 relative overflow-hidden cursor-pointer"
                    >
                        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-200 transform ${active ? 'translate-y-0' : 'translate-y-full'}`}>
                            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.5)] text-4xl">
                                🐐
                            </div>
                        </div>
                    </div>
                ))}

                {!isPlaying && !gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-2xl backdrop-blur-sm z-20">
                        <h2 className="text-2xl font-black text-white mb-6 tracking-wider">PROTEGE EL REBAÑO</h2>
                        <button 
                            onClick={startGame}
                            className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-full transition-all hover:scale-105"
                        >
                            EMPEZAR
                        </button>
                    </div>
                )}

                {gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-2xl backdrop-blur-sm z-20">
                        <h2 className="text-3xl font-black text-red-500 mb-2 tracking-wider">¡TIEMPO AGOTADO!</h2>
                        <div className="text-4xl font-black text-white mb-6">{score}</div>
                        <button 
                            onClick={startGame}
                            className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-full transition-all hover:scale-105"
                        >
                            REINTENTAR
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WhackAMole;
