"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

/**
 * プライバシー設定。
 *
 * 既定は「端末内のみ」= 外部AIサービスへ何も送らない。
 * 利用者が明示的に切り替えたときだけ、外部AIによる説明文生成を使う。
 *
 * この設定はサーバー側の判定（server/ai-policy.ts）へ渡すだけで、
 * 判定そのものはサーバーが行う。クライアントの値を信用して
 * 送信可否を決める作りにはしていない
 * （運用側のキルスイッチが常に優先する）。
 */

const KEY = "chigiri.privacy.v1";

export const PrivacySettingsSchema = z.object({
  /** 外部AIサービスの利用を許可したか */
  allowExternalAi: z.boolean().default(false),
  /**
   * 利用者が自分で選んだか。
   * false の間は「まだ聞いていない」状態であり、既定値のまま
   * 送信することも、勝手に送らないと決めつけることもしない。
   * 未選択のうちは送信しない（安全側）が、画面では選択を促す。
   */
  decided: z.boolean().default(false),
});
export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>;

export const DEFAULT_PRIVACY: PrivacySettings = {
  allowExternalAi: false,
  decided: false,
};

export function loadPrivacy(): PrivacySettings {
  if (typeof window === "undefined") return DEFAULT_PRIVACY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PRIVACY;
    const parsed = PrivacySettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PRIVACY;
  } catch {
    return DEFAULT_PRIVACY;
  }
}

export function usePrivacy() {
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(loadPrivacy());
    setHydrated(true);
  }, []);

  const setAllowExternalAi = useCallback((allowExternalAi: boolean) => {
    const next = { allowExternalAi, decided: true };
    setSettings(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // 保存できなくても、この画面の間は設定が効く
    }
  }, []);

  return { settings, hydrated, setAllowExternalAi };
}
