import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import MobileGameControls from './MobileGameControls';

interface GoatInvadersProps {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const GoatInvaders: React.FC<GoatInvadersProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [highScore, setHighScore] = useState(bestScore);
    const moveIntervalRef = useRef<number | null>(null);

    const CANVAS_WIDTH = 400;
    const CANVAS_HEIGHT = 600;

    const gameState = useRef({
        player: { x: 200, y: 550, width: 40, height: 40 },
        bullets: [] as { x: number; y: number }[],
        enemies: [] as { x: number; y: number; width: number; height: number; type: number }[],
        enemyBullets: [] as { x: number; y: number }[],
        lastShot: 0,
        enemyDirection: 1,
        enemyStep: 0,
    });


    const movePlayer = (dir: -1 | 1) => {
        gameState.current.player.x = Math.max(20, Math.min(CANVAS_WIDTH - 20, gameState.current.player.x + dir * 20));
    };

    const shoot = () => {
        if (!isPlaying || gameOver) return;
        if (Date.now() - gameState.current.lastShot > 250) {
            gameState.current.bullets.push({ x: gameState.current.player.x, y: gameState.current.player.y - 20 });
            gameState.current.lastShot = Date.now();
        }
    };

    const startMoving = (dir: -1 | 1) => {
        movePlayer(dir);
        if (moveIntervalRef.current) window.clearInterval(moveIntervalRef.current);
        moveIntervalRef.current = window.setInterval(() => movePlayer(dir), 85);
    };

    const stopMoving = () => {
        if (moveIntervalRef.current) {
            window.clearInterval(moveIntervalRef.current);
            moveIntervalRef.current = null;
        }
    };

    const startGame = () => {
        setIsPlaying(true);
        setGameOver(false);
        setScore(0);
        gameState.current = {
            player: { x: 200, y: 550, width: 40, height: 40 },
            bullets: [],
            enemies: [],
            enemyBullets: [],
            lastShot: 0,
            enemyDirection: 1,
            enemyStep: 0,
        };
        spawnEnemies();
    };

