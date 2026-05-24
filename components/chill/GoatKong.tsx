import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../Icon';
import { motion, AnimatePresence } from 'motion/react';

interface GoatKongProps {
    onBack: () => void;
    onGameEnd: (score: number, xp: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen: () => void;
    isFullscreen: boolean;
}

const GoatKong: React.FC<GoatKongProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);
    const [lives, setLives] = useState(3);
    const [currentLevel, setCurrentLevel] = useState(1);
    const TOTAL_LEVELS = 50;
    
    const [showLevelComplete, setShowLevelComplete] = useState(false);
    const [showLifeLost, setShowLifeLost] = useState(false);
    
    const gameState = useRef({
        goat: { x: 50, y: 550, vx: 0, vy: 0, jumping: false, dir: 1, climbing: false, hasHammer: false, hammerTimer: 0 },
        platforms: [] as { x: number, y: number, w: number, h: number, isMoving?: boolean, moveDir?: number, startX?: number, range?: number, rollDir?: number }[],
        ladders: [] as { x: number, y: number, w: number, h: number }[],
        barrels: [] as { x: number, y: number, vx: number, vy: number, falling: boolean, passed?: boolean }[],
        fireballs: [] as { x: number, y: number, vx: number, vy: number, climbing: boolean, dir: number }[],
        hammers: [] as { x: number, y: number, active: boolean }[],
        barrelTimer: 0,
        keys: {} as Record<string, boolean>,
        isDead: false
    });

    const initLevel = useCallback((levelNum: number) => {
        const state = gameState.current;
        state.barrels = [];
        state.fireballs = [];
        state.ladders = [];
        state.barrelTimer = 0;
        state.isDead = false;
        
        // Base platforms
        state.platforms = [
            { x: 0, y: 580, w: 400, h: 20, rollDir: -1 }, // Ground
        ];

        // Generate slanted platforms based on level
        const numPlatforms = 4 + Math.min(levelNum, 4);
        const spacing = Math.max(60, 80 - levelNum * 2);
        
        for (let i = 1; i <= numPlatforms; i++) {
            const y = 580 - i * spacing;
            const x = i % 2 === 0 ? 50 : 0;
            const isMoving = levelNum > 3 && i % 3 === 0;
            state.platforms.push({ 
                x, y, w: 350, h: 10, 
                isMoving, 
                moveDir: 1, 
                startX: x, 
                range: 50,
                rollDir: i % 2 === 0 ? -1 : 1
            });

            // Add ladder
            if (i < numPlatforms) {
                const nextY = 580 - (i + 1) * spacing;
                const ladderX = i % 2 === 0 ? 80 : 320;
                state.ladders.push({ x: ladderX, y: nextY, w: 20, h: spacing });
            }
        }
        
        // Ladder from ground
        state.ladders.push({ x: 320, y: 580 - spacing, w: 20, h: spacing });

        // Goal platform
        const goalY = 580 - (numPlatforms + 1) * spacing;
        state.platforms.push({ x: 150, y: goalY, w: 100, h: 10, rollDir: 1 });
        state.ladders.push({ x: 190, y: goalY, w: 20, h: spacing });
        
        // Hammers
        state.hammers = [
            { x: 50, y: 580 - 2 * spacing - 20, active: true },
            { x: 350, y: 580 - 3 * spacing - 20, active: true }
        ];

        state.goat.x = 50;
        state.goat.y = 550;
        state.goat.vx = 0;
        state.goat.vy = 0;
        state.goat.dir = 1;
        state.goat.climbing = false;
        state.goat.jumping = false;
        state.goat.hasHammer = false;
        state.goat.hammerTimer = 0;
    }, []);

    const requestRef = useRef<number>(null);

    useEffect(() => {
        initLevel(1);
    }, [initLevel]);

    const startGame = (level = 1) => {
        if (level === 1) setScore(0);
        setLives(3);
        setGameOver(false);
        setGameStarted(true);
        setCurrentLevel(level);
        initLevel(level);
    };

    const update = useCallback(() => {
        if (gameOver || !gameStarted || gameState.current.isDead) return;

        const { goat, platforms, ladders, barrels, fireballs, hammers, keys } = gameState.current;

        const triggerDeath = () => {
            gameState.current.isDead = true;
            setShowLifeLost(true);
            setLives(l => {
                if (l <= 1) {
                    setGameOver(true);
                    onGameEnd(score, Math.floor(score / 10), score > 500);
                    return 0;
                }
                setTimeout(() => {
                    setShowLifeLost(false);
                    gameState.current.goat.x = 50;
                    gameState.current.goat.y = 550;
                    gameState.current.goat.vx = 0;
                    gameState.current.goat.vy = 0;
                    gameState.current.goat.dir = 1;
                    gameState.current.goat.hasHammer = false;
                    gameState.current.barrels = [];
                    gameState.current.fireballs = [];
                    gameState.current.isDead = false;
                }, 1500);
                return l - 1;
            });
        };

        // Platform Movement
        const difficulty = Math.min(currentLevel, 20);
        platforms.forEach(p => {
            if (p.isMoving) {
                p.x += p.moveDir! * (difficulty * 0.2 + 1.2);
                if (p.x > p.startX! + p.range! || p.x < p.startX! - p.range!) {
                    p.moveDir! *= -1;
                }
            }
        });

        // Goat Movement
        let onLadder = false;
        ladders.forEach(l => {
            if (goat.x > l.x - 15 && goat.x < l.x + l.w + 15 && goat.y + 15 >= l.y && goat.y <= l.y + l.h) {
                onLadder = true;
            }
        });

        if (goat.hasHammer) {
            goat.hammerTimer--;
            if (goat.hammerTimer <= 0) {
                goat.hasHammer = false;
            }
        }

        if (onLadder && !goat.hasHammer) {
            if (keys['ArrowUp']) { goat.vy = -3; goat.climbing = true; }
            else if (keys['ArrowDown']) { goat.vy = 3; goat.climbing = true; }
            else if (goat.climbing) { goat.vy = 0; }
        } else {
            goat.climbing = false;
        }

        if (keys['ArrowLeft']) { goat.vx = -3; goat.dir = -1; }
        else if (keys['ArrowRight']) { goat.vx = 3; goat.dir = 1; }
        else { goat.vx *= 0.8; }

        if (keys['ArrowUp'] && !goat.jumping && !goat.climbing && !goat.hasHammer) {
            goat.vy = -9;
            goat.jumping = true;
        }

        if (!goat.climbing) {
            goat.vy += 0.35; // Gravity
        }
        
        goat.x += goat.vx;
        goat.y += goat.vy;

        if (goat.y > 650) {
            triggerDeath();
        }

        // Hammer collision
        hammers.forEach(h => {
            if (h.active && Math.abs(goat.x - h.x) < 20 && Math.abs(goat.y - h.y) < 20) {
                h.active = false;
                goat.hasHammer = true;
                goat.hammerTimer = 400; // ~6 seconds
                setScore(s => s + 300);
            }
        });

        // Platform Collision
        if (!goat.climbing) {
            let isGrounded = false;
            platforms.forEach(p => {
                if (goat.x + 10 > p.x && goat.x - 10 < p.x + p.w &&
                    goat.y + 15 >= p.y - 5 && goat.y + 15 <= p.y + p.h + 10 && goat.vy >= 0) {
                    goat.y = p.y - 15;
                    goat.vy = 0;
                    isGrounded = true;
                }
            });
            goat.jumping = !isGrounded;
        }

        // Goal check
        const goalPlatform = platforms[platforms.length - 1];
        if (goat.y < goalPlatform.y && goat.x > goalPlatform.x && goat.x < goalPlatform.x + goalPlatform.w && !showLevelComplete) {
            if (currentLevel < TOTAL_LEVELS) {
                setShowLevelComplete(true);
                setTimeout(() => {
                    setShowLevelComplete(false);
                    const nextLevel = currentLevel + 1;
                    setCurrentLevel(nextLevel);
                    initLevel(nextLevel);
                    setScore(s => s + 500);
                }, 1500);
            } else {
                setScore(s => s + 1000);
                setGameOver(true);
                onGameEnd(score + 1000, Math.floor((score + 1000) / 10), true);
            }
        }

        // Barrels
        gameState.current.barrelTimer++;
        const spawnRate = Math.max(40, 150 - difficulty * 6);
        if (gameState.current.barrelTimer > spawnRate) {
            const topPlatform = platforms[platforms.length - 2];
            if (topPlatform) {
                const spawnX = topPlatform.rollDir === 1 ? topPlatform.x + 60 : topPlatform.x + topPlatform.w - 60;
                gameState.current.barrels.push({ 
                    x: spawnX, 
                    y: topPlatform.y - 20, 
                    vx: 0,
                    vy: 0,
                    falling: false,
                    passed: false
                });
            }
            gameState.current.barrelTimer = 0;
        }

        // Spawn fireballs
        if (Math.random() < 0.005 + (difficulty * 0.001) && fireballs.length < 3 + difficulty / 5) {
            if (Math.abs(goat.x - 30) > 100 || Math.abs(goat.y - 565) > 100) {
                fireballs.push({
                    x: 30,
                    y: 565,
                    vx: 1,
                    vy: 0,
                    climbing: false,
                    dir: 1
                });
            }
        }

        barrels.forEach((b, i) => {
            // Check if over ladder to fall down
            let overLadder = false;
            let ladderX = 0;
            if (!b.falling) {
                ladders.forEach(l => {
                    if (b.x > l.x && b.x < l.x + l.w && b.y + 10 <= l.y + 10 && b.y + 10 >= l.y - 10) {
                        if (Math.random() > 0.95) { // 5% chance per frame while over ladder
                            overLadder = true;
                            ladderX = l.x + l.w / 2;
                        }
                    }
                });
            }

            if (overLadder) {
                b.falling = true;
                b.x = ladderX;
                b.vx = 0;
            }

            if (b.falling) {
                b.vy = 3;
            } else {
                b.vy += 0.2;
            }

            b.x += b.vx;
            b.y += b.vy;

            // Platform collision for barrels
            let onPlatform = false;
            platforms.forEach(p => {
                if (b.x > p.x && b.x < p.x + p.w && b.y + 10 > p.y && b.y + 10 < p.y + p.h + 5 && b.vy >= 0) {
                    b.y = p.y - 10;
                    b.vy = 0;
                    b.falling = false;
                    onPlatform = true;
                    if (p.rollDir) {
                        b.vx = p.rollDir * (2.5 + difficulty * 0.1);
                    }
                }
            });

            // Collision with goat
            const dist = Math.sqrt(Math.pow(goat.x - b.x, 2) + Math.pow(goat.y - b.y, 2));
            if (dist < 22 && !showLifeLost && !showLevelComplete) {
                if (goat.hasHammer) {
                    barrels.splice(i, 1);
                    setScore(s => s + 300);
                } else {
                    triggerDeath();
                }
            } else if (goat.jumping && goat.vy < 0 && Math.abs(goat.x - b.x) < 25 && goat.y < b.y && !b.passed) {
                b.passed = true;
                setScore(s => s + 100);
            }

            if (b.y > 600) barrels.splice(i, 1);
        });

        fireballs.forEach((f, i) => {
            let onLadder = false;
            let currentLadder = null;
            ladders.forEach(l => {
                if (f.x > l.x - 10 && f.x < l.x + l.w + 10 && f.y + 15 >= l.y && f.y <= l.y + l.h) {
                    onLadder = true;
                    currentLadder = l;
                }
            });

            if (f.climbing) {
                f.vy = -1.5;
                f.vx = 0;
                if (!onLadder || f.y < currentLadder!.y) {
                    f.climbing = false;
                    f.vy = 0;
                    f.dir = Math.random() > 0.5 ? 1 : -1;
                }
            } else {
                f.vy += 0.35; // Gravity
                f.vx = f.dir * 1.5;
                
                if (onLadder && Math.random() > 0.95) {
                    f.climbing = true;
                    f.x = currentLadder!.x + currentLadder!.w / 2;
                }
            }

            f.x += f.vx;
            f.y += f.vy;

            if (!f.climbing) {
                platforms.forEach(p => {
                    if (f.x > p.x && f.x < p.x + p.w && f.y + 15 > p.y && f.y + 15 < p.y + p.h + 10 && f.vy >= 0) {
                        f.y = p.y - 15;
                        f.vy = 0;
                        if (f.x < p.x + 10) f.dir = 1;
                        if (f.x > p.x + p.w - 10) f.dir = -1;
                    }
                });
            }

            const dist = Math.sqrt(Math.pow(goat.x - f.x, 2) + Math.pow(goat.y - f.y, 2));
            if (dist < 22 && !showLifeLost && !showLevelComplete) {
                if (goat.hasHammer) {
                    fireballs.splice(i, 1);
                    setScore(s => s + 300);
                } else {
                    triggerDeath();
                }
            }
        });
    }, [gameOver, gameStarted, currentLevel, score, initLevel, onGameEnd, showLevelComplete, showLifeLost]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const { goat, platforms, ladders, barrels, fireballs, hammers } = gameState.current;

        // Draw Ladders
        ctx.strokeStyle = '#38bdf8'; // Cyan
        ctx.lineWidth = 3;
        ladders.forEach(l => {
            ctx.beginPath();
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(l.x, l.y + l.h);
            ctx.moveTo(l.x + l.w, l.y);
            ctx.lineTo(l.x + l.w, l.y + l.h);
            for (let i = 5; i < l.h; i += 12) {
                ctx.moveTo(l.x, l.y + i);
                ctx.lineTo(l.x + l.w, l.y + i);
            }
            ctx.stroke();
        });

        // Draw Platforms
        platforms.forEach(p => {
            ctx.fillStyle = '#e11d48'; // Red
            ctx.fillRect(p.x, p.y, p.w, p.h);
            
            ctx.strokeStyle = '#be123c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < p.w; i += 15) {
                ctx.moveTo(p.x + i, p.y);
                ctx.lineTo(p.x + i + 15, p.y + p.h);
                ctx.moveTo(p.x + i + 15, p.y);
                ctx.lineTo(p.x + i, p.y + p.h);
            }
            ctx.stroke();
            
            ctx.fillStyle = '#fda4af';
            ctx.fillRect(p.x, p.y, p.w, 2);
            ctx.fillStyle = '#881337';
            ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
        });

        // Draw Goal (Princess)
        const goalPlatform = platforms[platforms.length - 1];
        ctx.font = '32px serif';
        ctx.textAlign = 'center';
        ctx.fillText('👸', goalPlatform.x + goalPlatform.w / 2, goalPlatform.y - 15);

        // Draw Donkey Kong (Gorilla)
        const topPlatform = platforms[platforms.length - 2];
        if (topPlatform) {
            const dkX = topPlatform.rollDir === 1 ? topPlatform.x + 40 : topPlatform.x + topPlatform.w - 40;
            const barrelX = topPlatform.rollDir === 1 ? topPlatform.x + 90 : topPlatform.x + topPlatform.w - 90;
            
            ctx.font = '40px serif';
            ctx.fillText('🦍', dkX, topPlatform.y - 20);
            ctx.font = '20px serif';
            ctx.fillText('🛢️', barrelX, topPlatform.y - 10);
            ctx.fillText('🛢️', barrelX + 20, topPlatform.y - 10);
            ctx.fillText('🛢️', barrelX + 10, topPlatform.y - 30);
        }

        // Draw starting oil drum with fire
        ctx.font = '24px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🛢️', 30, 565);
        if (Date.now() % 400 < 200) {
            ctx.fillText('🔥', 30, 545);
        } else {
            ctx.fillText('💥', 30, 545);
        }

        // Draw Hammers
        hammers.forEach(h => {
            if (h.active) {
                ctx.font = '24px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔨', h.x, h.y);
            }
        });

        // Draw Goat
        ctx.save();
        ctx.translate(goat.x, goat.y);
        if (goat.dir === -1) ctx.scale(-1, 1);
        ctx.font = '28px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (goat.climbing) {
            ctx.rotate(Math.sin(Date.now() / 100) * 0.1);
        }
        ctx.fillText('🐐', 0, 0);
        if (goat.hasHammer) {
            ctx.translate(15, -15);
            ctx.rotate(Math.sin(Date.now() / 50) * 1);
            ctx.fillText('🔨', 0, 0);
        }
        ctx.restore();

        // Draw Barrels
        barrels.forEach(b => {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.x * 0.1);
            
            ctx.fillStyle = '#8B4513';
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#A9A9A9';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 12, -Math.PI/4, Math.PI/4);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, 12, Math.PI - Math.PI/4, Math.PI + Math.PI/4);
            ctx.stroke();
            
            ctx.restore();
        });

        // Draw Fireballs
        fireballs.forEach(f => {
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.font = '24px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Date.now() % 400 < 200 ? '🔥' : '☄️', 0, 0);
            ctx.restore();
        });

        update();
        requestRef.current = requestAnimationFrame(draw);
    }, [update]);

    useEffect(() => {
        requestRef.current = requestAnimationFrame(draw);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [draw]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => gameState.current.keys[e.key] = true;
        const handleKeyUp = (e: KeyboardEvent) => gameState.current.keys[e.key] = false;
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
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
                        <span className="text-[10px] text-neutral-500 uppercase block font-black tracking-widest mb-1">Nivel</span>
                        <span className="text-xl font-mono font-black text-amber-400">{currentLevel}/{TOTAL_LEVELS}</span>
                    </div>
                    <div className="w-px h-8 bg-white/10"></div>
                    <div className="text-center">
                        <span className="text-[10px] text-neutral-500 uppercase block font-black tracking-widest mb-1">Puntos</span>
                        <span className="text-xl font-mono font-black text-emerald-400">{score}</span>
                    </div>
                    <div className="w-px h-8 bg-white/10"></div>
                    <div className="text-center">
                        <span className="text-[10px] text-neutral-500 uppercase block font-black tracking-widest mb-1">Vidas</span>
                        <div className="flex gap-1">
                            {[...Array(3)].map((_, i) => (
                                <span key={i} className={`text-lg ${i < lives ? 'opacity-100' : 'opacity-20'}`}>🐐</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Game Area */}
            <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden">
                <div className="relative bg-neutral-900 rounded-xl border-4 border-white/5 shadow-2xl overflow-hidden max-h-full aspect-[2/3]">
                    <canvas 
                        ref={canvasRef}
                        width={400}
                        height={600}
                        className="block w-full h-full object-contain"
                    />

                    <AnimatePresence>
                        {showLevelComplete && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.5 }}
                                className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/20 backdrop-blur-sm z-50"
                            >
                                <div className="text-6xl mb-4">🎉</div>
                                <h2 className="text-4xl font-black text-white tracking-tighter uppercase">¡NIVEL COMPLETADO!</h2>
                                <p className="text-emerald-400 font-bold">Siguiente nivel en camino...</p>
                            </motion.div>
                        )}

                        {showLifeLost && (
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/20 backdrop-blur-sm z-50"
                            >
                                <div className="text-6xl mb-4">💥</div>
                                <h2 className="text-4xl font-black text-white tracking-tighter uppercase">¡VIDA PERDIDA!</h2>
                                <p className="text-red-400 font-bold">Ten más cuidado...</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {(!gameStarted || gameOver) && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center rounded-lg z-40">
                            <div className="w-20 h-20 bg-amber-500/20 rounded-3xl flex items-center justify-center mb-6 border border-amber-500/30">
                                <Icon name="mountain" className="w-12 h-12 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
                            </div>
                            
                            <h2 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase">GOAT KONG</h2>
                            <p className="text-neutral-400 text-sm mb-8 max-w-xs">
                                Sube a la cima y evita los barriles y el fuego. ¡Usa las flechas para moverte y saltar, y agarra el martillo para defenderte!
                            </p>

                            {gameOver && (
                                <div className="mb-8">
                                    <p className="text-2xl font-black text-rose-500 mb-1">¡CAÍDA FATAL!</p>
                                    <p className="text-neutral-400">Puntuación final: {score}</p>
                                </div>
                            )}

                            <button 
                                onClick={() => startGame()}
                                className="w-full py-4 bg-white text-neutral-950 rounded-2xl font-black text-xl transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                            >
                                {gameOver ? 'REINTENTAR' : 'JUGAR AHORA'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Controls (Mobile) */}
            <div className="md:hidden p-6 flex justify-center gap-4 mb-8">
                <button 
                    onPointerDown={() => gameState.current.keys['ArrowLeft'] = true}
                    onPointerUp={() => gameState.current.keys['ArrowLeft'] = false}
                    className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white active:bg-white/20"
                >
                    <Icon name="chevron-left" className="w-8 h-8" />
                </button>
                <button 
                    onPointerDown={() => gameState.current.keys['ArrowUp'] = true}
                    onPointerUp={() => gameState.current.keys['ArrowUp'] = false}
                    className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white active:bg-white/20"
                >
                    <Icon name="chevron-up" className="w-8 h-8" />
                </button>
                <button 
                    onPointerDown={() => gameState.current.keys['ArrowRight'] = true}
                    onPointerUp={() => gameState.current.keys['ArrowRight'] = false}
                    className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white active:bg-white/20"
                >
                    <Icon name="chevron-right" className="w-8 h-8" />
                </button>
            </div>
        </div>
    );
};

export default GoatKong;
