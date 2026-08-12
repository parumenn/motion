const DB_KEY = 'local_workspace_data';
const COMMANDS = [
    { id: 'image', label: 'Image', desc: '画像を挿入', keys: ['image', '画像', 'pic'] },
    { id: 'link', label: 'Web Link', desc: 'Webリンクを挿入', keys: ['link', 'リンク'] },
    { id: 'page', label: 'Page', desc: 'サブページを作成', keys: ['page', 'ページ'] },
    { id: 'linkpage', label: 'Link to Page', desc: '既存ページへのリンク', keys: ['linkpage', 'ページリンク'] },
    { id: 'h1', label: 'Heading 1', desc: '大見出し', keys: ['h1', '見出し1'] },
    { id: 'h2', label: 'Heading 2', desc: '中見出し', keys: ['h2', '見出し2'] },
    { id: 'h3', label: 'Heading 3', desc: '小見出し', keys: ['h3', '見出し3'] },
    { id: 'todo', label: 'To-do list', desc: 'タスク管理', keys: ['todo', 'タスク'] },
    { id: 'toggle', label: 'Toggle list', desc: '折りたたみリスト', keys: ['toggle', 'トグル'] }
];

let state = { pages: {}, rootPages: [], currentPageId: null, expandedNodes: [], recentPages: [] };
let sortableInstances = [];
let pendingImageTargetBlock = null;

let currentMediaBytes = 0;
const MAX_MEDIA_BYTES = 500 * 1024 * 1024; // 500MB 上限

