// Configuration Firebase (valeurs publiques, elles ne sont pas secrètes : la sécurité est assurée par firestore.rules).
// Tant que FIREBASE_CONFIG vaut null, l'appli fonctionne sans compte ni communauté.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCXNY-gFh9dDmo6CT0c3nj04bDjXC0Ftek",
  authDomain: "mycals-13067.firebaseapp.com",
  projectId: "mycals-13067",
  storageBucket: "mycals-13067.firebasestorage.app",
  messagingSenderId: "386430441449",
  appId: "1:386430441449:web:d9e6d1d7b05efef8cc5d78",
};

// Connexions proposées sur l'écran d'accueil.
export const PROVIDERS = { google: true, facebook: false, email: true };

// Utilise les émulateurs locaux (tests) si l'URL contient ?emu
export const USE_EMULATORS = typeof location !== "undefined" && new URLSearchParams(location.search).has("emu");
export const EMULATOR_CONFIG = { apiKey: "demo-key", authDomain: "demo-mycals.firebaseapp.com", projectId: "demo-mycals", appId: "demo" };
