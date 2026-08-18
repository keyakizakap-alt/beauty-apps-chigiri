"use client";

import { useState } from "react";
import type {
  ComparisonRow,
  OfferValidation,
  PurchaseHandoff,
  UnverifiedField,
} from "@/schemas/commerce";
import { CATEGORY_LABEL, getProduct } from "@/domain/recommendation/catalog";
import type { Category } from "@/schemas/product";
import ProductThumb from "./ProductThumb";

/**
 * 購入承認画面（設計書 §6.3）。
 *
 * 表示必須:
 *   商品名・容量・価格 / 販売者 / 送料を含む合計額 / 在庫確認時刻 /
 *   選定理由 / 他候補を選ばなかった理由 / 既存商品との重複有無 /
 *   返品・キャンセル条件 / 外部サイトへ移動すること
 *
 * 確認できていない項目は、それらしい数字で埋めずに「未確認」と書く。
 * ここで嘘をつくと、承認の意味そのものが無くなるため。
 */

const UNVERIFIED_LABEL: Record<UnverifiedField, string> = {
  price: "価格（公式ページとの突合が未完了）",
  shippingFee: "送料",
  availability: "在庫",
  returnPolicy: "返品・キャンセル条件",
};

export default function ApprovalSheet({
  row,
  category,
  duplicateNote,
  otherRows,
  onApprove,
  onDecline,
  handoff,
  validation,
  pending,
  error,
}: {
  row: ComparisonRow;
  category: Category;
  duplicateNote: string | null;
  otherRows: ComparisonRow[];
  onApprove: (acknowledgedUnverified: boolean) => void;
  onDecline: () => void;
  handoff: PurchaseHandoff | null;
  validation: OfferValidation | null;
  pending: boolean;
  error: string | null;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const offer = row.offer;
  const hasUnverified = offer.unverified.length > 0;
  // 承認行はカタログの id しか持たないため、表示用の情報はここで引き直す
  const thumbProduct = getProduct(offer.productId);

  // 引き継ぎリンクが発行済みなら、最後の確認だけを見せる
  if (handoff) {
    return <HandoffReady handoff={handoff} />;
  }

  return (
    <section className="chigiri-card overflow-hidden">
      <header className="border-b border-beige bg-kinari/60 px-4 py-3">
        <h2 className="text-base font-semibold">購入前の最終確認</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-sumi/65">
          この画面では購入も決済も行いません。承認すると、販売サイトへのリンクを発行します。
        </p>
      </header>

      <div className="space-y-4 p-4">
        {/* 商品 */}
        <div>
          <p className="chigiri-label">買うもの</p>
          <div className="mt-1 flex items-start gap-3">
            {thumbProduct && (
              <ProductThumb product={thumbProduct} size={64} className="shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-sumi/55">{row.brand}</p>
              <p className="text-[15px] font-medium leading-snug">
                {row.productName}
              </p>
              <p className="mt-0.5 text-xs text-sumi/60">
                {CATEGORY_LABEL[category]}の役割
                {row.volume && ` ／ 容量 ${row.volume}`}
              </p>
            </div>
          </div>
        </div>

        {/* 金額 */}
        <dl className="rounded-xl bg-kinari/70 p-3.5 text-sm">
          <Row label="商品価格">
            <span className="tabular-nums">
              {offer.price.toLocaleString()}円
            </span>
          </Row>
          <Row label="送料">
            {offer.shippingFee === null ? (
              <Unknown>販売ページで確認</Unknown>
            ) : (
              <span className="tabular-nums">
                {offer.shippingFee.toLocaleString()}円
              </span>
            )}
          </Row>
          <div className="mt-2 border-t border-beige pt-2">
            <Row label="合計">
              {offer.totalYen === null ? (
                <span className="text-right text-xs leading-relaxed text-sumi/70">
                  {offer.price.toLocaleString()}円 ＋ 送料（未確認）
                  <br />
                  <span className="text-[11px] text-sumi/50">
                    送料が分からないため合計額を確定できません
                  </span>
                </span>
              ) : (
                <span className="text-base font-semibold tabular-nums">
                  {offer.totalYen.toLocaleString()}円
                </span>
              )}
            </Row>
          </div>
        </dl>

        {/* 販売者 */}
        <div>
          <p className="chigiri-label">販売者</p>
          <p className="mt-1 text-sm">
            {offer.merchantName}
            {offer.officialSeller && (
              <span className="ml-2 rounded-full bg-matchaSoft px-2 py-0.5 text-[10px] text-matcha">
                ブランド公式
              </span>
            )}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-sumi/55">
            {offer.affiliate
              ? "この販売者へのリンクには提携報酬が含まれます（順位計算には使っていません）。"
              : "このリンクに提携報酬はありません。順位は価格と条件だけで決めています。"}
          </p>
        </div>

        {/* 在庫と確認時刻 */}
        <div>
          <p className="chigiri-label">在庫</p>
          <p className="mt-1 text-sm">
            {offer.availability === "in_stock" && "在庫あり"}
            {offer.availability === "out_of_stock" && "在庫なし"}
            {offer.availability === "unknown" && (
              <Unknown>このアプリでは確認していません</Unknown>
            )}
          </p>
          <p className="mt-1 text-[11px] text-sumi/50">
            この内容を組み立てた時刻：
            {new Date(offer.checkedAt).toLocaleString("ja-JP")}
            <br />
            価格の公式突合：
            {offer.priceSourceCheckedAt ?? "未実施（編集時点の参考価格）"}
          </p>
        </div>

        {/* 選定理由 */}
        <div>
          <p className="chigiri-label">これを選んだ理由</p>
          <p className="mt-1 text-xs leading-relaxed text-sumi/75">
            {row.reason ?? row.notChosenReason}
          </p>
        </div>

        {/* 他候補を選ばなかった理由 */}
        {otherRows.length > 0 && (
          <div>
            <p className="chigiri-label">他の候補を選ばなかった理由</p>
            <ul className="mt-1 space-y-1.5">
              {otherRows.map((o) => (
                <li key={o.offer.offerId} className="text-xs leading-relaxed">
                  <span className="text-sumi/70">
                    {o.brand} {o.productName}（
                    {o.offer.price.toLocaleString()}円）
                  </span>
                  <br />
                  <span className="text-sumi/55">{o.notChosenReason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 手持ちとの重複 */}
        <div>
          <p className="chigiri-label">手持ちとの重複</p>
          <p className="mt-1 text-xs leading-relaxed text-sumi/70">
            {duplicateNote ??
              "手持ちの商品と役割が重複していないことを確認しました。"}
          </p>
        </div>

        {/* 返品・キャンセル */}
        <div>
          <p className="chigiri-label">返品・キャンセル条件</p>
          {offer.returnPolicyUrl ? (
            <a
              href={offer.returnPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-ai underline underline-offset-2"
            >
              販売者の返品・キャンセル条件を開く
            </a>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-sumi/70">
              <Unknown>このアプリでは確認していません</Unknown>
              。購入前に販売サイトの記載をご確認ください。
            </p>
          )}
        </div>

        {/* 未確認項目の明示と同意 */}
        {hasUnverified && (
          <div className="rounded-xl border border-sakura/35 bg-sakuraSoft/40 p-3.5">
            <p className="text-xs font-medium text-sakura">
              確認できていない項目があります
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-sumi/75">
              {offer.unverified.map((u) => (
                <li key={u}>{UNVERIFIED_LABEL[u]}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] leading-relaxed text-sumi/60">
              分からない項目を推測で埋めていません。実際の価格・在庫・送料・返品条件は、
              移動先の販売ページの表示が正です。
            </p>
            <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-ai"
              />
              <span>
                上の未確認項目を理解したうえで、販売ページで自分で確認します
              </span>
            </label>
          </div>
        )}

        {/* 検証で止まった場合 */}
        {validation && !validation.valid && (
          <div className="rounded-xl border border-sakura/50 bg-sakuraSoft/60 p-3.5">
            <p className="text-xs font-medium text-sakura">
              承認を中止しました
            </p>
            <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-sumi/75">
              {validation.blockers.map((b) => (
                <li key={b}>{BLOCKER_MESSAGE[b]}</li>
              ))}
              {validation.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-sakura/40 bg-sakuraSoft/50 px-3 py-2.5 text-xs leading-relaxed">
            {error}
          </p>
        )}

        {/* 外部遷移の明示 */}
        <p className="rounded-lg bg-kinari px-3 py-2.5 text-[11px] leading-relaxed text-sumi/65">
          承認すると、CHIGIRI Beauty から
          <span className="font-medium text-sumi/85">
            {" "}
            {offer.merchantName}{" "}
          </span>
          へ移動します。移動先での購入手続き・決済・個人情報の入力は、すべて移動先のサイトで行われます。
          CHIGIRI Beauty はカード情報を受け取らず、保存もしません。
        </p>

        {/* 操作 */}
        <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
          <button
            type="button"
            disabled={pending || (hasUnverified && !acknowledged)}
            onClick={() => onApprove(acknowledged)}
            className="flex-1 rounded-xl bg-ai px-5 py-3.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? "確認しています…" : "承認して購入先へ進む"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onDecline}
            className="flex-1 rounded-xl border border-matcha/40 bg-matchaSoft/60 px-5 py-3.5 text-sm font-medium text-matcha disabled:opacity-40"
          >
            今回は買わない
          </button>
        </div>
        <p className="text-center text-[11px] text-sumi/45">
          「買わない」も正しい結論です。記録して、次の提案に活かします。
        </p>
      </div>
    </section>
  );
}

/** 承認後: 引き継ぎリンクの最終提示 */
function HandoffReady({ handoff }: { handoff: PurchaseHandoff }) {
  return (
    <section className="chigiri-card p-5">
      <p className="chigiri-label">承認を受け付けました</p>
      <h2 className="mt-1 text-base font-semibold">
        {handoff.merchantName}へのリンクを発行しました
      </h2>

      <dl className="mt-3 space-y-1 rounded-xl bg-kinari/70 p-3.5 text-xs">
        <Row label="遷移先">
          <span className="font-mono text-[11px]">{handoff.merchantHost}</span>
        </Row>
        <Row label="有効期限">
          {new Date(handoff.expiresAt).toLocaleTimeString("ja-JP")}まで
        </Row>
        <Row label="使用回数">1回のみ</Row>
      </dl>

      <a
        href={handoff.handoffUrl}
        rel="noopener noreferrer"
        className="mt-4 block rounded-xl bg-ai px-5 py-3.5 text-center text-sm font-medium text-white"
      >
        {handoff.merchantName}へ移動する
      </a>

      <p className="mt-3 text-[11px] leading-relaxed text-sumi/55">
        このリンクは署名付きで、有効期限を過ぎるか一度使うと無効になります。
        期限が切れた場合は、価格と在庫を確認し直すため、もう一度承認してください。
      </p>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-0.5">
      <dt className="shrink-0 text-sumi/60">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Unknown({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sumi/60">
      <span className="rounded bg-beige/70 px-1.5 py-0.5 text-[11px]">未確認</span>{" "}
      {children}
    </span>
  );
}

const BLOCKER_MESSAGE: Record<OfferValidation["blockers"][number], string> = {
  unknown_offer: "この候補を特定できませんでした。もう一度候補を出し直してください。",
  out_of_stock: "在庫が確認できないため、承認を中止しました。",
  price_changed:
    "表示していた価格と最新の価格が一致しませんでした。内容を確認し直してください。",
  over_budget: "設定した予算を超えるため、承認を中止しました。",
  hard_filter_violation:
    "避けたい条件に当てはまるため、承認を中止しました。",
  url_not_allowed:
    "遷移先が許可リストに含まれていないため、承認を中止しました。",
  already_owned: "すでに手持ちに登録されている商品のため、承認を中止しました。",
};
