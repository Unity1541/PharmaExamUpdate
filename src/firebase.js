/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Firebase 配置和匯出 - 作為模組的中繼層
 * 從原始 firebase.js 重新匯出所有需要的功能
 */

// 從原始 firebase.js 匯入並重新匯出
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
} from "../firebase.js";