// Appwrite Storageから画像を削除する処理
async function deleteImageFromStorage(fileUrl, fileId) {
    let idToDelete = fileId;
    if (!idToDelete && fileUrl) {
        const match = fileUrl.match(/\/files\/([^\/?#]+)/);
        if (match) idToDelete = match[1];
    }
    if (idToDelete) {
        try {
            await storage.deleteFile(BUCKET_ID, idToDelete);
            console.log('Storageからファイルを削除しました:', idToDelete);
            calcStorageUsage(); // 容量計算を更新
        } catch (e) {
            console.error('Storage削除エラー:', e);
        }
    }
}

let historyStack = {}; 
let historyIndex = {};

const generateId = () => '_' + Math.random().toString(36).substr(2, 9);
const clone = (obj) => JSON.parse(JSON.stringify(obj));

// ================= Appwrite 初期化 =================
const { Client, Account, Databases, Storage, ID, Query, Permission, Role } = Appwrite;

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('6a75a37300149977659a');

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

const DB_ID = 'motion_db';
const COLLECTION_PAGES = 'pages';
const BUCKET_ID = 'motion_storage';

let currentUser = null;

// 設定をクラウドへ保存するヘルパー関数
async function savePrefs(key, value) {
    if (!currentUser) return;
    try {
        const prefs = await account.getPrefs();
        prefs[key] = value;
        await account.updatePrefs(prefs);
    } catch(e) { console.error('Prefs update error:', e); }
}

// ================= 認証・初期化処理 =================
async function initApp() {
    applyTheme();
    
    const savedQuality = localStorage.getItem('motion_image_quality') || 'original';
    const qualitySelect = document.getElementById('setting-image-quality');
    if (qualitySelect) qualitySelect.value = savedQuality;

    try {
        currentUser = await account.get();
        
        try {
            const userDoc = await databases.getDocument(DB_ID, 'users', currentUser.$id);
            if (userDoc.status !== 'approved') {
                showPendingApprovalModal(currentUser.email);
                return;
            }
        } catch (err) {
            showPendingApprovalModal(currentUser?.email || '');
            return;
        }

        // --- 承認済みユーザー ---
        // ログイン成功時にノート画面を表示する（完全分離対応）
        document.getElementById('sidebar')?.classList.remove('hidden');
        document.getElementById('main')?.classList.remove('hidden');
        document.getElementById('login-overlay')?.classList.add('hidden');

        const userInfoText = document.getElementById('user-info-text');
        if (userInfoText) {
            userInfoText.textContent = `ログイン中: ${currentUser.name} (${currentUser.email})`;
        }
        
        if (currentUser.email === 'thonglo02cocoa@gmail.com') {
            document.getElementById('tab-btn-admin')?.classList.remove('hidden');
            checkPendingUsersForAdmin();
        }

        try {
            const prefs = await account.getPrefs();
            if (prefs.theme) localStorage.setItem('local_workspace_theme', prefs.theme);
            if (prefs.image_quality) localStorage.setItem('motion_image_quality', prefs.image_quality);
            if (prefs.show_locked !== undefined) localStorage.setItem('motion_show_locked_in_home', prefs.show_locked);
            if (prefs.search_locked !== undefined) localStorage.setItem('motion_search_locked', prefs.search_locked);
        } catch(e) { console.warn('設定の読み込みスキップ:', e); }

        applyTheme();
        const qualitySelectInput = document.getElementById('setting-image-quality');
        if (qualitySelectInput) qualitySelectInput.value = localStorage.getItem('motion_image_quality') || 'original';
        const showLockedInput = document.getElementById('setting-show-locked');
        if (showLockedInput) showLockedInput.checked = (localStorage.getItem('motion_show_locked_in_home') === 'true');
        const searchLockedInput = document.getElementById('setting-search-locked');
        if (searchLockedInput) searchLockedInput.checked = (localStorage.getItem('motion_search_locked') === 'true');

        const savedUi = localStorage.getItem('motion_ui_state');
        if (savedUi) {
            const parsedUi = JSON.parse(savedUi);
            state.expandedNodes = parsedUi.expandedNodes || [];
            state.recentPages = parsedUi.recentPages || [];
        }

        await loadDataFromAppwrite();

        state.expandedNodes = state.expandedNodes.filter(id => {
            const lockedBy = isPageLocked(id);
            return !lockedBy || lockedBy.isUnlockedSession;
        });

        renderTree();
        openPage('home');
        calcStorageUsage();
    } catch (err) {
        currentUser = null;
        showAuthModal();
    }
}

// 未承認ユーザー用の停止画面を表示するヘルパー関数
function showPendingApprovalModal(email) {
    const authOverlay = document.getElementById('login-overlay');
    if (!authOverlay) return;

    // ノート画面を非表示にしてログイン画面を完全に分離する
    document.getElementById('sidebar')?.classList.add('hidden');
    document.getElementById('main')?.classList.add('hidden');

    const formContainer = document.querySelector('.login-form-container .modal');
    if (formContainer) {
        formContainer.innerHTML = `
            <h3>承認待ちです</h3>
            <p style="font-size:14px; color:var(--text-main); margin:16px 0; line-height:1.6;">
                アカウント (<strong>${email}</strong>) は現在管理者の承認待ちです。<br>
                承認されるまでご利用いただけません。
            </p>
            <button type="button" id="pending-logout-btn" class="primary-btn" style="margin-bottom:8px;">ログアウトして別のアカウントでログイン</button>
        `;

        document.getElementById('pending-logout-btn').onclick = async () => {
            try {
                await account.deleteSession('current');
            } catch (e) {}
            currentUser = null;
            location.reload();
        };
    }
    authOverlay.classList.remove('hidden');
}

// イベントリスナー: 設定が変更されたらローカルストレージとクラウド両方に保存
document.getElementById('setting-image-quality')?.addEventListener('change', (e) => {
    const val = e.target.value;
    localStorage.setItem('motion_image_quality', val);
    savePrefs('image_quality', val);
});

document.getElementById('setting-show-locked')?.addEventListener('change', (e) => {
    const val = e.target.checked;
    localStorage.setItem('motion_show_locked_in_home', val);
    savePrefs('show_locked', val);
    if(state.currentPageId === 'home') renderHome();
});

document.querySelectorAll('input[name="theme"]').forEach(r => r.onchange = (e) => { 
    const val = r.value;
    localStorage.setItem('local_workspace_theme', val); 
    applyTheme(); 
    savePrefs('theme', val);
});

document.querySelector('.settings-tab[data-tab="account"]')?.addEventListener('click', () => {
    calcStorageUsage();
});

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    if (bytes < 1024) return `${bytes} Bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function calcStorageUsage() {
    const usageText = document.getElementById('storage-usage-text');
    const limitText = document.getElementById('storage-limit-text');
    const barFill = document.getElementById('storage-bar-fill');
    if (!usageText) return;

    let textBytes = 0;
    Object.values(state.pages).forEach(page => {
        const blocksData = page.blocks || [];
        const pageString = typeof blocksData === 'string' ? blocksData : JSON.stringify(blocksData);
        textBytes += new Blob([pageString]).size;
    });

    usageText.innerHTML = `テキストデータ: ${formatBytes(textBytes)}<br>添付ファイル: 計算中...`;

    try {
        if (currentUser) {
            const fileList = await storage.listFiles(BUCKET_ID);
            currentMediaBytes = fileList.files.reduce((sum, file) => sum + (file.sizeOriginal || 0), 0);
        }
    } catch (err) {
        console.error("ストレージ使用量取得エラー:", err);
    }

    usageText.innerHTML = `テキストデータ: ${formatBytes(textBytes)}<br>添付ファイル: ${formatBytes(currentMediaBytes)}`;
    
    // プログレスバーの更新処理
if (limitText && barFill) {
    const percent = Math.min((currentMediaBytes / MAX_MEDIA_BYTES) * 100, 100);
    barFill.style.width = `${percent}%`;
    barFill.classList.remove('warning', 'danger');
    
    const warningText = document.getElementById('storage-warning-text');
    
    if (percent >= 90) {
        barFill.classList.add('danger');
        if(warningText) warningText.classList.remove('hidden'); // 90%超過で警告表示
    }
    else if (percent >= 70) {
        barFill.classList.add('warning');
        if(warningText) warningText.classList.add('hidden');
    } else {
        if(warningText) warningText.classList.add('hidden');
    }
    
    limitText.textContent = `${formatBytes(currentMediaBytes)} / 500.00 MB (${percent.toFixed(1)}%)`;
}
}

const usernameToEmail = (username) => `${username.toLowerCase()}@motion.local`;

let tempAuthData = null; // OTP検証用データ保持

function showAuthModal() {
    const authOverlay = document.getElementById('login-overlay');
    if (!authOverlay) return;

    // ノート画面を非表示にしてログイン画面を完全に分離する
    document.getElementById('sidebar')?.classList.add('hidden');
    document.getElementById('main')?.classList.add('hidden');

    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    const authSubmit = document.getElementById('auth-submit-btn');
    const authToggle = document.getElementById('auth-toggle-btn');
    const authForm = document.getElementById('auth-form');
    const confirmInput = document.getElementById('auth-password-confirm');
    const confirmWrapper = document.getElementById('auth-password-confirm-wrapper');

    let otpContainer = document.getElementById('otp-container');
    if (!otpContainer) {
        otpContainer = document.createElement('div');
        otpContainer.id = 'otp-container';
        otpContainer.className = 'hidden';
        otpContainer.innerHTML = `
            <p style="font-size:14px; margin-bottom:12px; color:var(--text-main);">メールに送信された6桁の認証コードを入力してください。</p>
            <input type="text" id="auth-otp" placeholder="6桁のコード" maxlength="6" style="margin-bottom:12px;">
            <button type="button" id="auth-otp-submit" class="primary-btn">認証して申請</button>
            <button type="button" id="auth-otp-cancel" class="cancel-btn">キャンセル</button>
        `;
        authForm.appendChild(otpContainer);
    }

    let inputsWrapper = document.getElementById('auth-inputs-wrapper');
    if (!inputsWrapper) {
        inputsWrapper = document.createElement('div');
        inputsWrapper.id = 'auth-inputs-wrapper';
        usernameInput.parentNode.insertBefore(inputsWrapper, usernameInput);
        inputsWrapper.append(usernameInput, passwordInput.parentNode, confirmWrapper, authSubmit, authToggle);
    }

    usernameInput.value = '';
    passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    inputsWrapper.classList.remove('hidden');
    otpContainer.classList.add('hidden');
    authOverlay.classList.remove('hidden');
    let isSignUp = false;

    authToggle.onclick = () => {
        isSignUp = !isSignUp;
        document.getElementById('auth-title').textContent = isSignUp ? 'アカウント作成' : 'ログイン';
        authSubmit.textContent = isSignUp ? 'アカウントを作成' : 'ログイン';
        authToggle.textContent = isSignUp ? 'ログインへ切替' : 'アカウント作成へ切替';
        usernameInput.value = '';
        passwordInput.value = '';
        if (confirmInput) confirmInput.value = '';
        passwordInput.setAttribute('autocomplete', isSignUp ? 'new-password' : 'current-password');
        
        if (isSignUp) {
            confirmWrapper?.classList.remove('hidden');
        } else {
            confirmWrapper?.classList.add('hidden');
        }
    };

    authSubmit.onclick = async () => {
        const email = usernameInput.value.trim();
        const pass = passwordInput.value.trim();
        const confirmPass = confirmInput ? confirmInput.value.trim() : '';

        if (!email || !pass) return alert('メールアドレスとパスワードを入力してください');
        if (!email.includes('@') || !email.includes('.')) {
            return alert('有効なメールアドレスを入力してください');
        }

        if (isSignUp) {
            if (pass !== confirmPass) {
                return alert('パスワードと確認用パスワードが一致しません');
            }
            if (pass.length < 8) {
                return alert('パスワードは8文字以上で設定してください');
            }
        }

        try {
            if (isSignUp) {
                const newUser = await account.create(ID.unique(), email, pass);
                await account.createEmailSession(email, pass);
                await databases.createDocument(
                    DB_ID, 'users', newUser.$id, 
                    { email: email, status: 'pending' },
                    [
                        Permission.read(Role.any()),
                        Permission.update(Role.user(newUser.$id)),
                        Permission.delete(Role.user(newUser.$id))
                    ]
                );
                await sendAdminRequestEmail(email);
                await account.deleteSession('current');
                alert('アカウントを作成しました。管理者の承認をお待ちください。');
                location.reload();
            } else {
                try {
                    await account.deleteSession('current');
                } catch (e) {}
                await account.createEmailSession(email, pass);
                usernameInput.value = '';
                passwordInput.value = '';
                authOverlay.classList.add('hidden');
                location.reload();
            }
        } catch (e) {
            alert(`エラー: ${e.message}`);
        }
    };

    document.getElementById('auth-otp-submit').onclick = async () => {
        const secret = document.getElementById('auth-otp').value.trim();
        if(!secret) return alert('認証コードを入力してください');
        try {
            await account.createSession(tempAuthData.userId, secret);
            await databases.createDocument(DB_ID, 'users', tempAuthData.userId, { email: tempAuthData.email, status: 'pending' });
            await sendAdminRequestEmail(tempAuthData.email);
            await account.deleteSession('current');
            alert('管理者にアカウント開設のリクエストを送りました。承認されるまでお待ちください。');
            location.reload();
        } catch (e) {
            alert(`認証エラー: ${e.message}`);
        }
    };

    document.getElementById('auth-otp-cancel').onclick = () => {
        inputsWrapper.classList.remove('hidden');
        otpContainer.classList.add('hidden');
        document.getElementById('auth-title').textContent = 'アカウント作成';
        tempAuthData = null;
    };
}

document.getElementById('btn-change-pass')?.addEventListener('click', async () => {
    const oldPass = document.getElementById('change-pass-old').value;
    const newPass = document.getElementById('change-pass-new').value;
    if (!oldPass || !newPass) return alert('旧パスワードと新パスワードを入力してください');

    try {
        await account.updatePassword(newPass, oldPass);
        alert('パスワードを変更しました。');
        document.getElementById('change-pass-old').value = '';
        document.getElementById('change-pass-new').value = '';
    } catch (e) {
        alert(`変更失敗: ${e.message}`);
    }
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await account.deleteSession('current');
    location.reload();
});

// ================= Appwrite データ同期 =================
async function loadDataFromAppwrite() {
    try {
        const response = await databases.listDocuments(DB_ID, COLLECTION_PAGES);

        state.pages = {};
        state.rootPages = [];

        const pageMap = {};
        for (const doc of response.documents) {
            if (!pageMap[doc.pageId]) {
                pageMap[doc.pageId] = doc;
            } else {
                try {
                    await databases.deleteDocument(DB_ID, COLLECTION_PAGES, doc.$id);
                } catch (e) {}
            }
        }

        Object.values(pageMap).forEach(doc => {
            let parsedBlocks = doc.blocks;
            if (typeof parsedBlocks === 'string') {
                try { parsedBlocks = JSON.parse(parsedBlocks); } catch (err) { parsedBlocks = []; }
            }
            if (!Array.isArray(parsedBlocks)) {
                parsedBlocks = [{ id: generateId(), type: 'p', content: '', children: [] }];
            }

            state.pages[doc.pageId] = {
                id: doc.pageId,
                title: doc.title || '',
                parentId: doc.parentId || null,
                blocks: parsedBlocks,
                isLocked: doc.isLocked || false,
                $id: doc.$id
            };
            if (!doc.parentId) state.rootPages.push(doc.pageId);
        });

        if (Object.keys(state.pages).length === 0) {
            const id = generateId();
            const initialPage = { 
                id, 
                title: 'はじめに', 
                parentId: null, 
                blocks: [{ id: generateId(), type: 'p', content: 'Welcome to Motion!', children: [] }], 
                isLocked: false 
            };
            state.pages[id] = initialPage;
            state.rootPages.push(id);
            await createPageInAppwrite(initialPage);
        }
    } catch (e) {
        console.error('Data load error:', e);
    }
}

async function createPageInAppwrite(page) {
    if (!currentUser) return;
    
    const payload = {
        pageId: page.id,
        title: page.title || '',
        parentId: page.parentId || null,
        blocks: JSON.stringify(page.blocks),
        isLocked: page.isLocked || false
    };

    // ログイン中のユーザーID（currentUser.$id）に対してのみ、読み・書き・削除を許可する
    const permissions = [
        Permission.read(Role.user(currentUser.$id)),
        Permission.update(Role.user(currentUser.$id)),
        Permission.delete(Role.user(currentUser.$id))
    ];

    try {
        const doc = await databases.createDocument(DB_ID, COLLECTION_PAGES, ID.unique(), payload, permissions);
        page.$id = doc.$id;
    } catch (e) {
        console.error('Create page error:', e);
    }
}

async function saveDataToAppwrite(pageTarget) {
    if (!currentUser) return;
    const page = pageTarget || state.pages[state.currentPageId];
    if (!page || page.id === 'home') return;

    if (!page.$id) {
        await createPageInAppwrite(page);
        return;
    }

    const payload = {
        pageId: page.id,
        title: page.title || '',
        parentId: page.parentId || null,
        blocks: JSON.stringify(page.blocks),
        isLocked: page.isLocked || false
    };

    try {
        await databases.updateDocument(DB_ID, COLLECTION_PAGES, page.$id, payload);
    } catch (e) {
        console.error('Update error:', e);
    }
}

async function saveData() {
    if (state.currentPageId && state.currentPageId !== 'home') {
        await saveDataToAppwrite(state.pages[state.currentPageId]);
    }
    const uiState = {
        expandedNodes: state.expandedNodes,
        recentPages: state.recentPages
    };
    localStorage.setItem('motion_ui_state', JSON.stringify(uiState));
}

(async () => {
    await initApp();
})();

function isPageLocked(pageId) {
    let currentId = pageId;
    while(currentId) {
        const p = state.pages[currentId];
        if(!p) break;
        if(p.isLocked) return p;
        currentId = p.parentId;
    }
    return null;
}

document.getElementById('setting-search-locked')?.addEventListener('change', (e) => {
    const val = e.target.checked;
    localStorage.setItem('motion_search_locked', val);
    savePrefs('search_locked', val);
});


function applyTheme() {
    const theme = localStorage.getItem('local_workspace_theme') || 'light';
    document.body.classList.toggle('dark-mode', theme === 'dark');
    document.querySelectorAll('input[name="theme"]').forEach(r => r.checked = (r.value === theme));
}

// ================= Undo / Redo =================
function pushHistory(pageId) {
    if (!historyStack[pageId]) { historyStack[pageId] = []; historyIndex[pageId] = -1; }
    const currentBlocks = clone(state.pages[pageId].blocks);
    
    if(historyIndex[pageId] >= 0) {
        const lastBlocks = historyStack[pageId][historyIndex[pageId]];
        if(JSON.stringify(currentBlocks) === JSON.stringify(lastBlocks)) return;
    }
    historyStack[pageId] = historyStack[pageId].slice(0, historyIndex[pageId] + 1);
    historyStack[pageId].push(currentBlocks);
    if(historyStack[pageId].length > 50) historyStack[pageId].shift();
    else historyIndex[pageId]++;
}
function executeUndo(pageId) {
    if (!historyStack[pageId] || historyIndex[pageId] <= 0) return;
    historyIndex[pageId]--;
    state.pages[pageId].blocks = clone(historyStack[pageId][historyIndex[pageId]]);
    renderEditor(state.pages[pageId]); saveData();
}
function executeRedo(pageId) {
    if (!historyStack[pageId] || historyIndex[pageId] >= historyStack[pageId].length - 1) return;
    historyIndex[pageId]++;
    state.pages[pageId].blocks = clone(historyStack[pageId][historyIndex[pageId]]);
    renderEditor(state.pages[pageId]); saveData();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('search-overlay')?.classList.add('hidden');
        document.getElementById('floating-menu')?.classList.add('hidden');
        document.getElementById('overlay')?.classList.add('hidden');
        document.getElementById('link-overlay')?.classList.add('hidden');
        document.getElementById('ext-link-overlay')?.classList.add('hidden');
        document.getElementById('settings-overlay')?.classList.add('hidden');
        closeSlashMenu();
        document.getElementById('context-menu')?.classList.add('hidden');
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (e.shiftKey) executeRedo(state.currentPageId);
        else executeUndo(state.currentPageId);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (e.target.tagName === 'INPUT') return;
        e.preventDefault(); executeRedo(state.currentPageId);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault(); openSearchModal();
    }
});

// ================= サイドバー・ツリー描画 =================
const sidebar = document.getElementById('sidebar'), sidebarOverlay = document.getElementById('sidebar-overlay'), treeEl = document.getElementById('tree'), editorEl = document.getElementById('editor'), pageTitleEl = document.getElementById('page-title');
let contextMenuTargetId = null;
const contextMenuEl = document.getElementById('context-menu');

function renderTree() {
    if(!treeEl) return;
    treeEl.innerHTML = '';
    const buildTree = (pageIds, container, level) => {
        pageIds.forEach(id => {
            const page = state.pages[id]; if (!page) return;
            const children = Object.values(state.pages).filter(p => p.parentId === id).map(p => p.id);
            const item = document.createElement('div');
            item.className = `tree-item ${state.currentPageId === id ? 'active' : ''}`;
            item.style.paddingLeft = `${16 + level * 16}px`;
            
            const lockedBy = isPageLocked(id);
            const isUnlocked = !lockedBy || lockedBy.isUnlockedSession;
            const isExpanded = isUnlocked && state.expandedNodes.includes(id);
            
            const toggle = document.createElement('div'); toggle.className = 'tree-toggle';
            toggle.innerHTML = children.length > 0 ? (isExpanded ? '▼' : '▶') : '•';
            
            const title = document.createElement('div'); title.className = 'tree-title';
            title.textContent = page.title || '無題';
            item.append(toggle, title);
            
            item.onclick = (e) => {
                if(e.target === toggle && children.length > 0) {
                    const isHidden = childContainer.classList.contains('hidden');
                    if (isHidden) {
                        const lockedBy = isPageLocked(id);
                        if (lockedBy && !lockedBy.isUnlockedSession) {
                            e.stopPropagation();
                            showPasswordModal(lockedBy.id, () => {
                                if (!state.expandedNodes.includes(id)) state.expandedNodes.push(id);
                                saveData(); renderTree();
                            });
                            return;
                        }
                        childContainer.classList.remove('hidden'); toggle.innerHTML = '▼';
                        if (!state.expandedNodes.includes(id)) state.expandedNodes.push(id);
                    } else {
                        childContainer.classList.add('hidden'); toggle.innerHTML = '▶';
                        state.expandedNodes = state.expandedNodes.filter(n => n !== id);
                    }
                    saveData(); e.stopPropagation(); return;
                }
                openPage(id);
            };
            item.oncontextmenu = (e) => {
                e.preventDefault(); e.stopPropagation(); contextMenuTargetId = id;
                contextMenuEl.style.top = `${e.pageY}px`; contextMenuEl.style.left = `${e.pageX}px`; contextMenuEl.classList.remove('hidden');
            };
            container.appendChild(item);

            const childContainer = document.createElement('div');
            childContainer.className = `tree-children ${isExpanded ? '' : 'hidden'}`;
            if (children.length > 0) buildTree(children, childContainer, level + 1);
            container.appendChild(childContainer);
        });
    };
    buildTree(state.rootPages, treeEl, 0);
    document.getElementById('btn-home').classList.toggle('active', state.currentPageId === 'home');
}

document.getElementById('sidebar-toggle-btn').addEventListener('click', () => { sidebar.classList.add('open'); sidebarOverlay.classList.add('active'); });
sidebarOverlay.addEventListener('click', () => { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); });

document.getElementById('add-page-btn').addEventListener('click', async () => {
    const id = generateId(); 
    const newPage = { 
        id, 
        title: '', 
        parentId: null, 
        blocks: [{ id: generateId(), type: 'p', content: '', children: [] }] 
    };
    state.pages[id] = newPage;
    state.rootPages.push(id); 
    await createPageInAppwrite(newPage);
    saveData(); 
    renderTree(); 
    openPage(id); 
    setTimeout(() => pageTitleEl.focus(), 10);
});

document.getElementById('ctx-add-subpage')?.addEventListener('click', async () => {
    const childId = generateId();
    const childPage = { 
        id: childId, 
        title: '', 
        parentId: contextMenuTargetId, 
        blocks: [{ id: generateId(), type: 'p', content: '', children: [] }] 
    };
    state.pages[childId] = childPage;
    if(!state.expandedNodes.includes(contextMenuTargetId)) state.expandedNodes.push(contextMenuTargetId);
    await createPageInAppwrite(childPage);
    saveData(); 
    renderTree(); 
    openPage(childId); 
    setTimeout(() => pageTitleEl?.focus(), 10);
});

document.getElementById('ctx-delete-page')?.addEventListener('click', () => {
    contextMenuEl?.classList.add('hidden');
    if(confirm("このページと中のコンテンツを全て削除しますか？")) {
        const deleteRecursive = async (id) => {
            const children = Object.values(state.pages).filter(p => p.parentId === id);
            for (const child of children) {
                await deleteRecursive(child.id);
            }
            const page = state.pages[id];
            if (page && page.$id) {
                try {
                    await databases.deleteDocument(DB_ID, COLLECTION_PAGES, page.$id);
                } catch (err) {
                    console.error('Server delete error:', err);
                }
            }
            delete state.pages[id]; 
            state.rootPages = state.rootPages.filter(rid => rid !== id);
            state.expandedNodes = state.expandedNodes.filter(rid => rid !== id);
            state.recentPages = state.recentPages.filter(rid => rid !== id);
        };
        (async () => {
            await deleteRecursive(contextMenuTargetId);
            await saveData(); 
            if(state.currentPageId === contextMenuTargetId) openPage('home');
            else renderTree();
        })();
    }
});
document.addEventListener('click', (e) => { if (!e.target.closest('#context-menu')) contextMenuEl?.classList.add('hidden'); });

function updateBreadcrumb(pageId) {
    const breadcrumbEl = document.getElementById('breadcrumb');
    if (pageId === 'home') { breadcrumbEl.innerHTML = ''; return; }
    
    let path = [], currentId = pageId;
    while (currentId) { const p = state.pages[currentId]; if (!p) break; path.unshift(p); currentId = p.parentId; }
    breadcrumbEl.innerHTML = '';
    path.forEach((p, i) => {
        const span = document.createElement('span'); span.className = 'breadcrumb-item'; span.textContent = p.title || '無題'; span.onclick = () => openPage(p.id);
        breadcrumbEl.appendChild(span);
        if (i < path.length - 1) { const sep = document.createElement('span'); sep.className = 'breadcrumb-separator'; sep.textContent = '/'; breadcrumbEl.appendChild(sep); }
    });
}

function trackRecentPage(id) {
    if (!state.recentPages) state.recentPages = [];
    state.recentPages = state.recentPages.filter(pid => pid !== id);
    state.recentPages.unshift(id);
    if(state.recentPages.length > 12) state.recentPages.pop();
    saveData();
}

function renderHome() {
    const container = document.getElementById('home-recent-pages');
    container.innerHTML = '';
    const showLocked = localStorage.getItem('motion_show_locked_in_home') === 'true';
    
    let displayPages = [];
    if (state.recentPages) {
        state.recentPages.forEach(pid => {
            if (state.pages[pid]) {
                const lockedBy = isPageLocked(pid);
                if (lockedBy && !showLocked) return;
                displayPages.push(state.pages[pid]);
            }
        });
    }

    if (displayPages.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:14px;">履歴はありません</div>';
        return;
    }

    displayPages.forEach(p => {
        const card = document.createElement('div');
        card.className = 'recent-page-card';
        card.innerHTML = `<svg class="icon"><use href="#icon-page"></use></svg> <span>${p.title || '無題'}</span>`;
        if (p.isLocked) {
            card.innerHTML += `<svg class="icon" style="margin-left:auto; width:14px; height:14px;"><use href="#icon-lock"></use></svg>`;
        }
        card.onclick = () => openPage(p.id);
        container.appendChild(card);
    });
}

document.getElementById('btn-home').addEventListener('click', () => openPage('home'));

function openPage(id) {
    if (id === 'home') {
        state.currentPageId = 'home';
        document.getElementById('editor-wrapper').classList.add('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('home-wrapper').classList.remove('hidden');
        document.getElementById('mobile-topbar-title').textContent = 'Motion';
        renderTree(); renderHome(); updateBreadcrumb('home');
        if (window.innerWidth <= 768) { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); }
        return;
    }

    const lockedBy = isPageLocked(id);
    if (lockedBy && !lockedBy.isUnlockedSession) { showPasswordModal(lockedBy.id, () => openPage(id)); return; }
    
    trackRecentPage(id);
    state.currentPageId = id; renderTree(); updateBreadcrumb(id);
    
    document.getElementById('empty-state').classList.add('hidden'); 
    document.getElementById('home-wrapper').classList.add('hidden');
    document.getElementById('editor-wrapper').classList.remove('hidden');
    
    const page = state.pages[id];
    pageTitleEl.textContent = page.title || '';
    document.getElementById('mobile-topbar-title').textContent = page.title || '無題';
    
    const lockBtn = document.getElementById('lock-btn');
    if (page.isLocked) { lockBtn.classList.add('locked'); document.getElementById('lock-text').textContent = 'ロックを解除'; }
    else { lockBtn.classList.remove('locked'); document.getElementById('lock-text').textContent = 'ロック'; }
    
    if(!historyStack[id]) pushHistory(id);
    renderEditor(page);
    if (window.innerWidth <= 768) { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); }
}

let titleDebounceTimer = null;
pageTitleEl.addEventListener('input', (e) => {
    const val = e.target.textContent;
    state.pages[state.currentPageId].title = val; 
    document.getElementById('mobile-topbar-title').textContent = val || '無題';
    renderTree(); 
    updateBreadcrumb(state.currentPageId);
    document.querySelectorAll(`.block-content[data-link-id="${state.currentPageId}"]`).forEach(el => el.innerHTML = `📄 ${val || '無題'}`);

    clearTimeout(titleDebounceTimer);
    titleDebounceTimer = setTimeout(async () => {
        await saveData();
    }, 200);
});

pageTitleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { 
        e.preventDefault(); 
        const firstBlock = document.querySelector('#editor .block-content'); 
        if (firstBlock) {
            firstBlock.focus();
            if (firstBlock.contentEditable === "true") {
                setCaretPosition(firstBlock, 0);
            }
        }
    }
});

const overlayIds = ['overlay', 'search-overlay', 'link-overlay', 'ext-link-overlay', 'settings-overlay'];
overlayIds.forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
        if (e.target.id === id) {
            if (id === 'overlay') document.getElementById('modal-cancel')?.click();
            else if (id === 'link-overlay') document.getElementById('link-cancel')?.click();
            else if (id === 'ext-link-overlay') document.getElementById('ext-link-cancel')?.click();
            else if (id === 'settings-overlay') document.getElementById('settings-close')?.click();
            else e.target.classList.add('hidden');
        }
    });
});

function showPasswordModal(lockParentId, onSuccess) {
    const overlay = document.getElementById('overlay'), modalPass = document.getElementById('modal-pass');
    overlay.classList.remove('hidden'); 
    modalPass.value = ''; 
    modalPass.focus();
    
    document.getElementById('modal-submit').onclick = () => {
        const pass = modalPass.value; 
        const parentPage = state.pages[lockParentId];
        parentPage.password = pass; 
        parentPage.isUnlockedSession = true;
        
        modalPass.value = '';
        overlay.classList.add('hidden'); 
        if(onSuccess) onSuccess();
    };
}

document.getElementById('modal-cancel')?.addEventListener('click', () => document.getElementById('overlay').classList.add('hidden'));
document.getElementById('lock-btn')?.addEventListener('click', () => {
    const page = state.pages[state.currentPageId];
    if (page.isLocked) {
        if(confirm("パスワード保護を解除しますか？")) {
            page.isLocked = false; page.password = null; page.isUnlockedSession = false;
            saveEditorState(true); openPage(state.currentPageId);
        }
    } else {
        const pass = prompt("このページをロックするためのパスワードを入力してください:");
        if (pass) {
            page.isLocked = true; page.password = pass; page.isUnlockedSession = false;
            saveEditorState(true); 
            const currentId = state.currentPageId; state.currentPageId = null;
            document.getElementById('editor-wrapper').classList.add('hidden'); document.getElementById('empty-state').classList.remove('hidden');
            state.expandedNodes = state.expandedNodes.filter(id => !isPageLocked(id));
            saveData().then(() => { renderTree(); openPage(currentId); });
        }
    }
});

// ================= エディタ描画と保存 =================
function renderEditor(page) {
    editorEl.innerHTML = ''; 
    let blocks = page.blocks;
    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
        blocks = [{ id: generateId(), type: 'p', content: '', children: [] }];
        page.blocks = blocks;
    }
    renderBlocks(blocks, editorEl); 
    reinitSortables();
}

function renderBlocks(blockArray, container) {
    blockArray.forEach(blockData => {
        const wrapper = document.createElement('div'); 
        wrapper.className = 'block-wrapper'; 
        wrapper.dataset.id = blockData.id; 
        wrapper.dataset.type = blockData.type || 'p';
        if(blockData.checked) wrapper.classList.add('checked'); 
        if(blockData.toggleOpen) wrapper.classList.add('open');

        const main = document.createElement('div'); 
        main.className = 'block-main';
        
        // 【修正】SortableJSに潰されないよう `onmouseup` でメニューを発火させる
        main.innerHTML = `<div class="drag-handle" onmouseup="if(!window.isDraggingBlock) showBlockMenu(event, this)"><svg class="icon"><use href="#icon-grip"></use></svg></div>`;
        
        if (blockData.type === 'todo') { 
            const cb = document.createElement('div'); 
            cb.className = 'todo-checkbox'; 
            cb.onclick = () => { wrapper.classList.toggle('checked'); saveEditorState(true); }; 
            main.appendChild(cb); 
        }
        if (blockData.type === 'toggle') { 
            const tg = document.createElement('div'); 
            tg.className = 'toggle-icon'; 
            tg.innerHTML = '<svg class="icon"><use href="#icon-toggle"></use></svg>'; 
            tg.onclick = () => { wrapper.classList.toggle('open'); saveEditorState(true); }; 
            main.appendChild(tg); 
        }

        const content = document.createElement('div'); 
        content.className = 'block-content'; 
        content.dataset.placeholder = "'/' または MarkDown記法 (#, [], >)";
        
        if (blockData.type === 'page_link') {
            content.contentEditable = "false"; 
            content.tabIndex = 0; 
            content.dataset.linkId = blockData.content;
            const target = state.pages[blockData.content];
            content.innerHTML = target ? `📄 ${target.title || '無題'}` : `📄 削除されたページ`;
            if(target) content.onclick = () => openPage(blockData.content);
            content.addEventListener('keydown', handleNonTextKeydown);
        } else if (blockData.type === 'image') {
            content.contentEditable = "false"; 
            content.tabIndex = 0;
            if (blockData.fileId) content.dataset.fileId = blockData.fileId;
            content.innerHTML = `<img src="${blockData.content}" alt="画像">`;
            content.onclick = () => content.focus();
            content.addEventListener('keydown', handleNonTextKeydown);
        } else {
            content.contentEditable = "true"; 
            content.innerHTML = blockData.content || '';
            content.addEventListener('keydown', handleBlockKeydown); 
            content.addEventListener('input', handleBlockInput); 
            content.addEventListener('paste', handleBlockPaste);
        }
        main.appendChild(content); 
        wrapper.appendChild(main);
        
        const childrenContainer = document.createElement('div'); 
        childrenContainer.className = 'block-children';
        if (blockData.children && Array.isArray(blockData.children) && blockData.children.length > 0) {
            renderBlocks(blockData.children, childrenContainer);
        }
        wrapper.appendChild(childrenContainer); 
        container.appendChild(wrapper);
    });
}

function handleNonTextKeydown(e) {
    const wrapper = e.target.closest('.block-wrapper');
    if (!wrapper) return;
    const contentEl = wrapper.querySelector('.block-content');

    if (e.key === 'Backspace' || e.key === 'Delete') { 
        e.preventDefault(); 
        const prev = wrapper.previousElementSibling; 

        if (wrapper.dataset.type === 'image') {
            const imgEl = wrapper.querySelector('img');
            const fileId = contentEl?.dataset.fileId;
            const imgUrl = imgEl ? imgEl.src : null;
            if (imgUrl || fileId) {
                deleteImageFromStorage(imgUrl, fileId);
            }
        }
        
        wrapper.remove(); 
        saveEditorState(true); 
        if (prev) { 
            const pc = prev.querySelector('.block-content'); 
            if (pc) { 
                pc.focus(); 
                if (pc.contentEditable === "true") setCaretPosition(pc, pc.textContent.length); 
            } 
        }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault(); 
        const prev = wrapper.previousElementSibling;
        if (prev && prev.classList.contains('block-wrapper')) { 
            const pc = prev.querySelector('.block-content'); 
            if (pc) {
                pc.focus(); 
                if (pc.contentEditable === "true") setCaretPosition(pc, pc.textContent.length); 
            }
        } else {
            pageTitleEl.focus();
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const tempContainer = document.createElement('div');
        const newId = generateId();
        renderBlocks([{ id: newId, type: 'p', content: '', children: [] }], tempContainer);
        const newBlock = tempContainer.firstElementChild;
        wrapper.after(newBlock);
        
        const nc = newBlock.querySelector('.block-content');
        if (nc) nc.focus();
        
        saveEditorState(true);
        reinitSortables();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault(); 
        const next = wrapper.nextElementSibling;
        if (next && next.classList.contains('block-wrapper')) { 
            const nc = next.querySelector('.block-content'); 
            if (nc) {
                nc.focus(); 
                if (nc.contentEditable === "true") setCaretPosition(nc, 0); 
            }
        }
    }
}

function reinitSortables() {
    sortableInstances.forEach(s => s.destroy()); 
    sortableInstances = [];
    
    const initS = (el) => sortableInstances.push(new Sortable(el, { 
        group: 'shared', 
        handle: '.drag-handle', 
        animation: 150, 
        fallbackOnBody: true,
        fallbackTolerance: 3,
        onStart: () => { window.isDraggingBlock = true; }, 
        onEnd: () => { 
            // 【修正】ドラッグ終了直後の誤作動を防ぐため、100msの猶予を持たせる
            setTimeout(() => { window.isDraggingBlock = false; }, 100); 
            saveEditorState(true); 
        } 
    }));
    
    if(editorEl) initS(editorEl); 
    document.querySelectorAll('#editor .block-children').forEach(el => initS(el));
}

function extractBlocks(container) {
    if(!container) return [];
    return Array.from(container.children).filter(el => el.classList.contains('block-wrapper')).map(wrapper => {
        const type = wrapper.dataset.type;
        const contentEl = wrapper.querySelector(':scope > .block-main > .block-content');
        const fileId = contentEl?.dataset.fileId || null;

        let content = '';
        if (type === 'page_link') content = contentEl?.dataset.linkId || '';
        else if (type === 'image') content = contentEl?.querySelector('img')?.src || '';
        else if (contentEl) {
            content = DOMPurify.sanitize(contentEl.innerHTML, { ALLOWED_TAGS: ['a','br','b','strong','i','em','u','s','strike','span'], ALLOWED_ATTR: ['href','target','rel','style','class'] });
        }
        return { 
            id: wrapper.dataset.id, 
            type, 
            content, 
            fileId, 
            checked: wrapper.classList.contains('checked'), 
            toggleOpen: wrapper.classList.contains('open'), 
            children: extractBlocks(wrapper.querySelector(':scope > .block-children')) 
        };
    });
}

let saveDebounceTimer = null;
function saveEditorState(isStructuralChange = false) {
    if (!state.currentPageId || !editorEl) return;
    const page = state.pages[state.currentPageId];
    const executeSave = async () => {
        page.blocks = extractBlocks(editorEl);
        if(isStructuralChange) pushHistory(state.currentPageId);
        await saveData();
    };
    if (isStructuralChange) { clearTimeout(saveDebounceTimer); executeSave(); }
    else { 
        clearTimeout(saveDebounceTimer); 
        saveDebounceTimer = setTimeout(executeSave, 200); 
    }
}

function getCaretOffset(element) {
    const sel = window.getSelection(); if (sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0); const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element); preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
}
function setCaretPosition(el, pos) {
    const range = document.createRange(); const sel = window.getSelection();
    let charIndex = 0, nodeStack = [el], node, found = false;
    if(pos === 0) { range.setStart(el, 0); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); return; }
    while (!found && (node = nodeStack.pop())) {
        if (node.nodeType === 3) {
            const nextCharIndex = charIndex + node.length;
            if (pos <= nextCharIndex) { range.setStart(node, pos - charIndex); found = true; }
            charIndex = nextCharIndex;
        } else {
            let i = node.childNodes.length; while (i--) nodeStack.push(node.childNodes[i]);
        }
    }
    range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
}
function insertNodeAtCaret(node) {
    const sel = window.getSelection(); if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0); range.deleteContents();
    const lastNode = node.nodeType === 11 ? node.lastChild : node;
    range.insertNode(node);
    if (lastNode) { range.setStartAfter(lastNode); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
}
function getVisibleContents() { 
    return Array.from(document.querySelectorAll('#editor .block-content')).filter(el => el.getBoundingClientRect().height > 0); 
}

const slashMenuEl = document.getElementById('slash-menu');
let slashQuery = null, slashTargetBlock = null;

function handleBlockKeydown(e) {
    if (e.isComposing) return;
    
    if (slashMenuEl && !slashMenuEl.classList.contains('hidden')) {
        if (e.key === 'ArrowUp') { e.preventDefault(); navigateSlashMenu(-1); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); navigateSlashMenu(1); return; }
        if (e.key === 'Enter') { e.preventDefault(); const selected = slashMenuEl.querySelector('.selected'); if(selected) selected.click(); return; }
    }

    const contentEl = e.target; const wrapper = contentEl.closest('.block-wrapper');
    const offset = getCaretOffset(contentEl); const textLen = contentEl.textContent.length;

    if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
            const parentChildren = wrapper.parentElement;
            if (parentChildren.classList.contains('block-children')) {
                parentChildren.closest('.block-wrapper').after(wrapper);
                contentEl.focus(); saveEditorState(true); reinitSortables();
            }
        } else {
            const prev = wrapper.previousElementSibling;
            if (prev && prev.classList.contains('block-wrapper') && prev.dataset.type !== 'page_link' && prev.dataset.type !== 'image') {
                prev.querySelector(':scope > .block-children').appendChild(wrapper);
                if (prev.dataset.type === 'toggle') prev.classList.add('open');
                contentEl.focus(); saveEditorState(true); reinitSortables();
            }
        }
        return;
    }

    if (e.key === 'Enter') {
        if (e.shiftKey) { e.preventDefault(); insertNodeAtCaret(document.createElement('br')); saveEditorState(); return; }
        e.preventDefault();
        
        const isEmpty = contentEl.textContent.trim() === '';

        if (isEmpty && wrapper.dataset.type !== 'p') {
            wrapper.dataset.type = 'p';
            const mainEl = wrapper.querySelector(':scope > .block-main');
            
            mainEl?.querySelector('.todo-checkbox')?.remove();
            mainEl?.querySelector('.toggle-icon')?.remove();
            wrapper.classList.remove('checked', 'open');
            
            saveEditorState(true);
            return;
        }

        if (isEmpty) {
            const parentChildren = wrapper.parentElement;
            if (parentChildren && parentChildren.classList.contains('block-children')) {
                const parentWrapper = parentChildren.closest('.block-wrapper');
                if (parentWrapper) {
                    parentWrapper.after(wrapper);
                    contentEl.focus();
                    saveEditorState(true);
                    reinitSortables();
                    return;
                }
            }
        }

        const range = window.getSelection().getRangeAt(0);
        const preRange = document.createRange(); preRange.selectNodeContents(contentEl); preRange.setEnd(range.startContainer, range.startOffset);
        const postRange = document.createRange(); postRange.selectNodeContents(contentEl); postRange.setStart(range.endContainer, range.endOffset);
        
        const div1 = document.createElement('div'); div1.appendChild(preRange.cloneContents());
        const div2 = document.createElement('div'); div2.appendChild(postRange.cloneContents());
        
        contentEl.innerHTML = div1.innerHTML;
        const tempContainer = document.createElement('div');
        renderBlocks([{ id: generateId(), type: wrapper.dataset.type === 'todo' ? 'todo' : 'p', content: div2.innerHTML, children: [] }], tempContainer);
        const newEl = tempContainer.firstElementChild;
        
        if (wrapper.dataset.type === 'toggle' && wrapper.classList.contains('open')) {
            wrapper.querySelector(':scope > .block-children').prepend(newEl);
        } else { wrapper.after(newEl); }
        newEl.querySelector('.block-content').focus();
        saveEditorState(true); reinitSortables();
    } 
    else if (e.key === 'Backspace' && offset === 0) {
        e.preventDefault();
        
        // 【追加】コマンド付きブロックの場合は、まずプレーンテキスト（段落）に戻す
        if (wrapper.dataset.type !== 'p' && wrapper.dataset.type !== 'page_link' && wrapper.dataset.type !== 'image') {
            wrapper.dataset.type = 'p';
            const mainEl = wrapper.querySelector(':scope > .block-main');
            
            mainEl?.querySelector('.todo-checkbox')?.remove();
            mainEl?.querySelector('.toggle-icon')?.remove();
            wrapper.classList.remove('checked', 'open');
            
            saveEditorState(true);
            return; // 処理を終了し、前行との結合は行わない
        }

        const allContents = getVisibleContents(); const idx = allContents.indexOf(contentEl);
        if (idx > 0) {
            const prevContent = allContents[idx - 1]; const prevWrapper = prevContent.closest('.block-wrapper');
            if (prevWrapper.dataset.type !== 'page_link' && prevWrapper.dataset.type !== 'image') {
                const prevLen = prevContent.textContent.length;
                if (contentEl.innerHTML !== '') prevContent.innerHTML += contentEl.innerHTML; 
                const myChildren = wrapper.querySelector(':scope > .block-children');
                if (myChildren) while(myChildren.firstChild) wrapper.after(myChildren.firstChild);
                wrapper.remove(); prevContent.focus(); setCaretPosition(prevContent, prevLen);
                saveEditorState(true); closeSlashMenu();
            } else {
                if (prevWrapper.dataset.type === 'image') {
                    const imgEl = prevWrapper.querySelector('img');
                    const fileId = prevWrapper.querySelector('.block-content')?.dataset.fileId;
                    deleteImageFromStorage(imgEl?.src, fileId);
                }
                prevWrapper.remove(); 
                saveEditorState(true); 
            }
        }
    }
    else if (e.key === 'Delete' && offset === textLen) {
        e.preventDefault();
        const allContents = getVisibleContents(); const idx = allContents.indexOf(contentEl);
        if (idx < allContents.length - 1) {
            const nextContent = allContents[idx + 1]; const nextWrapper = nextContent.closest('.block-wrapper');
            if (nextWrapper.dataset.type !== 'page_link' && nextWrapper.dataset.type !== 'image') {
                if (nextContent.innerHTML !== '') contentEl.innerHTML += nextContent.innerHTML;
                const nextChildren = nextWrapper.querySelector(':scope > .block-children');
                if (nextChildren) while(nextChildren.firstChild) nextWrapper.after(nextChildren.firstChild);
                nextWrapper.remove(); setCaretPosition(contentEl, offset);
                saveEditorState(true); closeSlashMenu();
            } else {
                if (nextWrapper.dataset.type === 'image') {
                    const imgEl = nextWrapper.querySelector('img');
                    const fileId = nextWrapper.querySelector('.block-content')?.dataset.fileId;
                    deleteImageFromStorage(imgEl?.src, fileId);
                }
                nextWrapper.remove(); 
                saveEditorState(true); 
            }
        }
    }
    else if (e.key === 'ArrowUp') {
        if (offset === 0 || contentEl.textContent === '') {
            const allContents = getVisibleContents(); 
            const idx = allContents.indexOf(contentEl);
            if (idx > 0) {
                e.preventDefault(); 
                const prev = allContents[idx - 1]; 
                prev.focus(); 
                if (prev.contentEditable === "true") setCaretPosition(prev, prev.textContent.length);
            } else if (idx === 0) {
                e.preventDefault();
                pageTitleEl.focus();
            }
        }
    }
    else if (e.key === 'ArrowDown') {
        if (offset === textLen || contentEl.textContent === '') {
            const allContents = getVisibleContents(); 
            const idx = allContents.indexOf(contentEl);
            if (idx < allContents.length - 1) {
                e.preventDefault(); 
                const next = allContents[idx + 1]; 
                next.focus(); 
                if (next.contentEditable === "true") setCaretPosition(next, 0);
            }
        }
    }
}

function handleBlockPaste(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    const items = clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            const wrapper = e.target.closest('.block-wrapper');
            if (file && wrapper) {
                uploadAndInsertImage(file, wrapper);
            }
            return;
        }
    }

    e.preventDefault();
    const pastedText = clipboardData.getData('text/plain');
    const sel = window.getSelection();
    const isUrl = /^https?:\/\//i.test(pastedText.trim());

    if (!sel.isCollapsed && isUrl) {
        const a = document.createElement('a');
        a.href = pastedText.trim(); a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = sel.toString();
        insertNodeAtCaret(a);
    } else {
        document.execCommand('insertText', false, pastedText);
    }
    saveEditorState(true);
}

document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && a.href) window.open(a.href, '_blank', 'noopener,noreferrer');
});

// ================= スラッシュコマンド =================
function handleBlockInput(e) {
    const text = e.target.textContent; const wrapper = e.target.closest('.block-wrapper');
    const mdMatch = text.match(/^(#{1,3}|\[\]|>)( |\u00A0)$/);
    if (mdMatch && wrapper.dataset.type === 'p') {
        let matchedType = null;
        if (mdMatch[1] === '#') matchedType = 'h1'; else if (mdMatch[1] === '##') matchedType = 'h2'; else if (mdMatch[1] === '###') matchedType = 'h3';
        else if (mdMatch[1] === '[]') matchedType = 'todo'; else if (mdMatch[1] === '>') matchedType = 'toggle';
        
        if (matchedType) {
            const temp = document.createElement('div');
            const extracted = { id: wrapper.dataset.id, type: matchedType, content: '', children: [] };
            if (matchedType === 'toggle') { extracted.toggleOpen = true; extracted.children = [{id: generateId(), type: 'p', content: '', children: []}]; }
            renderBlocks([extracted], temp);
            const newEl = temp.firstElementChild;
            wrapper.replaceWith(newEl); newEl.querySelector(':scope > .block-main > .block-content').focus();
            saveEditorState(true); reinitSortables(); closeSlashMenu(); return;
        }
    }

    const match = text.match(/(^|\s)\/([^\/]*)$/);
    if (match) { slashQuery = match[2].toLowerCase(); slashTargetBlock = wrapper; showSlashMenu(e.target); }
    else { closeSlashMenu(); }
    saveEditorState(); 
}

function showSlashMenu(el) {
    if(!slashMenuEl) return;
    slashMenuEl.innerHTML = '';
    const filtered = COMMANDS.filter(cmd => !slashQuery || cmd.keys.some(k => k.toLowerCase().includes(slashQuery)));
    if (filtered.length === 0) { closeSlashMenu(); return; }
    
    filtered.forEach((cmd, i) => {
        const div = document.createElement('div'); div.className = `slash-item ${i===0?'selected':''}`;
        div.innerHTML = `<div style="font-weight:500;">${cmd.label}</div><div style="font-size:12px;color:gray;">${cmd.desc}</div>`;
        div.onclick = () => executeCommand(cmd.id); slashMenuEl.appendChild(div);
    });
    const rect = el.getBoundingClientRect(); 
    slashMenuEl.style.top = `${rect.bottom + window.scrollY}px`; slashMenuEl.style.left = `${rect.left + window.scrollX}px`; 
    slashMenuEl.classList.remove('hidden');
}

function navigateSlashMenu(dir) {
    if(!slashMenuEl) return; const items = Array.from(slashMenuEl.children); if(items.length === 0) return;
    let idx = items.findIndex(i => i.classList.contains('selected'));
    if(idx !== -1) items[idx].classList.remove('selected');
    idx = (idx + dir + items.length) % items.length;
    items[idx].classList.add('selected');
}
function closeSlashMenu() { slashMenuEl?.classList.add('hidden'); slashQuery = null; slashTargetBlock = null; }

let savedCaretRange = null, pendingExtLinkBlock = null;

function executeCommand(cmdId) {
    if (!slashTargetBlock) return;
    const targetBlock = slashTargetBlock; const contentEl = targetBlock.querySelector('.block-content');
    contentEl.textContent = contentEl.textContent.substring(0, contentEl.textContent.lastIndexOf('/'));
    contentEl.focus(); setCaretPosition(contentEl, contentEl.textContent.length);
    savedCaretRange = window.getSelection().getRangeAt(0).cloneRange();
    closeSlashMenu();

    if (cmdId === 'image') {
        pendingImageTargetBlock = targetBlock;
        document.getElementById('image-upload-input').click();
    } else if (cmdId === 'link') {
        pendingExtLinkBlock = targetBlock; 
        document.getElementById('ext-link-title').value = ''; document.getElementById('ext-link-url').value = '';
        document.getElementById('ext-link-overlay').classList.remove('hidden');
        setTimeout(() => document.getElementById('ext-link-url').focus(), 10);
    } else if (cmdId === 'linkpage') {
        const linkSelect = document.getElementById('link-select');
        linkSelect.innerHTML = '';
        Object.values(state.pages).forEach(p => {
            if(p.id !== state.currentPageId) { 
                const opt = document.createElement('option');
                opt.value = p.id; opt.textContent = p.title || '無題'; linkSelect.appendChild(opt);
            }
        });
        document.getElementById('link-overlay').classList.remove('hidden');
        pendingExtLinkBlock = targetBlock;
    } else if (cmdId === 'page') {
        const childId = generateId();
        const childPage = { 
            id: childId, 
            title: '', 
            parentId: state.currentPageId, 
            blocks: [{ id: generateId(), type: 'p', content: '', children:[] }], 
            isLocked: false 
        };
        state.pages[childId] = childPage;

        (async () => {
            await createPageInAppwrite(childPage);
            const temp = document.createElement('div'); 
            renderBlocks([{id: targetBlock.dataset.id, type: 'page_link', content: childId, children:[]}], temp);
            targetBlock.replaceWith(temp.firstElementChild);
            saveEditorState(true); 
            renderTree(); 
            openPage(childId); 
            setTimeout(() => pageTitleEl.focus(), 10);
        })();
    } else {
        const temp = document.createElement('div'); 
        const extracted = { id: targetBlock.dataset.id, type: cmdId, content: contentEl.innerHTML, children:[] };
        if (cmdId === 'toggle') { extracted.toggleOpen = true; extracted.children = [{id: generateId(), type: 'p', content: '', children: []}]; }
        renderBlocks([extracted], temp);
        const newEl = temp.firstElementChild;
        targetBlock.replaceWith(newEl); newEl.querySelector(':scope > .block-main > .block-content').focus();
        saveEditorState(true); reinitSortables();
    }
}

// ================= ブロックオプションメニュー =================
let blockMenuTarget = null;
const blockMenuEl = document.getElementById('block-menu');

function showBlockMenu(e, handleEl) {
    e.stopPropagation();
    e.preventDefault();
    blockMenuTarget = handleEl.closest('.block-wrapper');
    if (!blockMenuTarget || !blockMenuEl) return;

    const rect = handleEl.getBoundingClientRect();
    blockMenuEl.style.top = `${rect.bottom + window.scrollY}px`;
    blockMenuEl.style.left = `${rect.left + window.scrollX}px`;
    blockMenuEl.classList.remove('hidden');
}

function executeBlockMenu(action) {
    if (!blockMenuTarget) return;
    const contentEl = blockMenuTarget.querySelector('.block-content');
    
    if (action === 'delete') {
        if (blockMenuTarget.dataset.type === 'image') {
            const imgEl = blockMenuTarget.querySelector('img');
            const fileId = contentEl?.dataset.fileId;
            deleteImageFromStorage(imgEl?.src, fileId);
        }
        blockMenuTarget.remove();
        saveEditorState(true);
    } else if (action === 'copy') {
        // テキストコピー（構造化コピペはステップ2で実装します）
        const textToCopy = contentEl ? contentEl.innerText : '';
        navigator.clipboard.writeText(textToCopy).then(() => {
            // 特にアラートは出さず、コピー成功とする
        });
    } else if (action === 'duplicate') {
        const cloned = blockMenuTarget.cloneNode(true);
        cloned.dataset.id = generateId();
        blockMenuTarget.after(cloned);
        saveEditorState(true);
        reinitSortables();
    } else {
        // 変換処理 (p, h1, h2, todo, toggle)
        const temp = document.createElement('div');
        const extracted = { id: blockMenuTarget.dataset.id, type: action, content: contentEl ? contentEl.innerHTML : '', children: [] };
        
        if (action === 'toggle') {
            extracted.toggleOpen = true; 
            extracted.children = [{id: generateId(), type: 'p', content: '', children: []}];
        }
        // 子供を引き継ぐ
        const currentChildren = extractBlocks(blockMenuTarget.querySelector(':scope > .block-children'));
        if (currentChildren.length > 0) extracted.children = currentChildren;

        renderBlocks([extracted], temp);
        const newEl = temp.firstElementChild;
        blockMenuTarget.replaceWith(newEl);
        
        const newContent = newEl.querySelector(':scope > .block-main > .block-content');
        if (newContent) newContent.focus();
        
        saveEditorState(true);
        reinitSortables();
    }
    
    blockMenuEl.classList.add('hidden');
    blockMenuTarget = null;
}

// 他の領域をクリックしたらブロックメニューを閉じる
document.addEventListener('click', (e) => {
    if (blockMenuEl && !blockMenuEl.classList.contains('hidden')) {
        if (!e.target.closest('#block-menu')) {
            blockMenuEl.classList.add('hidden');
        }
    }
});

document.getElementById('ext-link-cancel')?.addEventListener('click', () => {
    document.getElementById('ext-link-overlay').classList.add('hidden');
    if(pendingExtLinkBlock && savedCaretRange) {
        pendingExtLinkBlock.querySelector('.block-content')?.focus();
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedCaretRange);
    }
});
document.getElementById('ext-link-submit')?.addEventListener('click', () => {
    let title = document.getElementById('ext-link-title').value || 'Link';
    let url = document.getElementById('ext-link-url').value;
    if(!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    document.getElementById('ext-link-overlay').classList.add('hidden');
    if (pendingExtLinkBlock && savedCaretRange) {
        pendingExtLinkBlock.querySelector('.block-content')?.focus();
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedCaretRange);
        const aTag = document.createElement('a');
        aTag.href = url; aTag.target = "_blank"; aTag.rel = "noopener noreferrer"; aTag.textContent = title;
        insertNodeAtCaret(aTag); insertNodeAtCaret(document.createTextNode('\u00A0'));
        saveEditorState(true); pendingExtLinkBlock = null; 
    }
});
document.getElementById('link-cancel')?.addEventListener('click', () => {
    document.getElementById('link-overlay').classList.add('hidden');
    pendingExtLinkBlock?.querySelector('.block-content')?.focus();
});
document.getElementById('link-submit')?.addEventListener('click', () => {
    const selectedId = document.getElementById('link-select')?.value;
    if(selectedId && pendingExtLinkBlock) {
        const temp = document.createElement('div'); 
        renderBlocks([{id: pendingExtLinkBlock.dataset.id, type: 'page_link', content: selectedId, children:[]}], temp);
        pendingExtLinkBlock.replaceWith(temp.firstElementChild);
        saveEditorState(true); renderTree(); reinitSortables();
    }
    document.getElementById('link-overlay').classList.add('hidden');
});

// ================= 画像アップロード =================
document.getElementById('image-upload-input').addEventListener('change', async function(e) {
    const file = e.target.files[0]; 
    const target = pendingImageTargetBlock || slashTargetBlock;
    if(!file || !target) return;
    
    await uploadAndInsertImage(file, target);
    this.value = '';
    pendingImageTargetBlock = null;
});

async function uploadAndInsertImage(file, targetBlock) {
    // 【要件3】添付ファイルの上限チェック (500MB)
    if (currentMediaBytes + file.size > MAX_MEDIA_BYTES) {
        alert("添付ファイルの上限 (500MB) を超過します。不要な画像を削除してください。");
        return;
    }

    const qualityMode = localStorage.getItem('motion_image_quality') || 'original';
    let fileToUpload = file;

    if (qualityMode === 'compressed') {
        fileToUpload = await compressImage(file, 1200, 0.7);
    }

    try {
        const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
        const uploadFile = new File([fileToUpload], safeName, { type: fileToUpload.type || 'image/jpeg' });

        const fileUploadRes = await storage.createFile(
            BUCKET_ID,
            ID.unique(),
            uploadFile,
            [
                Permission.read(Role.any()),
                Permission.update(Role.user(currentUser.$id)),
                Permission.delete(Role.user(currentUser.$id))
            ]
        );

        const fileUrl = storage.getFileView(BUCKET_ID, fileUploadRes.$id);

        const temp = document.createElement('div');
        renderBlocks([{ 
            id: targetBlock.dataset.id, 
            type: 'image', 
            content: fileUrl, 
            fileId: fileUploadRes.$id, 
            children:[] 
        }], temp);
        
        targetBlock.replaceWith(temp.firstElementChild);
        saveEditorState(true); 
        reinitSortables();
        calcStorageUsage(); // 容量計算を更新
    } catch (err) {
        alert("画像のアップロードに失敗しました: " + err.message);
        console.error(err);
    }
}

function compressImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name || 'image.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', quality);
            };
        };
    });
}

// ================= リッチテキスト Floating Menu =================
const floatMenu = document.getElementById('floating-menu');
document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (editorEl.contains(range.commonAncestorContainer)) {
            const rect = range.getBoundingClientRect();
            floatMenu.style.top = `${rect.top + window.scrollY - 40}px`;
            floatMenu.style.left = `${rect.left + window.scrollX + (rect.width/2) - (floatMenu.offsetWidth/2)}px`;
            floatMenu.classList.remove('hidden'); return;
        }
    }
    floatMenu.classList.add('hidden');
});

floatMenu.addEventListener('mousedown', (e) => {
    e.preventDefault(); 
    const btn = e.target.closest('button[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd, val = btn.dataset.val || null;
    document.execCommand(cmd, false, val);
    saveEditorState(); floatMenu.classList.add('hidden');
});

// ================= 全文検索・設定等のその他のUI =================
document.getElementById('search-btn').addEventListener('click', openSearchModal);
function openSearchModal() {
    const searchOverlay = document.getElementById('search-overlay'), searchInput = document.getElementById('search-input'), resultsEl = document.getElementById('search-results');
    searchOverlay.classList.remove('hidden'); searchInput.value = ''; resultsEl.innerHTML = ''; searchInput.focus();
    
    searchInput.oninput = (e) => {
        const q = e.target.value.toLowerCase(); resultsEl.innerHTML = '';
        if(!q) return;
        
        const includeLocked = localStorage.getItem('motion_search_locked') === 'true';
        
        Object.values(state.pages).forEach(p => {
            // ロックされたページを除外する判定
            if (!includeLocked && isPageLocked(p.id)) return;
            
            let match = false; let snippet = ''; // ←宣言はここ1回だけでOKです
            
            if ((p.title||'無題').toLowerCase().includes(q)) match = true;
            else {
                const searchBlocks = (blocks) => {
                    for(let b of blocks) {
                        if(b.content && typeof b.content==='string' && b.type!=='image' && b.type!=='page_link') {
                            const text = b.content.replace(/<[^>]+>/g, '').toLowerCase();
                            if(text.includes(q)) { match = true; snippet = text.substring(Math.max(0, text.indexOf(q)-15), text.indexOf(q)+20) + '...'; return; }
                        }
                        if(b.children) searchBlocks(b.children);
                    }
                };
                if(Array.isArray(p.blocks)) searchBlocks(p.blocks);
            }
            if(match) {
                const div = document.createElement('div'); div.className = 'search-item';
                div.innerHTML = `<strong>${p.title||'無題'}</strong><br><span style="font-size:12px;color:var(--text-muted);">${snippet}</span>`;
                div.onclick = () => { searchOverlay.classList.add('hidden'); openPage(p.id); };
                resultsEl.appendChild(div);
            }
        });
    };
}
document.getElementById('settings-btn').addEventListener('click', () => document.getElementById('settings-overlay').classList.remove('hidden'));
document.getElementById('settings-close').addEventListener('click', () => document.getElementById('settings-overlay').classList.add('hidden'));

document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active'); document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
    };
});

document.getElementById('btn-export')?.addEventListener('click', () => {
    const exportData = clone(state);
    Object.values(exportData.pages).forEach(p => {
        delete p.isUnlockedSession;
        delete p.$id;
    });
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData));
    const dlAnchor = document.createElement('a'); 
    dlAnchor.setAttribute("href", dataStr); 
    dlAnchor.setAttribute("download", "motion_workspace.json"); 
    dlAnchor.click();
});
document.getElementById('btn-import')?.addEventListener('click', () => document.getElementById('file-import')?.click());
document.getElementById('file-import')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    
    reader.onload = async (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if(imported && imported.pages) {
                alert("クラウドへのインポートを開始します。完了するまでブラウザを閉じないでください...");
                for (const key of Object.keys(imported.pages)) {
                    const page = imported.pages[key];
                    const existing = state.pages[page.id];
                    if (existing && existing.$id) {
                        page.$id = existing.$id; 
                        await saveDataToAppwrite(page);
                    } else {
                        await createPageInAppwrite(page);
                    }
                }
                const uiState = {
                    expandedNodes: imported.expandedNodes || [],
                    recentPages: imported.recentPages || []
                };
                localStorage.setItem('motion_ui_state', JSON.stringify(uiState));
                alert("復元が完了しました。ページを再読み込みします。");
                location.reload();
            }
        } catch (err) {
            alert("インポートに失敗しました: " + err.message);
            console.error(err);
        }
    };
    reader.readAsText(file);
});

document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if(confirm("【警告】全データを消去します。\nこの操作はクラウド(Appwrite)上のあなたのデータも完全に削除します。よろしいですか？")) {
        try {
            if (currentUser) {
                const response = await databases.listDocuments(DB_ID, COLLECTION_PAGES);
                for (const doc of response.documents) {
                    await databases.deleteDocument(DB_ID, COLLECTION_PAGES, doc.$id);
                }
            }
            localStorage.clear(); 
            location.reload();
        } catch (err) {
            alert("リセット失敗: " + err.message);
        }
    }
});

document.getElementById('editor-bottom-padding')?.addEventListener('click', () => {
    if (state.currentPageId === 'home') return;
    const all = getVisibleContents();
    if(all.length > 0) {
        const last = all[all.length-1];
        if(last.textContent !== '') {
            const temp = document.createElement('div'); renderBlocks([{id: generateId(), type:'p', content:'', children:[]}], temp);
            editorEl.appendChild(temp.firstElementChild); getVisibleContents().pop().focus(); saveEditorState(true); reinitSortables();
        } else last.focus();
    }
});

document.getElementById('modal-pass')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('modal-submit')?.click(); }
});
document.getElementById('ext-link-url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ext-link-submit')?.click(); }
});
document.getElementById('ext-link-title')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ext-link-submit')?.click(); }
});
document.getElementById('link-select')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('link-submit')?.click(); }
});
document.getElementById('search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const firstResult = document.querySelector('#search-results .search-item');
        if (firstResult) firstResult.click();
    }
});

// ================= 新規アカウント承認・管理関連 =================


// ★ 1. 管理者へアカウント開設リクエストのメールを送る処理 (EmailJS実装)
async function sendAdminRequestEmail(userEmail) {
    try {
        // EmailJS の SDK が読み込まれている前提のコードです
        // ※あらかじめ EmailJS のサービスID、テンプレートID、公開鍵を設定してください
        const serviceID = 'service_iwdudmi';     // ご自身のEmailJSサービスIDに変更
        const templateID = 'template_oba4fva';   // ご自身のEmailJSテンプレートIDに変更
        const publicKey = 'Rr8sXv8O4BghLKFMX';     // ご自身のEmailJS公開鍵（Public Key）に変更

        const templateParams = {
            admin_email: 'thonglo02cocoa@gmail.com',
            request_user_email: userEmail,
            message: `新規ユーザー (${userEmail}) からアカウント開設のリクエストがありました。管理画面から承認を行ってください。`
        };

        // EmailJSを使ってメール送信
        await emailjs.send(serviceID, templateID, templateParams, publicKey);
        console.log('管理者へのメール通知が送信されました。');
    } catch (err) {
        console.error('管理者へのメール送信に失敗しました:', err);
        // メールの送信に失敗しても、アカウント登録自体はロールバックさせない or 必要に応じてアラートを出す
    }
}

// ★ 2. サイト上の管理者ページ等に組み込む「承認処理」の関数
// この関数を管理者用のUI（ボタン等）から呼び出すことでアカウントを承認します。
async function approveAccount(targetUserId) {
    try {
        await databases.updateDocument(DB_ID, 'users', targetUserId, { status: 'approved' });
        alert('アカウントを承認しました。ユーザーはログイン可能になります。');
    } catch (err) {
        alert('承認エラー: ' + err.message);
    }
}

// ================= 管理者専用機能 =================

// 1. ログイン時に承認待ちユーザーを確認し、ポップアップで知らせる関数（案3）
async function checkPendingUsersForAdmin() {
    try {
        const response = await databases.listDocuments(DB_ID, 'users', [
            Query.equal('status', 'pending')
        ]);

        if (response.documents.length > 0) {
            const count = response.documents.length;
            const emails = response.documents.map(doc => doc.email).join(', ');
            
            // ポップアップ通知
            setTimeout(() => {
                if (confirm(`【管理者通知】\n現在、${count}件の新規アカウント承認待ちがあります。\n対象: ${emails}\n\n今すぐ設定画面から承認しますか？`)) {
                    // 設定画面を開いて管理者タブをアクティブにする
                    document.getElementById('settings-overlay').classList.remove('hidden');
                    document.querySelector('.settings-tab[data-tab="admin"]')?.click();
                }
            }, 500);
        }
    } catch (err) {
        console.error('承認待ちユーザーの確認に失敗しました:', err);
    }
}

// 2. 設定タブが開かれたときに承認待ちリストを描画する処理
document.querySelector('.settings-tab[data-tab="admin"]')?.addEventListener('click', async () => {
    const listContainer = document.getElementById('admin-pending-users-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">読み込み中...</p>';

    try {
        const response = await databases.listDocuments(DB_ID, 'users', [
            Query.equal('status', 'pending')
        ]);

        if (response.documents.length === 0) {
            listContainer.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">現在、承認待ちのユーザーはいません。</p>';
            return;
        }

        listContainer.innerHTML = '';
        response.documents.forEach(doc => {
            const item = document.createElement('div');
            item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 12px; margin-bottom:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-hover);';
            
            item.innerHTML = `
                <div>
                    <div style="font-weight:500; font-size:14px;">${doc.email}</div>
                    <div style="font-size:11px; color:var(--text-muted);">申請日時: ${new Date(doc.$createdAt).toLocaleString()}</div>
                </div>
                <button class="primary-btn" style="padding:4px 12px; font-size:12px; width:auto;" data-id="${doc.$id}">承認する</button>
            `;

            // 承認ボタンのクリックイベント
            item.querySelector('button').onclick = async () => {
                const btn = item.querySelector('button');
                btn.disabled = true;
                btn.textContent = '処理中...';
                
                try {
                    await databases.updateDocument(DB_ID, 'users', doc.$id, {
                        status: 'approved'
                    });
                    alert(`${doc.email} のアカウントを承認しました！`);
                    // リストを再読み込み
                    document.querySelector('.settings-tab[data-tab="admin"]').click();
                } catch (e) {
                    alert('承認エラー: ' + e.message);
                    btn.disabled = false;
                    btn.textContent = '承認する';
                }
            };

            listContainer.appendChild(item);
        });
    } catch (err) {
        listContainer.innerHTML = '<p style="font-size:13px; color:var(--danger);">リストの取得に失敗しました。</p>';
    }
});

// ================= パスワード表示トグルの共通設定 =================
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-password-btn');
    if (!btn) return;

    const targetId = btn.getAttribute('data-target');
    const inputEl = document.getElementById(targetId);
    const iconUseEl = btn.querySelector('use');
    if (!inputEl) return;

    // パスワードロック画面（CSSハック使用時）の場合
    if (inputEl.style.webkitTextSecurity !== undefined && inputEl.style.webkitTextSecurity !== '') {
        if (inputEl.style.webkitTextSecurity === 'disc') {
            inputEl.style.webkitTextSecurity = 'none'; // 文字を表示
            iconUseEl.setAttribute('href', '#icon-eye-off');
            btn.title = 'パスワードを隠す';
        } else {
            inputEl.style.webkitTextSecurity = 'disc'; // 黒丸に戻す
            iconUseEl.setAttribute('href', '#icon-eye');
            btn.title = 'パスワードを表示';
        }
    } 
    // 通常のパスワード入力欄（ログイン画面など）の場合
    else {
        if (inputEl.type === 'password') {
            inputEl.type = 'text';
            iconUseEl.setAttribute('href', '#icon-eye-off');
            btn.title = 'パスワードを隠す';
        } else {
            inputEl.type = 'password';
            iconUseEl.setAttribute('href', '#icon-eye');
            btn.title = 'パスワードを表示';
        }
    }
});
