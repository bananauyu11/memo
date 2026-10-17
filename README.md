# メモ

マークダウンで書けるシンプルなメモアプリ（React + Vite）。

- マークダウン入力（GFM・チェックリストはプレビューでタップして切り替え）
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
