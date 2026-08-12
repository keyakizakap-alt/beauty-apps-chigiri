import { notFound } from "next/navigation";
import { opsVisible } from "@/lib/ops-visibility";
import Client from "./OpsClient";

/**
 * 運用者向けの画面。
 * CHIGIRI_OPS=1 のときだけ配信する。既定では存在しないものとして扱う。
 */
export const dynamic = "force-dynamic";

export default function Page() {
  if (!opsVisible()) notFound();
  return <Client />;
}
