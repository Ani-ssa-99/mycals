// Source du fichier vendor/fb.js (Firebase modulaire, regroupé avec esbuild).
export { initializeApp } from "firebase/app";
export {
  getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, FacebookAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, signOut, deleteUser,
  connectAuthEmulator, setPersistence, indexedDBLocalPersistence, browserLocalPersistence,
} from "firebase/auth";
export {
  initializeFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit,
  getDocs, writeBatch, increment, serverTimestamp, getCountFromServer, startAfter, Timestamp,
} from "firebase/firestore";
