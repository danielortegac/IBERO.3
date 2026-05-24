import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../Icon';
import MobileGameControls from './MobileGameControls';

interface NeonSnakeProps {
    onBack: () => void;
    onGameEnd: (score: number, xp: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const GRID_SIZE = 20;
const CELL_SIZE = 20;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 2;
const MIN_SPEED = 50;
const MILESTONE_SCORE = 200; // Increased from 100 to 200 to make it harder

type Point = { x: number, y: number };

const NeonSnake: React.FC<NeonSnakeProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const [snake, setSnake] = useState<Point[]>([{ x: 10, y: 10 }]);
    const [food, setFood] = useState<Point>({ x: 15, y: 15 });
    const [direction, setDirection] = useState<Point>({ x: 0, y: 0 });
    const [nextDirection, setNextDirection] = useState<Point>({ x: 0, y: 0 });
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);
    const [speed, setSpeed] = useState(INITIAL_SPEED);
    const [milestonesHit, setMilestonesHit] = useState(0);

    const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
    const boardRef = useRef<HTMLDivElement>(null);

    const generateFood = useCallback((currentSnake: Point[]) => {
        let newFood: Point;
        while (true) {
            newFood = {
                x: Math.floor(Math.random() * GRID_SIZE),
                y: Math.floor(Math.random() * GRID_SIZE)
            };
            // eslint-disable-next-line no-loop-func
            if (!currentSnake.some(segment => segment.x === newFood.x && segment.y === newFood.y)) {
                break;
            }
        }
        return newFood;
    }, []);

    const startGame = () => {
        setSnake([{ x: 10, y: 10 }]);
        setDirection({ x: 1, y: 0 });
        setNextDirection({ x: 1, y: 0 });
        setFood(generateFood([{ x: 10, y: 10 }]));
        setScore(0);
        setSpeed(INITIAL_SPEED);
        setGameOver(false);
        setIsPlaying(true);
        setShowInstructions(false);
        setMilestonesHit(0);
        if (boardRef.current) boardRef.current.focus();
    };

    const endGame = useCallback(() => {
        setIsPlaying(false);
        setGameOver(true);
        if (gameLoopRef.current) clearInterval(gameLoopRef.current);
        
        // Calculate rewards
        const xpGained = score * 2; // 2 XP per point
        
        onGameEnd(score, xpGained, false); // Milestones are sent during the game
    }, [score, onGameEnd]);

