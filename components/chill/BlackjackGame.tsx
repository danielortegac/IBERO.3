import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../Icon';
import { Card, createDeck, getCardValue } from '../../utils/cardUtils';

interface BlackjackGameProps {
  onBack: () => void;
  onGameEnd: (score: number, xp: number, hit: boolean) => void;
  bestScore: number;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
}

const BlackjackGame: React.FC<BlackjackGameProps> = ({ onBack, onGameEnd, bestScore, toggleFullscreen, isFullscreen }) => {
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [splitHand, setSplitHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [gameState, setGameState] = useState<'betting' | 'playing' | 'playingSplit' | 'dealerTurn' | 'gameOver'>('betting');
  const [credits, setCredits] = useState(100);
  const [bet, setBet] = useState(10);
  const [splitBet, setSplitBet] = useState(0);
  const [message, setMessage] = useState('Place your bet!');
  const [totalScore, setTotalScore] = useState(0);

  const calculateScore = (hand: Card[]) => {
    let score = 0;
    let aces = 0;
    for (const card of hand) {
      if (card.rank === 'A') {
        aces += 1;
        score += 11;
      } else if (['J', 'Q', 'K'].includes(card.rank)) {
        score += 10;
      } else {
        score += parseInt(card.rank);
      }
    }
    while (score > 21 && aces > 0) {
      score -= 10;
      aces -= 1;
    }
    return score;
  };

  const startNewGame = useCallback(() => {
    setDeck(createDeck());
    setCredits(100);
    setGameState('betting');
    setPlayerHand([]);
    setSplitHand([]);
    setDealerHand([]);
    setMessage('Place your bet!');
    setTotalScore(0);
    setSplitBet(0);
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
    const pHand = [newDeck.shift()!, newDeck.shift()!];
    const dHand = [newDeck.shift()!, newDeck.shift()!];
    
    setPlayerHand(pHand);
    setSplitHand([]);
    setSplitBet(0);
    setDealerHand(dHand);
    setDeck(newDeck);
    setGameState('playing');
    setMessage('Hit, Stand, Split, or Surrender?');

    if (calculateScore(pHand) === 21) {
      stand(pHand, [], dHand, newDeck);
    }
  };

  const hit = () => {
    const newDeck = [...deck];
    if (gameState === 'playing') {
      const newHand = [...playerHand, newDeck.shift()!];
      setPlayerHand(newHand);
      setDeck(newDeck);

      if (calculateScore(newHand) > 21) {
        if (splitHand.length > 0) {
          setGameState('playingSplit');
          setMessage('First hand bust. Playing split hand.');
        } else {
          setGameState('betting');
          setMessage('Bust! You lose.');
          checkGameOver();
        }
      }
    } else if (gameState === 'playingSplit') {
      const newHand = [...splitHand, newDeck.shift()!];
      setSplitHand(newHand);
      setDeck(newDeck);

      if (calculateScore(newHand) > 21) {
        stand(playerHand, newHand, dealerHand, newDeck);
      }
    }
  };

  const surrender = () => {
    const returnAmount = bet / 2;
    setCredits(prev => prev + returnAmount);
    setMessage(`Surrendered. Returned ${returnAmount} credits.`);
    setGameState('betting');
    checkGameOver();
  };

  const split = () => {
    if (playerHand.length === 2 && getCardValue(playerHand[0].rank) === getCardValue(playerHand[1].rank) && credits >= bet) {
      setCredits(prev => prev - bet);
      setSplitBet(bet);
      const newDeck = [...deck];
      const hand1 = [playerHand[0], newDeck.shift()!];
      const hand2 = [playerHand[1], newDeck.shift()!];
      setPlayerHand(hand1);
      setSplitHand(hand2);
      setDeck(newDeck);
      setMessage('Playing first hand.');
    } else {
      setMessage('Cannot split.');
    }
  };

  const stand = (pHand = playerHand, sHand = splitHand, dHand = dealerHand, dck = deck) => {
    if (gameState === 'playing' && sHand.length > 0) {
      setGameState('playingSplit');
      setMessage('Playing split hand.');
      return;
    }

    setGameState('dealerTurn');
    let currentDealerHand = [...dHand];
    let currentDeck = [...dck];

    // Dealer only draws if at least one hand hasn't busted
    const pScore = calculateScore(pHand);
    const sScore = sHand.length > 0 ? calculateScore(sHand) : 0;
    
    if (pScore <= 21 || (sHand.length > 0 && sScore <= 21)) {
      while (calculateScore(currentDealerHand) < 17) {
        currentDealerHand.push(currentDeck.shift()!);
      }
    }

    setDealerHand(currentDealerHand);
    setDeck(currentDeck);

    const dScore = calculateScore(currentDealerHand);
    let totalWin = 0;
    let msg = '';

    // Evaluate Hand 1
    if (pScore > 21) {
      msg += 'Hand 1 Bust. ';
    } else if (dScore > 21 || pScore > dScore) {
      let win = bet * 2;
      if (pScore === 21 && pHand.length === 2 && sHand.length === 0) win = bet * 2.5;
      totalWin += win;
      msg += 'Hand 1 Win! ';
    } else if (pScore === dScore) {
      totalWin += bet;
      msg += 'Hand 1 Push. ';
    } else {
      msg += 'Hand 1 Lose. ';
    }

    // Evaluate Hand 2 (if split)
    if (sHand.length > 0) {
      if (sScore > 21) {
        msg += 'Hand 2 Bust.';
      } else if (dScore > 21 || sScore > dScore) {
        totalWin += splitBet * 2;
        msg += 'Hand 2 Win!';
      } else if (sScore === dScore) {
        totalWin += splitBet;
        msg += 'Hand 2 Push.';
      } else {
        msg += 'Hand 2 Lose.';
      }
    }

    setMessage(msg);
    if (totalWin > 0) {
      setTotalScore(prev => prev + totalWin);
    }
    setCredits(prev => prev + totalWin);
    setGameState('betting');
    
    checkGameOver(totalWin);
  };

  const checkGameOver = (winAmount = 0) => {
    if (credits + winAmount <= 0) {
      setGameState('gameOver');
      onGameEnd(totalScore + winAmount, Math.floor((totalScore + winAmount) / 10), (totalScore + winAmount) > 100);
    }
  };

  const renderCard = (card: Card, index: number, hidden: boolean = false) => {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

    return (
      <motion.div
        key={card.id}
        initial={{ x: -100, opacity: 0, rotate: -10 }}
        animate={{ x: 0, opacity: 1, rotate: 0 }}
        className={`relative w-16 h-24 md:w-24 md:h-36 rounded-lg border-2 border-neutral-300 bg-white shadow-xl`}
      >
        {hidden ? (
          <div className="absolute inset-0 bg-indigo-900 flex items-center justify-center rounded-lg overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, #fff 5px, #fff 10px)' }}></div>
            <img 
              src="/favicon.ico" 
              alt="Logo"
              className="w-6 h-6 md:w-8 md:h-8 object-contain opacity-40 z-10"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col p-1.5 md:p-2">
            <div className="flex justify-between items-start">
              <div className={`text-xs md:text-lg font-bold ${isRed ? 'text-red-600' : 'text-neutral-900'}`}>
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
              <Icon name={card.suit.slice(0, -1) as any} className={`w-6 h-6 md:w-12 md:h-12 ${isRed ? 'text-red-600' : 'text-neutral-900'}`} />
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  const canSplit = playerHand.length === 2 && getCardValue(playerHand[0].rank) === getCardValue(playerHand[1].rank) && credits >= bet && splitHand.length === 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] p-4 bg-emerald-950/20 rounded-3xl border border-emerald-500/10 relative overflow-y-auto">
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
        {/* Dealer Area */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-[10px] text-emerald-500/50 font-black uppercase tracking-widest">Dealer Hand ({gameState === 'playing' || gameState === 'playingSplit' ? '?' : calculateScore(dealerHand)})</div>
          <div className="flex justify-center gap-2 min-h-[144px]">
            {dealerHand.map((card, index) => renderCard(card, index, (gameState === 'playing' || gameState === 'playingSplit') && index === 1))}
          </div>
        </div>

        {/* Info Bar */}
        <div className="flex justify-between items-center bg-black/40 p-4 rounded-2xl border border-white/5">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Credits</span>
            <span className="text-xl md:text-2xl font-mono text-brand-primary">{credits}</span>
          </div>
          <div className="text-center flex-1 px-4">
            <div className="text-sm md:text-lg font-medium text-white">{message}</div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Bet</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setBet(Math.max(5, bet - 5))} disabled={gameState !== 'betting'} className="w-6 h-6 flex items-center justify-center rounded bg-white/5">-</button>
              <span className="text-xl font-mono text-white">{bet}</span>
              <button onClick={() => setBet(Math.min(50, bet + 5))} disabled={gameState !== 'betting'} className="w-6 h-6 flex items-center justify-center rounded bg-white/5">+</button>
            </div>
          </div>
        </div>

        {/* Player Area */}
        <div className="flex flex-col md:flex-row justify-center gap-8">
          <div className={`flex flex-col items-center gap-2 transition-all ${gameState === 'playing' ? 'scale-105' : 'opacity-80'}`}>
            <div className="flex justify-center gap-2 min-h-[144px]">
              {playerHand.map((card, index) => renderCard(card, index))}
            </div>
            <div className="text-[10px] text-brand-primary font-black uppercase tracking-widest">Hand 1 ({calculateScore(playerHand)})</div>
          </div>

          {splitHand.length > 0 && (
            <div className={`flex flex-col items-center gap-2 transition-all ${gameState === 'playingSplit' ? 'scale-105' : 'opacity-80'}`}>
              <div className="flex justify-center gap-2 min-h-[144px]">
                {splitHand.map((card, index) => renderCard(card, index))}
              </div>
              <div className="text-[10px] text-brand-primary font-black uppercase tracking-widest">Hand 2 ({calculateScore(splitHand)})</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap justify-center gap-2 md:gap-4">
          {gameState === 'betting' && (
            <button onClick={deal} className="px-12 py-4 bg-brand-primary text-black font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all">DEAL</button>
          )}
          {(gameState === 'playing' || gameState === 'playingSplit') && (
            <>
              <button onClick={hit} className="px-6 py-3 bg-emerald-500 text-white font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all">HIT</button>
              <button onClick={() => stand()} className="px-6 py-3 bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all">STAND</button>
              {gameState === 'playing' && playerHand.length === 2 && splitHand.length === 0 && (
                <button onClick={surrender} className="px-6 py-3 bg-neutral-600 text-white font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all">SURRENDER</button>
              )}
              {gameState === 'playing' && canSplit && (
                <button onClick={split} className="px-6 py-3 bg-blue-500 text-white font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all">SPLIT</button>
              )}
            </>
          )}
          {gameState === 'gameOver' && (
            <button onClick={startNewGame} className="px-12 py-4 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all">RESTART</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlackjackGame;
