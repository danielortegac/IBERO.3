import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../Icon';
import { Card, createDeck, getPokerHandValue } from '../../utils/cardUtils';

interface PokerGameProps {
  onBack: () => void;
  onGameEnd: (score: number, xp: number, hit: boolean) => void;
  bestScore: number;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
}

const PokerGame: React.FC<PokerGameProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
  const [deck, setDeck] = useState<Card[]>([]);
  const [hand, setHand] = useState<Card[]>([]);
  const [heldIndices, setHeldIndices] = useState<Set<number>>(new Set());
  const [gameState, setGameState] = useState<'betting' | 'dealing' | 'drawing' | 'gameOver'>('betting');
  const [credits, setCredits] = useState(100);
  const [bet, setBet] = useState(5);
  const [message, setMessage] = useState('Place your bet and deal!');
  const [lastWin, setLastWin] = useState(0);
  const [totalWon, setTotalWon] = useState(0);

  const startNewGame = useCallback(() => {
    const newDeck = createDeck();
    setDeck(newDeck);
    setCredits(100);
    setGameState('betting');
    setHand([]);
    setHeldIndices(new Set());
    setMessage('Place your bet and deal!');
    setTotalWon(0);
  }, []);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  const deal = () => {
    if (credits < bet) {
      setMessage('Not enough credits!');
      return;
    }

    setCredits(prev => prev - bet);
    const newDeck = [...deck];
    const initialHand = newDeck.splice(0, 5);
    setHand(initialHand);
    setDeck(newDeck);
    setHeldIndices(new Set());
    setGameState('drawing');
    setMessage('Select cards to hold and draw!');
  };

  const draw = () => {
    const newDeck = [...deck];
    const newHand = hand.map((card, index) => {
      if (heldIndices.has(index)) return card;
      return newDeck.shift()!;
    });

    setHand(newHand);
    setDeck(newDeck);
    
    const result = getPokerHandValue(newHand);
    const winAmount = result.score > 0 ? (result.score / 20) * bet : 0;
    
    setCredits(prev => prev + winAmount);
    setLastWin(winAmount);
    setTotalWon(prev => prev + winAmount);
    
    if (winAmount > 0) {
      setMessage(`WIN: ${result.name}! +${winAmount} Credits`);
    } else {
      setMessage('No win. Try again!');
    }

    setGameState('betting');
    if (credits + winAmount <= 0) {
      setGameState('gameOver');
      onGameEnd(totalWon + winAmount, Math.floor((totalWon + winAmount) / 10), (totalWon + winAmount) > 100);
    }
  };

  const toggleHold = (index: number) => {
    if (gameState !== 'drawing') return;
    const newHeld = new Set(heldIndices);
    if (newHeld.has(index)) {
      newHeld.delete(index);
    } else {
      newHeld.add(index);
    }
    setHeldIndices(newHeld);
  };

  const renderCard = (card: Card, index: number) => {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    const isHeld = heldIndices.has(index);

    return (
      <motion.div
        key={card.id}
        initial={{ rotateY: 180, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={{ delay: index * 0.1 }}
        onClick={() => toggleHold(index)}
        className={`relative w-16 h-24 md:w-32 md:h-48 rounded-xl border-2 cursor-pointer transition-all duration-300 ${isHeld ? 'border-brand-primary scale-105 shadow-lg shadow-brand-primary/20' : 'border-neutral-300 bg-white'}`}
      >
        <div className="absolute inset-0 flex flex-col p-1.5 md:p-4">
          <div className="flex justify-between items-start">
            <div className={`text-sm md:text-2xl font-bold ${isRed ? 'text-red-600' : 'text-neutral-900'}`}>
              {card.rank}
            </div>
            <img 
              src="/favicon.ico" 
              alt="Logo"
              className="w-3 h-3 md:w-5 md:h-5 object-contain opacity-80"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";
              }}
            />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <Icon name={card.suit.slice(0, -1) as any} className={`w-6 h-6 md:w-16 md:h-16 ${isRed ? 'text-red-600' : 'text-neutral-900'}`} />
          </div>
        </div>
        {isHeld && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-primary text-black text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
            HELD
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] p-4 bg-neutral-950 rounded-3xl border border-white/5 relative overflow-y-auto">
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

      <div className="w-full max-w-4xl flex flex-col gap-6 mt-12">
        {/* Header/Stats */}
        <div className="flex flex-col items-center mb-4">
            <h2 className="text-2xl md:text-4xl font-black text-white tracking-widest uppercase mb-2">Video Poker</h2>
            <p className="text-neutral-400 text-sm text-center max-w-md">Juega contra la máquina. Consigue la mejor mano posible para ganar créditos.</p>
        </div>

        <div className="flex justify-between items-center bg-neutral-900/50 p-4 rounded-2xl border border-white/5">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Credits</span>
            <span className="text-xl md:text-2xl font-mono text-brand-primary">{credits}</span>
          </div>
          <div className="text-center flex-1 px-4">
            <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Status</span>
            <div className="text-sm md:text-lg font-medium text-white">{message}</div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Bet</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setBet(Math.max(1, bet - 1))}
                disabled={gameState !== 'betting'}
                className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 disabled:opacity-50"
              >
                -
              </button>
              <span className="text-xl font-mono text-white">{bet}</span>
              <button 
                onClick={() => setBet(Math.min(20, bet + 1))}
                disabled={gameState !== 'betting'}
                className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Hand */}
        <div className="flex justify-center gap-2 md:gap-4 min-h-[144px] md:min-h-[192px]">
          <AnimatePresence mode="popLayout">
            {hand.length > 0 ? (
              hand.map((card, index) => renderCard(card, index))
            ) : (
              <div className="flex gap-2 md:gap-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-16 h-24 md:w-32 md:h-48 rounded-xl border-2 border-dashed border-white/10 bg-white/5" />
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 mt-4">
          {gameState === 'betting' && (
            <button
              onClick={deal}
              className="px-12 py-4 bg-brand-primary text-black font-black uppercase tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-primary/20"
            >
              DEAL
            </button>
          )}
          {gameState === 'drawing' && (
            <button
              onClick={draw}
              className="px-12 py-4 bg-indigo-500 text-white font-black uppercase tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-500/20"
            >
              DRAW
            </button>
          )}
          {gameState === 'gameOver' && (
            <button
              onClick={startNewGame}
              className="px-12 py-4 bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-red-500/20"
            >
              RESTART
            </button>
          )}
        </div>

        {/* Paytable Preview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[9px] font-black uppercase tracking-tighter text-neutral-500 mt-4">
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>Royal Flush</span><span className="text-brand-primary">800</span></div>
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>Straight Flush</span><span className="text-brand-primary">500</span></div>
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>4 of a Kind</span><span className="text-brand-primary">400</span></div>
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>Full House</span><span className="text-brand-primary">300</span></div>
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>Flush</span><span className="text-brand-primary">200</span></div>
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>Straight</span><span className="text-brand-primary">150</span></div>
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>3 of a Kind</span><span className="text-brand-primary">100</span></div>
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>Two Pair</span><span className="text-brand-primary">50</span></div>
          <div className="flex justify-between p-2 bg-white/5 rounded"><span>Jacks or Better</span><span className="text-brand-primary">20</span></div>
        </div>
      </div>
    </div>
  );
};

export default PokerGame;
