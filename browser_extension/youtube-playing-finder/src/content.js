// Chrome と Firefox の両方で動作するように、APIオブジェクトを切り替えます
const extAPI = typeof browser !== "undefined" ? browser : chrome;

let lastPlaying = null;

// 現在の動画の再生状態（true / false）を返す関数
function getPlayingStatus() {
    const video = document.querySelector("video");
    return !!(video && !video.paused && !video.ended);
}

function reportState() {
    const isPlaying = getPlayingStatus();

    if (isPlaying !== lastPlaying) {
        // Backgroundスクリプトへ現在の状態を送信（ChromeのPromise非対応環境向けに安全策を追加）
        try {
            const result = extAPI.runtime.sendMessage({
                playing: isPlaying
            });
            if (result?.catch) {
                result.catch(() => {});
            }
        } catch (e) {
            // 送信エラーを無視
        }

        lastPlaying = isPlaying;
    }

    const currentTitle = document.title.replace(/^▶ /, "");

    if (isPlaying) {
        if (!document.title.startsWith("▶ ")) {
            document.title = "▶ " + currentTitle;
        }
    } else {
        document.title = currentTitle;
    }
}

// 起動直後に即状態を送信（最大3秒のタイムラグを解消）
reportState();

// 3秒ごとに状態をチェック（ページ遷移対策 兼 CPU負荷軽減）
setInterval(reportState, 3000);

// 再生・一時停止ボタンが押されたときに即座に反応させる
document.addEventListener("play", reportState, true);
document.addEventListener("pause", reportState, true);

// Backgroundスクリプトが休止から再起動したときの問い合わせに応答する
extAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_PLAYING_STATUS") {
        sendResponse({ playing: getPlayingStatus() });
    }
});