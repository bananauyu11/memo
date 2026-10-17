# メモ

マークダウンで書けるシンプルなメモアプリ（React + Vite）。

- マークダウン入力（CodeMirror 6 のライブプレビュー。入力中も見出し・太字などを装飾表示し、記号はカーソル行以外で隠す）
  - チェックリストはタップで切り替え、リスト記号の自動入力（取り消しで1手ずつ戻る）
  - キーボード上のツールバー、`( [ \` **` の自動補完、URL 貼り付けでリンク化
  - PC: Ctrl/Cmd+B・I・K・Shift+X、Ctrl/Cmd+Enter（チェック切替）、Alt+↑↓（行移動）、Tab/Shift+Tab
- フォルダ管理（入れ子可）・メモのフォルダ移動
- 右へスワイプで色をつける / 左へスワイプで削除 / 長押しで並べ替え
- データはブラウザ（localStorage）に保存。「…」メニューから JSON でバックアップ／復元

## 開発

```sh
npm install
npm run dev
```

## Vercel へのデプロイ

Vercel で このリポジトリを Import するだけで動きます（Framework Preset: Vite、Build: `npm run build`、Output: `dist` が自動設定されます）。
