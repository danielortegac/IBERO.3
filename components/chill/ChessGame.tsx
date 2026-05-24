import React, { useState, useEffect, useCallback } from 'react';
import Icon from '../Icon';

type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type Color = 'w' | 'b';

interface Piece {
  type: PieceType;
  color: Color;
}

type Board = (Piece | null)[][];

interface Position {
  r: number;
  c: number;
}

const INITIAL_BOARD: Board = [
  [
    { type: 'r', color: 'b' }, { type: 'n', color: 'b' }, { type: 'b', color: 'b' }, { type: 'q', color: 'b' },
    { type: 'k', color: 'b' }, { type: 'b', color: 'b' }, { type: 'n', color: 'b' }, { type: 'r', color: 'b' }
  ],
  Array(8).fill(null).map(() => ({ type: 'p', color: 'b' })),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null).map(() => ({ type: 'p', color: 'w' })),
  [
    { type: 'r', color: 'w' }, { type: 'n', color: 'w' }, { type: 'b', color: 'w' }, { type: 'q', color: 'w' },
    { type: 'k', color: 'w' }, { type: 'b', color: 'w' }, { type: 'n', color: 'w' }, { type: 'r', color: 'w' }
  ]
];

const PIECE_ICONS: Record<PieceType, string> = {
  p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '🐐'
};

interface ChessGameProps {
  onBack: () => void;
  onGameEnd: (score: number, xp: number, hit: boolean) => void;
  bestScore: number;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
}

