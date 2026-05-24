import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../Icon';

interface WordSearchGameProps {
  onBack: () => void;
  onGameEnd: (score: number, xp: number, hit: boolean) => void;
  bestScore: number;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
}

const THEMES = [
  {
    name: 'Tecnología & Programación',
    words: [
      { word: 'ALGORITMO', desc: 'Conjunto de instrucciones para resolver un problema.' },
      { word: 'SOFTWARE', desc: 'Programas y rutinas de una computadora.' },
      { word: 'HARDWARE', desc: 'Componentes físicos de un sistema informático.' },
      { word: 'FRONTEND', desc: 'Parte de la aplicación que interactúa con el usuario.' },
      { word: 'BACKEND', desc: 'Lógica del servidor y bases de datos.' },
      { word: 'DATABASE', desc: 'Almacenamiento estructurado de información.' },
      { word: 'PYTHON', desc: 'Lenguaje de programación muy popular en IA.' },
      { word: 'JAVASCRIPT', desc: 'Lenguaje principal de la web interactiva.' },
      { word: 'REACT', desc: 'Librería para construir interfaces de usuario.' },
      { word: 'SERVIDOR', desc: 'Computadora que provee datos a otras máquinas.' },
      { word: 'NUBE', desc: 'Servicios de computación a través de internet.' },
      { word: 'CIBERSEGURIDAD', desc: 'Protección de sistemas y redes informáticas.' },
    ]
  },
  {
    name: 'Universo & Astronomía',
    words: [
      { word: 'GALAXIA', desc: 'Conjunto enorme de estrellas, polvo y gas.' },
      { word: 'AGUJERO', desc: 'Región del espacio con gravedad extrema (Agujero negro).' },
      { word: 'ESTRELLA', desc: 'Esfera luminosa de plasma que mantiene su forma por la gravedad.' },
      { word: 'PLANETA', desc: 'Cuerpo celeste que orbita una estrella.' },
      { word: 'METEORITO', desc: 'Fragmento de un cuerpo celeste que cae sobre la Tierra.' },
      { word: 'ORBITA', desc: 'Trayectoria curva de un objeto alrededor de otro.' },
      { word: 'GRAVEDAD', desc: 'Fuerza que atrae los cuerpos hacia el centro de la Tierra.' },
      { word: 'TELESCOPIO', desc: 'Instrumento óptico para observar objetos lejanos.' },
      { word: 'ASTRONAUTA', desc: 'Persona que viaja al espacio exterior.' },
      { word: 'NEBULOSA', desc: 'Nube gigante de polvo y gas en el espacio.' },
      { word: 'COMETA', desc: 'Cuerpo celeste de hielo y polvo que deja una cola luminosa.' },
      { word: 'SATELITE', desc: 'Objeto que orbita alrededor de un planeta.' },
    ]
  }
];

const GRID_SIZE = 15;

type Direction = [number, number];
const DIRECTIONS: Direction[] = [
  [0, 1], [1, 0], [1, 1], [-1, 1],
  [0, -1], [-1, 0], [-1, -1], [1, -1]
];

