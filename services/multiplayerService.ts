import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface GameInvitation {
  id?: string;
  fromId: string;
  fromName: string;
  toId: string;
  gameType: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
}

export interface GameSession {
  id?: string;
  gameType: string;
  playerIds: string[];
  players: {
    [uid: string]: {
      name: string;
      status: 'online' | 'offline';
      state: any;
    }
  };
  status: 'waiting' | 'playing' | 'ended';
  lastUpdate: Timestamp;
}

export const sendGameInvitation = async (fromId: string, fromName: string, toId: string, gameType: string) => {
  return await addDoc(collection(db, 'game_invitations'), {
    fromId,
    fromName,
    toId,
    gameType,
    status: 'pending',
    createdAt: serverTimestamp()
  });
};

export const listenToInvitations = (userId: string, callback: (invitations: GameInvitation[]) => void) => {
  const q = query(
    collection(db, 'game_invitations'),
    where('toId', '==', userId),
    where('status', '==', 'pending')
  );

  return onSnapshot(q, (snapshot) => {
    const invitations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameInvitation));
    callback(invitations);
  });
};

export const respondToInvitation = async (invitationId: string, status: 'accepted' | 'declined') => {
  const invRef = doc(db, 'game_invitations', invitationId);
  await updateDoc(invRef, { status });
};

export const createGameSession = async (gameType: string, player1: { uid: string, name: string }, player2: { uid: string, name: string }) => {
  const sessionData: Omit<GameSession, 'id'> = {
    gameType,
    playerIds: [player1.uid, player2.uid],
    players: {
      [player1.uid]: { name: player1.name, status: 'online', state: {} },
      [player2.uid]: { name: player2.name, status: 'online', state: {} }
    },
    status: 'waiting',
    lastUpdate: serverTimestamp() as Timestamp
  };
  return await addDoc(collection(db, 'game_sessions'), sessionData);
};

export const listenToGameSession = (sessionId: string, callback: (session: GameSession) => void) => {
  return onSnapshot(doc(db, 'game_sessions', sessionId), (doc) => {
    if (doc.exists()) {
      callback({ id: doc.id, ...doc.data() } as GameSession);
    }
  });
};

export const updateGameState = async (sessionId: string, userId: string, state: any) => {
  const sessionRef = doc(db, 'game_sessions', sessionId);
  await updateDoc(sessionRef, {
    [`players.${userId}.state`]: state,
    lastUpdate: serverTimestamp()
  });
};

export const endSession = async (sessionId: string) => {
  await updateDoc(doc(db, 'game_sessions', sessionId), {
    status: 'ended',
    lastUpdate: serverTimestamp()
  });
};
