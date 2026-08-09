"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PROFILE, ProfileSchema, type Profile } from "@/schemas/profile";

/**
 * プロファイルの保存はブラウザのローカルストレージのみ。
 * MVP では DB を必須にしない方針のため、サーバーには保存しない。
 */
const KEY = "chigiri.profile.v1";

export function loadProfile(): Profile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = ProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: Profile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // 保存できなくても操作は続行できる（プライベートモードなど）
  }
}

/** localStorage と同期するプロファイル状態 */
export function useProfile(): {
  profile: Profile;
  setProfile: (next: Profile | ((prev: Profile) => Profile)) => void;
  hydrated: boolean;
} {
  const [profile, setProfileState] = useState<Profile>(DEFAULT_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfileState(loadProfile());
    setHydrated(true);
  }, []);

  const setProfile = useCallback(
    (next: Profile | ((prev: Profile) => Profile)) => {
      setProfileState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        saveProfile(value);
        return value;
      });
    },
    [],
  );

  return { profile, setProfile, hydrated };
}
