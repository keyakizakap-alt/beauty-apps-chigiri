"use client";

import { useEffect, useState } from "react";

/**
 * アプリを開いたときのオープニング。
 *
 * 設計上の注意:
 * - フェードアウトは CSS アニメーション（fill-mode: forwards）で行う。
 *   JS が動かない環境でもオーバーレイが居座って操作を塞がないようにするため。
 *   JS の役割は「2回目以降は出さない」「終わったら DOM から外す」だけ。
 * - サーバーとクライアントで同じマークアップを返す（初期状態は必ず表示）。
 *   sessionStorage を描画中に読むと hydration がずれるため、判定は effect で行う。
 * - 装飾なので aria-hidden。読み上げは本文から始まる。
 * - prefers-reduced-motion では拡大・移動を行わない（CSS 側で分岐）。
 */

const SEEN_KEY = "chigiri.splash.seen";

/** CSS 側のアニメーション（遅延 + 再生時間）と合わせる */
const TOTAL_MS = 1600;

export default function AppSplash() {
  const [phase, setPhase] = useState<"showing" | "skipped" | "done">("showing");

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // プライベートモードなどで読めない場合は、毎回表示して構わない
    }

    if (seen) {
      setPhase("skipped");
      return;
    }

    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* 保存できなくても表示は続行できる */
    }

    const timer = window.setTimeout(() => setPhase("done"), TOTAL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (phase !== "showing") return null;

  return (
    <div className="chigiri-splash" aria-hidden="true">
      <div className="chigiri-splash-inner">
        <ChigiriMark />
        <p className="chigiri-splash-name">CHIGIRI Beauty</p>
        <p className="chigiri-splash-tagline">買う前に、今あるものをつなぐ。</p>
      </div>
    </div>
  );
}

/**
 * アイコンと同じ意匠のマーク（重なり合う2つの輪）。
 * app/icon.svg を img で読むのではなくインラインで描くのは、
 * 起動直後に追加のリクエストを挟まず、必ず一緒に描画されるようにするため。
 */
export function ChigiriMark({ size = 88 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="CHIGIRI Beauty"
    >
      <defs>
        <clipPath id="chigiri-splash-lens">
          <circle cx="198" cy="258" r="106" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="114" fill="#26415E" />
      <g clipPath="url(#chigiri-splash-lens)">
        <circle cx="314" cy="258" r="106" fill="#C98B92" />
      </g>
      <g fill="none" stroke="#F5F1E9" strokeWidth="38" strokeLinecap="round">
        <circle cx="198" cy="258" r="106" />
        <circle cx="314" cy="258" r="106" />
      </g>
    </svg>
  );
}
