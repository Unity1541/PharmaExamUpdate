

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
                     { id: 'q2', text: '2 x 2 等於多少？', subject: '數學' }
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
        check: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`,
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
    
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
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
            imgurl: form.imgurl.value.trim() || null, // Ensure null if undefined/empty
            options: [
                form.option1.value,
                form.option2.value,
                form.option3.value,
                form.option4.value,
            ],
            // Capture option images (null if empty)
            optionImages: [
                form.option1_img.value.trim() || null,
                form.option2_img.value.trim() || null,
                form.option3_img.value.trim() || null,
                form.option4_img.value.trim() || null,
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
                    imgurl: question.imgurl || null, 
                    optionImages: question.optionImages || [null, null, null, null], // Default option images
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

    // New function to handle bookmarks inside the review modal
    async function handleReviewBookmarkToggle(questionId, btnElement) {
        if (!state.currentUser) return;
        
        const { id: userId } = state.currentUser;
        // Check local state for current status
        const isCurrentlyBookmarked = state.currentUser.bookmarkedQuestions.some(bq => bq.id === questionId);
        
        // Optimistic UI update (Direct DOM to prevent modal close/scroll reset)
        if (btnElement) {
             btnElement.classList.toggle('active');
             btnElement.innerHTML = !isCurrentlyBookmarked ? icons.bookmarkSolid : icons.bookmark;
             // Temporarily disable to prevent double clicks
             btnElement.disabled = true;
        }

        try {
            const bookmarksCollection = collection(db, 'bookmarkedQuestions');
            
            if (isCurrentlyBookmarked) {
                // Remove bookmark
                const q = query(bookmarksCollection, where("userId", "==", userId), where("questionId", "==", questionId));
                const querySnapshot = await getDocs(q);
                const batch = writeBatch(db);
                querySnapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();

                // Update Local State
                const updatedBookmarks = state.currentUser.bookmarkedQuestions.filter(q => q.id !== questionId);
                state.currentUser.bookmarkedQuestions = updatedBookmarks;

            } else {
                // Add bookmark
                await addDoc(bookmarksCollection, {
                    userId: userId,
                    questionId: questionId,
                    createdAt: new Date().toISOString()
                });
                
                // Fetch basic question info to store in local state so it appears in dashboard immediately
                const qInfo = state.allQuestions.find(q => q.id === questionId);
                if (qInfo) {
                    state.currentUser.bookmarkedQuestions.push({ ...qInfo });
                }
            }
            
            // Re-enable button
            if (btnElement) btnElement.disabled = false;

        } catch (error) {
            console.error("Error toggling review bookmark:", error);
            alert("操作失敗，請稍後再試。");
            // Revert UI if needed
            if (btnElement) {
                 btnElement.classList.toggle('active');
                 btnElement.innerHTML = isCurrentlyBookmarked ? icons.bookmarkSolid : icons.bookmark;
                 btnElement.disabled = false;
            }
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
            // Update state variable DIRECTLY without triggering a full re-render
            state.examState.timeLeft -= 1;
            
            // Direct DOM update for the timer element
            const timerEl = document.querySelector('.exam-timer');
            if (timerEl) {
                timerEl.innerHTML = `${icons.clock} ${formatTime(state.examState.timeLeft)}`;
            }

            if (state.examState.timeLeft <= 0) {
                clearInterval(state.examState.timerInterval);
                handleFinishExam(true); 
            }
        } else if (state.examState) {
            clearInterval(state.examState.timerInterval);
        }
    }

    function handleAnswerSelection(questionId, selectedOption) {
        if (!state.examState) return;
        
        // 1. Update State Silently (do NOT call setState)
        state.examState.userAnswers[questionId] = selectedOption;

        // 2. Direct DOM Manipulation for UI Feedback
        // Find options container for current question
        // Note: We only have one question visible in the DOM
        const options = document.querySelectorAll('.exam-option');
        
        options.forEach(opt => {
            // Retrieve only the text from the P tag to compare with the selectedOption value
            const optTextElement = opt.querySelector('p');
            const optText = optTextElement ? optTextElement.innerText : '';
            const letter = opt.querySelector('.option-letter');
            
            if (optText === selectedOption) {
                opt.classList.add('selected');
                letter.style.backgroundColor = 'var(--primary-color)';
                letter.style.color = 'white';
                letter.style.borderColor = 'var(--primary-color)';
            } else {
                opt.classList.remove('selected');
                letter.removeAttribute('style');
            }
        });

        // 3. Update Navigation Grid (Right Panel)
        const currentQIndex = state.examState.currentQuestionIndex;
        const navButtons = document.querySelectorAll('.nav-grid-btn');
        if (navButtons[currentQIndex]) {
             navButtons[currentQIndex].classList.add('answered');
             navButtons[currentQIndex].classList.remove('unanswered');
        }

        // 4. Update Progress Bar
        const total = state.examState.questions.length;
        const answered = Object.keys(state.examState.userAnswers).length;
        const pct = (answered / total) * 100;
        
        const progressFill = document.querySelector('.exam-progress-fill');
        const progressText = document.querySelector('.exam-progress-info span');
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressText) progressText.innerText = `Progress: ${answered} / ${total}`;
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

    function handleJumpToQuestion(index) {
        if (!state.examState) return;
        setState({ examState: { ...state.examState, currentQuestionIndex: index } });
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
            return { 
                id: q.id, 
                text: q.text, 
                imgurl: q.imgurl || null, 
                options: q.options, 
                optionImages: q.optionImages || [null, null, null, null],
                answer: q.answer, 
                explanation: q.explanation, 
                userAnswer, 
                isCorrect 
            };
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
                    <span class="item-subject-badge">${q.subject || '未分類'}</span>
                    <p class="item-text">${q.text || q.questionText || '題目內容無法顯示'}</p>
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
        return `
            <div class="page-header">
                <div>
                    <h2>選擇考試科目</h2>
                    <p>請選擇您想要練習的科目</p>
                </div>
            </div>
            <div class="subjects-grid">
                ${subjectCardsHTML}
            </div>
        `;
    }

    function createExamTakingViewHTML() {
        const { questions, currentQuestionIndex, userAnswers, bookmarked } = state.examState;
        const currentQ = questions[currentQuestionIndex];
        const totalQuestions = questions.length;
        const answeredCount = Object.keys(userAnswers).length;
        const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
        const isBookmarked = bookmarked.has(currentQ.id);

        const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

        // Navigation Grid Items
        let navGridHTML = '';
        questions.forEach((q, idx) => {
            let statusClass = 'unanswered';
            const isCur = idx === currentQuestionIndex;
            const isAns = userAnswers[q.id] !== undefined;
            const isBkm = bookmarked.has(q.id);

            // Priority Logic for visual feedback
            if (isCur) statusClass = 'current';
            else if (isBkm) statusClass = 'bookmarked';
            else if (isAns) statusClass = 'answered';

            navGridHTML += `<button class="nav-grid-btn ${statusClass}" onclick="window.handleJumpToQuestion(${idx})">${idx + 1}</button>`;
        });

        // Options List
        const optionsHTML = currentQ.options.map((opt, i) => {
            const isSelected = userAnswers[currentQ.id] === opt;
            const safeOpt = opt.replace(/'/g, "\\'"); // Escape single quotes for inline JS
            const optionImageSrc = currentQ.optionImages && currentQ.optionImages[i] ? currentQ.optionImages[i] : null;

            return `
                <li class="exam-option ${isSelected ? 'selected' : ''}" onclick="window.handleAnswerSelection('${currentQ.id}', '${safeOpt}')">
                    <span class="option-letter">${['A', 'B', 'C', 'D'][i]}</span>
                    <div>
                         ${optionImageSrc ? `<img src="${optionImageSrc}" class="option-image">` : ''}
                         <p>${opt}</p>
                    </div>
                </li>
            `;
        }).join('');

        return `
            <div class="exam-layout">
                <!-- Left Panel: Main Content -->
                <div class="exam-main-panel">
                    <!-- Progress Section -->
                    <div class="exam-progress-wrapper">
                        <div class="exam-progress-info">
                            <span>Progress: ${answeredCount} / ${totalQuestions}</span>
                            <div class="exam-timer">${icons.clock} ${formatTime(state.examState.timeLeft)}</div>
                        </div>
                        <div class="exam-progress-track">
                            <div class="exam-progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>

                    <!-- Question Card -->
                    <div class="exam-question-card">
                        <div class="question-header-row">
                            <div style="display:flex; align-items:center;">
                                <span class="question-label">Q${currentQuestionIndex + 1}</span>
                                <span class="category-tag">${currentQ.category || 'General'}</span>
                            </div>
                            <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="window.handleBookmarkToggle('${currentQ.id}')" title="Bookmark for review">
                               ${isBookmarked ? icons.bookmarkSolid : icons.bookmark}
                            </button>
                        </div>

                        <p class="exam-question-text">${currentQ.text}</p>
                        ${currentQ.imgurl ? `<img src="${currentQ.imgurl}" class="question-image" alt="Question Image">` : ''}

                        <ul class="exam-options-list">
                            ${optionsHTML}
                        </ul>
                    </div>

                    <!-- Bottom Nav Buttons -->
                    <div class="exam-navigation">
                         <button class="exam-nav-button" ${currentQuestionIndex === 0 ? 'disabled' : ''} onclick="window.handleQuestionNavigation('prev')">
                            ${icons.arrowLeft} Previous
                        </button>
                        ${!isLastQuestion ? `
                            <button class="exam-nav-button next" onclick="window.handleQuestionNavigation('next')">
                                Next ${icons.arrowRight}
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Right Panel: Navigation Grid -->
                <div class="exam-nav-panel">
                    <div class="nav-panel-header">
                        <h3>Question List</h3>
                    </div>
                    
                    <div class="nav-grid">
                        ${navGridHTML}
                    </div>

                    <div class="status-legend">
                        <div class="legend-item"><div class="legend-dot" style="background:var(--status-current);"></div> Current</div>
                        <div class="legend-item"><div class="legend-dot" style="background:var(--status-bookmarked);"></div> Bookmarked</div>
                        <div class="legend-item"><div class="legend-dot" style="background:var(--status-answered);"></div> Answered</div>
                        <div class="legend-item"><div class="legend-dot" style="background:var(--status-unanswered);"></div> Unanswered</div>
                    </div>

                    <div style="margin-top: auto; padding-top: 24px;">
                         <button class="exam-nav-button finish" style="width:100%" 
                            onclick="window.handleFinishExam()">
                            Submit Exam
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function createReviewExamViewHTML(historyEntry) {
         const resultItems = historyEntry.results.map((r, i) => {
            const isCorrect = r.isCorrect;
            const isBookmarked = state.currentUser?.bookmarkedQuestions?.some(bq => bq.id === r.id);
            
            const reviewOptions = r.options.map((opt, idx) => {
                 let optionClass = '';
                 // Highlight User Answer (Red if wrong, Green if correct)
                 if (r.userAnswer === opt) {
                     optionClass = isCorrect ? 'correct' : 'incorrect';
                 }
                 // Always Highlight Correct Answer (Green)
                 if (r.answer === opt) {
                     optionClass = 'correct';
                 }
                 const optionImageSrc = r.optionImages && r.optionImages[idx] ? r.optionImages[idx] : null;

                 return `
                    <li class="review-option ${optionClass}">
                        ${optionImageSrc ? `<img src="${optionImageSrc}" class="option-image" style="width: 50px; height: 50px;">` : ''}
                        <p>${opt}</p>
                    </li>
                 `;
            }).join('');
            
            return `
                <div class="review-question-card">
                     <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                        <h4 style="font-size: 16px;">第 ${i + 1} 題</h4>
                        <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" 
                            onclick="window.handleReviewBookmarkToggle('${r.id}', this)" 
                            title="收藏題目">
                            ${isBookmarked ? icons.bookmarkSolid : icons.bookmark}
                        </button>
                     </div>
                     <p class="review-question-text">${r.text}</p>
                     ${r.imgurl ? `<img src="${r.imgurl}" class="question-image" style="max-height: 200px;">` : ''}
                     
                     <ul class="review-options-list">
                        ${reviewOptions}
                     </ul>

                     <div class="review-summary">
                        <div class="summary-answer ${isCorrect ? 'correct-text' : 'incorrect-text'}">
                            您的答案: ${r.userAnswer || '未作答'}
                        </div>
                        <div class="summary-answer correct-text">
                            正確答案: ${r.answer}
                        </div>
                     </div>
                     
                     <div class="explanation-box">
                        <h5>詳解：</h5>
                        <p>${r.explanation}</p>
                     </div>
                </div>
            `;
        }).join('');

        return `
            <div class="modal-backdrop">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>測驗結果詳解 - 分數: ${historyEntry.score}</h3>
                        <button class="modal-close-btn" onclick="window.closeReviewModal()">×</button>
                    </div>
                    <div class="modal-body">
                        ${resultItems}
                    </div>
                </div>
            </div>
        `;
    }

    function createAdminViewHTML() {
        // Admin View Logic - simplified for brevity but functional
        // Sub-tabs: User Management, Subject Management, Question Editing, Bulk Upload
        // We render based on state.currentView
        
        if (state.currentView === 'user-management') {
             const studentsHTML = state.allStudents.length > 0 ? state.allStudents.map(s => `
                <li class="admin-list-item detail-list-item">
                    <div class="item-main-info">
                        <span class="item-subject">${s.name} (${s.email})</span>
                        <div class="item-meta">Role: ${s.role} | Avg: ${s.averageScore || 0}</div>
                    </div>
                     <div class="actions">
                        <button class="action-btn edit" onclick="window.openEditUserModal('${s.id}')">${icons.edit}</button>
                        <button class="action-btn delete" onclick="window.handleDeleteUser('${s.id}')">${icons.delete}</button>
                    </div>
                </li>
            `).join('') : '<p class="empty-list-message">沒有學生資料</p>';

            return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>使用者管理</h2></div>
                    <div class="dashboard-container">
                        <ul class="detail-list scrollable-list">${studentsHTML}</ul>
                    </div>
                </div>`;
        }
        
        if (state.currentView === 'subject-management') {
             const subjectListHTML = state.subjects.map(subject => {
                const categoriesHTML = (state.categories[subject.name] || []).map(cat => `
                    <li>
                        ${cat.name} <span class="category-time">(${cat.timeLimit}min)</span>
                        <button class="action-btn" onclick="window.handleDeleteCategory('${subject.name}', '${cat.name}')">${icons.delete}</button>
                    </li>
                `).join('');

                return `
                    <li class="subject-list-item">
                        <div class="subject-header">
                            <strong>${subject.name}</strong>
                            <button class="action-btn delete" onclick="window.handleDeleteSubject('${subject.name}')" title="刪除科目">${icons.delete}</button>
                        </div>
                        <ul class="category-list">${categoriesHTML}</ul>
                    </li>
                `;
            }).join('');
            
            const subjectOptions = state.subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('');

            return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>科目與類別管理</h2></div>
                    <div class="management-grid">
                        <div class="dashboard-container">
                            <h3>現有科目</h3>
                            <ul class="subject-list scrollable-list">${subjectListHTML}</ul>
                        </div>
                         <div class="dashboard-container">
                            <form id="add-subject-form" class="admin-form">
                                <h3>新增科目</h3>
                                <div class="form-group"><label>科目名稱</label><input type="text" name="subjectName" required></div>
                                <div class="form-group"><label>描述</label><input type="text" name="description" required></div>
                                <button type="submit" class="submit-button">新增科目</button>
                            </form>
                            <hr style="margin: 24px 0; border-color: var(--border-color);">
                             <form id="add-category-form" class="admin-form">
                                <h3>新增類別</h3>
                                <div class="form-group"><label>選擇科目</label><select name="subject" required>${subjectOptions}</select></div>
                                <div class="form-group"><label>類別名稱</label><input type="text" name="categoryName" required></div>
                                <div class="form-group"><label>時間限制 (分鐘)</label><input type="number" name="timeLimit" value="10" min="1" required></div>
                                <button type="submit" class="submit-button">新增類別</button>
                            </form>
                        </div>
                    </div>
                </div>`;
        }

        if (state.currentView === 'question-editing') {
             const subjectOptions = `<option value="">全部科目</option>` + state.subjects.map(s => `<option value="${s.name}" ${state.selectedAdminSubject === s.name ? 'selected' : ''}>${s.name}</option>`).join('');
             
             let filteredQuestions = state.allQuestions;
             if (state.selectedAdminSubject) {
                 filteredQuestions = filteredQuestions.filter(q => q.subject === state.selectedAdminSubject);
             }
             if (state.selectedAdminCategory) {
                 filteredQuestions = filteredQuestions.filter(q => q.category === state.selectedAdminCategory);
             }

             const questionsListHTML = filteredQuestions.length > 0 ? filteredQuestions.map(q => `
                <li class="admin-list-item detail-list-item">
                    <div class="item-main-info">
                         <div class="item-tags">
                            <span class="item-category-badge">${q.subject}</span>
                            <span class="item-category-badge">${q.category}</span>
                         </div>
                        <p class="item-text" style="margin-top:4px;">${q.text.substring(0, 60)}...</p>
                    </div>
                     <div class="actions">
                        <button class="action-btn edit" onclick="window.openEditQuestionModal('${q.id}')">${icons.edit}</button>
                        <button class="action-btn delete" onclick="window.handleDeleteQuestion('${q.id}')">${icons.delete}</button>
                    </div>
                </li>
             `).join('') : '<p class="empty-list-message">沒有符合條件的題目</p>';
             
             // Category options logic
             let categoryOptions = `<option value="">全部類別</option>`;
             if (state.selectedAdminSubject && state.categories[state.selectedAdminSubject]) {
                  categoryOptions += state.categories[state.selectedAdminSubject].map(c => `<option value="${c.name}" ${state.selectedAdminCategory === c.name ? 'selected' : ''}>${c.name}</option>`).join('');
             }

            return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>題目修改與管理</h2></div>
                    <div class="dashboard-container">
                        <div class="admin-filters">
                            <select class="filter-select" onchange="window.handleAdminSubjectFilterChange(this.value)">${subjectOptions}</select>
                            <select class="filter-select" onchange="window.handleAdminCategoryFilterChange(this.value)" ${!state.selectedAdminSubject ? 'disabled' : ''}>${categoryOptions}</select>
                        </div>
                        <ul class="detail-list scrollable-list" style="max-height: 600px;">${questionsListHTML}</ul>
                    </div>
                </div>
            `;
        }

        if (state.currentView === 'bulk-upload') {
            const subjectOptions = `<option value="" disabled selected>請選擇科目</option>` + state.subjects.map(s => `<option value="${s.name}" ${state.selectedBulkUploadSubject === s.name ? 'selected' : ''}>${s.name}</option>`).join('');
            
            let categoryOptions = `<option value="" disabled selected>請先選擇科目</option>`;
            if (state.selectedBulkUploadSubject && state.categories[state.selectedBulkUploadSubject]) {
                 categoryOptions = `<option value="" disabled selected>請選擇類別</option>` + state.categories[state.selectedBulkUploadSubject].map(c => `<option value="${c.name}" ${state.selectedBulkUploadCategory === c.name ? 'selected' : ''}>${c.name}</option>`).join('');
            }
            
            const isUploadDisabled = !state.selectedFile || !state.selectedBulkUploadSubject || !state.selectedBulkUploadCategory || state.isLoading;

            return `
                 <div class="admin-view-container">
                    <div class="page-header"><h2>題目大量上傳 (JSON)</h2></div>
                    <div class="dashboard-container" style="display:flex; flex-direction:column; height: 100%;">
                         <div class="upload-card-body">
                            <div class="admin-filters">
                                <select class="filter-select" onchange="window.handleBulkUploadSubjectChange(this.value)">${subjectOptions}</select>
                                <select class="filter-select" onchange="window.handleBulkUploadCategoryChange(this.value)" ${!state.selectedBulkUploadSubject ? 'disabled' : ''}>${categoryOptions}</select>
                            </div>
                            
                            <input type="file" id="json-upload-input" accept=".json" style="display: none;" onchange="window.handleFileSelect(this)">
                            <button class="upload-button" onclick="document.getElementById('json-upload-input').click()">
                                ${icons.folder} 選擇 JSON 檔案
                            </button>
                            
                            ${state.selectedFile ? `
                                <div id="file-confirmation-section">
                                    <div class="file-info">已選擇檔案: <strong>${state.selectedFile.name}</strong></div>
                                    <div class="confirmation-actions">
                                        <button id="confirm-upload-btn" class="upload-button" onclick="window.handleBulkUpload()" ${isUploadDisabled ? 'disabled' : ''}>確認上傳</button>
                                        <button id="cancel-upload-btn" onclick="window.handleCancelFile()">取消</button>
                                    </div>
                                </div>
                            ` : '<p>請選擇科目與類別，然後上傳符合格式的 JSON 檔案。</p>'}

                             <div class="upload-status ${state.uploadStatus !== 'idle' ? 'visible ' + state.uploadStatus : ''}">
                                ${state.uploadMessage}
                            </div>
                         </div>
                         
                         <div class="format-examples-container">
                            <h4>JSON 格式範例</h4>
                            <div class="format-example-content">
                                <div class="format-example">
                                    <p>檔案內容必須是一個包含題目物件的<strong>陣列 (Array)</strong>。</p>
                                    <pre>[
  {
    "text": "題目敘述...",
    "imgurl": "https://example.com/image.jpg",
    "options": ["選項A", "選項B", "選項C", "選項D"],
    "optionImages": ["urlA", null, "urlC", null], // 選填：對應選項的圖片
    "answer": "選項A",
    "explanation": "詳解..."
  },
  {
    "text": "第二題...",
    "options": ["1", "2", "3", "4"],
    "answer": "2",
    "explanation": "..."
  }
]</pre>
                                </div>
                            </div>
                         </div>
                    </div>
                </div>
            `;
        }

        // Student Analytics View (Admin)
         if (state.currentView === 'student-analytics') {
             const studentOptions = `<option value="" disabled selected>請選擇學生</option>` + state.allStudents.map(s => `<option value="${s.id}" ${state.selectedStudentIdForAnalytics === s.id ? 'selected' : ''}>${s.name} (${s.email})</option>`).join('');
             
             let analyticsContent = '<div class="upload-card-body"><p>請從上方選單選擇一位學生以查看其詳細分析。</p></div>';
             
             if (state.selectedStudentIdForAnalytics && state.selectedStudentAnalyticsData) {
                 // Reuse student dashboard view but with admin privileges (true)
                 analyticsContent = createStudentDashboardViewHTML(state.selectedStudentAnalyticsData, true);
             }

             return `
                <div class="admin-view-container">
                    <div class="page-header"><h2>學生分數分析</h2></div>
                    <div class="dashboard-container" style="margin-bottom: 20px;">
                        <div class="admin-filters" style="border:none; padding:0; margin:0;">
                            <select class="filter-select" style="width:100%;" onchange="window.handleStudentAnalyticsSelect(this.value)">${studentOptions}</select>
                        </div>
                    </div>
                    ${analyticsContent}
                </div>
             `;
         }

        return '';
    }

    function render() {
        const appContainer = document.getElementById('app-container');
        const loginContainer = document.getElementById('login-container');
        const modalContainer = document.getElementById('modal-container');
        const sidebarContainer = document.getElementById('sidebar-container');
        const mainContentContainer = document.getElementById('main-content-container');

        // Modal Rendering
        let modalHTML = '';
        if (state.reviewingExam) {
            modalHTML = createReviewExamViewHTML(state.reviewingExam);
        } else if (state.editingQuestion) {
             const q = state.editingQuestion;
             // Ensure optionImages array exists and has 4 elements for safe indexing
             const optImgs = q.optionImages && q.optionImages.length === 4 ? q.optionImages : [null, null, null, null];

             modalHTML = `
                <div class="modal-backdrop">
                    <div class="modal-content" style="height: auto; max-height: 90vh;">
                        <div class="modal-header">
                            <h3>編輯題目</h3>
                            <button class="modal-close-btn" onclick="window.closeEditModal()">×</button>
                        </div>
                        <div class="modal-body">
                            <form id="edit-question-form" class="admin-form">
                                <div class="form-group"><label>題目敘述</label><textarea name="questionText" rows="3" required>${q.text}</textarea></div>
                                <div class="form-group"><label>圖片網址 (選填)</label><input type="text" name="imgurl" value="${q.imgurl || ''}"></div>
                                
                                <div class="form-group">
                                    <label>選項 1</label>
                                    <input type="text" name="option1" value="${q.options[0]}" required>
                                    <input type="text" name="option1_img" placeholder="選項 1 圖片網址 (選填)" value="${optImgs[0] || ''}" class="mt-1">
                                </div>
                                <div class="form-group">
                                    <label>選項 2</label>
                                    <input type="text" name="option2" value="${q.options[1]}" required>
                                    <input type="text" name="option2_img" placeholder="選項 2 圖片網址 (選填)" value="${optImgs[1] || ''}" class="mt-1">
                                </div>
                                <div class="form-group">
                                    <label>選項 3</label>
                                    <input type="text" name="option3" value="${q.options[2]}" required>
                                    <input type="text" name="option3_img" placeholder="選項 3 圖片網址 (選填)" value="${optImgs[2] || ''}" class="mt-1">
                                </div>
                                <div class="form-group">
                                    <label>選項 4</label>
                                    <input type="text" name="option4" value="${q.options[3]}" required>
                                    <input type="text" name="option4_img" placeholder="選項 4 圖片網址 (選填)" value="${optImgs[3] || ''}" class="mt-1">
                                </div>
                                
                                <div class="form-group"><label>正確答案</label><input type="text" name="answer" value="${q.answer}" required></div>
                                <div class="form-group"><label>詳解</label><textarea name="explanation" rows="3" required>${q.explanation}</textarea></div>
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
                        <div class="modal-header">
                            <h3>編輯使用者</h3>
                            <button class="modal-close-btn" onclick="window.closeEditModal()">×</button>
                        </div>
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
            appContainer.style.display = 'none';
            loginContainer.style.display = 'flex';
            loginContainer.innerHTML = createLoginViewHTML();
            
            // Re-attach login listener
            const loginForm = document.getElementById('login-form');
            if (loginForm) loginForm.onsubmit = handleLogin;
            
            // Re-attach role toggle listeners
            document.querySelectorAll('.role-tab').forEach(btn => {
                btn.onclick = (e) => setState({ loginAsRole: e.target.dataset.role, loginError: '' });
            });
            return;
        }

        // Main App View
        appContainer.style.display = 'flex';
        loginContainer.style.display = 'none';
        
        sidebarContainer.innerHTML = createSidebarHTML();
        
        // Attach sidebar listeners
        if (state.currentUser.role === 'student') {
             document.getElementById('nav-dashboard').onclick = (e) => { e.preventDefault(); setState({ currentView: 'dashboard' }); };
             document.getElementById('nav-exam-selection').onclick = (e) => { e.preventDefault(); setState({ currentView: 'exam-selection', selectedExamSubject: null }); };
        } else {
             document.getElementById('nav-user-management').onclick = (e) => { e.preventDefault(); setState({ currentView: 'user-management' }); };
             document.getElementById('nav-subject-management').onclick = (e) => { e.preventDefault(); setState({ currentView: 'subject-management' }); };
             document.getElementById('nav-question-editing').onclick = (e) => { e.preventDefault(); setState({ currentView: 'question-editing' }); };
             document.getElementById('nav-bulk-upload').onclick = (e) => { e.preventDefault(); setState({ currentView: 'bulk-upload' }); };
             document.getElementById('nav-student-analytics').onclick = (e) => { e.preventDefault(); setState({ currentView: 'student-analytics' }); };
        }
        document.getElementById('logout-btn').onclick = handleLogout;

        // Content Area Rendering
        let contentHTML = '';
        if (state.currentUser.role === 'student') {
            if (state.currentView === 'dashboard') {
                contentHTML = createStudentDashboardViewHTML(state.currentUser);
            } else if (state.currentView === 'exam-selection') {
                contentHTML = createExamSelectionViewHTML();
            } else if (state.currentView === 'exam-category-selection') {
                 // Category selection logic inline for brevity
                 const subjectCategories = state.categories[state.selectedExamSubject] || [];
                 const categoryCardsHTML = subjectCategories.map(cat => `
                    <div class="category-card" onclick="window.startExam('${state.selectedExamSubject}', '${cat.name}')" style="cursor: pointer;">
                        <h3>${cat.name}</h3>
                        <div class="category-info">
                            <div class="category-meta">${icons.clock} ${cat.timeLimit} 分鐘</div>
                        </div>
                        <button class="start-exam-button" style="width:100%; justify-content:center;">開始測驗</button>
                    </div>
                 `).join('');
                 
                 contentHTML = `
                    <div class="page-header">
                        <div><h2>${state.selectedExamSubject} - 選擇類別</h2><p>請選擇一個主題開始測驗</p></div>
                    </div>
                    <button class="back-button" onclick="window.goBackToSubjects()">${icons.arrowLeft} 返回科目列表</button>
                    <div class="category-grid">${categoryCardsHTML}</div>
                 `;
            } else if (state.currentView === 'exam-taking') {
                contentHTML = createExamTakingViewHTML();
            }
        } else {
            contentHTML = createAdminViewHTML();
        }
        mainContentContainer.innerHTML = contentHTML;

        // Post-render listeners
        const addSubjectForm = document.getElementById('add-subject-form');
        if (addSubjectForm) addSubjectForm.onsubmit = handleAddSubject;
        
        const addCategoryForm = document.getElementById('add-category-form');
        if (addCategoryForm) addCategoryForm.onsubmit = handleAddCategory;

        const editQuestionForm = document.getElementById('edit-question-form');
        if (editQuestionForm) editQuestionForm.onsubmit = handleUpdateQuestion;
        
        const editUserForm = document.getElementById('edit-user-form');
        if (editUserForm) editUserForm.onsubmit = handleUpdateUser;

        // Attach listeners for dynamic elements (like select buttons in subject cards)
        document.querySelectorAll('.select-button').forEach(btn => {
            btn.onclick = () => setState({ currentView: 'exam-category-selection', selectedExamSubject: btn.dataset.subject });
        });
        
        // Review buttons
        document.querySelectorAll('.review-button').forEach(btn => {
            btn.onclick = () => {
                const examId = btn.dataset.examId;
                // Look in current user history OR selected student history
                let exam = state.currentUser?.examHistory?.find(e => e.id === examId);
                if(!exam && state.selectedStudentAnalyticsData) {
                    exam = state.selectedStudentAnalyticsData.examHistory.find(e => e.id === examId);
                }
                if (exam) setState({ reviewingExam: exam });
            };
        });
        
        // Delete History Buttons (Admin)
        document.querySelectorAll('.delete-history-btn').forEach(btn => {
            btn.onclick = () => window.handleDeleteExamHistory(btn.dataset.historyId);
        });

        // Delete Bookmark Buttons
        document.querySelectorAll('.delete-bookmark-btn').forEach(btn => {
             btn.onclick = (e) => {
                 e.stopPropagation(); // prevent card click
                 // Determine user context
                 const userId = state.currentView === 'student-analytics' ? state.selectedStudentIdForAnalytics : state.currentUser.id;
                 window.handleDeleteBookmark(btn.dataset.questionId, userId);
             };
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
    window.goBackToSubjects = () => setState({ currentView: 'exam-selection', selectedExamSubject: null });
    window.closeReviewModal = () => setState({ reviewingExam: null });
    
    // Admin Globals
    window.handleDeleteSubject = handleDeleteSubject;
    window.handleDeleteCategory = handleDeleteCategory;
    window.handleAdminSubjectFilterChange = (val) => setState({ selectedAdminSubject: val });
    window.handleAdminCategoryFilterChange = (val) => setState({ selectedAdminCategory: val });
    window.handleDeleteQuestion = handleDeleteQuestion;
    window.openEditQuestionModal = (id) => {
        const q = state.allQuestions.find(i => i.id === id);
        if (q) setState({ editingQuestion: q });
    };
    window.closeEditModal = () => setState({ editingQuestion: null, editingUser: null });
    
    window.handleBulkUploadSubjectChange = (val) => setState({ selectedBulkUploadSubject: val });
    window.handleBulkUploadCategoryChange = (val) => setState({ selectedBulkUploadCategory: val });
    window.handleFileSelect = (input) => {
         if (input.files && input.files[0]) {
             setState({ selectedFile: input.files[0], uploadStatus: 'idle', uploadMessage: '' });
         }
    };
    window.handleCancelFile = () => {
        const input = document.getElementById('json-upload-input');
        if(input) input.value = '';
        setState({ selectedFile: null, uploadStatus: 'idle', uploadMessage: '' });
    };
    window.handleBulkUpload = handleBulkUpload;
    
    window.handleDeleteUser = handleDeleteUser;
    window.openEditUserModal = (id) => {
        const u = state.allStudents.find(i => i.id === id);
        if (u) setState({ editingUser: u });
    };
    
    window.handleStudentAnalyticsSelect = async (studentId) => {
        if (!studentId) {
             setState({ selectedStudentIdForAnalytics: null, selectedStudentAnalyticsData: null });
             return;
        }
        setLoading(true);
        try {
             const userDoc = await getDoc(doc(db, "users", studentId));
             if (userDoc.exists()) {
                 const userData = { id: userDoc.id, ...userDoc.data() };
                 
                 // Fetch Sub-collections
                 const historySnapshot = await getDocs(collection(db, 'examHistory'), where("userId", "==", studentId));
                 const examHistory = historySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                 
                 const bookmarkSnapshot = await getDocs(collection(db, 'bookmarkedQuestions'), where("userId", "==", studentId));
                 const bookmarks = []; // Need to fetch full question details for bookmarks
                 
                 // For bookmarks, we store questionId, need to look up text in state.allQuestions
                 bookmarkSnapshot.docs.forEach(d => {
                     const bData = d.data();
                     const qDetails = state.allQuestions.find(q => q.id === bData.questionId);
                     if (qDetails) {
                         bookmarks.push({ ...qDetails, bookmarkId: d.id });
                     }
                 });

                 // Calculate Stats
                 // ... reuse or recalculate logic as needed
                 const radarData = []; // Simplified for now
                 
                 const fullData = {
                     ...userData,
                     examHistory,
                     bookmarkedQuestions: bookmarks,
                     radarChartData: radarData // In real app, calculate from history
                 };
                 setState({ selectedStudentIdForAnalytics: studentId, selectedStudentAnalyticsData: fullData });
             }
        } catch(e) {
            console.error(e);
            alert("讀取學生資料失敗");
        } finally {
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
                    const userDocRef = doc(db, 'users', user.uid);
                    let userDoc = await getDoc(userDocRef);
                    
                    if (!userDoc.exists()) {
                        // Create user doc if strictly not exists (handled by rules mostly but good for safety)
                         // Wait... security rules allow creation by user.
                         // But for now let's assume valid user.
                    }
                    
                    const userData = userDoc.exists() ? userDoc.data() : {};
                    const role = userData.role || 'student'; // Default to student
                    
                    // 2. Fetch Common Data (Subjects, Categories, Questions)
                    // In a real large app, you might not fetch ALL questions at once.
                    const subjectsSnapshot = await getDocs(collection(db, 'subjects'));
                    const subjects = subjectsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name));
                    
                    const categoriesSnapshot = await getDocs(collection(db, 'categories'));
                    const categories = {};
                    subjects.forEach(s => categories[s.name] = []);
                    categoriesSnapshot.docs.forEach(d => {
                        const c = { id: d.id, ...d.data() };
                        if (categories[c.subject]) categories[c.subject].push(c);
                    });
                    
                    const questionsSnapshot = await getDocs(collection(db, 'questions'));
                    const allQuestions = questionsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                    // 3. Admin Specifics
                    let allStudents = [];
                    if (role === 'admin') {
                        const usersSnapshot = await getDocs(query(collection(db, 'users'))); // Get all users
                        allStudents = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    } else {
                         // 4. Student Specifics (History, Bookmarks)
                         const historySnapshot = await getDocs(query(collection(db, 'examHistory'), where("userId", "==", user.uid)));
                         const examHistory = historySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                         
                         const bookmarkSnapshot = await getDocs(query(collection(db, 'bookmarkedQuestions'), where("userId", "==", user.uid)));
                         const bookmarkedQuestions = [];
                         bookmarkSnapshot.docs.forEach(d => {
                             const bData = d.data();
                             const q = allQuestions.find(q => q.id === bData.questionId);
                             if (q) bookmarkedQuestions.push({ ...q, bookmarkId: d.id });
                         });

                         // Calculate Radar Data from History
                         const subjectScores = {};
                         const subjectCounts = {};
                         examHistory.forEach(h => {
                             if (!subjectScores[h.subject]) { subjectScores[h.subject] = 0; subjectCounts[h.subject] = 0; }
                             subjectScores[h.subject] += h.score;
                             subjectCounts[h.subject]++;
                         });
                         const radarChartData = Object.keys(subjectScores).map(subj => ({
                             subject: subj,
                             score: Math.round(subjectScores[subj] / subjectCounts[subj])
                         }));

                         state.currentUser = {
                             id: user.uid,
                             email: user.email,
                             role,
                             ...userData,
                             examHistory,
                             bookmarkedQuestions,
                             radarChartData
                         };
                    }

                    if (role === 'admin') {
                         state.currentUser = { id: user.uid, email: user.email, role, ...userData };
                         state.allStudents = allStudents;
                    }

                    setState({
                        isLoggedIn: true,
                        currentUser: state.currentUser,
                        subjects,
                        categories,
                        allQuestions,
                        allStudents,
                        currentView: role === 'student' ? 'dashboard' : 'user-management', // Admin defaults to user mgmt
                        loginAsRole: role // Sync selector
                    });

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

    render();
});
