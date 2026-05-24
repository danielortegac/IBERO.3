import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../Icon';

interface CrosswordGameProps {
  onBack: () => void;
  onGameEnd: (score: number, xp: number, hit: boolean) => void;
  bestScore: number;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
}

// Professional hardcoded crossword levels
const LEVELS = [
  {
    theme: 'Tecnología & Futuro',
    gridSize: 13,
    words: [
      { id: 1, word: 'SISTEMA', desc: 'Conjunto de reglas, principios o medidas que tienen relación entre sí.', row: 1, col: 1, dir: 'across' },
      { id: 2, word: 'INTELIGENCIA', desc: 'Capacidad de la mente para aprender y razonar (A menudo artificial).', row: 1, col: 2, dir: 'down' },
      { id: 3, word: 'TWITTER', desc: 'Red social del pajarito azul, ahora conocida como X.', row: 1, col: 4, dir: 'down' },
      { id: 4, word: 'MONITOR', desc: 'Pantalla que muestra la información de un ordenador.', row: 3, col: 6, dir: 'down' },
      { id: 5, word: 'DATOS', desc: 'Información concreta sobre hechos que permite estudiarlos o analizarlos.', row: 4, col: 8, dir: 'down' },
      { id: 6, word: 'ALGORITMO', desc: 'Conjunto ordenado de operaciones sistemáticas para hallar la solución a un problema.', row: 7, col: 0, dir: 'across' },
      { id: 7, word: 'AVATAR', desc: 'Identidad virtual que escoge un usuario para que lo represente.', row: 7, col: 0, dir: 'down' },
      { id: 8, word: 'JAVA', desc: 'Lenguaje de programación orientado a objetos, cuyo logo es una taza de café.', row: 9, col: 9, dir: 'down' },
      { id: 9, word: 'TECNOLOGIA', desc: 'Conjunto de instrumentos, recursos técnicos o procedimientos empleados en un sector.', row: 10, col: 0, dir: 'across' },
      { id: 10, word: 'REAL', desc: 'Que tiene existencia objetiva. Lo opuesto a virtual.', row: 12, col: 0, dir: 'across' },
    ]
  },
  {
    theme: 'Cultura Geek & Videojuegos',
    gridSize: 11,
    words: [
      { id: 1, word: 'GBA', desc: 'Consola portátil clásica de Nintendo de 32 bits (Siglas).', row: 0, col: 1, dir: 'down' },
      { id: 2, word: 'MAC', desc: 'Ordenador de Apple, popular entre diseñadores y creativos.', row: 0, col: 8, dir: 'across' },
      { id: 3, word: 'MARIO', desc: 'El fontanero más famoso de la historia de los videojuegos.', row: 0, col: 8, dir: 'down' },
      { id: 4, word: 'ARCADE', desc: 'Máquina recreativa de videojuegos clásica de salón.', row: 2, col: 1, dir: 'across' },
      { id: 5, word: 'CONSOLA', desc: 'Sistema electrónico diseñado específicamente para jugar videojuegos.', row: 2, col: 3, dir: 'down' },
      { id: 6, word: 'TETRIS', desc: 'Juego clásico soviético de encajar bloques geométricos que caen.', row: 3, col: 5, dir: 'down' },
      { id: 7, word: 'NINTENDO', desc: 'Compañía japonesa creadora de franquicias como Zelda y Metroid.', row: 4, col: 1, dir: 'across' },
      { id: 8, word: 'BOARD', desc: 'Placa base en inglés, o tablero de juego.', row: 6, col: 2, dir: 'across' },
      { id: 9, word: 'PAUSA', desc: 'Botón o acción para detener temporalmente el juego.', row: 8, col: 2, dir: 'across' },
    ]
  }
];

interface Cell {
  row: number;
  col: number;
  letter: string;
  number?: number;
  isBlack: boolean;
  value: string;
  words: { id: number, dir: 'across' | 'down' }[];
}

