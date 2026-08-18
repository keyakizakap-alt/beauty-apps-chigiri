import { z } from "zod";

/**
 * 商品写真を外部サービスから引くための型。
 *
 * 方針:
 * - 画像は各社の CDN から配信する（自分の配信元に保存しない）。
 *   楽天も Amazon も、取得した素材の長期保存を認めていないため。
 * - どのサービスの、いつ取得した情報かを必ず持つ。
 *   出典を言えない画像は表示しない。
 * - 同一商品であることが識別子で確定しているものだけを引く。
 *   キーワード検索の結果を自動採用しない。
 */

export const MediaProviderSchema = z.enum(["rakuten", "amazon"]);
export type MediaProvider = z.infer<typeof MediaProviderSchema>;

/** 画像を配信してよいホスト。CSP の img-src と対応させる。 */
export const MEDIA_IMAGE_HOSTS: Record<MediaProvider, readonly string[]> = {
  rakuten: ["thumbnail.image.rakuten.co.jp", "image.rakuten.co.jp"],
  amazon: ["m.media-amazon.com", "images-na.ssl-images-amazon.com"],
};

export const ALL_MEDIA_IMAGE_HOSTS: readonly string[] = Object.values(
  MEDIA_IMAGE_HOSTS,
).flat();

/** 提携プログラムが表示を求める帰属表記 */
export const PROVIDER_ATTRIBUTION: Record<MediaProvider, string> = {
  rakuten: "画像・価格は楽天市場の提供です",
  amazon: "画像・価格は Amazon.co.jp の提供です",
};

/**
 * https の URL であることを確かめる。
 *
 * z.string().url() は `javascript:` も通してしまう。imageUrl はまだしも
 * linkUrl はリンクの href に入るため、スキーマの段階で落とす。
 */
const httpsUrl = () =>
  z.string().url().refine(
    (v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "https の URL である必要があります" },
  );

/** 画像は許可した提供元のホストからのみ受け付ける（CSP と二重にする） */
const mediaImageUrl = () =>
  httpsUrl().refine(
    (v) => {
      try {
        return ALL_MEDIA_IMAGE_HOSTS.includes(new URL(v).hostname);
      } catch {
        return false;
      }
    },
    { message: "許可していない画像配信元です" },
  );

export const ProductMediaSchema = z.object({
  productId: z.string().min(1),
  provider: MediaProviderSchema,
  /** 商品画像の URL。許可ホスト以外は解決の時点で捨てる */
  imageUrl: mediaImageUrl(),
  /** 画像の実寸がわかる場合のみ。わからなければ null（推測しない） */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  /** 提携リンク。プログラムの規約で表示が必要になる */
  linkUrl: httpsUrl().nullable(),
  /** 参考価格。取れなければ null。カタログの価格は上書きしない */
  priceYen: z.number().int().nonnegative().nullable(),
  /** 取得時刻(ISO)。古くなったものを黙って使い続けないため */
  fetchedAt: z.string(),
});
export type ProductMedia = z.infer<typeof ProductMediaSchema>;

export const ProductMediaResponseSchema = z.object({
  /** 引けたものだけ入る。引けなかった商品は単に含まれない */
  media: z.array(ProductMediaSchema),
  /** 外部APIの鍵が設定されていない場合に true。UI は図案のままにする */
  disabled: z.boolean(),
});
export type ProductMediaResponse = z.infer<typeof ProductMediaResponseSchema>;

export const ProductMediaRequestSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(30),
});

/* ------------------------------------------------------------------ *
 * 各サービスの応答
 *
 * NOTE: 応答の形は各サービスの仕様変更で変わりうる。ここで Zod を通し、
 * 合わなければ「引けなかった」として扱う。推測で補完しない。
 * ------------------------------------------------------------------ */

/** 楽天商品検索API の 1 件分 */
export const RakutenItemFieldsSchema = z.object({
  itemName: z.string(),
  itemCode: z.string(),
  itemPrice: z.number().nullable().optional(),
  itemUrl: z.string().optional(),
  affiliateUrl: z.string().optional(),
  mediumImageUrls: z
    .array(z.union([z.string(), z.object({ imageUrl: z.string() })]))
    .optional(),
  largeImageUrls: z
    .array(z.union([z.string(), z.object({ imageUrl: z.string() })]))
    .optional(),
});

/**
 * バージョンによって Items の中身が { Item: {...} } で包まれる場合と
 * そのまま並ぶ場合がある。どちらでも読めるようにしておく。
 */
export const RakutenSearchResponseSchema = z.object({
  Items: z
    .array(
      z.union([
        z.object({ Item: RakutenItemFieldsSchema }),
        RakutenItemFieldsSchema,
      ]),
    )
    .optional(),
});

export type RakutenItemFields = z.infer<typeof RakutenItemFieldsSchema>;

export function unwrapRakutenItem(
  entry: { Item: RakutenItemFields } | RakutenItemFields,
): RakutenItemFields {
  return "Item" in entry ? entry.Item : entry;
}

/** 画像URLの配列は文字列とオブジェクトのどちらでも来うる */
export function firstImageUrl(
  urls: Array<string | { imageUrl: string }> | undefined,
): string | null {
  if (!urls || urls.length === 0) return null;
  const first = urls[0];
  const raw = typeof first === "string" ? first : first.imageUrl;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** PA-API v5 GetItems の応答（使う部分だけ） */
export const AmazonGetItemsResponseSchema = z.object({
  ItemsResult: z
    .object({
      Items: z
        .array(
          z.object({
            ASIN: z.string(),
            DetailPageURL: z.string().optional(),
            Images: z
              .object({
                Primary: z
                  .object({
                    Large: z
                      .object({
                        URL: z.string(),
                        Width: z.number().optional(),
                        Height: z.number().optional(),
                      })
                      .optional(),
                    Medium: z
                      .object({
                        URL: z.string(),
                        Width: z.number().optional(),
                        Height: z.number().optional(),
                      })
                      .optional(),
                  })
                  .optional(),
              })
              .optional(),
            Offers: z
              .object({
                Listings: z
                  .array(
                    z.object({
                      Price: z
                        .object({ Amount: z.number().optional() })
                        .optional(),
                    }),
                  )
                  .optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
