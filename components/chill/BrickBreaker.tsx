import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../Icon';

interface BrickBreakerProps {
    onBack: () => void;
    onGameEnd: (score: number, xp: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 15;
const BALL_RADIUS = 8;
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_HEIGHT = 20;
const BRICK_PADDING = 10;
const BRICK_OFFSET_TOP = 40;
const BRICK_OFFSET_LEFT = 30;
const MILESTONE_SCORE = 1000;

const BrickBreaker: React.FC<BrickBreakerProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);

    const gameState = useRef({
        paddleX: 0,
        ballX: 0,
        ballY: 0,
        dx: 4,
        dy: -4,
        bricks: [] as { x: number, y: number, status: number }[][],
        canvasWidth: 0,
        canvasHeight: 0
    });

    const initBricks = useCallback(() => {
        const bricks = [];
        for (let c = 0; c < BRICK_COLS; c++) {
            bricks[c] = [];
            for (let r = 0; r < BRICK_ROWS; r++) {
                bricks[c][r] = { x: 0, y: 0, status: 1 };
            }
        }
        return bricks;
    }, []);

    const startGame = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        gameState.current.canvasWidth = canvas.width;
        gameState.current.canvasHeight = canvas.height;
        gameState.current.paddleX = (canvas.width - PADDLE_WIDTH) / 2;
        gameState.current.ballX = canvas.width / 2;
        gameState.current.ballY = canvas.height - 30;
        gameState.current.dx = 4;
        gameState.current.dy = -4;
        gameState.current.bricks = initBricks();
        
