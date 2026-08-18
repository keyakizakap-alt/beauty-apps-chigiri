import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_MEDIA_IMAGE_HOSTS,
  MEDIA_IMAGE_HOSTS,
  ProductMediaRequestSchema,
  ProductMediaSchema,
  RakutenSearchResponseSchema,
  AmazonGetItemsResponseSchema,
  firstImageUrl,
  unwrapRakutenItem,
} from "@/schemas/media";
import { ProductSchema } from "@/schemas/product";
import { collectProductIds } from "@/lib/product-media";
import { amzDateNow, buildAuthorization } from "@/server/media/amazon";

describe("CSP と画像ホストの対応", () => {
  it("next.config.mjs の img-src が MEDIA_IMAGE_HOSTS を網羅している", () => {
    const config = readFileSync("next.config.mjs", "utf8");
    for (const host of ALL_MEDIA_IMAGE_HOSTS) {
      expect(config, `${host} が CSP に無い`).toContain(`https://${host}`);
    }
  });

  it("API のホストは img-src に入れない", () => {
    const config = readFileSync("next.config.mjs", "utf8");
    expect(config).not.toContain("app.rakuten.co.jp");
    expect(config).not.toContain("webservices.amazon");
  });

  it("connect-src は自分のオリジンのままにする", () => {
    const config = readFileSync("next.config.mjs", "utf8");
    expect(config).toContain("\"connect-src 'self'\"");
  });
});

