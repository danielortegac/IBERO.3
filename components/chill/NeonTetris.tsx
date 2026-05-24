import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../Icon';

interface NeonTetrisProps {
    onBack: () => void;
    onGameEnd: (score: number, xp: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

// --- CONSTANTS ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // Logical size
const TICK_RATE_START = 800;
const TICK_RATE_MIN = 100;
const SPEED_INCREMENT = 10;
const MILESTONE_SCORE = 1000;

// Colors for pieces
const COLORS = [
    '#000000', // 0: Empty
    '#06b6d4', // 1: I (Cyan)
    '#3b82f6', // 2: J (Blue)
    '#f97316', // 3: L (Orange)
    '#eab308', // 4: O (Yellow)
    '#22c55e', // 5: S (Green)
    '#a855f7', // 6: T (Purple)
    '#ef4444'  // 7: Z (Red)
];

// Tetromino shapes
const SHAPES = [
    [], // 0
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
    [[2, 0, 0], [2, 2, 2], [0, 0, 0]], // J
    [[0, 0, 3], [3, 3, 3], [0, 0, 0]], // L
    [[4, 4], [4, 4]], // O
    [[0, 5, 5], [5, 5, 0], [0, 0, 0]], // S
    [[0, 6, 0], [6, 6, 6], [0, 0, 0]], // T
    [[7, 7, 0], [0, 7, 7], [0, 0, 0]]  // Z
];

interface Piece {
    matrix: number[][];
    x: number;
    y: number;
    type: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
}

interface FloatingText {
    x: number;
    y: number;
    text: string;
    life: number;
    maxLife: number;
    color: string;
}

const NeonTetris: React.FC<NeonTetrisProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [lines, setLines] = useState(0);
    const [level, setLevel] = useState(1);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);

    const boardRef = useRef<number[][]>(Array(ROWS).fill(null).map(() => Array(COLS).fill(0)));
    const pieceRef = useRef<Piece | null>(null);
    const nextPieceRef = useRef<Piece | null>(null);
    const particlesRef = useRef<Particle[]>([]);
    const floatingTextsRef = useRef<FloatingText[]>([]);
    const dropCounterRef = useRef(0);
    const lastTimeRef = useRef(0);
    const animationRef = useRef<number>();
    const milestonesHitRef = useRef(0);

    // Audio context (lazy init)
    const audioCtxRef = useRef<AudioContext | null>(null);

