:root { 
    --bg-main: #ffffff; --bg-sidebar: #f7f7f5; --bg-hover: #efefed; 
    --text-main: #37352f; --text-muted: #9a9a97; --border: #e9e9e7; 
    --accent: #2383e2; 
    --font-family: 'Noto Sans JP', system-ui, -apple-system, sans-serif; 
}
body.dark-mode { 
    --bg-main: #22272e; --bg-sidebar: #1c2128; --bg-hover: #2d333b; 
    --text-main: #adbac7; --text-muted: #768390; --border: #444c56; 
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-family); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; background: var(--bg-main); transition: background 0.2s, color 0.2s; }
.hidden { display: none !important; }
.icon { width: 16px; height: 16px; fill: currentColor; display: inline-block; vertical-align: middle; }
::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* ================= アニメーション定義 ================= */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

#overlay:not(.hidden), #search-overlay:not(.hidden), #link-overlay:not(.hidden), #ext-link-overlay:not(.hidden), #settings-overlay:not(.hidden) { animation: fadeIn 0.15s ease-out; }
.modal, .settings-modal, .search-modal { animation: popIn 0.2s ease-out; }
#slash-menu:not(.hidden), #context-menu:not(.hidden), #floating-menu:not(.hidden) { animation: popIn 0.1s ease-out; }


/* ================= サイドバー周辺 ================= */
#sidebar { width: 260px; background: var(--bg-sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index:100; }
.sidebar-header { padding: 16px; font-weight: 600; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
#search-btn { background:none; border:none; color:var(--text-muted); cursor:pointer; }
.sidebar-home { padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 500; transition: 0.2s; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.sidebar-home:hover, .sidebar-home.active { background: var(--bg-hover); color: var(--text-main); }
.tree-container { flex: 1; overflow-y: auto; padding: 8px 0; }
.tree-item { display: flex; align-items: center; padding: 4px 16px; cursor: pointer; user-select: none; }
.tree-item:hover, .tree-item.active { background: var(--bg-hover); }
.tree-toggle { width: 20px; font-size:10px; color: var(--text-muted); }
.tree-title { flex: 1; margin-left: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sidebar-footer { padding: 12px; display: flex; gap: 8px; border-top: 1px solid var(--border); }
#add-page-btn, #settings-btn { padding: 8px; border: 1px dashed var(--border); background: transparent; cursor: pointer; color: var(--text-muted); border-radius: 6px; transition: 0.2s; flex:1;}
#settings-btn { flex:0; border-style:solid; }


/* ================= メイン・エディタ周辺 ================= */
#main { flex: 1; overflow-y: scroll; display: flex; flex-direction: column; align-items: center; position: relative; }

/* ホーム画面 */
.home-wrapper { width: 100%; max-width: 800px; padding: 60px 40px 0; flex: 1; }
.home-title { font-size: 32px; font-weight: 700; margin-bottom: 32px; }
.home-section h2 { font-size: 16px; color: var(--text-muted); margin-bottom: 16px; font-weight: 600; }
.recent-pages-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.recent-page-card { border: 1px solid var(--border); border-radius: 8px; padding: 16px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 500; transition: 0.2s; background: transparent; }
.recent-page-card:hover { background: var(--bg-hover); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.recent-page-card span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }

.editor-wrapper { width: 100%; max-width: 800px; padding: 60px 40px 0; display: flex; flex-direction: column; flex: 1; }
.breadcrumb { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; display: flex; gap: 6px; }
.breadcrumb-item { cursor: pointer; } .breadcrumb-item:hover { color: var(--text-main); text-decoration: underline; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; }
#page-title { font-size: 40px; font-weight: 700; border: none; outline: none; width: 100%; color: var(--text-main); background: transparent; }
.lock-btn { background: transparent; border: 1px solid var(--border); padding: 6px 12px; border-radius: 4px; cursor: pointer; color: var(--text-muted); display: flex; gap: 4px; align-items: center; white-space: nowrap; transition: 0.2s; }
.lock-btn:hover { background: var(--bg-hover); }
.lock-btn.locked { color: var(--accent); border-color: var(--accent); background: rgba(35, 131, 226, 0.1); }

/* ブロック構造 */
.block-wrapper { display: flex; flex-direction: column; padding: 2px 0; }
.block-main { display: flex; align-items: flex-start; position: relative; }
.block-children { margin-left: 12px; padding-left: 12px; border-left: 1px solid var(--border); }
.drag-handle { width: 24px; color: var(--text-muted); cursor: grab; opacity: 0; transition: 0.2s; }
.block-main:hover .drag-handle { opacity: 1; }
.block-content { flex: 1; outline: none; min-height: 24px; padding: 4px 2px; line-height: 1.6; font-size: 16px; white-space: pre-wrap; word-break: break-word;}
.block-content:focus[data-placeholder]:empty::before { content: attr(data-placeholder); color: var(--border); position: absolute; pointer-events: none;}
.block-content img { max-width: 100%; border-radius: 4px; display: block; margin: 8px 0; }
.block-content a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; transition: 0.2s; }
.block-content a:hover { opacity: 0.8; }

/* ブロックデザイン */
.block-wrapper[data-type="h1"] > .block-main > .block-content { font-size: 30px; font-weight: 700; margin-top: 12px; }
.block-wrapper[data-type="h2"] > .block-main > .block-content { font-size: 24px; font-weight: 600; margin-top: 8px; }
.block-wrapper[data-type="h3"] > .block-main > .block-content { font-size: 20px; font-weight: 600; margin-top: 4px; }
.todo-checkbox { width: 16px; height: 16px; border: 2px solid var(--text-muted); border-radius: 3px; margin-right: 8px; margin-top: 9px; cursor: pointer; }
.block-wrapper[data-type="todo"].checked > .block-main > .todo-checkbox { background: var(--accent); border-color: var(--accent); }
.block-wrapper[data-type="todo"].checked > .block-main > .block-content { text-decoration: line-through; color: var(--text-muted); }
.toggle-icon { width: 20px; cursor: pointer; margin-right: 4px; margin-top: 5px; transition: 0.2s; display: flex; justify-content: center; }
.block-wrapper[data-type="toggle"].open > .block-main > .toggle-icon { transform: rotate(90deg); }
.block-wrapper[data-type="toggle"]:not(.open) > .block-children { display: none; }
.block-wrapper[data-type="toggle"].open > .block-children { display: block; animation: slideDown 0.15s ease-out; }


/* ================= フローティングメニューとカラーパレット ================= */
#floating-menu { 
    position: absolute; background: #222; padding: 4px 8px; border-radius: 6px; 
    display: flex; gap: 4px; z-index: 3000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); 
    align-items: center;
}
#floating-menu button { 
    background: none; border: none; color: white; width: 28px; height: 28px; 
    cursor: pointer; font-size: 14px; border-radius: 4px; font-weight: bold; 
    display: flex; align-items: center; justify-content: center; transition: 0.1s;
}
#floating-menu button:hover { background: #444; }

