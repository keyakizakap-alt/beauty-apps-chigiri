import { Suspense } from "react";
import ApproveClient from "./ApproveClient";

export const metadata = {
  title: "購入前の確認 — CHIGIRI Beauty",
};

export default function ApprovePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-4 py-10">
          <p className="text-sm text-sumi/50">読み込んでいます…</p>
        </main>
      }
    >
      <ApproveClient />
    </Suspense>
  );
}
