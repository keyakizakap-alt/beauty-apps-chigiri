## 実装方針の正本

このリポジトリの設計判断は、スキル **`ai-product-playbook`** に集約してある。
複製せず参照する（複製すると更新時に内容がずれるため）。

- 正本: [keyakizakap-alt/dxworkrepository](https://github.com/keyakizakap-alt/dxworkrepository) の `.claude/skills/ai-product-playbook/`
- 全プロジェクトで自動ロードさせる手順: 同リポジトリの `README.md`

設計を変える前に必ず読むこと。

## このリポジトリで壊してはいけないもの

- **商品の選定・除外・順位づけは `domain/` の決定論的な純関数**。LLM に選ばせない。
  LLM の担当は確定済みの結論に付ける説明文だけで、結論を変えない。
- **外部送信は `server/ai-policy.ts` の `ExternalAiGrant` 経由のみ。** 許可証は
  `decideExternalAi()` でしか発行できない。この経路を迂回するコードを書かない。
  費用上限（`llm-cost.ts`）も同じ関門に載っている。
- **購入引き継ぎは 4 段階の検証を通ったときだけ成立する**（候補提示 → 承認直前の再検証 →
  HMAC 署名トークン発行 → 遷移時の再検証）。外部 URL は 303 の `Location` でしか
  クライアントへ渡さない。
- **薬機法の境界**：受診勧奨ゲートは減点ではなく停止。説明文は `data/allowed-claims.json` の
  範囲内。禁止表現を含む AI 出力は破棄する。
- 在庫・送料・突合状態は未確認なら `null` と「未確認」バッジ。それらしい値で埋めない。
