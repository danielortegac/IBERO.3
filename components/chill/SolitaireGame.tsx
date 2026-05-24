import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../Icon';
import { Card, createDeck, SUITS, RANKS, Suit, Rank } from '../../utils/cardUtils';

interface SolitaireGameProps {
  onBack: () => void;
  onGameEnd: (score: number, xp: number, hit: boolean) => void;
  bestScore: number;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
}

const SolitaireGame: React.FC<SolitaireGameProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
  const [tableau, setTableau] = useState<Card[][]>([]);
  const [tableauFlipped, setTableauFlipped] = useState<boolean[][]>([]);
  const [foundations, setFoundations] = useState<Card[][]>([[], [], [], []]);
  const [waste, setWaste] = useState<Card[]>([]);
  const [stock, setStock] = useState<Card[]>([]);
  const [selected, setSelected] = useState<{ type: 'tableau' | 'waste' | 'foundation'; index: number; cardIndex?: number } | null>(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);

  const getRankValue = (rank: Rank): number => {
    const values: Record<Rank, number> = {
      'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
    };
    return values[rank];
  };

  const isRed = (suit: Suit): boolean => suit === 'hearts' || suit === 'diamonds';

  const startNewGame = useCallback(() => {
    const newDeck = createDeck();
    const newTableau: Card[][] = [];
    const newFlipped: boolean[][] = [];
    let deckIndex = 0;

    for (let i = 0; i < 7; i++) {
      newTableau[i] = [];
      newFlipped[i] = [];
      for (let j = 0; j <= i; j++) {
        newTableau[i].push(newDeck[deckIndex++]);
        newFlipped[i].push(j === i);
      }
    }

    setStock(newDeck.slice(deckIndex));
    setTableau(newTableau);
    setTableauFlipped(newFlipped);
    setFoundations([[], [], [], []]);
    setWaste([]);
    setScore(0);
    setMoves(0);
    setSelected(null);
  }, []);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  const handleStockClick = () => {
    if (stock.length === 0) {
      if (waste.length === 0) return;
      setStock([...waste].reverse());
      setWaste([]);
    } else {
      const nextCard = stock[0];
      setStock(stock.slice(1));
      setWaste([nextCard, ...waste]);
    }
    setMoves(prev => prev + 1);
    setSelected(null);
  };

  const canMoveToTableau = (card: Card, targetCol: number): boolean => {
    const targetStack = tableau[targetCol];
    if (targetStack.length === 0) {
      return card.rank === 'K';
    }
    const topCard = targetStack[targetStack.length - 1];
    return isRed(card.suit) !== isRed(topCard.suit) && getRankValue(card.rank) === getRankValue(topCard.rank) - 1;
  };

  const canMoveToFoundation = (card: Card, targetIdx: number): boolean => {
    const targetStack = foundations[targetIdx];
    if (targetStack.length === 0) {
      return card.rank === 'A';
    }
    const topCard = targetStack[targetStack.length - 1];
    return card.suit === topCard.suit && getRankValue(card.rank) === getRankValue(topCard.rank) + 1;
  };

  const handleMove = (targetType: 'tableau' | 'foundation', targetIndex: number): boolean => {
    if (!selected) return false;

    let movingCards: Card[] = [];

    if (selected.type === 'waste') {
      movingCards = [waste[0]];
    } else if (selected.type === 'tableau') {
      movingCards = tableau[selected.index].slice(selected.cardIndex);
    } else if (selected.type === 'foundation') {
      movingCards = [foundations[selected.index][foundations[selected.index].length - 1]];
    }

    const cardToMove = movingCards[0];
    if (!cardToMove) return false;

    let isValid = false;

    if (targetType === 'tableau') {
      isValid = canMoveToTableau(cardToMove, targetIndex);
    } else if (targetType === 'foundation') {
      isValid = movingCards.length === 1 && canMoveToFoundation(cardToMove, targetIndex);
    }

    if (isValid) {
      const nextTableau = [...tableau];
      const nextFlipped = [...tableauFlipped];
      const nextFoundations = [...foundations];
      let nextWaste = [...waste];

      // 1. Remove from source
      if (selected.type === 'waste') {
        nextWaste = nextWaste.slice(1);
        setWaste(nextWaste);
      } else if (selected.type === 'tableau') {
        nextTableau[selected.index] = nextTableau[selected.index].slice(0, selected.cardIndex);
        nextFlipped[selected.index] = nextFlipped[selected.index].slice(0, selected.cardIndex);
        
        // Flip the new top card if needed
        if (nextTableau[selected.index].length > 0 && !nextFlipped[selected.index][nextTableau[selected.index].length - 1]) {
          nextFlipped[selected.index][nextTableau[selected.index].length - 1] = true;
          setScore(prev => prev + 5);
        }
      } else if (selected.type === 'foundation') {
        nextFoundations[selected.index] = nextFoundations[selected.index].slice(0, -1);
      }

      // 2. Add to target
      if (targetType === 'tableau') {
        nextTableau[targetIndex] = [...nextTableau[targetIndex], ...movingCards];
        nextFlipped[targetIndex] = [...nextFlipped[targetIndex]];
        movingCards.forEach(() => nextFlipped[targetIndex].push(true));
        setScore(prev => prev + 10);
      } else if (targetType === 'foundation') {
        nextFoundations[targetIndex] = [...nextFoundations[targetIndex], ...movingCards];
        setScore(prev => prev + 20);
      }

      // 3. Commit state
      setTableau(nextTableau);
      setTableauFlipped(nextFlipped);
      setFoundations(nextFoundations);

      setMoves(prev => prev + 1);
      setSelected(null);

      // Check win
      if (nextFoundations.every(f => f.length === 13)) {
        onGameEnd(score + 500, 100, true);
      }
      return true;
    } else {
      setSelected(null);
      return false;
    }
  };

  const handleSelect = (type: 'tableau' | 'waste' | 'foundation', index: number, cardIndex?: number) => {
    if (selected) {
      if (selected.type === type && selected.index === index && selected.cardIndex === cardIndex) {
        setSelected(null);
      } else {
        const success = handleMove(type === 'foundation' ? 'foundation' : 'tableau', index);
        if (!success) {
          // If move failed, try to select the new card instead
          if (type === 'tableau' && tableauFlipped[index][cardIndex!]) {
            setSelected({ type, index, cardIndex });
          } else if (type === 'waste' && waste.length > 0) {
            setSelected({ type, index });
          } else if (type === 'foundation' && foundations[index].length > 0) {
            setSelected({ type, index });
          }
        }
      }
    } else {
      if (type === 'tableau') {
        if (tableauFlipped[index][cardIndex!]) {
          setSelected({ type, index, cardIndex });
        }
      } else if (type === 'waste' && waste.length > 0) {
        setSelected({ type, index });
      } else if (type === 'foundation' && foundations[index].length > 0) {
        setSelected({ type, index });
      }
    }
  };

  const autoMoveToFoundation = (type: 'tableau' | 'waste', index: number, cardIndex?: number) => {
    let card: Card;
    if (type === 'waste') {
      if (waste.length === 0) return;
      card = waste[0];
    } else {
      if (cardIndex !== tableau[index].length - 1) return; // Only top card can auto-move
      card = tableau[index][cardIndex!];
    }

    // Find a valid foundation
    for (let i = 0; i < 4; i++) {
      if (canMoveToFoundation(card, i)) {
        // Execute move
        if (type === 'waste') {
          setWaste(waste.slice(1));
        } else {
          const newTableau = [...tableau];
          const newFlipped = [...tableauFlipped];
          newTableau[index] = newTableau[index].slice(0, -1);
          newFlipped[index] = newFlipped[index].slice(0, -1);
          
          if (newTableau[index].length > 0 && !newFlipped[index][newTableau[index].length - 1]) {
            newFlipped[index][newTableau[index].length - 1] = true;
            setScore(prev => prev + 5);
          }
          setTableau(newTableau);
          setTableauFlipped(newFlipped);
        }

        const newFoundations = [...foundations];
        newFoundations[i] = [...newFoundations[i], card];
        setFoundations(newFoundations);
        setScore(prev => prev + 20);
        setMoves(prev => prev + 1);
        setSelected(null);

        if (newFoundations.every(f => f.length === 13)) {
          onGameEnd(score + 500, 100, true);
        }
        return;
      }
    }
  };

  const renderCard = (card: Card, isFaceUp: boolean = true, isSelected: boolean = false, onClick?: () => void, onDoubleClick?: () => void, onDragStart?: (e: React.DragEvent) => void) => {
    const isRedCard = isRed(card.suit);

    return (
      <motion.div
        layout
        draggable={isFaceUp}
        onDragStart={(e: any) => {
          if (isFaceUp && onDragStart) {
            onDragStart(e);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick?.();
        }}
        className={`relative w-14 h-20 md:w-20 md:h-28 rounded-lg border ${isSelected ? 'border-brand-primary border-2 scale-105 z-20 shadow-[0_0_15px_rgba(74,222,128,0.5)]' : 'border-neutral-300'} bg-white shadow-sm cursor-pointer transition-all`}
      >
        {!isFaceUp ? (
          <div className="absolute inset-0 bg-indigo-900 flex items-center justify-center rounded-lg border-2 border-white/10 overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, #fff 5px, #fff 10px)' }}></div>
            <img 
              src="/favicon.ico" 
              alt="Logo"
              className="w-6 h-6 object-contain opacity-40 z-10"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col p-1.5">
            <div className="flex justify-between items-start">
              <div className={`text-xs md:text-sm font-black leading-none ${isRedCard ? 'text-red-600' : 'text-neutral-900'}`}>
                {card.rank}
              </div>
              <img 
                src="/favicon.ico" 
                alt="Logo"
                className="w-4 h-4 md:w-5 md:h-5 object-contain opacity-80"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";
                }}
              />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <Icon name={card.suit.slice(0, -1) as any} className={`w-5 h-5 md:w-8 md:h-8 ${isRedCard ? 'text-red-600' : 'text-neutral-900'}`} />
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] p-4 bg-neutral-950 rounded-3xl border border-white/5 relative overflow-hidden" style={{ touchAction: 'none' }}>
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
          <button 
            onClick={() => setShowInstructions(true)}
            className="px-3 py-1.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/30 text-indigo-300 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
          >
            <Icon name="help" className="w-3 h-3" />
            Cómo Jugar
          </button>
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

      <div className="w-full max-w-4xl flex flex-col gap-6 mt-12 z-10">
        {/* Top Row: Stock, Waste, Foundations */}
        <div className="flex justify-between items-start px-2">
          <div className="flex gap-2">
            <div 
              onClick={handleStockClick} 
              className="w-14 h-20 md:w-20 md:h-28 rounded-lg border-2 border-dashed border-white/20 bg-white/5 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all"
            >
              {stock.length > 0 ? (
                <div className="w-full h-full bg-indigo-900 rounded-lg border-2 border-white/10 flex items-center justify-center overflow-hidden relative">
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, #fff 5px, #fff 10px)' }}></div>
                  <img 
                    src="/favicon.ico" 
                    alt="Logo"
                    className="w-8 h-8 object-contain opacity-40 z-10"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";
                    }}
                  />
                </div>
              ) : (
                <Icon name="sync" className="w-6 h-6 text-white/20" />
              )}
            </div>
            <div className="w-14 h-20 md:w-20 md:h-28">
              {waste.length > 0 && renderCard(
                waste[0], 
                true, 
                selected?.type === 'waste', 
                () => handleSelect('waste', 0),
                () => autoMoveToFoundation('waste', 0),
                (e) => {
                  setSelected({ type: 'waste', index: 0 });
                  e.dataTransfer.effectAllowed = 'move';
                }
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {foundations.map((f, i) => (
              <div 
                key={i} 
                onClick={() => handleSelect('foundation', i)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={(e) => { e.preventDefault(); handleMove('foundation', i); }}
                className={`w-14 h-20 md:w-20 md:h-28 rounded-lg border-2 border-dashed ${selected ? 'border-brand-primary/40' : 'border-white/20'} bg-white/5 flex items-center justify-center cursor-pointer transition-all`}
              >
                {f.length > 0 ? (
                  renderCard(
                    f[f.length - 1], 
                    true, 
                    selected?.type === 'foundation' && selected.index === i,
                    undefined,
                    undefined,
                    (e) => {
                      setSelected({ type: 'foundation', index: i });
                      e.dataTransfer.effectAllowed = 'move';
                    }
                  )
                ) : (
                  <Icon name={SUITS[i].slice(0, -1) as any} className="w-6 h-6 text-white/10" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tableau */}
        <div className="grid grid-cols-7 gap-1 md:gap-3 px-1 mt-4">
          {tableau.map((column, colIndex) => (
            <div 
              key={colIndex} 
              className="flex flex-col min-h-[300px]"
              onClick={() => selected && handleMove('tableau', colIndex)}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={(e) => { e.preventDefault(); handleMove('tableau', colIndex); }}
            >
              {column.map((card, cardIndex) => {
                const isCardSelected = selected?.type === 'tableau' && selected.index === colIndex && selected.cardIndex === cardIndex;
                const isFlipped = tableauFlipped[colIndex][cardIndex];
                
                return (
                  <div 
                    key={card.id} 
                    className="relative"
                    style={{ marginTop: cardIndex === 0 ? 0 : '-3rem' }}
                  >
                    {renderCard(
                      card, 
                      isFlipped, 
                      isCardSelected, 
                      () => isFlipped && handleSelect('tableau', colIndex, cardIndex),
                      () => isFlipped && autoMoveToFoundation('tableau', colIndex, cardIndex),
                      (e) => {
                        if (isFlipped) {
                          setSelected({ type: 'tableau', index: colIndex, cardIndex });
                          e.dataTransfer.effectAllowed = 'move';
                        }
                      }
                    )}
                  </div>
                );
              })}
              {column.length === 0 && (
                <div 
                  onClick={() => selected && handleMove('tableau', colIndex)}
                  className={`w-14 h-20 md:w-20 md:h-28 rounded-lg border-2 border-dashed ${selected ? 'border-brand-primary/40' : 'border-white/20'} bg-white/5 cursor-pointer`} 
                />
              )}
            </div>
          ))}
        </div>

        {/* Stats & Controls */}
        <div className="flex justify-between items-center p-4 bg-neutral-900/50 rounded-2xl border border-white/5 backdrop-blur-md">
          <div className="flex gap-8">
            <div className="flex flex-col">
              <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Score</span>
              <span className="text-xl font-mono text-brand-primary">{score}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Moves</span>
              <span className="text-xl font-mono text-white">{moves}</span>
            </div>
          </div>
          <div className="flex gap-2">
             <button onClick={startNewGame} className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-white/10">
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Instructions Modal */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowInstructions(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-neutral-900 border border-white/10 p-6 md:p-8 rounded-3xl max-w-lg w-full shadow-2xl overflow-y-auto max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Cómo Jugar Solitario</h3>
                <button onClick={() => setShowInstructions(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <Icon name="x" className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-6 text-sm text-neutral-300">
                <section>
                  <h4 className="text-brand-primary font-bold mb-2 uppercase tracking-wider text-xs">Objetivo</h4>
                  <p>Mover todas las cartas a las 4 fundaciones (las casillas vacías arriba a la derecha), ordenadas por palo (corazones, diamantes, tréboles, picas) desde el As (A) hasta el Rey (K).</p>
                </section>

                <section>
                  <h4 className="text-brand-primary font-bold mb-2 uppercase tracking-wider text-xs">Reglas del Tablero</h4>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>Puedes mover cartas de una columna a otra si la carta que mueves es de un <strong>color diferente</strong> (rojo sobre negro, o negro sobre rojo) y de un <strong>valor exactamente inferior</strong> (ej. un 6 rojo sobre un 7 negro).</li>
                    <li>Puedes mover varias cartas juntas si ya están ordenadas correctamente.</li>
                    <li>Si una columna se queda vacía, solo puedes colocar un <strong>Rey (K)</strong> en ese espacio.</li>
                  </ul>
                </section>

                <section>
                  <h4 className="text-brand-primary font-bold mb-2 uppercase tracking-wider text-xs">Controles</h4>
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>Clic simple:</strong> Toca una carta para seleccionarla (se iluminará) y luego toca el destino donde quieres moverla.</li>
                    <li><strong>Doble clic:</strong> Toca dos veces una carta para enviarla automáticamente a las fundaciones si es un movimiento válido.</li>
                    <li><strong>Mazo (arriba izquierda):</strong> Haz clic para sacar nuevas cartas. Si se acaba, haz clic en el espacio vacío para volver a barajar.</li>
                  </ul>
                </section>
              </div>

              <button 
                onClick={() => setShowInstructions(false)}
                className="w-full mt-8 py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] transition-transform"
              >
                ¡Entendido, a jugar!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SolitaireGame;
