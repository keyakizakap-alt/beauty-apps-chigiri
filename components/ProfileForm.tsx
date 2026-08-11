"use client";

import { markStated, type Profile, type ProfileField } from "@/schemas/profile";
import type { ConcernTag, IngredientTag, SkinTag, TextureTag } from "@/schemas/product";
import { CONCERN_LABEL, SKIN_LABEL } from "@/domain/recommendation/routine-builder";
import { INGREDIENT_LABEL, TEXTURE_LABEL } from "@/domain/recommendation/filters";

/**
 * プロファイル入力。
 * 推薦ロジックはここには置かず、値の受け渡しだけを行う。
 */

const SKIN_TYPES: SkinTag[] = ["dry", "oily", "combination", "normal", "sensitive"];

const CONCERNS: ConcernTag[] = [
  "dryness",
  "oiliness",
  "pores",
  "dullness",
  "acne_prone",
  "texture",
  "firmness",
  "uv_protection",
  "redness",
  "sensitivity",
];

const AVOID_TEXTURES: TextureTag[] = [
  "sticky",
  "rich",
  "oily_finish",
  "matte_finish",
  "fragranced",
  "dewy_finish",
];

const AVOID_INGREDIENTS: IngredientTag[] = [
  "alcohol",
  "fragrance",
  "essential_oil",
  "chemical_uv",
  "salicylic_acid",
  "aha",
  "centella",
  "niacinamide",
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chigiri-chip ${active ? "chigiri-chip-on" : "chigiri-chip-off"}`}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function ProfileForm({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (next: Profile) => void;
}) {
  // 変更された項目は「ユーザーが自分で指定したもの」として記録する。
  // これをしないと、初期値のままの項目まで説明文で断定されてしまう。
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    onChange(markStated({ ...profile, [key]: value }, key as ProfileField));

  return (
    <div className="space-y-6">
      <section>
        <h3 className="chigiri-label mb-2">肌傾向（自己申告）</h3>
        <div className="flex flex-wrap gap-2">
          {SKIN_TYPES.map((s) => (
            <Chip
              key={s}
              active={profile.skinType === s}
              onClick={() => set("skinType", s)}
            >
              {SKIN_LABEL[s]}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="chigiri-label mb-2">
          気になっていること（気になる順に選んでください・最大5つ）
        </h3>
        <div className="flex flex-wrap gap-2">
          {CONCERNS.map((c) => {
            const idx = profile.concerns.indexOf(c);
            const active = idx >= 0;
            return (
              <Chip
                key={c}
                active={active}
                onClick={() => {
                  const next = toggle(profile.concerns, c).slice(0, 5);
                  set("concerns", next);
                }}
              >
                {active && (
                  <span className="mr-1 text-[10px] opacity-80">{idx + 1}</span>
                )}
                {CONCERN_LABEL[c]}
              </Chip>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="chigiri-label mb-2">避けたい使用感</h3>
        <div className="flex flex-wrap gap-2">
          {AVOID_TEXTURES.map((t) => (
            <Chip
              key={t}
              active={profile.avoidTextures.includes(t)}
              onClick={() => set("avoidTextures", toggle(profile.avoidTextures, t))}
            >
              {TEXTURE_LABEL[t]}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="chigiri-label mb-2">
          避けたい成分・既知のアレルギー（選んだものは候補から必ず除外します）
        </h3>
        <div className="flex flex-wrap gap-2">
          {AVOID_INGREDIENTS.map((i) => (
            <Chip
              key={i}
              active={profile.avoidIngredients.includes(i)}
              onClick={() =>
                set("avoidIngredients", toggle(profile.avoidIngredients, i))
              }
            >
              {INGREDIENT_LABEL[i]}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink/50">
          成分名は公開情報に基づく分類です。配合濃度や処方は公開されていないため、
          刺激の強さをこの情報だけで判断することはできません。
        </p>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="budget" className="chigiri-label mb-2 block">
            買い足しに使える予算：{profile.budgetYen.toLocaleString()}円
          </label>
          <input
            id="budget"
            type="range"
            min={0}
            max={10000}
            step={500}
            value={profile.budgetYen}
            onChange={(e) => set("budgetYen", Number(e.target.value))}
            className="w-full accent-forest"
          />
        </div>
        <div>
          <label htmlFor="maxNew" className="chigiri-label mb-2 block">
            最大買い足し商品数：{profile.maxNewItems}点
          </label>
          <input
            id="maxNew"
            type="range"
            min={0}
            max={3}
            step={1}
            value={profile.maxNewItems}
            onChange={(e) => set("maxNewItems", Number(e.target.value))}
            className="w-full accent-forest"
          />
        </div>
        <div>
          <label htmlFor="morning" className="chigiri-label mb-2 block">
            朝に使える時間：{profile.morningMinutes}分
          </label>
          <input
            id="morning"
            type="range"
            min={1}
            max={20}
            step={1}
            value={profile.morningMinutes}
            onChange={(e) => set("morningMinutes", Number(e.target.value))}
            className="w-full accent-forest"
          />
        </div>
        <div>
          <label htmlFor="night" className="chigiri-label mb-2 block">
            夜に使える時間：{profile.nightMinutes}分
          </label>
          <input
            id="night"
            type="range"
            min={1}
            max={30}
            step={1}
            value={profile.nightMinutes}
            onChange={(e) => set("nightMinutes", Number(e.target.value))}
            className="w-full accent-forest"
          />
        </div>
      </section>

      <section>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={profile.allowPurchase}
            onChange={(e) => set("allowPurchase", e.target.checked)}
            className="h-4 w-4 accent-forest"
          />
          追加購入を許可する（外すと手持ちだけで組み立てます）
        </label>
      </section>
    </div>
  );
}
