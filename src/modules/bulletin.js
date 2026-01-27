/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 公告板模組 - 公告的新增、編輯、刪除
 */

import {
  db,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
} from "../firebase.js";
import { state, setState, setLoading } from "../state.js";

/**
 * 新增或編輯公告
 * @param {Event} e 
 */
export async function handleAddAnnouncement(e) {
  e.preventDefault();
  setLoading(true);
  const form = e.target;

  // Check if we are editing or creating
  const isEditing = !!state.editingAnnouncement;

  const data = {
    title: form.title.value.trim(),
    content: form.content.value.trim(),
    isBold: form.isBold.checked,
    color: form.color.value,
    updatedAt: new Date().toISOString(),
  };

  if (!data.title || !data.content) {
    alert("請輸入標題和內容");
    setLoading(false);
    return;
  }

  try {
    if (isEditing) {
      await updateDoc(doc(db, "announcements", state.editingAnnouncement.id), data);
      alert("公告已更新");
    } else {
      data.createdAt = new Date().toISOString();
      data.authorId = state.currentUser.id;
      data.authorName = state.currentUser.name;
      await addDoc(collection(db, "announcements"), data);
      alert("公告已發佈");
    }

    setState({ editingAnnouncement: null });
    window.closeBulletinModal?.();
  } catch (error) {
    console.error("Error saving announcement:", error);
    alert("儲存失敗: " + error.message);
  } finally {
    setLoading(false);
  }
}

/**
 * 刪除公告
 * @param {string} id 
 */
export async function handleDeleteAnnouncement(id) {
  if (!confirm("確定要刪除此公告？")) return;
  setLoading(true);
  try {
    await deleteDoc(doc(db, "announcements", id));
  } catch (e) {
    console.error(e);
    alert("刪除失敗");
  } finally {
    setLoading(false);
  }
}
