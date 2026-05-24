import React, { useState, useEffect, useContext, useRef, lazy, Suspense } from 'react';
import { AppContext } from '../../context/AppContext';
import { getChillProfile, addChillProgress, getGlobalLeaderboard, syncChillIdentity, ChillProfile } from '../../services/chillService';
import Icon from '../Icon';
import Spinner from '../ui/Spinner';

const DinoRun = lazy(() => import('./DinoRun'));
const NeonSnake = lazy(() => import('./NeonSnake'));
const NeonTetris = lazy(() => import('./NeonTetris'));
const BrickBreaker = lazy(() => import('./BrickBreaker'));
const GoatKong = lazy(() => import('./GoatKong'));
const FlappyGoat = lazy(() => import('./FlappyGoat'));
const Goat2048 = lazy(() => import('./Goat2048'));
const MemoryMatch = lazy(() => import('./MemoryMatch'));
const WhackAMole = lazy(() => import('./WhackAMole'));
const Pacman = lazy(() => import('./Pacman'));
const Sudoku = lazy(() => import('./Sudoku'));
const TowerStack = lazy(() => import('./TowerStack'));
const GoatSniper = lazy(() => import('./GoatSniper'));
const SuperGoatBros = lazy(() => import('./SuperGoatBros'));
const GoatInvaders = lazy(() => import('./GoatInvaders'));
const GoatRacer = lazy(() => import('./GoatRacer'));
const PokerGame = lazy(() => import('./PokerGame'));
const BlackjackGame = lazy(() => import('./BlackjackGame'));
const SolitaireGame = lazy(() => import('./SolitaireGame'));
const WordSearchGame = lazy(() => import('./WordSearchGame'));
const CrosswordGame = lazy(() => import('./CrosswordGame'));
const ChessGame = lazy(() => import('./ChessGame'));
const PianoMaster = lazy(() => import('./PianoMaster'));

const preloadGameModule = (game: string) => {
    const importers: Record<string, () => Promise<any>> = {
        dinoRun: () => import('./DinoRun'),
        neonSnake: () => import('./NeonSnake'),
        neonTetris: () => import('./NeonTetris'),
        brickBreaker: () => import('./BrickBreaker'),
        goatKong: () => import('./GoatKong'),
        flappyGoat: () => import('./FlappyGoat'),
        '2048': () => import('./Goat2048'),
        memoryMatch: () => import('./MemoryMatch'),
        whackAMole: () => import('./WhackAMole'),
        pacman: () => import('./Pacman'),
        sudoku: () => import('./Sudoku'),
        towerStack: () => import('./TowerStack'),
        goatSniper: () => import('./GoatSniper'),
        superGoatBros: () => import('./SuperGoatBros'),
        goatInvaders: () => import('./GoatInvaders'),
        goatRacer: () => import('./GoatRacer'),
        poker: () => import('./PokerGame'),
        blackjack: () => import('./BlackjackGame'),
        solitaire: () => import('./SolitaireGame'),
        wordSearch: () => import('./WordSearchGame'),
        crossword: () => import('./CrosswordGame'),
        chess: () => import('./ChessGame'),
        pianoMaster: () => import('./PianoMaster'),
    };
    return importers[game]?.().catch(() => undefined);
};

const warmUpChillGames = () => {
    const firstBatch = ['neonSnake', 'dinoRun', 'goatRacer', 'flappyGoat', '2048', 'memoryMatch'];
    const secondBatch = ['neonTetris', 'brickBreaker', 'pacman', 'sudoku', 'goatInvaders', 'pianoMaster'];
    firstBatch.forEach(preloadGameModule);
    const runLater = () => secondBatch.forEach(preloadGameModule);
    if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(runLater, { timeout: 2500 });
    } else {
        globalThis.setTimeout(runLater, 1200);
    }
};

