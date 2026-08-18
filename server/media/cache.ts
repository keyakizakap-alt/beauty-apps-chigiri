import "server-only";

/**
 * 外部APIから引いた商品情報の一時保持と、呼び出し間隔の制御。
 *
 * 保持期間について:
 *   楽天も Amazon も、取得した商品情報の長期保存を認めていない。
 *   ここでは既定 6 時間、上限 24 時間として、それを過ぎたものは
 *   捨てて引き直す。期限切れの値を「まだ使える」として返さない。
 *
 * 呼び出し間隔について:
 *   どちらのAPIも概ね毎秒1リクエストが上限。まとめて照会するときに
 *   一斉に投げると弾かれるため、サービスごとに直列化して間隔を空ける。
 *
 * 制約（本番化時に置き換える前提）:
 *   プロセス内メモリのため、インスタンスが増えると取得回数も増える。
 *   共有キャッシュ（Redis 等）へ移すのが本筋。
 */

const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;

export function ttlMs(): number {
  const v = Number(process.env.MEDIA_CACHE_TTL_MS);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_TTL_MS;
  // 規約上の上限を超える保持は、設定で指定されても行わない
  return Math.min(v, MAX_TTL_MS);
}

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function readCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function writeCache<T>(key: string, value: T): void {
  if (store.size >= MAX_ENTRIES) {
    // 期限切れを掃除し、それでも空かなければ最も古いものから捨てる
    const now = Date.now();
    for (const [k, v] of store) {
      if (now >= v.expiresAt) store.delete(k);
    }
    while (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next();
      if (oldest.done) break;
      store.delete(oldest.value);
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs() });
}

/** テスト用。プロセス内の保持を空にする */
export function clearCache(): void {
  store.clear();
}

/* ------------------------------------------------------------------ *
 * 呼び出し間隔
 * ------------------------------------------------------------------ */

const MIN_INTERVAL_MS = 1100;

const queues = new Map<string, Promise<unknown>>();
const lastCallAt = new Map<string, number>();

/**
 * サービスごとに直列化し、前回の呼び出しから最低 1.1 秒空ける。
 * 呼び出し側は普通に await するだけでよい。
 */
export function throttle<T>(service: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(service) ?? Promise.resolve();

  const next = prev.then(async () => {
    const last = lastCallAt.get(service) ?? 0;
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt.set(service, Date.now());
    return task();
  });

  // 失敗しても後続を止めない
  queues.set(
    service,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}
