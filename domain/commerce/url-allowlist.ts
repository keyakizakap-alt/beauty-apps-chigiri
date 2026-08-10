import type { Merchant } from "@/schemas/commerce";
import { merchantForHost } from "./merchants";

/**
 * 外部遷移先 URL の検証。
 *
 * このモジュールが唯一の判定点であり、外部へリダイレクトするコードは
 * 必ずここを通す。クライアントから受け取った文字列をそのまま
 * Location ヘッダーへ入れることは、どの経路でも行わない。
 *
 * 落とす条件:
 * - https 以外のスキーム（javascript:, data:, http: など）
 * - 許可リストに無いホスト、接尾辞だけが一致するホスト
 * - ユーザー情報付き URL（https://www.kao.co.jp@evil.example/ 対策）
 * - 443 以外のポート
 * - 制御文字・空白類を含む URL
 */

export type UrlCheck =
  | { ok: true; url: URL; merchant: Merchant }
  | { ok: false; reason: UrlRejectReason };

export type UrlRejectReason =
  | "malformed"
  | "control_characters"
  | "not_https"
  | "has_credentials"
  | "non_default_port"
  | "host_not_allowed";

/**
 * 制御文字・空白類。
 * URL パーサーが黙って除去・正規化する文字があるため、パース前に落とす。
 */
const CONTROL_OR_SPACE =
  /[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u2060-\u2064\u2066-\u206f\u3000\ufeff]/;

export function checkExternalUrl(raw: string): UrlCheck {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    return { ok: false, reason: "malformed" };
  }
  if (CONTROL_OR_SPACE.test(raw)) {
    return { ok: false, reason: "control_characters" };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "has_credentials" };
  }
  if (url.port !== "" && url.port !== "443") {
    return { ok: false, reason: "non_default_port" };
  }

  const merchant = merchantForHost(url.hostname);
  if (!merchant) return { ok: false, reason: "host_not_allowed" };

  return { ok: true, url, merchant };
}

export function isAllowedExternalUrl(raw: string): boolean {
  return checkExternalUrl(raw).ok;
}

export const URL_REJECT_MESSAGE: Record<UrlRejectReason, string> = {
  malformed: "遷移先の形式が正しくありません",
  control_characters: "遷移先に使用できない文字が含まれています",
  not_https: "https 以外の遷移先は許可していません",
  has_credentials: "認証情報付きの URL は許可していません",
  non_default_port: "標準以外のポートへの遷移は許可していません",
  host_not_allowed: "許可リストにない販売サイトへは遷移できません",
};
