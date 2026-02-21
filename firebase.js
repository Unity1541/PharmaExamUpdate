
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  onSnapshot,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- IMPORTANT: FIREBASE CONFIGURATION ---
// 請將下方的預留位置 ("YOUR_...") 替換成您自己的 Firebase 專案設定。
// 您可以在 Firebase 專案的「專案設定」頁面中找到這些資訊。
const firebaseConfig = {
  apiKey: "AIzaSyBMs8KL7-4I3c-uEgvsnABcy1cCaYxHhPo",
  authDomain: "upgradeexam-1623f.firebaseapp.com",
  projectId: "upgradeexam-1623f",
  storageBucket: "upgradeexam-1623f.firebasestorage.app",
  messagingSenderId: "226906643871",
  appId: "1:226906643871:web:5b3b40d3fc69e3e9bab1aa",
};

// --- INITIALIZATION ---
let app;
let auth = null; // Default to null
let db = null; // Default to null for Firestore

// We only initialize if the config is not a placeholder, to avoid runtime errors from Firebase SDK.
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app); // Initialize Firestore
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    // auth and db remain null
  }
}

// --- EXPORTS ---
// Export the auth and db objects (which will be null if initialization fails)
// and the auth/firestore methods for use in other files.
export {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  onSnapshot,
  getCountFromServer,
};
