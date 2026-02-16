/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 全域狀態管理模組
 */

// --- STATE MANAGEMENT ---

/**
 * 應用程式全域狀態
 */
export let state = {
  isLoading: false,
  isLoggedIn: false,
  currentUser: null,
  loginError: "",
  loginAsRole: "student",
  currentView: "login",
  subjects: [],
  categories: {},
  allQuestions: [],
  allStudents: [],
  selectedAdminSubject: null,
  selectedAdminCategory: null,
  selectedStudentIdForAnalytics: null,
  selectedStudentAnalyticsData: null,
  selectedBulkUploadSubject: null,
  selectedBulkUploadCategory: null,
  selectedFile: null,
  uploadStatus: "idle", // idle, success, error
  uploadMessage: "",
  selectedManualSubject: null,
  selectedManualCategory: null,
  selectedExamSubject: null,
  examState: null,
  reviewingExam: null,
  viewingBookmark: null,
  reviewingBookmarkedQuestionId: null,
  editingQuestion: null,
  editingUser: null,
  editingCategory: null,
  // Handwritten Assignment State
  assignments: [],
  currentAssignment: null,
  assignmentSubmissions: [],
  submissionDraft: null,
  gradingSubmission: null,
  // Bulletin Board State
  announcements: [],
  editingAnnouncement: null,
  addingAnnouncement: false,
  // Bookmark Filter State
  selectedBookmarkFilterSubject: null,
};

// Listeners for real-time updates
export let examHistoryListener = null;
export let adminStudentHistoryListener = null;

/**
 * 設定 examHistoryListener
 * @param {Function|null} listener 
 */
export function setExamHistoryListener(listener) {
  examHistoryListener = listener;
}

/**
 * 設定 adminStudentHistoryListener
 * @param {Function|null} listener 
 */
export function setAdminStudentHistoryListener(listener) {
  adminStudentHistoryListener = listener;
}

// Render function reference (will be set by main.js)
let renderFn = null;

/**
 * 設定渲染函數參照
 * @param {Function} fn 
 */
export function setRenderFunction(fn) {
  renderFn = fn;
}

/**
 * 更新應用程式狀態並觸發重新渲染
 * @param {Object} newState 
 */
export function setState(newState) {
  // Reset dependent states when parent state changes
  if (
    newState.selectedAdminSubject !== undefined &&
    newState.selectedAdminSubject !== state.selectedAdminSubject
  ) {
    newState.selectedAdminCategory = null;
  }
  if (
    newState.selectedBulkUploadSubject !== undefined &&
    newState.selectedBulkUploadSubject !== state.selectedBulkUploadSubject
  ) {
    newState.selectedBulkUploadCategory = null;
    newState.selectedFile = null;
    newState.uploadStatus = "idle";
    newState.uploadMessage = "";
  }
  if (
    newState.selectedManualSubject !== undefined &&
    newState.selectedManualSubject !== state.selectedManualSubject
  ) {
    newState.selectedManualCategory = null;
  }
  
  // Clear timer when navigating away from exam view
  if (
    newState.currentView &&
    newState.currentView !== "exam-taking" &&
    state.examState?.timerInterval
  ) {
    clearInterval(state.examState.timerInterval);
    if (newState.examState === undefined) {
      newState.examState = null;
    }
  }
  
  // Clean up admin listener if leaving analytics view
  if (
    newState.currentView &&
    newState.currentView !== "student-analytics" &&
    adminStudentHistoryListener
  ) {
    adminStudentHistoryListener();
    setAdminStudentHistoryListener(null);
  }

  // Merge state
  state = { ...state, ...newState };
  
  // Trigger render
  if (renderFn) {
    renderFn();
  }
}

/**
 * 設定載入狀態
 * @param {boolean} isLoading 
 */
export function setLoading(isLoading) {
  const indicator = document.getElementById("loading-indicator");
  if (indicator) {
    indicator.style.display = isLoading ? "flex" : "none";
  }
  state.isLoading = isLoading;
}
