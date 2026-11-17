// Comptes (Firebase Auth), sauvegarde en ligne et communauté (Firestore).
import { FIREBASE_CONFIG, USE_EMULATORS, EMULATOR_CONFIG } from "./config.js";

export const cloudEnabled = !!(FIREBASE_CONFIG || USE_EMULATORS);
let F, app, auth, db;
let readyP;

export function initCloud() {
  if (!cloudEnabled) return Promise.resolve(null);
  readyP ||= (async () => {
    F = await import("./vendor/fb.js");
    app = F.initializeApp(USE_EMULATORS ? EMULATOR_CONFIG : FIREBASE_CONFIG);
    auth = F.getAuth(app);
    auth.languageCode = "fr";
    db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
    if (USE_EMULATORS) {
      F.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      F.connectFirestoreEmulator(db, "127.0.0.1", 8081);
    }
    try { await F.getRedirectResult(auth); } catch {}
    return auth;
  })();
  return readyP;
}

export function onUser(cb) { initCloud().then(a => (a ? F.onAuthStateChanged(a, cb) : cb(null))); }
export const currentUser = () => auth?.currentUser || null;

function authError(e) {
  const c = e?.code || "";
  const map = {
    "auth/invalid-email": "Adresse e-mail invalide.",
    "auth/missing-password": "Entre un mot de passe.",
    "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
    "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail. Connecte-toi.",
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/wrong-password": "E-mail ou mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte avec cet e-mail.",
    "auth/too-many-requests": "Trop d'essais. Réessaie dans quelques minutes.",
    "auth/popup-closed-by-user": "Connexion annulée.",
    "auth/cancelled-popup-request": "Connexion annulée.",
    "auth/account-exists-with-different-credential": "Cet e-mail est déjà utilisé avec un autre mode de connexion (Google, Facebook ou e-mail).",
    "auth/network-request-failed": "Pas de connexion internet.",
    "auth/unauthorized-domain": "Ce site n'est pas encore autorisé dans Firebase.",
    "auth/operation-not-allowed": "Ce mode de connexion n'est pas encore activé.",
    "auth/requires-recent-login": "Pour ta sécurité, reconnecte-toi puis réessaie.",
  };
  const err = new Error(map[c] || e?.message || "Erreur de connexion");
  err.code = c; return err;
}

export async function signInProvider(name) {
  await initCloud();
  const provider = name === "facebook" ? new F.FacebookAuthProvider() : new F.GoogleAuthProvider();
  if (name === "facebook") provider.addScope("email");
  else provider.setCustomParameters({ prompt: "select_account" });
  try { return (await F.signInWithPopup(auth, provider)).user; }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await F.signInWithRedirect(auth, provider); return null;
    }
    throw authError(e);
  }
}
export async function signUpEmail(email, password, name) {
  await initCloud();
  try {
    const { user } = await F.createUserWithEmailAndPassword(auth, email, password);
    if (name) await F.updateProfile(user, { displayName: name });
    return user;
  } catch (e) { throw authError(e); }
}
export async function signInEmail(email, password) {
  await initCloud();
  try { return (await F.signInWithEmailAndPassword(auth, email, password)).user; } catch (e) { throw authError(e); }
}
export async function resetPassword(email) {
  await initCloud();
  try { await F.sendPasswordResetEmail(auth, email); } catch (e) { throw authError(e); }
}
export async function logOut() { await initCloud(); await F.signOut(auth); }

/* ----- Sauvegarde du journal ----- */
export async function loadBackup(uid) {
  const s = await F.getDoc(F.doc(db, "users", uid, "private", "backup"));
  return s.exists() ? JSON.parse(s.data().json || "null") : null;
}
let backupTimer;
export function scheduleBackup(uid, state) {
  if (!db || !uid) return;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    const copy = JSON.parse(JSON.stringify(state));
    copy.settings.geminiKey = ""; // la clé reste sur le téléphone
    Object.values(copy.days || {}).forEach(d => d.entries?.forEach(e => delete e.thumb));
    let json = JSON.stringify(copy);
    if (json.length > 900000) { copy.days = Object.fromEntries(Object.entries(copy.days).sort().slice(-200)); json = JSON.stringify(copy); }
    F.setDoc(F.doc(db, "users", uid, "private", "backup"), { json, at: F.serverTimestamp() }).catch(() => {});
  }, 2500);
}

