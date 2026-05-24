import React, { useEffect, useRef, useState, useCallback } from 'react';
import Icon from '../Icon';

// --- AUDIO SYSTEM ---
const playSound = (type: string) => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'jump') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'coin') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(987.77, now); // B5
            osc.frequency.setValueAtTime(1318.51, now + 0.1); // E6
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'stomp') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'powerup') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(500, now + 0.1);
            osc.frequency.linearRampToValueAtTime(400, now + 0.2);
            osc.frequency.linearRampToValueAtTime(600, now + 0.3);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'bump') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(100, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'break') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(20, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'death') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        } else if (type === 'eat') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'stage_clear') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.setValueAtTime(500, now + 0.2);
            osc.frequency.setValueAtTime(600, now + 0.4);
            osc.frequency.setValueAtTime(800, now + 0.6);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 1.0);
            osc.start(now);
            osc.stop(now + 1.0);
        }
    } catch (e) {
        // Ignore audio errors
    }
};

// --- CONSTANTS & TYPES ---
const GRAVITY = 0.6;
const JUMP_POWER = -13; // Increased to clear tall pipes easily
const WALK_SPEED = 4;
const RUN_SPEED = 7;
const MAX_FALL_SPEED = 14;
const GRID = 40;

type Block = { x: number, y: number, w: number, h: number, type: 'ground' | 'brick' | 'question' | 'solid' | 'pipe' | 'flagpole', active?: boolean, item?: 'coin' | 'mushroom' | null, bumpY?: number };
type Enemy = { x: number, y: number, w: number, h: number, vx: number, vy: number, type: 'goomba' | 'piranha', state: 'walking' | 'dead' | 'emerging' | 'hiding_pipe', timer?: number, startY?: number };
type Item = { x: number, y: number, w: number, h: number, vx: number, vy: number, type: 'mushroom' | 'coin', active: boolean, popTimer?: number };
type Particle = { x: number, y: number, vx: number, vy: number, life: number };
type Decoration = { x: number, y: number, type: 'cloud' | 'bush', size: number };

interface SuperGoatBrosProps {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen: () => void;
    isFullscreen: boolean;
}

