// Chrome と Firefox の両方で動作するように、APIオブジェクトを切り替えます
const extAPI = typeof browser !== "undefined" ? browser : chrome;

const playingTabs = new Set();
let currentIndex = 0; // 巡回ジャンプ用のインデックス

// バッジの背景色を赤に設定（視認性向上）
extAPI.action.setBadgeBackgroundColor({ color: "#ff0000" });

// バッジ表示を更新する共通処理
function updateBadge() {
    extAPI.action.setBadgeText({
        text: playingTabs.size > 0 ? String(playingTabs.size) : ""
    });
}

// 1. content.js（YouTubeページ）から再生状態を受信
extAPI.runtime.onMessage.addListener((msg, sender) => {
    if (!sender.tab) return;
    const tabId = sender.tab.id;

    if (msg.playing) {
        playingTabs.add(tabId);
    } else {
        playingTabs.delete(tabId);
    }

    updateBadge();
});

// タブが閉じられたときはリストから削除
extAPI.tabs.onRemoved.addListener((tabId) => {
    playingTabs.delete(tabId);
    updateBadge();
});

// 2. 拡張機能のアイコンがクリックされたときの処理（複数タブの巡回ジャンプ対応）
extAPI.action.onClicked.addListener(async () => {
    const ids = [...playingTabs];

    if (ids.length === 0) {
        currentIndex = 0; // 念のためリセット
        return;
    }

    // タブの増減によりインデックスが範囲外になった場合は0に戻す
    if (currentIndex >= ids.length) {
        currentIndex = 0;
    }

    const targetId = ids[currentIndex];

    try {
        const tab = await extAPI.tabs.get(targetId);
        await extAPI.tabs.update(tab.id, { active: true });
        await extAPI.windows.update(tab.windowId, { focused: true });
        
        // 次回のクリック時は次のタブへ飛ぶようにインデックスを進める
        currentIndex = (currentIndex + 1) % ids.length;
    } catch (error) {
        // タブが存在しないなどのエラー時はリストから除外してバッジ更新
        playingTabs.delete(targetId);
        updateBadge();
    }
});

// ==========================================
// MV3 Service Worker 休止対策（自動復旧処理）
// ==========================================
async function initializePlayingTabs() {
    try {
        // manifest.json と合わせて YouTube Music にも対応するよう URL を配列化
        const tabs = await extAPI.tabs.query({ 
            url: [
                "*://*.youtube.com/*",
                "*://music.youtube.com/*"
            ] 
        });
        
        for (const tab of tabs) {
            try {
                const response = await extAPI.tabs.sendMessage(tab.id, { type: "GET_PLAYING_STATUS" });
                if (response && response.playing) {
                    playingTabs.add(tab.id);
                }
            } catch (e) {
                // コンテンツスクリプトが未ロード、または無効なタブの場合は無視
            }
        }
        updateBadge();
    } catch (error) {
        console.error("Initialization failed:", error);
    }
}

initializePlayingTabs();