/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {
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
} from "./firebase.js";

window.addEventListener("DOMContentLoaded", () => {
  // --- STATE MANAGEMENT ---
  let state = {
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
    selectedExamSubject: null,
    examState: null,
    reviewingExam: null,
    viewingBookmark: null,
    reviewingBookmarkedQuestionId: null,
    editingQuestion: null,
    editingUser: null,
    // Handwritten Assignment State
    assignments: [],
    currentAssignment: null, // The assignment being taken by student
    assignmentSubmissions: [], // Submissions loaded for admin
    submissionDraft: null, // Current draft for student
    gradingSubmission: null, // The submission being graded by admin
  };

  let examHistoryListener = null; // Listener for logged-in student
  let adminStudentHistoryListener = null; // Listener for admin viewing a student

  // --- HELPER FUNCTIONS ---
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  // Unify Radar Chart Calculation Logic
  function calculateRadarData(examHistory) {
    if (!examHistory || examHistory.length === 0) return [];

    const subjectScores = {};
    const subjectCounts = {};

    examHistory.forEach((h) => {
      if (!subjectScores[h.subject]) {
        subjectScores[h.subject] = 0;
        subjectCounts[h.subject] = 0;
      }
      subjectScores[h.subject] += h.score;
      subjectCounts[h.subject]++;
    });

    return Object.keys(subjectScores).map((subj) => ({
      subject: subj,
      score: Math.round(subjectScores[subj] / subjectCounts[subj]),
    }));
  }

  const setState = (newState) => {
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
    // Correctly clear the timer only when navigating away from the exam view.
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
      adminStudentHistoryListener = null;
    }

    state = { ...state, ...newState };
    render();
  };

  // Expose setState globally for inline HTML event handlers
  window.setState = setState;

  const setLoading = (isLoading) => {
    const indicator = document.getElementById("loading-indicator");
    if (indicator) {
      indicator.style.display = isLoading ? "flex" : "none";
    }
    state.isLoading = isLoading;
  };

  // --- ICONS (SVG) ---
  const icons = {
    dashboard: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>`,
    exam: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002 2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>`,
    book: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.25278C12 6.25278 6.75 0.75 3.75 3.75C0.75 6.75 3.75 12 3.75 12C3.75 12 0.75 17.25 3.75 20.25C6.75 23.25 12 17.7472 12 17.7472C12 17.7472 17.25 23.25 20.25 20.25C23.25 17.25 20.25 12 20.25 12C20.25 12 23.25 6.75 20.25 3.75C17.25 0.75 12 6.25278 12 6.25278Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
    arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>`,
    arrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-left" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    bookmark: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>`,
    bookmarkSolid: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clip-rule="evenodd" /></svg>`,
    levelUp: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6l-3.75 3.75M12 6v13.5m0-13.5L15.75 9.75M12 6H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H12z" /></svg>`,
    chart: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h12M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-12a2.25 2.25 0 01-2.25-2.25V3M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12l-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5" /></svg>`,
    edit: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>`,
    upload: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>`,
    users: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.663l.005-.004c.85-.113 1.658-.312 2.397-.599M12 8.25a4.125 4.125 0 110-8.25 4.125 4.125 0 010 8.25z" /></svg>`,
    delete: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`,
    logout: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>`,
    analytics: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
    folder: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>`,
    history: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-11.664 0l4.992-4.993m-4.993 0l-3.181 3.183a8.25 8.25 0 000 11.664l3.181 3.183" /></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`,
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>`,
  };

  // --- FIREBASE AUTHENTICATION & DATA HANDLERS ---
  async function handleLogin(e) {
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

  function handleLogout() {
    if (examHistoryListener) {
      examHistoryListener();
      examHistoryListener = null;
    }
    if (adminStudentHistoryListener) {
      adminStudentHistoryListener();
      adminStudentHistoryListener = null;
    }
    signOut(auth).catch((error) => {
      console.error("Logout failed:", error);
      alert("登出時發生錯誤。");
    });
  }

  async function handleAddSubject(e) {
    e.preventDefault();
    setLoading(true);
    const form = e.target;
    const subjectName = form.subjectName.value.trim();
    const description = form.description.value.trim();

    if (!subjectName || !description) {
      alert("請填寫所有欄位。");
      setLoading(false);
      return;
    }

    if (
      state.subjects.some(
        (s) => s.name.toLowerCase() === subjectName.toLowerCase()
      )
    ) {
      alert("該科目名稱已存在。");
      setLoading(false);
      return;
    }

    try {
      const subjectsCollection = collection(db, "subjects");
      const newDocRef = await addDoc(subjectsCollection, {
        name: subjectName,
        description: description,
      });

      const newSubject = {
        id: newDocRef.id,
        name: subjectName,
        description: description,
      };

      setState({
        subjects: [...state.subjects, newSubject].sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
        categories: { ...state.categories, [subjectName]: [] },
      });
      alert(`科目 "${subjectName}" 新增成功！`);
      form.reset();
    } catch (error) {
      console.error("Error adding subject:", error);
      alert(`新增科目失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    setLoading(true);
    const form = e.target;
    const subjectName = form.subject.value;
    const categoryName = form.categoryName.value.trim();
    const timeLimit = parseInt(form.timeLimit.value, 10);

    if (!subjectName || !categoryName || !timeLimit || timeLimit <= 0) {
      alert("請填寫所有欄位並確保時間限制為正數。");
      setLoading(false);
      return;
    }

    if (
      state.categories[subjectName] &&
      state.categories[subjectName].some(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      )
    ) {
      alert("該類別名稱已存在於此科目中。");
      setLoading(false);
      return;
    }

    try {
      const categoriesCollection = collection(db, "categories");
      const newDocRef = await addDoc(categoriesCollection, {
        name: categoryName,
        subject: subjectName,
        timeLimit: timeLimit,
      });

      const newCategory = {
        id: newDocRef.id,
        name: categoryName,
        subject: subjectName,
        timeLimit: timeLimit,
      };

      const updatedCategories = { ...state.categories };
      const subjectCategories = [
        ...(updatedCategories[subjectName] || []),
        newCategory,
      ];
      subjectCategories.sort((a, b) => a.name.localeCompare(b.name));
      updatedCategories[subjectName] = subjectCategories;

      setState({ categories: updatedCategories });

      alert(`類別 "${categoryName}" 新增成功！`);
      form.reset();
    } catch (error) {
      console.error("Error adding category:", error);
      alert(`新增類別失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSubject(id, name) {
    if (
      !confirm(
        `確定要刪除科目 "${name}" 嗎？\n這將同時刪除該科目下的所有類別。`
      )
    )
      return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "subjects", id));
      // Find and delete categories for this subject
      const q = query(
        collection(db, "categories"),
        where("subject", "==", name)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      const newSubjects = state.subjects.filter((s) => s.id !== id);
      const newCategories = { ...state.categories };
      delete newCategories[name];

      setState({ subjects: newSubjects, categories: newCategories });
    } catch (e) {
      console.error(e);
      alert("刪除失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCategory(id, subjectName) {
    if (!confirm("確定要刪除此類別嗎？")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "categories", id));
      const updatedSubjectCats = state.categories[subjectName].filter(
        (c) => c.id !== id
      );
      setState({
        categories: { ...state.categories, [subjectName]: updatedSubjectCats },
      });
    } catch (e) {
      console.error(e);
      alert("刪除失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateQuestion(e) {
    e.preventDefault();
    setLoading(true);
    const form = e.target;
    const q = state.editingQuestion;

    const updatedData = {
      text: form.questionText.value,
      options: [
        form.option1.value,
        form.option2.value,
        form.option3.value,
        form.option4.value,
      ],
      optionImages: [
        form.option1_img.value.trim() || null,
        form.option2_img.value.trim() || null,
        form.option3_img.value.trim() || null,
        form.option4_img.value.trim() || null,
      ],
      answer: form.answer.value,
      explanation: form.explanation.value,
      imgurl: form.imgurl.value.trim() || null,
    };

    try {
      await updateDoc(doc(db, "questions", q.id), updatedData);
      // Update local state
      const updatedAllQuestions = state.allQuestions.map((item) =>
        item.id === q.id ? { ...item, ...updatedData } : item
      );
      setState({ allQuestions: updatedAllQuestions, editingQuestion: null });
      alert("題目更新成功");
    } catch (err) {
      console.error(err);
      alert("更新失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteQuestion(id) {
    if (!confirm("確定要刪除此題目嗎？")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "questions", id));
      setState({ allQuestions: state.allQuestions.filter((q) => q.id !== id) });
    } catch (e) {
      console.error(e);
      alert("刪除失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkUpload() {
    if (
      !state.selectedFile ||
      !state.selectedBulkUploadSubject ||
      !state.selectedBulkUploadCategory
    ) {
      alert("請選擇科目、類別和檔案");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (!Array.isArray(json)) throw new Error("JSON 格式錯誤：應為陣列");

        setLoading(true);
        setState({ uploadStatus: "idle", uploadMessage: "上傳中..." });

        const batch = writeBatch(db);
        const questionsRef = collection(db, "questions");

        json.forEach((item) => {
          // Basic validation
          if (
            !item.text ||
            !item.options ||
            item.options.length !== 4 ||
            !item.answer
          ) {
            // skip invalid
            return;
          }
          const docRef = doc(questionsRef);
          batch.set(docRef, {
            ...item,
            subject: state.selectedBulkUploadSubject,
            category: state.selectedBulkUploadCategory,
            createdAt: new Date().toISOString(),
          });
        });

        await batch.commit();

        // Refresh questions
        const qs = await getDocs(collection(db, "questions"));
        const allQuestions = qs.docs.map((d) => ({ id: d.id, ...d.data() }));

        setState({
          allQuestions,
          uploadStatus: "success",
          uploadMessage: `成功上傳 ${json.length} 題`,
          selectedFile: null,
        });
      } catch (err) {
        console.error(err);
        setState({
          uploadStatus: "error",
          uploadMessage: "上傳失敗：" + err.message,
        });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(state.selectedFile);
  }

  async function handleUpdateUser(e) {
    e.preventDefault();
    setLoading(true);
    const u = state.editingUser;
    const newName = e.target.userName.value;

    try {
      await updateDoc(doc(db, "users", u.id), { name: newName });
      const updatedStudents = state.allStudents.map((s) =>
        s.id === u.id ? { ...s, name: newName } : s
      );
      setState({ allStudents: updatedStudents, editingUser: null });
      alert("使用者資料已更新");
    } catch (err) {
      console.error(err);
      alert("更新失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(id) {
    if (
      !confirm(
        "確定要刪除此使用者嗎？這將會一並刪除該使用者的所有測驗紀錄、收藏與作業資料。"
      )
    )
      return;
    setLoading(true);
    try {
      // 1. Delete Exam History
      const historyQ = query(
        collection(db, "examHistory"),
        where("userId", "==", id)
      );
      const historySnap = await getDocs(historyQ);
      const batch1 = writeBatch(db);
      historySnap.forEach((doc) => batch1.delete(doc.ref));
      await batch1.commit();

      // 2. Delete Bookmarks
      const bookmarkQ = query(
        collection(db, "bookmarkedQuestions"),
        where("userId", "==", id)
      );
      const bookmarkSnap = await getDocs(bookmarkQ);
      const batch2 = writeBatch(db);
      bookmarkSnap.forEach((doc) => batch2.delete(doc.ref));
      await batch2.commit();

      // 3. Delete Assignment Submissions
      const submissionQ = query(
        collection(db, "assignmentSubmissions"),
        where("userId", "==", id)
      );
      const submissionSnap = await getDocs(submissionQ);
      const batch3 = writeBatch(db);
      submissionSnap.forEach((doc) => batch3.delete(doc.ref));
      await batch3.commit();

      // 4. Delete User Profile
      await deleteDoc(doc(db, "users", id));

      setState({ allStudents: state.allStudents.filter((s) => s.id !== id) });
      alert("使用者及其所有相關資料已刪除");
    } catch (e) {
      console.error(e);
      alert("刪除失敗: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExamHistory(id) {
    if (!confirm("確定要刪除此紀錄嗎？")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "examHistory", id));

      // Manual State Update (Optimistic/Fallback)
      // Ensure UI updates immediately even if listener is slow
      if (state.selectedStudentAnalyticsData) {
        const newHistory =
          state.selectedStudentAnalyticsData.examHistory.filter(
            (h) => h.id !== id
          );
        const newRadar = calculateRadarData(newHistory);
        const newData = {
          ...state.selectedStudentAnalyticsData,
          examHistory: newHistory,
          radarChartData: newRadar,
        };
        setState({ selectedStudentAnalyticsData: newData });
      } else if (state.currentUser && state.currentUser.examHistory) {
        // Also handle case if user is deleting their own history (though usually blocked for students)
        const newHistory = state.currentUser.examHistory.filter(
          (h) => h.id !== id
        );
        const newRadar = calculateRadarData(newHistory);
        setState({
          currentUser: {
            ...state.currentUser,
            examHistory: newHistory,
            radarChartData: newRadar,
          },
        });
      }
    } catch (e) {
      console.error("Delete failed:", e);
      alert("刪除失敗：權限不足或資料庫錯誤");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBookmark(questionId, userId) {
    if (!confirm("移除此收藏？")) return;
    let bookmarkId = null;
    if (userId === state.currentUser.id) {
      const b = state.currentUser.bookmarkedQuestions.find(
        (bq) => bq.id === questionId
      );
      if (b) bookmarkId = b.bookmarkId;
    } else if (state.selectedStudentAnalyticsData) {
      const b = state.selectedStudentAnalyticsData.bookmarkedQuestions.find(
        (bq) => bq.id === questionId
      );
      if (b) bookmarkId = b.bookmarkId;
    }

    if (bookmarkId) {
      setLoading(true);
      try {
        await deleteDoc(doc(db, "bookmarkedQuestions", bookmarkId));
        if (userId === state.currentUser.id) {
          const newB = state.currentUser.bookmarkedQuestions.filter(
            (b) => b.bookmarkId !== bookmarkId
          );
          setState({
            currentUser: { ...state.currentUser, bookmarkedQuestions: newB },
          });
        } else {
          const newB =
            state.selectedStudentAnalyticsData.bookmarkedQuestions.filter(
              (b) => b.bookmarkId !== bookmarkId
            );
          setState({
            selectedStudentAnalyticsData: {
              ...state.selectedStudentAnalyticsData,
              bookmarkedQuestions: newB,
            },
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  }

  // --- HANDWRITTEN ASSIGNMENT FUNCTIONS ---
  async function handleAddAssignment(e) {
    e.preventDefault();
    setLoading(true);
    const form = e.target;

    // Extract multiple questions
    const questionBlocks = form.querySelectorAll(".question-block");
    const questions = [];
    let totalMaxScore = 0;

    questionBlocks.forEach((block) => {
      const text = block.querySelector('textarea[name="questionText"]').value;
      const image =
        block.querySelector('input[name="imageUrl"]').value.trim() || null;
      const score =
        parseInt(block.querySelector('input[name="maxScore"]').value, 10) || 0;
      if (text) {
        questions.push({ text, image, score });
        totalMaxScore += score;
      }
    });

    if (questions.length === 0) {
      alert("請至少新增一題題目");
      setLoading(false);
      return;
    }

    const assignmentData = {
      title: form.title.value.trim(),
      subject: form.subject.value,
      category: form.category.value || null, // Capture category
      questions: questions, // Store array of questions
      maxScore: totalMaxScore,
      createdAt: new Date().toISOString(),
    };

    try {
      const docRef = await addDoc(
        collection(db, "assignments"),
        assignmentData
      );
      const newAssignment = { id: docRef.id, ...assignmentData };

      setState({
        assignments: [...state.assignments, newAssignment],
        currentView: "admin-assignments",
      });
      alert("手寫作業題目新增成功！");
      // Remove dynamically added blocks manually
      document.getElementById("questions-container").innerHTML = "";
      // Re-add one empty block
      window.addAssignmentQuestionField();
      form.reset();
    } catch (error) {
      console.error("Error adding assignment:", error);
      alert("新增失敗: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAssignment(id) {
    if (!confirm("確定要刪除此作業嗎？這將無法復原。")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "assignments", id));
      setState({ assignments: state.assignments.filter((a) => a.id !== id) });
    } catch (e) {
      console.error(e);
      alert("刪除失敗: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignmentSubmit(status = "submitted") {
    if (!state.currentAssignment) return;
    if (
      status === "submitted" &&
      !confirm("確定要提交作業嗎？提交後無法修改。")
    )
      return;

    setLoading(true);

    // Collect answers from multiple editors
    const answers = [];
    const editorElements = document.querySelectorAll(".editor-area");
    editorElements.forEach((editor) => {
      answers.push(editor.innerHTML);
    });

    const submissionData = {
      assignmentId: state.currentAssignment.id,
      userId: state.currentUser.id,
      userName: state.currentUser.name,
      answers: answers, // Store array of HTML strings
      status: status,
      updatedAt: new Date().toISOString(),
    };

    try {
      const submissionsRef = collection(db, "assignmentSubmissions");
      let existingSubmission = state.submissionDraft;

      if (existingSubmission && existingSubmission.id) {
        await updateDoc(
          doc(db, "assignmentSubmissions", existingSubmission.id),
          submissionData
        );
      } else {
        const docRef = await addDoc(submissionsRef, {
          ...submissionData,
          createdAt: new Date().toISOString(),
        });
        existingSubmission = { ...submissionData, id: docRef.id };
      }

      if (status === "submitted") {
        alert("作業已提交！");
        setState({
          currentView: "handwritten-assignments",
          submissionDraft: null,
          currentAssignment: null,
        });
      } else {
        alert("草稿已儲存！");
        setState({ submissionDraft: existingSubmission });
      }
    } catch (error) {
      console.error("Submission error:", error);
      alert("儲存失敗: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminGradeSubmission(e) {
    e.preventDefault();
    setLoading(true);
    const form = e.target;
    const score = parseInt(form.score.value, 10);
    const feedback = form.feedback.value;
    const feedbackImageUrl = form.feedbackImageUrl.value.trim() || null;
    const submissionId = state.gradingSubmission.id;

    try {
      await updateDoc(doc(db, "assignmentSubmissions", submissionId), {
        score,
        feedback,
        feedbackImageUrl,
        status: "graded",
        gradedAt: new Date().toISOString(),
      });

      const updatedSubmissions = state.assignmentSubmissions.map((sub) =>
        sub.id === submissionId
          ? { ...sub, score, feedback, feedbackImageUrl, status: "graded" }
          : sub
      );

      setState({
        assignmentSubmissions: updatedSubmissions,
        currentView: "admin-grade-assignment",
        gradingSubmission: null,
      });
      alert("評分已完成並回傳給使用者！");
    } catch (error) {
      console.error("Grading error:", error);
      alert("評分儲存失敗: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  // --- EXAM LOGIC FUNCTIONS ---
  function startExam(subject, categoryName) {
    setLoading(true);
    const category = state.categories[subject].find(
      (c) => c.name === categoryName
    );
    if (!category) {
      alert("類別錯誤");
      setLoading(false);
      return;
    }

    // Filter questions
    const questions = state.allQuestions.filter(
      (q) => q.subject === subject && q.category === categoryName
    );
    if (questions.length === 0) {
      alert("此類別暫無題目");
      setLoading(false);
      return;
    }

    // Shuffle (Fisher-Yates)
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    // Init Exam State
    const examState = {
      subject,
      category: categoryName,
      questions,
      answers: {}, // { questionId: optionIndex }
      currentQuestionIndex: 0,
      startTime: new Date(),
      timeLeft: category.timeLimit * 60,
      timerInterval: setInterval(() => {
        // ** FIX: Update timer DOM directly instead of triggering full re-render **
        if (!state.examState) return;
        state.examState.timeLeft -= 1;

        const timerDisplay = document.getElementById("exam-timer-span");
        if (timerDisplay) {
          timerDisplay.textContent = formatTime(state.examState.timeLeft);
        }

        if (state.examState.timeLeft <= 0) {
          handleFinishExam();
        }
      }, 1000),
    };

    setState({ currentView: "exam-taking", examState });
    setLoading(false);
  }

  function handleAnswerSelection(questionId, optionIndex) {
    if (!state.examState) return;
    const newAnswers = {
      ...state.examState.answers,
      [questionId]: optionIndex,
    };
    setState({ examState: { ...state.examState, answers: newAnswers } });
  }

  function handleQuestionNavigation(direction) {
    if (!state.examState) return;
    const newIndex = state.examState.currentQuestionIndex + direction;
    if (newIndex >= 0 && newIndex < state.examState.questions.length) {
      setState({
        examState: { ...state.examState, currentQuestionIndex: newIndex },
      });
    }
  }

  function handleJumpToQuestion(index) {
    if (!state.examState) return;
    setState({
      examState: { ...state.examState, currentQuestionIndex: index },
    });
  }

  async function handleBookmarkToggle(questionId) {
    // Check if already bookmarked
    const existing = state.currentUser.bookmarkedQuestions.find(
      (q) => q.id === questionId
    );
    setLoading(true);
    try {
      if (existing) {
        await deleteDoc(doc(db, "bookmarkedQuestions", existing.bookmarkId));
        const newBookmarks = state.currentUser.bookmarkedQuestions.filter(
          (q) => q.id !== questionId
        );
        setState({
          currentUser: {
            ...state.currentUser,
            bookmarkedQuestions: newBookmarks,
          },
        });
      } else {
        const docRef = await addDoc(collection(db, "bookmarkedQuestions"), {
          userId: state.currentUser.id,
          questionId: questionId,
          createdAt: new Date().toISOString(),
        });
        const qDetails = state.allQuestions.find((q) => q.id === questionId);
        const newBookmarks = [
          ...state.currentUser.bookmarkedQuestions,
          { ...qDetails, bookmarkId: docRef.id },
        ];
        setState({
          currentUser: {
            ...state.currentUser,
            bookmarkedQuestions: newBookmarks,
          },
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Alias for review mode
  const handleReviewBookmarkToggle = handleBookmarkToggle;

  async function handleFinishExam() {
    if (!state.examState) return;
    clearInterval(state.examState.timerInterval);
    setLoading(true);

    const { questions, answers, subject, category } = state.examState;
    let correctCount = 0;
    questions.forEach((q) => {
      const userAns = answers[q.id]; // index 0-3
      // q.options[userAns] vs q.answer (text comparison)
      if (userAns !== undefined && q.options[userAns] === q.answer) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / questions.length) * 100);

    const historyData = {
      userId: state.currentUser.id,
      subject,
      category,
      score,
      totalQuestions: questions.length,
      correctCount,
      answers, // Store raw answers indices map
      questions: questions.map((q) => q.id), // Store question IDs to reconstruct if needed
      date: new Date().toISOString(),
    };

    try {
      const docRef = await addDoc(collection(db, "examHistory"), historyData);
      // Note: We don't need to manually update state.currentUser.examHistory here anymore because onSnapshot will handle it.
      // But to keep UI responsive immediately without waiting for network roundtrip, we can keep optimistic update or just wait.
      // Since we have an alert, waiting for snapshot is fine.

      setState({
        // We preserve currentUser but let snapshot update the history part
        // Actually, to prevent glitch, let's just clear exam state and wait for snapshot to update history list
        currentUser: state.currentUser,
        examState: null,
        currentView: "dashboard",
      });
      alert(`測驗結束！您的分數是: ${score}`);
    } catch (e) {
      console.error(e);
      alert("儲存成績失敗，請稍後再試");
      setState({ examState: null, currentView: "dashboard" });
    } finally {
      setLoading(false);
    }
  }

  // --- UI GENERATORS ---

  function createSidebarHTML() {
    if (!state.currentUser) return "";
    const { role, name } = state.currentUser;

    const navLinks =
      role === "student"
        ? `
            <a href="#" id="nav-dashboard" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView === "dashboard"
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined filled">dashboard</span>儀表板
            </a>
            <a href="#" id="nav-exam-selection" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView.startsWith("exam-")
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined">quiz</span>選擇考試
            </a>
            <a href="#" id="nav-handwritten" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView.startsWith("handwritten") ||
              state.currentView === "do-assignment"
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined">edit_square</span>手寫作業
            </a>
        `
        : `
            <a href="#" id="nav-user-management" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView === "user-management"
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined">group</span>使用者管理
            </a>
            <a href="#" id="nav-subject-management" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView === "subject-management"
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined">folder</span>科目管理
            </a>
            <a href="#" id="nav-question-editing" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView === "question-editing"
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined">edit</span>題目修改
            </a>
            <a href="#" id="nav-bulk-upload" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView === "bulk-upload"
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined">upload</span>題目上傳
            </a>
            <a href="#" id="nav-student-analytics" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView === "student-analytics"
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined">analytics</span>分數統計
            </a>
            <a href="#" id="nav-admin-assignments" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${
              state.currentView.startsWith("admin-") &&
              state.currentView.includes("assignment")
                ? "bg-peach/10 text-peach font-bold shadow-sm"
                : "text-coffee-light hover:bg-white hover:text-coffee hover:shadow-sm"
            } transition-all font-semibold">
                <span class="material-symbols-outlined">assignment_turned_in</span>作業管理
            </a>
        `;

    return `
            <div class="flex items-center gap-3 mb-10 px-2">
                <div class="w-10 h-10 rounded-xl bg-sage text-white flex items-center justify-center shadow-sm">
                    <span class="material-symbols-outlined font-bold">school</span>
                </div>
                <h1 class="text-xl font-bold text-coffee tracking-tight">ExamPilot <span class="text-peach">2.0</span></h1>
            </div>
            <nav class="space-y-3 flex-1">
                ${navLinks}
            </nav>
            <div class="mt-auto">
                <div class="bg-gradient-to-br from-cream to-white p-5 rounded-3xl border border-white shadow-sm text-center relative overflow-hidden group">
                    <div class="absolute top-0 right-0 w-20 h-20 bg-sun/20 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500"></div>
                    <div class="relative z-10 flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full border-4 border-white shadow-md overflow-hidden mb-3 flex items-center justify-center bg-sage/20 text-sage-dark font-bold text-lg">
                            ${name.charAt(0)}
                        </div>
                        <p class="font-bold text-coffee text-sm">${name}</p>
                        <p class="text-xs text-coffee-light mt-1">${
                          role === "student" ? "學生帳戶" : "管理員帳戶"
                        }</p>
                        <button id="logout-btn" class="mt-3 px-4 py-1.5 bg-coffee text-white text-xs font-bold rounded-lg hover:bg-peach transition-colors flex items-center justify-center gap-2 w-full">
                            <span class="material-symbols-outlined text-sm">logout</span>登出
                        </button>
                    </div>
                </div>
            </div>
        `;
  }

  // --- Login View ---
  function createLoginViewHTML() {
    const headerText =
      state.loginAsRole === "student" ? "學生登入" : "管理員登入";
    const buttonText = state.loginAsRole === "student" ? "登入" : "管理員登入";

    return `
        <div class="min-h-screen flex flex-col items-center justify-center p-4">
            <div class="w-full max-w-md">
                <!-- Login Card -->
                <div class="bg-white/85 backdrop-blur rounded-[2.5rem] shadow-card border border-white p-8">
                    <!-- Header -->
                    <div class="flex items-center gap-4 mb-8 justify-center">
                        <div class="w-12 h-12 rounded-xl bg-sage text-white flex items-center justify-center shadow-sm">
                            <span class="material-symbols-outlined font-bold text-lg">school</span>
                        </div>
                        <div>
                            <h1 class="text-2xl font-bold text-coffee tracking-tight">ExamPilot</h1>
                            <p class="text-xs text-coffee-light">考試系統</p>
                        </div>
                    </div>

                    <!-- Role Selector -->
                    <div class="flex gap-3 mb-8 bg-cream rounded-2xl p-1">
                        <button class="role-tab flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          state.loginAsRole === "student"
                            ? "bg-white text-coffee shadow-sm"
                            : "text-coffee-light hover:text-coffee"
                        }" data-role="student">
                            <span class="material-symbols-outlined text-base align-middle inline mr-1">person</span>學生
                        </button>
                        <button class="role-tab flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          state.loginAsRole === "admin"
                            ? "bg-white text-coffee shadow-sm"
                            : "text-coffee-light hover:text-coffee"
                        }" data-role="admin">
                            <span class="material-symbols-outlined text-base align-middle inline mr-1">admin_panel_settings</span>管理員
                        </button>
                    </div>

                    <!-- Form -->
                    <form id="login-form" class="space-y-5">
                        <div>
                            <label class="block text-sm font-bold text-coffee mb-2">電子郵件</label>
                            <input type="email" id="email" name="email" placeholder="請輸入電子郵件" required 
                                class="w-full px-4 py-3 rounded-xl border border-cream-dark bg-white focus:outline-none focus:border-peach focus:ring-4 focus:ring-peach/10 text-coffee placeholder-coffee-light/60 font-medium transition-all shadow-inner-soft">
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-coffee mb-2">密碼</label>
                            <input type="password" id="password" name="password" placeholder="請輸入密碼" required 
                                class="w-full px-4 py-3 rounded-xl border border-cream-dark bg-white focus:outline-none focus:border-peach focus:ring-4 focus:ring-peach/10 text-coffee placeholder-coffee-light/60 font-medium transition-all shadow-inner-soft">
                        </div>
                        
                        <div class="error-message min-h-6 text-red-500 text-sm font-medium">${
                          state.loginError
                        }</div>
                        
                        <button type="submit" class="w-full py-3.5 bg-peach hover:bg-peach-hover text-white rounded-xl text-base font-bold shadow-lg shadow-peach/30 transform hover:-translate-y-0.5 transition-all">
                            <span class="material-symbols-outlined align-middle text-lg inline mr-2">login</span>${buttonText}
                        </button>
                    </form>

                    <!-- Footer -->
                    <p class="text-center text-coffee-light text-xs mt-6">
                        <span class="material-symbols-outlined text-sm align-middle">lock</span> 登入資訊已加密保護
                    </p>
                </div>

                <!-- Decoration -->
                <div class="absolute bottom-0 right-0 w-64 h-64 bg-sage/5 rounded-full -mr-32 -mb-32 pointer-events-none"></div>
                <div class="absolute top-0 left-0 w-40 h-40 bg-peach/5 rounded-full -ml-20 -mt-20 pointer-events-none"></div>
            </div>
        </div>
        `;
  }

  // --- Dashboard View ---
  function createRadarChartView(data) {
    // Simple SVG Radar Chart
    if (!data || data.length === 0)
      return '<div class="radar-chart-container"><p>尚無數據</p></div>';

    // ** FIX: Increased size and adjusted padding to prevent text clipping **
    const size = 300;
    const center = size / 2;
    const radius = 90;
    const angleSlice = (Math.PI * 2) / data.length;

    // Background grid
    let gridHTML = "";
    for (let i = 1; i <= 4; i++) {
      let r = (radius / 4) * i;
      let points = [];
      for (let j = 0; j < data.length; j++) {
        const angle = j * angleSlice - Math.PI / 2;
        points.push(
          `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
        );
      }
      gridHTML += `<polygon points="${points.join(
        " "
      )}" class="radar-grid-line" />`;
    }

    // Data shape
    let dataPoints = [];
    let labelsHTML = "";
    data.forEach((d, i) => {
      const angle = i * angleSlice - Math.PI / 2;
      const r = (d.score / 100) * radius; // assuming score 0-100
      dataPoints.push(
        `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
      );

      // Label - positioned further out
      const labelR = radius + 30;
      const lx = center + labelR * Math.cos(angle);
      const ly = center + labelR * Math.sin(angle);
      labelsHTML += `<text x="${lx}" y="${ly}" class="radar-label">${d.subject}</text>`;
    });

    return `
            <div class="radar-chart-container">
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                    ${gridHTML}
                    <polygon points="${dataPoints.join(
                      " "
                    )}" class="radar-shape" />
                    ${labelsHTML}
                </svg>
            </div>
        `;
  }

  function createStudentDashboardViewHTML(user) {
    const examCount = user.examHistory ? user.examHistory.length : 0;
    const avgScore =
      examCount > 0
        ? Math.round(
            user.examHistory.reduce((acc, curr) => acc + curr.score, 0) /
              examCount
          )
        : 0;

    const historyItems = user.examHistory
      ? user.examHistory
          .slice(0, 5)
          .map(
            (h) => `
            <div class="flex items-center gap-4 p-4 rounded-2xl bg-[#fafdf9] border border-sage/20 hover:border-sage/50 transition-all cursor-pointer group">
                <div class="w-12 h-12 rounded-xl bg-white border border-sage/30 flex flex-col items-center justify-center text-sage-dark font-bold shadow-sm">
                    <span class="text-xs">分數</span>
                    <span class="text-lg leading-none">${h.score}</span>
                </div>
                <div class="flex-1">
                    <h4 class="font-bold text-coffee group-hover:text-sage-dark transition-colors">${
                      h.subject
                    } - ${h.category}</h4>
                    <p class="text-xs text-coffee-light mt-1 flex items-center gap-2">
                        <span class="material-symbols-outlined text-[10px]">calendar_today</span> ${new Date(
                          h.date
                        ).toLocaleDateString()}
                    </p>
                </div>
                <button class="px-3 py-1.5 rounded-lg bg-white border border-sage/30 text-xs font-bold text-sage-dark group-hover:bg-sage group-hover:text-white transition-all review-button" data-exam-id="${
                  h.id
                }">查看</button>
            </div>
        `
          )
          .join("")
      : "";

    const bookmarkItems = user.bookmarkedQuestions
      ? user.bookmarkedQuestions
          .map(
            (b) => `
            <div class="flex items-start gap-3 p-3 rounded-2xl bg-white border border-cream-dark hover:border-peach/50 hover:shadow-soft transition-all group clickable-bookmark cursor-pointer" onclick="window.openBookmarkDetail('${
              b.id
            }')">
                <div class="w-6 h-6 rounded-lg bg-lavender/20 text-purple-600 flex items-center justify-center flex-shrink-0 mt-1">
                    <span class="material-symbols-outlined text-sm">bookmark</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-coffee truncate">${
                      b.subject
                    }</p>
                    <p class="text-xs text-coffee-light truncate mt-1">${b.text.substring(
                      0,
                      60
                    )}...</p>
                </div>
                <button class="w-6 h-6 rounded-lg text-coffee-light hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors delete-bookmark-btn flex-shrink-0" data-question-id="${
                  b.id
                }" onclick="event.stopPropagation();" style="border:none; background:none; cursor:pointer;">
                    <span class="material-symbols-outlined text-sm">close</span>
                </button>
            </div>
        `
          )
          .join("")
      : "";

    return `
            <div class="w-full">
                <!-- Stats Cards Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                    <div class="bg-white p-5 rounded-[2rem] shadow-card hover:shadow-float transition-all duration-300 border border-white relative overflow-hidden group">
                        <div class="absolute -right-4 -top-4 w-20 h-20 bg-sage/10 rounded-full group-hover:scale-125 transition-transform"></div>
                        <div class="flex items-start justify-between mb-4">
                            <p class="text-sm font-bold text-coffee-light">已測驗次數</p>
                            <div class="w-10 h-10 rounded-full bg-sage/20 text-sage-dark flex items-center justify-center">
                                <span class="material-symbols-outlined">assignment_turned_in</span>
                            </div>
                        </div>
                        <div class="flex items-baseline gap-2">
                            <p class="text-4xl font-bold text-coffee">${examCount}</p>
                        </div>
                        <p class="text-xs text-coffee-light mt-2">總計</p>
                    </div>

                    <div class="bg-white p-5 rounded-[2rem] shadow-card hover:shadow-float transition-all duration-300 border border-white relative overflow-hidden group">
                        <div class="absolute -right-4 -top-4 w-20 h-20 bg-sky/10 rounded-full group-hover:scale-125 transition-transform"></div>
                        <div class="flex items-start justify-between mb-4">
                            <p class="text-sm font-bold text-coffee-light">平均分數</p>
                            <div class="w-10 h-10 rounded-full bg-sky/20 text-sky-700 flex items-center justify-center">
                                <span class="material-symbols-outlined">analytics</span>
                            </div>
                        </div>
                        <div class="flex items-baseline gap-2">
                            <p class="text-4xl font-bold text-coffee">${avgScore}</p>
                            <p class="text-xs font-bold text-sky-700 bg-sky/20 px-2 py-0.5 rounded-lg">${
                              examCount > 0 ? "及格" : "尚無"
                            }</p>
                        </div>
                        <div class="w-full bg-cream-dark rounded-full h-1.5 mt-3">
                            <div class="bg-sky h-1.5 rounded-full" style="width: ${Math.min(
                              avgScore,
                              100
                            )}%"></div>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-[2rem] shadow-card hover:shadow-float transition-all duration-300 border border-white relative overflow-hidden group">
                        <div class="absolute -right-4 -top-4 w-20 h-20 bg-peach/10 rounded-full group-hover:scale-125 transition-transform"></div>
                        <div class="flex items-start justify-between mb-4">
                            <p class="text-sm font-bold text-coffee-light">收藏題目</p>
                            <div class="w-10 h-10 rounded-full bg-peach/20 text-peach flex items-center justify-center">
                                <span class="material-symbols-outlined">bookmark</span>
                            </div>
                        </div>
                        <div class="flex items-baseline gap-2">
                            <p class="text-4xl font-bold text-coffee">${
                              user.bookmarkedQuestions
                                ? user.bookmarkedQuestions.length
                                : 0
                            }</p>
                        </div>
                        <p class="text-xs text-coffee-light mt-2">待複習</p>
                    </div>

                    <div class="bg-white p-5 rounded-[2rem] shadow-card hover:shadow-float transition-all duration-300 border border-white relative overflow-hidden group">
                        <div class="absolute -right-4 -top-4 w-20 h-20 bg-lavender/20 rounded-full group-hover:scale-125 transition-transform"></div>
                        <div class="flex items-start justify-between mb-4">
                            <p class="text-sm font-bold text-coffee-light">學習狀況</p>
                            <div class="w-10 h-10 rounded-full bg-lavender/40 text-purple-600 flex items-center justify-center">
                                <span class="material-symbols-outlined">trending_up</span>
                            </div>
                        </div>
                        <div class="flex items-baseline gap-2">
                            <p class="text-4xl font-bold text-coffee">${
                              examCount > 0 ? "進行中" : "未開始"
                            }</p>
                        </div>
                        <p class="text-xs text-coffee-light mt-2">繼續努力！</p>
                    </div>
                </div>

                <!-- Main Content Grid -->
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <!-- Left Column -->
                    <div class="lg:col-span-5 flex flex-col gap-6">
                        <!-- Quick Start Card -->
                        <div class="bg-white rounded-[2.5rem] shadow-card p-6 border border-white">
                            <div class="flex items-center justify-between mb-6">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-peach/20 text-peach flex items-center justify-center">
                                        <span class="material-symbols-outlined">quiz</span>
                                    </div>
                                    <h3 class="text-lg font-bold text-coffee">開始測驗</h3>
                                </div>
                            </div>
                            <button class="w-full py-4 bg-gradient-to-r from-peach to-peach-hover hover:shadow-lg text-white rounded-2xl text-base font-bold shadow-lg shadow-peach/30 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2" onclick="window.setState({ currentView: 'exam-selection' })">
                                <span class="material-symbols-outlined filled">play_arrow</span>
                                開始新測驗
                            </button>
                            <p class="text-xs text-coffee-light text-center mt-4">選擇科目開始測驗吧！</p>
                        </div>

                        <!-- Achievement Card -->
                        <div class="bg-gradient-to-br from-sun/20 to-peach/10 rounded-[2.5rem] shadow-card p-6 border border-white relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-20 h-20 bg-sun/20 rounded-full -mr-10 -mt-10"></div>
                            <div class="flex items-center gap-3 mb-4 relative z-10">
                                <span class="material-symbols-outlined text-sun filled text-2xl">stars</span>
                                <h3 class="text-lg font-bold text-coffee">成就</h3>
                            </div>
                            <div class="space-y-3 relative z-10">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined text-sky filled">check_circle</span>
                                    <span class="text-sm font-semibold text-coffee">${
                                      examCount > 0 ? "測驗達人" : "新手上路"
                                    }</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined text-sage filled">check_circle</span>
                                    <span class="text-sm font-semibold text-coffee">${
                                      avgScore >= 80 ? "優秀表現" : "持續進步"
                                    }</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column -->
                    <div class="lg:col-span-7 flex flex-col gap-6">
                        <!-- Recent Tests -->
                        <div class="bg-white rounded-[2.5rem] shadow-card p-6 border border-white">
                            <div class="flex items-center justify-between mb-5">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-sage/20 text-sage-dark flex items-center justify-center">
                                        <span class="material-symbols-outlined">history</span>
                                    </div>
                                    <h3 class="text-lg font-bold text-coffee">最近測驗</h3>
                                </div>
                                <button class="w-8 h-8 rounded-full bg-cream hover:bg-sage hover:text-white text-coffee-light flex items-center justify-center transition-all" onclick="window.setState({ currentView: 'exam-selection' })">
                                    <span class="material-symbols-outlined text-sm">arrow_forward</span>
                                </button>
                            </div>
                            <div class="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                                ${
                                  historyItems ||
                                  '<div class="text-center py-8"><p class="text-coffee-light text-sm">尚無測驗紀錄</p><p class="text-xs text-coffee-light/60 mt-2">開始一場新測驗吧！</p></div>'
                                }
                            </div>
                        </div>

                        <!-- Bookmarks -->
                        <div class="bg-white rounded-[2.5rem] shadow-card p-6 border border-white">
                            <div class="flex items-center justify-between mb-5">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-lavender/20 text-purple-600 flex items-center justify-center">
                                        <span class="material-symbols-outlined">bookmark</span>
                                    </div>
                                    <h3 class="text-lg font-bold text-coffee">收藏題目</h3>
                                </div>
                            </div>
                            <div class="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                                ${
                                  bookmarkItems ||
                                  '<div class="text-center py-8"><p class="text-coffee-light text-sm">還沒有收藏題目</p><p class="text-xs text-coffee-light/60 mt-2">測驗時可以收藏題目進行複習</p></div>'
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
  }

  function createExamSelectionViewHTML() {
    const subjectCards = state.subjects
      .map((subject) => {
        // Count questions available
        const count = state.allQuestions.filter(
          (q) => q.subject === subject.name
        ).length;
        return `
            <div class="subject-card">
                <div class="card-header">
                    <div class="card-icon">${icons.book}</div>
                    <div class="card-badge">${count} 題</div>
                </div>
                <h3>${subject.name}</h3>
                <p class="description">${subject.description}</p>
                <div class="card-footer">
                    <span class="question-count"></span>
                    <button class="select-button" data-subject="${subject.name}">選擇科目 ${icons.arrowRight}</button>
                </div>
            </div>
            `;
      })
      .join("");

    return `
            <div class="page-header">
                <div><h2>選擇考試科目</h2><p>請選擇您想要練習的科目</p></div>
            </div>
            <div class="subjects-grid">
                ${subjectCards}
            </div>
        `;
  }

  // --- Exam Taking View ---
  function createExamTakingViewHTML() {
    if (!state.examState) return "";
    const {
      subject,
      category,
      questions,
      currentQuestionIndex,
      timeLeft,
      answers,
    } = state.examState;
    const currentQ = questions[currentQuestionIndex];
    const progressPercent =
      (Object.keys(answers).length / questions.length) * 100;

    // Options HTML
    const opts = currentQ.options
      .map((optText, idx) => {
        const isSelected = answers[currentQ.id] === idx;
        const img =
          currentQ.optionImages && currentQ.optionImages[idx]
            ? `<img src="${currentQ.optionImages[idx]}" class="option-image">`
            : "";
        return `
                <li class="exam-option ${
                  isSelected ? "selected" : ""
                }" onclick="handleAnswerSelection('${currentQ.id}', ${idx})">
                    <div class="option-letter">${
                      ["A", "B", "C", "D"][idx]
                    }</div>
                    <div>${optText}</div>
                    ${img}
                </li>
             `;
      })
      .join("");

    // Nav Grid HTML
    const navGrid = questions
      .map((q, idx) => {
        const isCurrent = idx === currentQuestionIndex;
        const isAnswered = answers[q.id] !== undefined;
        const isBookmarked = state.currentUser.bookmarkedQuestions.some(
          (bq) => bq.id === q.id
        );
        let className = "nav-grid-btn";
        if (isCurrent) className += " current";
        else if (isAnswered) className += " answered";
        else if (isBookmarked) className += " bookmarked";
        else className += " unanswered";

        return `<div class="${className}" onclick="handleJumpToQuestion(${idx})">${
          idx + 1
        }</div>`;
      })
      .join("");

    const isLast = currentQuestionIndex === questions.length - 1;

    return `
            <div class="exam-layout">
                <div class="exam-main-panel">
                    <div class="page-header">
                         <div><h2>${subject}</h2><p>${category}</p></div>
                         <!-- ** FIX: Added ID for direct DOM update to prevent scroll reset ** -->
                         <div id="exam-timer-display" style="font-size: 20px; font-weight:700; color: #e57373; display:flex; align-items:center; gap:6px;">
                            ${
                              icons.clock
                            } <span id="exam-timer-span">${formatTime(
      timeLeft
    )}</span>
                         </div>
                    </div>
                    
                    <div class="exam-progress-wrapper">
                        <div class="exam-progress-info">
                            <span>進度: ${currentQuestionIndex + 1} / ${
      questions.length
    }</span>
                            <span>已作答: ${Object.keys(answers).length}</span>
                        </div>
                        <div class="exam-progress-track">
                            <div class="exam-progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>
                    
                    <div class="exam-question-card">
                         <div class="question-header-row">
                             <div class="question-label">Q${
                               currentQuestionIndex + 1
                             }</div>
                             <div style="display:flex; align-items:center;">
                                <button class="bookmark-btn ${
                                  state.currentUser.bookmarkedQuestions.some(
                                    (b) => b.id === currentQ.id
                                  )
                                    ? "active"
                                    : ""
                                }" onclick="handleBookmarkToggle('${
      currentQ.id
    }')">
                                    ${
                                      state.currentUser.bookmarkedQuestions.some(
                                        (b) => b.id === currentQ.id
                                      )
                                        ? icons.bookmarkSolid
                                        : icons.bookmark
                                    }
                                </button>
                             </div>
                         </div>
                         <div class="exam-question-text">${currentQ.text}</div>
                         ${
                           currentQ.imgurl
                             ? `<img src="${currentQ.imgurl}" class="question-image">`
                             : ""
                         }
                         
                         <ul class="exam-options-list">
                            ${opts}
                         </ul>
                         
                         <div class="exam-navigation">
                            <button class="exam-nav-button" onclick="handleQuestionNavigation(-1)" ${
                              currentQuestionIndex === 0 ? "disabled" : ""
                            }>${icons.arrowLeft} 上一題</button>
                            ${
                              isLast
                                ? `<button class="exam-nav-button finish" onclick="handleFinishExam()">提交試卷 ${icons.check}</button>`
                                : `<button class="exam-nav-button next" onclick="handleQuestionNavigation(1)">下一題 ${icons.arrowRight}</button>`
                            }
                         </div>
                    </div>
                </div>
                
                <div class="exam-nav-panel">
                    <div class="nav-panel-header"><h3>題號導航</h3></div>
                    <div class="nav-grid">${navGrid}</div>
                    <div class="status-legend">
                        <div class="legend-item"><div class="legend-dot" style="background:var(--status-current)"></div>當前</div>
                        <div class="legend-item"><div class="legend-dot" style="background:var(--status-answered)"></div>已答</div>
                        <div class="legend-item"><div class="legend-dot" style="background:var(--status-bookmarked)"></div>收藏</div>
                        <div class="legend-item"><div class="legend-dot" style="background:var(--status-unanswered)"></div>未答</div>
                    </div>
                </div>
            </div>
        `;
  }

  // --- Review Modal ---
  function createReviewExamViewHTML(exam) {
    // Reconstruct history display
    // We need question texts. If questions are deleted from DB, we might not find them.
    // Assuming we rely on state.allQuestions.

    let content = "";
    if (!exam.questions || exam.questions.length === 0) {
      content = "<p>無法讀取題目資料。</p>";
    } else {
      content = exam.questions
        .map((qId, idx) => {
          const q = state.allQuestions.find((i) => i.id === qId);
          if (!q)
            return `<div class="review-question-card"><p>題目 ID: ${qId} (已刪除)</p></div>`;

          const userAnsIndex = exam.answers[qId];
          const correctText = q.answer;
          const userAnsText =
            userAnsIndex !== undefined ? q.options[userAnsIndex] : "未作答";
          const isCorrect = userAnsText === correctText;

          return `
                    <div class="review-question-card">
                        <div class="review-question-text"><span style="font-weight:bold; margin-right:8px;">${
                          idx + 1
                        }.</span> ${q.text}</div>
                        ${
                          q.imgurl
                            ? `<img src="${q.imgurl}" class="question-image" style="max-height:200px;">`
                            : ""
                        }
                        
                        <div class="review-summary">
                            <div>您的答案: <span class="summary-answer ${
                              isCorrect ? "correct-text" : "incorrect-text"
                            }">${userAnsText}</span></div>
                            <div>正確答案: <span class="summary-answer correct-text">${correctText}</span></div>
                        </div>
                        
                        <div class="explanation-box">
                            <h5>詳解：</h5>
                            <p>${q.explanation || "無詳解"}</p>
                            ${
                              q.explanationImage
                                ? `<div style="margin-top:10px;"><img src="${q.explanationImage}" style="max-width:100%; border-radius:4px;"></div>`
                                : ""
                            }
                        </div>
                    </div>
                 `;
        })
        .join("");
    }

    return `
            <div class="modal-backdrop">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>測驗回顧 - ${exam.subject} (${exam.score}分)</h3>
                        <button class="modal-close-btn" onclick="window.closeReviewModal()">×</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                </div>
            </div>
        `;
  }

  // --- Admin Views ---
  function createAdminViewHTML() {
    // 1. User Management
    if (state.currentView === "user-management") {
      const list = state.allStudents
        .map(
          (u) => `
                <li class="admin-list-item detail-list-item">
                    <div class="item-main-info">
                        <span class="item-subject">${u.name}</span>
                        <span class="item-meta">${u.email} (${u.role})</span>
                    </div>
                    <div class="actions">
                        <button class="action-btn edit" onclick="window.openEditUserModal('${u.id}')">${icons.edit}</button>
                        <button class="action-btn delete" onclick="window.handleDeleteUser('${u.id}')">${icons.delete}</button>
                    </div>
                </li>
            `
        )
        .join("");
      return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>使用者管理</h2></div>
                    <div class="dashboard-container">
                        <h3>使用者列表</h3>
                        <ul class="detail-list scrollable-list">${
                          list || '<p class="empty-list-message">無使用者</p>'
                        }</ul>
                    </div>
                </div>`;
    }

    // 2. Subject Management
    if (state.currentView === "subject-management") {
      const list = state.subjects
        .map((s) => {
          const cats = state.categories[s.name] || [];
          const catList = cats
            .map(
              (c) => `
                    <li title="刪除類別">
                        ${c.name} (${c.timeLimit}m)
                        <button class="action-btn" onclick="window.handleDeleteCategory('${c.id}', '${s.name}')">&times;</button>
                    </li>
                 `
            )
            .join("");

          return `
                    <div class="dashboard-container subject-list-item">
                        <div class="subject-header">
                            <strong>${s.name}</strong>
                            <button class="action-btn delete" onclick="window.handleDeleteSubject('${s.id}', '${s.name}')">${icons.delete}</button>
                        </div>
                        <p style="margin-bottom:8px; font-size:14px; color:#666;">${s.description}</p>
                        <ul class="category-list">${catList}</ul>
                    </div>
                 `;
        })
        .join("");

      return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>科目管理</h2></div>
                    <div class="management-grid">
                        <div>${list || "<p>尚無科目</p>"}</div>
                        <div style="display:flex; flex-direction:column; gap:24px;">
                            <div class="dashboard-container">
                                <h3>新增科目</h3>
                                <form id="add-subject-form" class="admin-form">
                                    <div class="form-group"><label>科目名稱</label><input type="text" name="subjectName" required></div>
                                    <div class="form-group"><label>描述</label><input type="text" name="description" required></div>
                                    <button type="submit" class="submit-button">新增</button>
                                </form>
                            </div>
                            <div class="dashboard-container">
                                <h3>新增類別</h3>
                                <form id="add-category-form" class="admin-form">
                                    <div class="form-group"><label>選擇科目</label>
                                        <select name="subject" required>
                                            ${state.subjects
                                              .map(
                                                (s) =>
                                                  `<option value="${s.name}">${s.name}</option>`
                                              )
                                              .join("")}
                                        </select>
                                    </div>
                                    <div class="form-group"><label>類別名稱</label><input type="text" name="categoryName" required></div>
                                    <div class="form-group"><label>時間限制 (分鐘)</label><input type="number" name="timeLimit" value="10" required></div>
                                    <button type="submit" class="submit-button">新增</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
             `;
    }

    // 3. Question Editing
    if (state.currentView === "question-editing") {
      const filtered = state.allQuestions.filter((q) => {
        if (
          state.selectedAdminSubject &&
          q.subject !== state.selectedAdminSubject
        )
          return false;
        if (
          state.selectedAdminCategory &&
          q.category !== state.selectedAdminCategory
        )
          return false;
        return true;
      });

      const list = filtered
        .map(
          (q) => `
                <li class="admin-list-item detail-list-item">
                    <div class="item-main-info">
                        <div class="item-tags">
                            <span class="item-category-badge">${
                              q.subject
                            }</span>
                            <span class="item-category-badge">${
                              q.category
                            }</span>
                        </div>
                        <p class="item-text" style="margin-top:4px;">${q.text.substring(
                          0,
                          80
                        )}...</p>
                    </div>
                    <div class="actions">
                        <button class="action-btn edit" onclick="window.openEditQuestionModal('${
                          q.id
                        }')">${icons.edit}</button>
                        <button class="action-btn delete" onclick="window.handleDeleteQuestion('${
                          q.id
                        }')">${icons.delete}</button>
                    </div>
                </li>
             `
        )
        .join("");

      const catOptions =
        state.selectedAdminSubject &&
        state.categories[state.selectedAdminSubject]
          ? state.categories[state.selectedAdminSubject]
              .map((c) => `<option value="${c.name}">${c.name}</option>`)
              .join("")
          : '<option value="">請先選擇科目</option>';

      return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>題目修改</h2></div>
                    <div class="dashboard-container">
                        <div class="admin-filters">
                             <select class="filter-select" onchange="window.handleAdminSubjectFilterChange(this.value)">
                                <option value="">所有科目</option>
                                ${state.subjects
                                  .map(
                                    (s) =>
                                      `<option value="${s.name}" ${
                                        state.selectedAdminSubject === s.name
                                          ? "selected"
                                          : ""
                                      }>${s.name}</option>`
                                  )
                                  .join("")}
                             </select>
                             <select class="filter-select" onchange="window.handleAdminCategoryFilterChange(this.value)" ${
                               !state.selectedAdminSubject ? "disabled" : ""
                             }>
                                <option value="">所有類別</option>
                                ${
                                  state.selectedAdminSubject
                                    ? state.categories[
                                        state.selectedAdminSubject
                                      ]
                                        .map(
                                          (c) =>
                                            `<option value="${c.name}" ${
                                              state.selectedAdminCategory ===
                                              c.name
                                                ? "selected"
                                                : ""
                                            }>${c.name}</option>`
                                        )
                                        .join("")
                                    : ""
                                }
                             </select>
                        </div>
                        <ul class="detail-list scrollable-list" style="max-height:600px;">
                            ${
                              list ||
                              '<p class="empty-list-message">無題目符合條件</p>'
                            }
                        </ul>
                    </div>
                </div>
             `;
    }

    // 4. Bulk Upload
    if (state.currentView === "bulk-upload") {
      const catOptions =
        state.selectedBulkUploadSubject &&
        state.categories[state.selectedBulkUploadSubject]
          ? state.categories[state.selectedBulkUploadSubject]
              .map((c) => `<option value="${c.name}">${c.name}</option>`)
              .join("")
          : '<option value="">請先選擇科目</option>';

      return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>題目大量上傳 (JSON)</h2></div>
                    <div class="dashboard-container upload-card-body">
                         <div class="admin-filters">
                             <select class="filter-select" onchange="window.handleBulkUploadSubjectChange(this.value)">
                                <option value="">選擇科目</option>
                                ${state.subjects
                                  .map(
                                    (s) =>
                                      `<option value="${s.name}" ${
                                        state.selectedBulkUploadSubject ===
                                        s.name
                                          ? "selected"
                                          : ""
                                      }>${s.name}</option>`
                                  )
                                  .join("")}
                             </select>
                             <select class="filter-select" onchange="window.handleBulkUploadCategoryChange(this.value)" ${
                               !state.selectedBulkUploadSubject
                                 ? "disabled"
                                 : ""
                             }>
                                <option value="">選擇類別</option>
                                ${
                                  state.selectedBulkUploadSubject
                                    ? state.categories[
                                        state.selectedBulkUploadSubject
                                      ]
                                        .map(
                                          (c) =>
                                            `<option value="${c.name}" ${
                                              state.selectedBulkUploadCategory ===
                                              c.name
                                                ? "selected"
                                                : ""
                                            }>${c.name}</option>`
                                        )
                                        .join("")
                                    : ""
                                }
                             </select>
                        </div>
                        
                        <input type="file" id="json-upload-input" accept=".json" onchange="window.handleFileSelect(this)" style="display:block; margin: 0 auto;">
                        
                        ${
                          state.selectedFile
                            ? `
                            <div id="file-confirmation-section">
                                <div class="file-info">已選擇: <strong>${state.selectedFile.name}</strong></div>
                                <div class="confirmation-actions">
                                    <button id="cancel-upload-btn" onclick="window.handleCancelFile()">取消</button>
                                    <button id="confirm-upload-btn" class="upload-button" onclick="window.handleBulkUpload()">確認上傳</button>
                                </div>
                            </div>
                        `
                            : ""
                        }
                        
                        <div class="upload-status ${
                          state.uploadStatus !== "idle"
                            ? "visible " + state.uploadStatus
                            : ""
                        }">
                            ${state.uploadMessage}
                        </div>
                        
                        <div class="format-examples-container">
                            <h4>JSON 格式範例</h4>
                            <div class="format-example-content">
<pre>
[
  {
    "text": "題目敘述 (必填)",
    "imgurl": "/images/question.jpg (選填，圖片路徑)", 
    "options": [
      "選項A (必填)", 
      "選項B (必填)", 
      "選項C (必填)", 
      "選項D (必填)"
    ],
    "optionImages": [
      "/images/optA.jpg (選填，對應選項A)", 
      null, 
      null, 
      "/images/optD.jpg"
    ],
    "answer": "選項A (必須完全符合選項文字)",
    "explanation": "詳解 (選填)",
    "explanationImage": "/images/explanation.jpg (選填，詳解圖片)"
  }
]
</pre>
                            </div>
                        </div>
                    </div>
                </div>
             `;
    }

    // 5. Student Analytics
    if (state.currentView === "student-analytics") {
      const userSelect = `
                <div class="dashboard-container" style="margin-bottom:24px;">
                    <h3>選擇學生</h3>
                    <select class="filter-select" onchange="window.handleStudentAnalyticsSelect(this.value)" style="width:100%;">
                        <option value="">請選擇</option>
                        ${state.allStudents
                          .filter((u) => u.role === "student")
                          .map(
                            (u) =>
                              `<option value="${u.id}" ${
                                state.selectedStudentIdForAnalytics === u.id
                                  ? "selected"
                                  : ""
                              }>${u.name} (${u.email})</option>`
                          )
                          .join("")}
                    </select>
                </div>
             `;

      let analyticsContent = "";
      if (state.selectedStudentAnalyticsData) {
        const u = state.selectedStudentAnalyticsData;
        // Re-use student dashboard logic but adapted for admin view (maybe add delete history buttons)
        const historyItems = u.examHistory
          .map(
            (h) => `
                    <li class="detail-list-item history-item">
                        <div class="item-main-info">
                            <span class="item-subject">${h.subject} - ${
              h.category
            }</span>
                            <span class="item-score">得分: ${
                              h.score
                            } | ${new Date(h.date).toLocaleDateString()}</span>
                        </div>
                        <div class="history-item-meta">
                            <button class="review-button" data-exam-id="${
                              h.id
                            }">查看</button>
                            <button class="action-btn delete delete-history-btn" data-history-id="${
                              h.id
                            }">&times;</button>
                        </div>
                    </li>
                 `
          )
          .join("");

        analyticsContent = `
                    <div class="dashboard-details-grid full-layout">
                         <div class="detail-card">
                             <div class="detail-card-header"><h4>能力雷達圖</h4></div>
                             ${createRadarChartView(u.radarChartData)}
                         </div>
                         <div class="detail-card">
                             <div class="detail-card-header"><h4>測驗紀錄</h4></div>
                             <ul class="detail-list scrollable-list">${
                               historyItems || "無紀錄"
                             }</ul>
                         </div>
                    </div>
                 `;
      }

      return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>學生成績分析</h2></div>
                    ${userSelect}
                    ${analyticsContent}
                </div>
             `;
    }

    return "";
  }

  // --- Handwritten Assignment Views ---
  function createHandwrittenAssignmentListViewHTML() {
    const listItems = state.assignments
      .map((a) => {
        const firstQuestionText = a.questions
          ? a.questions[0].text
          : a.content || "";
        return `
            <div class="subject-card">
                <h3>${a.title}</h3>
                <p class="description">${firstQuestionText.substring(
                  0,
                  50
                )}...</p>
                <div class="card-footer">
                     <span class="question-count">${a.subject} ${
          a.category ? ` - ${a.category}` : ""
        } | 配分: ${a.maxScore}</span>
                     <button class="select-button" onclick="window.openAssignment('${
                       a.id
                     }')">進入作答 ${icons.arrowRight}</button>
                </div>
            </div>`;
      })
      .join("");

    return `
            <div class="page-header">
                <div><h2>手寫作業區</h2><p>請選擇作業進行作答</p></div>
            </div>
            <div class="subjects-grid">
                ${
                  listItems.length > 0 ? listItems : "<p>目前沒有手寫作業。</p>"
                }
            </div>
        `;
  }

  function createDoAssignmentViewHTML() {
    const a = state.currentAssignment;
    if (!a) return "<p>Loading...</p>";
    const sub = state.submissionDraft;
    const isSubmitted =
      (sub && sub.status === "submitted") || (sub && sub.status === "graded");
    const isGraded = sub && sub.status === "graded";

    // Handle Legacy Data: If no 'questions' array, wrap 'content' into an array
    const questions = a.questions || [
      { text: a.content, image: a.imageUrl, score: a.maxScore },
    ];

    // Prepare Answers Array (if draft exists)
    // If legacy draft, it might have 'content' string instead of 'answers' array.
    let savedAnswers = [];
    if (sub) {
      if (sub.answers) savedAnswers = sub.answers;
      else if (sub.content) savedAnswers = [sub.content];
    }

    const assignmentItems = questions
      .map((q, idx) => {
        const savedContent = savedAnswers[idx] || "";
        const uniqueEditorId = `editor-${idx}`;

        return `
            <div class="assignment-item">
                <div class="assignment-workspace">
                    <!-- Left Panel: Question -->
                    <div class="assignment-question-panel">
                        <div class="hw-card hw-question-card">
                            <div class="hw-card-header">
                                <div class="hw-card-header-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                                        <path d="M12 17h.01"/>
                                    </svg>
                                </div>
                                <h2 class="hw-card-title">題目 ${idx + 1}</h2>
                                <div class="hw-question-tag">
                                    配分 ${q.score} 分
                                </div>
                            </div>
                            <div class="hw-card-body">
                                <div class="hw-question-content">
                                    ${q.text}
                                    ${
                                      q.image
                                        ? `<div style="margin-top:16px;"><img src="${q.image}" style="max-width:100%; border-radius:8px; border:1px solid #eee;"></div>`
                                        : ""
                                    }
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Panel: Answer Editor -->
                    <div class="assignment-answer-panel">
                        <div class="hw-card hw-answer-card h-full">
                            <div class="hw-card-header">
                                <div class="hw-card-header-icon hw-answer-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                    <path d="m15 5 4 4"/>
                                </svg>
                                </div>
                                <h2 class="hw-card-title">作答區 ${idx + 1}</h2>
                            </div>
                            <div class="hw-card-body flex-col">
                                <!-- 編輯器工具列 -->
                                ${
                                  !isSubmitted
                                    ? `
                                <div class="editor-toolbar">
                                    <div class="toolbar-group">
                                        <span class="toolbar-label">格式</span>
                                        <button class="toolbar-btn" onclick="window.execCmd('bold', '${uniqueEditorId}')" title="粗體">B</button>
                                        <button class="toolbar-btn" onclick="window.execCmd('italic', '${uniqueEditorId}')" title="斜體">I</button>
                                        <button class="toolbar-btn" onclick="window.execCmd('underline', '${uniqueEditorId}')" title="底線">U</button>
                                    </div>
                                    <div class="toolbar-group">
                                        <span class="toolbar-label">上下標</span>
                                        <button class="toolbar-btn" onclick="window.execCmd('subscript', '${uniqueEditorId}')">X<span class="sub">2</span></button>
                                        <button class="toolbar-btn" onclick="window.execCmd('superscript', '${uniqueEditorId}')">X<span class="sup">2</span></button>
                                    </div>
                                </div>
                                `
                                    : ""
                                }

                                <!-- 編輯區域 -->
                                <div 
                                    class="editor-area flex-grow" 
                                    contenteditable="${!isSubmitted}" 
                                    id="${uniqueEditorId}"
                                    data-placeholder="在此輸入第 ${
                                      idx + 1
                                    } 題答案..."
                                    style="${
                                      isSubmitted
                                        ? "background-color: #f9fafb;"
                                        : ""
                                    }"
                                >${savedContent}</div>
                                
                                ${
                                  !isSubmitted
                                    ? `
                                <!-- 快捷插入 -->
                                <div class="quick-insert" style="margin-top:8px; padding:8px;">
                                    <div class="quick-symbols">
                                        <button class="symbol-btn" onclick="window.insertSymbol('⟶', '${uniqueEditorId}')">⟶</button>
                                        <button class="symbol-btn" onclick="window.insertSymbol('→', '${uniqueEditorId}')">→</button>
                                        <button class="symbol-btn" onclick="window.insertHtmlAtCursor('<sup>⋅</sup>&frasl;<sub>⋅</sub>', '${uniqueEditorId}')" title="分數"><sup>a</sup>&frasl;<sub>b</sub></button>
                                        <button class="symbol-btn" onclick="window.insertSymbol('H₂O', '${uniqueEditorId}')">H₂O</button>
                                        <button class="symbol-btn" onclick="window.insertSymbol('CO₂', '${uniqueEditorId}')">CO₂</button>
                                        <button class="symbol-btn" onclick="window.insertSymbol('Δ', '${uniqueEditorId}')">Δ</button>
                                        <button class="symbol-btn" onclick="window.insertSymbol('°C', '${uniqueEditorId}')">°C</button>
                                    </div>
                                </div>`
                                    : ""
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;
      })
      .join("");

    return `
            <div class="assignment-view-container">
                <header class="page-header" style="padding: 24px 48px;">
                    <div>
                        <h1 class="page-title">手寫作業區</h1>
                        <p class="page-subtitle">${a.subject} | ${a.title}</p>
                    </div>
                    <button class="back-button" onclick="window.goBackToAssignments()">${
                      icons.arrowLeft
                    } 返回列表</button>
                </header>
                
                <div style="flex-grow: 1; overflow-y: auto; padding-bottom: 40px; padding-left: 48px; padding-right: 48px;">
                    <div class="tips-card" style="margin-bottom: 20px;">
                        <svg class="tips-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4M12 8h.01"/>
                        </svg>
                        <div class="tips-content">
                            <div class="tips-title">作答提示</div>
                            <div class="tips-text">請依序回答下列問題。若有圖片，請參考左側題目說明。</div>
                        </div>
                    </div>

                    ${assignmentItems}
                    
                    ${
                      isGraded
                        ? `
                        <div class="grading-card">
                            <h3><span style="color:var(--primary-color-dark)">✓ 已評分</span> - 得分：${
                              sub.score
                            } / ${a.maxScore}</h3>
                            <p style="margin-top:8px;"><strong>老師評語：</strong></p>
                            <p style="white-space: pre-wrap; color: var(--text-color); margin-bottom:16px;">${
                              sub.feedback
                            }</p>
                            ${
                              sub.feedbackImageUrl
                                ? `
                                <p style="margin-top:8px;"><strong>批改圖片：</strong></p>
                                <img src="${sub.feedbackImageUrl}" style="max-width:100%; border:1px solid #ccc; border-radius:4px;">
                            `
                                : ""
                            }
                        </div>
                    `
                        : ""
                    }
                    
                    <!-- Space for fixed footer -->
                    <div style="height: 80px;"></div>
                </div>

                ${
                  !isSubmitted
                    ? `
                <div class="submit-section" style="position: fixed; bottom: 0; right: 0; width: calc(100% - 260px); background: var(--bg-color); border-top: 1px solid var(--border-color); padding: 16px; margin-top:0; z-index: 50;">
                    <div class="btn-group" style="width: 100%; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="window.handleAssignmentSubmit('draft')">儲存草稿</button>
                        <button class="btn btn-primary" onclick="window.handleAssignmentSubmit('submitted')">提交作業</button>
                    </div>
                </div>`
                    : '<div class="submit-section" style="position: fixed; bottom: 0; right: 0; width: calc(100% - 260px); background: var(--bg-color); padding: 16px;"><p style="color:var(--text-light); text-align:right;">作業已提交。</p></div>'
                }
            </div>
        `;
  }

  function createAdminAssignmentViewsHTML() {
    if (state.currentView === "admin-assignments") {
      const listItems = state.assignments
        .map(
          (a) => `
                <li class="admin-list-item detail-list-item">
                    <div class="item-main-info">
                        <span class="item-subject">${a.title}</span>
                        <p class="item-text" style="font-size:12px;">${
                          a.subject
                        } ${a.category ? ` - ${a.category}` : ""} | 配分: ${
            a.maxScore
          }</p>
                    </div>
                     <div class="actions">
                        <button class="action-btn" title="查看提交" onclick="window.openAdminGradeList('${
                          a.id
                        }')">${icons.users}</button>
                        <button class="action-btn delete" title="刪除作業" onclick="window.handleDeleteAssignment('${
                          a.id
                        }')">${icons.delete}</button>
                    </div>
                </li>
            `
        )
        .join("");

      return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>手寫作業管理</h2></div>
                    <div class="management-grid">
                        <div class="dashboard-container">
                             <h3>作業列表</h3>
                             <ul class="detail-list scrollable-list">${
                               listItems ||
                               '<p class="empty-list-message">尚無作業</p>'
                             }</ul>
                        </div>
                        <div class="dashboard-container">
                            <h3>新增作業</h3>
                            <form id="add-assignment-form" class="admin-form">
                                <div class="form-group"><label>標題</label><input type="text" name="title" required></div>
                                <div class="form-group"><label>科目</label>
                                    <select name="subject" required onchange="window.updateAssignmentCategoryOptions(this.value)">
                                        <option value="">請選擇科目</option>
                                        ${state.subjects
                                          .map(
                                            (s) =>
                                              `<option value="${s.name}">${s.name}</option>`
                                          )
                                          .join("")}
                                    </select>
                                </div>
                                <div class="form-group"><label>類別</label>
                                    <select name="category" id="assignment-category-select" required>
                                        <option value="">請先選擇科目</option>
                                    </select>
                                </div>
                                
                                <div id="questions-container">
                                    <!-- Questions will be added here dynamically -->
                                </div>
                                <button type="button" class="btn btn-secondary" onclick="window.addAssignmentQuestionField()" style="width:100%; margin-bottom:16px;">+ 新增題目</button>

                                <button type="submit" class="submit-button">建立作業</button>
                            </form>
                        </div>
                    </div>
                </div>
            `;
    }

    if (state.currentView === "admin-grade-assignment") {
      const subItems = state.assignmentSubmissions
        .map((s) => {
          let statusBadge = "";
          if (s.status === "graded")
            statusBadge = `<span style="color:green; font-weight:bold;">${s.score}分</span>`;
          else statusBadge = `<span style="color:orange;">未評分</span>`;

          return `
                <li class="admin-list-item detail-list-item">
                    <div class="item-main-info">
                        <span class="item-subject">${
                          s.userName || "Unknown Student"
                        }</span>
                        <div class="item-meta">Submitted: ${new Date(
                          s.updatedAt || s.createdAt
                        ).toLocaleDateString()}</div>
                    </div>
                     <div style="display:flex; align-items:center; gap:12px;">
                        ${statusBadge}
                        <button class="action-btn" title="評分" onclick="window.openGradingDetail('${
                          s.id
                        }')">${icons.edit}</button>
                    </div>
                </li>
            `;
        })
        .join("");

      return `
                 <div class="admin-view-container">
                    <header class="page-header">
                        <div><h2>作業評分列表</h2><p>${
                          state.currentAssignment
                            ? state.currentAssignment.title
                            : ""
                        }</p></div>
                        <button class="back-button" onclick="setState({currentView: 'admin-assignments', currentAssignment: null})">${
                          icons.arrowLeft
                        } 返回作業管理</button>
                    </header>
                    <div class="dashboard-container">
                        <ul class="detail-list scrollable-list">${
                          subItems.length > 0
                            ? subItems
                            : '<p class="empty-list-message">尚無提交記錄</p>'
                        }</ul>
                    </div>
                 </div>
            `;
    }

    if (state.currentView === "admin-grading-detail") {
      const sub = state.gradingSubmission;
      const assign = state.currentAssignment;
      if (!sub || !assign) return "";

      // Handle Legacy Question Structure
      const questions = assign.questions || [
        {
          text: assign.content,
          image: assign.imageUrl,
          score: assign.maxScore,
        },
      ];

      // Handle Legacy Answer Structure
      let studentAnswers = [];
      if (sub.answers) studentAnswers = sub.answers;
      else if (sub.content) studentAnswers = [sub.content];

      const qaPairs = questions
        .map(
          (q, idx) => `
                <div class="assignment-item">
                    <div class="hw-question-content" style="margin-bottom:12px;">
                        <p><strong>題目 ${idx + 1} (${q.score}分):</strong></p>
                        <p>${q.text}</p>
                        ${
                          q.image
                            ? `<img src="${q.image}" style="max-width:100%; margin-top:10px;">`
                            : ""
                        }
                    </div>
                    <div class="hw-card">
                         <div class="hw-card-body">
                            <p style="color:var(--text-light); font-size:12px; margin-bottom:4px;">學生作答:</p>
                            <div class="editor-area" style="border:none; background:white;">${
                              studentAnswers[idx] ||
                              '<span style="color:red">未作答</span>'
                            }</div>
                         </div>
                    </div>
                </div>
             `
        )
        .join("");

      return `
                 <div class="admin-view-container">
                    <header class="page-header">
                        <div><h2>評分: ${sub.userName}</h2></div>
                        <button class="back-button" onclick="setState({currentView: 'admin-grade-assignment', gradingSubmission: null})">${
                          icons.arrowLeft
                        } 返回列表</button>
                    </header>
                    
                    <div class="management-grid">
                        <div class="dashboard-container" style="max-height: 80vh; overflow-y: auto;">
                             <h3>題目與作答</h3>
                             ${qaPairs}
                        </div>

                        <div class="dashboard-container">
                            <h3>評分與回饋</h3>
                            <form id="grading-form" class="admin-form">
                                <div class="form-group">
                                    <label>得分 (滿分: ${
                                      assign.maxScore
                                    })</label>
                                    <input type="number" name="score" max="${
                                      assign.maxScore
                                    }" value="${sub.score || ""}" required>
                                </div>
                                <div class="form-group">
                                    <label>評語</label>
                                    <textarea name="feedback" rows="6">${
                                      sub.feedback || ""
                                    }</textarea>
                                </div>
                                <div class="form-group">
                                    <label>批改圖片路徑 (選填)</label>
                                    <input type="text" name="feedbackImageUrl" value="${
                                      sub.feedbackImageUrl || ""
                                    }" placeholder="/images/corrections/sub_123.jpg">
                                    <p style="font-size:12px; color:#666;">請輸入批改後的圖片連結。</p>
                                </div>
                                <button type="submit" class="submit-button">儲存評分</button>
                            </form>
                        </div>
                    </div>
                 </div>
             `;
    }
    return "";
  }

  // --- MAIN RENDER FUNCTION ---
  function render() {
    const appContainer = document.getElementById("app-container");
    const loginContainer = document.getElementById("login-container");
    const modalContainer = document.getElementById("modal-container");
    const sidebarContainer = document.getElementById("sidebar-container");
    const mainContentContainer = document.getElementById(
      "main-content-container"
    );

    // Reset container style override whenever re-rendering main views
    if (mainContentContainer) {
      if (state.currentView === "do-assignment") {
        mainContentContainer.style.overflow = "hidden"; // Let assignment view handle scroll
        mainContentContainer.style.padding = "0";
      } else {
        mainContentContainer.style.overflow = "";
        mainContentContainer.style.padding = "";
      }
    }

    // Modal Rendering
    let modalHTML = "";
    if (state.reviewingExam) {
      modalHTML = createReviewExamViewHTML(state.reviewingExam);
    } else if (state.viewingBookmark) {
      const q = state.viewingBookmark;
      modalHTML = `
                <div class="modal-backdrop">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>題目詳解</h3>
                            <button class="modal-close-btn" onclick="window.closeBookmarkModal()">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="review-question-card" style="border:none; padding:0;">
                                <div class="review-question-text">${
                                  q.text
                                }</div>
                                ${
                                  q.imgurl
                                    ? `<img src="${q.imgurl}" class="question-image">`
                                    : ""
                                }
                                
                                <ul class="review-options-list">
                                    ${q.options
                                      .map((opt, idx) => {
                                        const isCorrect = opt === q.answer;
                                        return `<li class="review-option ${
                                          isCorrect ? "correct" : ""
                                        }">
                                            <div style="font-weight:bold; margin-right:8px;">${
                                              ["A", "B", "C", "D"][idx]
                                            }.</div>
                                            <div>${opt}</div>
                                        </li>`;
                                      })
                                      .join("")}
                                </ul>
                                
                                <div class="explanation-box" style="margin-top:20px;">
                                    <h5>正確答案：${q.answer}</h5>
                                    <hr style="margin:8px 0; border:0; border-top:1px solid #eee;">
                                    <h5>詳解：</h5>
                                    <p>${q.explanation || "無詳解"}</p>
                                    ${
                                      q.explanationImage
                                        ? `<div style="margin-top:10px;"><img src="${q.explanationImage}" style="max-width:100%; border-radius:4px;"></div>`
                                        : ""
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
             `;
    } else if (state.editingQuestion) {
      const q = state.editingQuestion;
      const optImgs =
        q.optionImages && q.optionImages.length === 4
          ? q.optionImages
          : [null, null, null, null];
      modalHTML = `
                <div class="modal-backdrop">
                    <div class="modal-content" style="height: auto; max-height: 90vh;">
                        <div class="modal-header"><h3>編輯題目</h3><button class="modal-close-btn" onclick="window.closeEditModal()">×</button></div>
                        <div class="modal-body">
                            <form id="edit-question-form" class="admin-form">
                                <div class="form-group"><label>題目敘述</label><textarea name="questionText" rows="3" required>${
                                  q.text
                                }</textarea></div>
                                <div class="form-group"><label>圖片網址 (選填)</label><input type="text" name="imgurl" value="${
                                  q.imgurl || ""
                                }"></div>
                                <div class="form-group"><label>選項 1</label><input type="text" name="option1" value="${
                                  q.options[0]
                                }" required><input type="text" name="option1_img" placeholder="選項 1 圖片網址 (選填)" value="${
        optImgs[0] || ""
      }" class="mt-1"></div>
                                <div class="form-group"><label>選項 2</label><input type="text" name="option2" value="${
                                  q.options[1]
                                }" required><input type="text" name="option2_img" placeholder="選項 2 圖片網址 (選填)" value="${
        optImgs[1] || ""
      }" class="mt-1"></div>
                                <div class="form-group"><label>選項 3</label><input type="text" name="option3" value="${
                                  q.options[2]
                                }" required><input type="text" name="option3_img" placeholder="選項 3 圖片網址 (選填)" value="${
        optImgs[2] || ""
      }" class="mt-1"></div>
                                <div class="form-group"><label>選項 4</label><input type="text" name="option4" value="${
                                  q.options[3]
                                }" required><input type="text" name="option4_img" placeholder="選項 4 圖片網址 (選填)" value="${
        optImgs[3] || ""
      }" class="mt-1"></div>
                                <div class="form-group"><label>正確答案</label><input type="text" name="answer" value="${
                                  q.answer
                                }" required></div>
                                <div class="form-group"><label>詳解</label><textarea name="explanation" rows="3" required>${
                                  q.explanation
                                }</textarea></div>
                                <div class="form-group"><label>詳解圖片網址 (選填)</label><input type="text" name="explanationImage" value="${
                                  q.explanationImage || ""
                                }"></div>
                                <button type="submit" class="submit-button">儲存變更</button>
                            </form>
                        </div>
                    </div>
                </div>`;
    } else if (state.editingUser) {
      const u = state.editingUser;
      modalHTML = `
                <div class="modal-backdrop">
                    <div class="modal-content" style="height: auto;">
                        <div class="modal-header"><h3>編輯使用者</h3><button class="modal-close-btn" onclick="window.closeEditModal()">×</button></div>
                        <div class="modal-body">
                            <form id="edit-user-form" class="admin-form">
                                <div class="form-group"><label>姓名</label><input type="text" name="userName" value="${u.name}" required></div>
                                <div class="form-group"><label>Email</label><input type="text" value="${u.email}" disabled style="background-color: #eee;"></div>
                                <div class="form-group"><label>角色</label><input type="text" value="${u.role}" disabled style="background-color: #eee;"></div>
                                <button type="submit" class="submit-button">儲存變更</button>
                            </form>
                        </div>
                    </div>
                </div>`;
    }
    modalContainer.innerHTML = modalHTML;

    // Login View
    if (!state.isLoggedIn) {
      appContainer.style.display = "none";
      loginContainer.style.display = "flex";
      loginContainer.innerHTML = createLoginViewHTML();

      const loginForm = document.getElementById("login-form");
      if (loginForm) loginForm.onsubmit = handleLogin;

      document.querySelectorAll(".role-tab").forEach((btn) => {
        btn.onclick = (e) =>
          setState({ loginAsRole: e.target.dataset.role, loginError: "" });
      });
      return;
    }

    // Main App View
    appContainer.style.display = "flex";
    loginContainer.style.display = "none";

    sidebarContainer.innerHTML = createSidebarHTML();

    // Attach sidebar listeners
    if (state.currentUser.role === "student") {
      document.getElementById("nav-dashboard").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "dashboard" });
      };
      document.getElementById("nav-exam-selection").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "exam-selection", selectedExamSubject: null });
      };
      document.getElementById("nav-handwritten").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "handwritten-assignments" });
      };
    } else {
      document.getElementById("nav-user-management").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "user-management" });
      };
      document.getElementById("nav-subject-management").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "subject-management" });
      };
      document.getElementById("nav-question-editing").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "question-editing" });
      };
      document.getElementById("nav-bulk-upload").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "bulk-upload" });
      };
      document.getElementById("nav-student-analytics").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "student-analytics" });
      };
      document.getElementById("nav-admin-assignments").onclick = (e) => {
        e.preventDefault();
        setState({ currentView: "admin-assignments" });
      };
    }
    document.getElementById("logout-btn").onclick = handleLogout;

    // Content Area Rendering
    let contentHTML = "";
    if (state.currentUser.role === "student") {
      if (state.currentView === "dashboard") {
        contentHTML = createStudentDashboardViewHTML(state.currentUser);
      } else if (state.currentView === "exam-selection") {
        contentHTML = createExamSelectionViewHTML();
      } else if (state.currentView === "exam-category-selection") {
        // Category selection logic inline...
        const subjectCategories =
          state.categories[state.selectedExamSubject] || [];
        const categoryCardsHTML = subjectCategories
          .map(
            (cat) => `
                    <div class="category-card" onclick="window.startExam('${state.selectedExamSubject}', '${cat.name}')" style="cursor: pointer;">
                        <h3>${cat.name}</h3>
                        <div class="category-info"><div class="category-meta">${icons.clock} ${cat.timeLimit} 分鐘</div></div>
                        <button class="start-exam-button" style="width:100%; justify-content:center;">開始測驗</button>
                    </div>
                 `
          )
          .join("");

        contentHTML = `
                    <div class="page-header"><div><h2>${state.selectedExamSubject} - 選擇類別</h2><p>請選擇一個主題開始測驗</p></div></div>
                    <button class="back-button" onclick="window.goBackToSubjects()">${icons.arrowLeft} 返回科目列表</button>
                    <div class="category-grid">${categoryCardsHTML}</div>
                 `;
      } else if (state.currentView === "exam-taking") {
        contentHTML = createExamTakingViewHTML();
      } else if (state.currentView === "handwritten-assignments") {
        contentHTML = createHandwrittenAssignmentListViewHTML();
      } else if (state.currentView === "do-assignment") {
        contentHTML = createDoAssignmentViewHTML();
      }
    } else {
      // Admin Views
      if (
        state.currentView.startsWith("admin-") ||
        state.currentView === "admin-grade-assignment" ||
        state.currentView === "admin-grading-detail"
      ) {
        contentHTML = createAdminAssignmentViewsHTML();
      } else {
        contentHTML = createAdminViewHTML();
      }
    }

    // ** FIX: Preserve scroll position across renders **
    const previousScrollTop = mainContentContainer.scrollTop;

    // Preserve scroll for Exam View panels
    const prevExamMain = mainContentContainer.querySelector(".exam-main-panel");
    const prevExamNav = mainContentContainer.querySelector(".exam-nav-panel");
    let prevExamMainScroll = 0;
    let prevExamNavScroll = 0;
    if (prevExamMain) prevExamMainScroll = prevExamMain.scrollTop;
    if (prevExamNav) prevExamNavScroll = prevExamNav.scrollTop;

    // Preserve editor scroll if active (Assignment view)
    const prevEditor = document.getElementById("editor");
    let prevEditorScroll = 0;
    if (
      prevEditor &&
      (state.currentView === "do-assignment" ||
        state.currentView === "admin-grading-detail")
    ) {
      prevEditorScroll = prevEditor.scrollTop;
    }

    mainContentContainer.innerHTML = contentHTML;

    // Restore main scroll only if it is scrollable (not hidden by assignment view)
    if (state.currentView !== "do-assignment") {
      mainContentContainer.scrollTop = previousScrollTop;
    }

    // Restore scroll for Exam View panels
    const newExamMain = mainContentContainer.querySelector(".exam-main-panel");
    const newExamNav = mainContentContainer.querySelector(".exam-nav-panel");
    if (newExamMain) newExamMain.scrollTop = prevExamMainScroll;
    if (newExamNav) newExamNav.scrollTop = prevExamNavScroll;

    // Restore editor scroll
    const newEditor = document.getElementById("editor");
    if (newEditor) newEditor.scrollTop = prevEditorScroll;

    // Post-render listeners
    const addSubjectForm = document.getElementById("add-subject-form");
    if (addSubjectForm) addSubjectForm.onsubmit = handleAddSubject;

    const addCategoryForm = document.getElementById("add-category-form");
    if (addCategoryForm) addCategoryForm.onsubmit = handleAddCategory;

    const editQuestionForm = document.getElementById("edit-question-form");
    if (editQuestionForm) editQuestionForm.onsubmit = handleUpdateQuestion;

    const editUserForm = document.getElementById("edit-user-form");
    if (editUserForm) editUserForm.onsubmit = handleUpdateUser;

    const addAssignmentForm = document.getElementById("add-assignment-form");
    if (addAssignmentForm) addAssignmentForm.onsubmit = handleAddAssignment;

    // Init add assignment dynamic field
    if (addAssignmentForm && state.currentView === "admin-assignments") {
      // If we just rendered, add one empty block
      const container = document.getElementById("questions-container");
      if (container && container.children.length === 0) {
        window.addAssignmentQuestionField();
      }
    }

    const gradingForm = document.getElementById("grading-form");
    if (gradingForm) gradingForm.onsubmit = handleAdminGradeSubmission;

    // Attach listeners for dynamic elements
    document.querySelectorAll(".select-button").forEach((btn) => {
      if (btn.dataset.subject) {
        // Only for exam selection, not assignment selection
        btn.onclick = () =>
          setState({
            currentView: "exam-category-selection",
            selectedExamSubject: btn.dataset.subject,
          });
      }
    });

    document.querySelectorAll(".review-button").forEach((btn) => {
      btn.onclick = () => {
        const examId = btn.dataset.examId;
        let exam = state.currentUser?.examHistory?.find((e) => e.id === examId);
        if (!exam && state.selectedStudentAnalyticsData) {
          exam = state.selectedStudentAnalyticsData.examHistory.find(
            (e) => e.id === examId
          );
        }
        if (exam) setState({ reviewingExam: exam });
      };
    });

    document.querySelectorAll(".delete-history-btn").forEach((btn) => {
      btn.onclick = () => window.handleDeleteExamHistory(btn.dataset.historyId);
    });

    document.querySelectorAll(".delete-bookmark-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const userId =
          state.currentView === "student-analytics"
            ? state.selectedStudentIdForAnalytics
            : state.currentUser.id;
        window.handleDeleteBookmark(btn.dataset.questionId, userId);
      };
    });

    // Editor listeners (for multiple editors now)
    const editors = document.querySelectorAll(".editor-area");
    editors.forEach((editor) => {
      editor.addEventListener("keydown", function (e) {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === ",") {
            e.preventDefault();
            document.execCommand("subscript", false, null);
          } else if (e.key === ".") {
            e.preventDefault();
            document.execCommand("superscript", false, null);
          }
        }
      });
    });
  }

  // --- GLOBAL HANDLERS FOR INLINE HTML EVENTS ---
  window.startExam = startExam;
  window.handleAnswerSelection = handleAnswerSelection;
  window.handleQuestionNavigation = handleQuestionNavigation;
  window.handleJumpToQuestion = handleJumpToQuestion;
  window.handleBookmarkToggle = handleBookmarkToggle;
  window.handleReviewBookmarkToggle = handleReviewBookmarkToggle;
  window.handleFinishExam = handleFinishExam;
  window.goBackToSubjects = () =>
    setState({ currentView: "exam-selection", selectedExamSubject: null });
  window.closeReviewModal = () => setState({ reviewingExam: null });

  // NEW HANDLERS FOR VIEWING BOOKMARK
  window.openBookmarkDetail = (id) => {
    let q = state.currentUser?.bookmarkedQuestions?.find(
      (item) => item.id === id
    );
    if (!q) q = state.allQuestions.find((item) => item.id === id);
    if (q) setState({ viewingBookmark: q });
  };
  window.closeBookmarkModal = () => setState({ viewingBookmark: null });

  // Handwritten Assignment Globals
  window.goBackToAssignments = () =>
    setState({
      currentView: "handwritten-assignments",
      currentAssignment: null,
      submissionDraft: null,
    });
  window.openAssignment = async (assignmentId) => {
    setLoading(true);
    try {
      const assignment = state.assignments.find((a) => a.id === assignmentId);
      if (!assignment) throw new Error("Assignment not found");

      // Check for existing draft/submission
      const q = query(
        collection(db, "assignmentSubmissions"),
        where("assignmentId", "==", assignmentId),
        where("userId", "==", state.currentUser.id)
      );
      const snapshot = await getDocs(q);
      let draft = null;
      if (!snapshot.empty) {
        draft = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      }

      setState({
        currentView: "do-assignment",
        currentAssignment: assignment,
        submissionDraft: draft,
      });
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Updated execCmd to accept target ID
  window.execCmd = (cmd, targetId) => {
    document.execCommand(cmd, false, null);
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) el.focus();
    }
  };

  // Updated insertSymbol to accept target ID
  window.insertSymbol = (symbol, targetId) => {
    const editor = targetId
      ? document.getElementById(targetId)
      : document.getElementById("editor");
    if (editor) {
      editor.focus();
      // This relies on the browser knowing the selection is inside the focused editor
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        // Security/Bug check: ensure range is inside the editor
        if (editor.contains(range.commonAncestorContainer)) {
          const textNode = document.createTextNode(symbol);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // Fallback append
          editor.innerHTML += symbol;
        }
      }
    }
  };
  // NEW FUNCTION for inserting HTML (for fractions)
  window.insertHtmlAtCursor = (html, targetId) => {
    const editor = targetId
      ? document.getElementById(targetId)
      : document.getElementById("editor");
    if (editor) {
      editor.focus();
      if (document.queryCommandSupported("insertHTML")) {
        document.execCommand("insertHTML", false, html);
      } else {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (editor.contains(range.commonAncestorContainer)) {
            const fragment = range.createContextualFragment(html);
            range.deleteContents();
            range.insertNode(fragment);
            range.collapse(false);
          } else {
            editor.innerHTML += html;
          }
        }
      }
    }
  };

  window.handleAssignmentSubmit = handleAssignmentSubmit;

  // Admin Assignment Globals
  window.openAdminGradeList = async (assignmentId) => {
    setLoading(true);
    try {
      const assignment = state.assignments.find((a) => a.id === assignmentId);
      const q = query(
        collection(db, "assignmentSubmissions"),
        where("assignmentId", "==", assignmentId)
      );
      const snapshot = await getDocs(q);
      const submissions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      setState({
        currentView: "admin-grade-assignment",
        currentAssignment: assignment,
        assignmentSubmissions: submissions,
      });
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };
  window.openGradingDetail = (submissionId) => {
    const sub = state.assignmentSubmissions.find((s) => s.id === submissionId);
    setState({ currentView: "admin-grading-detail", gradingSubmission: sub });
  };
  window.handleAdminGradeSubmission = handleAdminGradeSubmission;
  window.handleDeleteAssignment = handleDeleteAssignment;
  window.updateAssignmentCategoryOptions = (subjectName) => {
    const select = document.getElementById("assignment-category-select");
    if (!select) return;

    if (!subjectName) {
      select.innerHTML = '<option value="">請先選擇科目</option>';
      return;
    }

    const cats = state.categories[subjectName] || [];
    if (cats.length === 0) {
      select.innerHTML = '<option value="">此科目尚無類別</option>';
    } else {
      select.innerHTML = cats
        .map((c) => `<option value="${c.name}">${c.name}</option>`)
        .join("");
    }
  };

  // Logic for adding assignment questions dynamically
  window.addAssignmentQuestionField = () => {
    const container = document.getElementById("questions-container");
    if (!container) return;

    const count = container.children.length + 1;
    const div = document.createElement("div");
    div.className = "question-block";
    div.innerHTML = `
            <div class="question-block-header">
                <span>題目 ${count}</span>
                <button type="button" class="remove-question-btn" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
            <div class="form-group">
                <label>題目敘述</label>
                <textarea name="questionText" rows="3" required placeholder="請輸入第 ${count} 題題目..."></textarea>
            </div>
            <div class="form-group">
                <label>題目圖片路徑 (選填)</label>
                <input type="text" name="imageUrl" placeholder="/images/q${count}.jpg">
            </div>
            <div class="form-group">
                <label>本題配分</label>
                <input type="number" name="maxScore" value="20" required>
            </div>
        `;
    container.appendChild(div);
  };

  // Admin existing Globals
  window.handleDeleteSubject = handleDeleteSubject;
  window.handleDeleteCategory = handleDeleteCategory;
  window.handleAdminSubjectFilterChange = (val) =>
    setState({ selectedAdminSubject: val });
  window.handleAdminCategoryFilterChange = (val) =>
    setState({ selectedAdminCategory: val });
  window.handleDeleteQuestion = handleDeleteQuestion;
  window.openEditQuestionModal = (id) => {
    const q = state.allQuestions.find((i) => i.id === id);
    if (q) setState({ editingQuestion: q });
  };
  window.closeEditModal = () =>
    setState({ editingQuestion: null, editingUser: null });

  window.handleBulkUploadSubjectChange = (val) =>
    setState({ selectedBulkUploadSubject: val });
  window.handleBulkUploadCategoryChange = (val) =>
    setState({ selectedBulkUploadCategory: val });
  window.handleFileSelect = (input) => {
    if (input.files && input.files[0]) {
      setState({
        selectedFile: input.files[0],
        uploadStatus: "idle",
        uploadMessage: "",
      });
    }
  };
  window.handleCancelFile = () => {
    const input = document.getElementById("json-upload-input");
    if (input) input.value = "";
    setState({ selectedFile: null, uploadStatus: "idle", uploadMessage: "" });
  };
  window.handleBulkUpload = handleBulkUpload;

  window.handleDeleteUser = handleDeleteUser;
  window.openEditUserModal = (id) => {
    const u = state.allStudents.find((i) => i.id === id);
    if (u) setState({ editingUser: u });
  };

  // --- UPDATED ADMIN ANALYTICS SELECT WITH REALTIME LISTENER ---
  window.handleStudentAnalyticsSelect = async (studentId) => {
    // Clean up previous listener if any
    if (adminStudentHistoryListener) {
      adminStudentHistoryListener();
      adminStudentHistoryListener = null;
    }

    if (!studentId) {
      setState({
        selectedStudentIdForAnalytics: null,
        selectedStudentAnalyticsData: null,
      });
      return;
    }

    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, "users", studentId));
      if (!userDoc.exists()) {
        alert("查無此使用者");
        setLoading(false);
        return;
      }

      const userData = { id: userDoc.id, ...userDoc.data() };

      // Fetch bookmarks (one-off)
      const qBookmarks = query(
        collection(db, "bookmarkedQuestions"),
        where("userId", "==", studentId)
      );
      const bookmarkSnapshot = await getDocs(qBookmarks);
      const bookmarks = [];

      bookmarkSnapshot.docs.forEach((d) => {
        const bData = d.data();
        const qDetails = state.allQuestions.find(
          (q) => q.id === bData.questionId
        );
        if (qDetails) {
          bookmarks.push({ ...qDetails, bookmarkId: d.id });
        }
      });

      // Subscribe to Exam History Realtime
      const qHistory = query(
        collection(db, "examHistory"),
        where("userId", "==", studentId)
      );

      adminStudentHistoryListener = onSnapshot(
        qHistory,
        (snapshot) => {
          const examHistory = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          // Sort descending by date
          examHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

          const radarData = calculateRadarData(examHistory);

          // Preserve existing analytics data if we are updating, or init new
          const currentAnalyticsData = state.selectedStudentAnalyticsData || {};

          setState({
            selectedStudentIdForAnalytics: studentId,
            selectedStudentAnalyticsData: {
              ...userData,
              bookmarkedQuestions: bookmarks, // Bookmarks remain one-off for now
              ...currentAnalyticsData, // Keep other fields stable
              examHistory: examHistory, // Update history from listener
              radarChartData: radarData,
            },
          });
          setLoading(false); // Ensure loading is cleared on first data
        },
        (error) => {
          console.error("Error watching student history:", error);
          setLoading(false);
        }
      );
    } catch (e) {
      console.error(e);
      alert("讀取學生資料失敗");
      setLoading(false);
    }
  };
  window.handleDeleteExamHistory = handleDeleteExamHistory;
  window.handleDeleteBookmark = handleDeleteBookmark;

  // --- INITIALIZATION ---
  // Fetch initial data
  if (auth && db) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        setLoading(true);
        try {
          // 1. Get User Profile
          const userDocRef = doc(db, "users", user.uid);
          let userDoc = await getDoc(userDocRef);

          // ** SECURITY CHECK: If user exists in Auth but not in Firestore (Deleted by Admin) **
          if (!userDoc.exists()) {
            // Create the user document automatically
            const newUserData = {
              name: user.displayName || user.email.split("@")[0],
              email: user.email,
              role: user.email === "admin@test.com" ? "admin" : "student",
              createdAt: new Date().toISOString(),
            };
            try {
              await setDoc(userDocRef, newUserData);
              userDoc = await getDoc(userDocRef); // Refresh data
            } catch (err) {
              console.error("Error creating user doc:", err);
              alert("帳號初始化失敗，請聯繫管理員");
              await signOut(auth);
              setLoading(false);
              return;
            }
          }

          const userData = userDoc.exists() ? userDoc.data() : {};
          const role = userData.role || "student"; // Default to student

          // 2. Fetch Common Data (Subjects, Categories, Questions, Assignments)
          const subjectsSnapshot = await getDocs(collection(db, "subjects"));
          const subjects = subjectsSnapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => a.name.localeCompare(b.name));

          const categoriesSnapshot = await getDocs(
            collection(db, "categories")
          );
          const categories = {};
          subjects.forEach((s) => (categories[s.name] = []));
          categoriesSnapshot.docs.forEach((d) => {
            const c = { id: d.id, ...d.data() };
            if (categories[c.subject]) categories[c.subject].push(c);
          });

          const questionsSnapshot = await getDocs(collection(db, "questions"));
          const allQuestions = questionsSnapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));

          // Fetch Handwritten Assignments
          const assignmentsSnapshot = await getDocs(
            collection(db, "assignments")
          );
          const assignments = assignmentsSnapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));

          // 3. Admin Specifics
          let allStudents = [];
          if (role === "admin") {
            const usersSnapshot = await getDocs(query(collection(db, "users"))); // Get all users
            allStudents = usersSnapshot.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }));
          } else {
            // 4. Student Specifics (History, Bookmarks)
            // Keep initial fetch for immediate data, but also setup listener below
            const historySnapshot = await getDocs(
              query(
                collection(db, "examHistory"),
                where("userId", "==", user.uid)
              )
            );
            let examHistory = historySnapshot.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }));
            // Sort descending by date immediately on load
            examHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

            const bookmarkSnapshot = await getDocs(
              query(
                collection(db, "bookmarkedQuestions"),
                where("userId", "==", user.uid)
              )
            );
            const bookmarkedQuestions = [];
            bookmarkSnapshot.docs.forEach((d) => {
              const bData = d.data();
              const q = allQuestions.find((q) => q.id === bData.questionId);
              if (q) bookmarkedQuestions.push({ ...q, bookmarkId: d.id });
            });

            // Calculate Radar Data from History
            const radarChartData = calculateRadarData(examHistory);

            state.currentUser = {
              id: user.uid,
              email: user.email,
              role,
              ...userData,
              examHistory,
              bookmarkedQuestions,
              radarChartData,
            };
          }

          if (role === "admin") {
            state.currentUser = {
              id: user.uid,
              email: user.email,
              role,
              ...userData,
            };
            state.allStudents = allStudents;
          }

          setState({
            isLoggedIn: true,
            currentUser: state.currentUser,
            subjects,
            categories,
            allQuestions,
            allStudents,
            assignments,
            currentView: role === "student" ? "dashboard" : "user-management", // Admin defaults to user mgmt
            loginAsRole: role, // Sync selector
          });

          // Start Real-time Listener for Students
          if (role === "student") {
            const qHistory = query(
              collection(db, "examHistory"),
              where("userId", "==", user.uid)
            );

            if (examHistoryListener) examHistoryListener();

            examHistoryListener = onSnapshot(qHistory, (snapshot) => {
              const history = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));
              // Sort descending by date
              history.sort((a, b) => new Date(b.date) - new Date(a.date));

              if (state.currentUser) {
                const radar = calculateRadarData(history);
                // Force update current user state with new history
                const updatedUser = {
                  ...state.currentUser,
                  examHistory: history,
                  radarChartData: radar,
                };
                state.currentUser = updatedUser; // Update ref
                setState({
                  currentUser: updatedUser,
                });
              }
            });
          }
        } catch (error) {
          console.error("Data fetch error:", error);
          alert("資料載入發生錯誤: " + error.message);
        } finally {
          setLoading(false);
        }
      } else {
        setState({ isLoggedIn: false, currentUser: null });
      }
    });
  }

  // Update clock every second
  setInterval(() => {
    const timeElement = document.getElementById("current-time");
    if (timeElement) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const ampm = now.getHours() >= 12 ? "下午" : "上午";
      const displayHours = now.getHours() % 12 || 12;
      timeElement.textContent = `${String(displayHours).padStart(
        2,
        "0"
      )}:${minutes} ${ampm}`;
    }
  }, 1000);

  render();
});
