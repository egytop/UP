import {
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "./firebase.js";
import { OWNER_EMAIL, OWNER_USERNAME } from "./config.js";

export function normalizeLogin(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === OWNER_USERNAME || v === OWNER_EMAIL) return OWNER_EMAIL;
  return null;
}

export async function login(username, password) {
  const email = normalizeLogin(username);
  if (!email) throw new Error("اسم المستخدم غير صحيح.");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if ((credential.user.email || "").toLowerCase() !== OWNER_EMAIL) {
    await signOut(auth);
    throw new Error("غير مصرح لهذا الحساب بالدخول.");
  }
  return credential.user;
}

export async function logout() {
  await signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user && (user.email || "").toLowerCase() !== OWNER_EMAIL) {
      await signOut(auth);
      callback(null);
      return;
    }
    callback(user || null);
  });
}