        setScore(0);
        setGameOver(false);
        setIsPlaying(true);
        setShowInstructions(false);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const drawBall = () => {
            ctx.beginPath();
            ctx.arc(gameState.current.ballX, gameState.current.ballY, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = "#fb923c"; // orange-400
            ctx.fill();
            ctx.closePath();
            
            // Glow effect
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#fb923c";
        };

        const drawPaddle = () => {
            ctx.beginPath();
            ctx.rect(gameState.current.paddleX, canvas.height - PADDLE_HEIGHT - 10, PADDLE_WIDTH, PADDLE_HEIGHT);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.closePath();
            
            // Draw "Goat Horns" on paddle
            ctx.fillStyle = "#a1a1aa";
            ctx.fillRect(gameState.current.paddleX, canvas.height - PADDLE_HEIGHT - 20, 10, 10);
            ctx.fillRect(gameState.current.paddleX + PADDLE_WIDTH - 10, canvas.height - PADDLE_HEIGHT - 20, 10, 10);
        };

        const drawBricks = () => {
            for (let c = 0; c < BRICK_COLS; c++) {
                for (let r = 0; r < BRICK_ROWS; r++) {
                    if (gameState.current.bricks[c][r].status === 1) {
                        const brickWidth = (canvas.width - (BRICK_OFFSET_LEFT * 2) - (BRICK_PADDING * (BRICK_COLS - 1))) / BRICK_COLS;
                        const brickX = (c * (brickWidth + BRICK_PADDING)) + BRICK_OFFSET_LEFT;
                        const brickY = (r * (BRICK_HEIGHT + BRICK_PADDING)) + BRICK_OFFSET_TOP;
                        gameState.current.bricks[c][r].x = brickX;
                        gameState.current.bricks[c][r].y = brickY;
                        ctx.beginPath();
                        ctx.rect(brickX, brickY, brickWidth, BRICK_HEIGHT);
                        
                        // Gradient bricks
                        const gradient = ctx.createLinearGradient(brickX, brickY, brickX, brickY + BRICK_HEIGHT);
                        gradient.addColorStop(0, `hsl(${r * 40 + 200}, 70%, 60%)`);
                        gradient.addColorStop(1, `hsl(${r * 40 + 200}, 70%, 40%)`);
                        
                        ctx.fillStyle = gradient;
                        ctx.fill();
                        ctx.closePath();
                    }
                }
            }
        };

        const collisionDetection = () => {
            for (let c = 0; c < BRICK_COLS; c++) {
                for (let r = 0; r < BRICK_ROWS; r++) {
                    const b = gameState.current.bricks[c][r];
                    if (b.status === 1) {
                        const brickWidth = (canvas.width - (BRICK_OFFSET_LEFT * 2) - (BRICK_PADDING * (BRICK_COLS - 1))) / BRICK_COLS;
                        if (gameState.current.ballX > b.x && gameState.current.ballX < b.x + brickWidth && gameState.current.ballY > b.y && gameState.current.ballY < b.y + BRICK_HEIGHT) {
                            gameState.current.dy = -gameState.current.dy;
                            b.status = 0;
                            setScore(s => s + 10);
                            
                            // Check win
                            let allBroken = true;
                            for(let i=0; i<BRICK_COLS; i++) {
                                for(let j=0; j<BRICK_ROWS; j++) {
                                    if(gameState.current.bricks[i][j].status === 1) allBroken = false;
                                }
                            }
                            if(allBroken) {
                                handleEnd(true);
                            }
                        }
                    }
                }
            }
        };

        const handleEnd = (win: boolean) => {
            setIsPlaying(false);
            setGameOver(true);
            const finalScore = gameState.current.bricks.flat().filter(b => b.status === 0).length * 10;
            const xp = Math.floor(finalScore / 2);
            const hit = finalScore >= MILESTONE_SCORE;
            onGameEnd(finalScore, xp, hit);
        };

        const draw = () => {
            if (!isPlaying) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawBricks();
            drawBall();
            drawPaddle();
            collisionDetection();

            // Wall collisions
            if (gameState.current.ballX + gameState.current.dx > canvas.width - BALL_RADIUS || gameState.current.ballX + gameState.current.dx < BALL_RADIUS) {
                gameState.current.dx = -gameState.current.dx;
            }
            if (gameState.current.ballY + gameState.current.dy < BALL_RADIUS) {
                gameState.current.dy = -gameState.current.dy;
            } else if (gameState.current.ballY + gameState.current.dy > canvas.height - BALL_RADIUS - 10) {
                if (gameState.current.ballX > gameState.current.paddleX && gameState.current.ballX < gameState.current.paddleX + PADDLE_WIDTH) {
                    gameState.current.dy = -gameState.current.dy;
                    // Add some angle based on where it hits the paddle
                    const hitPos = (gameState.current.ballX - (gameState.current.paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
                    gameState.current.dx = hitPos * 5;
                } else {
                    handleEnd(false);
                }
            }

            gameState.current.ballX += gameState.current.dx;
            gameState.current.ballY += gameState.current.dy;

            animationFrameId = requestAnimationFrame(draw);
        };

        if (isPlaying) {
            draw();
        }

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, onGameEnd]);

    const handleMouseMove = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        if (relativeX > 0 && relativeX < canvas.width) {
            gameState.current.paddleX = relativeX - PADDLE_WIDTH / 2;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const relativeX = e.touches[0].clientX - rect.left;
        if (relativeX > 0 && relativeX < canvas.width) {
            gameState.current.paddleX = relativeX - PADDLE_WIDTH / 2;
        }
    };

    return (
        <div className="h-full flex flex-col bg-neutral-950 text-white relative overflow-hidden select-none">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/10 bg-neutral-950 z-10">
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
                <div className="flex items-center gap-8">
                    <div className="text-right">
                        <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest block mb-1">HI</span>
                        <div className="text-xl font-mono text-neutral-400">{String(Math.max(score, bestScore)).padStart(5, '0')}</div>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] text-white uppercase font-bold tracking-widest block mb-1">SCORE</span>
                        <div className="text-xl font-mono font-black text-white">{String(score).padStart(5, '0')}</div>
                    </div>
                </div>
            </div>

            {/* Game Area */}
            <div className="flex-1 relative flex items-center justify-center p-4">
                <canvas 
                    ref={canvasRef}
                    width={400}
                    height={600}
                    onMouseMove={handleMouseMove}
                    onTouchMove={handleTouchMove}
                    className="max-w-full max-h-full bg-neutral-900 rounded-xl shadow-2xl border border-white/5"
                />

                {showInstructions && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
                        <div className="text-center p-8 bg-neutral-900 border border-white/10 rounded-3xl max-w-xs">
                            <Icon name="layers" className="w-16 h-16 text-orange-400 mx-auto mb-4" />
                            <h2 className="text-2xl font-black mb-2">Cabra al Choque</h2>
                            <p className="text-neutral-400 text-sm mb-6">Mueve la paleta para rebotar la bola y romper los bloques.</p>
                            <button 
                                onClick={startGame}
                                className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white rounded-2xl font-black transition-all transform active:scale-95"
                            >
                                EMPEZAR
                            </button>
                        </div>
                    </div>
                )}

                {gameOver && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-20">
                        <div className="text-center p-8">
                            <h2 className="text-5xl font-black text-white mb-2">FIN DEL JUEGO</h2>
                            <p className="text-2xl font-mono text-orange-400 mb-8">PUNTOS: {score}</p>
                            <div className="flex flex-col gap-4">
                                <button 
                                    onClick={startGame}
                                    className="px-12 py-4 bg-white text-black rounded-2xl font-black hover:bg-neutral-200 transition-all"
                                >
                                    REINTENTAR
                                </button>
                                <button 
                                    onClick={onBack}
                                    className="px-12 py-4 bg-neutral-800 text-white rounded-2xl font-black hover:bg-neutral-700 transition-all"
                                >
                                    SALIR
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BrickBreaker;
