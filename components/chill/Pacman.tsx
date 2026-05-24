import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import MobileGameControls from './MobileGameControls';

interface PacmanProps {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const Pacman: React.FC<PacmanProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [highScore, setHighScore] = useState(bestScore);

    const GRID_SIZE = 20;
    const COLS = 19;
    const ROWS = 21;
    const CANVAS_WIDTH = COLS * GRID_SIZE;
    const CANVAS_HEIGHT = ROWS * GRID_SIZE;

    const playerRef = useRef({ x: 9, y: 15, dx: 0, dy: 0, nextDx: 0, nextDy: 0 });
    const dotsRef = useRef<{ x: number; y: number }[]>([]);
    const wallsRef = useRef<boolean[][]>([]);
    const ghostsRef = useRef<{ x: number; y: number; dx: number; dy: number; color: string }[]>([]);
    const requestRef = useRef<number>();

    const initializeGame = () => {
        // Simple maze generation
        const walls = Array(ROWS).fill(0).map(() => Array(COLS).fill(false));
        const dots = [];

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
                    walls[r][c] = true;
                } else {
                    dots.push({ x: c, y: r });
                }
            }
        }

        wallsRef.current = walls;
        dotsRef.current = dots;
        playerRef.current = { x: 9, y: 15, dx: 0, dy: 0, nextDx: 0, nextDy: 0 };
        ghostsRef.current = [
            { x: 1, y: 1, dx: 1, dy: 0, color: '#ef4444' },
            { x: 17, y: 1, dx: -1, dy: 0, color: '#ec4899' },
            { x: 1, y: 19, dx: 1, dy: 0, color: '#06b6d4' },
            { x: 17, y: 19, dx: -1, dy: 0, color: '#f97316' }
        ];
        
        setIsPlaying(true);
        setGameOver(false);
        setScore(0);
    };

    const update = () => {
        if (!isPlaying || gameOver) return;

        const player = playerRef.current;
        const walls = wallsRef.current;

        // Try to change direction
        if (player.nextDx !== 0 || player.nextDy !== 0) {
            const nextX = player.x + player.nextDx;
            const nextY = player.y + player.nextDy;
            if (!walls[nextY]?.[nextX]) {
                player.dx = player.nextDx;
                player.dy = player.nextDy;
                player.nextDx = 0;
                player.nextDy = 0;
            }
        }

        // Move player
        const nextX = player.x + player.dx;
        const nextY = player.y + player.dy;
        if (!walls[nextY]?.[nextX]) {
            player.x = nextX;
            player.y = nextY;
        }

        // Collect dots
        const dotIndex = dotsRef.current.findIndex(d => d.x === player.x && d.y === player.y);
        if (dotIndex !== -1) {
            dotsRef.current.splice(dotIndex, 1);
            setScore(s => s + 10);
            if (dotsRef.current.length === 0) {
                endGame(true);
            }
        }

        // Move ghosts
        ghostsRef.current.forEach(ghost => {
            const nextGX = ghost.x + ghost.dx;
            const nextGY = ghost.y + ghost.dy;
            
            if (walls[nextGY]?.[nextGX] || Math.random() < 0.1) {
                const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
                const validDirs = dirs.filter(d => !walls[ghost.y + d.dy]?.[ghost.x + d.dx]);
                if (validDirs.length > 0) {
                    const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
                    ghost.dx = dir.dx;
                    ghost.dy = dir.dy;
                }
            } else {
                ghost.x = nextGX;
                ghost.y = nextGY;
            }

            // Collision with player
            if (ghost.x === player.x && ghost.y === player.y) {
                endGame(false);
            }
        });
    };

    const draw = (ctx: HTMLCanvasElement) => {
        const context = ctx.getContext('2d');
        if (!context) return;

        context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        context.fillStyle = '#000';
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw walls
        context.fillStyle = '#1e3a8a';
        wallsRef.current.forEach((row, r) => {
            row.forEach((isWall, c) => {
                if (isWall) {
                    context.fillRect(c * GRID_SIZE + 2, r * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
                }
            });
        });

        // Draw dots
        context.fillStyle = '#fde047';
        dotsRef.current.forEach(dot => {
            context.beginPath();
            context.arc(dot.x * GRID_SIZE + GRID_SIZE / 2, dot.y * GRID_SIZE + GRID_SIZE / 2, 2, 0, Math.PI * 2);
            context.fill();
        });

        // Draw player (Pac-Man)
        const player = playerRef.current;
        context.save();
        context.translate(player.x * GRID_SIZE + GRID_SIZE / 2, player.y * GRID_SIZE + GRID_SIZE / 2);
        
        // Handle rotation based on direction
        if (player.dx === 1) {
            // Face right (default)
        } else if (player.dx === -1) {
            context.rotate(Math.PI); // Face left
        } else if (player.dy === 1) {
            context.rotate(Math.PI / 2); // Face down
        } else if (player.dy === -1) {
            context.rotate(-Math.PI / 2); // Face up
        }

        // Mouth animation (chomp)
        const mouthOpen = Math.sin(Date.now() / 150) > 0;
        
        // Draw yellow pacman body
        context.fillStyle = '#fde047';
        context.beginPath();
        if (mouthOpen) {
            context.moveTo(0, 0);
            context.arc(0, 0, GRID_SIZE / 2 - 2, 0.2 * Math.PI, 1.8 * Math.PI);
            context.lineTo(0, 0);
        } else {
            context.arc(0, 0, GRID_SIZE / 2 - 2, 0, Math.PI * 2);
        }
        context.fill();
        
        context.restore();

        // Draw ghosts
        ghostsRef.current.forEach(ghost => {
            context.fillStyle = ghost.color;
            context.beginPath();
            context.arc(ghost.x * GRID_SIZE + GRID_SIZE / 2, ghost.y * GRID_SIZE + GRID_SIZE / 2 - 2, GRID_SIZE / 2 - 2, Math.PI, 0);
            context.lineTo(ghost.x * GRID_SIZE + GRID_SIZE - 4, ghost.y * GRID_SIZE + GRID_SIZE - 2);
            context.lineTo(ghost.x * GRID_SIZE + 4, ghost.y * GRID_SIZE + GRID_SIZE - 2);
            context.fill();
            
            // Eyes
            context.fillStyle = '#fff';
            context.beginPath();
            context.arc(ghost.x * GRID_SIZE + GRID_SIZE / 2 - 3, ghost.y * GRID_SIZE + GRID_SIZE / 2 - 3, 2, 0, Math.PI * 2);
            context.arc(ghost.x * GRID_SIZE + GRID_SIZE / 2 + 3, ghost.y * GRID_SIZE + GRID_SIZE / 2 - 3, 2, 0, Math.PI * 2);
            context.fill();
        });
    };


    const setDirection = (dx: number, dy: number) => {
        const player = playerRef.current;
        player.nextDx = dx;
        player.nextDy = dy;
    };

    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchStartRef.current || !isPlaying) return;
        const dx = e.touches[0].clientX - touchStartRef.current.x;
        const dy = e.touches[0].clientY - touchStartRef.current.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
        if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 1 : -1, 0);
        else setDirection(0, dy > 0 ? 1 : -1);
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const endGame = (win: boolean) => {
        setGameOver(true);
        setIsPlaying(false);
        onGameEnd(score, Math.floor(score / 50), win);
    };

    useEffect(() => {
        const loop = () => {
            update();
            if (canvasRef.current) draw(canvasRef.current);
            requestRef.current = window.setTimeout(loop, 150);
        };
        if (isPlaying) loop();
        return () => clearTimeout(requestRef.current);
    }, [isPlaying, gameOver]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const player = playerRef.current;
            if (e.key === 'ArrowUp') setDirection(0, -1);
            else if (e.key === 'ArrowDown') setDirection(0, 1);
            else if (e.key === 'ArrowLeft') setDirection(-1, 0);
            else if (e.key === 'ArrowRight') setDirection(1, 0);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="h-full flex flex-col items-center justify-center bg-neutral-950 p-3 sm:p-4 select-none overflow-y-auto" style={{ touchAction: 'none' }}>
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
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Puntos</div>
                        <div className="text-lg font-black text-yellow-400">{score}</div>
                    </div>
                </div>
            </div>

            {/* Game Area */}
            <div className="relative bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-[0_0_30px_rgba(250,204,21,0.1)] w-full max-w-[380px] max-h-[70dvh] aspect-[19/21]">
                <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} className="rounded bg-black block w-full h-full object-contain touch-none" />
                
                {!isPlaying && !gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                        <h2 className="text-2xl font-black text-yellow-400 mb-6 tracking-wider uppercase">Pacman</h2>
                        <button onClick={initializeGame} className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-full transition-all hover:scale-105">EMPEZAR</button>
                    </div>
                )}

                {gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                        <h2 className="text-3xl font-black text-red-500 mb-2 tracking-wider uppercase">¡FIN DEL JUEGO!</h2>
                        <div className="text-4xl font-black text-white mb-6">{score}</div>
                        <button onClick={initializeGame} className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-full transition-all hover:scale-105">REINTENTAR</button>
                    </div>
                )}
            </div>
            {isPlaying && !gameOver && (
                <MobileGameControls
                    hint="Control táctil: desliza o usa la cruceta"
                    up={{ label: '↑', ariaLabel: 'Subir', onPress: () => setDirection(0, -1) }}
                    down={{ label: '↓', ariaLabel: 'Bajar', onPress: () => setDirection(0, 1) }}
                    left={{ label: '←', ariaLabel: 'Izquierda', onPress: () => setDirection(-1, 0) }}
                    right={{ label: '→', ariaLabel: 'Derecha', onPress: () => setDirection(1, 0) }}
                />
            )}
        </div>
    );
};

export default Pacman;