const GoatifyChill: React.FC = () => {
    const { currentUser, userProfile, updateUserProfile } = useContext(AppContext);
    const [profile, setProfile] = useState<ChillProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeGame, setActiveGame] = useState<'dinoRun' | 'neonSnake' | 'neonTetris' | 'flappyGoat' | 'brickBreaker' | 'goatKong' | 'pacman' | '2048' | 'memoryMatch' | 'whackAMole' | 'sudoku' | 'towerStack' | 'goatSniper' | 'superGoatBros' | 'goatInvaders' | 'goatRacer' | 'chess' | 'pianoMaster' | 'poker' | 'blackjack' | 'solitaire' | 'wordSearch' | 'crossword' | null>(null);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [leaderboardGame, setLeaderboardGame] = useState<'dinoRun' | 'neonSnake' | 'neonTetris' | 'brickBreaker' | 'goatKong' | 'flappyGoat' | '2048' | 'memoryMatch' | 'whackAMole' | 'pacman' | 'sudoku' | 'towerStack' | 'goatSniper' | 'superGoatBros' | 'goatInvaders' | 'goatRacer' | 'chess' | 'pianoMaster' | 'poker' | 'blackjack' | 'solitaire' | 'wordSearch' | 'crossword'>('neonSnake');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const visualFullscreen = isFullscreen || isPseudoFullscreen;

    const lockOrientationIfPossible = async () => {
        try {
            const orientation = (screen as any).orientation;
            if (orientation?.lock) {
                await orientation.lock('portrait-primary').catch(() => undefined);
            }
        } catch {
            // Algunos navegadores móviles no permiten bloquear orientación; no afecta el juego.
        }
    };

    const toggleFullscreen = async () => {
        const el = containerRef.current;
        if (!el) return;

        if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => undefined);
            setIsPseudoFullscreen(false);
            return;
        }

        if (isPseudoFullscreen) {
            setIsPseudoFullscreen(false);
            return;
        }

        try {
            if (el.requestFullscreen) {
                await el.requestFullscreen();
                await lockOrientationIfPossible();
            } else {
                setIsPseudoFullscreen(true);
            }
        } catch (err: any) {
            console.warn(`Fullscreen nativo no disponible; activando modo inmersivo visual: ${err?.message || err}`);
            setIsPseudoFullscreen(true);
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
            if (document.fullscreenElement) setIsPseudoFullscreen(false);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        const shouldLock = visualFullscreen;
        const previousOverflow = document.body.style.overflow;
        const previousOverscroll = (document.body.style as any).overscrollBehavior;
        if (shouldLock) {
            document.body.style.overflow = 'hidden';
            (document.body.style as any).overscrollBehavior = 'none';
        }
        return () => {
            document.body.style.overflow = previousOverflow;
            (document.body.style as any).overscrollBehavior = previousOverscroll;
        };
    }, [visualFullscreen, activeGame]);

    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isPseudoFullscreen) setIsPseudoFullscreen(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isPseudoFullscreen]);

    useEffect(() => {
        if (!currentUser) return;
        const cacheKey = `goatify_chill_profile_${currentUser.uid}`;
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                setProfile(JSON.parse(cached));
                setLoading(false);
            }
        } catch {}
        loadProfile();
        warmUpChillGames();
    }, [currentUser?.uid]);

    useEffect(() => {
        if (currentUser) {
            loadLeaderboard(leaderboardGame);
        }
    }, [currentUser?.uid, leaderboardGame]);

    const loadProfile = async () => {
        if (!currentUser) return;
        const cacheKey = `goatify_chill_profile_${currentUser.uid}`;
        if (!profile) setLoading(true);
        try {
            const displayName = [userProfile?.name, userProfile?.lastName].filter(Boolean).join(' ').trim() || currentUser.displayName || currentUser.email?.split('@')[0] || 'Jugador Goatify';
            const avatarUrl = userProfile?.avatarUrl || currentUser.photoURL || null;
            await syncChillIdentity(currentUser.uid, { displayName, avatarUrl, email: currentUser.email || '' });
            const p = await getChillProfile(currentUser.uid);
            const enriched = { ...p, displayName, avatarUrl, email: currentUser.email || p.email };
            setProfile(enriched);
            localStorage.setItem(cacheKey, JSON.stringify(enriched));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadLeaderboard = async (game: 'dinoRun' | 'neonSnake' | 'neonTetris' | 'brickBreaker' | 'goatKong' | 'flappyGoat' | '2048' | 'memoryMatch' | 'whackAMole' | 'pacman' | 'sudoku' | 'towerStack' | 'goatSniper' | 'superGoatBros' | 'goatInvaders' | 'goatRacer' | 'chess' | 'pianoMaster' | 'poker' | 'blackjack' | 'solitaire' | 'wordSearch' | 'crossword') => {
        try {
            const lb = await getGlobalLeaderboard(game);
            setLeaderboard(lb);
        } catch (e) {
            console.error(e);
        }
    };

    const handleGameEnd = async (game: 'dinoRun' | 'neonSnake' | 'neonTetris' | 'brickBreaker' | 'goatKong' | 'flappyGoat' | '2048' | 'memoryMatch' | 'whackAMole' | 'pacman' | 'sudoku' | 'towerStack' | 'goatSniper' | 'superGoatBros' | 'goatInvaders' | 'goatRacer' | 'chess' | 'pianoMaster' | 'poker' | 'blackjack' | 'solitaire' | 'wordSearch' | 'crossword', score: number, xpGained: number, hitMilestone: boolean) => {
        if (!currentUser || !profile) return;
        
        try {
            const result = await addChillProgress(currentUser.uid, game, score, xpGained, hitMilestone);
            
            // Reload profile to reflect changes
            await loadProfile();
            
            if (result.earnedInti) {
                // Update local user profile context to reflect the new Inti
                updateUserProfile(currentUser.uid, { intis: (userProfile.intis || 0) + 1 });
                alert("¡Felicidades! Has completado tus hitos diarios y ganado 1 Inti. Sigue jugando por la gloria y más XP.");
            } else if (hitMilestone && profile.dailyProgress < 10) {
                // Just a milestone
                // alert(`¡Hito completado! Progreso diario: ${(result.newProgress / 10) * 100}%`);
            }
            
            loadLeaderboard(leaderboardGame);
        } catch (e) {
            console.error("Error saving progress", e);
        }
    };

    const selectGame = (game: any) => {
        preloadGameModule(game);
        setActiveGame(game);
        // No forzamos pantalla completa al abrir: eso puede bloquear el navegador y hacer sentir lento el juego.
        // El usuario puede activarla desde el botón dentro de cada juego.
    };

    const renderContent = () => {
        if (loading || !profile) {
            return <div className="flex items-center justify-center h-full"><Spinner /></div>;
        }

        if (activeGame === 'dinoRun') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <DinoRun 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('dinoRun', score, xp, hit)} 
                        bestScore={profile.bestScores.dinoRun} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'neonSnake') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <NeonSnake 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('neonSnake', score, xp, hit)} 
                        bestScore={profile.bestScores.neonSnake} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'neonTetris') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <NeonTetris 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('neonTetris', score, xp, hit)} 
                        bestScore={profile.bestScores.neonTetris || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'brickBreaker') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <BrickBreaker 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('brickBreaker', score, xp, hit)} 
                        bestScore={profile.bestScores.brickBreaker || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'goatKong') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <GoatKong 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('goatKong', score, xp, hit)} 
                        bestScore={profile.bestScores.goatKong || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'flappyGoat') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <FlappyGoat 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('flappyGoat', score, xp, hit)} 
                        bestScore={profile.bestScores.flappyGoat || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === '2048') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <Goat2048 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('2048', score, xp, hit)} 
                        bestScore={profile.bestScores['2048'] || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'memoryMatch') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <MemoryMatch 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('memoryMatch', score, xp, hit)} 
                        bestScore={profile.bestScores.memoryMatch || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'whackAMole') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <WhackAMole 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('whackAMole', score, xp, hit)} 
                        bestScore={profile.bestScores.whackAMole || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'pacman') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <Pacman 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('pacman', score, xp, hit)} 
                        bestScore={profile.bestScores.pacman || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'sudoku') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <Sudoku 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('sudoku', score, xp, hit)} 
                        bestScore={profile.bestScores.sudoku || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'towerStack') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <TowerStack 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('towerStack', score, xp, hit)} 
                        bestScore={profile.bestScores.towerStack || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'goatSniper') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <GoatSniper 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('goatSniper', score, xp, hit)} 
                        bestScore={profile.bestScores.goatSniper || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'superGoatBros') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <SuperGoatBros 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('superGoatBros', score, xp, hit)} 
                        bestScore={profile.bestScores.superGoatBros || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'goatInvaders') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <GoatInvaders 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('goatInvaders', score, xp, hit)} 
                        bestScore={profile.bestScores.goatInvaders || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'goatRacer') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <GoatRacer 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('goatRacer', score, xp, hit)} 
                        bestScore={profile.bestScores.goatRacer || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                        user={{ uid: currentUser?.uid, email: currentUser?.email, displayName: profile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jugador Goatify' }}
                    />
                </Suspense>
            );
        }


        if (activeGame === 'poker') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <PokerGame 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('poker', score, xp, hit)} 
                        bestScore={profile.bestScores.poker || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'blackjack') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <BlackjackGame 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('blackjack', score, xp, hit)} 
                        bestScore={profile.bestScores.blackjack || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'solitaire') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <SolitaireGame 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('solitaire', score, xp, hit)} 
                        bestScore={profile.bestScores.solitaire || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'wordSearch') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <WordSearchGame 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('wordSearch', score, xp, hit)} 
                        bestScore={profile.bestScores.wordSearch || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'crossword') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <CrosswordGame 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('crossword', score, xp, hit)} 
                        bestScore={profile.bestScores.crossword || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'chess') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <ChessGame 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('chess', score, xp, hit)} 
                        bestScore={profile.bestScores.chess || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        if (activeGame === 'pianoMaster') {
            return (
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
                    <PianoMaster 
                        onBack={() => setActiveGame(null)} 
                        onGameEnd={(score, xp, hit) => handleGameEnd('pianoMaster', score, xp, hit)} 
                        bestScore={profile.bestScores.pianoMaster || 0} 
                        toggleFullscreen={toggleFullscreen}
                        isFullscreen={visualFullscreen}
                    />
                </Suspense>
            );
        }

        // Increased difficulty: 10 milestones needed
        const progressPercent = (profile.dailyProgress / 10) * 100;
        const hasReachedLimit = profile.intisEarnedToday >= 1 || profile.dailyProgress >= 10;

        return (
            <div className="h-full flex flex-col overflow-y-auto custom-scrollbar">
                {/* Hero Section */}
                <div className="relative p-6 md:p-8 rounded-b-3xl overflow-hidden bg-gradient-to-br from-indigo-900/40 via-purple-900/20 to-neutral-950 border-b border-indigo-500/20 shadow-[0_10px_40px_-10px_rgba(99,102,241,0.2)] shrink-0">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-4 mb-2">
                                <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 flex items-center gap-3">
                                    <Icon name="rocket" className="w-8 h-8 text-indigo-400" />
                                    Goatify Chill
                                </h1>
                                <button 
                                    onClick={toggleFullscreen}
                                    className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-neutral-400 hover:text-white"
                                    title={visualFullscreen ? "Salir de pantalla completa" : "Pantalla completa / modo inmersivo"}
                                >
                                    <Icon name={visualFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-neutral-400 text-sm max-w-md">
                                Tu arcade premium. Relájate, juega, compite en el ranking global y gana recompensas diarias.
                            </p>
                        </div>

                        <div className="flex gap-4">
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center min-w-[100px]">
                                <span className="text-xs text-neutral-400 uppercase tracking-wider font-bold mb-1">Chill XP</span>
                                <span className="text-2xl font-black text-purple-400">{profile.xp}</span>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center min-w-[100px]">
                                <span className="text-xs text-neutral-400 uppercase tracking-wider font-bold mb-1">Constancia</span>
                                <span className="text-2xl font-black text-orange-400">{profile.streak} 🔥</span>
                            </div>
                        </div>
                    </div>

                    {/* Daily Progress Bar */}
                    <div className="mt-8 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 relative z-10">
                        <div className="flex justify-between items-end mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">Progreso Diario (Intis)</h3>
                                {hasReachedLimit ? (
                                    <p className="text-xs text-indigo-300 mt-1">¡Límite diario alcanzado! Sigue jugando por XP y ranking.</p>
                                ) : (
                                    <p className="text-xs text-neutral-400 mt-1">Completa hitos en los juegos para llenar la barra.</p>
                                )}
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-black text-white">{profile.intisEarnedToday}</span>
                                <span className="text-sm text-neutral-400"> / 1 Inti</span>
                            </div>
                        </div>
                        
                        <div className="h-3 md:h-4 bg-neutral-800 rounded-full overflow-hidden flex gap-1 p-0.5">
                            {[...Array(10)].map((_, step) => (
                                <div 
                                    key={step} 
                                    className={`h-full flex-1 rounded-full transition-all duration-500 ${step < profile.dailyProgress ? 'bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-white/5'}`}
                                ></div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Games Section */}
                    <div className="lg:col-span-2 flex flex-col">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6 shrink-0">
                            <Icon name="kanban" className="w-5 h-5 text-indigo-400" />
                            Juegos Disponibles
                        </h2>
                        
                        {/* Grid: 2 cols on mobile, 4 cols on desktop */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 pb-8">
                            {/* Snake Cabra Card */}
                            <div 
                                onClick={() => selectGame('neonSnake')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-emerald-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==')] opacity-50"></div>
                                    <Icon name="grid" className="w-10 h-10 md:w-12 md:h-12 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)] group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-white mb-1 flex items-center gap-2">
                                        <Icon name="grid" className="w-4 h-4 text-emerald-400" />
                                        Snake Cabra
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Come, crece y no choques.</p>
                                    <div className="flex justify-between items-center mt-auto">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Mejor</span>
                                        <span className="text-sm font-black text-emerald-400">{profile.bestScores.neonSnake}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Cabra Run Card */}
                            <div 
                                onClick={() => selectGame('dinoRun')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-pink-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(236,72,153,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-pink-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="activity" className="w-10 h-10 md:w-12 md:h-12 text-pink-400 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)] group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-white mb-1 flex items-center gap-2">
                                        <Icon name="activity" className="w-4 h-4 text-pink-400" />
                                        Cabra Run
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Esquiva a alta velocidad.</p>
                                    <div className="flex justify-between items-center mt-auto">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Mejor</span>
                                        <span className="text-sm font-black text-pink-400">{profile.bestScores.dinoRun}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Tetris Cabra Card */}
                            <div 
                                onClick={() => selectGame('neonTetris')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-cyan-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(6,182,212,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-cyan-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="layout" className="w-10 h-10 md:w-12 md:h-12 text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)] group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-white mb-1 flex items-center gap-2">
                                        <Icon name="layout" className="w-4 h-4 text-cyan-400" />
                                        Tetris Cabra
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Encaja las piezas y limpia líneas.</p>
                                    <div className="flex justify-between items-center mt-auto">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Mejor</span>
                                        <span className="text-sm font-black text-cyan-400">{profile.bestScores.neonTetris || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Cabra al Choque Card */}
                            <div 
                                onClick={() => selectGame('brickBreaker')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-orange-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(249,115,22,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-orange-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="layers" className="w-10 h-10 md:w-12 md:h-12 text-orange-400 drop-shadow-[0_0_15px_rgba(249,115,22,0.5)] group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-white mb-1 flex items-center gap-2">
                                        <Icon name="layers" className="w-4 h-4 text-orange-400" />
                                        Cabra al Choque
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Rompe bloques con tu cabeza.</p>
                                    <div className="flex justify-between items-center mt-auto">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Mejor</span>
                                        <span className="text-sm font-black text-orange-400">{profile.bestScores.brickBreaker || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Goat Kong Card */}
                            <div 
                                onClick={() => selectGame('goatKong')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-blue-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="mountain" className="w-10 h-10 md:w-12 md:h-12 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-white mb-1 flex items-center gap-2">
                                        <Icon name="mountain" className="w-4 h-4 text-blue-400" />
                                        Goat Kong
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Sube y esquiva barriles.</p>
                                    <div className="flex justify-between items-center mt-auto">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Mejor</span>
                                        <span className="text-sm font-black text-blue-400">{profile.bestScores.goatKong || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Flappy Goat Card */}
                            <div 
                                onClick={() => selectGame('flappyGoat')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-yellow-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(234,179,8,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-yellow-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="feather" className="w-10 h-10 md:w-12 md:h-12 text-yellow-400 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-white mb-1 flex items-center gap-2">
                                        <Icon name="feather" className="w-4 h-4 text-yellow-400" />
                                        Flappy Goat
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Vuela entre obstáculos.</p>
                                    <div className="flex justify-between items-center mt-auto">
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Mejor</span>
                                        <span className="text-sm font-black text-yellow-400">{profile.bestScores.flappyGoat || 0}</span>
                                    </div>
                                </div>
                            </div>
                                                {/* Evolución Goat (2048) Card */}
                            <div 
                                onClick={() => selectGame('2048')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-purple-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-purple-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="trending-up" className="w-10 h-10 md:w-12 md:h-12 text-purple-500 group-hover:text-purple-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-white mb-1 flex items-center gap-2">
                                        <Icon name="trending-up" className="w-4 h-4 text-purple-400" />
                                        Evolución Goat
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Fusiona cabras para evolucionar.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-purple-400">{profile.bestScores['2048'] || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Parejas Goat (Memory) Card */}
                            <div 
                                onClick={() => selectGame('memoryMatch')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-pink-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(236,72,153,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-pink-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="copy" className="w-10 h-10 md:w-12 md:h-12 text-pink-500 group-hover:text-pink-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="copy" className="w-4 h-4 text-pink-400" />
                                        Parejas Goat
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Encuentra los pares iguales.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Puntos</span>
                                        <span className="text-sm font-black text-pink-400">{profile.bestScores.memoryMatch || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Protege el Rebaño (Whack) Card */}
                            <div 
                                onClick={() => selectGame('whackAMole')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-red-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(239,68,68,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-red-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="shield" className="w-10 h-10 md:w-12 md:h-12 text-red-500 group-hover:text-red-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="shield" className="w-4 h-4 text-red-400" />
                                        Protege el Rebaño
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">¡Golpea a los lobos!</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-red-400">{profile.bestScores.whackAMole || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Cabra-Man (Pacman) Card */}
                            <div 
                                onClick={() => selectGame('pacman')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-yellow-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(234,179,8,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-yellow-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="circle-dot" className="w-10 h-10 md:w-12 md:h-12 text-yellow-500 group-hover:text-yellow-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="circle-dot" className="w-4 h-4 text-yellow-400" />
                                        Cabra-Man
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Come puntos y evita fantasmas.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Puntos</span>
                                        <span className="text-sm font-black text-yellow-400">{profile.bestScores.pacman || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Sudoku Card */}
                            <div 
                                onClick={() => selectGame('sudoku')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-indigo-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="hash" className="w-10 h-10 md:w-12 md:h-12 text-indigo-500 group-hover:text-indigo-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="hash" className="w-4 h-4 text-indigo-400" />
                                        Sudoku
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Resuelve el puzzle numérico.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Mejor</span>
                                        <span className="text-sm font-black text-indigo-400">{profile.bestScores.sudoku || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Tower Stack Card */}
                            <div 
                                onClick={() => selectGame('towerStack')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-cyan-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(6,182,212,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-cyan-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="layers" className="w-10 h-10 md:w-12 md:h-12 text-cyan-500 group-hover:text-cyan-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="layers" className="w-4 h-4 text-cyan-400" />
                                        Tower Stack
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Apila bloques al máximo.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-cyan-400">{profile.bestScores.towerStack || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Cabra Sniper Card */}
                            <div 
                                onClick={() => selectGame('goatSniper')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-red-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(239,68,68,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-red-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="target" className="w-10 h-10 md:w-12 md:h-12 text-red-500 group-hover:text-red-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="target" className="w-4 h-4 text-red-400" />
                                        Cabra Sniper
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Dispara a los objetivos.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-red-400">{profile.bestScores.goatSniper || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Super Goat Bros Card */}
                            <div 
                                onClick={() => selectGame('superGoatBros')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-blue-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="gamepad-2" className="w-10 h-10 md:w-12 md:h-12 text-blue-500 group-hover:text-blue-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="gamepad-2" className="w-4 h-4 text-blue-400" />
                                        Super Goat Bros
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Aventura de plataformas clásica.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-blue-400">{profile.bestScores.superGoatBros || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Goat Invaders Card */}
                            <div 
                                onClick={() => selectGame('goatInvaders')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-green-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(74,222,128,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-green-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="rocket" className="w-10 h-10 md:w-12 md:h-12 text-green-500 group-hover:text-green-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="rocket" className="w-4 h-4 text-green-400" />
                                        Goat Invaders
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Defiende el espacio exterior.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-green-400">{profile.bestScores.goatInvaders || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Goat Racer Card */}
                            <div 
                                onClick={() => selectGame('goatRacer')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-blue-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="car" className="w-10 h-10 md:w-12 md:h-12 text-blue-500 group-hover:text-blue-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="car" className="w-4 h-4 text-blue-400" />
                                        Goat Racer
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Carreras a toda velocidad.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-blue-400">{profile.bestScores.goatRacer || 0}</span>
                                    </div>
                                </div>
                            </div>


                            {/* Poker Card */}
                            <div 
                                onClick={() => selectGame('poker')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-red-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(239,68,68,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-red-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="club" className="w-10 h-10 md:w-12 md:h-12 text-red-500 group-hover:text-red-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="club" className="w-4 h-4 text-red-400" />
                                        Poker Goat
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Texas Hold'em contra la IA.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-red-400">{profile.bestScores.poker || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Blackjack Card */}
                            <div 
                                onClick={() => selectGame('blackjack')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-green-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(34,197,94,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-green-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="spade" className="w-10 h-10 md:w-12 md:h-12 text-green-500 group-hover:text-green-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="spade" className="w-4 h-4 text-green-400" />
                                        Blackjack 21
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Llega a 21 sin pasarte.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-green-400">{profile.bestScores.blackjack || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Solitaire Card */}
                            <div 
                                onClick={() => selectGame('solitaire')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-indigo-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="diamond" className="w-10 h-10 md:w-12 md:h-12 text-indigo-500 group-hover:text-indigo-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="diamond" className="w-4 h-4 text-indigo-400" />
                                        Solitario Goat
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">El clásico juego de cartas.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-indigo-400">{profile.bestScores.solitaire || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Word Search Card */}
                            <div 
                                onClick={() => selectGame('wordSearch')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-yellow-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(234,179,8,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-yellow-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="search" className="w-10 h-10 md:w-12 md:h-12 text-yellow-500 group-hover:text-yellow-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="search" className="w-4 h-4 text-yellow-400" />
                                        Sopa de Letras
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Encuentra las palabras ocultas.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-yellow-400">{profile.bestScores.wordSearch || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Crossword Card */}
                            <div 
                                onClick={() => selectGame('crossword')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-cyan-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(6,182,212,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-cyan-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="type" className="w-10 h-10 md:w-12 md:h-12 text-cyan-500 group-hover:text-cyan-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="type" className="w-4 h-4 text-cyan-400" />
                                        Crucigrama
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Completa el crucigrama diario.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-cyan-400">{profile.bestScores.crossword || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Ajedrez Maestro Card */}
                            <div 
                                onClick={() => selectGame('chess')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-indigo-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="grid" className="w-10 h-10 md:w-12 md:h-12 text-indigo-500 group-hover:text-indigo-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="grid" className="w-4 h-4 text-indigo-400" />
                                        Ajedrez Maestro
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Estrategia pura y táctica.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-indigo-400">{profile.bestScores.chess || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Piano Maestro Card */}
                            <div 
                                onClick={() => selectGame('pianoMaster')}
                                className="group relative bg-neutral-900 border border-neutral-800 hover:border-emerald-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)] hover:-translate-y-1 flex flex-col"
                            >
                                <div className="h-24 md:h-32 bg-gradient-to-br from-emerald-900/40 to-neutral-900 relative overflow-hidden flex items-center justify-center shrink-0">
                                    <Icon name="music" className="w-10 h-10 md:w-12 md:h-12 text-emerald-500 group-hover:text-emerald-400 transition-colors duration-500" />
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="text-base md:text-lg font-bold text-neutral-300 mb-1 flex items-center gap-2">
                                        <Icon name="music" className="w-4 h-4 text-emerald-400" />
                                        Piano Maestro
                                    </h3>
                                    <p className="text-xs text-neutral-400 mb-3 flex-1 line-clamp-2">Aprende a tocar como un pro.</p>
                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Récord</span>
                                        <span className="text-sm font-black text-emerald-400">{profile.bestScores.pianoMaster || 0}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Competitive Arena */}
                    <div className="space-y-4">
                        <div className="bg-gradient-to-br from-indigo-600/15 via-purple-600/10 to-neutral-900 border border-indigo-400/20 rounded-3xl p-5 shadow-[0_0_35px_rgba(99,102,241,0.12)]">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                                        <Icon name="star" className="w-5 h-5 text-yellow-300" />
                                        Arena de Torneos
                                    </h2>
                                    <p className="text-[11px] text-neutral-400 mt-1">Compite por XP, ranking semanal y retos rápidos.</p>
                                </div>
                                <span className="px-2 py-1 rounded-full bg-yellow-400/10 text-yellow-200 border border-yellow-300/20 text-[9px] font-black uppercase tracking-widest">Beta</span>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                <button onClick={() => { setLeaderboardGame('goatRacer'); selectGame('goatRacer'); }} className="group text-left p-4 rounded-2xl bg-black/25 border border-white/10 hover:border-blue-400/40 transition-all">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black text-white">Copa Goat Racer</div>
                                            <div className="text-[11px] text-neutral-400 mt-1">Modo recomendado: móvil con inclinación o botones.</div>
                                        </div>
                                        <Icon name="car" className="w-6 h-6 text-blue-300 group-hover:scale-110 transition-transform" />
                                    </div>
                                </button>
                                <button onClick={() => setLeaderboardGame('neonSnake')} className="group text-left p-4 rounded-2xl bg-black/25 border border-white/10 hover:border-emerald-400/40 transition-all">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black text-white">Reto Diario Chill</div>
                                            <div className="text-[11px] text-neutral-400 mt-1">Mira el top global y sube tu récord diario.</div>
                                        </div>
                                        <Icon name="star" className="w-6 h-6 text-emerald-300 group-hover:scale-110 transition-transform" />
                                    </div>
                                </button>
                            </div>
                        </div>

                    {/* Leaderboard Section */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col min-h-[300px]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Icon name="star" className="w-5 h-5 text-yellow-400" />
                                Top Global
                            </h2>
                            <select 
                                value={leaderboardGame} 
                                onChange={(e) => setLeaderboardGame(e.target.value as any)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-xs rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
                            >
                                <option value="neonSnake">Snake Cabra</option>
                                <option value="dinoRun">Cabra Run</option>
                                <option value="neonTetris">Tetris Cabra</option>
                                <option value="brickBreaker">Cabra al Choque</option>
                                <option value="goatKong">Goat Kong</option>
                                <option value="flappyGoat">Flappy Goat</option>
                                <option value="2048">Evolución Goat</option>
                                <option value="memoryMatch">Parejas Goat</option>
                                <option value="whackAMole">Protege el Rebaño</option>
                                <option value="pacman">Cabra-Man</option>
                                <option value="sudoku">Sudoku</option>
                                <option value="towerStack">Tower Stack</option>
                                <option value="goatSniper">Cabra Sniper</option>
                                <option value="superGoatBros">Super Goat Bros</option>
                                <option value="goatInvaders">Goat Invaders</option>
                                <option value="goatRacer">Goat Racer</option>
                                <option value="poker">Poker Goat</option>
                                <option value="blackjack">Blackjack 21</option>
                                <option value="solitaire">Solitario Goat</option>
                                <option value="wordSearch">Sopa de Letras</option>
                                <option value="crossword">Crucigrama</option>
                                <option value="chess">Ajedrez Maestro</option>
                                <option value="pianoMaster">Piano Maestro</option>
                            </select>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                            {leaderboard.length === 0 ? (
                                <p className="text-sm text-neutral-500 text-center py-8">Aún no hay puntuaciones. ¡Sé el primero!</p>
                            ) : (
                                leaderboard.map((entry, idx) => (
                                    <div key={entry.uid} className={`flex items-center justify-between p-3 rounded-xl ${entry.uid === currentUser?.uid ? 'bg-indigo-500/10 border border-indigo-500/30' : 'bg-neutral-800/50'}`}>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm font-black w-5 text-center ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-600' : 'text-neutral-500'}`}>
                                                #{idx + 1}
                                            </span>
                                            <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center overflow-hidden">
                                                {entry.avatarUrl ? (
                                                    <img src={entry.avatarUrl} alt={entry.displayName || 'Jugador'} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-xs font-black text-neutral-300">{(entry.displayName || 'G')[0]?.toUpperCase()}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-bold text-white truncate max-w-[120px]">
                                                    {entry.uid === currentUser?.uid ? 'Tú' : (entry.displayName || `Jugador ${entry.uid.substring(0,4)}`)}
                                                </span>
                                                <span className="text-[10px] text-neutral-500 uppercase">{entry.xp} XP</span>
                                            </div>
                                        </div>
                                        <span className="font-black text-indigo-400">{entry.score}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className={`${visualFullscreen ? 'fixed inset-0 z-[99999] h-[100dvh] w-screen bg-neutral-950' : 'h-full bg-neutral-950'} goatify-chill-immersive text-white relative overflow-hidden`}
            style={visualFullscreen || activeGame ? { paddingTop: visualFullscreen ? 'env(safe-area-inset-top)' : undefined, paddingBottom: visualFullscreen ? 'env(safe-area-inset-bottom)' : undefined, touchAction: activeGame ? 'none' : 'manipulation', overscrollBehavior: 'contain' } : undefined}
        >
            {/* Particle Background Effect */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-30">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.1),transparent_50%)]"></div>
                {[...Array(20)].map((_, i) => (
                    <div 
                        key={i}
                        className="absolute bg-white rounded-full blur-[1px] animate-pulse"
                        style={{
                            width: Math.random() * 3 + 'px',
                            height: Math.random() * 3 + 'px',
                            top: Math.random() * 100 + '%',
                            left: Math.random() * 100 + '%',
                            animationDelay: Math.random() * 5 + 's',
                            animationDuration: Math.random() * 3 + 2 + 's'
                        }}
                    ></div>
                ))}
            </div>
            {visualFullscreen && (
                <div className="pointer-events-none absolute left-1/2 top-2 z-[100000] -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/70 backdrop-blur-md md:hidden">
                    Modo inmersivo Chill
                </div>
            )}
            <div className="relative z-10 h-full">
                {renderContent()}
            </div>
        </div>
    );
};

export default GoatifyChill;
