import { doc, getDoc, setDoc, updateDoc, increment, collection, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface ChillProfile {
  uid: string;
  displayName?: string;
  avatarUrl?: string | null;
  email?: string;
  xp: number;
  dailyProgress: number; // 0 to 10
  lastPlayedDate: string; // YYYY-MM-DD
  intisEarnedToday: number; // 0 or 1
  bestScores: {
    dinoRun: number;
    neonSnake: number;
    neonTetris?: number;
    brickBreaker?: number;
    goatKong?: number;
    flappyGoat?: number;
    '2048'?: number;
    memoryMatch?: number;
    whackAMole?: number;
    pacman?: number;
    sudoku?: number;
    towerStack?: number;
    goatSniper?: number;
    superGoatBros?: number;
    goatInvaders?: number;
    goatRacer?: number;
    chess?: number;
    pianoMaster?: number;
    poker?: number;
    blackjack?: number;
    solitaire?: number;
    wordSearch?: number;
    crossword?: number;
  };
  streak: number;
}

const getTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getChillProfile = async (uid: string): Promise<ChillProfile> => {
  const docRef = doc(db, 'chill_profiles', uid);
  const docSnap = await getDoc(docRef);
  
  const today = getTodayString();

  if (docSnap.exists()) {
    const data = docSnap.data() as ChillProfile;
    // Reset daily progress if it's a new day
    if (data.lastPlayedDate !== today) {
      // Check streak
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const newStreak = data.lastPlayedDate === yesterdayStr ? data.streak : 0;
      
      const resetData = {
        ...data,
        dailyProgress: 0,
        intisEarnedToday: 0,
        lastPlayedDate: today,
        streak: newStreak
      };
      await updateDoc(docRef, {
        dailyProgress: 0,
        intisEarnedToday: 0,
        lastPlayedDate: today,
        streak: newStreak
      });
      return resetData;
    }
    return data;
  } else {
    const newProfile: ChillProfile = {
      uid,
      xp: 0,
      dailyProgress: 0,
      lastPlayedDate: today,
      intisEarnedToday: 0,
      bestScores: { dinoRun: 0, neonSnake: 0 },
      streak: 0
    };
    await setDoc(docRef, newProfile);
    return newProfile;
  }
};


export const syncChillIdentity = async (uid: string, identity: { displayName?: string; avatarUrl?: string | null; email?: string }) => {
  if (!uid) return;
  const cleanName = (identity.displayName || identity.email?.split('@')[0] || 'Jugador Goatify').trim();
  const docRef = doc(db, 'chill_profiles', uid);
  await setDoc(docRef, {
    uid,
    displayName: cleanName,
    avatarUrl: identity.avatarUrl || null,
    email: identity.email || '',
    identityUpdatedAt: serverTimestamp()
  }, { merge: true });
};

export const addChillProgress = async (uid: string, game: 'dinoRun' | 'neonSnake' | 'neonTetris' | 'brickBreaker' | 'goatKong' | 'flappyGoat' | '2048' | 'memoryMatch' | 'whackAMole' | 'pacman' | 'sudoku' | 'towerStack' | 'goatSniper' | 'superGoatBros' | 'goatInvaders' | 'goatRacer' | 'chess' | 'pianoMaster' | 'poker' | 'blackjack' | 'solitaire' | 'wordSearch' | 'crossword', score: number, xpGained: number, hitMilestone: boolean = false) => {
  const profile = await getChillProfile(uid);
  const today = getTodayString();
  
  let newProgress = profile.dailyProgress;
  let earnedInti = false;

  // If they haven't earned their Inti today and haven't maxed progress
  if (hitMilestone && profile.intisEarnedToday < 1 && profile.dailyProgress < 10) {
    newProgress += 1;
    if (newProgress >= 10) {
      earnedInti = true;
    }
  }

  const newBestScore = Math.max(profile.bestScores[game] || 0, score);
  
  const updates: any = {
    xp: increment(xpGained),
    dailyProgress: newProgress,
    [`bestScores.${game}`]: newBestScore,
    lastPlayedDate: today,
    streak: profile.streak === 0 ? 1 : profile.streak // ensure at least 1 if they played today
  };

  if (earnedInti) {
    updates.intisEarnedToday = 1;
    // Award the Inti to the main user profile
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { intis: increment(1) });
  }

  await updateDoc(doc(db, 'chill_profiles', uid), updates);

  return {
    earnedInti,
    newProgress,
    newXp: profile.xp + xpGained,
    isNewBest: newBestScore > profile.bestScores[game]
  };
};

export const getGlobalLeaderboard = async (game: 'dinoRun' | 'neonSnake' | 'neonTetris' | 'brickBreaker' | 'goatKong' | 'flappyGoat' | '2048' | 'memoryMatch' | 'whackAMole' | 'pacman' | 'sudoku' | 'towerStack' | 'goatSniper' | 'superGoatBros' | 'goatInvaders' | 'goatRacer' | 'chess' | 'pianoMaster' | 'poker' | 'blackjack' | 'solitaire' | 'wordSearch' | 'crossword') => {
  const q = query(
    collection(db, 'chill_profiles'),
    orderBy(`bestScores.${game}`, 'desc'),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => {
    const data = doc.data();
    return {
      uid: doc.id,
      score: data.bestScores?.[game] || 0,
      xp: data.xp || 0,
      displayName: data.displayName || data.email?.split('@')?.[0] || '',
      avatarUrl: data.avatarUrl || null
    };
  });
};
