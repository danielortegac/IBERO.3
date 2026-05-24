import React, { useEffect, useState, useCallback, useRef } from 'react';
import Icon from '../Icon';
import MobileGameControls from './MobileGameControls';

interface Goat2048Props {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const Goat2048: React.FC<Goat2048Props> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const [grid, setGrid] = useState<number[][]>(Array(4).fill(0).map(() => Array(4).fill(0)));
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [highScore, setHighScore] = useState(bestScore);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);

    const initializeGrid = useCallback(() => {
        let newGrid = Array(4).fill(0).map(() => Array(4).fill(0));
        newGrid = addRandomTile(newGrid);
        newGrid = addRandomTile(newGrid);
        setGrid(newGrid);
        setScore(0);
        setGameOver(false);
    }, []);

    const addRandomTile = (currentGrid: number[][]) => {
        const emptyTiles = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (currentGrid[r][c] === 0) emptyTiles.push({ r, c });
            }
        }
        if (emptyTiles.length === 0) return currentGrid;
        const { r, c } = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
        const newGrid = currentGrid.map(row => [...row]);
        newGrid[r][c] = Math.random() < 0.9 ? 2 : 4;
        return newGrid;
    };

    const move = (direction: 'up' | 'down' | 'left' | 'right') => {
        if (gameOver) return;

        let newGrid = grid.map(row => [...row]);
        let moved = false;
        let newScore = score;

        const rotate = (g: number[][]) => {
            const rotated = Array(4).fill(0).map(() => Array(4).fill(0));
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    rotated[c][3 - r] = g[r][c];
                }
            }
            return rotated;
        };

        // Normalize to move left
        let rotations = 0;
        if (direction === 'up') rotations = 3;
        else if (direction === 'right') rotations = 2;
        else if (direction === 'down') rotations = 1;

        for (let i = 0; i < rotations; i++) newGrid = rotate(newGrid);

        // Move left logic
        for (let r = 0; r < 4; r++) {
            let row = newGrid[r].filter(val => val !== 0);
            for (let c = 0; c < row.length - 1; c++) {
                if (row[c] === row[c + 1]) {
                    row[c] *= 2;
                    newScore += row[c];
                    row.splice(c + 1, 1);
                    moved = true;
                }
            }
            while (row.length < 4) row.push(0);
            if (JSON.stringify(newGrid[r]) !== JSON.stringify(row)) moved = true;
            newGrid[r] = row;
        }

        // Rotate back
        for (let i = 0; i < (4 - rotations) % 4; i++) newGrid = rotate(newGrid);

        if (moved) {
            const finalGrid = addRandomTile(newGrid);
            setGrid(finalGrid);
            setScore(newScore);
            checkGameOver(finalGrid);
        }
    };

    const checkGameOver = (currentGrid: number[][]) => {
        // Check for empty tiles
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (currentGrid[r][c] === 0) return;
            }
        }
        // Check for adjacent merges
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (r < 3 && currentGrid[r][c] === currentGrid[r + 1][c]) return;
                if (c < 3 && currentGrid[r][c] === currentGrid[r][c + 1]) return;
            }
        }
        setGameOver(true);
        onGameEnd(score, Math.floor(score / 100), score >= 2048);
    };

    useEffect(() => {
        initializeGrid();
    }, [initializeGrid]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') move('up');
            else if (e.key === 'ArrowDown') move('down');
            else if (e.key === 'ArrowLeft') move('left');
            else if (e.key === 'ArrowRight') move('right');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [grid, gameOver]);


    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;
        const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
        const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
        touchStartRef.current = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
        else move(dy > 0 ? 'down' : 'up');
    };

    const getTileLabel = (value: number) => {
        const labels: { [key: number]: string } = {
            2: 'Bebé',
            4: 'Joven',
            8: 'Adulta',
            16: 'Saltarina',
            32: 'Montesa',
            64: 'Guerrera',
            128: 'Mística',
            256: 'Legendaria',
            512: 'Divina',
            1024: 'Cósmica',
            2048: 'DIOS CABRA',
        };
        return labels[value] || '';
    };

    const getTileColor = (value: number) => {
        const colors: { [key: number]: string } = {
            2: 'bg-neutral-800 text-neutral-300',
            4: 'bg-neutral-700 text-neutral-200',
            8: 'bg-indigo-900/50 text-indigo-200 border-indigo-500/30',
            16: 'bg-indigo-800/60 text-indigo-100 border-indigo-500/50',
            32: 'bg-indigo-700/70 text-white border-indigo-400',
            64: 'bg-indigo-600 text-white border-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.3)]',
            128: 'bg-purple-900/50 text-purple-100 border-purple-500/30',
            256: 'bg-purple-800/60 text-purple-50 text-lg border-purple-500/50',
            512: 'bg-purple-700/70 text-white text-lg border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]',
            1024: 'bg-purple-600 text-white text-xl border-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.5)]',
            2048: 'bg-pink-600 text-white text-xl border-pink-300 shadow-[0_0_25px_rgba(236,72,153,0.6)] animate-pulse',
        };
        return colors[value] || 'bg-pink-900 text-white';
    };

    return (
        <div className="h-full flex flex-col items-center justify-center bg-neutral-950 p-3 sm:p-4 select-none overflow-y-auto" style={{ touchAction: 'none' }}>
            {/* Header */}
            <div className="w-full max-w-md flex justify-between items-center mb-6">
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
                        >
                            <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
                        </button>
                    )}
                </div>
                
                <div className="flex gap-4 text-center">
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Puntos</div>
                        <div className="text-lg font-black text-purple-400">{score}</div>
                    </div>
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Récord</div>
                        <div className="text-lg font-black text-yellow-400">{highScore}</div>
                    </div>
                </div>
            </div>

            {/* Game Board */}
            <div onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="relative bg-neutral-900 p-3 rounded-2xl border border-neutral-800 shadow-[0_0_40px_rgba(168,85,247,0.1)] w-full max-w-[360px] aspect-square grid grid-cols-4 gap-3 touch-none">
                {grid.map((row, r) => (
                    row.map((val, c) => (
                        <div 
                            key={`${r}-${c}`}
                            className={`flex flex-col items-center justify-center rounded-xl font-black transition-all duration-200 border ${val === 0 ? 'bg-neutral-950/50 border-neutral-800/50' : getTileColor(val)}`}
                        >
                            {val !== 0 && (
                                <>
                                    <div className="text-2xl">{val}</div>
                                    <div className="text-[8px] uppercase tracking-tighter opacity-70">{getTileLabel(val)}</div>
                                </>
                            )}
                        </div>
                    ))
                ))}

                {gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-2xl backdrop-blur-sm z-20">
                        <h2 className="text-3xl font-black text-purple-500 mb-2 tracking-wider">¡FIN DEL JUEGO!</h2>
                        <div className="text-4xl font-black text-white mb-6">{score}</div>
                        <button 
                            onClick={initializeGrid}
                            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-full transition-all hover:scale-105"
                        >
                            REINTENTAR
                        </button>
                    </div>
                )}
            </div>

            {/* Controls Info */}
            <div className="mt-8 text-neutral-500 text-sm flex flex-col items-center gap-2">
                <p className="text-xs text-neutral-400 italic font-bold uppercase tracking-widest">¡EVOLUCIONA TU CABRA!</p>
                <p className="text-[10px] text-neutral-500">Combina números iguales para llegar a 2048.</p>
                <div className="flex items-center gap-1">
                    <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-neutral-400 text-[10px]">↑↓←→</kbd>
                    <span>Mover</span>
                </div>
                <span className="md:hidden text-purple-300">En celular: desliza o usa botones</span>
            </div>
            <MobileGameControls
                hint="Control táctil 2048"
                up={{ label: '↑', ariaLabel: 'Mover arriba', onPress: () => move('up') }}
                down={{ label: '↓', ariaLabel: 'Mover abajo', onPress: () => move('down') }}
                left={{ label: '←', ariaLabel: 'Mover izquierda', onPress: () => move('left') }}
                right={{ label: '→', ariaLabel: 'Mover derecha', onPress: () => move('right') }}
            />
        </div>
    );
};

export default Goat2048;
