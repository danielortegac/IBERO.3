import React, { useEffect, useState, useCallback } from 'react';
import Icon from '../Icon';

interface SudokuProps {
    onBack: () => void;
    onGameEnd: (score: number, xpGained: number, hitMilestone: boolean) => void;
    bestScore: number;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
}

const Sudoku: React.FC<SudokuProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
    const [grid, setGrid] = useState<(number | null)[][]>(Array(9).fill(0).map(() => Array(9).fill(null)));
    const [initialGrid, setInitialGrid] = useState<boolean[][]>(Array(9).fill(0).map(() => Array(9).fill(false)));
    const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
    const [gameOver, setGameOver] = useState(false);
    const [startTime, setStartTime] = useState<number>(0);
    const [elapsedTime, setElapsedTime] = useState(0);

    const generateSudoku = useCallback(() => {
        // Very simple Sudoku generator (not a real one, just for demo)
        const newGrid = Array(9).fill(0).map(() => Array(9).fill(null));
        const fixed = Array(9).fill(0).map(() => Array(9).fill(false));
        
        // Fill some numbers
        for (let i = 0; i < 25; i++) {
            const r = Math.floor(Math.random() * 9);
            const c = Math.floor(Math.random() * 9);
            const v = Math.floor(Math.random() * 9) + 1;
            if (!newGrid[r][c]) {
                newGrid[r][c] = v;
                fixed[r][c] = true;
            }
        }
        
        setGrid(newGrid);
        setInitialGrid(fixed);
        setStartTime(Date.now());
        setElapsedTime(0);
        setGameOver(false);
    }, []);

    useEffect(() => {
        generateSudoku();
    }, [generateSudoku]);

    useEffect(() => {
        if (!gameOver && startTime > 0) {
            const timer = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameOver, startTime]);

    const handleCellClick = (r: number, c: number) => {
        if (initialGrid[r][c] || gameOver) return;
        setSelectedCell({ r, c });
    };

    const handleNumberInput = (num: number) => {
        if (!selectedCell || gameOver) return;
        const { r, c } = selectedCell;
        const newGrid = grid.map(row => [...row]);
        newGrid[r][c] = num;
        setGrid(newGrid);
        
        // Check if full
        if (newGrid.every(row => row.every(cell => cell !== null))) {
            setGameOver(true);
            const score = Math.max(0, 5000 - elapsedTime * 2);
            onGameEnd(score, Math.floor(score / 100), true);
        }
    };

    return (
        <div className="h-full flex flex-col items-center justify-center bg-neutral-950 p-4 select-none">
            {/* Header */}
            <div className="w-full max-w-md flex justify-between items-center mb-6">
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
                <div className="flex gap-4">
                    <div className="bg-neutral-900 px-4 py-1 rounded-lg border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase font-bold">Tiempo</div>
                        <div className="text-lg font-black text-indigo-400">{Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}</div>
                    </div>
                </div>
            </div>

            {/* Sudoku Grid */}
            <div className="bg-neutral-900 p-1 rounded-xl border-2 border-neutral-800 shadow-[0_0_40px_rgba(79,70,229,0.1)] w-full max-w-[380px] aspect-square grid grid-cols-9">
                {grid.map((row, r) => (
                    row.map((val, c) => (
                        <div 
                            key={`${r}-${c}`}
                            onClick={() => handleCellClick(r, c)}
                            className={`
                                flex items-center justify-center text-lg font-bold border border-neutral-800/50 cursor-pointer transition-all
                                ${initialGrid[r][c] ? 'bg-neutral-800/30 text-neutral-500' : 'bg-transparent text-white'}
                                ${selectedCell?.r === r && selectedCell?.c === c ? 'bg-indigo-500/20 ring-2 ring-indigo-500 z-10' : ''}
                                ${(r + 1) % 3 === 0 && r < 8 ? 'border-b-2 border-b-neutral-700' : ''}
                                ${(c + 1) % 3 === 0 && c < 8 ? 'border-r-2 border-r-neutral-700' : ''}
                            `}
                        >
                            {val}
                        </div>
                    ))
                ))}
            </div>

            {/* Number Pad */}
            <div className="mt-8 grid grid-cols-5 gap-2 w-full max-w-[380px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button 
                        key={num}
                        onClick={() => handleNumberInput(num)}
                        className="py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-black rounded-lg transition-all active:scale-95"
                    >
                        {num}
                    </button>
                ))}
                <button 
                    onClick={() => { if (selectedCell) { const newGrid = grid.map(row => [...row]); newGrid[selectedCell.r][selectedCell.c] = null; setGrid(newGrid); } }}
                    className="py-3 bg-neutral-900 text-neutral-500 font-black rounded-lg border border-neutral-800"
                >
                    <Icon name="eraser" className="w-5 h-5 mx-auto" />
                </button>
            </div>

            {gameOver && (
                <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-50">
                    <h2 className="text-3xl font-black text-indigo-500 mb-2 tracking-wider">¡SUDOKU RESUELTO!</h2>
                    <div className="text-xl font-black text-white mb-6">TIEMPO: {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}</div>
                    <button onClick={generateSudoku} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-full transition-all">NUEVO JUEGO</button>
                </div>
            )}
        </div>
    );
};

export default Sudoku;