/* ----- Profils ----- */
export async function getProfile(uid) {
  const s = await F.getDoc(F.doc(db, "profiles", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}
export async function ensureProfile(user) {
  const p = await getProfile(user.uid);
  if (p) return p;
  const name = (user.displayName || (user.email || "Membre").split("@")[0]).slice(0, 40);
  const data = { name, photo: user.photoURL || "", bio: "", createdAt: F.serverTimestamp() };
  await F.setDoc(F.doc(db, "profiles", user.uid), data);
  return { uid: user.uid, ...data };
}
export async function saveProfile(uid, { name, bio, photo }) {
  await F.setDoc(F.doc(db, "profiles", uid), { name: name.slice(0, 40), bio: (bio || "").slice(0, 160), photo: photo || "" }, { merge: true });
}
export async function profileStats(uid) {
  const [posts, followers, following] = await Promise.all([
    F.getCountFromServer(F.query(F.collection(db, "posts"), F.where("uid", "==", uid))),
    F.getCountFromServer(F.query(F.collection(db, "follows"), F.where("to", "==", uid))),
    F.getCountFromServer(F.query(F.collection(db, "follows"), F.where("from", "==", uid))),
  ]);
  return { posts: posts.data().count, followers: followers.data().count, following: following.data().count };
}
export async function searchMembers(text) {
  const snap = await F.getDocs(F.query(F.collection(db, "profiles"), F.orderBy("createdAt", "desc"), F.limit(200)));
  const n = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = n(text);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(p => !q || n(p.name).includes(q)).slice(0, 40);
}

/* ----- Abonnements ----- */
export async function myFollowing(uid) {
  const s = await F.getDocs(F.query(F.collection(db, "follows"), F.where("from", "==", uid)));
  return s.docs.map(d => d.data().to);
}
export async function follow(me, other) { await F.setDoc(F.doc(db, "follows", `${me}_${other}`), { from: me, to: other, at: F.serverTimestamp() }); }
export async function unfollow(me, other) { await F.deleteDoc(F.doc(db, "follows", `${me}_${other}`)); }

/* ----- Publications ----- */
const toPost = d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || new Date() });
export async function feed({ uids } = {}) {
  if (uids) {
    if (!uids.length) return [];
    const chunks = []; for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
    const res = await Promise.all(chunks.map(c => F.getDocs(F.query(F.collection(db, "posts"), F.where("uid", "in", c), F.limit(60)))));
    return res.flatMap(s => s.docs.map(toPost)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
  }
  const s = await F.getDocs(F.query(F.collection(db, "posts"), F.orderBy("createdAt", "desc"), F.limit(60)));
  return s.docs.map(toPost);
}
export async function postsOf(uid) {
  const s = await F.getDocs(F.query(F.collection(db, "posts"), F.where("uid", "==", uid), F.limit(60)));
  return s.docs.map(toPost).sort((a, b) => b.createdAt - a.createdAt);
}
export async function createPost(user, profile, { kind, text, image }) {
  const ref = F.doc(F.collection(db, "posts"));
  await F.setDoc(ref, { uid: user.uid, name: profile.name, photo: profile.photo || "", kind, text: text.slice(0, 1000), image: image || "", likeCount: 0, commentCount: 0, createdAt: F.serverTimestamp() });
  return ref.id;
}
export async function deletePost(id) { await F.deleteDoc(F.doc(db, "posts", id)); }
export async function likedSet(uid, posts) {
  const res = await Promise.all(posts.map(p => F.getDoc(F.doc(db, "posts", p.id, "likes", uid)).then(s => (s.exists() ? p.id : null)).catch(() => null)));
  return new Set(res.filter(Boolean));
}
export async function toggleLike(uid, postId, liked) {
  const b = F.writeBatch(db);
  const likeRef = F.doc(db, "posts", postId, "likes", uid);
  if (liked) b.delete(likeRef); else b.set(likeRef, { at: F.serverTimestamp() });
  b.update(F.doc(db, "posts", postId), { likeCount: F.increment(liked ? -1 : 1) });
  await b.commit();
}
export async function comments(postId) {
  const s = await F.getDocs(F.query(F.collection(db, "posts", postId, "comments"), F.orderBy("createdAt", "asc"), F.limit(200)));
  return s.docs.map(toPost);
}
export async function addComment(user, profile, postId, text) {
  const b = F.writeBatch(db);
  b.set(F.doc(F.collection(db, "posts", postId, "comments")), { uid: user.uid, name: profile.name, photo: profile.photo || "", text: text.slice(0, 500), createdAt: F.serverTimestamp() });
  b.update(F.doc(db, "posts", postId), { commentCount: F.increment(1) });
  await b.commit();
}
export async function deleteComment(postId, id) {
  const b = F.writeBatch(db);
  b.delete(F.doc(db, "posts", postId, "comments", id));
  b.update(F.doc(db, "posts", postId), { commentCount: F.increment(-1) });
  await b.commit();
}
export async function report(uid, { postId, commentId, targetUid, reason }) {
  await F.setDoc(F.doc(F.collection(db, "reports")), { by: uid, postId: postId || "", commentId: commentId || "", targetUid: targetUid || "", reason: (reason || "").slice(0, 300), at: F.serverTimestamp() });
}
export async function isAdmin(uid) { try { return (await F.getDoc(F.doc(db, "admins", uid))).exists(); } catch { return false; } }

/* ----- Blocages (liste privée) ----- */
export async function blockedList(uid) {
  const s = await F.getDocs(F.collection(db, "users", uid, "blocked"));
  return s.docs.map(d => d.id);
}
export async function block(uid, other) { await F.setDoc(F.doc(db, "users", uid, "blocked", other), { at: F.serverTimestamp() }); await unfollow(uid, other).catch(() => {}); }
export async function unblock(uid, other) { await F.deleteDoc(F.doc(db, "users", uid, "blocked", other)); }

/* ----- Suppression du compte ----- */
export async function deleteAccount(user) {
  const uid = user.uid;
  const mine = await postsOf(uid);
  for (const p of mine) await F.deleteDoc(F.doc(db, "posts", p.id)).catch(() => {});
  const fol = await F.getDocs(F.query(F.collection(db, "follows"), F.where("from", "==", uid)));
  for (const d of fol.docs) await F.deleteDoc(d.ref).catch(() => {});
  const fol2 = await F.getDocs(F.query(F.collection(db, "follows"), F.where("to", "==", uid)));
  for (const d of fol2.docs) await F.deleteDoc(d.ref).catch(() => {});
  for (const b of await blockedList(uid).catch(() => [])) await unblock(uid, b).catch(() => {});
  await F.deleteDoc(F.doc(db, "users", uid, "private", "backup")).catch(() => {});
  await F.deleteDoc(F.doc(db, "profiles", uid)).catch(() => {});
  try { await F.deleteUser(user); } catch (e) { throw authError(e); }
}
