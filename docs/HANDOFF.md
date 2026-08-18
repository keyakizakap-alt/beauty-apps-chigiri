# 引き継ぎメモ（CHIGIRI Beauty）

このファイルは、これまでの開発チャットの内容を次の担当者（人でも Claude の別セッションでも）へ
引き継ぐためのものです。仕様の詳細は `README.md`、設計の詳細は `docs/ARCHITECTURE.md` を参照してください。
ここには「今どこまで進んでいて、次に何をすべきか」だけをまとめます。

最終更新: 2026-08-12

---

## 1. これは何のプロジェクトか

**CHIGIRI Beauty** — 日本の美容ルーティンを扱う対話型 AI。ハッカソン向け MVP。

最重要方針（ぶれてはいけない点）:

- 商品の**選定ロジックは決定論的**。LLM には選ばせない（`domain/recommendation/engine.ts`）
- LLM（OrcaRouter、OpenAI 互換）は**サーバー側のみ**で呼ぶ。条件抽出と説明文生成に限定
- LLM の出力は必ず検証してから使う: JSON parse → Zod → 許可された商品IDか → 薬機法の禁止表現に触れていないか → だめなら決定論的な既定文へフォールバック
- **存在しない商品・出典・口コミ・検証結果を作らない**（このルールにより、③のワークシートのような「手作業でしか進められない」局面が何度も出てきます）
- ユーザーには推薦アルゴリズムの内部仕様を明かさない（開発者向け情報は `CHIGIRI_OPS=1` の環境変数でのみ表示）

対応分野は5つ、1つのエンジンを共通化: スキンケア / ヘアケア / ボディケア / メイク / ネイルケア
（`domain/recommendation/domains.ts` に分野ごとの設定を集約）

---

## 2. 今の状態（何ができているか）

- Next.js 16 / React 19 / TypeScript strict / Tailwind / Zod / Vitest。
- `npx vitest run` → **340 tests / 22 files すべて green**
- `npm run build` → 通過
- 5分野すべてで対話・商品選択・ルーティン組み立てが動く
- コンシェルジュ選択画面（ARCA/SILQA/SOMA/TINTA/UNEA、未対応は「準備中」表示）実装済み
- 商品データ 92点（スキンケア46 / メイク15 / ヘア12 / ネイル10 / ボディ9）
  - 各商品に `officialUrl`（公式サイトへのリンク）
  - 成分の読み解き（`domain/analysis/insight.ts`）、提案品との比較、「続ける目安」期間の開示
  - 口コミへの導線は複数サイト（@cosme, LIPS, 楽天, Amazon, Yahoo, Qoo10）。ただし実際の口コミ本文は取得・表示していない（後述）
- マイアイテム: カタログから選ぶだけでなく、ユーザーが自分の持ち物を自由記述で追加できる
- 開発者向け画面（`/ops`）はサーバー側で `CHIGIRI_OPS=1` が無ければ 404
- Vercel へのデプロイ手順は README 済み、`vercel.json` で Framework を `nextjs` に固定
- ブランチ: `main` と `claude/chigiri-beauty-mvp-cn3wlv` は同期済み（最新コミット `4c88609`）

---

## 3. 未完了で、次にやるべきこと

### 3-1. 商品データ92点の公式ページ突合（最優先・未完了）

**現状、全92点が `sourceCheckedAt: null` / `dataConfidence: "seed"` です。**
価格・内容量・公式URLは編集時点の参考値で、公式ページと1点ずつ照合していません。
UI 側は「公式突合 未完了（参考データ）」バッジで正直に表示しているので嘘にはなっていませんが、
本番運用前には潰す必要があります。

このセッションが動いている開発コンテナは**外部サイトへの通信が組織ポリシーで遮断**されており
（`www.kao.co.jp` 等への CONNECT が 403）、Claude 側から自動で突合することができません。
そのため「人が公式ページを見て、結果だけを反映する」ワークシートの仕組みを用意しました。

```bash
npm run verify:export            # 全92点を CSV に書き出す（未確認を先頭に並べる）
npm run verify:export -- demo    # デモで使う7点だけ（優先度高）
npm run verify:export -- skincare  # 分野を絞る

# → verification/products-worksheet.csv を Excel 等で開いて記入
#    確認結果: ok / fix / drop、確認日: YYYY-MM-DD（必須）

npm run verify:import -- --dry-run   # 書き込まずに結果だけ確認
npm run verify:import                # data/products.json へ反映
```

安全側の作り（意図的な制約なので変更しないこと）:
- 確認日の無い行、`https` でない URL、数値として読めない価格は**反映しない**
- エラーが1件でもあれば**何も書き込まない**（部分適用を作らない）
- `drop` は削除候補として出すだけで自動削除はしない

詳細手順は `README.md` 13章。ロジックは `scripts/verification-lib.mjs`、
テストは `tests/verification.test.ts`（14件）。

**次の一手**: まず `npm run verify:export -- demo` の7点だけでも人力で埋めて `verify:import` を通すと、
デモで使う商品だけは「本当に確認済み」にできます（15分程度の作業）。

### 3-2. 開発コンテナのネットワークポリシー

ユーザーが Anthropic 環境設定でポリシー変更を試みたが、直近のテスト（06:43 UTC）でも
`selective: false` のまま、一般ホストへの CONNECT は全部403で変化なし。
考えられる原因（ユーザーに確認待ち）:
1. コンテナは 06:31:42 起動。**それより後に変更した場合は現行コンテナに反映されない**（新セッションが必要）
2. 別の環境を編集してしまっている可能性
3. ポリシー種別が「制限なし」相当になっていない可能性

