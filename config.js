// Configuration Firebase (valeurs publiques, elles ne sont pas secrètes : la sécurité est assurée par firestore.rules).
// Tant que FIREBASE_CONFIG vaut null, l'appli fonctionne sans compte ni communauté.
export const FIREBASE_CONFIG = null;

// Connexions proposées sur l'écran d'accueil.
export const PROVIDERS = { google: true, facebook: true, email: true };

// Utilise les émulateurs locaux (tests) si l'URL contient ?emu
export const USE_EMULATORS = typeof location !== "undefined" && new URLSearchParams(location.search).has("emu");
export const EMULATOR_CONFIG = { apiKey: "demo-key", authDomain: "demo-mycals.firebaseapp.com", projectId: "demo-mycals", appId: "demo" };
