"use client";

import { useCallback, useRef, useState } from "react";

/**
 * 写真で手持ちを登録する。
 *
 * 端末側で必ず縮小してから送る。撮影したままの画像は数MBあり、
 * 通信量も読み取り費用も無駄に大きくなるため。
 *
 * 画像はサーバーに保存しない。読み取りが終われば捨てる。
 * 外部AIの利用に同意していない場合は送信せず、その旨を伝える。
 */

export type Identified = {
  productId: string;
  brand: string;
  name: string;
  source: string;
};

type Result = {
  identified: Identified[];
  unmatched: string[];
  available: boolean;
  reason: string | null;
  message: string | null;
};

/** 長辺の上限。文字が読めればよいので、これ以上は要らない。 */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.72;

async function downscale(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("読み込めませんでした"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を開けませんでした"));
    img.src = dataUrl;
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export default function PhotoCapture({
  allowExternalAi,
  onIdentified,
  onCancel,
}: {
  allowExternalAi: boolean;
  onIdentified: (products: Identified[]) => void;
  onCancel?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setBusy(true);
      try {
        const image = await downscale(file);
        setPreview(image);

        const res = await fetch("/api/vision/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, allowExternalAi }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "読み取りに失敗しました");
        setResult(json as Result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み取りに失敗しました");
      } finally {
        setBusy(false);
      }
    },
    [allowExternalAi],
  );

  return (
    <section className="chigiri-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">写真から登録する</h3>
          <p className="mt-1 text-xs leading-relaxed text-sumi/60">
            商品のパッケージやボトルが正面から入るように撮ってください。
            並べて何点か一緒に写しても大丈夫です。
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg border border-beige bg-white px-2.5 py-1 text-xs text-sumi/60"
          >
            閉じる
          </button>
        )}
      </div>

      {!allowExternalAi && (
        <p className="mt-3 rounded-lg bg-kinari px-3 py-2.5 text-[11px] leading-relaxed text-sumi/70">
          写真の読み取りには外部のAIを使います。いまは「端末内だけ」の設定なので、
          送信せずに一覧から選ぶ方法をおすすめします。
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl bg-ai px-4 py-2.5 text-sm text-white disabled:opacity-40"
        >
          {busy ? "読み取っています…" : "写真を撮る・選ぶ"}
        </button>
      </div>

      {preview && (
        <div className="mt-3 flex items-start gap-3">
          {/* 送った画像がその場で分かるように出す（保存はしない） */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="撮影した写真"
            className="h-20 w-20 rounded-lg border border-beige object-cover"
          />
          <p className="flex-1 text-[11px] leading-relaxed text-sumi/50">
            この写真は保存していません。読み取りが終わると消えます。
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-sakura/40 bg-sakuraSoft/50 px-3 py-2 text-xs">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-2">
          {result.identified.length > 0 ? (
            <>
              <p className="text-xs font-medium">
                {result.identified.length}点、見つかりました
              </p>
              <ul className="space-y-1.5">
                {result.identified.map((p) => (
                  <li
                    key={p.productId}
                    className="rounded-lg border border-beige bg-white px-3 py-2"
                  >
                    <p className="text-xs text-sumi/55">{p.brand}</p>
                    <p className="text-sm leading-snug">{p.name}</p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onIdentified(result.identified)}
                className="w-full rounded-xl bg-ai px-4 py-2.5 text-sm text-white"
              >
                この{result.identified.length}点を手持ちに追加する
              </button>
            </>
          ) : (
            <p className="rounded-lg bg-kinari px-3 py-2.5 text-xs leading-relaxed text-sumi/70">
              {result.message ?? "見つかりませんでした。"}
            </p>
          )}

          {result.unmatched.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[11px] text-sumi/50">
                読み取れたけれど見つからなかったもの（{result.unmatched.length}）
              </summary>
              <ul className="mt-1 space-y-0.5">
                {result.unmatched.map((t) => (
                  <li key={t} className="text-[11px] text-sumi/50">
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] leading-relaxed text-sumi/45">
                いまのカタログは46点に限っています。近いものを一覧から選んでください。
              </p>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