    const playSound = useCallback((type: 'move' | 'rotate' | 'drop' | 'clear' | 'gameover') => {
        if (!soundEnabled) return;
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') ctx.resume();

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            const now = ctx.currentTime;
            
            switch (type) {
                case 'move':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                    osc.start(now);
                    osc.stop(now + 0.05);
                    break;
                case 'rotate':
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(600, now);
                    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;
                case 'drop':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;
                case 'clear':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
                    osc.frequency.linearRampToValueAtTime(1600, now + 0.2);
                    gain.gain.setValueAtTime(0.3, now);
                    gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                    break;
                case 'gameover':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(300, now);
                    osc.frequency.exponentialRampToValueAtTime(50, now + 1);
                    gain.gain.setValueAtTime(0.3, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 1);
                    osc.start(now);
                    osc.stop(now + 1);
                    break;
            }
        } catch (e) {
            console.error("Audio error", e);
        }
    }, [soundEnabled]);

    const createPiece = (type: number): Piece => {
        return {
            matrix: SHAPES[type],
            x: Math.floor(COLS / 2) - Math.floor(SHAPES[type][0].length / 2),
            y: 0,
            type
        };
    };

    const spawnParticles = (x: number, y: number, color: string, count: number) => {
        for (let i = 0; i < count; i++) {
            particlesRef.current.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 0,
                maxLife: 20 + Math.random() * 20,
                color,
                size: 2 + Math.random() * 4
            });
        }
    };

    const spawnFloatingText = (x: number, y: number, text: string, color: string) => {
        floatingTextsRef.current.push({
            x,
            y,
            text,
            life: 0,
            maxLife: 60,
            color
        });
    };

    const collide = (board: number[][], piece: Piece) => {
        const m = piece.matrix;
        for (let y = 0; y < m.length; ++y) {
            for (let x = 0; x < m[y].length; ++x) {
                if (m[y][x] !== 0 &&
                   (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0) {
                    return true;
                }
            }
        }
        return false;
    };

    const merge = (board: number[][], piece: Piece) => {
        piece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    board[y + piece.y][x + piece.x] = value;
                }
            });
        });
    };

    const rotate = (matrix: number[][], dir: number) => {
        const newMatrix = matrix.map((_, i) => matrix.map(col => col[i]));
        if (dir > 0) return newMatrix.map(row => row.reverse());
        return newMatrix.reverse();
    };

    const playerDrop = () => {
        if (!pieceRef.current || isPaused || gameOver) return;
        pieceRef.current.y++;
        if (collide(boardRef.current, pieceRef.current)) {
            pieceRef.current.y--;
            merge(boardRef.current, pieceRef.current);
            resetPiece();
            arenaSweep();
            playSound('drop');
        }
        dropCounterRef.current = 0;
    };

    const playerMove = (offset: number) => {
        if (!pieceRef.current || isPaused || gameOver) return;
        pieceRef.current.x += offset;
        if (collide(boardRef.current, pieceRef.current)) {
            pieceRef.current.x -= offset;
        } else {
            playSound('move');
        }
    };

    const playerRotate = (dir: number) => {
        if (!pieceRef.current || isPaused || gameOver) return;
        const pos = pieceRef.current.x;
        let offset = 1;
        pieceRef.current.matrix = rotate(pieceRef.current.matrix, dir);
        while (collide(boardRef.current, pieceRef.current)) {
            pieceRef.current.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > pieceRef.current.matrix[0].length) {
                pieceRef.current.matrix = rotate(pieceRef.current.matrix, -dir);
                pieceRef.current.x = pos;
                return;
            }
        }
        playSound('rotate');
    };

    const hardDrop = () => {
        if (!pieceRef.current || isPaused || gameOver) return;
        let dropDistance = 0;
        while (!collide(boardRef.current, pieceRef.current)) {
            pieceRef.current.y++;
            dropDistance++;
        }
        pieceRef.current.y--;
        merge(boardRef.current, pieceRef.current);
        
        // Add particles for hard drop
        const color = COLORS[pieceRef.current.type];
        for (let x = 0; x < pieceRef.current.matrix[0].length; x++) {
            if (pieceRef.current.matrix[pieceRef.current.matrix.length - 1][x] !== 0) {
                spawnParticles((pieceRef.current.x + x) * BLOCK_SIZE + BLOCK_SIZE / 2, (pieceRef.current.y + pieceRef.current.matrix.length) * BLOCK_SIZE, color, 5);
            }
        }

        resetPiece();
        arenaSweep();
        playSound('drop');
        
        // Score for hard drop
        setScore(prev => {
            const newScore = prev + dropDistance * 2;
            checkMilestone(newScore);
            return newScore;
        });
        dropCounterRef.current = 0;
    };

    const resetPiece = () => {
        if (!nextPieceRef.current) {
            nextPieceRef.current = createPiece(Math.floor(Math.random() * 7) + 1);
        }
        pieceRef.current = nextPieceRef.current;
        nextPieceRef.current = createPiece(Math.floor(Math.random() * 7) + 1);
        
        pieceRef.current.y = 0;
        if (collide(boardRef.current, pieceRef.current)) {
            // Game Over
            setGameOver(true);
            setIsPlaying(false);
            playSound('gameover');
            onGameEnd(score, score, milestonesHitRef.current > 0);
        }
    };

    const checkMilestone = (currentScore: number) => {
        if (currentScore > 0 && currentScore % MILESTONE_SCORE < 100 && currentScore / MILESTONE_SCORE > milestonesHitRef.current) {
            milestonesHitRef.current += 1;
            onGameEnd(currentScore, 0, true); // Report milestone
        }
    };

    const arenaSweep = () => {
        let rowCount = 0;
        let clearedRows: number[] = [];
        
        outer: for (let y = boardRef.current.length - 1; y >= 0; --y) {
            for (let x = 0; x < boardRef.current[y].length; ++x) {
                if (boardRef.current[y][x] === 0) {
                    continue outer;
                }
            }
            clearedRows.push(y);
        }

        if (clearedRows.length > 0) {
            playSound('clear');
            
            // Spawn particles for cleared rows
            clearedRows.forEach(y => {
                for (let x = 0; x < COLS; x++) {
                    const color = COLORS[boardRef.current[y][x]];
                    spawnParticles(x * BLOCK_SIZE + BLOCK_SIZE / 2, y * BLOCK_SIZE + BLOCK_SIZE / 2, color, 3);
                }
            });

            // Remove rows and add empty ones at top
            clearedRows.forEach(y => {
                const row = boardRef.current.splice(y, 1)[0].fill(0);
                boardRef.current.unshift(row);
            });

            rowCount = clearedRows.length;
            
            let lineScore = 0;
            switch (rowCount) {
                case 1: lineScore = 100; break;
                case 2: lineScore = 300; break;
                case 3: lineScore = 500; break;
                case 4: lineScore = 800; break;
            }
            
            const levelMultiplier = level;
            const totalScore = lineScore * levelMultiplier;
            
            if (rowCount >= 4) {
                spawnFloatingText(COLS * BLOCK_SIZE / 2, ROWS * BLOCK_SIZE / 2, "TETRIS!", "#06b6d4");
            } else if (rowCount > 1) {
                spawnFloatingText(COLS * BLOCK_SIZE / 2, ROWS * BLOCK_SIZE / 2, `+${totalScore}`, "#22c55e");
            }

            setScore(prev => {
                const newScore = prev + totalScore;
                checkMilestone(newScore);
                return newScore;
            });
            
            setLines(prev => {
                const newLines = prev + rowCount;
                setLevel(Math.floor(newLines / 10) + 1);
                return newLines;
            });
        }
    };

    const drawMatrix = (ctx: CanvasRenderingContext2D, matrix: number[][], offset: {x: number, y: number}, isGhost: boolean = false) => {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const color = COLORS[value];
                    ctx.fillStyle = isGhost ? color + '40' : color;
                    
                    const px = (x + offset.x) * BLOCK_SIZE;
                    const py = (y + offset.y) * BLOCK_SIZE;
                    
                    ctx.fillRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
                    
                    if (!isGhost) {
                        // Inner highlight
                        ctx.fillStyle = 'rgba(255,255,255,0.3)';
                        ctx.fillRect(px, py, BLOCK_SIZE, 2);
                        ctx.fillRect(px, py, 2, BLOCK_SIZE);
                        
                        // Outer shadow/glow
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = color;
                        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
                        ctx.shadowBlur = 0;
                    }
                }
            });
        });
    };

    const draw = useCallback((ctx: CanvasRenderingContext2D) => {
        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);

        // Draw grid
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= COLS; i++) {
            ctx.beginPath();
            ctx.moveTo(i * BLOCK_SIZE, 0);
            ctx.lineTo(i * BLOCK_SIZE, ROWS * BLOCK_SIZE);
            ctx.stroke();
        }
        for (let i = 0; i <= ROWS; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * BLOCK_SIZE);
            ctx.lineTo(COLS * BLOCK_SIZE, i * BLOCK_SIZE);
            ctx.stroke();
        }

        // Draw board
        drawMatrix(ctx, boardRef.current, {x: 0, y: 0});

        // Draw ghost piece
        if (pieceRef.current && !gameOver && !isPaused) {
            const ghost = { ...pieceRef.current, y: pieceRef.current.y };
            while (!collide(boardRef.current, ghost)) {
                ghost.y++;
            }
            ghost.y--;
            drawMatrix(ctx, ghost.matrix, {x: ghost.x, y: ghost.y}, true);
            
            // Draw active piece
            drawMatrix(ctx, pieceRef.current.matrix, {x: pieceRef.current.x, y: pieceRef.current.y});
        }

        // Draw particles
        particlesRef.current.forEach(p => {
            ctx.fillStyle = p.color + Math.floor((1 - p.life / p.maxLife) * 255).toString(16).padStart(2, '0');
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw floating texts
        floatingTextsRef.current.forEach(ft => {
            const alpha = 1 - ft.life / ft.maxLife;
            ctx.fillStyle = ft.color;
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 24px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Outline
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.strokeText(ft.text, ft.x, ft.y - (ft.life * 0.5));
            
            ctx.fillText(ft.text, ft.x, ft.y - (ft.life * 0.5));
            ctx.globalAlpha = 1.0;
        });

        if (isPaused) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 30px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSA', (COLS * BLOCK_SIZE) / 2, (ROWS * BLOCK_SIZE) / 2);
        }

        if (gameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, 0, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 30px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', (COLS * BLOCK_SIZE) / 2, (ROWS * BLOCK_SIZE) / 2 - 20);
            ctx.fillStyle = '#fff';
            ctx.font = '16px Inter';
            ctx.fillText(`Puntuación: ${score}`, (COLS * BLOCK_SIZE) / 2, (ROWS * BLOCK_SIZE) / 2 + 20);
        }
    }, [gameOver, isPaused, score]);

    const update = useCallback((time: number = 0) => {
        const deltaTime = time - lastTimeRef.current;
        lastTimeRef.current = time;

        if (isPlaying && !isPaused && !gameOver) {
            dropCounterRef.current += deltaTime;
            
            const currentTickRate = Math.max(TICK_RATE_MIN, TICK_RATE_START - (level - 1) * SPEED_INCREMENT);
            
            if (dropCounterRef.current > currentTickRate) {
                playerDrop();
            }

            // Update particles
            for (let i = particlesRef.current.length - 1; i >= 0; i--) {
                const p = particlesRef.current[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.5; // gravity
                p.life++;
                if (p.life >= p.maxLife) {
                    particlesRef.current.splice(i, 1);
                }
            }

            // Update floating texts
            for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
                const ft = floatingTextsRef.current[i];
                ft.life++;
                if (ft.life >= ft.maxLife) {
                    floatingTextsRef.current.splice(i, 1);
                }
            }
        }

        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                draw(ctx);
            }
        }

        animationRef.current = requestAnimationFrame(update);
    }, [isPlaying, isPaused, gameOver, level, draw]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isPlaying || isPaused || gameOver) return;
            
            switch (e.key) {
                case 'ArrowLeft':
                    playerMove(-1);
                    break;
                case 'ArrowRight':
                    playerMove(1);
                    break;
                case 'ArrowDown':
                    playerDrop();
                    break;
                case 'ArrowUp':
                    playerRotate(1);
                    break;
                case ' ':
                    hardDrop();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, isPaused, gameOver]);

    useEffect(() => {
        if (isPlaying) {
            lastTimeRef.current = performance.now();
            animationRef.current = requestAnimationFrame(update);
        }
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isPlaying, update]);

    const startGame = () => {
        boardRef.current = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
        setScore(0);
        setLines(0);
        setLevel(1);
        setGameOver(false);
        setIsPaused(false);
        milestonesHitRef.current = 0;
        particlesRef.current = [];
        floatingTextsRef.current = [];
        resetPiece();
        setIsPlaying(true);
    };

    // Next piece preview canvas
    const nextPieceCanvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (nextPieceCanvasRef.current && nextPieceRef.current) {
            const ctx = nextPieceCanvasRef.current.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, 100, 100);
                const matrix = nextPieceRef.current.matrix;
                const bs = 20; // smaller block size for preview
                const offsetX = (100 - matrix[0].length * bs) / 2;
                const offsetY = (100 - matrix.length * bs) / 2;
                
                matrix.forEach((row, y) => {
                    row.forEach((value, x) => {
                        if (value !== 0) {
                            const color = COLORS[value];
                            ctx.fillStyle = color;
                            ctx.fillRect(offsetX + x * bs, offsetY + y * bs, bs, bs);
                            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                            ctx.strokeRect(offsetX + x * bs, offsetY + y * bs, bs, bs);
                        }
                    });
                });
            }
        }
    }, [nextPieceRef.current, isPlaying]);

    return (
        <div className="h-full flex flex-col items-center justify-center bg-neutral-950 p-4 select-none">
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
                            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                        >
                            <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                        </button>
                    )}
                </div>
                
                <div className="flex gap-4 text-center">
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Puntuación</div>
                        <div className="text-lg font-black text-cyan-400">{score}</div>
                    </div>
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Mejor</div>
                        <div className="text-lg font-black text-pink-400">{bestScore}</div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`p-2 rounded-full transition-colors ${soundEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-neutral-800 text-neutral-500'}`}
                    >
                        <Icon name={soundEnabled ? "volume-2" : "volume-x"} className="w-5 h-5" />
                    </button>
                    {isPlaying && !gameOver && (
                        <button 
                            onClick={() => setIsPaused(!isPaused)}
                            className="p-2 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                        >
                            <Icon name={isPaused ? "play" : "pause"} className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Game Area */}
            <div className="flex flex-col md:flex-row gap-4 items-center md:items-start w-full max-w-4xl justify-center max-h-[75vh] overflow-hidden">
                <div className="relative bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-[0_0_30px_rgba(6,182,212,0.1)] h-full aspect-[1/2] flex items-center justify-center">
                    <canvas
                        ref={canvasRef}
                        width={COLS * BLOCK_SIZE}
                        height={ROWS * BLOCK_SIZE}
                        className="rounded bg-black block h-full w-auto object-contain"
                    />
                    
                    {!isPlaying && !gameOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                            <Icon name="layout" className="w-16 h-16 text-cyan-500 mb-4 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
                            <h2 className="text-2xl font-black text-white mb-2 tracking-wider">NEON TETRIS</h2>
                            <p className="text-neutral-400 text-sm mb-6 text-center px-4">
                                Usa las flechas para mover y rotar.<br/>Espacio para caída rápida.
                            </p>
                            <button 
                                onClick={startGame}
                                className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-full transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                            >
                                JUGAR
                            </button>
                        </div>
                    )}

                    {gameOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                            <h2 className="text-3xl font-black text-red-500 mb-2 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">GAME OVER</h2>
                            <p className="text-white text-lg mb-6">Puntuación: <span className="text-cyan-400 font-bold">{score}</span></p>
                            <button 
                                onClick={startGame}
                                className="px-8 py-3 bg-white hover:bg-neutral-200 text-black font-black rounded-full transition-all hover:scale-105 flex items-center gap-2"
                            >
                                <Icon name="rotate-ccw" className="w-5 h-5" />
                                REINTENTAR
                            </button>
                        </div>
                    )}
                </div>

                {/* Side Panel */}
                <div className="hidden md:flex flex-col gap-4">
                    <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 flex flex-col items-center">
                        <div className="text-xs text-neutral-500 uppercase font-bold mb-2">Siguiente</div>
                        <canvas ref={nextPieceCanvasRef} width={100} height={100} className="bg-black rounded" />
                    </div>
                    
                    <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 flex flex-col items-center">
                        <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Nivel</div>
                        <div className="text-2xl font-black text-white">{level}</div>
                    </div>
                    
                    <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 flex flex-col items-center">
                        <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Líneas</div>
                        <div className="text-2xl font-black text-white">{lines}</div>
                    </div>
                </div>
            </div>

            {/* Mobile Controls */}
            {isPlaying && !gameOver && (
                <div className="md:hidden w-full max-w-sm mt-4 grid grid-cols-3 gap-2 px-2 pb-2">
                    <button 
                        className="col-start-1 bg-neutral-800/80 active:bg-neutral-700 p-4 rounded-xl flex items-center justify-center touch-manipulation"
                        onClick={() => playerMove(-1)}
                    >
                        <Icon name="arrow-left" className="w-8 h-8 text-white" />
                    </button>
                    <button 
                        className="col-start-2 bg-neutral-800/80 active:bg-neutral-700 p-4 rounded-xl flex items-center justify-center touch-manipulation"
                        onClick={() => playerRotate(1)}
                    >
                        <Icon name="rotate-cw" className="w-8 h-8 text-white" />
                    </button>
                    <button 
                        className="col-start-3 bg-neutral-800/80 active:bg-neutral-700 p-4 rounded-xl flex items-center justify-center touch-manipulation"
                        onClick={() => playerMove(1)}
                    >
                        <Icon name="arrow-right" className="w-8 h-8 text-white" />
                    </button>
                    <button 
                        className="col-start-1 col-span-2 bg-neutral-800/80 active:bg-neutral-700 p-4 rounded-xl flex items-center justify-center touch-manipulation"
                        onClick={() => playerDrop()}
                    >
                        <Icon name="arrow-down" className="w-8 h-8 text-white" />
                    </button>
                    <button 
                        className="col-start-3 bg-cyan-600/50 active:bg-cyan-500/80 p-4 rounded-xl flex items-center justify-center touch-manipulation border border-cyan-500/30"
                        onClick={() => hardDrop()}
                    >
                        <Icon name="chevrons-down" className="w-8 h-8 text-cyan-200" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default NeonTetris;
