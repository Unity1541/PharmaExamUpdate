/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 考試邏輯模組 - 考試開始、答題、完成等功能
 */

import { 
  db, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc 
} from "../firebase.js";
import { state, setState, setLoading } from "../state.js";
import { formatTime, calculateRadarData } from "../utils/helpers.js";

/**
 * 開始考試
 * @param {string} subject 科目名稱
 * @param {string} categoryName 類別名稱
 */
export function startExam(subject, categoryName) {
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
    answers: {},
    currentQuestionIndex: 0,
    startTime: new Date(),
    timeLeft: category.timeLimit * 60,
    timerInterval: setInterval(() => {
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

/**
 * 處理答案選擇
 * @param {string} questionId 
 * @param {number} optionIndex 
 */
export function handleAnswerSelection(questionId, optionIndex) {
  if (!state.examState) return;
  const newAnswers = {
    ...state.examState.answers,
    [questionId]: optionIndex,
  };
  setState({ examState: { ...state.examState, answers: newAnswers } });
}

/**
 * 處理題目導航
 * @param {number} direction 1 = 下一題, -1 = 上一題
 */
export function handleQuestionNavigation(direction) {
  if (!state.examState) return;
  const newIndex = state.examState.currentQuestionIndex + direction;
  if (newIndex >= 0 && newIndex < state.examState.questions.length) {
    setState({
      examState: { ...state.examState, currentQuestionIndex: newIndex },
    });
  }
}

/**
 * 跳至指定題目
 * @param {number} index 
 */
export function handleJumpToQuestion(index) {
  if (!state.examState) return;
  setState({
    examState: { ...state.examState, currentQuestionIndex: index },
  });
}

/**
 * 處理書籤切換
 * @param {string} questionId 
 */
export async function handleBookmarkToggle(questionId) {
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
export const handleReviewBookmarkToggle = handleBookmarkToggle;

/**
 * 完成考試並儲存成績
 */
export async function handleFinishExam() {
  if (!state.examState) return;
  clearInterval(state.examState.timerInterval);
  setLoading(true);

  const { questions, answers, subject, category } = state.examState;
  let correctCount = 0;
  questions.forEach((q) => {
    const userAns = answers[q.id];
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
    answers,
    questions: questions.map((q) => q.id),
    date: new Date().toISOString(),
  };

  try {
    await addDoc(collection(db, "examHistory"), historyData);

    setState({
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
