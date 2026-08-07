}

await loadDataFromAppwrite();

        // ロック中のページおよびその配下ページを展開リストからクリーンアップ（デフォルトクローズ）
        state.expandedNodes = state.expandedNodes.filter(id => {
            const lockedBy = isPageLocked(id);
            return !lockedBy || lockedBy.isUnlockedSession;
        });

renderTree();
openPage('home');
calcStorageUsage();
} catch (err) {
showAuthModal();
}
}

document.getElementById('setting-image-quality')?.addEventListener('change', (e) => {
localStorage.setItem('motion_image_quality', e.target.value);
});
@@ -396,7 +402,11 @@ function renderTree() {
item.className = `tree-item ${state.currentPageId === id ? 'active' : ''}`;
item.style.paddingLeft = `${16 + level * 16}px`;

            const isExpanded = state.expandedNodes.includes(id);
            // パスワード保護されているか判定（未解除の場合は展開を許可しない）
            const lockedBy = isPageLocked(id);
            const isUnlocked = !lockedBy || lockedBy.isUnlockedSession;
            const isExpanded = isUnlocked && state.expandedNodes.includes(id);
            
const toggle = document.createElement('div'); toggle.className = 'tree-toggle';
toggle.innerHTML = children.length > 0 ? (isExpanded ? '▼' : '▶') : '•';
