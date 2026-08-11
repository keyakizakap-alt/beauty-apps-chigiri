"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductSelector from "@/components/ProductSelector";
import { markStated } from "@/schemas/profile";
import { useProfile } from "@/lib/storage";

export default function InventoryPage() {
  const { profile, setProfile, hydrated } = useProfile();
  const router = useRouter();

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <nav className="mb-5 text-xs text-sumi/50">
        <Link href="/" className="underline underline-offset-2">
          CHIGIRI Beauty
        </Link>
        <span className="mx-1.5">/</span>
        <Link href="/onboarding" className="underline underline-offset-2">
          条件の入力
        </Link>
        <span className="mx-1.5">/</span>
        <span>手持ちの化粧品</span>
      </nav>

      <h1 className="text-xl font-semibold">いま持っている化粧品を選んでください</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-sumi/65">
        使い切っていないものをすべて選んでください。使っていないものも含めて構いません。
        重複している役割はこちらで検出します。
      </p>

      <div className="mt-6">
        {hydrated ? (
          <ProductSelector
            domain={profile.domain}
            selectedIds={profile.ownedProductIds}
            onToggle={(id) =>
              setProfile(
                markStated(
                  {
                    ...profile,
                    ownedProductIds: profile.ownedProductIds.includes(id)
                      ? profile.ownedProductIds.filter((x) => x !== id)
                      : [...profile.ownedProductIds, id],
                  },
                  "ownedProductIds",
                ),
              )
            }
          />
        ) : (
          <p className="text-sm text-sumi/50">読み込んでいます…</p>
        )}
      </div>

      <button
        type="button"
        disabled={profile.ownedProductIds.length === 0}
        onClick={() => router.push("/result")}
        className="mt-8 w-full rounded-xl bg-ai px-5 py-3.5 text-sm font-medium text-white disabled:opacity-40"
      >
        ルーティンを組み立てる
      </button>
      {profile.ownedProductIds.length === 0 && (
        <p className="mt-2 text-center text-xs text-sumi/50">
          1点以上選ぶと進めます
        </p>
      )}
    </main>
  );
}
