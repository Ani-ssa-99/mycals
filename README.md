# Mycals

Appli gratuite de suivi des calories, pensée pour perdre du poids.

**Lien de l'appli : https://ani-ssa-99.github.io/mycals/**

## Fonctions
- 📸 **Photo du repas** : l'IA (Google Gemini) reconnaît les aliments, estime les portions et les calories. Tu ajustes les grammes avant d'ajouter.
- 🏷️ **Scan de code-barres** : caméra en direct, produits de la base libre Open Food Facts (millions de produits, Nutri-Score).
- 🔎 **Recherche** : ~160 aliments courants intégrés + Open Food Facts. Récents et « Mes aliments ».
- 💬 **Décrire un repas** en texte (« 2 œufs et une tartine beurrée »).
- 🎯 **Objectif personnalisé** : métabolisme (Mifflin-St Jeor) × activité, moins un déficit selon le rythme choisi (0,25 / 0,5 / 0,75 kg par semaine), jamais sous 1 200 kcal (femme) / 1 500 kcal (homme). Protéines, glucides, lipides.
- 📈 **Progrès** : courbe de poids, calories des 7 derniers jours, série de jours suivis, date estimée d'atteinte de l'objectif.
- 💧 Eau, copie du repas d'hier, mode sombre, fonctionne hors ligne, sauvegarde/restauration.

## Installer (gratuit, sans store)
- **iPhone** : ouvrir le lien dans Safari → bouton Partager → « Sur l'écran d'accueil ».
- **Android** : ouvrir dans Chrome → menu ⋮ → « Installer l'application ».

## Reconnaissance photo : clé gratuite
Chaque personne crée sa propre clé sur https://aistudio.google.com/apikey (compte Google, pas de carte bancaire) et la colle dans Profil. La clé reste sur le téléphone.

## Vie privée
Aucun serveur : toutes les données restent dans le navigateur du téléphone. Seules les photos analysées partent vers Google Gemini, et les codes-barres vers Open Food Facts.

## Technique
Site statique (HTML/CSS/JS sans framework), PWA avec service worker. Lecture des codes-barres : API native `BarcodeDetector` quand elle existe (Android), sinon ZXing en WebAssembly (`vendor/`, généré depuis `tools/barcode-entry.js` avec `barcode-detector@3.2.2` et esbuild).