const SuperGoatBros: React.FC<SuperGoatBrosProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [coins, setCoins] = useState(0);
    const [lives, setLives] = useState(3);
    const [world, setWorld] = useState(1);
    const [level, setLevel] = useState(1);
    const [gameOver, setGameOver] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);
    const [time, setTime] = useState(400);

    const requestRef = useRef<number>();
    const lastTimeRef = useRef<number>(0);

    const gameState = useRef({
        player: { 
            x: 50, y: 300, w: 30, h: 30, vx: 0, vy: 0, 
            onGround: false, facingRight: true, 
            isBig: false, invulnerable: 0, dead: false,
            tongue: { active: false, length: 0, timer: 0 },
            won: false
        },
        blocks: [] as Block[],
        enemies: [] as Enemy[],
        items: [] as Item[],
        particles: [] as Particle[],
        decorations: [] as Decoration[],
        cameraX: 0,
        keys: {} as { [key: string]: boolean },
        levelWidth: 3000,
        frameCount: 0
    });

    const generateLevel = useCallback((w: number, l: number) => {
        const blocks: Block[] = [];
        const enemies: Enemy[] = [];
        const items: Item[] = [];
        const decorations: Decoration[] = [];
        
        const lengthInGrids = 100 + (w * 20) + (l * 10);
        const levelWidth = lengthInGrids * GRID;

        // Decorations
        for (let i = 0; i < lengthInGrids; i += 4) {
            if (Math.random() < 0.6) {
                decorations.push({ x: i * GRID + Math.random() * 100, y: 50 + Math.random() * 150, type: 'cloud', size: 0.8 + Math.random() * 0.8 });
            }
            if (Math.random() < 0.4) {
                decorations.push({ x: i * GRID + Math.random() * 100, y: 400 - 30, type: 'bush', size: 0.8 + Math.random() * 0.8 });
            }
        }

        // Ground
        for (let i = 0; i < lengthInGrids; i++) {
            // Pits
            if (i > 15 && i < lengthInGrids - 15 && Math.random() < 0.08) {
                i += Math.floor(Math.random() * 2) + 1; // skip 1-2 blocks
                continue;
            }
            blocks.push({ x: i * GRID, y: 400, w: GRID, h: GRID, type: 'ground' });
            blocks.push({ x: i * GRID, y: 440, w: GRID, h: GRID, type: 'ground' });
        }

        // Obstacles & Enemies
        for (let i = 10; i < lengthInGrids - 20; i++) {
            const r = Math.random();
            if (r < 0.08) {
                // Pipe
                const h = Math.random() > 0.5 ? 80 : 100; // Adjusted heights to ensure they are always jumpable
                blocks.push({ x: i * GRID, y: 400 - h, w: 80, h: h, type: 'pipe' });
                // Piranha Plant inside pipe
                enemies.push({
                    x: i * GRID + 20,
                    y: 400 - h,
                    w: 40,
                    h: 50,
                    vx: 0,
                    vy: 0,
                    type: 'piranha',
                    state: 'hiding_pipe',
                    startY: 400 - h,
                    timer: Math.random() * 60
                });
                i += 2;
            } else if (r < 0.25) {
                // Blocks in air
                const h = Math.random() > 0.5 ? 160 : 80;
                const len = Math.floor(Math.random() * 4) + 1;
                for (let j = 0; j < len; j++) {
                    const isQuestion = Math.random() < 0.4;
                    blocks.push({ 
                        x: (i + j) * GRID, 
                        y: 400 - h, 
                        w: GRID, 
                        h: GRID, 
                        type: isQuestion ? 'question' : 'brick',
                        item: isQuestion ? (Math.random() < 0.2 ? 'mushroom' : 'coin') : null,
                        active: true,
                        bumpY: 0
                    });
                }
                i += len;
            } else if (r < 0.4) {
                // Goomba
                enemies.push({
                    x: i * GRID,
                    y: 300,
                    w: 30,
                    h: 30,
                    vx: -1,
                    vy: 0,
                    type: 'goomba',
                    state: 'walking'
                });
                i += 2;
            }
        }

        // Stairs at end
        const endX = lengthInGrids - 15;
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j <= i; j++) {
                blocks.push({ x: (endX + i) * GRID, y: 360 - j * GRID, w: GRID, h: GRID, type: 'solid' });
            }
        }

        // Flagpole
        blocks.push({ x: (endX + 12) * GRID, y: 80, w: 10, h: 320, type: 'flagpole' });
        blocks.push({ x: (endX + 12) * GRID - 15, y: 400, w: 40, h: 40, type: 'solid' });

        return { blocks, enemies, items, decorations, levelWidth };
    }, []);

    const initGame = useCallback((w: number, l: number, keepScore = false) => {
        const state = gameState.current;
        const { blocks, enemies, items, decorations, levelWidth } = generateLevel(w, l);
        
        state.blocks = blocks;
        state.enemies = enemies;
        state.items = items;
        state.decorations = decorations;
        state.particles = [];
        state.levelWidth = levelWidth;
        state.cameraX = 0;
        
        state.player = {
            ...state.player,
            x: 50, y: 200, vx: 0, vy: 0,
            onGround: false, dead: false, won: false,
            tongue: { active: false, length: 0, timer: 0 }
        };
        
        if (!keepScore) {
            setScore(0);
            setCoins(0);
            setLives(3);
        }
        setTime(400);
        setWorld(w);
        setLevel(l);
        setGameOver(false);
        setGameStarted(true);
    }, [generateLevel]);

    const spawnParticles = (x: number, y: number) => {
        const state = gameState.current;
        for (let i = 0; i < 4; i++) {
            state.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 1) * 10,
                life: 1.0
            });
        }
    };

    const update = useCallback(() => {
        if (!gameStarted || gameOver) return;

        const state = gameState.current;
        const p = state.player;
        state.frameCount++;

        // Time
        if (state.frameCount % 60 === 0 && !p.dead && !p.won) {
            setTime(t => {
                if (t <= 1) {
                    p.dead = true;
                    p.vy = -10;
                    playSound('death');
                    return 0;
                }
                return t - 1;
            });
        }

        if (p.won) {
            p.vx = 2;
            p.vy += GRAVITY;
            p.x += p.vx;
            p.y += p.vy;
            
            // Floor collision during win walk
            if (p.y > 400 - p.h) {
                p.y = 400 - p.h;
                p.vy = 0;
            }

            if (p.x > state.levelWidth + 200) {
                // Next level
                playSound('stage_clear');
                setTimeout(() => {
                    if (level === 4) {
                        initGame(world + 1, 1, true);
                    } else {
                        initGame(world, level + 1, true);
                    }
                }, 2000);
                setGameOver(true); // Temporary pause
            }
            return;
        }

        if (p.dead) {
            p.vy += GRAVITY;
            p.y += p.vy;
            if (p.y > 800) {
                setLives(l => {
                    if (l <= 1) {
                        setGameOver(true);
                        onGameEnd(score, Math.floor(score / 10), score >= 1000);
                        return 0;
                    }
                    setTimeout(() => initGame(world, level, true), 1000);
                    return l - 1;
                });
                setGameOver(true);
            }
            return;
        }

        // --- PLAYER MOVEMENT ---
        const maxSpeed = state.keys['Shift'] || state.keys['z'] || state.keys['Z'] ? RUN_SPEED : WALK_SPEED;
        const accel = p.onGround ? 0.5 : 0.3; // Less air control
        
        if (state.keys['ArrowLeft']) {
            p.vx -= accel;
            if (p.vx < -maxSpeed) p.vx = -maxSpeed;
            p.facingRight = false;
        } else if (state.keys['ArrowRight']) {
            p.vx += accel;
            if (p.vx > maxSpeed) p.vx = maxSpeed;
            p.facingRight = true;
        } else {
            p.vx *= p.onGround ? 0.8 : 0.95; // Friction (less in air)
            if (Math.abs(p.vx) < 0.1) p.vx = 0;
        }

        if (state.keys['ArrowUp'] && p.onGround) {
            p.vy = JUMP_POWER;
            p.onGround = false;
            playSound('jump');
        } else if (!state.keys['ArrowUp'] && p.vy < 0) {
            // Variable jump height: release early to stop jumping higher
            p.vy += GRAVITY * 1.5; 
        }

        // Yoshi Tongue
        if (state.keys[' '] && !p.tongue.active && p.tongue.timer === 0) {
            p.tongue.active = true;
            p.tongue.length = 0;
            p.tongue.timer = 16;
            playSound('eat');
        }

        if (p.tongue.active) {
            if (p.tongue.timer > 8) p.tongue.length += 12;
            else p.tongue.length -= 12;
            
            p.tongue.timer--;
            if (p.tongue.timer <= 0) {
                p.tongue.active = false;
                p.tongue.length = 0;
            }

            // Tongue collision
            const tx = p.facingRight ? p.x + p.w : p.x - p.tongue.length;
            const tw = p.tongue.length;
            const ty = p.y + p.h / 2 - 5;
            const th = 10;

            state.enemies.forEach(e => {
                if (e.state !== 'dead' && tx < e.x + e.w && tx + tw > e.x && ty < e.y + e.h && ty + th > e.y) {
                    e.state = 'dead';
                    setScore(s => s + 200);
                    p.tongue.timer = Math.min(p.tongue.timer, 8); // Retract
                }
            });
        } else if (p.tongue.timer > 0) {
            p.tongue.timer--;
        }

        p.vy += GRAVITY;
        if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;

        // --- COLLISION X ---
        p.x += p.vx;
        if (p.x < state.cameraX) p.x = state.cameraX; // Can't go back

        let hitWall = false;
        state.blocks.forEach(b => {
            if (b.type === 'flagpole') {
                if (p.x + p.w > b.x && p.x < b.x + b.w) {
                    p.won = true;
                    p.x = b.x - p.w;
                    p.vx = 0;
                    p.vy = 0;
                    setScore(s => s + 1000 + time * 10);
                    playSound('stage_clear');
                }
                return;
            }
            if (p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y) {
                if (p.vx > 0) p.x = b.x - p.w;
                else if (p.vx < 0) p.x = b.x + b.w;
                p.vx = 0;
                hitWall = true;
            }
        });

        // --- COLLISION Y ---
        p.y += p.vy;
        p.onGround = false;
        state.blocks.forEach(b => {
            if (b.type === 'flagpole') return;
            if (p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y) {
                if (p.vy > 0) { // Landing
                    p.y = b.y - p.h;
                    p.vy = 0;
                    p.onGround = true;
                } else if (p.vy < 0) { // Hitting head
                    p.y = b.y + b.h;
                    p.vy = 0;
                    
                    if (b.active !== false) {
                        if (b.type === 'question') {
                            b.active = false;
                            b.bumpY = -10;
                            if (b.item === 'coin') {
                                playSound('coin');
                                setCoins(c => c + 1);
                                setScore(s => s + 100);
                                state.items.push({ x: b.x + 10, y: b.y, w: 20, h: 20, vx: 0, vy: -8, type: 'coin', active: true, popTimer: 20 });
                            } else if (b.item === 'mushroom') {
                                playSound('powerup');
                                state.items.push({ x: b.x, y: b.y - GRID, w: 30, h: 30, vx: 2, vy: 0, type: 'mushroom', active: true });
                            }
                        } else if (b.type === 'brick') {
                            if (p.isBig) {
                                b.type = 'ground'; // effectively remove it, we'll filter it out
                                b.w = 0; b.h = 0;
                                playSound('break');
                                spawnParticles(b.x + 20, b.y + 20);
                                setScore(s => s + 50);
                            } else {
                                b.bumpY = -10;
                                playSound('bump');
                            }
                        }
                    }
                }
            }
        });

        // Block bumps animation
        state.blocks.forEach(b => {
            if (b.bumpY && b.bumpY < 0) {
                b.bumpY += 2;
                if (b.bumpY > 0) b.bumpY = 0;
            }
        });

        // Fall death
        if (p.y > 600) {
            p.dead = true;
            playSound('death');
        }

        // --- ITEMS ---
        state.items.forEach((item, i) => {
            if (!item.active) return;
            
            if (item.type === 'coin' && item.popTimer !== undefined) {
                item.popTimer--;
                item.vy += GRAVITY;
                item.y += item.vy;
                if (item.popTimer <= 0) item.active = false;
                return;
            }

            item.vy += GRAVITY;
            item.x += item.vx;
            
            // Item X collision
            state.blocks.forEach(b => {
                if (b.type === 'flagpole' || b.w === 0) return;
                if (item.x < b.x + b.w && item.x + item.w > b.x && item.y < b.y + b.h && item.y + item.h > b.y) {
                    item.vx *= -1;
                }
            });

            item.y += item.vy;
            // Item Y collision
            state.blocks.forEach(b => {
                if (b.type === 'flagpole' || b.w === 0) return;
                if (item.x < b.x + b.w && item.x + item.w > b.x && item.y < b.y + b.h && item.y + item.h > b.y) {
                    if (item.vy > 0) {
                        item.y = b.y - item.h;
                        item.vy = 0;
                    }
                }
            });

            // Player collects item
            if (p.x < item.x + item.w && p.x + p.w > item.x && p.y < item.y + item.h && p.y + p.h > item.y) {
                item.active = false;
                if (item.type === 'mushroom') {
                    playSound('powerup');
                    setScore(s => s + 1000);
                    if (!p.isBig) {
                        p.isBig = true;
                        p.y -= 30;
                        p.h = 60;
                    }
                }
            }
        });

        // --- ENEMIES ---
        state.enemies.forEach((e, i) => {
            if (e.state === 'dead') return;

            // Wake up enemies near camera
            if (e.x > state.cameraX + 800) return;

            if (e.type === 'piranha') {
                if (e.state === 'hiding_pipe') {
                    e.timer = (e.timer || 0) + 1;
                    if (e.timer > 120) {
                        // Only emerge if player is not directly above or very close
                        if (Math.abs(p.x - e.x) > 80 || p.y > e.startY!) {
                            e.state = 'emerging';
                            e.timer = 0;
                        }
                    }
                } else if (e.state === 'emerging') {
                    e.y -= 1;
                    if (e.y <= e.startY! - e.h) {
                        e.y = e.startY! - e.h;
                        e.timer = (e.timer || 0) + 1;
                        if (e.timer > 90) {
                            e.state = 'walking'; // using walking as 'descending'
                            e.timer = 0;
                        }
                    }
                } else if (e.state === 'walking') {
                    e.y += 1;
                    if (e.y >= e.startY!) {
                        e.y = e.startY!;
                        e.state = 'hiding_pipe';
                    }
                }
                
                // Player collision with Piranha
                if (p.invulnerable <= 0 && p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y) {
                    if (p.isBig) {
                        p.isBig = false;
                        p.h = 30;
                        p.invulnerable = 60;
                        playSound('bump');
                    } else {
                        p.dead = true;
                        p.vy = -10;
                        playSound('death');
                    }
                }
                return;
            }

            e.vy += GRAVITY;
            e.x += e.vx;

            // Enemy X collision
            let hitWallEnemy = false;
            state.blocks.forEach(b => {
                if (b.type === 'flagpole' || b.w === 0) return;
                if (e.x < b.x + b.w && e.x + e.w > b.x && e.y < b.y + b.h && e.y + e.h > b.y) {
                    if (e.vx > 0) e.x = b.x - e.w;
                    else if (e.vx < 0) e.x = b.x + b.w;
                    e.vx *= -1;
                    hitWallEnemy = true;
                }
            });

            e.y += e.vy;
            // Enemy Y collision
            state.blocks.forEach(b => {
                if (b.type === 'flagpole' || b.w === 0) return;
                if (e.x < b.x + b.w && e.x + e.w > b.x && e.y < b.y + b.h && e.y + e.h > b.y) {
                    if (e.vy > 0) {
                        e.y = b.y - e.h;
                        e.vy = 0;
                    }
                }
            });

            // Fall death
            if (e.y > 600) e.state = 'dead';

            // Player collision
            if (p.invulnerable <= 0 && p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y) {
                // Stomp
                if (p.vy > 0 && p.y + p.h < e.y + e.h / 2 + 10) {
                    p.vy = -8;
                    playSound('stomp');
                    e.state = 'dead';
                    setScore(s => s + 200);
                    spawnParticles(e.x + e.w/2, e.y + e.h/2);
                } else {
                    // Hit by enemy
                    if (p.isBig) {
                        p.isBig = false;
                        p.h = 30;
                        p.invulnerable = 60;
                        playSound('bump');
                    } else {
                        p.dead = true;
                        p.vy = -10;
                        playSound('death');
                    }
                }
            }
        });

        if (p.invulnerable > 0) p.invulnerable--;

        // Particles
        state.particles.forEach(pt => {
            pt.x += pt.vx;
            pt.vy += GRAVITY;
            pt.y += pt.vy;
            pt.life -= 0.05;
        });
        state.particles = state.particles.filter(pt => pt.life > 0);

        // Camera Follow
        const targetCamX = p.x - 300; // Give more view ahead
        if (targetCamX > state.cameraX) {
            state.cameraX = targetCamX;
        }

    }, [gameStarted, gameOver, score, world, level, initGame, onGameEnd]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Sky background based on world
        ctx.fillStyle = world % 2 === 0 ? '#000000' : '#5c94fc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!gameStarted) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 36px "Press Start 2P", monospace, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('SUPER GOAT BROS', canvas.width / 2, canvas.height / 2 - 40);
            ctx.font = '16px sans-serif';
            ctx.fillText('Flechas: Mover/Saltar | Espacio: Lengüetazo | Shift: Correr', canvas.width / 2, canvas.height / 2 + 10);
            ctx.fillStyle = '#facc15';
            ctx.fillText('Click para comenzar', canvas.width / 2, canvas.height / 2 + 60);
            return;
        }

        const state = gameState.current;
        ctx.save();
        ctx.translate(-state.cameraX, 0);

        // Draw Decorations
        state.decorations.forEach(d => {
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.scale(d.size, d.size);
            if (d.type === 'cloud') {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                ctx.arc(0, 0, 20, 0, Math.PI * 2);
                ctx.arc(20, -10, 25, 0, Math.PI * 2);
                ctx.arc(40, 0, 20, 0, Math.PI * 2);
                ctx.fill();
            } else if (d.type === 'bush') {
                ctx.fillStyle = '#16a34a'; // green-600
                ctx.beginPath();
                ctx.arc(0, 0, 15, 0, Math.PI * 2);
                ctx.arc(15, -10, 20, 0, Math.PI * 2);
                ctx.arc(30, 0, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#15803d'; // green-700
                ctx.beginPath();
                ctx.arc(15, -5, 15, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });

        // Draw Blocks
        state.blocks.forEach(b => {
            if (b.w === 0) return;
            const by = b.y + (b.bumpY || 0);
            
            if (b.type === 'ground') {
                ctx.fillStyle = world % 2 === 0 ? '#004058' : '#c84c0c'; // Base color
                ctx.fillRect(b.x, by, b.w, b.h);
                // Grass top
                ctx.fillStyle = world % 2 === 0 ? '#00a800' : '#84cc0c';
                ctx.fillRect(b.x, by, b.w, 8);
                // Dirt texture
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(b.x + 5, by + 15, 10, 5);
                ctx.fillRect(b.x + 25, by + 25, 8, 4);
                ctx.strokeStyle = '#000';
                ctx.strokeRect(b.x, by, b.w, b.h);
            } else if (b.type === 'brick') {
                ctx.fillStyle = world % 2 === 0 ? '#004058' : '#c84c0c';
                ctx.fillRect(b.x, by, b.w, b.h);
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeRect(b.x, by, b.w, b.h);
                ctx.beginPath();
                ctx.moveTo(b.x + b.w/2, by); ctx.lineTo(b.x + b.w/2, by + b.h);
                ctx.moveTo(b.x, by + b.h/2); ctx.lineTo(b.x + b.w, by + b.h/2);
                ctx.stroke();
                ctx.lineWidth = 1;
            } else if (b.type === 'question') {
                ctx.fillStyle = b.active ? '#facc15' : '#854d0e';
                ctx.fillRect(b.x, by, b.w, b.h);
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeRect(b.x, by, b.w, b.h);
                ctx.lineWidth = 1;
                if (b.active) {
                    ctx.fillStyle = '#b45309';
                    ctx.font = 'bold 28px "Press Start 2P", monospace, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('?', b.x + b.w/2, by + b.h/2 + 2);
                } else {
                    // Empty block rivet dots
                    ctx.fillStyle = '#000';
                    ctx.fillRect(b.x + 4, by + 4, 4, 4);
                    ctx.fillRect(b.x + b.w - 8, by + 4, 4, 4);
                    ctx.fillRect(b.x + 4, by + b.h - 8, 4, 4);
                    ctx.fillRect(b.x + b.w - 8, by + b.h - 8, 4, 4);
                }
            } else if (b.type === 'solid') {
                ctx.fillStyle = '#c84c0c';
                ctx.fillRect(b.x, by, b.w, b.h);
                ctx.strokeStyle = '#000';
                ctx.strokeRect(b.x, by, b.w, b.h);
            } else if (b.type === 'pipe') {
                const gradient = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
                gradient.addColorStop(0, '#15803d');
                gradient.addColorStop(0.2, '#4ade80');
                gradient.addColorStop(0.8, '#16a34a');
                gradient.addColorStop(1, '#14532d');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(b.x, by, b.w, b.h);
                ctx.fillRect(b.x - 4, by, b.w + 8, 24); // Lip
                
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeRect(b.x, by, b.w, b.h);
                ctx.strokeRect(b.x - 4, by, b.w + 8, 24);
                ctx.lineWidth = 1;
            } else if (b.type === 'flagpole') {
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.arc(b.x + b.w/2, b.y - 10, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
        });

        // Draw Items
        state.items.forEach(item => {
            if (!item.active) return;
            if (item.type === 'mushroom') {
                ctx.font = '30px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🍄', item.x + item.w/2, item.y + item.h/2);
            } else if (item.type === 'coin') {
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.ellipse(item.x + item.w/2, item.y + item.h/2, 8, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ca8a04';
                ctx.stroke();
            }
        });

        // Draw Enemies
        state.enemies.forEach(e => {
            if (e.state === 'dead') return;
            ctx.save();
            ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
            
            if (e.type === 'goomba') {
                // Draw Goomba
                ctx.fillStyle = '#854d0e'; // Brown body
                ctx.beginPath();
                ctx.arc(0, 0, e.w/2, Math.PI, 0);
                ctx.lineTo(e.w/2, e.h/2);
                ctx.lineTo(-e.w/2, e.h/2);
                ctx.fill();
                ctx.fillStyle = '#fef08a'; // Face
                ctx.fillRect(-e.w/2 + 4, 0, e.w - 8, e.h/2);
                // Eyes
                ctx.fillStyle = '#000';
                ctx.fillRect(-6, -5, 4, 8);
                ctx.fillRect(2, -5, 4, 8);
                // Feet
                ctx.fillStyle = '#000';
                const walkOffset = (state.frameCount % 20 < 10) ? 2 : -2;
                ctx.beginPath();
                ctx.ellipse(-8, e.h/2, 6, 4, 0, 0, Math.PI*2);
                ctx.ellipse(8, e.h/2 + walkOffset, 6, 4, 0, 0, Math.PI*2);
                ctx.fill();
            } else if (e.type === 'piranha') {
                // Draw Piranha Plant
                // Stem
                ctx.fillStyle = '#16a34a';
                ctx.fillRect(-4, 0, 8, e.h/2);
                // Leaves
                ctx.beginPath();
                ctx.ellipse(-8, 10, 8, 4, Math.PI/4, 0, Math.PI*2);
                ctx.ellipse(8, 15, 8, 4, -Math.PI/4, 0, Math.PI*2);
                ctx.fill();
                // Head
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.arc(0, -10, 15, 0, Math.PI*2);
                ctx.fill();
                // White spots
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(-6, -15, 3, 0, Math.PI*2);
                ctx.arc(6, -12, 4, 0, Math.PI*2);
                ctx.arc(-2, -4, 2, 0, Math.PI*2);
                ctx.fill();
                // Mouth
                ctx.fillStyle = '#000';
                const mouthOpen = (state.frameCount % 40 < 20) ? 10 : 2;
                ctx.beginPath();
                ctx.moveTo(-15, -10);
                ctx.lineTo(15, -10);
                ctx.lineTo(0, -10 - mouthOpen);
                ctx.fill();
                // Teeth
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(-10, -10); ctx.lineTo(-8, -10 - mouthOpen/2); ctx.lineTo(-6, -10);
                ctx.moveTo(6, -10); ctx.lineTo(8, -10 - mouthOpen/2); ctx.lineTo(10, -10);
                ctx.fill();
            }
            ctx.restore();
        });

        // Draw Particles
        state.particles.forEach(pt => {
            ctx.fillStyle = `rgba(200, 76, 12, ${pt.life})`;
            ctx.fillRect(pt.x, pt.y, 8, 8);
        });

        // Draw Player (Goat)
        const p = state.player;
        if (!p.dead && (p.invulnerable % 4 < 2)) {
            ctx.save();
            ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
            // The goat emoji faces left by default. 
            // So if facingRight is true, we need to flip it horizontally.
            if (p.facingRight) ctx.scale(-1, 1);
            
            // Draw Tongue
            if (p.tongue.active) {
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                // Tongue goes to the left (since the un-flipped goat faces left)
                ctx.roundRect(-15 - p.tongue.length, -5, p.tongue.length, 10, 5);
                ctx.fill();
                ctx.fillStyle = '#fca5a5';
                ctx.beginPath();
                ctx.arc(-15 - p.tongue.length, 0, 6, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.font = `${p.h * 0.9}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🐐', 0, 0);
            
            // Crown if big
            if (p.isBig) {
                ctx.font = `${p.h * 0.4}px serif`;
                ctx.fillText('👑', 0, -p.h/2 - 5);
            }
            
            ctx.restore();
        }

        ctx.restore();

        // UI Overlay
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px "Press Start 2P", monospace, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`GOAT`, 20, 30);
        ctx.fillText(`${score.toString().padStart(6, '0')}`, 20, 55);

        ctx.textAlign = 'center';
        ctx.fillText(`🪙 x${coins.toString().padStart(2, '0')}`, canvas.width / 2 - 80, 30);
        
        ctx.fillText(`WORLD`, canvas.width / 2 + 40, 30);
        ctx.fillText(`${world}-${level}`, canvas.width / 2 + 40, 55);

        ctx.textAlign = 'right';
        ctx.fillText(`TIME`, canvas.width - 20, 30);
        ctx.fillText(`${Math.ceil(time)}`, canvas.width - 20, 55);

        if (gameOver && lives <= 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 32px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
            ctx.font = '16px sans-serif';
            ctx.fillText(`Puntos: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
            ctx.fillStyle = '#facc15';
            ctx.fillText('Click para reintentar', canvas.width / 2, canvas.height / 2 + 60);
        } else if (gameOver && p.won) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 32px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NIVEL COMPLETADO', canvas.width / 2, canvas.height / 2);
        }

    }, [gameStarted, gameOver, score, coins, world, level, time, lives]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            gameState.current.keys[e.key] = true;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                e.preventDefault();
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => gameState.current.keys[e.key] = false;

        window.addEventListener('keydown', handleKeyDown, { passive: false });
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useEffect(() => {
        const loop = (timestamp: number) => {
            // Cap delta time to prevent huge jumps if tab is inactive
            const dt = timestamp - lastTimeRef.current;
            if (dt < 100) {
                update();
                draw();
            }
            lastTimeRef.current = timestamp;
            requestRef.current = requestAnimationFrame(loop);
        };
        requestRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(requestRef.current!);
    }, [update, draw]);

    return (
        <div className="flex flex-col h-full bg-neutral-950 text-white font-sans">
            <div className="p-4 flex justify-between items-center border-b border-white/10 bg-neutral-900/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <Icon name="arrow-left" className="w-6 h-6" />
                    </button>
                    <div>
                        <h2 className="text-lg font-black tracking-tight uppercase text-red-500">SUPER GOAT BROS</h2>
                        <div className="flex gap-4 text-[10px] uppercase font-bold text-neutral-500">
                            <span>Mundo: {world}-{level}</span>
                            <span>Mejor: {bestScore}</span>
                            <span className="text-red-400">Vidas: {lives}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={() => {
                if (!gameStarted || (gameOver && lives <= 0)) initGame(1, 1);
            }}>
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={480}
                    className="max-w-full max-h-full aspect-[5/3] bg-black rounded-xl shadow-[0_0_50px_rgba(239,68,68,0.2)] border-4 border-neutral-800"
                    style={{ imageRendering: 'pixelated' }}
                />
            </div>
            
            {/* Mobile Controls */}
            <div className="md:hidden p-4 flex justify-between items-center bg-neutral-900 border-t border-white/10">
                <div className="flex gap-2">
                    <button 
                        onPointerDown={() => gameState.current.keys['ArrowLeft'] = true}
                        onPointerUp={() => gameState.current.keys['ArrowLeft'] = false}
                        onPointerLeave={() => gameState.current.keys['ArrowLeft'] = false}
                        className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center active:bg-white/20"
                    >
                        <Icon name="chevron-left" className="w-8 h-8" />
                    </button>
                    <button 
                        onPointerDown={() => gameState.current.keys['ArrowRight'] = true}
                        onPointerUp={() => gameState.current.keys['ArrowRight'] = false}
                        onPointerLeave={() => gameState.current.keys['ArrowRight'] = false}
                        className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center active:bg-white/20"
                    >
                        <Icon name="chevron-right" className="w-8 h-8" />
                    </button>
                </div>
                <div className="flex gap-2">
                    <button 
                        onPointerDown={() => gameState.current.keys['Shift'] = true}
                        onPointerUp={() => gameState.current.keys['Shift'] = false}
                        onPointerLeave={() => gameState.current.keys['Shift'] = false}
                        className="w-16 h-16 bg-blue-500/20 text-blue-500 border border-blue-500/50 rounded-full flex items-center justify-center active:bg-blue-500/40 font-bold text-2xl"
                    >
                        🏃
                    </button>
                    <button 
                        onPointerDown={() => gameState.current.keys[' '] = true}
                        onPointerUp={() => gameState.current.keys[' '] = false}
                        onPointerLeave={() => gameState.current.keys[' '] = false}
                        className="w-16 h-16 bg-red-500/20 text-red-500 border border-red-500/50 rounded-full flex items-center justify-center active:bg-red-500/40 font-bold"
                    >
                        👅
                    </button>
                    <button 
                        onPointerDown={() => gameState.current.keys['ArrowUp'] = true}
                        onPointerUp={() => gameState.current.keys['ArrowUp'] = false}
                        onPointerLeave={() => gameState.current.keys['ArrowUp'] = false}
                        className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center active:bg-white/20"
                    >
                        <Icon name="chevron-up" className="w-8 h-8" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SuperGoatBros;
