# Download Status Sound

Firefox 拡張機能 - ダウンロード状態を監視し、完了・エラー・キャンセル時に音声通知とブラウザ通知を表示する拡張機能です。

## 機能

### コア機能
- **ダウンロード完了通知** - DL完了時に音声とブラウザ通知で告知
- **エラー通知** - DL失敗、中断、キャンセル、削除などを検知して通知
- **カスタム音声** - WAV, OGG, MP3形式の音声ファイルをユーザーが自由に設定可能

### 詳細設定
- **イベント別設定** - 各ダウンロードイベントごとに音声の有効/無効、音量を個別設定
- **ブラウザ通知** - システムネイティブ通知の表示・非表示を切り替え
- **メッセージカスタマイズ** - 通知メッセージのテンプレートを編集可能

### フィルター機能
- **除外ドメイン** - 特定のドメインからのダウンロードを通知対象から除外
- **URLパターンフィルター** -正規表現でURLパターンを指定してフィルタリング
- **ファイル形式フィルター** - 特定の拡張子のファイルのみを通知対象に制限
- **最小ファイルサイズ** - 一定サイズ以下のファイルを無視

### ユーティリティ機能
- **静かな時間帯** - 指定した時間帯は音声をミュート（例: 夜間23:00〜朝7:00）
- **ダウンロード履歴** - 最近の50件のイベントを記録
- **クイックポップアップ** - ツールバーから現在のDL状態を確認

## インストール方法

### ローカルインストール（開発用）

1. このフォルダをFirefoxに読み込ませます：
   - Firefoxで `about:debugging` にアクセス
   - 「一時的な拡張機能を読み込む」をクリック
   - このプロジェクトの `manifest.json` ファイルを選択

2. 公開用にパッケージする場合：
   ```bash
   # ZIPファイルを作成
   zip -r download-status-sound.zip . -x "*.git*" "*.md"
   ```

### Firefox Add-onsへの公開

1. [addons.mozilla.org](https://addons.mozilla.org/) にアカウント登録
2. `web-ext sign` コマンドで署名（Web Extension Toolkit使用）
3. アドオンストアに提出

```bash
# Web Extension Toolkitをインストール
npm install -g web-ext

# 署名用パッケージを作成
web-ext sign --channel=listed
```

## ファイル構造

```
DL_status_sound/
├── manifest.json              # 拡張機能のマニフェスト（Manifest V3）
├── background/
│   └── background.js          # サービスワーカー（ダウンロード監視・通知）
├── options/
│   ├── options.html           # 設定ページUI
│   ├── options.css            # 設定ページスタイル
│   └── options.js             # 設定ページロジック
├── popup/
│   ├── popup.html             # クイックポップアップUI
│   ├── popup.css              # ポップアップスタイル
│   └── popup.js               # ポップアップロジック
├── icons/                     # アイコン画像（準備必要）
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 使用方法

### 基本的な使い方

1. Firefoxで拡張機能をインストール
2. ダウンロードを開始すると、完了時にデフォルトのビープ音が鳴ります
3. エラーが発生した場合も異なる音で通知されます

### カスタム音声の設定

1. ツールバーの拡張機能アイコンをクリック → 「⚙️ Settings」を開く
2. 「🔊 Sound Settings」セクションで各イベントを選択
3. 「Choose File」ボタンからWAV, OGG, またはMP3ファイルを選択
4. 「Test」ボタンで音声をテスト再生
5. 不要な場合は「Remove」ボタンでデフォルトに戻す

### フィルターの設定

1. 設定ページで「🔍 Filter Settings」セクションを開く
2. 各項目を入力：
   - **Excluded Domains**: 除外するドメイン（1行ずつ）
   - **Excluded URL Patterns**: 正規表現パターン（1行ずつ）
   - **Allowed File Extensions**: 許可する拡張子（1行ずつ、空白で全て許可）
   - **Minimum File Size (KB)**: 最小ファイルサイズ（0 = 無制限）

### 静かな時間帯の設定

1. 設定ページで「🌙 Quiet Hours」セクションを開く
2. 「Enable Quiet Hours」をオンに
3. 開始時間と終了時間を設定（例: 23:00 〜 07:00）

## 開発者向け情報

### 依存関係
- Firefox (Manifest V3対応版)
- 外部ライブラリなし（純粋なVanilla JS）

### 使用API
- `chrome.downloads` - ダウンロード状態の監視
- `chrome.notifications` - ブラウザ通知
- `chrome.storage` - 設定の永続化
- `chrome.alarms` - アラーム機能
- Web Audio API - デフォルト音声の生成

### ストレージ構造
```javascript
{
  settings: {
    enabled: true,
    sounds: { ... },
    notifications: { ... },
    filters: { ... },
    schedule: { ... }
  },
  history: [ ... ],
  customSoundBlob_download_completed: "data:audio/...",
  // ... 他のカスタム音声
}
```

## ライセンス

MIT License

## 貢献

Pull Request歓迎です。バグ報告や機能改善のご提案もGitHub Issuesから可能です。

## バージョン履歴

- v1.0.0 (2026-06-20) - 初回リリース
  - ダウンロード完了・エラー・キャンセルの音声通知
  - カスタム音声ファイル対応（WAV/OGG/MP3）
  - ブラウザ通知連携
  - フィルター機能
  - 静かな時間帯設定
  - ダウンロード履歴