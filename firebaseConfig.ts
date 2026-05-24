
// firebaseConfig.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCM8J-Ih7e4bRyWOXEuoQjskSGb6E3jNoA",
  authDomain: "goatify-app-ia.firebaseapp.com",
  projectId: "goatify-app-ia",
  storageBucket: "goatify-app-ia.firebasestorage.app",
  messagingSenderId: "1081398514369",
  appId: "1:1081398514369:web:3872e15bc5dff5a0967a40",
  measurementId: "G-77PQ7L8Z8Q"
};


// Initialize Firebase robustly
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize and export services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not supported by browser');
    }
});

export const storage = getStorage(app);
