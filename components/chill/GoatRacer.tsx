import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import MobileGameControls from './MobileGameControls';
import { 
  sendGameInvitation, 
  listenToInvitations, 
  respondToInvitation, 
  createGameSession, 
  listenToGameSession, 
  updateGameState,
  endSession,
  GameInvitation
} from '../../services/multiplayerService';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface GoatRacerProps {
    user: any;
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const CAR_TYPES = [
    { id: 'speed', name: 'Veloz', color: '#3b82f6', speed: 7, handling: 0.8, icon: 'zap', desc: 'Máxima velocidad, difícil de controlar' },
    { id: 'handling', name: 'Ágil', color: '#10b981', speed: 5, handling: 1.2, icon: 'mouse-pointer', desc: 'Control total en las curvas' },
    { id: 'tank', name: 'Tanque', color: '#f59e0b', speed: 4, handling: 0.6, icon: 'shield', desc: 'Lento pero resistente' }
];

const GoatRacer: React.FC<GoatRacerProps> = ({ user, onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [mode, setMode] = useState<'menu' | 'playing' | 'multiplayer'>('menu');
    const [selectedCar, setSelectedCar] = useState(CAR_TYPES[0]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [invitations, setInvitations] = useState<GameInvitation[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [status, setStatus] = useState('');
    const [mobileControlMode, setMobileControlMode] = useState<'buttons' | 'tilt'>('buttons');
    const [tiltAvailable, setTiltAvailable] = useState(false);
    const tiltCooldownRef = useRef(0);

    const CANVAS_WIDTH = 400;
    const CANVAS_HEIGHT = 600;

    const gameState = useRef({
        player: { x: 180, y: 500, width: 40, height: 70, targetX: 180, drift: 0 },
        otherPlayer: { x: 180, y: 500, width: 40, height: 70, active: false, color: '#ef4444' },
        obstacles: [] as { x: number; y: number; width: number; height: number; speed: number; type: number }[],
        particles: [] as { x: number; y: number; vx: number; vy: number; life: number; color: string }[],
        roadOffset: 0,
        speed: 5,
        lastObstacle: 0,
        nitro: 100,
        isNitroActive: false,
        isDrifting: false
    });


    const steerLeft = () => {
        gameState.current.player.targetX = Math.max(80, gameState.current.player.targetX - 100);
    };

    const steerRight = () => {
        gameState.current.player.targetX = Math.min(280, gameState.current.player.targetX + 100);
    };

    const setNitro = (active: boolean) => {
        gameState.current.isNitroActive = active;
    };

    const enableTiltControls = async () => {
        try {
            const DeviceOrientation = window.DeviceOrientationEvent as any;
            if (DeviceOrientation?.requestPermission) {
                const permission = await DeviceOrientation.requestPermission();
                if (permission !== 'granted') {
                    setStatus('Permiso de movimiento no concedido. Usa botones táctiles.');
                    setMobileControlMode('buttons');
                    return;
                }
            }
            setTiltAvailable(true);
            setMobileControlMode('tilt');
            setStatus('Modo giroscopio activo: inclina el celular para curvar.');
            setTimeout(() => setStatus(''), 2500);
        } catch (err) {
            console.warn('Tilt controls unavailable', err);
            setStatus('Tu navegador no permitió el giroscopio. Usa botones táctiles.');
            setMobileControlMode('buttons');
        }
    };

    // Multiplayer Logic
    useEffect(() => {
        if (user) {
            const unsubscribe = listenToInvitations(user.uid, (invs) => {
                setInvitations(invs.filter(i => i.gameType === 'racer'));
            });
            return () => unsubscribe();
        }
    }, [user]);

    useEffect(() => {
        if (sessionId) {
            const unsubscribe = listenToGameSession(sessionId, (session) => {
                if (session.status === 'playing') {
                    const otherPlayerId = session.playerIds.find(id => id !== user.uid);
                    const otherState = session.players[otherPlayerId!].state;
                    if (otherState && typeof otherState.x === 'number') {
                        gameState.current.otherPlayer.x = otherState.x;
                        gameState.current.otherPlayer.active = true;
                    }
                }
            });
            return () => unsubscribe();
        }
    }, [sessionId, user.uid]);

    const startGame = () => {
        setMode('playing');
        setIsPlaying(true);
        setGameOver(false);
        setScore(0);
        gameState.current = {
            player: { x: 180, y: 500, width: 40, height: 70, targetX: 180, drift: 0 },
            otherPlayer: { x: 180, y: 500, width: 40, height: 70, active: false, color: '#ef4444' },
            obstacles: [],
            particles: [],
            roadOffset: 0,
            speed: selectedCar.speed,
            lastObstacle: 0,
            nitro: 100,
            isNitroActive: false,
            isDrifting: false
        };
    };

    const update = () => {
        if (!isPlaying || gameOver) return;

        const state = gameState.current;
        
        // Nitro logic
        if (state.isNitroActive && state.nitro > 0) {
            state.speed += 0.1;
            state.nitro -= 0.5;
            if (state.nitro <= 0) state.isNitroActive = false;
        } else {
            state.nitro = Math.min(100, state.nitro + 0.1);
        }

        state.roadOffset += state.speed;
        state.speed += 0.0008; // Slightly faster acceleration

        // Steering
        const steeringSpeed = 0.25 * selectedCar.handling;
        state.player.x += (state.player.targetX - state.player.x) * steeringSpeed;

        // Keep player in bounds (Lanes at 80, 180, 280)
        state.player.x = Math.max(80, Math.min(280, state.player.x));
        state.player.targetX = Math.max(80, Math.min(280, state.player.targetX));

        // Sync multiplayer position
        if (sessionId) {
            updateGameState(sessionId, user.uid, { x: state.player.x });
        }

        // Particles (Smoke)
        if (Math.random() > 0.5) {
            state.particles.push({
                x: state.player.x + 10 + Math.random() * 20,
                y: state.player.y + 60,
                vx: (Math.random() - 0.5) * 2,
                vy: 2 + Math.random() * 2,
                life: 1,
                color: 'rgba(255,255,255,0.2)'
            });
        }

        state.particles.forEach((p, i) => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            if (p.life <= 0) state.particles.splice(i, 1);
        });

        // Spawn obstacles
        if (Date.now() - state.lastObstacle > 1200 / (state.speed / 5)) {
            const lanes = [80, 180, 280];
            const lane = Math.floor(Math.random() * 3);
            state.obstacles.push({
                x: lanes[lane],
                y: -100,
                width: 40,
                height: 70,
                speed: state.speed * 0.6 + (Math.random() * 1.5),
                type: Math.floor(Math.random() * 3)
            });
            state.lastObstacle = Date.now();
        }

        // Move obstacles
        state.obstacles.forEach((o, i) => {
            o.y += o.speed;

            if (o.y > CANVAS_HEIGHT) {
                state.obstacles.splice(i, 1);
                setScore(s => s + 10);
            }

            // Collision
            if (
                state.player.x < o.x + o.width &&
                state.player.x + state.player.width > o.x &&
                state.player.y < o.y + o.height &&
                state.player.y + state.player.height > o.y
            ) {
                endGame();
            }
        });
    };

    const drawCar = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, isPlayer: boolean) => {
        ctx.save();
        ctx.translate(x, y);

        // Body
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 40, 70);
        
        // Highlights
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(0, 0, 5, 70);
        ctx.fillRect(35, 0, 5, 70);

        // Windshield
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(5, 15, 30, 15);
        
        // Roof
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(5, 30, 30, 25);

        // Headlights
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.fillRect(5, 2, 8, 4);
        ctx.fillRect(27, 2, 8, 4);
        
        // Tail lights
        ctx.fillStyle = '#f00';
        ctx.shadowColor = '#f00';
        ctx.fillRect(5, 64, 8, 4);
        ctx.fillRect(27, 64, 8, 4);

        ctx.restore();
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        const state = gameState.current;

        // Cinematic background with depth
        const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        bg.addColorStop(0, '#07111f');
        bg.addColorStop(0.45, '#064e3b');
        bg.addColorStop(1, '#052e24');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Speed lines / movement energy
        ctx.strokeStyle = 'rgba(59,130,246,0.12)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 18; i++) {
            const y = (i * 42 + state.roadOffset * 1.8) % CANVAS_HEIGHT;
            ctx.beginPath();
            ctx.moveTo(20 + (i % 3) * 12, y);
            ctx.lineTo(5 + (i % 3) * 12, y + 24);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(CANVAS_WIDTH - 20 - (i % 3) * 12, y);
            ctx.lineTo(CANVAS_WIDTH - 5 - (i % 3) * 12, y + 24);
            ctx.stroke();
        }

        // Road Base with subtle gradient
        const road = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        road.addColorStop(0, '#27272a');
        road.addColorStop(0.55, '#171717');
        road.addColorStop(1, '#09090b');
        ctx.fillStyle = road;
        ctx.fillRect(50, 0, 300, CANVAS_HEIGHT);

        // Road glow edges
        ctx.fillStyle = 'rgba(59,130,246,0.08)';
        ctx.fillRect(50, 0, 6, CANVAS_HEIGHT);
        ctx.fillRect(344, 0, 6, CANVAS_HEIGHT);

        // Curbs (Red and White alternating)
        const curbHeight = 40;
        const offset = state.roadOffset % (curbHeight * 2);
        for (let i = -curbHeight * 2; i < CANVAS_HEIGHT; i += curbHeight) {
            ctx.fillStyle = Math.floor(Math.abs(i - offset) / curbHeight) % 2 === 0 ? '#ef4444' : '#ffffff';
            ctx.fillRect(40, i + offset, 10, curbHeight); // Left curb
            ctx.fillRect(350, i + offset, 10, curbHeight); // Right curb
        }

        // Lane dividers (Dashed white lines)
        const dashHeight = 40;
        const gapHeight = 40;
        const totalDash = dashHeight + gapHeight;
        const dashOffset = state.roadOffset % totalDash;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = -totalDash; i < CANVAS_HEIGHT; i += totalDash) {
            ctx.fillRect(148, i + dashOffset, 4, dashHeight);
            ctx.fillRect(248, i + dashOffset, 4, dashHeight);
        }

        // Particles
        state.particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 * p.life, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Other Player
        if (state.otherPlayer.active) {
            drawCar(ctx, state.otherPlayer.x, state.otherPlayer.y, state.otherPlayer.color, false);
        }

        // Player
        drawCar(ctx, state.player.x, state.player.y, selectedCar.color, true);
        
        // Nitro Flames
        if (state.isNitroActive && state.nitro > 0) {
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.moveTo(state.player.x + 10, state.player.y + 70);
            ctx.lineTo(state.player.x + 20, state.player.y + 90 + Math.random() * 10);
            ctx.lineTo(state.player.x + 30, state.player.y + 70);
            ctx.fill();
        }

        // Obstacles
        state.obstacles.forEach(o => {
            const colors = ['#ef4444', '#ec4899', '#8b5cf6'];
            drawCar(ctx, o.x, o.y, colors[o.type], false);
        });

        // Minimal in-canvas HUD for mobile/fullscreen
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(12, 12, 116, 34, 10);
        else ctx.rect(12, 12, 116, 34);
        ctx.fill();
        ctx.fillStyle = '#93c5fd';
        ctx.font = '900 10px Inter, system-ui, sans-serif';
        ctx.fillText('VELOCIDAD', 22, 26);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 16px Inter, system-ui, sans-serif';
        ctx.fillText(`${Math.round(state.speed * 18)} KM/H`, 22, 42);
    };

    const endGame = () => {
        setGameOver(true);
        setIsPlaying(false);
        onGameEnd(score, Math.floor(score / 10), score > 1000);
        if (sessionId) endSession(sessionId);
    };

    const handleSearch = async (val: string) => {
        setSearchQuery(val);
        if (val.length < 3) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const q = query(
                collection(db, 'users'),
                where('email', '>=', val),
                where('email', '<=', val + '\uf8ff'),
                limit(5)
            );
            const snap = await getDocs(q);
            setSearchResults(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.uid !== user.uid));
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const invitePlayer = async (targetUser: any) => {
        setStatus(`Invitando a ${targetUser.displayName || targetUser.email}...`);
        await sendGameInvitation(user.uid, user.displayName || user.email, targetUser.uid, 'racer');
        setSearchQuery('');
        setSearchResults([]);
        setTimeout(() => setStatus(''), 3000);
    };

    const acceptInvitation = async (inv: GameInvitation) => {
        await respondToInvitation(inv.id!, 'accepted');
        const session = await createGameSession('racer', { uid: inv.fromId, name: inv.fromName }, { uid: user.uid, name: user.displayName || user.email });
        setSessionId(session.id);
        setMode('playing');
        setIsPlaying(true);
        setGameOver(false);
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
    }, [isPlaying, gameOver, selectedCar]);


    useEffect(() => {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            if (mobileControlMode !== 'tilt' || !isPlaying || gameOver) return;
            const gamma = event.gamma ?? 0;
            const now = Date.now();
            if (now - tiltCooldownRef.current < 180) return;
            if (gamma < -10) {
                steerLeft();
                tiltCooldownRef.current = now;
            } else if (gamma > 10) {
                steerRight();
                tiltCooldownRef.current = now;
            }
        };
        window.addEventListener('deviceorientation', handleOrientation);
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, [mobileControlMode, isPlaying, gameOver]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') steerLeft();
            if (e.key === 'ArrowRight') steerRight();
            if (e.key === ' ' || e.key === 'ArrowUp') setNitro(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === ' ' || e.key === 'ArrowUp') setNitro(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
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
                <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                    <div className="text-[10px] text-neutral-500 uppercase font-bold">Puntos</div>
                    <div className="text-lg font-black text-blue-400">{score}</div>
                </div>
            </div>

            {mode === 'menu' ? (
                <div className="w-full max-w-md flex flex-col gap-6">
                    <div className="text-center">
                        <h2 className="text-3xl font-black text-blue-400 tracking-wider uppercase mb-2">GOAT RACER</h2>
                        <p className="text-neutral-500 text-sm">Escoge tu vehículo y domina la pista</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {CAR_TYPES.map(car => (
                            <button 
                                key={car.id}
                                onClick={() => setSelectedCar(car)}
                                className={`p-4 rounded-2xl border transition-all flex items-center gap-4 text-left relative overflow-hidden group ${selectedCar.id === car.id ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'bg-neutral-900 border-white/5 hover:border-white/10'}`}
                            >
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: `${car.color}20` }}>
                                    <Icon name={car.icon as any} className="w-6 h-6" style={{ color: car.color }} />
                                </div>
                                <div className="flex-1">
                                    <div className="font-black uppercase tracking-tighter text-sm">{car.name}</div>
                                    <div className="text-[10px] text-neutral-500 font-bold uppercase">{car.desc}</div>
                                    <div className="mt-2 flex gap-1 h-1 w-24 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${car.speed * 10}%` }}></div>
                                    </div>
                                </div>
                                {selectedCar.id === car.id && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={startGame} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all hover:scale-[1.02] uppercase tracking-wider">
                            Carrera Solo
                        </button>
                    </div>

                    <div className="p-6 bg-neutral-900 border border-white/5 rounded-2xl">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Icon name="users" className="w-5 h-5 text-blue-400" />
                            Duelo Online
                        </h3>
                        <div className="relative mb-4">
                            <input 
                                type="text" 
                                placeholder="Email o nombre..."
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                            />
                            {isSearching && <div className="absolute right-3 top-2.5 animate-spin"><Icon name="loader" className="w-4 h-4 text-neutral-500" /></div>}
                            
                            {searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-800 border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">
                                    {searchResults.map(u => (
                                        <button 
                                            key={u.uid}
                                            onClick={() => invitePlayer(u)}
                                            className="w-full px-4 py-3 text-left hover:bg-white/5 flex items-center gap-3 border-b border-white/5 last:border-0"
                                        >
                                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold">
                                                {u.displayName?.[0] || u.email[0]}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold">{u.displayName || u.email.split('@')[0]}</div>
                                                <div className="text-[10px] text-neutral-500">{u.email}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {status && <div className="text-xs text-blue-400 animate-pulse mb-4">{status}</div>}

                        {invitations.length > 0 && (
                            <div className="space-y-2">
                                {invitations.map(inv => (
                                    <div key={inv.id} className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                        <div className="text-xs font-bold">{inv.fromName} te invita</div>
                                        <div className="flex gap-2">
                                            <button onClick={() => respondToInvitation(inv.id!, 'declined')} className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg"><Icon name="x" className="w-4 h-4" /></button>
                                            <button onClick={() => acceptInvitation(inv)} className="p-1.5 bg-blue-500 hover:bg-blue-400 text-white rounded-lg"><Icon name="check" className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="relative bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-[0_0_30px_rgba(59,130,246,0.1)] w-full max-w-[400px] max-h-[70dvh] aspect-[2/3]">
                    <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="rounded bg-black block w-full h-full object-contain" />
                    
                    {/* Nitro Bar */}
                    <div className="absolute top-6 right-6 w-32 h-2 bg-black/40 rounded-full border border-white/10 overflow-hidden">
                        <div 
                            className="h-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)] transition-all duration-300"
                            style={{ width: `${gameState.current.nitro}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[8px] font-black text-white uppercase tracking-widest">NITRO</span>
                        </div>
                    </div>

                    {gameOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl backdrop-blur-sm">
                            <h2 className="text-3xl font-black text-red-500 mb-2 tracking-wider uppercase">¡CHOQUE TOTAL!</h2>
                            <div className="text-4xl font-black text-white mb-6">{score}</div>
                            <button onClick={startGame} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-full transition-all hover:scale-105">REINTENTAR</button>
                            <button onClick={() => setMode('menu')} className="mt-4 text-neutral-500 hover:text-white transition-colors">Volver al Menú</button>
                        </div>
                    )}
                </div>
            )}
            {mode !== 'menu' && (
                <>
                    <div className="md:hidden w-full max-w-md mt-3 flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => setMobileControlMode('buttons')}
                            className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mobileControlMode === 'buttons' ? 'bg-blue-500 text-white border-blue-400' : 'bg-white/5 text-white/60 border-white/10'}`}
                        >
                            Botones
                        </button>
                        <button
                            type="button"
                            onClick={enableTiltControls}
                            className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mobileControlMode === 'tilt' ? 'bg-orange-500 text-white border-orange-400' : 'bg-white/5 text-white/60 border-white/10'}`}
                        >
                            Curvar con celular
                        </button>
                    </div>
                    {mobileControlMode === 'buttons' ? (
                        <MobileGameControls
                            hint="Control táctil: carril izquierdo / derecho + nitro"
                            left={{ label: '←', ariaLabel: 'Cambiar al carril izquierdo', onPress: steerLeft }}
                            right={{ label: '→', ariaLabel: 'Cambiar al carril derecho', onPress: steerRight }}
                            action={{ label: 'NITRO', ariaLabel: 'Activar nitro', onPress: () => setNitro(true), onRelease: () => setNitro(false), wide: true }}
                        />
                    ) : (
                        <div className="md:hidden mt-3 px-4 py-3 rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-100 text-xs font-bold text-center max-w-md">
                            Inclina el celular izquierda/derecha para cambiar de carril. Toca NITRO para acelerar.
                            <div className="mt-2">
                                <button
                                    type="button"
                                    onPointerDown={() => setNitro(true)}
                                    onPointerUp={() => setNitro(false)}
                                    onPointerCancel={() => setNitro(false)}
                                    className="px-8 py-3 rounded-2xl bg-orange-500 text-black font-black active:scale-95 touch-none"
                                >
                                    NITRO
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
            <div className="mt-4 text-neutral-500 text-xs flex flex-wrap justify-center gap-4">
                <span>Desktop: ← → Cambiar carril</span>
                <span>Espacio / ↑ Nitro</span>
                <span className="md:hidden text-blue-300">Celular: botones o giroscopio</span>
            </div>
        </div>
    );
};

export default GoatRacer;
