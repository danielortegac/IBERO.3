export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}-${suit}-${Math.random().toString(36).substr(2, 9)}` });
    }
  }
  return shuffle(deck);
}

export function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export function getCardValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank);
}

export function getPokerHandValue(hand: Card[]): { rank: number; name: string; score: number } {
  const rankValues: { [key in Rank]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };

  const sortedHand = [...hand].sort((a, b) => rankValues[b.rank] - rankValues[a.rank]);
  const counts: { [key: string]: number } = {};
  const suitCounts: { [key: string]: number } = {};

  sortedHand.forEach(card => {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  });

  const isFlush = Object.values(suitCounts).some(count => count >= 5);
  const ranks = sortedHand.map(c => rankValues[c.rank]);
  
  // Check for straight
  let isStraight = false;
  let straightHigh = 0;
  const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => b - a);
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[i];
      break;
    }
  }
  // Ace-low straight
  if (!isStraight && uniqueRanks.includes(14) && uniqueRanks.includes(2) && uniqueRanks.includes(3) && uniqueRanks.includes(4) && uniqueRanks.includes(5)) {
    isStraight = true;
    straightHigh = 5;
  }

  const countValues = Object.values(counts).sort((a, b) => b - a);
  const pairs = Object.keys(counts).filter(rank => counts[rank] === 2);
  const trips = Object.keys(counts).filter(rank => counts[rank] === 3);
  const quads = Object.keys(counts).filter(rank => counts[rank] === 4);

  if (isFlush && isStraight && straightHigh === 14) return { rank: 10, name: 'Royal Flush', score: 800 };
  if (isFlush && isStraight) return { rank: 9, name: 'Straight Flush', score: 500 };
  if (quads.length > 0) return { rank: 8, name: 'Four of a Kind', score: 400 };
  if (trips.length > 0 && pairs.length > 0) return { rank: 7, name: 'Full House', score: 300 };
  if (isFlush) return { rank: 6, name: 'Flush', score: 200 };
  if (isStraight) return { rank: 5, name: 'Straight', score: 150 };
  if (trips.length > 0) return { rank: 4, name: 'Three of a Kind', score: 100 };
  if (pairs.length >= 2) return { rank: 3, name: 'Two Pair', score: 50 };
  if (pairs.length === 1 && (rankValues[pairs[0] as Rank] >= 11)) return { rank: 2, name: 'Jacks or Better', score: 20 };
  
  return { rank: 1, name: 'High Card', score: 0 };
}
