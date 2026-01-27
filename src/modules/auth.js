/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 認證模組 - 登入/登出功能
 */

import { auth, signInWithEmailAndPassword, signOut } from "../firebase.js";
import { state, setState, setLoading, examHistoryListener, adminStudentHistoryListener, setExamHistoryListener, setAdminStudentHistoryListener } from "../state.js";

/**
 * 處理使用者登入
 * @param {Event} e 
 */
export async function handleLogin(e) {
  e.preventDefault();
  setLoading(true);
  setState({ loginError: "" });

  const email = e.target.email.value;
  const password = e.target.password.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    let message = "電子郵件或密碼錯誤。";
    if (
      error.code === "auth/user-not-found" ||
      error.code === "auth/wrong-password" ||
      error.code === "auth/invalid-credential"
    ) {
      message = "電子郵件或密碼錯誤，請檢查您的輸入。";
    }
    console.error("Firebase login error:", error.code);
    setState({ loginError: message });
  } finally {
    setLoading(false);
  }
}

/**
 * 處理使用者登出
 */
export function handleLogout() {
  if (examHistoryListener) {
    examHistoryListener();
    setExamHistoryListener(null);
  }
  if (adminStudentHistoryListener) {
    adminStudentHistoryListener();
    setAdminStudentHistoryListener(null);
  }
  signOut(auth).catch((error) => {
    console.error("Logout failed:", error);
    alert("登出時發生錯誤。");
  });
}
