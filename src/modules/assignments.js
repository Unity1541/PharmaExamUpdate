/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 作業系統模組 - 手寫作業功能
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
} from "../firebase.js";
import { state, setState, setLoading } from "../state.js";
import { sanitizeImagePath } from "../utils/helpers.js";

/**
 * 新增作業
 * @param {Event} e 
 */
export async function handleAddAssignment(e) {
  e.preventDefault();
  setLoading(true);
  const form = e.target;

  // Extract multiple questions
  const questionBlocks = form.querySelectorAll(".question-block");
  const questions = [];
  let totalMaxScore = 0;

  questionBlocks.forEach((block) => {
    const text = block.querySelector('textarea[name="questionText"]').value;
    const image = sanitizeImagePath(block.querySelector('input[name="imageUrl"]').value);
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
    category: form.category.value || null,
    questions: questions,
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
    // Reset form
    const container = document.getElementById("questions-container");
    if (container) {
      container.innerHTML = "";
      window.addAssignmentQuestionField?.();
    }
    form.reset();
  } catch (error) {
    console.error("Error adding assignment:", error);
    alert("新增失敗: " + error.message);
  } finally {
    setLoading(false);
  }
}

/**
 * 刪除作業
 * @param {string} id 
 */
export async function handleDeleteAssignment(id) {
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

/**
 * 學生提交作業
 * @param {string} status 'submitted' 或 'draft'
 */
export async function handleAssignmentSubmit(status = "submitted") {
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
    answers: answers,
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

/**
 * 管理員評分作業
 * @param {Event} e 
 */
export async function handleAdminGradeSubmission(e) {
  e.preventDefault();
  setLoading(true);
  const form = e.target;
  const score = parseInt(form.score.value, 10);
  const feedback = form.feedback.value;
  const feedbackImageUrl = sanitizeImagePath(form.feedbackImageUrl.value);
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