const WordSearchGame: React.FC<WordSearchGameProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
  const [grid, setGrid] = useState<string[][]>([]);
  const [wordsToFind, setWordsToFind] = useState<{ word: string, desc: string, found: boolean }[]>([]);
  const [selectedCells, setSelectedCells] = useState<{ r: number, c: number }[]>([]);
  const [foundCells, setFoundCells] = useState<{ r: number, c: number }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [score, setScore] = useState(0);
  const [activeDesc, setActiveDesc] = useState<{ word: string, desc: string } | null>(null);
  const [currentTheme, setCurrentTheme] = useState(0);

  const generateGrid = useCallback((themeIndex: number) => {
    const theme = THEMES[themeIndex];
    const newGrid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(''));
    const words = theme.words.map(w => ({ ...w, word: w.word.toUpperCase(), found: false }));
    
    // Place words
    words.forEach(wordObj => {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 1000) {
        const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        const startR = Math.floor(Math.random() * GRID_SIZE);
        const startC = Math.floor(Math.random() * GRID_SIZE);
        
        let canPlace = true;
        for (let i = 0; i < wordObj.word.length; i++) {
          const r = startR + i * dir[0];
          const c = startC + i * dir[1];
          if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE || (newGrid[r][c] !== '' && newGrid[r][c] !== wordObj.word[i])) {
            canPlace = false;
            break;
          }
        }
        
        if (canPlace) {
          for (let i = 0; i < wordObj.word.length; i++) {
            const r = startR + i * dir[0];
            const c = startC + i * dir[1];
            newGrid[r][c] = wordObj.word[i];
          }
          placed = true;
        }
        attempts++;
      }
    });

    // Fill empty spaces
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (newGrid[r][c] === '') {
          newGrid[r][c] = letters[Math.floor(Math.random() * letters.length)];
        }
      }
    }

    setGrid(newGrid);
    setWordsToFind(words);
    setFoundCells([]);
    setSelectedCells([]);
    setScore(0);
  }, []);

  useEffect(() => {
    generateGrid(currentTheme);
  }, [currentTheme, generateGrid]);

  const handlePointerDown = (r: number, c: number) => {
    setIsDragging(true);
    setSelectedCells([{ r, c }]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element) return;
    
    let target = element as HTMLElement | null;
    while (target && target !== e.currentTarget && !target.hasAttribute('data-r')) {
      target = target.parentElement;
    }
    
    if (!target || !target.hasAttribute('data-r')) return;
    
    const r = parseInt(target.getAttribute('data-r')!, 10);
    const c = parseInt(target.getAttribute('data-c')!, 10);
    
    const startCell = selectedCells[0];
    if (!startCell) return;
    
    if (r === selectedCells[selectedCells.length - 1].r && c === selectedCells[selectedCells.length - 1].c) return;

    let dr = r - startCell.r;
    let dc = c - startCell.c;
    
    // Snap to nearest valid direction (H, V, or D)
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);

    if (absDr > absDc * 2) {
      dc = 0;
    } else if (absDc > absDr * 2) {
      dr = 0;
    } else {
      const dist = Math.max(absDr, absDc);
      dr = dr > 0 ? dist : -dist;
      dc = dc > 0 ? dist : -dist;
    }

    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0) {
      setSelectedCells([startCell]);
      return;
    }

    const stepR = dr / steps;
    const stepC = dc / steps;
    
    const newSelection = [];
    for (let i = 0; i <= steps; i++) {
      const currR = startCell.r + Math.round(i * stepR);
      const currC = startCell.c + Math.round(i * stepC);
      if (currR >= 0 && currR < GRID_SIZE && currC >= 0 && currC < GRID_SIZE) {
        newSelection.push({ r: currR, c: currC });
      }
    }
    setSelectedCells(newSelection);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    
    if (selectedCells.length === 0) return;

    const selectedWord = selectedCells.map(cell => grid[cell.r][cell.c]).join('');
    const selectedWordReversed = selectedWord.split('').reverse().join('');

    let foundWordIndex = wordsToFind.findIndex(w => !w.found && (w.word === selectedWord || w.word === selectedWordReversed));

    if (foundWordIndex !== -1) {
      const newWordsToFind = [...wordsToFind];
      newWordsToFind[foundWordIndex].found = true;
      setWordsToFind(newWordsToFind);
      
      // Add newly found cells to the permanent foundCells list
      setFoundCells(prev => {
        const newFound = [...prev];
        selectedCells.forEach(cell => {
          if (!newFound.some(f => f.r === cell.r && f.c === cell.c)) {
            newFound.push(cell);
          }
        });
        return newFound;
      });
      
      setScore(prev => prev + selectedWord.length * 10);
      
      // Check win condition
      if (newWordsToFind.every(w => w.found)) {
        setTimeout(() => {
          onGameEnd(score + 500, 100, true);
          setCurrentTheme((prev) => (prev + 1) % THEMES.length);
        }, 1000);
      }
    }
    
    setSelectedCells([]);
  };

  const isCellSelected = (r: number, c: number) => selectedCells.some(cell => cell.r === r && cell.c === c);
  const isCellFound = (r: number, c: number) => foundCells.some(cell => cell.r === r && cell.c === c);

  return (
    <div 
      className="flex flex-col items-center justify-center min-h-[600px] p-4 bg-neutral-950 rounded-3xl border border-white/5 relative overflow-hidden select-none" 
      onPointerUp={handlePointerUp} 
      onPointerLeave={handlePointerUp}
      onPointerMove={handlePointerMove}
      style={{ touchAction: 'none' }}
    >
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
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}>
            {grid.map((row, r) => (
              row.map((letter, c) => (
                <div
                  key={`${r}-${c}`}
                  data-r={r}
                  data-c={c}
                  onPointerDown={(e) => {
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    handlePointerDown(r, c);
                  }}
                  className={`w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-md text-xs md:text-sm font-bold cursor-pointer transition-all duration-200 select-none
                    ${isCellFound(r, c) ? 'bg-brand-primary text-black shadow-[0_0_10px_rgba(74,222,128,0.5)] scale-105 z-10' : 
                      isCellSelected(r, c) ? 'bg-white/30 text-white border border-white/50 scale-110 z-20' : 
                      'bg-white/5 text-neutral-400 border border-transparent hover:bg-white/10'}`}
                >
                  <span className="pointer-events-none">{letter}</span>
                </div>
              ))
            ))}
          </div>
        </div>

        {/* Word List & Info */}
        <div className="flex flex-col w-full max-w-md gap-4">
          <div className="bg-neutral-900/50 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">{THEMES[currentTheme].name}</h2>
              <span className="text-brand-primary font-mono text-xl">{score}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {wordsToFind.map((w, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <span className={`font-bold tracking-wider text-[10px] md:text-xs ${w.found ? 'text-brand-primary line-through opacity-50' : 'text-white'}`}>
                    {w.word}
                  </span>
                  <button 
                    onClick={() => setActiveDesc(w)}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-brand-primary/20 hover:text-brand-primary text-neutral-400 transition-colors"
                    title="Ver significado"
                  >
                    <Icon name="help" className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button 
            onClick={() => generateGrid(currentTheme)}
            className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 transition-colors"
          >
            Reiniciar Nivel
          </button>
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

export default WordSearchGame;
