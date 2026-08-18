import "server-only";
import {
  MEDIA_IMAGE_HOSTS,
  RakutenSearchResponseSchema,
  firstImageUrl,
  unwrapRakutenItem,
  type ProductMedia,
} from "@/schemas/media";
import { throttle } from "./cache";

/**
 * 楽天商品検索API クライアント。
 *
 * 鍵はサーバー側にのみ置く。クライアントへは解決済みの画像URLだけを返す。
 *
 * 照会は itemCode か JAN のどちらかが分かっているときだけ行う。
 * キーワード検索は同名・類似名の別商品を拾うため、表示用には使わない
 * （候補を人が選ぶための scripts/media-find.mjs でのみ使う）。
 *
 * NOTE: 応答の形は仕様変更で変わりうる。Zod に通し、合わなければ
 * 「引けなかった」として null を返す。推測で補完しない。
 */

const ENDPOINT =
  "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";

export function isRakutenConfigured(): boolean {
  return Boolean(process.env.RAKUTEN_APP_ID);
}

function timeoutMs(): number {
  const v = Number(process.env.MEDIA_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 8000;
}

/**
 * 楽天のサムネイルURLは `?_ex=128x128` で寸法を指定する。
 * 一覧の最大表示が96pxなので、高解像度画面を考えて300pxを要求する。
 */
function upscaleThumb(url: string): string {
  return url.replace(/([?&])_ex=\d+x\d+/, "$1_ex=300x300");
}

function isAllowedImageHost(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return MEDIA_IMAGE_HOSTS.rakuten.includes(u.hostname);
  } catch {
    return false;
  }
}

export type RakutenQuery = { itemCode?: string; jan?: string };

/**
 * 1商品を照会する。見つからない・形が違う・許可外ホストの画像なら null。
 * 例外は投げない（呼び出し側が図案へ落とせるようにするため）。
 */
export async function fetchRakutenMedia(
  productId: string,
  query: RakutenQuery,
): Promise<ProductMedia | null> {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) return null;
  if (!query.itemCode && !query.jan) return null;

  const params = new URLSearchParams({
    applicationId: appId,
    format: "json",
    formatVersion: "2",
    hits: "1",
    imageFlag: "1",
  });
  if (query.itemCode) params.set("itemCode", query.itemCode);
  else if (query.jan) params.set("isbnjan", query.jan);

  const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;
  if (affiliateId) params.set("affiliateId", affiliateId);

  const json = await throttle("rakuten", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    try {
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
        signal: controller.signal,
        // 保持はこちらのキャッシュ層で管理する
        cache: "no-store",
      });
      if (!res.ok) return null;
      return (await res.json()) as unknown;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });

  if (json === null) return null;

  const parsed = RakutenSearchResponseSchema.safeParse(json);
  if (!parsed.success) return null;

  const entries = parsed.data.Items ?? [];
  if (entries.length === 0) return null;

  const item = unwrapRakutenItem(entries[0]);

  const raw =
    firstImageUrl(item.largeImageUrls) ?? firstImageUrl(item.mediumImageUrls);
  if (!raw) return null;

  const imageUrl = upscaleThumb(raw);
  if (!isAllowedImageHost(imageUrl)) return null;

  const link = item.affiliateUrl || item.itemUrl || null;

  return {
    productId,
    provider: "rakuten",
    imageUrl,
    // 実寸は応答に含まれないため推測しない
    width: null,
    height: null,
    linkUrl: link && /^https:\/\//.test(link) ? link : null,
    priceYen:
      typeof item.itemPrice === "number" && Number.isFinite(item.itemPrice)
        ? Math.round(item.itemPrice)
        : null,
    fetchedAt: new Date().toISOString(),
  };
}