describe("SigV4 署名", () => {
  // 鍵と時刻を固定すれば署名は毎回同じになる
  const args = {
    accessKey: "AKIAIOSFODNN7EXAMPLE",
    secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-west-2",
    host: "webservices.amazon.co.jp",
    payload: '{"ItemIds":["B000000000"]}',
    amzDate: "20260812T000000Z",
  };

  it("同じ入力からは同じ署名が出る", () => {
    expect(buildAuthorization(args)).toBe(buildAuthorization(args));
  });

  it("必要な要素がそろっている", () => {
    const auth = buildAuthorization(args);
    expect(auth.startsWith("AWS4-HMAC-SHA256 ")).toBe(true);
    expect(auth).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20260812/us-west-2/ProductAdvertisingAPI/aws4_request",
    );
    expect(auth).toContain(
      "SignedHeaders=content-encoding;host;x-amz-date;x-amz-target",
    );
    expect(auth).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it("本文が変われば署名も変わる", () => {
    const other = buildAuthorization({ ...args, payload: '{"ItemIds":["B111"]}' });
    expect(other).not.toBe(buildAuthorization(args));
  });

  it("秘密鍵が変われば署名も変わる", () => {
    const other = buildAuthorization({ ...args, secretKey: "another-secret" });
    expect(other).not.toBe(buildAuthorization(args));
  });

  it("日付は記号を除いた形にする", () => {
    expect(amzDateNow(new Date("2026-08-12T03:04:05.678Z"))).toBe(
      "20260812T030405Z",
    );
  });
});

describe("楽天の応答", () => {
  it("Item で包まれた形を読める", () => {
    const parsed = RakutenSearchResponseSchema.safeParse({
      Items: [
        {
          Item: {
            itemName: "テスト化粧水",
            itemCode: "shop:10000001",
            itemPrice: 1320,
            mediumImageUrls: [
              { imageUrl: "https://thumbnail.image.rakuten.co.jp/a.jpg?_ex=128x128" },
            ],
          },
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const item = unwrapRakutenItem(parsed.data.Items![0]);
    expect(item.itemCode).toBe("shop:10000001");
    expect(firstImageUrl(item.mediumImageUrls)).toContain("thumbnail.image");
  });

  it("包まれていない形（formatVersion=2）も読める", () => {
    const parsed = RakutenSearchResponseSchema.safeParse({
      Items: [
        {
          itemName: "テスト化粧水",
          itemCode: "shop:10000002",
          itemPrice: 858,
          mediumImageUrls: ["https://thumbnail.image.rakuten.co.jp/b.jpg"],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const item = unwrapRakutenItem(parsed.data.Items![0]);
    expect(item.itemCode).toBe("shop:10000002");
    expect(firstImageUrl(item.mediumImageUrls)).toBe(
      "https://thumbnail.image.rakuten.co.jp/b.jpg",
    );
  });

  it("画像が無ければ null を返す", () => {
    expect(firstImageUrl(undefined)).toBeNull();
    expect(firstImageUrl([])).toBeNull();
  });

  it("想定と違う形は取り込まない", () => {
    expect(
      RakutenSearchResponseSchema.safeParse({ Items: [{ itemCode: 123 }] }).success,
    ).toBe(false);
  });
});

describe("Amazon の応答", () => {
  it("必要な項目だけ取り出せる", () => {
    const parsed = AmazonGetItemsResponseSchema.safeParse({
      ItemsResult: {
        Items: [
          {
            ASIN: "B000000000",
            DetailPageURL: "https://www.amazon.co.jp/dp/B000000000?tag=x-22",
            Images: {
              Primary: {
                Large: {
                  URL: "https://m.media-amazon.com/images/I/x.jpg",
                  Width: 500,
                  Height: 500,
                },
              },
            },
            Offers: { Listings: [{ Price: { Amount: 1320 } }] },
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const item = parsed.data.ItemsResult!.Items![0];
    expect(item.Images?.Primary?.Large?.URL).toContain("m.media-amazon.com");
  });

  it("画像が無い応答でも落ちない", () => {
    const parsed = AmazonGetItemsResponseSchema.safeParse({
      ItemsResult: { Items: [{ ASIN: "B000000000" }] },
    });
    expect(parsed.success).toBe(true);
  });

  it("エラー応答は Items 無しとして扱える", () => {
    const parsed = AmazonGetItemsResponseSchema.safeParse({
      Errors: [{ Code: "InvalidParameterValue" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.ItemsResult?.Items ?? []).toHaveLength(0);
  });
});

describe("クライアントへ返す形", () => {
  const media = {
    productId: "lo-a",
    provider: "rakuten" as const,
    imageUrl: "https://thumbnail.image.rakuten.co.jp/a.jpg",
    width: null,
    height: null,
    linkUrl: "https://item.rakuten.co.jp/shop/a/",
    priceYen: 1320,
    fetchedAt: "2026-08-12T00:00:00.000Z",
  };

  it("取得時刻を必ず持つ", () => {
    const { fetchedAt, ...without } = media;
    expect(fetchedAt).toBeTruthy();
    expect(ProductMediaSchema.safeParse(without).success).toBe(false);
  });

  it("https 以外の画像URLは通さない", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "http://thumbnail.image.rakuten.co.jp/a.jpg",
    ]) {
      expect(
        ProductMediaSchema.safeParse({ ...media, imageUrl: bad }).success,
        bad,
      ).toBe(false);
    }
  });

  it("許可していない配信元の画像は通さない", () => {
    expect(
      ProductMediaSchema.safeParse({
        ...media,
        imageUrl: "https://evil.example/a.jpg",
      }).success,
    ).toBe(false);
  });

  it("https 以外の提携リンクは通さない", () => {
    // href に入るため、ここを抜けると実害が出る
    expect(
      ProductMediaSchema.safeParse({ ...media, linkUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });

  it("一度に照会できる件数に上限がある", () => {
    const many = Array.from({ length: 31 }, (_, i) => `p-${i}`);
    expect(ProductMediaRequestSchema.safeParse({ productIds: many }).success).toBe(
      false,
    );
    expect(
      ProductMediaRequestSchema.safeParse({ productIds: many.slice(0, 30) }).success,
    ).toBe(true);
  });

  it("空の照会は受け付けない", () => {
    expect(ProductMediaRequestSchema.safeParse({ productIds: [] }).success).toBe(
      false,
    );
  });
});

describe("商品 id の収集", () => {
  it("入れ子のどこにある productId でも拾う", () => {
    const ids = collectProductIds({
      suggestion: { productId: "a" },
      plans: [{ routines: [{ steps: [{ productId: "b" }, { productId: "c" }] }] }],
      unused: [{ productId: "d" }],
    });
    expect(new Set(ids)).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("手持ちの id 配列も拾う", () => {
    expect(collectProductIds({ profile: { ownedProductIds: ["x", "y"] } })).toEqual(
      ["x", "y"],
    );
  });

  it("深すぎる入れ子で止まる", () => {
    let deep: unknown = { productId: "deep" };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(collectProductIds(deep)).toHaveLength(0);
  });

  it("オブジェクトでないものを渡しても落ちない", () => {
    expect(collectProductIds(null)).toEqual([]);
    expect(collectProductIds("abc")).toEqual([]);
    expect(collectProductIds(undefined)).toEqual([]);
  });
});

describe("カタログの外部識別子", () => {
  const base = {
    id: "lo-a",
    domain: "skincare",
    brand: "テスト",
    name: "化粧水",
    category: "lotion",
    price: 1000,
    skinTags: [],
    concernTags: [],
    textureTags: [],
    ingredientTags: [],
    cautionTags: [],
    allowedClaims: [],
    usageTiming: ["morning"],
    officialUrl: null,
    sourceCheckedAt: null,
    dataConfidence: "seed",
    isQuasiDrug: false,
    origin: "jp",
  };

  it("正しい形の識別子を受け付ける", () => {
    const r = ProductSchema.safeParse({
      ...base,
      jan: "4901301234567",
      rakutenItemCode: "myshop:10000001",
      asin: "B08XYZ1234",
    });
    expect(r.success).toBe(true);
  });

  it("桁数の違う JAN を弾く", () => {
    expect(ProductSchema.safeParse({ ...base, jan: "12345" }).success).toBe(false);
  });

  it("形式の違う ASIN を弾く", () => {
    expect(ProductSchema.safeParse({ ...base, asin: "b08xyz1234" }).success).toBe(
      false,
    );
    expect(ProductSchema.safeParse({ ...base, asin: "B08XYZ" }).success).toBe(false);
  });

  it("識別子は省略できる", () => {
    expect(ProductSchema.safeParse(base).success).toBe(true);
  });
});

describe("画像ホストの許可", () => {
  it("提供元ごとにホストが分かれている", () => {
    expect(MEDIA_IMAGE_HOSTS.rakuten).toContain("thumbnail.image.rakuten.co.jp");
    expect(MEDIA_IMAGE_HOSTS.amazon).toContain("m.media-amazon.com");
    expect(MEDIA_IMAGE_HOSTS.rakuten).not.toContain("m.media-amazon.com");
  });
});