    const moveSnake = useCallback(() => {
        if (!isPlaying || gameOver) return;

        setSnake(prevSnake => {
            const head = prevSnake[0];
            const newHead = {
                x: head.x + nextDirection.x,
                y: head.y + nextDirection.y
            };

            // Check wall collision
            if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
                endGame();
                return prevSnake;
            }

            // Check self collision
            if (prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
                endGame();
                return prevSnake;
            }

            const newSnake = [newHead, ...prevSnake];

            // Check food collision
            if (newHead.x === food.x && newHead.y === food.y) {
                const newScore = score + 10;
                setScore(newScore);
                setFood(generateFood(newSnake));
                setSpeed(prev => Math.max(MIN_SPEED, prev - SPEED_INCREMENT));
                
                // Check milestone
                if (newScore > 0 && newScore % MILESTONE_SCORE === 0) {
                    setMilestonesHit(prev => prev + 1);
                    // We don't call onGameEnd here because we want to accumulate and send at the end, 
                    // or we could send it immediately. Let's send it immediately to update the bar in real-time.
                    onGameEnd(newScore, 0, true); // Send milestone hit, XP will be sent at the end
                }
            } else {
                newSnake.pop();
            }

            setDirection(nextDirection);
            return newSnake;
        });
    }, [isPlaying, gameOver, nextDirection, food, score, generateFood, endGame, onGameEnd]);

    useEffect(() => {
        if (isPlaying) {
            gameLoopRef.current = setInterval(moveSnake, speed);
        }
        return () => {
            if (gameLoopRef.current) clearInterval(gameLoopRef.current);
        };
    }, [isPlaying, moveSnake, speed]);


    const changeDirection = (dir: Point) => {
        if (!isPlaying) return;
        if (dir.x !== 0 && direction.x === -dir.x) return;
        if (dir.y !== 0 && direction.y === -dir.y) return;
        setNextDirection(dir);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (showInstructions && e.code === 'Space') {
                startGame();
                return;
            }
            if (!isPlaying) return;

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    if (direction.y !== 1) setNextDirection({ x: 0, y: -1 });
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    if (direction.y !== -1) setNextDirection({ x: 0, y: 1 });
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    if (direction.x !== 1) setNextDirection({ x: -1, y: 0 });
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    if (direction.x !== -1) setNextDirection({ x: 1, y: 0 });
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [direction, isPlaying, showInstructions]);

    // Touch controls
    const [touchStart, setTouchStart] = useState<{x: number, y: number} | null>(null);
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchStart || !isPlaying) return;
        const touchEnd = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const dx = touchEnd.x - touchStart.x;
        const dy = touchEnd.y - touchStart.y;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal swipe
            if (dx > 30 && direction.x !== -1) setNextDirection({ x: 1, y: 0 });
            else if (dx < -30 && direction.x !== 1) setNextDirection({ x: -1, y: 0 });
        } else {
            // Vertical swipe
            if (dy > 30 && direction.y !== -1) setNextDirection({ x: 0, y: 1 });
            else if (dy < -30 && direction.y !== 1) setNextDirection({ x: 0, y: -1 });
        }
        setTouchStart(touchEnd);
    };

    return (
        <div className="h-full flex flex-col bg-neutral-950 text-white relative overflow-hidden" style={{ touchAction: 'none' }}>
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-emerald-500/20 bg-neutral-900/50 backdrop-blur-md z-10">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-white">
                        <Icon name="arrow-left" className="w-5 h-5" />
                    </button>
                    {toggleFullscreen && (
                        <button 
                            onClick={toggleFullscreen}
                            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-white"
                            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                        >
                            <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <span className="text-[10px] text-emerald-500 uppercase font-bold tracking-widest">Score</span>
                        <div className="text-2xl font-black">{score}</div>
                    </div>
                    <div className="text-center">
                        <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">Mejor</span>
                        <div className="text-2xl font-black text-neutral-400">{Math.max(score, bestScore)}</div>
                    </div>
                </div>
            </div>

            {/* Game Area */}
            <div className="flex-1 flex items-center justify-center p-4 relative">
                {/* Background Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vmin] h-[80vmin] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

                <div 
                    ref={boardRef}
                    className="relative bg-neutral-900 border-2 border-emerald-500/30 rounded-xl shadow-[0_0_50px_-15px_rgba(52,211,153,0.3)] overflow-hidden outline-none w-full max-w-[600px] aspect-square"
                    tabIndex={0}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                >
                    {/* Grid Background */}
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: `${100/GRID_SIZE}% ${100/GRID_SIZE}%`
                    }}></div>

                    {/* Food */}
                    <div 
                        className="absolute bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse"
                        style={{
                            width: `${100/GRID_SIZE}%`,
                            height: `${100/GRID_SIZE}%`,
                            left: `${(food.x / GRID_SIZE) * 100}%`,
                            top: `${(food.y / GRID_SIZE) * 100}%`,
                            transform: 'scale(0.8)'
                        }}
                    ></div>

                    {/* Snake */}
                    {snake.map((segment, index) => (
                        <div 
                            key={`${segment.x}-${segment.y}-${index}`}
                            className={`absolute rounded-sm ${index === 0 ? 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)] z-10' : 'bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]'}`}
                            style={{
                                width: `${100/GRID_SIZE}%`,
                                height: `${100/GRID_SIZE}%`,
                                left: `${(segment.x / GRID_SIZE) * 100}%`,
                                top: `${(segment.y / GRID_SIZE) * 100}%`,
                                transform: index === 0 ? 'scale(1)' : 'scale(0.9)',
                                opacity: 1 - (index * 0.02)
                            }}
                        ></div>
                    ))}
                </div>

                {/* Overlays */}
                {showInstructions && (
                    <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-20">
                        <div className="bg-neutral-900 border border-emerald-500/30 p-8 rounded-3xl max-w-md text-center shadow-2xl">
                            <Icon name="grid" className="w-16 h-16 text-emerald-400 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
                            <h2 className="text-3xl font-black text-white mb-2">Neon Snake</h2>
                            <p className="text-neutral-400 mb-6">Usa las flechas ⬆️⬇️⬅️➡️ o desliza para moverte. Come los puntos brillantes. Cada {MILESTONE_SCORE} puntos llenas un hito de tu barra diaria.</p>
                            <button 
                                onClick={startGame}
                                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-lg rounded-xl transition-all shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:shadow-[0_0_30px_rgba(52,211,153,0.6)] hover:-translate-y-1"
                            >
                                JUGAR AHORA
                            </button>
                        </div>
                    </div>
                )}

                {gameOver && !showInstructions && (
                    <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-20">
                        <div className="bg-neutral-900 border border-red-500/30 p-8 rounded-3xl max-w-md text-center shadow-2xl">
                            <h2 className="text-4xl font-black text-white mb-2">Game Over</h2>
                            <p className="text-neutral-400 mb-6">Score final: <span className="text-emerald-400 font-bold text-xl">{score}</span></p>
                            <div className="flex gap-4">
                                <button 
                                    onClick={onBack}
                                    className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-colors"
                                >
                                    Salir
                                </button>
                                <button 
                                    onClick={startGame}
                                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black rounded-xl transition-all shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                                >
                                    Reintentar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {isPlaying && !gameOver && !showInstructions && (
                <MobileGameControls
                    hint="Control táctil: desliza o usa la cruceta"
                    up={{ label: '↑', ariaLabel: 'Subir', onPress: () => changeDirection({ x: 0, y: -1 }) }}
                    down={{ label: '↓', ariaLabel: 'Bajar', onPress: () => changeDirection({ x: 0, y: 1 }) }}
                    left={{ label: '←', ariaLabel: 'Izquierda', onPress: () => changeDirection({ x: -1, y: 0 }) }}
                    right={{ label: '→', ariaLabel: 'Derecha', onPress: () => changeDirection({ x: 1, y: 0 }) }}
                />
            )}
        </div>
    );
};

export default NeonSnake;
