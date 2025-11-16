# Firebase 安全性規則 (Firestore Security Rules)

這份文件提供了適用於「線上考試系統」的 Firestore 安全性規則。這些規則旨在保護您的資料庫，確保使用者只能存取其被授權的資料。

## 為什麼需要安全性規則？

Firestore 安全性規則可以讓您精確控制對資料庫中每個文件和集合的存取權限。若沒有設定規則，您的資料庫將會完全開放，任何人都可以讀取、寫入甚至刪除您的所有資料，這會造成嚴重的安全風險。

## 假設的資料庫結構

這些規則是基於以下的 Firestore 資料庫結構設計的：

-   `users/{userId}`：儲存使用者個人資料，包含一個 `role` 欄位（'student' 或 'admin'）。
-   `subjects/{subjectId}`：儲存科目資訊。
-   `categories/{categoryId}`：儲存類別資訊（建議包含 `subjectName` 欄位以便查詢）。
-   `questions/{questionId}`：儲存題目資訊（建議包含 `subject` 和 `category` 欄位以便查詢）。
-   `examHistory/{historyId}`：儲存學生的測驗記錄（必須包含 `userId` 欄位）。
-   `bookmarkedQuestions/{bookmarkId}`：儲存學生標記的題目（必須包含 `userId` 和 `questionId` 欄位）。

## 安全性規則內容

將以下規則複製到您的 Firebase 專案中的 **Firestore Database > 規則** 頁籤並發布。

### 重要提示：管理員帳號

在目前的前端實作中，系統被設計為將電子郵件為 `admin@test.com` 的帳號視為**唯一的系統管理員**。

當此帳號首次登入時，應用程式會嘗試在 Firestore 中為其建立一個使用者文件並設定 `role: 'admin'`。下方的安全規則已設定為僅允許 `admin@test.com` 這個帳號在建立文件時將角色設定為 'admin'，確保了系統的安全性。**您無需手動建立此文件。**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ===== Helper Functions =====
    // 檢查請求的使用者是否為管理員
    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    // 檢查使用者是否已登入
    function isSignedIn() {
      return request.auth != null;
    }

    // ===== Users Collection =====
    // 使用者資料
    match /users/{userId} {
      // 學生只能讀取自己的資料，管理員可以讀取所有人的資料
      allow read: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      
      // 學生只能更新自己的資料 (且不能更改自己的 role)
      // 管理員可以更新任何人的資料
      allow update: if isSignedIn() && 
                    (request.auth.uid == userId && request.resource.data.role == resource.data.role) || 
                    isAdmin();
      
      // 允許使用者建立自己的帳號文件，並根據 email 安全地設定角色
      allow create: if isSignedIn() && request.auth.uid == userId && (
          (request.auth.token.email == 'admin@test.com' && request.resource.data.role == 'admin') ||
          (request.auth.token.email != 'admin@test.com' && request.resource.data.role == 'student')
      );

      // 只有管理員可以刪除使用者帳號
      allow delete: if isAdmin();
    }

    // ===== Subjects, Categories, Questions Collections =====
    // 考試內容相關資料
    match /subjects/{subjectId} {
      // 所有登入的使用者都可以讀取科目
      allow read: if isSignedIn();
      // 只有管理員可以新增、修改、刪除科目
      allow write: if isAdmin();
    }

    match /categories/{categoryId} {
      // 所有登入的使用者都可以讀取類別
      allow read: if isSignedIn();
      // 只有管理員可以新增、修改、刪除類別
      allow write: if isAdmin();
    }

    match /questions/{questionId} {
      // 所有登入的使用者都可以讀取題目
      allow read: if isSignedIn();
      // 只有管理員可以新增、修改、刪除題目
      allow write: if isAdmin();
    }

    // ===== Student-Specific Data =====
    // 學生個人資料
    
    // 測驗歷史
    match /examHistory/{historyId} {
      // 學生只能讀取自己的歷史紀錄，管理員可以讀取所有人的
      allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      // 學生只能為自己建立新的歷史紀錄
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      // 學生不能修改或刪除歷史紀錄，只有管理員可以
      allow update, delete: if isAdmin();
    }
    
    // 標記的題目
    match /bookmarkedQuestions/{bookmarkId} {
      // 學生只能讀取自己標記的題目，管理員可以讀取所有人的
      allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      // 學生只能為自己建立標記
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      // 學生可以刪除自己的標記，管理員也可以刪除任何人的標記
      allow delete: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      // 不允許更新標記
      allow update: if false;
    }
  }
}
```

## 規則詳解

-   **`isAdmin()` 輔助函式**: 這是一個自訂函式，用來檢查發出請求的使用者是否在其 `users` 文件中擁有 `role: 'admin'` 的身份。這讓規則更容易閱讀和管理。
-   **`users` 集合**:
    -   `create`: **（已修正）** 允許使用者建立自己的帳號文件。關鍵的檢查是 `request.auth.token.email`，確保只有 `admin@test.com` 能將角色設為 `'admin'`，從而解決了權限的循環依賴問題。
    -   `read`: 允許使用者讀取自己的資料，而管理員可以讀取所有使用者的資料。
    -   `update`: 允許使用者更新自己的資料，但有一個重要的限制：`request.resource.data.role == resource.data.role`，這可以防止學生自行將自己的角色修改為 `admin`。管理員則不受此限。
    -   `delete`: 只有管理員有權刪除帳號。
-   **`subjects`, `categories`, `questions` 集合**:
    -   `read`: 任何登入的使用者（學生或管理員）都可以讀取這些公開的考試資料。
    -   `write`: 只有管理員可以建立、修改或刪除這些核心的考試內容。
-   **`examHistory` 集合**:
    -   `read`, `create`: 嚴格限制學生只能存取和建立自己的測驗記錄 (`userId` 必須符合自己的 `uid`)。
    -   `update`, `delete`: 完全禁止學生修改或刪除已存在的測驗記錄，以確保成績的公正性。只有管理員可以操作。
-   **`bookmarkedQuestions` 集合**:
    -   與測驗歷史類似，學生只能管理自己的書籤。
    -   `delete`: 允許學生刪除自己的書籤，這是合理的操作。

## 如何部署

1.  前往您的 [Firebase Console](https://console.firebase.google.com/)。
2.  選擇您的專案。
3.  在左側導覽列中，點擊 **建構 > Firestore Database**。
4.  點擊頂部的 **規則** 頁籤。
5.  將上述規則內容貼到編輯器中。
6.  點擊 **發布** 按鈕。