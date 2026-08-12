import registryJson from "@/data/merchants.json";
import { MerchantRegistrySchema, type Merchant } from "@/schemas/commerce";
import { PRODUCTS } from "@/domain/recommendation/catalog";

/**
 * 販売者レジストリ。
 * 起動時に一度だけ検証し、カタログの officialUrl がすべて許可ホストに
 * 含まれていることを確かめる。含まれていない商品はデータ不整合として弾く
 * （実行時に「なぜか遷移できない商品」が混ざるのを防ぐため）。
 */
const registry = MerchantRegistrySchema.parse(registryJson);

export const MERCHANT_REGISTRY_VERSION = registry.registryVersion;
export const MERCHANTS: readonly Merchant[] = Object.freeze(registry.merchants);

const byId = new Map<string, Merchant>(MERCHANTS.map((m) => [m.id, m]));
if (byId.size !== MERCHANTS.length) {
  throw new Error("merchants.json に重複した id があります");
}

/** ホスト → 販売者。ホストの重複は許さない（どちらが正か決まらないため） */
const byHost = new Map<string, Merchant>();
for (const m of MERCHANTS) {
  for (const rawHost of m.hosts) {
    const host = rawHost.toLowerCase();
    if (byHost.has(host)) {
      throw new Error(`merchants.json でホストが重複しています: ${host}`);
    }
    byHost.set(host, m);
  }
}

export function getMerchant(id: string): Merchant | undefined {
  return byId.get(id);
}

/**
 * ホストに対応する販売者を返す。
 * 完全一致、またはドット境界のサブドメインのみを認める。
 * 「evil-kao.co.jp」のような接尾辞一致を通さないため、endsWith は使わない。
 */
export function merchantForHost(host: string): Merchant | undefined {
  const normalized = host.toLowerCase();
  const exact = byHost.get(normalized);
  if (exact) return exact;

  for (const [allowed, merchant] of byHost) {
    if (normalized.endsWith(`.${allowed}`)) return merchant;
  }
  return undefined;
}

/** カタログの全商品が許可ホスト上にあることを起動時に確認する */
for (const p of PRODUCTS) {
  // 公式URLを持たないもの（利用者が自分で追加したもの）は対象外
  if (p.officialUrl === null) continue;
  let host: string;
  try {
    host = new URL(p.officialUrl).hostname;
  } catch {
    throw new Error(`officialUrl が URL として不正です (product=${p.id})`);
  }
  if (!merchantForHost(host)) {
    throw new Error(
      `officialUrl のホストが merchants.json の許可リストにありません: ${host} (product=${p.id})`,
    );
  }
}
