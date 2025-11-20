
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, collection, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, writeBatch } from './firebase.js';

window.addEventListener('DOMContentLoaded', () => {

    // --- STATE MANAGEMENT (needed for initial render if config is missing) ---
     let state = {
      isLoading: false,
      isLoggedIn: false,
      currentUser: null,
      loginError: '',
      loginAsRole: 'student',
      currentView: 'login',
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
      uploadStatus: 'idle', // idle, success, error
      uploadMessage: '',
      selectedExamSubject: null,
      examState: null,
      reviewingExam: null,
      reviewingBookmarkedQuestionId: null,
      editingQuestion: null,
      editingUser: null,
    };

    // --- INITIAL COMPONENT CREATORS (needed for initial render if config is missing) ---
    function createLoginViewHTML() {
        const headerText = state.loginAsRole === 'student' ? '學生登入' : '管理員登入';
        const buttonText = state.loginAsRole === 'student' ? '登入' : '管理員登入';

        return `
        <div class="login-box">
            <div class="login-header">
                <div class="logo">考</div>
                <h1>${headerText}</h1>
            </div>
            
            <div class="login-role-selector">
                <button class="role-tab ${state.loginAsRole === 'student' ? 'active' : ''}" data-role="student">學生登入</button>
                <button class="role-tab ${state.loginAsRole === 'admin' ? 'active' : ''}" data-role="admin">管理員登入</button>
            </div>

            <form id="login-form" class="login-form">
                <div class="input-group">
                    <label for="email">電子郵件</label>
                    <input type="email" id="email" name="email" placeholder="請輸入電子郵件" required>
                </div>
                <div class="input-group">
                    <label for="password">密碼</label>
                    <input type="password" id="password" name="password" placeholder="請輸入密碼" required>
                </div>
                <div class="error-message">${state.loginError}</div>
                <button type="submit" class="login-button">${buttonText}</button>
            </form>
        </div>
        `;
    }

    // Check if Firebase was initialized successfully by checking the exported auth object
    if (!auth) {
        const root = document.getElementById('root');
        root.innerHTML = `
            <div id="login-container" style="filter: blur(5px); pointer-events: none; height: 100vh;">
                ${createLoginViewHTML()}
            </div>
            <div class="setup-modal-backdrop">
                <div class="setup-modal-content">
                    <div class="attention-box">
                        <strong>注意：這不是程式錯誤！</strong>
                        <p>這是一個必要的設定步驟。請依照下方的指南完成設定。</p>
                    </div>
                    <h1>Firebase 設定尚未完成</h1>
                    <p>應用程式需要您的 Firebase 專案憑證才能運作。請依照以下步驟設定：</p>
                    <h2>操作步驟</h2>
                    <ol>
                        <li><strong>開啟 <code>firebase.js</code> 檔案</strong>：在您的專案資料夾中找到並開啟這個檔案。</li>
                        <li><strong>找到 <code>firebaseConfig</code> 物件</strong>：它位於檔案的開頭附近。</li>
                        <li>
                            <strong>從 Firebase 專案複製您的設定</strong>：
                            <ul style="padding-left: 1.5rem; margin-top: 0.5rem; color: #555;">
                                <li>前往 <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer">Firebase 控制台</a> 並選擇您的專案。</li>
                                <li>點擊左上角的齒輪圖示 <code>⚙️</code>，然後選擇「專案設定」。</li>
                                <li>在「一般」分頁下方，捲動到「您的應用程式」區塊。</li>
                                <li>找到您的 Web 應用程式，然後選擇「設定」的「SDK 設定和設定」選項。</li>
                                <li>複製整個 <code>firebaseConfig</code> 物件的內容。</li>
                            </ul>
                        </li>
                        <li><strong>貼上並替換預設值</strong>：將您複製的設定貼到 <code>firebase.js</code> 中，完全取代現有的預留位置。</li>
                        <li><strong>儲存檔案</strong>：這一步非常重要！請務必儲存您對 <code>firebase.js</code> 的修改。</li>
                        <li><strong>重新整理頁面</strong>：完成以上步驟後，回到瀏覽器並重新整理此頁面。</li>
                    </ol>
                    <p class="final-note">如果問題仍然存在，請確認您複製的憑證是否正確無誤。</p>
                </div>
            </div>`;
        document.getElementById('login-container').style.display = 'flex';
        console.error("Firebase is not initialized. Please add your credentials to firebaseConfig in firebase.js.");
        return;
    }

    // --- MOCK DATA (used as a fallback or for student profiles not yet in Firestore) ---
    const mockData = {
        users: {
            "student_uid_123": {
                uid: "student_uid_123",
                name: "張三",
                email: "student@test.com",
                role: "student",
                averageScore: 88,
                ranking: 5,
                examsTaken: 2,
                level: 12,
                currentExp: 450,
                nextLevelExp: 1000,
                radarChartData: [
                    { "subject": "數學", "score": 85 },
                    { "subject": "英語", "score": 90 }
                ],
                examHistory: [
                    {
                        id: 'hist_1',
                        subject: "數學",
                        category: "代數",
                        score: 85,
                        date: new Date('2023-10-26T10:00:00Z').toISOString(),
                        results: [
                            { id: 'q1', text: '1 + 1 等於多少？', options: ['1', '2', '3', '4'], answer: '2', explanation: '這是基礎數學。', userAnswer: '2', isCorrect: true },
                            { id: 'q2', text: '2 x 2 等於多少？', options: ['2', '3', '4', '5'], answer: '4', explanation: '這是基礎乘法。', userAnswer: '3', isCorrect: false }
                        ]
                    }
                ],
                bookmarkedQuestions: [
                     { id: 'q2', questionText: '2 x 2 等於多少？', subject: '數學' }
                ]
            }
        },
    };

    const setState = (newState) => {
      if (newState.selectedAdminSubject !== undefined && newState.selectedAdminSubject !== state.selectedAdminSubject) {
        newState.selectedAdminCategory = null;
      }
      if (newState.selectedBulkUploadSubject !== undefined && newState.selectedBulkUploadSubject !== state.selectedBulkUploadSubject) {
        newState.selectedBulkUploadCategory = null;
        newState.selectedFile = null;
        newState.uploadStatus = 'idle';
        newState.uploadMessage = '';
      }
      // Correctly clear the timer only when navigating away from the exam view.
      if (newState.currentView && newState.currentView !== 'exam-taking' && state.examState?.timerInterval) {
        clearInterval(state.examState.timerInterval);
        if (newState.examState === undefined) {
          newState.examState = null;
        }
      }
      state = { ...state, ...newState };
      render();
    };

    const setLoading = (isLoading) => {
        const indicator = document.getElementById('loading-indicator');
        if (indicator) {
            indicator.style.display = isLoading ? 'flex' : 'none';
        }
        state.isLoading = isLoading;
    };

    // --- ICONS (SVG) ---
    const icons = {
        dashboard: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>`,
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
    };

    // --- DATA HELPERS ---
    function getQuestionCounts(allQuestions) {
        const subjectCounts = {};
        const categoryCounts = {}; // Keyed by "SubjectName-CategoryName"

        allQuestions.forEach(q => {
            subjectCounts[q.subject] = (subjectCounts[q.subject] || 0) + 1;
            const categoryKey = `${q.subject}-${q.category}`;
            categoryCounts[categoryKey] = (categoryCounts[categoryKey] || 0) + 1;
        });

        return { subjectCounts, categoryCounts };
    }


    // --- FIREBASE AUTHENTICATION & DATA HANDLERS ---
    async function handleLogin(e) {
        e.preventDefault();
        setLoading(true);
        setState({ loginError: '' });

        const email = e.target.email.value;
        const password = e.target.password.value;

        try {
            // Just attempt to sign in. `onAuthStateChanged` will handle the logic after success.
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            let message = '電子郵件或密碼錯誤。';
            // The error code 'auth/invalid-login-credentials' is for newer SDKs.
            // 'auth/user-not-found' and 'auth/wrong-password' are older but good fallbacks.
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                 message = '電子郵件或密碼錯誤，請檢查您的輸入。';
            }
            console.error("Firebase login error:", error.code);
            setState({ loginError: message });
        } finally {
            setLoading(false);
        }
    }

    function handleLogout() {
        signOut(auth).catch((error) => {
            console.error("Logout failed:", error);
            alert("登出時發生錯誤。");
        });
        // onAuthStateChanged will handle state reset and UI update
    }

    async function handleAddSubject(e) {
        e.preventDefault();
        setLoading(true);
        const form = e.target;
        const subjectName = form.subjectName.value.trim();
        const description = form.description.value.trim();

        if (!subjectName || !description) {
            alert('請填寫所有欄位。');
            setLoading(false);
            return;
        }

        if (state.subjects.some(s => s.name.toLowerCase() === subjectName.toLowerCase())) {
            alert('該科目名稱已存在。');
            setLoading(false);
            return;
        }

        try {
            const subjectsCollection = collection(db, 'subjects');
            const newDocRef = await addDoc(subjectsCollection, {
                name: subjectName,
                description: description,
            });

            const newSubject = {
                id: newDocRef.id,
                name: subjectName,
                description: description
            };
            
            setState({
                subjects: [...state.subjects, newSubject].sort((a, b) => a.name.localeCompare(b.name)),
                categories: { ...state.categories, [subjectName]: [] }
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
            alert('請填寫所有欄位並確保時間限制為正數。');
            setLoading(false);
            return;
        }

        if (state.categories[subjectName] && state.categories[subjectName].some(c => c.name.toLowerCase() === categoryName.toLowerCase())) {
            alert('該類別名稱已存在於此科目中。');
            setLoading(false);
            return;
        }

        try {
            const categoriesCollection = collection(db, 'categories');
            const newDocRef = await addDoc(categoriesCollection, {
                name: categoryName,
                subject: subjectName,
                timeLimit: timeLimit
            });
            
            const newCategory = {
                id: newDocRef.id,
                name: categoryName,
                subject: subjectName,
                timeLimit: timeLimit
            };

            const updatedCategories = { ...state.categories };
            const subjectCategories = [...(updatedCategories[subjectName] || []), newCategory];
            subjectCategories.sort((a,b) => a.name.localeCompare(b.name));
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
    
    async function handleDeleteSubject(subjectName) {
        if (!confirm(`您確定要刪除整個 "${subjectName}" 科目嗎？\n這將會一併刪除其下的所有類別和題目。此操作無法復原。`)) {
            return;
        }
        setLoading(true);

        try {
            const batch = writeBatch(db);

            const subjectToDelete = state.subjects.find(s => s.name === subjectName);
            if (!subjectToDelete) throw new Error("找不到要刪除的科目。");
            batch.delete(doc(db, "subjects", subjectToDelete.id));

            const categoriesQuery = query(collection(db, "categories"), where("subject", "==", subjectName));
            const categoriesSnapshot = await getDocs(categoriesQuery);
            categoriesSnapshot.forEach(doc => batch.delete(doc.ref));
            
            const questionsQuery = query(collection(db, "questions"), where("subject", "==", subjectName));
            const questionsSnapshot = await getDocs(questionsQuery);
            questionsSnapshot.forEach(doc => batch.delete(doc.ref));

            await batch.commit();

            const newSubjects = state.subjects.filter(s => s.name !== subjectName);
            const newCategories = { ...state.categories };
            delete newCategories[subjectName];
            const newQuestions = state.allQuestions.filter(q => q.subject !== subjectName);

            setState({
                subjects: newSubjects,
                categories: newCategories,
                allQuestions: newQuestions,
                selectedAdminSubject: state.selectedAdminSubject === subjectName ? null : state.selectedAdminSubject,
            });

            alert(`科目 "${subjectName}" 及其所有相關內容已成功刪除。`);
        } catch (error) {
            console.error("Error deleting subject:", error);
            alert(`刪除失敗：${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteCategory(subjectName, categoryName) {
        if (!confirm(`您確定要刪除 "${subjectName}" 科目中的 "${categoryName}" 類別嗎？\n這將會一併刪除其下的所有題目。此操作無法復原。`)) {
            return;
        }
        setLoading(true);

        try {
            const batch = writeBatch(db);

            const categoryToDelete = state.categories[subjectName]?.find(c => c.name === categoryName);
            if (!categoryToDelete) throw new Error("找不到要刪除的類別。");
            batch.delete(doc(db, "categories", categoryToDelete.id));
            
            const questionsQuery = query(collection(db, "questions"), where("subject", "==", subjectName), where("category", "==", categoryName));
            const questionsSnapshot = await getDocs(questionsQuery);
            questionsSnapshot.forEach(doc => batch.delete(doc.ref));

            await batch.commit();

            const updatedCategoriesForSubject = state.categories[subjectName].filter(c => c.name !== categoryName);
            const newCategories = { ...state.categories, [subjectName]: updatedCategoriesForSubject };
            const newQuestions = state.allQuestions.filter(q => !(q.subject === subjectName && q.category === categoryName));

            setState({
                categories: newCategories,
                allQuestions: newQuestions,
                selectedAdminCategory: state.selectedAdminCategory === categoryName ? null : state.selectedAdminCategory,
            });

            alert(`類別 "${categoryName}" 及其所有相關題目已成功刪除。`);
        } catch (error) {
            console.error("Error deleting category:", error);
            alert(`刪除失敗：${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteQuestion(questionId) {
        if (!confirm('您確定要刪除這道題目嗎？')) return;
        setLoading(true);
        try {
            await deleteDoc(doc(db, "questions", questionId));
            const updatedQuestions = state.allQuestions.filter(q => q.id !== questionId);
            setState({ allQuestions: updatedQuestions });
            alert('題目已成功刪除。');
        } catch (error) {
            console.error("Error deleting question:", error);
            alert(`刪除失敗：${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdateQuestion(e) {
        e.preventDefault();
        if (!state.editingQuestion) return;
        setLoading(true);
        const form = e.target;
        const questionId = state.editingQuestion.id;

        const updatedQuestionData = {
            text: form.questionText.value,
            imgurl: form.imgurl.value.trim(),
            options: [
                form.option1.value,
                form.option2.value,
                form.option3.value,
                form.option4.value,
            ],
            answer: form.answer.value,
            explanation: form.explanation.value,
        };

        try {
            const questionRef = doc(db, "questions", questionId);
            await updateDoc(questionRef, updatedQuestionData);

            const updatedQuestions = state.allQuestions.map(q => 
                q.id === questionId ? { ...q, ...updatedQuestionData } : q
            );
            
            setState({
                allQuestions: updatedQuestions,
                editingQuestion: null // Close modal on success
            });
            alert('題目已成功更新。');
        } catch (error) {
            console.error("Error updating question:", error);
            alert(`更新失敗：${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdateUser(e) {
        e.preventDefault();
        if (!state.editingUser) return;
        setLoading(true);
        const form = e.target;
        const userId = state.editingUser.id;
        const newName = form.userName.value.trim();
    
        if (!newName) {
            alert("使用者名稱不可為空。");
            setLoading(false);
            return;
        }
    
        try {
            const userRef = doc(db, "users", userId);
            await updateDoc(userRef, { name: newName });
    
            const updatedStudents = state.allStudents.map(u =>
                u.id === userId ? { ...u, name: newName } : u
            );
    
            setState({
                allStudents: updatedStudents,
                editingUser: null // Close modal on success
            });
            alert('使用者資訊已成功更新。');
        } catch (error) {
            console.error("Error updating user:", error);
            alert(`更新失敗：${error.message}`);
        } finally {
            setLoading(false);
        }
    }
    
    async function handleDeleteUser(userId) {
        const userToDelete = state.allStudents.find(u => u.id === userId);
        if (!userToDelete) return;
    
        if (!confirm(`您確定要刪除使用者 "${userToDelete.name}" (${userToDelete.email}) 嗎？\n這將會一併刪除該使用者的所有測驗記錄。此操作無法復原。`)) {
            return;
        }
        setLoading(true);
    
        try {
            const batch = writeBatch(db);
    
            // 1. Delete user document
            const userDocRef = doc(db, "users", userId);
            batch.delete(userDocRef);
    
            // 2. Query and delete exam history
            const historyQuery = query(collection(db, "examHistory"), where("userId", "==", userId));
            const historySnapshot = await getDocs(historyQuery);
            historySnapshot.forEach(doc => batch.delete(doc.ref));
    
            await batch.commit();
    
            // Update state
            const updatedStudents = state.allStudents.filter(u => u.id !== userId);
            setState({ allStudents: updatedStudents });
    
            alert(`使用者 "${userToDelete.name}" 已成功刪除。`);
        } catch (error) {
            console.error("Error deleting user:", error);
            alert(`刪除使用者失敗：${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function handleBulkUpload() {
        const { selectedFile, selectedBulkUploadSubject, selectedBulkUploadCategory } = state;
        if (!selectedFile || !selectedBulkUploadSubject || !selectedBulkUploadCategory) {
            alert('發生錯誤，請重新選擇科目、類別及檔案。');
            return;
        }
        if (!db) {
            alert('Firebase Firestore 未設定完成，無法上傳。');
            return;
        }

        setLoading(true);

        try {
            const fileContent = await selectedFile.text();
            const questionsToUpload = JSON.parse(fileContent);

            if (!Array.isArray(questionsToUpload)) {
                throw new Error('JSON 檔案格式不正確，根層級必須是一個陣列。');
            }
            if (questionsToUpload.length === 0) {
                throw new Error('JSON 檔案為空，沒有題目可上傳。');
            }

            const questionsCollection = collection(db, 'questions');
            let uploadedCount = 0;
            const newQuestionsForState = [];

            for (const question of questionsToUpload) {
                if (
                    !question.text || !question.options || !Array.isArray(question.options) ||
                    question.options.length === 0 || !question.answer || !question.explanation
                ) {
                    console.warn('正在跳過無效的題目物件:', question);
                    continue; 
                }

                const newQuestionData = {
                    ...question,
                    subject: selectedBulkUploadSubject,
                    category: selectedBulkUploadCategory,
                };

                const docRef = await addDoc(questionsCollection, newQuestionData);
                newQuestionsForState.push({ ...newQuestionData, id: docRef.id });
                uploadedCount++;
            }
            
            if (uploadedCount === 0) {
                 throw new Error('檔案中所有題目的格式都不正確，沒有成功上傳任何題目。');
            }

            setState({
                uploadStatus: 'success',
                uploadMessage: `上傳成功！已為 "${selectedBulkUploadCategory}" 新增 ${uploadedCount} 筆題目。`,
                selectedFile: null,
                allQuestions: [...state.allQuestions, ...newQuestionsForState]
            });
        } catch (error) {
            console.error('檔案上傳或解析錯誤:', error);
            setState({
                uploadStatus: 'error',
                uploadMessage: `上傳失敗：${error.message}`,
            });
        } finally {
            setLoading(false);
            setTimeout(() => setState({ uploadStatus: 'idle', uploadMessage: '' }), 5000);
        }
    }


    async function handleDeleteBookmark(questionId, userId) {
        if (!userId) return;
        if (!confirm("您確定要移除這個書籤嗎？")) return;
        setLoading(true);

        try {
            const bookmarksCollection = collection(db, 'bookmarkedQuestions');
            const q = query(bookmarksCollection, where("userId", "==", userId), where("questionId", "==", questionId));
            const querySnapshot = await getDocs(q);
            
            const batch = writeBatch(db);
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            // Update local state based on current view
            if(state.currentView === 'student-analytics' && state.selectedStudentAnalyticsData) {
                 const updatedAnalyticsData = {
                     ...state.selectedStudentAnalyticsData,
                     bookmarkedQuestions: state.selectedStudentAnalyticsData.bookmarkedQuestions.filter(q => q.id !== questionId)
                 };
                 setState({ selectedStudentAnalyticsData: updatedAnalyticsData });
            } else if (state.currentUser?.id === userId) { // Check if it's the current user's dashboard
                 const updatedBookmarks = state.currentUser.bookmarkedQuestions.filter(q => q.id !== questionId);
                 const updatedCurrentUser = { ...state.currentUser, bookmarkedQuestions: updatedBookmarks };
                 setState({ currentUser: updatedCurrentUser });
            }

            alert('書籤已移除。');
        } catch (error) {
            console.error("Error removing bookmark:", error);
            alert("移除書籤失敗。");
        } finally {
            setLoading(false);
        }
    }

    async function handleBookmarkToggle(questionId) {
        if (!state.examState || !state.currentUser) return;
        
        const newBookmarked = new Set(state.examState.bookmarked);
        const { id: userId } = state.currentUser;
        const isCurrentlyBookmarked = newBookmarked.has(questionId);

        // Optimistically update UI
        if (isCurrentlyBookmarked) {
            newBookmarked.delete(questionId);
        } else {
            newBookmarked.add(questionId);
        }
        setState({ examState: { ...state.examState, bookmarked: newBookmarked } });

        // Sync with Firestore
        try {
            const bookmarksCollection = collection(db, 'bookmarkedQuestions');
            if (isCurrentlyBookmarked) {
                // Remove bookmark
                const q = query(bookmarksCollection, where("userId", "==", userId), where("questionId", "==", questionId));
                const querySnapshot = await getDocs(q);
                const batch = writeBatch(db);
                querySnapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            } else {
                // Add bookmark
                await addDoc(bookmarksCollection, {
                    userId: userId,
                    questionId: questionId,
                    createdAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error("Error updating bookmark:", error);
            // Revert UI state if firestore fails
            alert("更新書籤失敗，請稍後再試。");
            const revertedBookmarked = new Set(state.examState.bookmarked);
            if (isCurrentlyBookmarked) {
                 revertedBookmarked.add(questionId);
            } else {
                 revertedBookmarked.delete(questionId);
            }
            setState({ examState: { ...state.examState, bookmarked: revertedBookmarked } });
        }
    }

    async function handleDeleteExamHistory(historyId) {
        if (!state.selectedStudentAnalyticsData) return;
        if (!confirm('您確定要刪除這筆測驗記錄嗎？此操作無法復原。')) return;
    
        setLoading(true);
        try {
            await deleteDoc(doc(db, "examHistory", historyId));
    
            // Update local state to reflect deletion
            const updatedHistory = state.selectedStudentAnalyticsData.examHistory.filter(h => h.id !== historyId);
            const updatedAnalyticsData = {
                ...state.selectedStudentAnalyticsData,
                examHistory: updatedHistory,
            };
    
            // Recalculate stats and update user document in Firestore
            const studentId = state.selectedStudentIdForAnalytics;
            const userDocRef = doc(db, 'users', studentId);
            
            const newExamsTaken = updatedHistory.length;
            const newTotalScore = updatedHistory.reduce((sum, h) => sum + h.score, 0);
            const newAverageScore = newExamsTaken > 0 ? Math.round(newTotalScore / newExamsTaken) : 0;
            
            await updateDoc(userDocRef, {
                examsTaken: newExamsTaken,
                totalScore: newTotalScore,
                averageScore: newAverageScore,
            });
    
            // Update local analytics data in state with new stats
            updatedAnalyticsData.examsTaken = newExamsTaken;
            updatedAnalyticsData.averageScore = newAverageScore;
    
            setState({ selectedStudentAnalyticsData: updatedAnalyticsData });
            
            alert('測驗記錄已成功刪除。');
        } catch (error) {
            console.error("Error deleting exam history:", error);
            alert(`刪除失敗：${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    // --- EXAM LOGIC ---
    function startExam(subjectName, categoryName) {
        const questions = state.allQuestions.filter(q => q.subject === subjectName && q.category === categoryName);
        const categoryData = state.categories[subjectName]?.find(c => c.name === categoryName);

        if (questions.length === 0 || !categoryData) {
            alert('此類別目前沒有題目或設定不正確。');
            return;
        }
        
        const timeLimitInSeconds = (categoryData.timeLimit || questions.length) * 60;

        const examState = {
            questions,
            currentQuestionIndex: 0,
            userAnswers: {},
            timeLeft: timeLimitInSeconds,
            timerInterval: setInterval(updateTimer, 1000),
            bookmarked: new Set()
        };
        setState({ currentView: 'exam-taking', examState });
    }

    function updateTimer() {
        if (state.examState && state.examState.timeLeft > 0) {
            const newTimeLeft = state.examState.timeLeft - 1;
            // Directly set new state, do not clear interval here
            setState({ examState: { ...state.examState, timeLeft: newTimeLeft } });

            if (newTimeLeft <= 0) {
                // Stop the timer and submit when time is up
                clearInterval(state.examState.timerInterval);
                handleFinishExam(true); 
            }
        } else if (state.examState) {
            // This case handles if timeLeft is somehow already 0 or less
            clearInterval(state.examState.timerInterval);
        }
    }

    function handleAnswerSelection(questionId, selectedOption) {
        if (!state.examState) return;
        const newUserAnswers = { ...state.examState.userAnswers, [questionId]: selectedOption };
        setState({ examState: { ...state.examState, userAnswers: newUserAnswers } });
    }

    function handleQuestionNavigation(direction) {
        if (!state.examState) return;
        const { currentQuestionIndex, questions } = state.examState;
        let newIndex = currentQuestionIndex;
        if (direction === 'next' && currentQuestionIndex < questions.length - 1) {
            newIndex++;
        } else if (direction === 'prev' && currentQuestionIndex > 0) {
            newIndex--;
        }
        setState({ examState: { ...state.examState, currentQuestionIndex: newIndex } });
    }

    async function handleFinishExam(isAutoSubmit = false) {
        const { examState, currentUser, selectedExamSubject } = state;
        if (!examState || !currentUser) return;
    
        if (isAutoSubmit) {
            alert('時間到，考試已自動繳交！');
        } else {
            if (!confirm('您確定要完成並繳交測驗嗎？')) return;
        }
    
        const { questions, userAnswers } = examState;
        let correctAnswers = 0;
    
        const results = questions.map(q => {
            const userAnswer = userAnswers[q.id] || null;
            const isCorrect = userAnswer === q.answer;
            if (isCorrect) correctAnswers++;
            return { id: q.id, text: q.text, imgurl: q.imgurl, options: q.options, answer: q.answer, explanation: q.explanation, userAnswer, isCorrect };
        });
    
        const score = Math.round((correctAnswers / questions.length) * 100);
        const categoryName = questions.length > 0 ? questions[0].category : '';
    
        const newExamHistoryEntry = {
            id: `hist_${Date.now()}`,
            subject: selectedExamSubject,
            category: categoryName,
            score,
            date: new Date().toISOString(),
            results,
            userId: currentUser.id
        };
        
        setLoading(true);
        try {
            await addDoc(collection(db, 'examHistory'), newExamHistoryEntry);
    
            const userDocRef = doc(db, 'users', currentUser.id);
            const currentExamsTaken = currentUser.examsTaken || 0;
            const currentTotalScore = currentUser.totalScore || 0;
            const newExamsTaken = currentExamsTaken + 1;
            const newTotalScore = currentTotalScore + score;
            const newAverageScore = Math.round(newTotalScore / newExamsTaken);
    
            await updateDoc(userDocRef, {
                examsTaken: newExamsTaken,
                totalScore: newTotalScore,
                averageScore: newAverageScore,
            });
    
            const updatedCurrentUser = {
                ...currentUser,
                examsTaken: newExamsTaken,
                averageScore: newAverageScore,
                examHistory: [newExamHistoryEntry, ...(currentUser.examHistory || [])]
            };
    
            setState({ 
                currentUser: updatedCurrentUser,
                currentView: 'dashboard', 
                examState: null,
            });
            alert('考試結束！正在為您顯示成績詳解...');
            setState({ reviewingExam: newExamHistoryEntry });
    
        } catch (error) {
            console.error("Error saving exam results:", error);
            alert(`儲存考試結果失敗：${error.message}`);
             setState({ currentView: 'dashboard', examState: null });
        } finally {
            setLoading(false);
        }
    }
    
    function createSidebarHTML() {
        if (!state.currentUser) return '';
        const { role, name } = state.currentUser;
        
        const navLinks = role === 'student' ? `
            <li><a href="#" id="nav-dashboard" class="${state.currentView === 'dashboard' ? 'active' : ''}">${icons.dashboard} 儀表板</a></li>
            <li><a href="#" id="nav-exam-selection" class="${state.currentView.startsWith('exam-') ? 'active' : ''}">${icons.exam} 選擇考試</a></li>
        ` : `
            <li><a href="#" id="nav-user-management" class="${state.currentView === 'user-management' ? 'active' : ''}">${icons.users} 使用者管理</a></li>
            <li><a href="#" id="nav-subject-management" class="${state.currentView === 'subject-management' ? 'active' : ''}">${icons.folder} 科目管理</a></li>
            <li><a href="#" id="nav-question-editing" class="${state.currentView === 'question-editing' ? 'active' : ''}">${icons.edit} 題目修改</a></li>
            <li><a href="#" id="nav-bulk-upload" class="${state.currentView === 'bulk-upload' ? 'active' : ''}">${icons.upload} 題目大量上傳</a></li>
            <li><a href="#" id="nav-student-analytics" class="${state.currentView === 'student-analytics' ? 'active' : ''}">${icons.analytics} 觀看使用者分數</a></li>
        `;

        return `
            <div class="sidebar-header">
                <div class="logo">考</div>
                <h1>線上考試系統</h1>
            </div>
            <div class="sidebar-nav">
                <ul>${navLinks}</ul>
            </div>
            <div class="sidebar-footer">
                <div class="user-profile">
                    <div class="user-profile-avatar">${name.charAt(0)}</div>
                    <div class="user-profile-info">
                        <h4>${name}</h4>
                        <p>${role === 'student' ? '學生' : '系統管理'}</p>
                    </div>
                </div>
                <button id="logout-btn">${icons.logout} 登出</button>
            </div>
        `;
    }

    function createRadarChartView(data) {
        if (!data || data.length === 0) return '<p class="empty-list-message">尚無足夠的科目分數資料</p>';
        const size = 260;
        const center = size / 2;
        const maxRadius = center - 30;
        const sides = data.length;
        const angleSlice = (Math.PI * 2) / sides;
        const maxScore = 100;

        const getPoint = (value, i) => {
            const radius = (value / maxScore) * maxRadius;
            const angle = angleSlice * i - Math.PI / 2;
            return {
                x: center + radius * Math.cos(angle),
                y: center + radius * Math.sin(angle),
            };
        };

        let gridLines = '';
        const levels = 4;
        for (let i = 1; i <= levels; i++) {
            const value = (maxScore / levels) * i;
            const points = data.map((_, j) => {
                const p = getPoint(value, j);
                return `${p.x},${p.y}`;
            }).join(' ');
            gridLines += `<polygon points="${points}" class="radar-grid-line" />`;
        }

        let axesAndLabels = '';
        data.forEach((item, i) => {
            const endPoint = getPoint(maxScore, i);
            axesAndLabels += `<line x1="${center}" y1="${center}" x2="${endPoint.x}" y2="${endPoint.y}" class="radar-axis" />`;
            const labelPoint = getPoint(maxScore + 15, i);
            axesAndLabels += `<text x="${labelPoint.x}" y="${labelPoint.y}" class="radar-label">${item.subject}</text>`;
        });

        const dataPoints = data.map((item, i) => {
            const p = getPoint(item.score, i);
            return `${p.x},${p.y}`;
        }).join(' ');
        const dataShape = `<polygon points="${dataPoints}" class="radar-shape" />`;

        return `
            <div class="radar-chart-container">
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="radar-chart-svg">
                    ${gridLines}
                    ${axesAndLabels}
                    ${dataShape}
                </svg>
            </div>
        `;
    }

    function createStudentDashboardViewHTML(studentProfileData, isAdminView = false) {
        const d = studentProfileData;
        if (!d) return '<p>找不到學生資料</p>';
        const progressPercentage = d.nextLevelExp > 0 ? (d.currentExp / d.nextLevelExp) * 100 : 0;

        const examHistoryHTML = d.examHistory?.length > 0
            ? d.examHistory.sort((a,b) => new Date(b.date) - new Date(a.date)).map((exam, index) => `
                <li class="detail-list-item history-item">
                    <div class="item-main-info">
                        <span class="item-subject">${exam.subject} - ${exam.category}</span>
                        <span class="item-score">得分: ${exam.score}</span>
                    </div>
                    <div class="history-item-meta">
                        <span class="item-meta">${new Date(exam.date).toLocaleDateString()}</span>
                        <button class="review-button" data-exam-id="${exam.id}">查看詳解</button>
                        ${isAdminView ? `<button class="action-btn delete delete-history-btn" data-history-id="${exam.id}" title="刪除此記錄">${icons.delete}</button>` : ''}
                    </div>
                </li>`).join('')
            : '<li class="empty-list-message">尚無測驗記錄。</li>';
        
        const bookmarkedQuestionsHTML = d.bookmarkedQuestions?.length > 0 ? d.bookmarkedQuestions.map(q => `
            <li class="detail-list-item admin-list-item clickable-bookmark" data-question-id="${q.id}">
                <div class="item-main-info">
                    <span class="item-subject-badge">${q.subject}</span>
                    <p class="item-text">${q.questionText}</p>
                </div>
                <div class="actions">
                    <button class="action-btn delete delete-bookmark-btn" data-question-id="${q.id}" title="移除標記">${icons.delete}</button>
                </div>
            </li>`).join('') : '<li class="empty-list-message">尚無標記的題目。</li>';

        return `
            <div class="dashboard-container">
                <h3>成績與排名</h3>
                <div class="stats-grid">
                    <div class="stat-card"><div class="label">平均分數</div><div class="value">${d.averageScore || 0}</div></div>
                    <div class="stat-card"><div class="label">班級排名</div><div class="value">#${d.ranking || '-'}</div></div>
                    <div class="stat-card"><div class="label">已完成考試</div><div class="value">${d.examsTaken || 0}</div></div>
                </div>
            </div>
            <div class="dashboard-details-grid full-layout">
                 <div class="detail-card">
                    <div class="detail-card-header">${icons.history}<h4>測驗歷史</h4></div>
                    <ul class="detail-list scrollable-list">${examHistoryHTML}</ul>
                </div>
                <div class="detail-card">
                    <div class="detail-card-header">${icons.bookmark}<h4>標記的題目</h4></div>
                    <ul class="detail-list scrollable-list">${bookmarkedQuestionsHTML}</ul>
                </div>
                <div class="detail-card">
                    <div class="detail-card-header">${icons.levelUp}<h4>等級與獎勵</h4></div>
                    <div class="level-card-body">
                        <div class="level-display"><h3>等級 ${d.level || 1}</h3><p>${d.currentExp || 0} / ${d.nextLevelExp || 1000} EXP</p></div>
                        <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${progressPercentage}%;"></div></div>
                        <p class="reward-text">再接再厲，即可解鎖新徽章！</p>
                    </div>
                </div>
                <div class="detail-card">
                    <div class="detail-card-header">${icons.chart}<h4>科目分數雷達圖</h4></div>
                    ${createRadarChartView(d.radarChartData)}
                </div>
            </div>`;
    }

    function createSubjectCardHTML(subject) {
        const { subjectCounts, categoryCounts } = getQuestionCounts(state.allQuestions);
        const questionCount = subjectCounts[subject.name] || 0;
        const categoryCount = state.categories[subject.name]?.length || 0;

        return `
            <div class="subject-card">
                <div class="card-header">
                    <div class="card-icon">${icons.book}</div>
                    <div class="card-badge">${categoryCount} 個類別</div>
                </div>
                <h3>${subject.name}</h3>
                <p class="description">${subject.description}</p>
                <div class="card-footer">
                    <span class="question-count">共 ${questionCount} 題</span>
                    <button class="select-button" data-subject="${subject.name}">選擇類別 ${icons.arrowRight}</button>
                </div>
            </div>`;
    }

    function createExamSelectionViewHTML() {
        const subjectCardsHTML = state.subjects.map(createSubjectCardHTML).join('');
        return `<div class="subjects-grid">${subjectCardsHTML}</div>`;
    }

    function createExamCategorySelectionViewHTML() {
        const subjectName = state.selectedExamSubject;
        const categories = state.categories[subjectName] || [];
        const { categoryCounts } = getQuestionCounts(state.allQuestions);

        const categoryCardsHTML = categories.map(category => {
            const categoryKey = `${subjectName}-${category.name}`;
            const questionCount = categoryCounts[categoryKey] || 0;
            return `
                <div class="category-card">
                    <h3>${category.name}</h3>
                    <div class="category-info">
                        <p class="category-meta">共 ${questionCount} 題</p>
                        <p class="category-meta">${icons.clock} ${category.timeLimit} 分鐘</p>
                    </div>
                    <button class="start-exam-button" data-subject="${subjectName}" data-category="${category.name}" ${questionCount === 0 ? 'disabled' : ''}>
                        ${questionCount > 0 ? '開始測驗' : '尚無題目'}
                    </button>
                </div>
            `;
        }).join('');

        return `
            <button id="back-to-subjects" class="back-button">${icons.arrowLeft} 返回科目選擇</button>
            <div class="category-grid">${categoryCardsHTML}</div>
        `;
    }

    function createExamTakingViewHTML() {
        if (!state.examState) {
            return '<p>考試載入錯誤...</p>';
        }
        const { questions, currentQuestionIndex, userAnswers, timeLeft, bookmarked } = state.examState;
        const currentQuestion = questions[currentQuestionIndex];
        const totalQuestions = questions.length;
        const progressPercentage = ((currentQuestionIndex + 1) / totalQuestions) * 100;
        const selectedAnswer = userAnswers[currentQuestion.id];
        const isBookmarked = bookmarked.has(currentQuestion.id);

        const bookmarkButtonHTML = `
            <button class="action-btn bookmark-toggle ${isBookmarked ? 'bookmarked' : ''}" id="bookmark-btn" data-question-id="${currentQuestion.id}" title="${isBookmarked ? '移除標記' : '標記此題'}">
                ${isBookmarked ? icons.bookmarkSolid : icons.bookmark}
            </button>
        `;

        const optionsHTML = currentQuestion.options.map((option, index) => {
            const isSelected = selectedAnswer === option;
            return `
                <li class="exam-option ${isSelected ? 'selected' : ''}" data-question-id="${currentQuestion.id}" data-option="${option}">
                    <span class="option-letter">${String.fromCharCode(65 + index)}</span>
                    <p>${option}</p>
                </li>
            `;
        }).join('');

        const imageHTML = currentQuestion.imgurl ? `<img src="${currentQuestion.imgurl}" class="question-image" alt="題目圖片">` : '';

        return `
            <div class="exam-view-container">
                <div class="exam-header">
                    <h3>${state.selectedExamSubject} - ${currentQuestion.category}</h3>
                    <div class="exam-meta">
                        <span class="question-counter">問題 ${currentQuestionIndex + 1} / ${totalQuestions}</span>
                        <span class="exam-timer" id="exam-timer">${icons.clock} ${formatTime(timeLeft)}</span>
                    </div>
                </div>
                <div class="exam-progress-bar-container">
                    <div class="exam-progress-bar-fill" style="width: ${progressPercentage}%;"></div>
                </div>
                <div class="exam-question-card">
                    <div class="exam-question-header">
                        <div style="flex-grow: 1;">
                            <p class="exam-question-text">${currentQuestion.text}</p>
                            ${imageHTML}
                        </div>
                        ${bookmarkButtonHTML}
                    </div>
                    <ul class="exam-options-list">${optionsHTML}</ul>
                </div>
                <div class="exam-navigation">
                    <button class="exam-nav-button prev" id="prev-question-btn" ${currentQuestionIndex === 0 ? 'disabled' : ''}>上一題</button>
                    ${currentQuestionIndex === totalQuestions - 1
                        ? `<button class="exam-nav-button finish" id="finish-exam-btn">完成測驗</button>`
                        : `<button class="exam-nav-button next" id="next-question-btn">下一題</button>`
                    }
                </div>
            </div>
        `;
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    function createFormattingToolbarHTML(targetId) {
        return `
            <div class="format-toolbar">
                <button type="button" class="format-btn" title="上標 (Superscript)" data-target="${targetId}" data-tag="sup">x²</button>
                <button type="button" class="format-btn" title="下標 (Subscript)" data-target="${targetId}" data-tag="sub">x₂</button>
            </div>
        `;
    }

    function applyFormat(elementId, tag) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const start = el.selectionStart;
        const end = el.selectionEnd;
        const value = el.value;
        const selectedText = value.substring(start, end);
        const textBefore = value.substring(0, start);
        const textAfter = value.substring(end);
        
        let newText;
        let newCursorPos;

        if (start === end) {
            newText = `<${tag}></${tag}>`;
            el.value = textBefore + newText + textAfter;
            newCursorPos = start + tag.length + 2; // Position cursor inside the tags
        } else {
            newText = `<${tag}>${selectedText}</${tag}>`;
            el.value = textBefore + newText + textAfter;
            newCursorPos = start + newText.length;
        }

        el.focus();
        el.setSelectionRange(newCursorPos, newCursorPos);
        
        // Trigger input event to update dependent UI, like the answer dropdown
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function createExamReviewModalHTML() {
        if (!state.reviewingExam) return '';

        const { subject, category, results } = state.reviewingExam;

        const resultsHTML = results.map((res, index) => {
            const optionsHTML = res.options.map(option => {
                let className = 'review-option';
                if (option === res.answer) {
                    className += ' correct';
                }
                if (option === res.userAnswer && !res.isCorrect) {
                    className += ' incorrect';
                }
                return `<li class="${className}"><p>${option}</p></li>`;
            }).join('');

            const imageHTML = res.imgurl ? `<img src="${res.imgurl}" class="question-image" alt="題目圖片">` : '';

            return `
                <div class="review-question-card">
                    <p class="review-question-text"><strong>${index + 1}.</strong> ${res.text}</p>
                    ${imageHTML}
                    <ul class="review-options-list">${optionsHTML}</ul>
                    <div class="review-summary">
                        <span>你的答案: <strong class="summary-answer ${res.isCorrect ? 'correct-text' : 'incorrect-text'}">${res.userAnswer || '未作答'}</strong></span>
                        ${!res.isCorrect ? `<span>正確答案: <strong class="summary-answer correct-text">${res.answer}</strong></span>` : ''}
                    </div>
                    <div class="explanation-box">
                        <h5>詳解</h5>
                        <p>${res.explanation}</p>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="modal-backdrop">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>測驗詳解: ${subject} - ${category}</h3>
                        <button id="modal-close-btn" class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">${resultsHTML}</div>
                </div>
            </div>
        `;
    }

    function createBookmarkReviewModalHTML() {
        if (!state.reviewingBookmarkedQuestionId) return '';
        
        const question = state.allQuestions.find(q => q.id === state.reviewingBookmarkedQuestionId);
        if (!question) return '';

        const optionsHTML = question.options.map(option => {
            let className = 'review-option';
            if (option === question.answer) {
                className += ' correct';
            }
            return `<li class="${className}"><p>${option}</p></li>`;
        }).join('');

        const imageHTML = question.imgurl ? `<img src="${question.imgurl}" class="question-image" alt="題目圖片">` : '';

        return `
            <div class="modal-backdrop">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>題目詳解: ${question.subject} - ${question.category}</h3>
                        <button id="modal-close-btn" class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="review-question-card">
                            <p class="review-question-text"><strong>題目：</strong> ${question.text}</p>
                            ${imageHTML}
                            <ul class="review-options-list">${optionsHTML}</ul>
                            <div class="explanation-box">
                                <h5>詳解</h5>
                                <p>${question.explanation}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function createQuestionEditModalHTML() {
        if (!state.editingQuestion) return '';
        const q = state.editingQuestion;
        
        const optionsHTML = q.options.map((opt, index) => `
            <div class="form-group">
                <label for="option${index + 1}">選項 ${index + 1}</label>
                ${createFormattingToolbarHTML(`option${index + 1}`)}
                <input type="text" id="option${index + 1}" name="option${index + 1}" value="${opt.replace(/"/g, '&quot;')}" required>
            </div>
        `).join('');

        const answerOptionsHTML = q.options.map(opt => `
            <option value="${opt.replace(/"/g, '&quot;')}" ${q.answer === opt ? 'selected' : ''}>${opt}</option>
        `).join('');

        return `
            <div class="modal-backdrop">
                <div class="modal-content">
                    <form id="edit-question-form">
                        <div class="modal-header">
                            <h3>編輯題目</h3>
                            <button type="button" id="modal-close-btn" class="modal-close-btn">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="admin-form">
                                <div class="form-group">
                                    <label for="questionText">題目內文</label>
                                    ${createFormattingToolbarHTML('questionText')}
                                    <textarea id="questionText" name="questionText" rows="3" required>${q.text}</textarea>
                                </div>
                                <div class="form-group">
                                    <label for="imgurl">圖片路徑 (imgurl)</label>
                                    <input type="text" id="imgurl" name="imgurl" value="${q.imgurl || ''}" placeholder="例如: images/q1.jpg">
                                </div>
                                ${optionsHTML}
                                <div class="form-group">
                                    <label for="answer">正確答案</label>
                                    <select id="answer" name="answer" class="filter-select" required>
                                        ${answerOptionsHTML}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="explanation">詳解</label>
                                    ${createFormattingToolbarHTML('explanation')}
                                    <textarea id="explanation" name="explanation" rows="3" required>${q.explanation}</textarea>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                             <button type="button" id="modal-cancel-btn" class="exam-nav-button">取消</button>
                             <button type="submit" class="submit-button">儲存變更</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function createUserEditModalHTML() {
        if (!state.editingUser) return '';
        const u = state.editingUser;
        return `
        <div class="modal-backdrop">
            <div class="modal-content">
                <form id="edit-user-form">
                    <div class="modal-header">
                        <h3>編輯使用者</h3>
                        <button type="button" id="modal-close-btn" class="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="admin-form">
                            <div class="form-group">
                                <label>使用者 ID</label>
                                <input type="text" value="${u.id}" disabled>
                            </div>
                            <div class="form-group">
                                <label>電子郵件</label>
                                <input type="email" value="${u.email}" disabled>
                            </div>
                            <div class="form-group">
                                <label for="userName">使用者名稱</label>
                                <input type="text" id="userName" name="userName" value="${u.name}" required>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                         <button type="button" id="modal-cancel-btn" class="exam-nav-button">取消</button>
                         <button type="submit" class="submit-button">儲存變更</button>
                    </div>
                </form>
            </div>
        </div>`;
    }

    function createUserManagementViewHTML() {
        return `
            <div class="detail-card">
                <div class="detail-card-header">${icons.users}<h4>使用者資訊管理</h4></div>
                <ul class="detail-list">
                    ${state.allStudents.map(u => `
                         <li class="detail-list-item admin-list-item">
                            <div class="item-main-info">
                                <span class="item-subject">${u.name} (ID: ${u.id.slice(0, 8)})</span>
                                <span class="item-score">帳號: ${u.email}</span>
                            </div>
                            <div class="actions">
                                <button class="action-btn edit" title="修改" data-user-id="${u.id}">${icons.edit}</button>
                                <button class="action-btn delete" title="刪除" data-user-id="${u.id}">${icons.delete}</button>
                            </div>
                        </li>`).join('')}
                </ul>
            </div>
        `;
    }

    function createQuestionEditViewHTML() {
        const subjectOptions = state.subjects.map(subject =>
            `<option value="${subject.name}" ${state.selectedAdminSubject === subject.name ? 'selected' : ''}>${subject.name}</option>`
        ).join('');

        let categoryOptions = '<option value="">所有類別</option>';
        if (state.selectedAdminSubject && state.categories[state.selectedAdminSubject]) {
            categoryOptions += state.categories[state.selectedAdminSubject].map(category =>
                `<option value="${category.name}" ${state.selectedAdminCategory === category.name ? 'selected' : ''}>${category.name}</option>`
            ).join('');
        }

        const filteredQuestions = state.allQuestions.filter(q => {
            const subjectMatch = !state.selectedAdminSubject || q.subject === state.selectedAdminSubject;
            const categoryMatch = !state.selectedAdminCategory || q.category === state.selectedAdminCategory;
            return subjectMatch && categoryMatch;
        });

        const questionsHTML = filteredQuestions.length > 0
            ? filteredQuestions.map(q => `
                <li class="detail-list-item admin-list-item">
                    <div class="item-main-info">
                        <div class="item-tags">
                          <span class="item-subject-badge">${q.subject}</span>
                          <span class="item-category-badge">${q.category}</span>
                        </div>
                        <p class="item-text">${q.text}</p>
                    </div>
                    <div class="actions">
                        <button class="action-btn edit" title="修改" data-question-id="${q.id}">${icons.edit}</button>
                        <button class="action-btn delete" title="刪除" data-question-id="${q.id}">${icons.delete}</button>
                    </div>
                </li>`).join('')
            : '<li class="empty-list-message">沒有符合條件的題目。</li>';

        return `
            <div class="detail-card">
                <div class="detail-card-header">${icons.edit}<h4>題目修改</h4></div>
                <div class="admin-filters">
                    <select id="subject-filter" class="filter-select">
                        <option value="">所有科目</option>
                        ${subjectOptions}
                    </select>
                    <select id="category-filter" class="filter-select" ${!state.selectedAdminSubject ? 'disabled' : ''}>
                        ${categoryOptions}
                    </select>
                </div>
                <ul class="detail-list scrollable-list">${questionsHTML}</ul>
            </div>
        `;
    }

    function createBulkUploadViewHTML() {
        const subjectOptions = state.subjects.map(subject =>
            `<option value="${subject.name}" ${state.selectedBulkUploadSubject === subject.name ? 'selected' : ''}>${subject.name}</option>`
        ).join('');

        let categoryOptions = '<option value="">-- 請先選科目 --</option>';
        if (state.selectedBulkUploadSubject && state.categories[state.selectedBulkUploadSubject]) {
            categoryOptions = '<option value="">請選擇類別</option>' + state.categories[state.selectedBulkUploadSubject].map(category =>
                `<option value="${category.name}" ${state.selectedBulkUploadCategory === category.name ? 'selected' : ''}>${category.name}</option>`
            ).join('');
        }

        const isSelectionDisabled = !state.selectedBulkUploadSubject || !state.selectedBulkUploadCategory;
        const showConfirmation = !!state.selectedFile;

        return `
            <div class="detail-card">
                <div class="detail-card-header">${icons.upload}<h4>題目大批上傳</h4></div>
                <div class="upload-card-body">
                     <div class="admin-filters">
                        <select id="bulk-upload-subject-filter" class="filter-select">
                            <option value="">-- 請選擇科目 --</option>
                            ${subjectOptions}
                        </select>
                        <select id="bulk-upload-category-filter" class="filter-select" ${!state.selectedBulkUploadSubject ? 'disabled' : ''}>
                            ${categoryOptions}
                        </select>
                    </div>

                    ${!showConfirmation ? `
                        <p>選擇 .csv 或 .json 檔案來快速新增大量題目。</p>
                        <button id="select-file-btn" class="upload-button" ${isSelectionDisabled ? 'disabled' : ''}>
                            ${icons.upload} 選擇檔案
                        </button>
                    ` : ''}

                    <div id="file-confirmation-section" style="display: ${showConfirmation ? 'flex' : 'none'};">
                         <p class="file-info">已選擇檔案: <strong>${state.selectedFile?.name}</strong></p>
                         <div class="confirmation-actions">
                            <button id="confirm-upload-btn" class="upload-button">確認上傳</button>
                            <button id="cancel-upload-btn" class="exam-nav-button">取消</button>
                         </div>
                    </div>
                    
                    <div id="upload-status-message" class="upload-status ${state.uploadStatus !== 'idle' ? `visible ${state.uploadStatus}` : ''}">
                         ${state.uploadMessage}
                    </div>

                    <div class="format-examples-container">
                        <h4>檔案格式範例</h4>
                        <div class="format-tabs">
                            <button class="format-tab active" data-format="csv">CSV 格式</button>
                            <button class="format-tab" data-format="json">JSON 格式</button>
                        </div>
                        <div class="format-example-content">
                            <div id="csv-example" class="format-example">
                                <p>CSV檔案的第一列必須是標頭，且欄位順序必須如下所示。<code>imgurl</code> 欄位為選填，可放入圖片的相對路徑或網址。<code>answer</code> 欄位的值必須完全匹配其中一個 <code>option</code> 欄位。</p>
                                <pre><code>text,imgurl,option1,option2,option3,option4,answer,explanation
"宇宙中最豐富的元素是什麼？","","氧","氫","碳","氦","氫","氫是宇宙中最常見的元素，構成了恆星和星系的主要部分。"
"請看附圖，這個化學結構代表什麼？","images/structure.png","水","氧氣","二氧化碳","氯化鈉","水","由一個氧原子和兩個氫原子組成。"
"哪一位科學家提出了相對論？","","牛頓","伽利略","愛因斯坦","居里夫人","愛因斯坦","阿爾伯特·愛因斯坦在20世紀初提出了狹義相對論和廣義相對論。"</code></pre>
                            </div>
                            <div id="json-example" class="format-example" style="display: none;">
                                <p>JSON檔案必須是一個包含多個問題物件的陣列。每個物件的 <code>answer</code> 欄位值必須是 <code>options</code> 陣列中的其中一個字串。<code>imgurl</code> 為選填欄位。</p>
                                <pre><code>[
  {
    "text": "哪座行星是太陽系中最大的？",
    "imgurl": "",
    "options": [
      "地球",
      "火星",
      "木星",
      "土星"
    ],
    "answer": "木星",
    "explanation": "木星是氣態巨行星，其質量是太陽系其他所有行星總和的兩倍多。"
  },
  {
    "text": "請問這張圖片中的生物是什麼？",
    "imgurl": "images/animal.jpg",
    "options": [
      "貓",
      "狗",
      "兔子",
      "倉鼠"
    ],
    "answer": "貓",
    "explanation": "這是一隻家貓。"
  }
]</code></pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function createSubjectManagementViewHTML() {
        const subjectOptions = state.subjects.map(subject => `<option value="${subject.name}">${subject.name}</option>`).join('');
        
        const subjectListHTML = state.subjects.length > 0 ? state.subjects.map(subject => `
            <li class="subject-list-item">
                <div class="subject-header">
                    <h4>${subject.name}</h4>
                    <button class="action-btn delete delete-subject-btn" data-subject-name="${subject.name}" title="刪除科目">${icons.delete}</button>
                </div>
                <ul class="category-list">
                    ${state.categories[subject.name]?.length > 0 
                        ? state.categories[subject.name].map(cat => `
                            <li>
                                ${cat.name} <span class="category-time">(${cat.timeLimit} 分鐘)</span>
                                <button class="action-btn delete delete-category-btn" data-subject-name="${subject.name}" data-category-name="${cat.name}" title="刪除類別">${icons.delete}</button>
                            </li>`).join('') 
                        : '<li>尚無類別</li>'}
                </ul>
            </li>
        `).join('') : '<li class="empty-list-message">目前沒有任何科目。</li>';

        return `
            <div class="management-grid">
                <div class="detail-card">
                    <div class="detail-card-header"><h4>新增科目</h4></div>
                    <form id="add-subject-form" class="admin-form">
                        <div class="form-group">
                            <label for="subjectName">科目名稱</label>
                            <input type="text" id="subjectName" name="subjectName" required>
                        </div>
                        <div class="form-group">
                            <label for="description">科目描述</label>
                            <input type="text" id="description" name="description" required>
                        </div>
                        <button type="submit" class="submit-button">新增科目</button>
                    </form>
                </div>
                <div class="detail-card">
                    <div class="detail-card-header"><h4>新增類別</h4></div>
                    <form id="add-category-form" class="admin-form">
                        <div class="form-group">
                            <label for="subject">選擇科目</label>
                            <select id="subject" name="subject" class="filter-select" required>
                                <option value="">-- 請選擇 --</option>
                                ${subjectOptions}
                            </select>
                        </div>
                         <div class="form-group">
                            <label for="categoryName">新類別名稱</label>
                            <input type="text" id="categoryName" name="categoryName" required>
                        </div>
                        <div class="form-group">
                            <label for="timeLimit">作答時間 (分鐘)</label>
                            <input type="number" id="timeLimit" name="timeLimit" min="1" required>
                        </div>
                        <button type="submit" class="submit-button">新增類別</button>
                    </form>
                </div>
                 <div class="detail-card full-span">
                    <div class="detail-card-header"><h4>現有科目與類別</h4></div>
                    <ul class="subject-list">${subjectListHTML}</ul>
                </div>
            </div>
        `;
    }

    function createStudentAnalyticsViewHTML(studentDataForDisplay) {
        const studentOptions = state.allStudents
            .map(u => `<option value="${u.id}" ${state.selectedStudentIdForAnalytics == u.id ? 'selected' : ''}>${u.name}</option>`)
            .join('');

        const studentDashboard = state.selectedStudentIdForAnalytics && studentDataForDisplay
            ? createStudentDashboardViewHTML(studentDataForDisplay, true) // Pass true for isAdminView
            : '<p class="empty-list-message">請從上方選擇一位學生以查看其詳細數據。</p>';

        return `
            <div class="admin-view-container">
                <div class="detail-card">
                    <div class="detail-card-header">${icons.analytics}<h4>選擇學生</h4></div>
                    <div class="admin-filters">
                        <select id="student-analytics-selector" class="filter-select">
                            <option value="">-- 請選擇學生 --</option>
                            ${studentOptions}
                        </select>
                    </div>
                </div>
                ${studentDashboard}
            </div>
        `;
    }

    function createMainContentHTML(studentDataForAnalytics) {
        let viewHTML = '';
        let headerTitle = '';
        let headerSubtitle = '';

        const name = state.currentUser?.name || '';

        switch (state.currentView) {
            case 'dashboard':
                headerTitle = '儀表板';
                headerSubtitle = `歡迎回來, ${name}！這是您的學習成績概覽。`;
                viewHTML = createStudentDashboardViewHTML(state.currentUser);
                break;
            case 'exam-selection':
                headerTitle = '選擇考試科目';
                headerSubtitle = '請選擇您要參加的考試科目。';
                viewHTML = createExamSelectionViewHTML();
                break;
            case 'exam-category-selection':
                headerTitle = `${state.selectedExamSubject}`;
                headerSubtitle = '請選擇一個類別開始測驗。';
                viewHTML = createExamCategorySelectionViewHTML();
                break;
            case 'exam-taking':
                headerTitle = '考試進行中';
                headerSubtitle = '請仔細作答，祝您考試順利！';
                viewHTML = createExamTakingViewHTML();
                break;
            case 'user-management':
                headerTitle = '使用者管理';
                headerSubtitle = '管理系統中的所有學生帳號。';
                viewHTML = createUserManagementViewHTML();
                break;
            case 'subject-management':
                headerTitle = '科目管理';
                headerSubtitle = '新增或編輯科目與其下的類別。';
                viewHTML = createSubjectManagementViewHTML();
                break;
            case 'question-editing':
                headerTitle = '題目修改';
                headerSubtitle = '篩選、檢視並修改現有的題目。';
                viewHTML = createQuestionEditViewHTML();
                break;
            case 'bulk-upload':
                headerTitle = '題目大量上傳';
                headerSubtitle = '透過檔案上傳快速新增題庫。';
                viewHTML = createBulkUploadViewHTML();
                break;
            case 'student-analytics':
                headerTitle = '觀看使用者分數';
                headerSubtitle = '選擇一位學生以檢視其學習進度與詳細分數。';
                viewHTML = createStudentAnalyticsViewHTML(studentDataForAnalytics);
                break;
            default:
                viewHTML = '<p>頁面不存在</p>';
        }

        return `
          <div class="page-header">
              <div>
                  <h2>${headerTitle}</h2>
                  <p>${headerSubtitle}</p>
              </div>
          </div>
          ${viewHTML}
        `;
    }

    // --- MAIN RENDER FUNCTION ---
    function render() {
        const loginContainer = document.getElementById('login-container');
        const appContainer = document.getElementById('app-container');
        const sidebarContainer = document.getElementById('sidebar-container');
        const mainContentContainer = document.getElementById('main-content-container');
        const modalContainer = document.getElementById('modal-container');

        let studentDataForAnalytics = null;
        if (state.currentView === 'student-analytics') {
            studentDataForAnalytics = state.selectedStudentAnalyticsData;
        }

        if (!state.isLoggedIn) {
            loginContainer.innerHTML = createLoginViewHTML();
            loginContainer.style.display = 'flex';
            appContainer.style.display = 'none';
            modalContainer.style.display = 'none';
            
            document.getElementById('login-form')?.addEventListener('submit', handleLogin);
            document.querySelectorAll('.role-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const role = e.target.dataset.role;
                    if (role !== state.loginAsRole) {
                        setState({ loginAsRole: role, loginError: '' });
                    }
                });
            });

        } else {
            loginContainer.style.display = 'none';
            appContainer.style.display = 'flex';

            sidebarContainer.innerHTML = createSidebarHTML();
            mainContentContainer.innerHTML = createMainContentHTML(studentDataForAnalytics);
            
            // Modal Rendering
            if (state.reviewingExam) {
                modalContainer.innerHTML = createExamReviewModalHTML();
                modalContainer.style.display = 'block';
                document.body.style.overflow = 'hidden';
                modalContainer.querySelector('#modal-close-btn')?.addEventListener('click', () => setState({ reviewingExam: null }));
                modalContainer.querySelector('.modal-backdrop')?.addEventListener('click', (e) => {
                    if (e.target.classList.contains('modal-backdrop')) {
                        setState({ reviewingExam: null });
                    }
                });
            } else if (state.reviewingBookmarkedQuestionId) {
                modalContainer.innerHTML = createBookmarkReviewModalHTML();
                modalContainer.style.display = 'block';
                document.body.style.overflow = 'hidden';
                modalContainer.querySelector('#modal-close-btn')?.addEventListener('click', () => setState({ reviewingBookmarkedQuestionId: null }));
                modalContainer.querySelector('.modal-backdrop')?.addEventListener('click', (e) => {
                    if (e.target.classList.contains('modal-backdrop')) {
                        setState({ reviewingBookmarkedQuestionId: null });
                    }
                });
            } else if (state.editingQuestion) {
                modalContainer.innerHTML = createQuestionEditModalHTML();
                modalContainer.style.display = 'block';
                document.body.style.overflow = 'hidden';

                modalContainer.querySelectorAll('.format-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const targetId = e.currentTarget.dataset.target;
                        const tag = e.currentTarget.dataset.tag;
                        applyFormat(targetId, tag);
                    });
                });
    
                const closeModal = () => setState({ editingQuestion: null });
                
                modalContainer.querySelector('#modal-close-btn')?.addEventListener('click', closeModal);
                modalContainer.querySelector('#modal-cancel-btn')?.addEventListener('click', closeModal);
                modalContainer.querySelector('.modal-backdrop')?.addEventListener('click', (e) => {
                    if (e.target.classList.contains('modal-backdrop')) {
                        closeModal();
                    }
                });
                modalContainer.querySelector('#edit-question-form')?.addEventListener('submit', handleUpdateQuestion);
    
                // Dynamically update answer dropdown when options change
                const optionInputs = modalContainer.querySelectorAll('input[id^="option"]');
                const answerSelect = modalContainer.querySelector('#answer');
                const updateAnswerOptions = () => {
                    const currentAnswer = answerSelect.value;
                    const newOptions = Array.from(optionInputs).map(input => input.value);
                    answerSelect.innerHTML = newOptions.map(opt => `<option value="${opt.replace(/"/g, '&quot;')}">${opt}</option>`).join('');
                    if (newOptions.includes(currentAnswer)) {
                        answerSelect.value = currentAnswer;
                    } else if (newOptions.length > 0) {
                        answerSelect.value = newOptions[0];
                    }
                };
                optionInputs.forEach(input => input.addEventListener('input', updateAnswerOptions));
            } else if (state.editingUser) {
                modalContainer.innerHTML = createUserEditModalHTML();
                modalContainer.style.display = 'block';
                document.body.style.overflow = 'hidden';
    
                const closeModal = () => setState({ editingUser: null });
                
                modalContainer.querySelector('#modal-close-btn')?.addEventListener('click', closeModal);
                modalContainer.querySelector('#modal-cancel-btn')?.addEventListener('click', closeModal);
                modalContainer.querySelector('.modal-backdrop')?.addEventListener('click', (e) => {
                    if (e.target.classList.contains('modal-backdrop')) {
                        closeModal();
                    }
                });
                modalContainer.querySelector('#edit-user-form')?.addEventListener('submit', handleUpdateUser);
            } else {
                modalContainer.innerHTML = '';
                modalContainer.style.display = 'none';
                document.body.style.overflow = 'auto';
            }

            // Attach Global Listeners for Logged-in state
            document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

            if (state.currentUser.role === 'student') {
                document.getElementById('nav-dashboard')?.addEventListener('click', (e) => { e.preventDefault(); setState({ currentView: 'dashboard' }); });
                document.getElementById('nav-exam-selection')?.addEventListener('click', (e) => { 
                    e.preventDefault(); 
                    setState({ currentView: 'exam-selection' });
                });
            } else { // Admin listeners
                document.getElementById('nav-user-management')?.addEventListener('click', (e) => { 
                    e.preventDefault(); 
                    setState({ currentView: 'user-management' });
                });
                document.getElementById('nav-subject-management')?.addEventListener('click', (e) => { 
                    e.preventDefault(); 
                    setState({ currentView: 'subject-management' });
                });
                document.getElementById('nav-question-editing')?.addEventListener('click', (e) => { 
                    e.preventDefault(); 
                    setState({ currentView: 'question-editing' });
                });
                document.getElementById('nav-bulk-upload')?.addEventListener('click', (e) => {
                     e.preventDefault(); 
                     setState({ currentView: 'bulk-upload' });
                });
                document.getElementById('nav-student-analytics')?.addEventListener('click', (e) => {
                     e.preventDefault(); 
                     setState({ currentView: 'student-analytics' });
                });
            }

            // Listeners for view-specific elements
            if (state.currentView === 'dashboard' || state.currentView === 'student-analytics') {
                document.querySelectorAll('.review-button').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const examId = e.target.closest('button').dataset.examId;
                        const examHistory = state.currentUser?.examHistory || state.selectedStudentAnalyticsData?.examHistory || [];
                        const examToReview = examHistory.find(ex => ex.id === examId);
                        setState({ reviewingExam: examToReview });
                    });
                });
                document.querySelectorAll('.clickable-bookmark').forEach(item => {
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.delete-bookmark-btn')) return; 
                        const questionId = e.target.closest('.clickable-bookmark').dataset.questionId;
                        setState({ reviewingBookmarkedQuestionId: questionId });
                    });
                });
                 document.querySelectorAll('.delete-bookmark-btn').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const questionId = e.target.closest('button').dataset.questionId;
                        const userId = state.currentView === 'student-analytics'
                            ? state.selectedStudentIdForAnalytics
                            : state.currentUser.id;
                        handleDeleteBookmark(questionId, userId);
                    });
                });
                document.querySelectorAll('.delete-history-btn').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const historyId = e.target.closest('button').dataset.historyId;
                        handleDeleteExamHistory(historyId);
                    });
                });
            }

            if (state.currentView === 'exam-selection') {
                document.querySelectorAll('.select-button').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const subject = e.target.closest('button').dataset.subject;
                        setState({ currentView: 'exam-category-selection', selectedExamSubject: subject });
                    });
                });
            }
            
            if (state.currentView === 'exam-category-selection') {
                document.getElementById('back-to-subjects')?.addEventListener('click', () => {
                    setState({ currentView: 'exam-selection', selectedExamSubject: null });
                });
                document.querySelectorAll('.start-exam-button').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const { subject, category } = e.target.closest('button').dataset;
                        startExam(subject, category);
                    });
                });
            }

            if (state.currentView === 'exam-taking') {
                document.querySelectorAll('.exam-option').forEach(option => {
                    option.addEventListener('click', (e) => {
                        const { questionId, option: opt } = e.target.closest('.exam-option').dataset;
                        handleAnswerSelection(questionId, opt);
                    });
                });
                document.getElementById('bookmark-btn')?.addEventListener('click', (e) => handleBookmarkToggle(e.target.closest('button').dataset.questionId));
                document.getElementById('prev-question-btn')?.addEventListener('click', () => handleQuestionNavigation('prev'));
                document.getElementById('next-question-btn')?.addEventListener('click', () => handleQuestionNavigation('next'));
                document.getElementById('finish-exam-btn')?.addEventListener('click', () => handleFinishExam(false));
            }

            if (state.currentView === 'question-editing') {
                document.getElementById('subject-filter')?.addEventListener('change', (e) => setState({ selectedAdminSubject: e.target.value || null }));
                document.getElementById('category-filter')?.addEventListener('change', (e) => setState({ selectedAdminCategory: e.target.value || null }));
                document.querySelector('.scrollable-list')?.addEventListener('click', e => {
                    const editBtn = e.target.closest('.action-btn.edit');
                    if (editBtn) {
                        const questionId = editBtn.dataset.questionId;
                        const questionToEdit = state.allQuestions.find(q => q.id === questionId);
                        if (questionToEdit) {
                            setState({ editingQuestion: questionToEdit });
                        }
                        return;
                    }
    
                    const deleteBtn = e.target.closest('.action-btn.delete');
                    if (deleteBtn) {
                        const questionId = deleteBtn.dataset.questionId;
                        handleDeleteQuestion(questionId);
                        return;
                    }
                });
            }
            
            if (state.currentView === 'student-analytics') {
                 document.getElementById('student-analytics-selector')?.addEventListener('change', (e) => {
                    loadStudentAnalytics(e.target.value || null);
                });
            }

            if (state.currentView === 'user-management') {
                document.querySelector('.detail-list')?.addEventListener('click', e => {
                    const editBtn = e.target.closest('.action-btn.edit');
                    if (editBtn) {
                        const userId = editBtn.dataset.userId;
                        const userToEdit = state.allStudents.find(u => u.id === userId);
                        if (userToEdit) {
                            setState({ editingUser: userToEdit });
                        }
                        return;
                    }
    
                    const deleteBtn = e.target.closest('.action-btn.delete');
                    if (deleteBtn) {
                        const userId = deleteBtn.dataset.userId;
                        handleDeleteUser(userId);
                        return;
                    }
                });
            }

             if (state.currentView === 'bulk-upload') {
                document.getElementById('bulk-upload-subject-filter')?.addEventListener('change', (e) => setState({ selectedBulkUploadSubject: e.target.value || null }));
                document.getElementById('bulk-upload-category-filter')?.addEventListener('change', (e) => setState({ selectedBulkUploadCategory: e.target.value || null }));
                
                document.querySelectorAll('.format-tab').forEach(tab => {
                    tab.addEventListener('click', (e) => {
                        const format = e.target.dataset.format;
                        
                        document.querySelectorAll('.format-tab').forEach(t => t.classList.remove('active'));
                        e.target.classList.add('active');
                        
                        document.querySelectorAll('.format-example').forEach(content => {
                            content.style.display = 'none';
                        });
                        document.getElementById(`${format}-example`).style.display = 'block';
                    });
                });
                
                document.getElementById('select-file-btn')?.addEventListener('click', () => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.csv,.json';
                    fileInput.style.display = 'none';
            
                    fileInput.addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            setState({ selectedFile: file, uploadStatus: 'idle', uploadMessage: '' });
                        }
                    });
            
                    document.body.appendChild(fileInput);
                    fileInput.click();
                    document.body.removeChild(fileInput);
                });

                document.getElementById('confirm-upload-btn')?.addEventListener('click', handleBulkUpload);
                document.getElementById('cancel-upload-btn')?.addEventListener('click', () => {
                    setState({ selectedFile: null, uploadStatus: 'idle', uploadMessage: '' });
                });
            }
            if (state.currentView === 'subject-management') {
                document.getElementById('add-subject-form')?.addEventListener('submit', handleAddSubject);
                document.getElementById('add-category-form')?.addEventListener('submit', handleAddCategory);
                document.querySelector('.subject-list')?.addEventListener('click', (e) => {
                    const deleteSubjectBtn = e.target.closest('.delete-subject-btn');
                    if (deleteSubjectBtn) {
                        handleDeleteSubject(deleteSubjectBtn.dataset.subjectName);
                        return;
                    }

                    const deleteCategoryBtn = e.target.closest('.delete-category-btn');
                    if (deleteCategoryBtn) {
                        const { subjectName, categoryName } = deleteCategoryBtn.dataset;
                        handleDeleteCategory(subjectName, categoryName);
                        return;
                    }
                });
            }
        }
    }

    // --- DATA FETCHING FROM FIRESTORE ---
    async function fetchCoreData() {
        try {
            const [subjectsSnapshot, categoriesSnapshot, questionsSnapshot] = await Promise.all([
                getDocs(collection(db, 'subjects')),
                getDocs(collection(db, 'categories')),
                getDocs(collection(db, 'questions')),
            ]);

            const subjects = subjectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
            const categoriesData = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const allQuestions = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const categories = {};
            subjects.forEach(s => {
                const subjectCategories = categoriesData.filter(c => c.subject === s.name);
                subjectCategories.sort((a,b) => a.name.localeCompare(b.name));
                categories[s.name] = subjectCategories;
            });

            return { subjects, categories, allQuestions };
        } catch (error) {
            console.error("Error fetching core data:", error);
            alert("無法從資料庫載入核心資料，部分功能可能無法使用。");
            return { subjects: [], categories: {}, allQuestions: [] }; // Return empty data on failure
        }
    }

    async function loadStudentAnalytics(studentId) {
        if (!studentId) {
            setState({ selectedStudentIdForAnalytics: null, selectedStudentAnalyticsData: null });
            return;
        }
        setLoading(true);
        try {
            const userDocRef = doc(db, 'users', studentId);
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                throw new Error("找不到該學生的資料。");
            }

            let studentProfileData = { id: userDocSnap.id, ...userDocSnap.data() };

            const historyQuery = query(collection(db, "examHistory"), where("userId", "==", studentId));
            const historySnapshot = await getDocs(historyQuery);
            studentProfileData.examHistory = historySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            // Fetch bookmarks
            const bookmarksQuery = query(collection(db, "bookmarkedQuestions"), where("userId", "==", studentId));
            const bookmarksSnapshot = await getDocs(bookmarksQuery);
            const bookmarkedQuestionIds = new Set(bookmarksSnapshot.docs.map(doc => doc.data().questionId));
            
            studentProfileData.bookmarkedQuestions = state.allQuestions
                .filter(q => bookmarkedQuestionIds.has(q.id))
                .map(q => ({ id: q.id, questionText: q.text, subject: q.subject }));

            const subjectScores = {};
            studentProfileData.examHistory.forEach(exam => {
                subjectScores[exam.subject] = exam.score; // Keep the latest score for simplicity
            });
            studentProfileData.radarChartData = Object.keys(subjectScores).map(subject => ({ subject, score: subjectScores[subject] }));

            setState({
                selectedStudentIdForAnalytics: studentId,
                selectedStudentAnalyticsData: studentProfileData
            });

        } catch (error) {
            console.error("Error loading student analytics:", error);
            alert(`載入學生資料失敗：${error.message}`);
            setState({ selectedStudentIdForAnalytics: studentId, selectedStudentAnalyticsData: null });
        } finally {
            setLoading(false);
        }
    }

    // --- INITIALIZATION ---
    function init() {
        onAuthStateChanged(auth, async (user) => {
            setLoading(true);
            if (user) {
                // Fetch core data for both roles
                const { subjects, categories, allQuestions } = await fetchCoreData();

                let userProfile;
                let defaultView;
                let allStudents = [];

                if (user.email === 'admin@test.com') {
                    const userDocRef = doc(db, 'users', user.uid);
                    const userDocSnap = await getDoc(userDocRef);

                    if (!userDocSnap.exists()) {
                        console.log("Admin user document not found, creating one to satisfy security rules...");
                        try {
                            await setDoc(userDocRef, {
                                email: user.email,
                                name: '管理者',
                                role: 'admin'
                            });
                        } catch (e) {
                            console.error("Error creating admin user document in Firestore:", e);
                        }
                    }

                    userProfile = { id: user.uid, name: '管理者', email: user.email, role: 'admin' };
                    defaultView = 'student-analytics';
                    
                    const usersQuery = query(collection(db, "users"), where("role", "==", "student"));
                    const studentsSnapshot = await getDocs(usersQuery);
                    allStudents = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                } else { // Student Login
                    const userDocRef = doc(db, 'users', user.uid);
                    let userDocSnap = await getDoc(userDocRef);

                    if (!userDocSnap.exists()) {
                        console.log("Student user doc not found, creating one.");
                        const newUserProfile = {
                            name: user.email.split('@')[0] || '新學生',
                            email: user.email,
                            role: 'student',
                            averageScore: 0,
                            ranking: '-',
                            examsTaken: 0,
                            level: 1,
                            currentExp: 0,
                            nextLevelExp: 100,
                            totalScore: 0
                        };
                        await setDoc(userDocRef, newUserProfile);
                        userDocSnap = await getDoc(userDocRef);
                    }

                    userProfile = { id: userDocSnap.id, ...userDocSnap.data() };
                    
                    const historyQuery = query(collection(db, "examHistory"), where("userId", "==", user.uid));
                    const historySnapshot = await getDocs(historyQuery);
                    userProfile.examHistory = historySnapshot.docs.map(d => ({id: d.id, ...d.data()}));
                    
                    // Fetch bookmarks for student
                    const bookmarksQuery = query(collection(db, "bookmarkedQuestions"), where("userId", "==", user.uid));
                    const bookmarksSnapshot = await getDocs(bookmarksQuery);
                    const bookmarkedQuestionIds = new Set(bookmarksSnapshot.docs.map(doc => doc.data().questionId));
                    
                    userProfile.bookmarkedQuestions = allQuestions
                        .filter(q => bookmarkedQuestionIds.has(q.id))
                        .map(q => ({ id: q.id, questionText: q.text, subject: q.subject }));

                    const subjectScores = {};
                    userProfile.examHistory.forEach(exam => {
                        subjectScores[exam.subject] = exam.score; // Keep latest score
                    });
                    userProfile.radarChartData = Object.keys(subjectScores).map(subject => ({ subject, score: subjectScores[subject] }));

                    defaultView = 'dashboard';
                }
                
                setState({
                    isLoggedIn: true,
                    currentUser: userProfile,
                    currentView: defaultView,
                    subjects,
                    categories,
                    allQuestions,
                    allStudents,
                });

            } else {
                // User is signed out. Reset to login state.
                setState({
                    isLoggedIn: false,
                    currentUser: null,
                    currentView: 'login',
                    loginAsRole: 'student',
                    loginError: '',
                    selectedStudentIdForAnalytics: null,
                    selectedStudentAnalyticsData: null,
                });
            }
            setLoading(false);
        });
    }
    
    // Start the app
    init();
});