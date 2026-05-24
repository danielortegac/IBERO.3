import React, { useEffect, useRef, useState, useCallback } from 'react';
import Icon from '../Icon';

interface GoatSniperProps {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen: () => void;
    isFullscreen: boolean;
}

const GoatSniper: React.FC<GoatSniperProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(30);

    const requestRef = useRef<number>();
    const gameState = useRef({
        targets: [] as { x: number, y: number, radius: number, speedX: number, speedY: number, color: string, points: number }[],
        mouse: { x: 0, y: 0 },
        lastTargetTime: 0
    });

    const startGame = () => {
        setScore(0);
        setTimeLeft(30);
        setGameOver(false);
        setGameStarted(true);
        gameState.current.targets = [];
    };

    const update = useCallback(() => {
        if (gameOver || !gameStarted) return;

        const state = gameState.current;
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Spawn targets
        const now = Date.now();
        if (now - state.lastTargetTime > 800) {
            const radius = 15 + Math.random() * 20;
            state.targets.push({
                x: Math.random() * (canvas.width - radius * 2) + radius,
                y: Math.random() * (canvas.height - radius * 2) + radius,
                radius: radius,
                speedX: (Math.random() - 0.5) * 4,
                speedY: (Math.random() - 0.5) * 4,
                color: `hsl(${Math.random() * 360}, 70%, 50%)`,
                points: Math.floor(50 - radius)
            });
            state.lastTargetTime = now;
        }

        // Update targets
        state.targets.forEach((t, i) => {
            t.x += t.speedX;
            t.y += t.speedY;

            if (t.x - t.radius < 0 || t.x + t.radius > canvas.width) t.speedX *= -1;
            if (t.y - t.radius < 0 || t.y + t.radius > canvas.height) t.speedY *= -1;
        });

    }, [gameOver, gameStarted]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!gameStarted) {
            ctx.fillStyle = '#fff';
            ctx.font = '24px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('GOAT SNIPER', canvas.width / 2, canvas.height / 2 - 40);
            ctx.font = '14px Inter';
            ctx.fillText('¡Dispara a los objetivos antes de que acabe el tiempo!', canvas.width / 2, canvas.height / 2);
            ctx.fillStyle = '#6366f1';
            ctx.fillText('Click para empezar', canvas.width / 2, canvas.height / 2 + 40);
            return;
        }

        const state = gameState.current;

        // Draw targets
        state.targets.forEach(t => {
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            ctx.fillStyle = t.color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            // Bullseye
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.radius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fill();
            ctx.stroke();
        });

        // Draw Crosshair
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(state.mouse.x, state.mouse.y, 15, 0, Math.PI * 2);
        ctx.moveTo(state.mouse.x - 20, state.mouse.y);
        ctx.lineTo(state.mouse.x + 20, state.mouse.y);
        ctx.moveTo(state.mouse.x, state.mouse.y - 20);
        ctx.lineTo(state.mouse.x, state.mouse.y + 20);
        ctx.stroke();

        if (gameOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '32px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('TIEMPO AGOTADO', canvas.width / 2, canvas.height / 2 - 20);
            ctx.font = '16px Inter';
            ctx.fillText(`Puntos: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
            ctx.fillStyle = '#6366f1';
            ctx.fillText('Click para reintentar', canvas.width / 2, canvas.height / 2 + 60);
        }
    }, [gameStarted, gameOver, score]);

    useEffect(() => {
        const loop = () => {
            update();
            draw();
            requestRef.current = requestAnimationFrame(loop);
        };
        requestRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(requestRef.current!);
    }, [update, draw]);

    useEffect(() => {
        if (gameStarted && !gameOver) {
            const timer = setInterval(() => {
                setTimeLeft(t => {
                    if (t <= 1) {
                        setGameOver(true);
                        clearInterval(timer);
                        return 0;
                    }
                    return t - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameStarted, gameOver]);

    useEffect(() => {
        if (gameOver && score > 0) {
            const xp = Math.floor(score / 10);
            onGameEnd(score, xp, score >= 1000);
        }
    }, [gameOver, score, onGameEnd]);

    const handleMouseMove = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        gameState.current.mouse.x = e.clientX - rect.left;
        gameState.current.mouse.y = e.clientY - rect.top;
    };

    const handleClick = () => {
        if (!gameStarted || gameOver) {
            startGame();
            return;
        }

        const state = gameState.current;
        const { x, y } = state.mouse;

        let hit = false;
        state.targets.forEach((t, i) => {
            const dist = Math.sqrt((x - t.x) ** 2 + (y - t.y) ** 2);
            if (dist < t.radius) {
                setScore(s => s + t.points);
                state.targets.splice(i, 1);
                hit = true;
            }
        });

        if (!hit) setScore(s => Math.max(0, s - 10));
    };

    return (
        <div className="flex flex-col h-full bg-neutral-950 text-white font-sans">
            <div className="p-4 flex justify-between items-center border-b border-white/10 bg-neutral-900/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <Icon name="arrow-left" className="w-6 h-6" />
                    </button>
                    <div>
                        <h2 className="text-lg font-black tracking-tight uppercase">Cabra Sniper</h2>
                        <div className="flex gap-4 text-[10px] uppercase font-bold text-neutral-500">
                            <span>Mejor: {bestScore}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <div className="text-xs text-neutral-500 font-bold uppercase">Tiempo</div>
                        <div className="text-2xl font-black text-red-400 leading-none">{timeLeft}s</div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-neutral-500 font-bold uppercase">Puntos</div>
                        <div className="text-2xl font-black text-indigo-400 leading-none">{score}</div>
                    </div>
                    <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" 
                 onMouseMove={handleMouseMove}
                 onClick={handleClick}>
                <canvas
                    ref={canvasRef}
                    width={400}
                    height={400}
                    className="max-w-full max-h-full aspect-square bg-black rounded-xl shadow-2xl border border-white/10 cursor-none"
                />
            </div>
        </div>
    );
};

export default GoatSniper;