    const spawnEnemies = () => {
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 6; col++) {
                gameState.current.enemies.push({
                    x: 50 + col * 60,
                    y: 50 + row * 50,
                    width: 30,
                    height: 30,
                    type: row
                });
            }
        }
    };

    const update = () => {
        if (!isPlaying || gameOver) return;

        const state = gameState.current;

        // Move bullets
        state.bullets.forEach((b, i) => {
            b.y -= 7;
            if (b.y < 0) state.bullets.splice(i, 1);
        });

        // Move enemy bullets
        state.enemyBullets.forEach((b, i) => {
            b.y += 4;
            if (b.y > CANVAS_HEIGHT) state.enemyBullets.splice(i, 1);

            // Collision with player
            if (
                b.x > state.player.x - state.player.width / 2 &&
                b.x < state.player.x + state.player.width / 2 &&
                b.y > state.player.y - state.player.height / 2 &&
                b.y < state.player.y + state.player.height / 2
            ) {
                endGame();
            }
        });

        // Move enemies
        state.enemyStep++;
        if (state.enemyStep > 30) {
            state.enemyStep = 0;
            let edgeReached = false;
            state.enemies.forEach(e => {
                e.x += 10 * state.enemyDirection;
                if (e.x > CANVAS_WIDTH - 40 || e.x < 20) edgeReached = true;
            });

            if (edgeReached) {
                state.enemyDirection *= -1;
                state.enemies.forEach(e => {
                    e.y += 20;
                    if (e.y > state.player.y - 40) endGame();
                });
            }

            // Enemy shooting
            if (state.enemies.length > 0 && Math.random() < 0.1) {
                const shooter = state.enemies[Math.floor(Math.random() * state.enemies.length)];
                state.enemyBullets.push({ x: shooter.x + shooter.width / 2, y: shooter.y + shooter.height });
            }
        }

        // Bullet-Enemy collision
        state.bullets.forEach((b, bi) => {
            state.enemies.forEach((e, ei) => {
                if (
                    b.x > e.x && b.x < e.x + e.width &&
                    b.y > e.y && b.y < e.y + e.height
                ) {
                    state.bullets.splice(bi, 1);
                    state.enemies.splice(ei, 1);
                    setScore(s => s + 100);
                    if (state.enemies.length === 0) spawnEnemies();
                }
            });
        });
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Stars
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 50; i++) {
            ctx.fillRect(Math.random() * CANVAS_WIDTH, Math.random() * CANVAS_HEIGHT, 1, 1);
        }

        const state = gameState.current;

        // Draw Player (Goat Ship)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(state.player.x, state.player.y - 20);
        ctx.lineTo(state.player.x - 20, state.player.y + 20);
        ctx.lineTo(state.player.x + 20, state.player.y + 20);
        ctx.closePath();
        ctx.fill();
        
        // Goat head on ship
        ctx.fillStyle = '#f3f4f6';
        ctx.beginPath();
        ctx.arc(state.player.x, state.player.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(state.player.x - 5, state.player.y - 5, 2, 2);
        ctx.fillRect(state.player.x + 3, state.player.y - 5, 2, 2);

        // Draw Bullets
        ctx.fillStyle = '#4ade80';
        state.bullets.forEach(b => ctx.fillRect(b.x - 2, b.y, 4, 10));

        // Draw Enemy Bullets
        ctx.fillStyle = '#ef4444';
        state.enemyBullets.forEach(b => ctx.fillRect(b.x - 2, b.y, 4, 10));

        // Draw Enemies (Wolf Aliens)
        state.enemies.forEach(e => {
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(e.x, e.y, e.width, e.height);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(e.x + 5, e.y + 5, 5, 5);
            ctx.fillRect(e.x + 20, e.y + 5, 5, 5);
        });
    };

    const endGame = () => {
        setGameOver(true);
        setIsPlaying(false);
        onGameEnd(score, Math.floor(score / 10), score > 5000);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        const loop = () => {
            update();
            draw(ctx);
            animationId = requestAnimationFrame(loop);
        };
        animationId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animationId);
    }, [isPlaying, gameOver]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') movePlayer(-1);
            if (e.key === 'ArrowRight') movePlayer(1);
            if (e.key === ' ' || e.key === 'ArrowUp') shoot();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        return () => stopMoving();
    }, []);

    return (
        <div className="h-full flex flex-col items-center justify-center bg-neutral-950 p-3 sm:p-4 select-none overflow-y-auto" style={{ touchAction: 'none' }}>
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
                <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                    <div className="text-[10px] text-neutral-500 uppercase font-bold">Puntos</div>
                    <div className="text-lg font-black text-green-400">{score}</div>
                </div>
            </div>

            <div className="relative bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-[0_0_30px_rgba(74,222,128,0.1)] w-full max-w-[400px] max-h-[70dvh] aspect-[2/3]">
                <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="rounded bg-black block w-full h-full object-contain" />
                
                {!isPlaying && !gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                        <h2 className="text-2xl font-black text-green-400 mb-6 tracking-wider uppercase">Goat Invaders</h2>
                        <button onClick={startGame} className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-black rounded-full transition-all hover:scale-105">DEFENDER EL ESPACIO</button>
                    </div>
                )}

                {gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                        <h2 className="text-3xl font-black text-red-500 mb-2 tracking-wider uppercase">¡MISIÓN FALLIDA!</h2>
                        <div className="text-4xl font-black text-white mb-6">{score}</div>
                        <button onClick={startGame} className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-black rounded-full transition-all hover:scale-105">REINTENTAR</button>
                    </div>
                )}
            </div>
            {isPlaying && !gameOver && (
                <MobileGameControls
                    hint="Control táctil: mantén izquierda/derecha y dispara"
                    left={{ label: '←', ariaLabel: 'Mover izquierda', onPress: () => startMoving(-1), onRelease: stopMoving }}
                    right={{ label: '→', ariaLabel: 'Mover derecha', onPress: () => startMoving(1), onRelease: stopMoving }}
                    action={{ label: 'FUEGO', ariaLabel: 'Disparar', onPress: shoot, wide: true }}
                />
            )}
            <div className="mt-4 text-neutral-500 text-xs flex flex-wrap justify-center gap-4">
                <span>Desktop: ← → Mover</span>
                <span>Espacio Disparar</span>
                <span className="md:hidden text-green-300">Celular: botones táctiles</span>
            </div>
        </div>
    );
};

export default GoatInvaders;
