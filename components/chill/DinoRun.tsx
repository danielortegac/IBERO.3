import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../Icon';
import MobileGameControls from './MobileGameControls';

interface DinoRunProps {
    onBack: () => void;
    onGameEnd: (score: number, xp: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

// --- PIXEL ART ASSETS ---
const DINO_RUN_1 = [
    "             ████████ ",
    "             ███ ████ ",
    "             ████████ ",
    "             ████████ ",
    "             ██████   ",
    "             ████████ ",
    "      █      █████    ",
    "      ██    ██████    ",
    "      ███  ███████    ",
    "       ██████████     ",
    "        █████████     ",
    "         ████████     ",
    "          ██████      ",
    "           ██         ",
    "           █          ",
    "           ██         "
];

const DINO_RUN_2 = [
    "             ████████ ",
    "             ███ ████ ",
    "             ████████ ",
    "             ████████ ",
    "             ██████   ",
    "             ████████ ",
    "      █      █████    ",
    "      ██    ██████    ",
    "      ███  ███████    ",
    "       ██████████     ",
    "        █████████     ",
    "         ████████     ",
    "          ██████      ",
    "               ██     ",
    "               █      ",
    "               ██     "
];

const DINO_DUCK_1 = [
    "                      ",
    "                      ",
    "                      ",
    "                      ",
    "                      ",
    "             ████████ ",
    "             ███ ████ ",
    "█            ████████ ",
    "██    ██████████████  ",
    "███  ████████████████ ",
    " ███████████████      ",
    "  ██████████████      ",
    "    ██████            ",
    "     ██               ",
    "     █                ",
    "     ██               "
];

const DINO_DUCK_2 = [
    "                      ",
    "                      ",
    "                      ",
    "                      ",
    "                      ",
    "             ████████ ",
    "             ███ ████ ",
    "█            ████████ ",
    "██    ██████████████  ",
    "███  ████████████████ ",
    " ███████████████      ",
    "  ██████████████      ",
    "    ██████            ",
    "         ██           ",
    "         █            ",
    "         ██           "
];

const CACTUS_1 = [
    "   ██   ",
    " █ ██   ",
    "██ ██ █ ",
    "██ ██ ██",
    "██ ██ ██",
    " ██████ ",
    "   ██   ",
    "   ██   ",
    "   ██   "
];

const CACTUS_2 = [
    "   ██        ██   ",
    " █ ██      █ ██   ",
    "██ ██ █   ██ ██ █ ",
    "██ ██ ██  ██ ██ ██",
    "██ ██ ██  ██ ██ ██",
    " ██████    ██████ ",
    "   ██        ██   ",
    "   ██        ██   ",
    "   ██        ██   "
];

const BIRD_1 = [
    "  █████       ",
    " ████████     ",
    "████████████  ",
    "   ███████████",
    "     ██████   "
];

const BIRD_2 = [
    "       ████   ",
    "      ██████  ",
    "  ████████████",
    " █████████████",
    "████████      "
];

// --- CONSTANTS ---
const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 300;
const GROUND_Y = 250;
const GRAVITY = 0.65;
const JUMP_STRENGTH = -11.5;
const INITIAL_SPEED = 6;
const SPEED_INCREMENT = 0.001;
const MILESTONE_SCORE = 500; // Increased from 250 to 500 to make it harder
const PIXEL_SCALE = 3;

interface Entity {
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'cactus1' | 'cactus2' | 'bird';
    frame: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
}

const DinoRun: React.FC<DinoRunProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);
    const [score, setScore] = useState(0);

    const isPlayingRef = useRef(false);
    const gameOverRef = useRef(false);

    const gameState = useRef({
        dinoY: 0,
        dinoVelocity: 0,
        isDucking: false,
        obstacles: [] as Entity[],
        particles: [] as Particle[],
        speed: INITIAL_SPEED,
        score: 0,
        milestonesHit: 0,
        frameCount: 0,
        lastTime: performance.now(),
        shake: 0
    });

    const animationRef = useRef<number | null>(null);

