"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { CategorySchema } from "@/schemas/product";

/**
 * 「買わなかった記録」と使用後フィードバック（パーソナル美容グラフの入口）。
 *
 * プライバシー方針:
 * - 保存先は利用者の端末（localStorage）だけ。サーバーへは送らない。
 * - 記録は明示的な同意を得てから開始する（consent=false の間は何も書かない）。
 * - いつでも全消去できる。
 * - 肌の悩み・アレルギーなど機微な情報はここに入れない。
 *   記録するのは「どの役割の商品を、買ったか／見送ったか／続いたか」だけ。
 */

const KEY = "chigiri.ledger.v1";

export const LedgerEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.enum(["declined", "approved", "no_purchase_needed"]),
  category: CategorySchema,
  productId: z.string().nullable(),
  /** 見送った場合は「使わずに済んだ金額」、承認した場合は支出額 */
  priceYen: z.number().int().nonnegative().nullable(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const FollowupSchema = z.object({
  productId: z.string(),
  at: z.string(),
  /** 使い続けられたか */
  outcome: z.enum(["continuing", "stopped", "unopened"]),
});
export type Followup = z.infer<typeof FollowupSchema>;

export const LedgerSchema = z.object({
  consent: z.boolean().default(false),
  entries: z.array(LedgerEntrySchema).max(500).default([]),
  followups: z.array(FollowupSchema).max(500).default([]),
});
export type Ledger = z.infer<typeof LedgerSchema>;

export const EMPTY_LEDGER: Ledger = {
  consent: false,
  entries: [],
  followups: [],
};

export function loadLedger(): Ledger {
  if (typeof window === "undefined") return EMPTY_LEDGER;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_LEDGER;
    const parsed = LedgerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_LEDGER;
  } catch {
    return EMPTY_LEDGER;
  }
}

function persist(ledger: Ledger): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ledger));
  } catch {
    // 保存できなくても操作は続行できる
  }
}

export type LedgerSummary = {
  declinedCount: number;
  declinedYen: number;
  approvedCount: number;
  approvedYen: number;
  noPurchaseCount: number;
  /** 買った商品のうち「続いている」と答えた割合 */
  continuationRate: number | null;
};

export function summarize(ledger: Ledger): LedgerSummary {
  const declined = ledger.entries.filter((e) => e.kind === "declined");
  const approved = ledger.entries.filter((e) => e.kind === "approved");
  const noPurchase = ledger.entries.filter(
    (e) => e.kind === "no_purchase_needed",
  );

  // 同じ商品に複数回答えた場合は最新のものだけを見る
  const latest = new Map<string, Followup>();
  for (const f of ledger.followups) {
    const prev = latest.get(f.productId);
    if (!prev || prev.at < f.at) latest.set(f.productId, f);
  }
  const answers = [...latest.values()];
  const continuing = answers.filter((f) => f.outcome === "continuing").length;

  return {
    declinedCount: declined.length,
    declinedYen: declined.reduce((s, e) => s + (e.priceYen ?? 0), 0),
    approvedCount: approved.length,
    approvedYen: approved.reduce((s, e) => s + (e.priceYen ?? 0), 0),
    noPurchaseCount: noPurchase.length,
    continuationRate:
      answers.length === 0
        ? null
        : Math.round((continuing / answers.length) * 100) / 100,
  };
}

/** 過去に「続かなかった」と答えた商品 ID */
export function stoppedProductIds(ledger: Ledger): Set<string> {
  const latest = new Map<string, Followup>();
  for (const f of ledger.followups) {
    const prev = latest.get(f.productId);
    if (!prev || prev.at < f.at) latest.set(f.productId, f);
  }
  return new Set(
    [...latest.values()]
      .filter((f) => f.outcome === "stopped")
      .map((f) => f.productId),
  );
}

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function useLedger() {
  const [ledger, setLedger] = useState<Ledger>(EMPTY_LEDGER);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLedger(loadLedger());
    setHydrated(true);
  }, []);

  const update = useCallback((fn: (prev: Ledger) => Ledger) => {
    setLedger((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, []);

  const setConsent = useCallback(
    (consent: boolean) => {
      update((prev) =>
        // 同意を取り消したら、それまでの記録も残さない
        consent ? { ...prev, consent } : { ...EMPTY_LEDGER, consent: false },
      );
    },
    [update],
  );

  const record = useCallback(
    (entry: Omit<LedgerEntry, "id" | "at">) => {
      update((prev) => {
        if (!prev.consent) return prev;
        const entries = [
          ...prev.entries,
          { ...entry, id: nextId(), at: new Date().toISOString() },
        ].slice(-500);
        return { ...prev, entries };
      });
    },
    [update],
  );

  const recordFollowup = useCallback(
    (productId: string, outcome: Followup["outcome"]) => {
      update((prev) => {
        if (!prev.consent) return prev;
        const followups = [
          ...prev.followups,
          { productId, outcome, at: new Date().toISOString() },
        ].slice(-500);
        return { ...prev, followups };
      });
    },
    [update],
  );

  const clearAll = useCallback(() => {
    update(() => EMPTY_LEDGER);
  }, [update]);

  return {
    ledger,
    hydrated,
    summary: summarize(ledger),
    setConsent,
    record,
    recordFollowup,
    clearAll,
  };
}
