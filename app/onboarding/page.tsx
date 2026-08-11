"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProfileForm from "@/components/ProfileForm";
import { useProfile } from "@/lib/storage";

export default function OnboardingPage() {
  const { profile, setProfile, hydrated } = useProfile();
  const router = useRouter();

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <nav className="mb-5 text-xs text-ink/50">
        <Link href="/" className="underline underline-offset-2">
          CHIGIRI Beauty
        </Link>
        <span className="mx-1.5">/</span>
        <span>条件の入力</span>
      </nav>

      <h1 className="text-xl font-semibold">あなたの条件を教えてください</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
        ここで入力した内容は、ブラウザの中だけに保存されます。サーバーには保存しません。
      </p>

      <div className="mt-6">
        {hydrated ? (
          <ProfileForm profile={profile} onChange={setProfile} />
        ) : (
          <p className="text-sm text-ink/50">読み込んでいます…</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => router.push("/inventory")}
        className="mt-8 w-full rounded-xl bg-forest px-5 py-3.5 text-sm font-medium text-white"
      >
        手持ちの化粧品を選ぶ
      </button>
    </main>
  );
}