    const drawPixelArt = useCallback((ctx: CanvasRenderingContext2D, art: string[], x: number, y: number, color: string) => {
        ctx.fillStyle = color;
        for (let row = 0; row < art.length; row++) {
            for (let col = 0; col < art[row].length; col++) {
                if (art[row][col] === '█') {
                    ctx.fillRect(x + col * PIXEL_SCALE, y + row * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
                }
            }
        }
    }, []);

    const displayedScoreRef = useRef(0);

    const spawnParticles = useCallback((x: number, y: number, count: number, isJump: boolean = false) => {
        const state = gameState.current;
        for (let i = 0; i < count; i++) {
            state.particles.push({
                x: x + (Math.random() * 20 - 10),
                y: y + (Math.random() * 5),
                vx: isJump ? (Math.random() * 2 - 1) : (-state.speed * 0.5 - Math.random() * 2),
                vy: isJump ? (Math.random() * -2 - 1) : (Math.random() * -1),
                life: 1,
                maxLife: 20 + Math.random() * 20,
                size: 2 + Math.random() * 3
            });
        }
    }, []);

    const endGame = useCallback(() => {
        setIsPlaying(false);
        setGameOver(true);
        isPlayingRef.current = false;
        gameOverRef.current = true;
        gameState.current.shake = 15; // Screen shake
        
        const finalScore = Math.floor(gameState.current.score);

        // IMPORTANTE:
        // los hitos ya se reportan durante la partida
        // aquí solo enviamos XP final y score, sin volver a sumar hito
        onGameEnd(finalScore, finalScore, false);
    }, [onGameEnd]);

    const gameLoop = useCallback((time: number) => {
        const state = gameState.current;
        const canvas = canvasRef.current;
        if (!canvas) {
            animationRef.current = requestAnimationFrame(gameLoop);
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            animationRef.current = requestAnimationFrame(gameLoop);
            return;
        }

        // Delta time for smooth movement regardless of refresh rate
        let dt = (time - state.lastTime) / 16.66;
        if (dt > 3) dt = 3; // Cap dt to prevent huge jumps on lag
        state.lastTime = time;

        if (isPlayingRef.current) {
            state.frameCount += dt;
            state.speed += SPEED_INCREMENT * dt;

            // --- PHYSICS ---
            state.dinoVelocity += GRAVITY * dt;
            state.dinoY += state.dinoVelocity * dt;
            
            if (state.dinoY >= 0) {
                if (state.dinoVelocity > 5) {
                    spawnParticles(100, GROUND_Y, 8, true); // Landing dust
                }
                state.dinoY = 0;
                state.dinoVelocity = 0;
            }

            // Running dust
            if (state.dinoY === 0 && Math.random() < 0.2) {
                spawnParticles(80, GROUND_Y, 1);
            }

            // --- OBSTACLES ---
            state.obstacles.forEach(obs => {
                obs.x -= state.speed * dt;
                obs.frame += dt;
            });

            if (state.obstacles.length > 0 && state.obstacles[0].x < -100) {
                state.obstacles.shift();
            }

            const lastObs = state.obstacles[state.obstacles.length - 1];
            if (!lastObs || lastObs.x < LOGICAL_WIDTH - 300 - Math.random() * 400) {
                if (Math.random() < 0.03 * dt) {
                    const isBird = state.score > 300 && Math.random() < 0.3;
                    if (isBird) {
                        const heights = [GROUND_Y - 40, GROUND_Y - 80, GROUND_Y - 120];
                        state.obstacles.push({
                            x: LOGICAL_WIDTH + 50,
                            y: heights[Math.floor(Math.random() * heights.length)],
                            width: BIRD_1[0].length * PIXEL_SCALE,
                            height: BIRD_1.length * PIXEL_SCALE,
                            type: 'bird',
                            frame: 0
                        });
                    } else {
                        const isWide = Math.random() < 0.4;
                        const art = isWide ? CACTUS_2 : CACTUS_1;
                        state.obstacles.push({
                            x: LOGICAL_WIDTH + 50,
                            y: GROUND_Y - art.length * PIXEL_SCALE + 5,
                            width: art[0].length * PIXEL_SCALE,
                            height: art.length * PIXEL_SCALE,
                            type: isWide ? 'cactus2' : 'cactus1',
                            frame: 0
                        });
                    }
                }
            }

            // --- PARTICLES ---
            for (let i = state.particles.length - 1; i >= 0; i--) {
                const p = state.particles[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life += dt;
                if (p.life >= p.maxLife) {
                    state.particles.splice(i, 1);
                }
            }

            // --- SCORE ---
            state.score += 0.1 * (state.speed / INITIAL_SPEED) * dt;
            const currentScore = Math.floor(state.score);
            
            if (currentScore !== displayedScoreRef.current) {
                displayedScoreRef.current = currentScore;
                setScore(currentScore);
            }

            if (currentScore > 0 && currentScore % MILESTONE_SCORE === 0 && currentScore / MILESTONE_SCORE > state.milestonesHit) {
                state.milestonesHit += 1;
                onGameEnd(currentScore, 0, true);
            }

            // --- COLLISION ---
            const dinoArt = state.isDucking ? DINO_DUCK_1 : DINO_RUN_1;
            const dinoWidth = dinoArt[0].length * PIXEL_SCALE;
            const dinoHeight = dinoArt.length * PIXEL_SCALE;
            
            // Forgiving Hitbox (smaller than visual)
            const marginX = 15;
            const marginY = 15;
            const dinoRect = { 
                x: 100 + marginX, 
                y: GROUND_Y + state.dinoY - dinoHeight + marginY, 
                width: dinoWidth - marginX * 2, 
                height: dinoHeight - marginY * 2 
            };

            for (const obs of state.obstacles) {
                const obsRect = { 
                    x: obs.x + 10, 
                    y: obs.y + 10, 
                    width: obs.width - 20, 
                    height: obs.height - 20 
                };
                
                if (
                    dinoRect.x < obsRect.x + obsRect.width &&
                    dinoRect.x + dinoRect.width > obsRect.x &&
                    dinoRect.y < obsRect.y + obsRect.height &&
                    dinoRect.y + dinoRect.height > obsRect.y
                ) {
                    endGame();
                    break;
                }
            }
        }

        // --- DRAWING ---
        ctx.fillStyle = '#0a0a0a'; // Deep dark background
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        ctx.save();
        
        // Screen Shake
        if (state.shake > 0) {
            ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
            state.shake *= 0.9;
            if (state.shake < 0.5) state.shake = 0;
        }

        // Draw Ground Line
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y);
        ctx.lineTo(LOGICAL_WIDTH, GROUND_Y);
        ctx.stroke();

        // Draw Particles
        ctx.fillStyle = '#555555';
        state.particles.forEach(p => {
            const opacity = 1 - (p.life / p.maxLife);
            ctx.globalAlpha = opacity;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        ctx.globalAlpha = 1.0;

        // Draw Obstacles
        state.obstacles.forEach(obs => {
            let art;
            if (obs.type === 'bird') {
                art = Math.floor(obs.frame / 15) % 2 === 0 ? BIRD_1 : BIRD_2;
            } else {
                art = obs.type === 'cactus2' ? CACTUS_2 : CACTUS_1;
            }
            drawPixelArt(ctx, art, obs.x, obs.y, '#ffffff');
        });

        // Draw Dino
        let currentDinoArt = DINO_RUN_1;
        if (!isPlayingRef.current && !gameOverRef.current) {
            currentDinoArt = DINO_RUN_1;
        } else if (state.dinoY < -5) {
            currentDinoArt = DINO_RUN_1; // Static frame when jumping
        } else if (state.isDucking) {
            currentDinoArt = Math.floor(state.frameCount / 5) % 2 === 0 ? DINO_DUCK_1 : DINO_DUCK_2;
        } else {
            currentDinoArt = Math.floor(state.frameCount / 5) % 2 === 0 ? DINO_RUN_1 : DINO_RUN_2;
        }
        
        const dinoYPos = GROUND_Y + state.dinoY - (currentDinoArt.length * PIXEL_SCALE);
        
        // Add a subtle glow to the dino
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
        drawPixelArt(ctx, currentDinoArt, 100, dinoYPos, '#ffffff');
        ctx.shadowBlur = 0;

        ctx.restore();

        animationRef.current = requestAnimationFrame(gameLoop);
    }, [drawPixelArt, spawnParticles, endGame]);

    // Initial render / Start loop
    useEffect(() => {
        gameState.current.lastTime = performance.now();
        animationRef.current = requestAnimationFrame(gameLoop);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [gameLoop]);

    const startGame = useCallback(() => {
        gameState.current = {
            dinoY: 0,
            dinoVelocity: 0,
            isDucking: false,
            obstacles: [],
            particles: [],
            speed: INITIAL_SPEED,
            score: 0,
            milestonesHit: 0,
            frameCount: 0,
            lastTime: performance.now(),
            shake: 0
        };
        displayedScoreRef.current = 0;
        setScore(0);
        setGameOver(false);
        setIsPlaying(true);
        setShowInstructions(false);
        isPlayingRef.current = true;
        gameOverRef.current = false;
    }, []);

    const jump = useCallback(() => {
        if (!isPlayingRef.current || gameOverRef.current) return;
        if (gameState.current.dinoY >= 0) {
            gameState.current.dinoVelocity = JUMP_STRENGTH;
            spawnParticles(100, GROUND_Y, 10, true);
        }
    }, [spawnParticles]);

    const shortHop = useCallback(() => {
        if (!isPlayingRef.current || gameOverRef.current) return;
        // Variable jump height: if button released while moving up, cut velocity
        if (gameState.current.dinoVelocity < -4) {
            gameState.current.dinoVelocity = -4;
        }
    }, []);

    const duck = useCallback((isDucking: boolean) => {
        if (!isPlayingRef.current || gameOverRef.current) return;
        gameState.current.isDucking = isDucking;
        if (isDucking && gameState.current.dinoY < 0) {
            gameState.current.dinoVelocity += 3; // Fast fall
        }
    }, []);

    // Input Handling
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                if (!isPlayingRef.current && !gameOverRef.current) startGame();
                else jump();
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                duck(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                shortHop();
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                duck(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [startGame, jump, duck, shortHop]);

    // Touch Handling
    const handleTouchStart = (e: React.TouchEvent) => {
        if (!isPlayingRef.current && !gameOverRef.current) {
            startGame();
            return;
        }
        const touchY = e.touches[0].clientY;
        const windowHeight = window.innerHeight;
        if (touchY > windowHeight / 2) {
            duck(true);
        } else {
            jump();
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        duck(false);
        shortHop();
    };

    return (
        <div className="h-full flex flex-col bg-neutral-950 text-white relative overflow-hidden select-none" style={{ touchAction: 'none' }}>
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
            <div 
                className="flex-1 relative overflow-hidden bg-[#0a0a0a] flex items-center justify-center touch-none"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {/* Fixed aspect ratio container to ensure physics and rendering are consistent */}
                <div className="w-full max-w-5xl aspect-[8/3] relative">
                    <canvas 
                        ref={canvasRef} 
                        width={LOGICAL_WIDTH}
                        height={LOGICAL_HEIGHT}
                        className="w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                    />

                    {/* Overlays */}
                    {showInstructions && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 bg-neutral-950/50 backdrop-blur-sm">
                            <div className="text-center animate-pulse">
                                <p className="text-white font-mono text-xl tracking-widest">PRESIONA ESPACIO PARA JUGAR</p>
                                <p className="text-neutral-500 font-mono text-sm mt-4">Móvil: Toca arriba para saltar, abajo para agacharte</p>
                            </div>
                        </div>
                    )}

                    {gameOver && !showInstructions && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 bg-neutral-950/50 backdrop-blur-sm">
                            <div className="bg-neutral-900 border border-white/10 p-8 rounded-2xl text-center shadow-2xl">
                                <h2 className="text-3xl font-black text-white mb-6 tracking-widest">G A M E &nbsp; O V E R</h2>
                                <div className="flex gap-4">
                                    <button 
                                        onClick={onBack}
                                        className="flex-1 py-3 px-6 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-colors"
                                    >
                                        SALIR
                                    </button>
                                    <button 
                                        onClick={startGame}
                                        className="flex-1 py-3 px-6 bg-white hover:bg-neutral-200 text-neutral-950 font-black rounded-xl transition-all"
                                    >
                                        REINTENTAR
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {isPlaying && !gameOver && !showInstructions && (
                <MobileGameControls
                    hint="Control táctil: salto y agacharse"
                    up={{ label: 'SALTA', ariaLabel: 'Saltar', onPress: jump, onRelease: shortHop, wide: true }}
                    down={{ label: '↓', ariaLabel: 'Agacharse', onPress: () => duck(true), onRelease: () => duck(false) }}
                    action={{ label: 'SALTO', ariaLabel: 'Saltar', onPress: jump, onRelease: shortHop, wide: true }}
                />
            )}
        </div>
    );
};

export default DinoRun;
