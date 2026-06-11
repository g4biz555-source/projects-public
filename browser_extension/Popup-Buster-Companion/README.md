# Popup Buster Companion

uBlock Originを補完する、体験ベースの自己成長型ポップアップブロッカーのMVPです。

## 機能

- Source Domains: 登録した発生元ドメインから開かれた新規タブを閉じます。
- Target Domains: 登録した発生先ドメインが開かれた新規タブを閉じます。
- Toolbar Popup: 現在のタブをSource/Targetに登録、または解除できます。
- Options: リスト検索、手動追加、削除、JSON/テキストのインポートとエクスポートができます。
- Local Only: データは`chrome.storage.local`にのみ保存され、外部通信は行いません。

## Chrome試験運用メモ

1. `chrome://extensions`を開きます。
2. 右上のDeveloper modeを有効にします。
3. Load unpackedからこのフォルダを選択します。

## Firefox試験運用メモ

1. `about:debugging#/runtime/this-firefox`を開きます。
2. Load Temporary Add-onを選びます。
3. このフォルダ内の`manifest.json`を選択します。

このmanifestはFirefox AMO提出向けです。Chromeで読み込む場合は、`background.scripts`ではなく`background.service_worker`を使うChrome向けmanifestを別途用意してください。

## AMO審査メモ

Firefox Add-onsへ提出する際は、Notes to Reviewersに以下を記載

```text
This extension requires <all_urls> in host_permissions because its core functionality is to block pop-ups based on the user's custom blocklist. It needs to inspect the tab.url and tab.openerTabId of newly created tabs across all domains to determine if the source or target matches the blocklist.
```

プライバシーポリシーには、以下の趣旨を明記

```text
Popup Buster Companion reads tab URLs only to compare newly opened tabs and opener tabs against the user's local blocklists. The extension does not transmit, sell, share, or upload browsing data or blocklists to any external server. All blocklists and counters are stored locally in the browser.
```

## インポート形式

JSON:

```json
{
  "sourceDomains": ["example.com"],
  "targetDomains": ["spam.example"]
}
```

テキスト:

```text
# Source Domains
example.com

# Target Domains
spam.example
```

見出しなしの改行区切りテキストはTarget Domainsとして取り込みます。
