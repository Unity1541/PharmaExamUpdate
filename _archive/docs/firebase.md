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
-   `assignments/{assignmentId}`：儲存手寫/申論作業題目（公開讀取，僅管理員寫入）。
-   `assignmentSubmissions/{submissionId}`：儲存學生的作業作答（學生讀寫自己的，管理員讀寫所有的）。

## 安全性規則內容

將以下規則複製到您的 Firebase 專案中的 **Firestore Database > 規則** 頁籤並發布。

### 重要提示：管理員帳號

在目前的前端實作中，系統被設計為將電子郵件為 `admin@test.com` 的帳號視為**唯一的系統管理員**。

當此帳號首次登入時，應用程式會嘗試在 Firestore 中為其建立一個使用者文件並設定 `role: 'admin'`。下方的安全規則已設定為僅允許 `admin@test.com` 這個帳號在建立文件時將角色設定為 'admin'，確保了系統的安全性。**您無需手動建立此文件。**

---

## 如何建立管理者帳號

以下提供三種方法來建立或設定管理者帳號，您可以根據需求選擇最適合的方式。

### 方法一：修改程式碼中的管理員 Email（推薦）

這是最簡單且最安全的方式，適合想要更換預設管理員或新增多個管理員的情況。

#### 步驟：

1. **開啟 Firebase 安全規則編輯器**
   - 進入 [Firebase Console](https://console.firebase.google.com/)
   - 選擇您的專案
   - 點選左側選單的 **Firestore Database**
   - 切換到 **規則 (Rules)** 頁籤

2. **修改安全規則中的管理員 Email**
   
   找到以下程式碼區塊：
   ```
   allow create: if isSignedIn() && request.auth.uid == userId && (
       (request.auth.token.email == 'admin@test.com' && request.resource.data.role == 'admin') ||
       (request.auth.token.email != 'admin@test.com' && request.resource.data.role == 'student')
   );
   ```
   
   若要**新增多個管理員**，修改為：
   ```
   allow create: if isSignedIn() && request.auth.uid == userId && (
       ((request.auth.token.email == 'admin@test.com' || 
         request.auth.token.email == 'admin2@example.com' ||
         request.auth.token.email == 'your-email@example.com') && 
        request.resource.data.role == 'admin') ||
       (request.auth.token.email != 'admin@test.com' && 
        request.auth.token.email != 'admin2@example.com' &&
        request.auth.token.email != 'your-email@example.com' &&
        request.resource.data.role == 'student')
   );
   ```

3. **點選「發布 (Publish)」以儲存變更**

4. **使用新的管理員 Email 登入系統**
   - 新管理員首次登入時，系統會自動建立 `role: 'admin'` 的使用者文件

---

### 方法二：透過 Firebase Console 手動設定（快速但需謹慎）

此方法適合臨時需要將現有使用者提升為管理員的情況。

#### 前置條件：
- 該使用者必須已經在系統中有登入紀錄（已存在於 `users` 集合中）

#### 步驟：

1. **進入 Firebase Console**
   - 開啟 [Firebase Console](https://console.firebase.google.com/)
   - 選擇您的專案

2. **前往 Firestore Database**
   - 點選左側選單的 **Firestore Database**
   - 確認您在 **資料 (Data)** 頁籤

3. **找到目標使用者文件**
   - 點選 `users` 集合
   - 找到要設為管理員的使用者文件（文件 ID 通常是使用者的 UID）
   - 您可以參考 `email` 欄位來確認是正確的使用者

4. **修改 role 欄位**
   - 點選該使用者文件
   - 找到 `role` 欄位
   - 點選欄位值旁的編輯圖示（鉛筆圖示）
   - 將值從 `student` 改為 `admin`
   - 點選 **更新 (Update)** 按鈕

5. **完成！**
   - 該使用者重新整理頁面或重新登入後，即可使用管理員功能

> ⚠️ **注意事項：**
> - 此方法繞過了安全規則的限制，請確保只有授權人員可以存取 Firebase Console
> - 建議同時更新安全規則（方法一），以便該管理員能在規則範圍內正常操作

---

### 方法三：使用 Firebase Admin SDK（進階，適合自動化）

此方法適合需要透過後端程式自動管理使用者角色的情況。

#### 前置條件：
- 需要有後端伺服器或 Cloud Functions 環境
- 已設定好 Firebase Admin SDK

#### 步驟：

1. **安裝 Firebase Admin SDK**
   ```bash
   npm install firebase-admin
   ```

2. **初始化 Admin SDK**
   ```javascript
   const admin = require('firebase-admin');
   const serviceAccount = require('./path/to/serviceAccountKey.json');
   
   admin.initializeApp({
     credential: admin.credential.cert(serviceAccount)
   });
   
   const db = admin.firestore();
   ```

3. **建立或更新管理員帳號**
   ```javascript
   async function setUserAsAdmin(userId) {
     try {
       await db.collection('users').doc(userId).set({
         role: 'admin',
         updatedAt: admin.firestore.FieldValue.serverTimestamp()
       }, { merge: true });
       
       console.log(`使用者 ${userId} 已設為管理員`);
     } catch (error) {
       console.error('設定管理員失敗:', error);
     }
   }
   
   // 使用方式：傳入使用者的 UID
   setUserAsAdmin('使用者的UID');
   ```

4. **（選用）透過 Email 查找使用者並設為管理員**
   ```javascript
   async function setAdminByEmail(email) {
     try {
       // 先透過 Auth 取得使用者資訊
       const userRecord = await admin.auth().getUserByEmail(email);
       const userId = userRecord.uid;
       
       // 更新 Firestore 中的角色
       await db.collection('users').doc(userId).set({
         email: email,
         role: 'admin',
         updatedAt: admin.firestore.FieldValue.serverTimestamp()
       }, { merge: true });
       
       console.log(`使用者 ${email} (UID: ${userId}) 已設為管理員`);
     } catch (error) {
       console.error('設定管理員失敗:', error);
     }
   }
   
   // 使用方式
   setAdminByEmail('new-admin@example.com');
   ```

> 💡 **取得 Service Account Key：**
> 1. 進入 Firebase Console → 專案設定 → 服務帳戶
> 2. 點選「產生新的私密金鑰」
> 3. 下載 JSON 檔案並妥善保管（切勿上傳至版本控制系統）

---

### 各方法比較表

| 方法 | 難度 | 適用情況 | 安全性 |
|------|------|----------|--------|
| 方法一：修改安全規則 | ⭐ 簡單 | 新增固定管理員 | ✅ 高 |
| 方法二：Console 手動修改 | ⭐ 簡單 | 臨時提升權限 | ⚠️ 中（需控管 Console 存取權） |
| 方法三：Admin SDK | ⭐⭐⭐ 進階 | 自動化管理 | ✅ 高 |

---

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
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /categories/{categoryId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /questions/{questionId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }
    
    // ===== Assignments (Handwritten/Essay) =====
    // 手寫作業題目
    match /assignments/{assignmentId} {
      // 所有登入者皆可讀取作業題目
      allow read: if isSignedIn();
      // 僅管理員可新增/修改/刪除作業
      allow write: if isAdmin();
    }
    
    // 手寫作業作答
    match /assignmentSubmissions/{submissionId} {
      // 學生只能讀取自己的作答，管理員可讀取所有
      allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      
      // 學生可以建立自己的作答
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      
      // 更新規則：
      // 1. 學生可以更新自己的作答 (例如：儲存草稿、提交)，但不能更改別人的，也不能更改評分欄位(如果有的話，需在前端/後端邏輯控制，這裡做基本權限)
      // 2. 管理員可以更新任何作答 (例如：評分、回饋)
      allow update: if isSignedIn() && (
        (resource.data.userId == request.auth.uid) || isAdmin()
      );
      
      // 僅管理員可刪除 (或學生刪除草稿，視需求而定，此處從嚴)
      allow delete: if isAdmin();
    }

    // ===== Announcements =====
    // 公告欄
    match /announcements/{announcementId} {
      // 登入使用者可讀取
      allow read: if isSignedIn();
      // 僅管理員可寫入
      allow write: if isAdmin();
    }

    // ===== Student-Specific Data =====
    // 學生個人資料
    
    // 測驗歷史
    match /examHistory/{historyId} {
      allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isAdmin();
    }
    
    // 標記的題目
    match /bookmarkedQuestions/{bookmarkId} {
      allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow delete: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow update: if false;
    }
  }
}
```