.color-picker-wrapper { position: relative; display: inline-block; }
.color-picker-wrapper button small { font-size: 8px; margin-left: 2px; color: #aaa; }
.color-palette { 
    display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); 
    background: #222; padding: 6px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    width: 120px; flex-wrap: wrap; gap: 4px; z-index: 3100;
}
.color-palette::after { content: ''; position: absolute; top: 100%; left: 0; width: 100%; height: 12px; }
.color-picker-wrapper:hover .color-palette { display: flex; animation: fadeIn 0.1s ease-out; }
.color-palette button { width: 24px !important; height: 24px !important; border-radius: 50% !important; font-size: 16px !important; margin: 2px; border: 1px solid #444 !important; }

/* ================= モーダル群共通 ================= */
#overlay, #search-overlay, #link-overlay, #ext-link-overlay, #settings-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal { background: var(--bg-main); padding: 24px; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.2); border: 1px solid var(--border); width: 320px; text-align: center; }
.modal input, .modal select { width: 100%; padding: 8px; margin: 12px 0; border: 1px solid var(--border); border-radius: 4px; outline: none; background: transparent; color: var(--text-main); font-family: inherit; }
.primary-btn { width: 100%; padding: 8px; border: none; border-radius: 4px; cursor: pointer; margin-top: 8px; font-weight: 500; background: var(--text-main); color: var(--bg-main); transition: 0.2s; }
.primary-btn:hover { opacity: 0.9; }
.cancel-btn { width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; margin-top: 8px; background: transparent; color: var(--text-muted); transition: 0.2s; }
.cancel-btn:hover { background: var(--bg-hover); color: var(--text-main); }

/* 検索モーダル */
.search-modal { width: 500px !important; }
.search-results { max-height: 300px; overflow-y: auto; margin-top: 12px; text-align: left; }
.search-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border); transition: 0.2s; }
.search-item:hover { background: var(--bg-hover); }

/* スラッシュメニュー */
#slash-menu { position: absolute; background: var(--bg-main); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 200px; z-index: 1000; padding: 6px 0; }
.slash-item { padding: 6px 12px; cursor: pointer; text-align:left; }
.slash-item.selected, .slash-item:hover { background: var(--bg-hover); }

/* コンテキストメニュー */
#context-menu { position: absolute; background: var(--bg-main); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 160px; z-index: 3000; padding: 4px 0; font-size: 14px; }
.menu-item { padding: 8px 16px; cursor: pointer; transition: 0.1s; }
.menu-item:hover { background: var(--bg-hover); }
.menu-item.delete { color: #d93025; }

/* 設定画面等 */
.settings-modal { background: var(--bg-main); width: 600px; height: 400px; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.2); border: 1px solid var(--border); display: flex; position: relative; overflow: hidden; }
.settings-sidebar { width: 200px; background: var(--bg-sidebar); border-right: 1px solid var(--border); padding: 24px 0; flex-shrink: 0; }
.settings-tab { padding: 12px 24px; cursor: pointer; color: var(--text-muted); font-size: 14px; font-weight: 500; transition: 0.2s; }
.settings-tab.active, .settings-tab:hover { background: var(--bg-hover); color: var(--text-main); }
.settings-content { flex: 1; padding: 32px; overflow-y: auto; text-align:left; }

.close-icon-btn { position: absolute; top: 12px; right: 12px; background: var(--bg-hover); border: none; font-size: 20px; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); cursor: pointer; line-height: 1; z-index: 100; transition: 0.2s; }
.close-icon-btn:hover { background: #d93025; color: white; }

.danger-btn { background: #d93025; color: white; border:none; padding:8px; border-radius:4px; width:100%; cursor:pointer; font-family: inherit; transition: 0.2s; }
.danger-btn:hover { background: #b3261e; }
.mobile-topbar { display: none; }

@media (max-width: 768px) { 
    #sidebar { display: none; } 
    .mobile-topbar { display: flex; } 
    .settings-modal { flex-direction: column; width: 90%; height: 80vh; }
    .settings-sidebar { width: 100%; height: auto; border-right: none; border-bottom: 1px solid var(--border); display: flex; padding: 0; overflow-x: auto; }
    .settings-tab { white-space: nowrap; }
}

/* タイトル行のプレースホルダー表示 */
.page-title-input:empty:before {
    content: attr(data-placeholder);
    color: var(--text-muted, #9a9a97);
    pointer-events: none;
}
