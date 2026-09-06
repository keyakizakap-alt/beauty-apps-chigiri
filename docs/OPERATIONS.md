# 運用手順

人が手を動かす必要がある作業。自動化していないのは、**確認していないものを確認したことに
してしまう危険**を避けるため。

## 1. 商品カタログの公式ページ突合

全 92 点が `sourceCheckedAt: null` / `dataConfidence: "seed"`。本番運用前に埋める。

```bash
npm run verify:export              # 全92点を CSV に書き出す（未確認を先頭に並べる）
npm run verify:export -- demo      # デモで使う7点だけ（優先度高・15分程度）
npm run verify:export -- skincare  # 分野を絞る
```

`verification/products-worksheet.csv`（Git 管理外）が出力される。表計算ソフトで開き、
公式ページを見ながら記入する。

| 列 | 記入内容 |
|---|---|
| 確認結果 | `ok`＝現在の値で正しい / `fix`＝直す / `drop`＝取り扱いをやめる |
| 確認日 | `YYYY-MM-DD`。**必須**。無い行は反映されない |
| 正しい公式URL / 正しい価格 / 正しい内容量 | `fix` のときだけ。空欄の項目は現状維持 |
| 商品写真ファイル名 | `fix` のときだけ（→ 2 章） |

```bash
npm run verify:import -- --dry-run   # 書き込まずに結果だけ見る
npm run verify:import                # data/products.json へ反映
```

反映されるとその商品は `dataConfidence: "official"` になり、UI の「公式突合 未完了」バッジが消える。

**安全側の作り（意図的な制約。変更しないこと）**

- **エラーが 1 件でもあれば、何も書き込まずに終了する**（部分適用を作らない）
- 確認日の無い行、`https` でない URL、数値として読めない価格は反映しない
- `drop` は削除候補として表示するだけで、自動削除はしない
- 新しいホストを指定した場合は `data/merchants.json` への追加も必要

反映後は `npm test` でカタログの整合性を確認する。
ロジックは `scripts/verification-lib.mjs`、テストは `tests/verification.test.ts`（14 件）。

## 2. 商品写真

ブランドの商品写真は各社の著作物。**メーカーが配布しているものを、利用許諾を確認したうえで、
自分の配信元に置いたときだけ表示する。** 外部ホストの画像への直リンクはしない
（CSP の `img-src` を `'self' data:` に保つため、そもそも読み込めない）。
商品の外観を推測した画像も作らない。

### 自前で用意する場合

```bash
npm run images:plan                              # 保存すべきファイル名の一覧
npm run images:plan -- demo                      # デモで使う7点だけ
npm run images:add ~/Downloads/画像 -- --dry-run  # 確認だけ
npm run images:add ~/Downloads/画像              # 取り込む
```

ファイル名は `<商品id>.jpg`（`png` / `webp` も可）。800×800 に収めて `webp` へ変換し、
`public/products/` に置いて `data/products.json` の `imagePath` を更新する。
Exif の向きを反映してから向き情報を捨てるので、スマホで撮った写真が横倒しにならない。

安全側の作り:

- ファイル名が商品 id と一致しないものは**取り込まず、一覧で報告**する
  （推測で割り当てると、違う商品の写真が出る）
- 拡張子ではなく**中身のバイト列で画像形式を判定**する
- 12MB を超えるファイルは受け付けない
- **写真を入れても「公式ページ突合」の状態は変えない**（写真の有無と、価格や URL を
  確認したことは別）

突合ワークシートの「商品写真ファイル名」列からも登録できる。`verify:import` は指定された
ファイルが `public/products/` に実在するかを確認するため、読み込めない画像を指したまま
「確認済み」にはならない。

**写真が未登録のあいだ**は、役割（ポンプ・チューブ・ジャー等）とブランドから決まる線画を出す。
同じ商品には必ず同じ図案が出るので、一覧で商品を見分ける手がかりになる。これは商品の写真でも
容器の再現でもないため、詳細画面で「写真未登録」と明記している。
仕様は `domain/recommendation/product-image.ts`、描画は `components/ProductThumb.tsx`。

### 楽天 / Amazon から引く場合

```
data/products.json（jan / rakutenItemCode / asin）
  → app/api/product-media/route.ts   ← ブラウザはここだけを叩く（鍵はこの先から出さない）
  → server/media/resolve.ts          楽天 →（無ければ）Amazon の順で解決・キャッシュ
  → components/ProductMediaProvider.tsx（画面の入口で1回だけまとめて引く）→ ProductThumb.tsx
```