const CrosswordGame: React.FC<CrosswordGameProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [selectedCell, setSelectedCell] = useState<{ r: number, c: number } | null>(null);
  const [direction, setDirection] = useState<'across' | 'down'>('across');
  const [score, setScore] = useState(0);
  const [activeDesc, setActiveDesc] = useState<{ word: string, desc: string } | null>(null);
  
  const level = LEVELS[currentLevelIdx];

  useEffect(() => {
    const newGrid: Cell[][] = Array(level.gridSize).fill(null).map((_, r) => 
      Array(level.gridSize).fill(null).map((_, c) => ({
        row: r, col: c, letter: '', isBlack: true, value: '', words: []
      }))
    );

    level.words.forEach(w => {
      for (let i = 0; i < w.word.length; i++) {
        const r = w.dir === 'across' ? w.row : w.row + i;
        const c = w.dir === 'across' ? w.col + i : w.col;
        
        if (r < level.gridSize && c < level.gridSize) {
          newGrid[r][c].isBlack = false;
          newGrid[r][c].letter = w.word[i];
          newGrid[r][c].words.push({ id: w.id, dir: w.dir as 'across' | 'down' });
          if (i === 0) {
            newGrid[r][c].number = w.id;
          }
        }
      }
    });

    setGrid(newGrid);
    setSelectedCell(null);
    setScore(0);
  }, [currentLevelIdx, level]);

  const handleCellClick = (r: number, c: number) => {
    if (grid[r][c].isBlack) return;

    if (selectedCell?.r === r && selectedCell?.c === c) {
      setDirection(prev => prev === 'across' ? 'down' : 'across');
    } else {
      setSelectedCell({ r, c });
      // Auto-set direction based on available words in cell
      const cellWords = grid[r][c].words;
      if (cellWords.length === 1) {
        setDirection(cellWords[0].dir);
      } else if (cellWords.length > 1 && !cellWords.some(w => w.dir === direction)) {
        setDirection(cellWords[0].dir);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedCell) return;

    const { r, c } = selectedCell;
    const cell = grid[r][c];

    if (e.key === 'Backspace') {
      const newGrid = [...grid];
      newGrid[r][c].value = '';
      setGrid(newGrid);
      
      // Move back
      let nr = r, nc = c;
      if (direction === 'across') nc--;
      else nr--;
      
      if (nr >= 0 && nc >= 0 && !grid[nr][nc].isBlack) {
        setSelectedCell({ r: nr, c: nc });
      }
    } else if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
      const newGrid = [...grid];
      newGrid[r][c].value = e.key.toUpperCase();
      setGrid(newGrid);
      
      // Check if word is complete and correct
      checkWinCondition(newGrid);

      // Move forward
      let nr = r, nc = c;
      if (direction === 'across') nc++;
      else nr++;
      
      if (nr < level.gridSize && nc < level.gridSize && !grid[nr][nc].isBlack) {
        setSelectedCell({ r: nr, c: nc });
      }
    } else if (e.key === 'ArrowRight') {
      if (c + 1 < level.gridSize && !grid[r][c + 1].isBlack) setSelectedCell({ r, c: c + 1 });
      setDirection('across');
    } else if (e.key === 'ArrowLeft') {
      if (c - 1 >= 0 && !grid[r][c - 1].isBlack) setSelectedCell({ r, c: c - 1 });
      setDirection('across');
    } else if (e.key === 'ArrowDown') {
      if (r + 1 < level.gridSize && !grid[r + 1][c].isBlack) setSelectedCell({ r: r + 1, c });
      setDirection('down');
    } else if (e.key === 'ArrowUp') {
      if (r - 1 >= 0 && !grid[r - 1][c].isBlack) setSelectedCell({ r: r - 1, c });
      setDirection('down');
    }
  };

  const checkWinCondition = (currentGrid: Cell[][]) => {
    let allCorrect = true;
    let currentScore = 0;

    level.words.forEach(w => {
      let wordCorrect = true;
      for (let i = 0; i < w.word.length; i++) {
        const r = w.dir === 'across' ? w.row : w.row + i;
        const c = w.dir === 'across' ? w.col + i : w.col;
        if (currentGrid[r][c].value !== w.word[i]) {
          wordCorrect = false;
          allCorrect = false;
        }
      }
      if (wordCorrect) currentScore += w.word.length * 10;
    });

    setScore(currentScore);

    if (allCorrect) {
      setTimeout(() => {
        onGameEnd(currentScore + 500, 100, true);
        setCurrentLevelIdx(prev => (prev + 1) % LEVELS.length);
      }, 1000);
    }
  };

  const isCellHighlighted = (r: number, c: number) => {
    if (!selectedCell || grid[r][c].isBlack) return false;
    
    // Find the active word
    const activeCell = grid[selectedCell.r][selectedCell.c];
    const activeWord = activeCell.words.find(w => w.dir === direction) || activeCell.words[0];
    
    if (!activeWord) return false;

    return grid[r][c].words.some(w => w.id === activeWord.id && w.dir === activeWord.dir);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] p-4 bg-neutral-950 rounded-3xl border border-white/5 relative overflow-hidden" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-brand-primary/5 blur-[120px] pointer-events-none" />

      {/* Game Header Controls */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
        <button 
          onClick={onBack}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
        >
          <Icon name="arrow-left" className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-black uppercase tracking-widest">
            Best: {bestScore}
          </div>
          <button 
            onClick={toggleFullscreen}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
          >
            <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8 mt-12 z-10 items-center lg:items-start justify-center">
        
        {/* Grid */}
        <div className="bg-neutral-900/50 p-4 rounded-2xl border border-white/10 backdrop-blur-md shrink-0">
          <div className="grid gap-[1px] bg-neutral-800 border border-neutral-700 p-[1px]" style={{ gridTemplateColumns: `repeat(${level.gridSize}, minmax(0, 1fr))` }}>
            {grid.map((row, r) => (
              row.map((cell, c) => (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleCellClick(r, c)}
                  className={`relative w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-sm md:text-base font-bold transition-colors duration-200
                    ${cell.isBlack ? 'bg-neutral-950' : 
                      selectedCell?.r === r && selectedCell?.c === c ? 'bg-brand-primary text-neutral-950' :
                      isCellHighlighted(r, c) ? 'bg-brand-primary/30 text-white' :
                      'bg-white text-neutral-900 cursor-pointer hover:bg-neutral-200'}`}
                >
                  {!cell.isBlack && cell.number && (
                    <span className={`absolute top-0.5 left-0.5 text-[8px] font-normal ${selectedCell?.r === r && selectedCell?.c === c ? 'text-neutral-900' : 'text-neutral-500'}`}>
                      {cell.number}
                    </span>
                  )}
                  {!cell.isBlack && cell.value}
                </div>
              ))
            ))}
          </div>
        </div>

        {/* Clues */}
        <div className="flex flex-col w-full max-w-md gap-4">
          <div className="bg-neutral-900/50 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">{level.theme}</h2>
              <span className="text-brand-primary font-mono text-xl">{score}</span>
            </div>
            
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-2">Horizontales</h3>
                <div className="flex flex-col gap-2">
                  {level.words.filter(w => w.dir === 'across').map(w => (
                    <div key={w.id} className="flex items-start gap-2 text-sm">
                      <span className="font-bold text-brand-primary">{w.id}.</span>
                      <span className="text-neutral-300 flex-1">{w.desc}</span>
                      <button 
                        onClick={() => setActiveDesc({ word: w.word, desc: w.desc })}
                        className="p-1 rounded-full bg-white/5 hover:bg-brand-primary/20 hover:text-brand-primary text-neutral-500 transition-colors shrink-0"
                      >
                        <Icon name="help" className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-2">Verticales</h3>
                <div className="flex flex-col gap-2">
                  {level.words.filter(w => w.dir === 'down').map(w => (
                    <div key={w.id} className="flex items-start gap-2 text-sm">
                      <span className="font-bold text-brand-primary">{w.id}.</span>
                      <span className="text-neutral-300 flex-1">{w.desc}</span>
                      <button 
                        onClick={() => setActiveDesc({ word: w.word, desc: w.desc })}
                        className="p-1 rounded-full bg-white/5 hover:bg-brand-primary/20 hover:text-brand-primary text-neutral-500 transition-colors shrink-0"
                      >
                        <Icon name="help" className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Definition Modal */}
      <AnimatePresence>
        {activeDesc && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setActiveDesc(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-neutral-900 border border-white/10 p-6 rounded-2xl max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-black text-brand-primary">{activeDesc.word}</h3>
                <button onClick={() => setActiveDesc(null)} className="text-neutral-500 hover:text-white">
                  <Icon name="x" className="w-5 h-5" />
                </button>
              </div>
              <p className="text-neutral-300 leading-relaxed">
                {activeDesc.desc}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CrosswordGame;
