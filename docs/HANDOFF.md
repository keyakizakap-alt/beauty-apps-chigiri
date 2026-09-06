# 引き継ぎメモ（CHIGIRI Beauty）

「今どこまで進んでいて、次に何をすべきか」だけをまとめる。
仕様は [`../README.md`](../README.md)、設計は [`ARCHITECTURE.md`](ARCHITECTURE.md)、
人手の作業手順は [`OPERATIONS.md`](OPERATIONS.md)。

---

## 1. ぶれてはいけない方針

- **商品の選定ロジックは決定論的。LLM に選ばせない**（`domain/recommendation/engine.ts`）
- LLM（OrcaRouter、OpenAI 互換）は**サーバー側のみ**。条件抽出と説明文生成に限定する
- LLM 出力は必ず検証してから使う：JSON parse → Zod → 許可された商品 ID か →
  薬機法の禁止表現に触れていないか → だめなら決定論的な既定文へ
- **存在しない商品・出典・口コミ・検証結果を作らない。** この一点があるため、突合や写真登録は
  「手作業でしか進められない」局面が何度も出てくる（それでよい）
- 推薦アルゴリズムの内部仕様をユーザー向け文言に出さない。開発者向け情報は `CHIGIRI_OPS=1` のみ

対応分野は 5 つを 1 エンジンで共通化（`domain/recommendation/domains.ts`）。
スキンケア / ヘアケア / ボディケア / メイク / ネイルケア。

## 2. 現在地

Next.js 16 / React 19 / TypeScript strict / Tailwind / Zod / Vitest。
`npx vitest run` green、`npm run build` 通過。5 分野すべてで対話・商品選択・ルーティン組み立てが動く。
コンシェルジュ選択（ARCA / SILQA / SOMA / TINTA / UNEA、未対応は「準備中」）実装済み。
商品データ 92 点に `officialUrl`、成分の読み解き（`domain/analysis/insight.ts`）、提案品との比較、
「続ける目安」期間の開示まで実装済み。マイアイテムは自由記述の追加にも対応。
`/ops` はサーバー側で `CHIGIRI_OPS=1` が無ければ 404。Vercel デプロイ手順は README 済み
（`vercel.json` で Framework を `nextjs` に固定）。

## 3. 次にやること

### 3-1. 商品データ 92 点の公式突合（最優先）

全 92 点が `sourceCheckedAt: null` / `dataConfidence: "seed"`。UI は「公式突合 未完了（参考データ）」
バッジで正直に表示しているため嘘にはなっていないが、本番運用前には潰す必要がある。

**次の一手**：`npm run verify:export -- demo` の 7 点だけでも人力で埋めて `verify:import` を通す
（15 分程度）。デモで使う商品だけは「本当に確認済み」にできる。手順は [`OPERATIONS.md`](OPERATIONS.md)。

開発コンテナから外部サイトへの通信が遮断されている場合、自動突合はできない。
新しいセッションでは `curl -sS "$HTTPS_PROXY/__agentproxy/status"` と
`curl -I https://www.kao.co.jp/curel/` で到達性を先に確認する。通らなければワークシートで人力運用を継続する。

### 3-2. 商品写真（92 点すべて未登録）

現在は役割とブランドから決まる線画を表示し、詳細画面に「写真未登録」と明記している。
楽天 / Amazon から引く実装は入っているが、`data/products.json` に `rakutenItemCode` / `jan` / `asin` が
未記入なので**現状は何も引かない**。識別子を入れるのが次の作業（`npm run media:find -- demo` で
候補を出す。自動採用はしない）。手順は [`OPERATIONS.md`](OPERATIONS.md)。

**やってはいけないこと**

- ブランド公式サイトの画像への直リンク（CSP で塞いでおり、規約・著作権の問題もある）
- 商品の外観を推測して画像を生成すること（実在する商品の見た目を偽ることになる）
- キーワード検索の結果を自動で `rakutenItemCode` に入れること（別商品の写真が出る）
- 楽天 / Amazon から取得した画像を `public/products/` へ保存し直すこと（規約違反）

### 3-3. 口コミ機能の扱い（実装方針を忘れないこと）

`domain/analysis/reviews.ts` の `REVIEW_SOURCES` は**意図的に空配列**。存在しない口コミを
創作しないという方針のため、実データ取得ができるようになるまで「複数サイトへのリンクを提示するだけ」に
留めている。UI 側もそれを前提にした文言。ネットワークが開通しても、実データ取得の実装
（スクレイピングか API 経由か）と利用規約の確認をしてからでないと有効化しない。

## 4. 主要ファイル

| 目的 | ファイル |
|---|---|
| 分野ごとの設定（5 分野を 1 エンジンで） | `domain/recommendation/domains.ts` |
| 決定論的推薦エンジン本体 | `domain/recommendation/engine.ts` |
| Zod スキーマ | `schemas/product.ts`, `schemas/profile.ts` |
| 商品カタログ / ホスト許可リスト | `data/products.json`, `data/merchants.json` |
| サムネイルの図案 / 描画 | `domain/recommendation/product-image.ts`, `components/ProductThumb.tsx` |
| 商品写真の取り込み（自前 / 楽天・Amazon） | `scripts/images-*.mjs` / `server/media/*`, `app/api/product-media/` |
| 成分読み解き・比較・継続目安 | `domain/analysis/insight.ts` |
| 口コミサイト導線（本文取得なし） | `domain/analysis/reviews.ts` |
| 開発者向け画面のサーバー側ゲート | `lib/ops-visibility.ts`, `app/ops/page.tsx` |
| LLM 呼び出し・検証・フォールバック | `server/orcarouter.ts`, `server/explanation.ts`, `server/fallback-explanation.ts` |
| 突合ワークシートの CLI / ロジック | `scripts/verify-*.mjs`, `scripts/verification-lib.mjs` |

## 5. これまでの主な意思決定

- Vercel の Framework Preset は **Next.js** を選ぶ（`Other` を選ぶと `No entrypoint found` になった
  実績あり。`vercel.json` で固定済み）
- プロフィール読み上げは「ユーザーが言った値」と「システムの既定値」を区別して表示する
  （`statedFields`）。断定口調で既定値を事実のように言うと違和感が出るため
- 商品選択の UI はチャット内に直接リストを表示する（「下のリストから選ぶか」という誘導文だけ出して
  実物のリストが無い、という状態を作らない）
- 開発者向け内容とアルゴリズムの内部仕様はユーザー向け文言から排除する。
  ただし「AI・出典・免責」の法定開示は残す