**次の一手**: 新しいセッションを開始し、最初に
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` で `selective` の値を確認。
`curl -I https://www.kao.co.jp/curel/` が 200 を返せば、突合を自動化できる可能性がある。
それでも通らない場合は 3-1 のワークシートで人力運用を継続する。

### 3-3. 商品写真（未登録・要注意）

**92点すべて写真が未登録です。** 現在は役割とブランドから決まる線画を
表示しており、詳細画面には「写真未登録」と明記しています。

写真を入れる場合は、**メーカーの配布素材を許諾を確認したうえで**用意し、
次の2コマンドで取り込みます（README 13章）。

```bash
npm run images:plan                        # 保存すべきファイル名の一覧
npm run images:add ~/Downloads/画像フォルダ   # 縮小・webp変換して取り込む
```

ファイル名は `<商品id>.jpg`。id と一致しないファイルは推測で割り当てず、
未対応として報告します。突合ワークシートの「商品写真ファイル名」列からも
登録できます。

やってはいけないこと:
- 公式サイトの画像への直リンク（CSP で塞いでおり、規約・著作権の問題もある）
- 商品の外観を推測して画像を生成すること（実在する商品の見た目を偽ることになる）

### 3-4. 口コミ機能の扱い（要注意・実装方針を忘れないこと）

`domain/analysis/reviews.ts` の `REVIEW_SOURCES` は**意図的に空配列**。
存在しない口コミを創作しないという方針のため、実データ取得ができるようになるまで
「複数サイトへのリンクを提示するだけ」に留めている。UI 側もそれを前提にした文言。
ネットワークが開通しても、実データ取得の実装（スクレイピングかAPI経由か）と
利用規約の確認をしてからでないと有効化しないこと。

---

## 4. 主要ファイルの場所

| 目的 | ファイル |
|---|---|
| 分野ごとの設定（5分野を1エンジンで） | `domain/recommendation/domains.ts` |
| 決定論的推薦エンジン本体 | `domain/recommendation/engine.ts` |
| 商品・プロフィールの Zod スキーマ | `schemas/product.ts`, `schemas/profile.ts` |
| 商品カタログ（92点） | `data/products.json` |
| 公式サイトのホスト許可リスト | `data/merchants.json` |
| 商品サムネイルの図案 / 描画 | `domain/recommendation/product-image.ts`, `components/ProductThumb.tsx` |
| 商品写真の置き場 | `public/products/`（許諾を確認したものだけ。README 13章） |
| 商品写真の取り込み | `scripts/images-plan.mjs`, `scripts/images-add.mjs`, `scripts/images-lib.mjs` |
| 成分読み解き・比較・継続目安 | `domain/analysis/insight.ts` |
| 口コミサイト導線（本文取得はしていない） | `domain/analysis/reviews.ts` |
| 開発者向け画面のサーバー側ゲート | `lib/ops-visibility.ts`, `app/ops/page.tsx` |
| LLM 呼び出し・検証・フォールバック | `server/orcarouter.ts`, `server/explanation.ts`, `server/fallback-explanation.ts` |
| 薬機法の許可表現・禁止表現 | `server/prompt-safety.ts` 周辺（`allowed-claims` 系） |
| 突合ワークシートのロジック / CLI | `scripts/verification-lib.mjs`, `scripts/verify-export.mjs`, `scripts/verify-import.mjs` |

---

## 5. 動かし方

```bash
npm run dev           # http://localhost:3000
npm run build          # 本番ビルド
npm run typecheck
npx vitest run          # 単体テスト（340件）
npm run e2e             # モバイル幅 E2E（別途 npm start が必要）
npm run verify:export / verify:import   # 3-1 参照
```

必要な環境変数（`.env.local` 等）:

| 変数 | 用途 |
|---|---|
| `ORCAROUTER_API_KEY` | OrcaRouter 認証（無いとフォールバック文言のみで動く） |
| `ORCAROUTER_BASE_URL` / `_MODEL_CHEAP` / `_MODEL_QUALITY` / `_TIMEOUT_MS` | OrcaRouter 接続先の調整 |
| `CHIGIRI_HANDOFF_SECRET` | 引き継ぎトークンの署名鍵（未設定でも開発用の一時鍵で動くが本番では必須） |
| `CHIGIRI_OPS` | `1` で開発者向け画面 `/ops` を有効化 |
| `CHIGIRI_EXTERNAL_AI` | 外部AI呼び出しの有効/無効切り替え（詳細は `server/ai-policy.ts`） |

---

## 6. これまでの主な意思決定（繰り返し聞かれたら参照）

- Vercel の Framework Preset は **Next.js** を選ぶ（`Other` を選ぶと `No entrypoint found` エラーになった実績あり。`vercel.json` で固定済み）
- プロフィール読み上げは「ユーザーが言った値」と「システムの既定値」を区別して表示する（`statedFields`）。断定口調で既定値を事実のように言うと違和感が出るため
- 商品選択の UI はチャット内に直接リストを表示する（「下のリストから選ぶか」という誘導文だけ出して実物のリストが無い、という状態を作らない）
- 開発者向け内容とアルゴリズムの内部仕様はユーザー向け文言から徹底して排除する。ただし「AI・出典・免責」の法定開示は残す
