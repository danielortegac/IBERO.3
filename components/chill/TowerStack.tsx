import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';

interface TowerStackProps {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const TowerStack: React.FC<TowerStackProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [highScore, setHighScore] = useState(bestScore);

    const CANVAS_WIDTH = 400;
    const CANVAS_HEIGHT = 600;
    const BLOCK_HEIGHT = 40;
    const INITIAL_WIDTH = 200;

    const blocksRef = useRef<{ x: number; y: number; width: number; color: string }[]>([]);
    const currentBlockRef = useRef({ x: 0, y: 0, width: INITIAL_WIDTH, dx: 3 });
    const requestRef = useRef<number>();

    const startGame = () => {
        setScore(0);
        setGameOver(false);
        setIsPlaying(true);
        blocksRef.current = [{ x: 100, y: CANVAS_HEIGHT - BLOCK_HEIGHT, width: INITIAL_WIDTH, color: '#4f46e5' }];
        currentBlockRef.current = { x: 0, y: CANVAS_HEIGHT - BLOCK_HEIGHT * 2, width: INITIAL_WIDTH, dx: 3 };
    };

    const placeBlock = () => {
        if (!isPlaying || gameOver) return;

        const current = currentBlockRef.current;
        const last = blocksRef.current[blocksRef.current.length - 1];

        // Calculate overlap
        const left = Math.max(current.x, last.x);
        const right = Math.min(current.x + current.width, last.x + last.width);
        const overlap = right - left;

        if (overlap <= 0) {
            endGame();
            return;
        }

        // Add block
        blocksRef.current.push({
            x: left,
            y: current.y,
            width: overlap,
            color: `hsl(${(blocksRef.current.length * 20) % 360}, 70%, 60%)`
        });

        setScore(s => s + 1);

        // Prepare next block
        currentBlockRef.current = {
            x: 0,
            y: current.y - BLOCK_HEIGHT,
            width: overlap,
            dx: 3 + Math.floor(blocksRef.current.length / 5)
        };

        // Scroll view if needed
        if (blocksRef.current.length > 8) {
            blocksRef.current.forEach(b => b.y += BLOCK_HEIGHT);
            currentBlockRef.current.y += BLOCK_HEIGHT;
        }
    };

    const update = () => {
        if (!isPlaying || gameOver) return;

        const current = currentBlockRef.current;
        current.x += current.dx;

        if (current.x + current.width > CANVAS_WIDTH || current.x < 0) {
            current.dx *= -1;
        }
    };

    const draw = (ctx: HTMLCanvasElement) => {
        const context = ctx.getContext('2d');
        if (!context) return;

        context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        context.fillStyle = '#0a0a0a';
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw static blocks
        blocksRef.current.forEach(block => {
            context.fillStyle = block.color;
            context.fillRect(block.x, block.y, block.width, BLOCK_HEIGHT);
            context.strokeStyle = 'rgba(255,255,255,0.2)';
            context.strokeRect(block.x, block.y, block.width, BLOCK_HEIGHT);
        });

        // Draw moving block
        if (isPlaying && !gameOver) {
            const current = currentBlockRef.current;
            context.fillStyle = '#fff';
            context.fillRect(current.x, current.y, current.width, BLOCK_HEIGHT);
            context.shadowBlur = 10;
            context.shadowColor = '#fff';
            context.strokeRect(current.x, current.y, current.width, BLOCK_HEIGHT);
            context.shadowBlur = 0;
        }
    };

    const endGame = () => {
        setGameOver(true);
        setIsPlaying(false);
        onGameEnd(score, Math.floor(score / 2), score >= 15);
    };

    useEffect(() => {
        const loop = () => {
            update();
            if (canvasRef.current) draw(canvasRef.current);
            requestRef.current = requestAnimationFrame(loop);
        };
        requestRef.current = requestAnimationFrame(loop);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying, gameOver]);

    return (
        <div className="h-full flex flex-col items-center justify-center bg-neutral-950 p-4 select-none">
            {/* Header */}
            <div className="w-full max-w-md flex justify-between items-center mb-4">
                <div className="flex gap-2">
                    <button onClick={onBack} className="p-2 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors">
                        <Icon name="arrow-left" className="w-5 h-5" />
                    </button>
                    {toggleFullscreen && (
                        <button onClick={toggleFullscreen} className="p-2 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors">
                            <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                        </button>
                    )}
                </div>
                <div className="flex gap-4">
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Bloques</div>
                        <div className="text-lg font-black text-cyan-400">{score}</div>
                    </div>
                </div>
            </div>

            {/* Game Area */}
            <div 
                className="relative bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-[0_0_30px_rgba(6,182,212,0.1)] w-full max-w-[400px] aspect-[2/3] cursor-pointer overflow-hidden"
                onClick={placeBlock}
            >
                <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="rounded bg-black block w-full h-full object-contain" />
                
                {!isPlaying && !gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                        <h2 className="text-2xl font-black text-white mb-6 tracking-wider uppercase">TOWER STACK</h2>
                        <button onClick={startGame} className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-full transition-all hover:scale-105">EMPEZAR</button>
                    </div>
                )}

                {gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                        <h2 className="text-3xl font-black text-red-500 mb-2 tracking-wider uppercase">¡TORRE CAÍDA!</h2>
                        <div className="text-4xl font-black text-white mb-6">{score}</div>
                        <button onClick={startGame} className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-full transition-all hover:scale-105">REINTENTAR</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TowerStack;
