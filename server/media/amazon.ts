import "server-only";
import { createHash, createHmac } from "node:crypto";
import {
  AmazonGetItemsResponseSchema,
  MEDIA_IMAGE_HOSTS,
  type ProductMedia,
} from "@/schemas/media";
import { throttle } from "./cache";

/**
 * Amazon Product Advertising API v5 クライアント（GetItems のみ）。
 *
 * 鍵はサーバー側にのみ置く。クライアントへは解決済みの画像URLだけを返す。
 * 照会は ASIN が分かっているものだけ。検索結果の自動採用はしない。
 *
 * 利用の前提（コードでは満たせない条件）:
 * - Amazon アソシエイト・プログラムの承認済みアカウントが要る
 * - 一定期間内に適格販売がないと PA-API の利用資格が失われる
 * - 取得した情報の長期保存は認められていない（cache.ts で 24 時間を上限にしている）
 * - 表示にはアソシエイトタグ付きリンクと帰属表記が要る
 *
 * NOTE: 応答の形は仕様変更で変わりうる。Zod に通し、合わなければ
 * 「引けなかった」として扱う。推測で補完しない。
 */

const SERVICE = "ProductAdvertisingAPI";
const TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";
const PATH = "/paapi5/getitems";

/** 取り扱う市場。既定は日本 */
function marketplace(): { host: string; region: string; site: string } {
  const site = process.env.AMAZON_MARKETPLACE ?? "www.amazon.co.jp";
  if (site === "www.amazon.com") {
    return { host: "webservices.amazon.com", region: "us-east-1", site };
  }
  return { host: "webservices.amazon.co.jp", region: "us-west-2", site };
}

export function isAmazonConfigured(): boolean {
  return Boolean(
    process.env.AMAZON_ACCESS_KEY &&
      process.env.AMAZON_SECRET_KEY &&
      process.env.AMAZON_PARTNER_TAG,
  );
}

function timeoutMs(): number {
  const v = Number(process.env.MEDIA_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 8000;
}

const sha256 = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");

const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data, "utf8").digest();

/** SigV4 の署名鍵を日付・リージョン・サービスから導出する */
function signingKey(
  secret: string,
  dateStamp: string,
  region: string,
): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

/**
 * SigV4 の Authorization ヘッダーを組み立てる。
 * 署名対象のヘッダーは名前を小文字にして辞書順に並べる必要がある。
 */
export function buildAuthorization(args: {
  accessKey: string;
  secretKey: string;
  region: string;
  host: string;
  payload: string;
  amzDate: string; // YYYYMMDDTHHMMSSZ
}): string {
  const { accessKey, secretKey, region, host, payload, amzDate } = args;
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${TARGET}\n`;
  const signedHeaders = "content-encoding;host;x-amz-date;x-amz-target";

  const canonicalRequest = [
    "POST",
    PATH,
    "", // クエリ文字列は使わない
    canonicalHeaders,
    signedHeaders,
    sha256(payload),
  ].join("\n");

  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(secretKey, dateStamp, region),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return (
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}

/** ISO 8601 の basic 形式（記号を落としたもの） */
export function amzDateNow(now: Date = new Date()): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function isAllowedImageHost(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return MEDIA_IMAGE_HOSTS.amazon.includes(u.hostname);
  } catch {
    return false;
  }
}

/** GetItems が一度に受け付ける上限 */
export const AMAZON_BATCH_SIZE = 10;

/**
 * ASIN をまとめて照会する（最大10件）。
 * 引けなかったものは結果に含めない。例外は投げない。
 *
 * @param asinToProductId ASIN からカタログの商品 id を引くための対応表
 */
export async function fetchAmazonMedia(
  asinToProductId: ReadonlyMap<string, string>,
): Promise<ProductMedia[]> {
  const accessKey = process.env.AMAZON_ACCESS_KEY;
  const secretKey = process.env.AMAZON_SECRET_KEY;
  const partnerTag = process.env.AMAZON_PARTNER_TAG;
  if (!accessKey || !secretKey || !partnerTag) return [];

  const asins = [...asinToProductId.keys()].slice(0, AMAZON_BATCH_SIZE);
  if (asins.length === 0) return [];

  const { host, region, site } = marketplace();
  const payload = JSON.stringify({
    ItemIds: asins,
    Resources: ["Images.Primary.Large", "Offers.Listings.Price"],
    PartnerTag: partnerTag,
    PartnerType: "Associates",
    Marketplace: site,
  });

  const amzDate = amzDateNow();
  const authorization = buildAuthorization({
    accessKey,
    secretKey,
    region,
    host,
    payload,
    amzDate,
  });

  const json = await throttle("amazon", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    try {
      const res = await fetch(`https://${host}${PATH}`, {
        method: "POST",
        headers: {
          "content-encoding": "amz-1.0",
          "content-type": "application/json; charset=utf-8",
          "x-amz-date": amzDate,
          "x-amz-target": TARGET,
          authorization,
        },
        body: payload,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return (await res.json()) as unknown;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });

  if (json === null) return [];

  const parsed = AmazonGetItemsResponseSchema.safeParse(json);
  if (!parsed.success) return [];

  const items = parsed.data.ItemsResult?.Items ?? [];
  const fetchedAt = new Date().toISOString();
  const out: ProductMedia[] = [];

  for (const item of items) {
    const productId = asinToProductId.get(item.ASIN);
    if (!productId) continue;

    const image = item.Images?.Primary?.Large ?? item.Images?.Primary?.Medium;
    if (!image || !isAllowedImageHost(image.URL)) continue;

    const amount = item.Offers?.Listings?.[0]?.Price?.Amount;
    const link = item.DetailPageURL;

    out.push({
      productId,
      provider: "amazon",
      imageUrl: image.URL,
      width: image.Width ?? null,
      height: image.Height ?? null,
      linkUrl: link && /^https:\/\//.test(link) ? link : null,
      priceYen:
        typeof amount === "number" && Number.isFinite(amount)
          ? Math.round(amount)
          : null,
      fetchedAt,
    });
  }

  return out;
}