const ChessGame: React.FC<ChessGameProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
  const [board, setBoard] = useState<Board>(JSON.parse(JSON.stringify(INITIAL_BOARD)));
  const [turn, setTurn] = useState<Color>('w');
  const [selected, setSelected] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{from: Position, to: Position} | null>(null);
  const [castlingRights, setCastlingRights] = useState({ wK: true, wQ: true, bK: true, bQ: true });
  const [isAiThinking, setIsAiThinking] = useState(false);

  const isInside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  const getValidMoves = useCallback((pos: Position, currentBoard: Board, checkCheck = true): Position[] => {
    const piece = currentBoard[pos.r][pos.c];
    if (!piece) return [];
    const moves: Position[] = [];
    const { type, color } = piece;

    const addMove = (r: number, c: number) => {
      if (!isInside(r, c)) return false;
      const target = currentBoard[r][c];
      if (!target) {
        moves.push({ r, c });
        return true;
      }
      if (target.color !== color) {
        moves.push({ r, c });
      }
      return false;
    };

    if (type === 'p') {
      const dir = color === 'w' ? -1 : 1;
      // Forward
      if (isInside(pos.r + dir, pos.c) && !currentBoard[pos.r + dir][pos.c]) {
        moves.push({ r: pos.r + dir, c: pos.c });
        if (((color === 'w' && pos.r === 6) || (color === 'b' && pos.r === 1)) && !currentBoard[pos.r + 2 * dir][pos.c]) {
          moves.push({ r: pos.r + 2 * dir, c: pos.c });
        }
      }
      // Captures
      [-1, 1].forEach(dc => {
        const tr = pos.r + dir, tc = pos.c + dc;
        if (isInside(tr, tc)) {
          const target = currentBoard[tr][tc];
          if (target && target.color !== color) {
            moves.push({ r: tr, c: tc });
          }
          // En Passant
          if (!target && lastMove && lastMove.to.r === pos.r && lastMove.to.c === tc) {
            const lastPiece = currentBoard[lastMove.to.r][lastMove.to.c];
            if (lastPiece?.type === 'p' && Math.abs(lastMove.from.r - lastMove.to.r) === 2) {
              moves.push({ r: tr, c: tc });
            }
          }
        }
      });
    } else if (type === 'n') {
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => {
        addMove(pos.r + dr, pos.c + dc);
      });
    } else if (type === 'b' || type === 'r' || type === 'q') {
      const dirs = type === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] : 
                   type === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]] :
                   [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
      dirs.forEach(([dr, dc]) => {
        let tr = pos.r + dr, tc = pos.c + dc;
        while (isInside(tr, tc)) {
          const target = currentBoard[tr][tc];
          if (!target) {
            moves.push({ r: tr, c: tc });
          } else {
            if (target.color !== color) moves.push({ r: tr, c: tc });
            break;
          }
          tr += dr; tc += dc;
        }
      });
    } else if (type === 'k') {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => {
        addMove(pos.r + dr, pos.c + dc);
      });

      // Castling
      if (checkCheck) {
        if (color === 'w') {
          if (castlingRights.wK && !currentBoard[7][5] && !currentBoard[7][6]) moves.push({ r: 7, c: 6 });
          if (castlingRights.wQ && !currentBoard[7][1] && !currentBoard[7][2] && !currentBoard[7][3]) moves.push({ r: 7, c: 2 });
        } else {
          if (castlingRights.bK && !currentBoard[0][5] && !currentBoard[0][6]) moves.push({ r: 0, c: 6 });
          if (castlingRights.bQ && !currentBoard[0][1] && !currentBoard[0][2] && !currentBoard[0][3]) moves.push({ r: 0, c: 2 });
        }
      }
    }

    if (checkCheck) {
      return moves.filter(m => !isKingInCheckAfterMove(pos, m, currentBoard, color));
    }

    return moves;
  }, [lastMove, castlingRights]);

  const isKingInCheckAfterMove = (from: Position, to: Position, currentBoard: Board, color: Color) => {
    const tempBoard = currentBoard.map(row => [...row]);
    tempBoard[to.r][to.c] = tempBoard[from.r][from.c];
    tempBoard[from.r][from.c] = null;
    
    // Find king
    let kingPos: Position | null = null;
    tempBoard.forEach((row, r) => row.forEach((p, c) => {
      if (p?.type === 'k' && p.color === color) kingPos = { r, c };
    }));

    if (!kingPos) return false;

    // Check if any opponent piece can attack king
    const opponentColor = color === 'w' ? 'b' : 'w';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = tempBoard[r][c];
        if (p && p.color === opponentColor) {
          const moves = getValidMoves({ r, c }, tempBoard, false);
          if (moves.some(m => m.r === kingPos?.r && m.c === kingPos?.c)) return true;
        }
      }
    }
    return false;
  };

  const makeMove = useCallback((from: Position, to: Position) => {
    const newBoard = board.map(row => [...row]);
    const piece = newBoard[from.r][from.c];
    if (!piece) return;

    // En Passant
    if (piece.type === 'p' && from.c !== to.c && !newBoard[to.r][to.c]) {
      newBoard[from.r][to.c] = null;
    }

    // Castling
    if (piece.type === 'k' && Math.abs(from.c - to.c) === 2) {
      const rookCol = to.c === 6 ? 7 : 0;
      const newRookCol = to.c === 6 ? 5 : 3;
      newBoard[from.r][newRookCol] = newBoard[from.r][rookCol];
      newBoard[from.r][rookCol] = null;
    }

    // Move piece
    newBoard[to.r][to.c] = piece;
    newBoard[from.r][from.c] = null;

    // Pawn Promotion
    if (piece.type === 'p' && (to.r === 0 || to.r === 7)) {
      newBoard[to.r][to.c] = { type: 'q', color: piece.color };
    }

    // Update Castling Rights
    const newRights = { ...castlingRights };
    if (piece.type === 'k') {
      if (piece.color === 'w') { newRights.wK = false; newRights.wQ = false; }
      else { newRights.bK = false; newRights.bQ = false; }
    }
    if (piece.type === 'r') {
      if (from.r === 7 && from.c === 7) newRights.wK = false;
      if (from.r === 7 && from.c === 0) newRights.wQ = false;
      if (from.r === 0 && from.c === 7) newRights.bK = false;
      if (from.r === 0 && from.c === 0) newRights.bQ = false;
    }

    setBoard(newBoard);
    setCastlingRights(newRights);
    setLastMove({ from, to });
    setTurn(turn === 'w' ? 'b' : 'w');
    setSelected(null);
    setValidMoves([]);
    setHistory(prev => [...prev, `${piece.type}${String.fromCharCode(97 + to.c)}${8 - to.r}`]);

    // Check for game over
    const opponentColor = turn === 'w' ? 'b' : 'w';
    let hasMoves = false;
    newBoard.forEach((row, r) => row.forEach((p, c) => {
      if (p && p.color === opponentColor) {
        if (getValidMoves({ r, c }, newBoard).length > 0) hasMoves = true;
      }
    }));

    if (!hasMoves) {
      // Check if in check
      let kingPos: Position | null = null;
      newBoard.forEach((row, r) => row.forEach((p, c) => {
        if (p?.type === 'k' && p.color === opponentColor) kingPos = { r, c };
      }));
      
      let inCheck = false;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = newBoard[r][c];
          if (p && p.color === turn) {
            if (getValidMoves({ r, c }, newBoard, false).some(m => m.r === kingPos?.r && m.c === kingPos?.c)) inCheck = true;
          }
        }
      }

      if (inCheck) {
        setGameOver(`Jaque Mate - Ganan las ${turn === 'w' ? 'Blancas' : 'Negras'}`);
        onGameEnd(500, 100, true);
      } else {
        setGameOver('Tablas por Ahogado');
        onGameEnd(200, 50, false);
      }
    }
  }, [board, turn, castlingRights, onGameEnd, getValidMoves]);

  // AI Move
  useEffect(() => {
    if (turn === 'b' && !gameOver) {
      setIsAiThinking(true);
      const timer = setTimeout(() => {
        const allMoves: {from: Position, to: Position}[] = [];
        board.forEach((row, r) => row.forEach((p, c) => {
          if (p && p.color === 'b') {
            const moves = getValidMoves({ r, c }, board);
            moves.forEach(m => allMoves.push({ from: { r, c }, to: m }));
          }
        }));

        if (allMoves.length > 0) {
          // Simple AI: Prefer captures
          const captures = allMoves.filter(m => board[m.to.r][m.to.c] !== null);
          const move = captures.length > 0 ? captures[Math.floor(Math.random() * captures.length)] : allMoves[Math.floor(Math.random() * allMoves.length)];
          makeMove(move.from, move.to);
        }
        setIsAiThinking(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [turn, board, gameOver, getValidMoves, makeMove]);

  const handleSquareClick = (r: number, c: number) => {
    if (gameOver || turn === 'b') return;

    if (selected) {
      const move = validMoves.find(m => m.r === r && m.c === c);
      if (move) {
        makeMove(selected, move);
        return;
      }
    }

    const piece = board[r][c];
    if (piece && piece.color === turn) {
      setSelected({ r, c });
      setValidMoves(getValidMoves({ r, c }, board));
    } else {
      setSelected(null);
      setValidMoves([]);
    }
  };

  const resetGame = () => {
    setBoard(JSON.parse(JSON.stringify(INITIAL_BOARD)));
    setTurn('w');
    setSelected(null);
    setValidMoves([]);
    setGameOver(null);
    setHistory([]);
  };

  return (
    <div className="h-full flex flex-col bg-neutral-950 text-white overflow-hidden font-sans">
      <div className="p-4 flex justify-between items-center border-b border-white/5 bg-neutral-900/60 backdrop-blur-2xl z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 hover:bg-white/10 rounded-2xl transition-all active:scale-90 border border-white/5">
            <Icon name="arrow-left" className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-white to-neutral-500 bg-clip-text text-transparent">Ajedrez Maestro</h2>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${turn === 'w' ? 'bg-white' : 'bg-neutral-600'} animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.5)]`}></div>
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Turno: {turn === 'w' ? 'Blancas' : 'Negras'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={resetGame} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 transition-all">Reiniciar</button>
          <button onClick={toggleFullscreen} className="p-3 hover:bg-white/10 rounded-2xl transition-all border border-white/5">
            <Icon name={isFullscreen ? "minimize" : "maximize"} className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-4 md:p-8 gap-8 overflow-y-auto">
        <div className="relative aspect-square w-full max-w-[min(80vh,600px)] bg-neutral-800 rounded-xl overflow-hidden shadow-2xl border-8 border-neutral-900">
          <div className="grid grid-cols-8 h-full w-full" style={{ gridTemplateRows: 'repeat(8, minmax(0, 1fr))' }}>
            {board.map((row, r) => row.map((piece, c) => {
              const isSelected = selected?.r === r && selected?.c === c;
              const isValid = validMoves.some(m => m.r === r && m.c === c);
              const isDark = (r + c) % 2 === 1;
              
              return (
                <div 
                  key={`${r}-${c}`}
                  onClick={() => handleSquareClick(r, c)}
                  className={`
                    relative flex items-center justify-center cursor-pointer transition-all
                    ${isDark ? 'bg-[#769656]' : 'bg-[#eeeed2]'}
                    ${isSelected ? 'ring-4 ring-inset ring-yellow-400 z-10' : ''}
                    ${isValid ? 'after:content-[""] after:w-4 after:h-4 after:bg-black/20 after:rounded-full' : ''}
                    ${isValid && piece ? 'ring-4 ring-inset ring-red-400/50' : ''}
                  `}
                >
                  {piece && (
                    <span className={`
                      text-4xl md:text-6xl select-none transition-transform active:scale-90 flex items-center justify-center
                      ${piece.color === 'w' ? 'text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]' : 'text-neutral-900'}
                      ${piece.type === 'k' && piece.color === 'b' ? 'brightness-0 opacity-90' : ''}
                      ${piece.type === 'k' && piece.color === 'w' ? 'brightness-0 invert' : ''}
                    `}>
                      {PIECE_ICONS[piece.type]}
                    </span>
                  )}
                  
                  {/* Coordinates */}
                  {c === 0 && <span className={`absolute top-0.5 left-0.5 text-[8px] font-bold ${isDark ? 'text-[#eeeed2]' : 'text-[#769656]'}`}>{8-r}</span>}
                  {r === 7 && <span className={`absolute bottom-0.5 right-0.5 text-[8px] font-bold ${isDark ? 'text-[#eeeed2]' : 'text-[#769656]'}`}>{String.fromCharCode(97+c)}</span>}
                </div>
              );
            }))}
          </div>

          {gameOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="text-center p-8 bg-neutral-900 rounded-3xl border border-white/10 shadow-2xl">
                <h3 className="text-4xl font-black mb-4 text-white italic uppercase tracking-tighter">Jaque Mate</h3>
                <p className="text-neutral-400 mb-8 font-bold">{gameOver}</p>
                <button 
                  onClick={resetGame}
                  className="px-8 py-4 bg-white text-black font-black rounded-2xl hover:scale-105 transition-all"
                >
                  JUGAR DE NUEVO
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-full lg:w-80 flex flex-col gap-4 self-stretch">
          <div className="flex-1 bg-neutral-900/50 rounded-3xl border border-white/5 p-6 flex flex-col">
            <h3 className="text-xs font-black text-neutral-500 uppercase tracking-[0.3em] mb-4">Historial</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {history.length === 0 ? (
                <p className="text-neutral-600 text-[10px] italic">No hay movimientos aún...</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                    <React.Fragment key={i}>
                      <div className="bg-white/5 p-2 rounded-lg text-[10px] font-bold flex justify-between">
                        <span className="text-neutral-500">{i + 1}.</span>
                        <span>{history[i * 2]}</span>
                      </div>
                      {history[i * 2 + 1] && (
                        <div className="bg-white/5 p-2 rounded-lg text-[10px] font-bold flex justify-between">
                          <span className="text-neutral-500"></span>
                          <span>{history[i * 2 + 1]}</span>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-indigo-600/20 rounded-3xl border border-indigo-500/30 p-6">
            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">Consejo Pro</h3>
            <p className="text-[10px] text-indigo-200/70 leading-relaxed">Controla el centro del tablero (e4, d4, e5, d5) para dominar la partida.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessGame;