| 変数 | 用途 |
|---|---|
| `RAKUTEN_APP_ID` | 楽天ウェブサービスのアプリ ID。**これだけで動く** |
| `RAKUTEN_AFFILIATE_ID` | 任意。入れると提携リンクが返る |
| `AMAZON_ACCESS_KEY` / `AMAZON_SECRET_KEY` / `AMAZON_PARTNER_TAG` | PA-API v5。3 つ揃わないと照会しない |
| `MEDIA_CACHE_TTL_MS` | 保持時間。既定 6 時間、**上限 24 時間**（規約上これ以上は保持しない） |

`NEXT_PUBLIC_` は付けない。鍵は `.env.local`（ローカル）と Vercel の Environment Variables（本番）。

**楽天を先に薦める理由**：アプリ ID を取るだけで即日使える。Amazon PA-API はアソシエイト・
プログラムの承認済みアカウントが必要で、一定期間内に適格販売がないと利用資格を失う。

**識別子を入れる**（現状 `data/products.json` は未記入なので何も引かない）。下調べ用:

```bash
RAKUTEN_APP_ID=xxx npm run media:find -- cl-curel-foam
RAKUTEN_APP_ID=xxx npm run media:find -- demo
```

候補を並べるだけで、**カタログは書き換えない。** 同一商品と確認できたものだけ、自分で
`data/products.json` に `rakutenItemCode` / `jan` / `asin` を書く。

**キーワード検索の結果を自動採用しない理由**：「キュレル 泡洗顔料」で検索すると詰め替え用・
旧品・セット品・別ブランドの類似品が混ざる。自動採用すると別商品の写真が堂々と表示される。
写真が出ないことより有害。

**規約まわりで実装に反映していること**

- 画像は**各社の CDN から配信**し、取得した画像を自分の配信元へ保存し直さない（両社とも不可）
- 保持は既定 6 時間・**上限 24 時間**で打ち切る（設定で延ばそうとしても上限を超えない）
- 呼び出しは提供元ごとに直列化し、**1.1 秒以上の間隔**を空ける（両 API とも概ね毎秒 1 リクエスト）
- 詳細画面に**提供元を明記**する（「画像・価格は楽天市場の提供です」）
- 提携リンクは `https` のみ受け付ける

**引けなかったときは写真が出ないだけ**で、ルーティンの計算結果は変わらない。サムネイルは線画に戻る。

## 3. OrcaRouter の疎通確認

**コマンドで**（アプリを起動せずに単体実行できる）

```bash
ORCAROUTER_API_KEY=sk-... npm run orca:check   # .env.local にあれば指定不要
```

段階を分けて表示するので、どこで落ちたかがすぐ分かる。成功なら終了コード 0、失敗なら 1。

```
1. 認証と接続（GET /models）   … キーが通るか。生成しないので費用ゼロ
2. 生成と構造化出力（POST）    … 応答が返るか、JSON モードが効くか
```

```
✗ HTTP 401
  キーが正しくないか、権限がありません。再発行を確認してください。
  応答: {"error":{"message":"Invalid API key provided", ...}}
```

**画面で**（`CHIGIRI_OPS=1` で有効になる `/ops`）

押すと固定の短文を 1 回だけ送り、接続・認証・モデル選択・構造化出力・費用計算が通ることを
確かめる。利用者のデータを含めないため、この確認のためにプライバシー設定を変える必要はない。

```
POST /api/ops/orcarouter
→ { "reachable": true, "requestedModel": "auto", "selectedModel": "gpt-4o-mini",
    "latencyMs": 22, "estimatedTokens": 1500, "estimatedCostJpy": 0.12, "jsonValid": true }
```

認証（`/models`）と生成（`/chat/completions`）を分けて実行するため、**「キーの問題」か
「モデル指定や生成の問題」か**を切り分けられる。提供元が返したエラー本文の冒頭も表示する
（運用者向け画面のみ）。

## 4. アプリアイコン

アイコンは**重なり合う 2 つの輪**で「買う前に、今あるものをつなぐ」を表す。重なった部分に桜色を置き、
すでに持っているもの同士がつながる地点を中心に据えている。

- `app/icon.svg` — 原本。ブラウザのタブ用
- `public/icons/*.png` — `npm run icons` で SVG から書き出したもの。リクエストごとの画像生成を
  避けるためコミットしている
- `maskable-512.png` は Android のアダプティブアイコン用に角丸を付けず、中央 80% のセーフゾーンに
  収める（OS 側が任意の形に切り抜くため）
- `app/manifest.ts` — ホーム画面から開くとブランド色のスタンドアロン表示になる

起動時のオープニング（`components/AppSplash.tsx`）は、フェードアウトを **CSS アニメーションだけで
完結**させる（JS が動かない環境でもオーバーレイが居座って操作を塞がない）。`sessionStorage` で
同じタブでは 1 回だけ。`prefers-reduced-motion` では拡大・移動をやめる。装飾のため `aria-hidden`。
