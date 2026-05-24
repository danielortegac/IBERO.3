import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';

interface FlappyGoatProps {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const FlappyGoat: React.FC<FlappyGoatProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [highScore, setHighScore] = useState(bestScore);

    // Game constants
    const CANVAS_WIDTH = 400;
    const CANVAS_HEIGHT = 600;
    const GRAVITY = 0.25;
    const JUMP_STRENGTH = -6;
    const PIPE_WIDTH = 60;
    const PIPE_GAP = 160;
    const PIPE_SPEED = 2.5;
    const PIPE_SPAWN_RATE = 100; // frames

    // Game state refs
    const birdRef = useRef({
        x: 50,
        y: 300,
        velocity: 0,
        radius: 15
    });
    const pipesRef = useRef<{ x: number; topHeight: number; passed: boolean }[]>([]);
    const frameCountRef = useRef(0);
    const requestRef = useRef<number>();

    const startGame = () => {
        setIsPlaying(true);
        setGameOver(false);
        setScore(0);
        birdRef.current = { x: 50, y: 300, velocity: 0, radius: 15 };
        pipesRef.current = [];
        frameCountRef.current = 0;
    };

    const jump = () => {
        if (!isPlaying && !gameOver) {
            startGame();
        } else if (isPlaying) {
            birdRef.current.velocity = JUMP_STRENGTH;
        }
    };

    const update = () => {
        if (!isPlaying || gameOver) return;

        const bird = birdRef.current;
        bird.velocity += GRAVITY;
        bird.y += bird.velocity;

        // Collision with floor/ceiling
        if (bird.y + bird.radius > CANVAS_HEIGHT || bird.y - bird.radius < 0) {
            endGame();
        }

        // Update pipes
        frameCountRef.current++;
        if (frameCountRef.current % PIPE_SPAWN_RATE === 0) {
            const minHeight = 50;
            const maxHeight = CANVAS_HEIGHT - PIPE_GAP - minHeight;
            const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
            pipesRef.current.push({ x: CANVAS_WIDTH, topHeight, passed: false });
        }

        pipesRef.current.forEach((pipe, index) => {
            pipe.x -= PIPE_SPEED;

            // Collision detection
            if (
                bird.x + bird.radius > pipe.x &&
                bird.x - bird.radius < pipe.x + PIPE_WIDTH &&
                (bird.y - bird.radius < pipe.topHeight || bird.y + bird.radius > pipe.topHeight + PIPE_GAP)
            ) {
                endGame();
            }

            // Score update
            if (!pipe.passed && bird.x > pipe.x + PIPE_WIDTH) {
                pipe.passed = true;
                setScore(s => s + 1);
            }
        });

        // Remove off-screen pipes
        pipesRef.current = pipesRef.current.filter(p => p.x + PIPE_WIDTH > 0);
    };

    const draw = (ctx: HTMLCanvasElement) => {
        const context = ctx.getContext('2d');
        if (!context) return;

        // Clear
        context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Background
        context.fillStyle = '#0a0a0a';
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw pipes
        pipesRef.current.forEach(pipe => {
            // Top pipe
            const gradientTop = context.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0);
            gradientTop.addColorStop(0, '#4f46e5');
            gradientTop.addColorStop(1, '#818cf8');
            context.fillStyle = gradientTop;
            context.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
            
            // Bottom pipe
            const gradientBottom = context.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0);
            gradientBottom.addColorStop(0, '#4f46e5');
            gradientBottom.addColorStop(1, '#818cf8');
            context.fillStyle = gradientBottom;
            context.fillRect(pipe.x, pipe.topHeight + PIPE_GAP, PIPE_WIDTH, CANVAS_HEIGHT - (pipe.topHeight + PIPE_GAP));
            
            // Pipe caps
            context.fillStyle = '#c7d2fe';
            context.fillRect(pipe.x - 2, pipe.topHeight - 10, PIPE_WIDTH + 4, 10);
            context.fillRect(pipe.x - 2, pipe.topHeight + PIPE_GAP, PIPE_WIDTH + 4, 10);
        });

        // Draw bird (Goat)
        const bird = birdRef.current;
        context.save();
        context.translate(bird.x, bird.y);
        context.rotate(Math.min(Math.PI / 4, Math.max(-Math.PI / 4, bird.velocity * 0.1)));
        context.scale(-1, 1); // Flip to face right (forward)
        
        context.font = `${bird.radius * 2.5}px serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('🐐', 0, 0);
        
        context.restore();

        // UI
        if (!isPlaying && !gameOver) {
            context.fillStyle = 'rgba(0,0,0,0.5)';
            context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            context.fillStyle = '#fff';
            context.font = 'bold 24px Inter';
            context.textAlign = 'center';
            context.fillText('FLAPPY GOAT', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
            context.font = '16px Inter';
            context.fillText('Toca o pulsa Espacio para saltar', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
        }
    };

    const endGame = () => {
        setGameOver(true);
        setIsPlaying(false);
        
        const xpGained = Math.floor(score / 5);
        const hitMilestone = score >= 20;
        
        if (score > highScore) {
            setHighScore(score);
        }
        
        onGameEnd(score, xpGained, hitMilestone);
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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                jump();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, gameOver]);

    return (
        <div className="h-full flex flex-col items-center justify-center bg-neutral-950 p-3 sm:p-4 select-none overflow-y-auto" style={{ touchAction: 'none' }}>
            {/* Header */}
            <div className="w-full max-w-md flex justify-between items-center mb-4">
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
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Puntos</div>
                        <div className="text-lg font-black text-indigo-400">{score}</div>
                    </div>
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Récord</div>
                        <div className="text-lg font-black text-yellow-400">{highScore}</div>
                    </div>
                </div>
            </div>

            {/* Game Area */}
            <div 
                className="relative bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-[0_0_30px_rgba(79,70,229,0.1)] w-full max-w-[400px] max-h-[70dvh] aspect-[2/3] cursor-pointer overflow-hidden touch-none"
                onPointerDown={(e) => { e.preventDefault(); jump(); }}
            >
                <canvas
                    ref={canvasRef}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    className="rounded bg-black block w-full h-full object-contain"
                />
                
                {gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                        <h2 className="text-3xl font-black text-red-500 mb-2 tracking-wider">¡FIN DEL VUELO!</h2>
                        <div className="text-4xl font-black text-white mb-6">{score}</div>
                        <button 
                            onClick={startGame}
                            className="px-8 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-black rounded-full transition-all hover:scale-105"
                        >
                            REINTENTAR
                        </button>
                    </div>
                )}
            </div>
            <div className="md:hidden mt-3 w-full max-w-md px-4 py-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-center text-xs font-bold text-indigo-100">
                Toca cualquier parte del juego para volar. Mantén el celular vertical para mejor control.
            </div>
        </div>
    );
};

export default FlappyGoat;
