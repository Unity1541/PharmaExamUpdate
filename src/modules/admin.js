/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 管理員功能模組 - 科目、類別、題目、用戶管理
 */

import {
  db,
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from "../firebase.js";
import { state, setState, setLoading } from "../state.js";
import { sanitizeImagePath, calculateRadarData } from "../utils/helpers.js";

// ==================== 科目管理 ====================

/**
 * 新增科目
 * @param {Event} e 
 */
export async function handleAddSubject(e) {
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

/**
 * 刪除科目（含其下所有類別）
 * @param {string} id 
 * @param {string} name 
 */
export async function handleDeleteSubject(id, name) {
  if (
    !confirm(
      `確定要刪除科目 "${name}" 嗎？\n這將同時刪除該科目下的所有類別。`
    )
  )
    return;
  setLoading(true);
  try {
    await deleteDoc(doc(db, "subjects", id));
    const q = query(
      collection(db, "categories"),
      where("subject", "==", name)
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.forEach((docItem) => {
      batch.delete(docItem.ref);
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

// ==================== 類別管理 ====================

/**
 * 新增類別
 * @param {Event} e 
 */
export async function handleAddCategory(e) {
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

/**
 * 刪除類別
 * @param {string} id 
 * @param {string} subjectName 
 */
export async function handleDeleteCategory(id, subjectName) {
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

// ==================== 題目管理 ====================

/**
 * 更新題目
 * @param {Event} e 
 */
export async function handleUpdateQuestion(e) {
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
      sanitizeImagePath(form.option1_img.value),
      sanitizeImagePath(form.option2_img.value),
      sanitizeImagePath(form.option3_img.value),
      sanitizeImagePath(form.option4_img.value),
    ],
    answer: form.answer.value,
    explanation: form.explanation.value,
    imgurl: sanitizeImagePath(form.imgurl.value),
  };

  try {
    await updateDoc(doc(db, "questions", q.id), updatedData);
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

/**
 * 刪除題目
 * @param {string} id 
 */
export async function handleDeleteQuestion(id) {
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

/**
 * 批次上傳題目
 */
export async function handleBulkUpload() {
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
        if (
          !item.text ||
          !item.options ||
          item.options.length !== 4 ||
          !item.answer
        ) {
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

/**
 * 手動新增題目時的科目變更
 * @param {string} value 
 */
export function handleManualAddSubjectChange(value) {
  setState({ selectedManualSubject: value });
}

/**
 * 手動新增題目時的類別變更
 * @param {string} value 
 */
export function handleManualAddCategoryChange(value) {
  setState({ selectedManualCategory: value });
}

/**
 * 手動新增題目
 * @param {Event} e 
 */
export async function handleAddQuestion(e) {
  e.preventDefault();
  setLoading(true);

  const form = e.target;
  if (!state.selectedManualSubject || !state.selectedManualCategory) {
    alert("請先選擇科目與類別");
    setLoading(false);
    return;
  }

  const questionText = form.questionText.value.trim();
  if (!questionText) {
    alert("請輸入題目內容");
    setLoading(false);
    return;
  }

  const options = [
    form.option1.value.trim(),
    form.option2.value.trim(),
    form.option3.value.trim(),
    form.option4.value.trim(),
  ];
  if (options.some((o) => !o)) {
    alert("請填寫所有選項文字");
    setLoading(false);
    return;
  }

  const optionImages = [
    sanitizeImagePath(form.option1_img.value),
    sanitizeImagePath(form.option2_img.value),
    sanitizeImagePath(form.option3_img.value),
    sanitizeImagePath(form.option4_img.value),
  ];

  const answerVal = form.answer.value;
  const answerMap = { A: 0, B: 1, C: 2, D: 3 };
  const answerIndex = answerMap[answerVal];
  const correctOptionText = options[answerIndex];

  const newQuestion = {
    subject: state.selectedManualSubject,
    category: state.selectedManualCategory,
    text: questionText,
    imgurl: sanitizeImagePath(form.imgurl.value),
    options: options,
    optionImages: optionImages,
    answer: correctOptionText,
    explanation: form.explanation.value.trim() || null,
    explanationImage: sanitizeImagePath(form.explanationImage.value),
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = await addDoc(collection(db, "questions"), newQuestion);
    const addedQ = { id: docRef.id, ...newQuestion };
    setState({
      allQuestions: [...state.allQuestions, addedQ],
    });
    alert("題目新增成功！");
    
    // Reset form inputs
    form.questionText.value = "";
    form.imgurl.value = "";
    form.option1.value = "";
    form.option2.value = "";
    form.option3.value = "";
    form.option4.value = "";
    form.option1_img.value = "";
    form.option2_img.value = "";
    form.option3_img.value = "";
    form.option4_img.value = "";
    form.answer.value = "A";
    form.explanation.value = "";
    form.explanationImage.value = "";
  } catch (err) {
    console.error("Error adding question:", err);
    alert("新增失敗: " + err.message);
  } finally {
    setLoading(false);
  }
}

// ==================== 用戶管理 ====================

/**
 * 更新用戶資料
 * @param {Event} e 
 */
export async function handleUpdateUser(e) {
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

/**
 * 刪除用戶（含所有相關資料）
 * @param {string} id 
 */
export async function handleDeleteUser(id) {
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
    historySnap.forEach((docItem) => batch1.delete(docItem.ref));
    await batch1.commit();

    // 2. Delete Bookmarks
    const bookmarkQ = query(
      collection(db, "bookmarkedQuestions"),
      where("userId", "==", id)
    );
    const bookmarkSnap = await getDocs(bookmarkQ);
    const batch2 = writeBatch(db);
    bookmarkSnap.forEach((docItem) => batch2.delete(docItem.ref));
    await batch2.commit();

    // 3. Delete Assignment Submissions
    const submissionQ = query(
      collection(db, "assignmentSubmissions"),
      where("userId", "==", id)
    );
    const submissionSnap = await getDocs(submissionQ);
    const batch3 = writeBatch(db);
    submissionSnap.forEach((docItem) => batch3.delete(docItem.ref));
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

/**
 * 刪除考試紀錄
 * @param {string} id 
 */
export async function handleDeleteExamHistory(id) {
  if (!confirm("確定要刪除此紀錄嗎？")) return;
  setLoading(true);
  try {
    await deleteDoc(doc(db, "examHistory", id));

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

/**
 * 刪除書籤
 * @param {string} questionId 
 * @param {string} userId 
 */
export async function handleDeleteBookmark(questionId, userId) {
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
