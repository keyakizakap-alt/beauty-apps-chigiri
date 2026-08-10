import { describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  planTurn,
  wantsProposal,
  type CounselState,
} from "@/domain/conversation/counsel";
import { DEFAULT_PROFILE, markStated, type Profile } from "@/schemas/profile";

function profileWith(patch: Partial<Profile>): Profile {
  return { ...DEFAULT_PROFILE, ...patch };
}

/** 手順どおりに会話を進める補助 */
function advance(profile: Profile, state: CounselState, learned: string[] = []) {
  return planTurn({
    profile,
    state,
    learned: learned as never,
    wantsProposal: false,
  });
}

describe("相談の進め方", () => {
  it("まず気になっていることを尋ねる", () => {
    const plan = advance(DEFAULT_PROFILE, INITIAL_STATE);
    expect(plan.state.stage).toBe("concerns");
    expect(plan.propose).toBe(false);
    expect(plan.quickReplies.length).toBeGreaterThan(0);
  });

  it("一度に尋ねるのは1つだけ", () => {
    const plan = advance(DEFAULT_PROFILE, INITIAL_STATE);
    // 「？」で終わる問いが本文に1つだけ
    const questions = plan.message.split("\n").filter((l) => l.includes("か。"));
    expect(questions.length).toBeLessThanOrEqual(1);
  });

  it("答えた項目は二度尋ねない", () => {
    let profile = profileWith({ concerns: ["dryness"] });
    let state = INITIAL_STATE;

    const first = advance(profile, state);
    expect(first.state.stage).toBe("skin");

    profile = markStated(profile, "skinType");
    state = first.state;
    const second = advance(profile, state);
    expect(second.state.stage).toBe("time");
    expect(second.state.stage).not.toBe("skin");
  });

  it("順番どおりに進み、手持ちの前に条件を聞き終える", () => {
    let profile = profileWith({ concerns: ["dryness"] });
    profile = markStated(profile, "skinType", "morningMinutes", "budgetYen");

    const plan = advance(profile, { ...INITIAL_STATE, asked: [] });
    expect(plan.state.stage).toBe("inventory");
    expect(plan.showInventoryPicker).toBe(true);
    expect(plan.offerPhoto).toBe(true);
  });

  it("手持ちがそろったら、提案の前に内容を確認する", () => {
    let profile = profileWith({
      concerns: ["dryness"],
      ownedProductIds: ["cl-curel-foam"],
    });
    profile = markStated(profile, "skinType", "morningMinutes", "budgetYen");

    const plan = advance(profile, INITIAL_STATE);
    expect(plan.state.stage).toBe("confirm");
    expect(plan.propose).toBe(false);
    expect(plan.message).toContain("整理");
  });

  it("確認のあとで提案へ進む", () => {
    let profile = profileWith({
      concerns: ["dryness"],
      ownedProductIds: ["cl-curel-foam"],
    });
    profile = markStated(profile, "skinType", "morningMinutes", "budgetYen");

    const confirmed = advance(profile, INITIAL_STATE);
    const next = advance(profile, confirmed.state);
    expect(next.propose).toBe(true);
  });

  it("手持ちが無いうちは提案しない", () => {
    let profile = profileWith({ concerns: ["dryness"] });
    profile = markStated(profile, "skinType", "morningMinutes", "budgetYen");

    // 何度進めても、手持ちが無い限り propose にならない
    let state = INITIAL_STATE;
    for (let i = 0; i < 6; i++) {
      const plan = advance(profile, state);
      expect(plan.propose).toBe(false);
      state = plan.state;
    }
  });

  it("「組み立てて」と言われても、手持ちが無ければ進めない", () => {
    const plan = planTurn({
      profile: profileWith({ concerns: ["dryness"] }),
      state: INITIAL_STATE,
      learned: [],
      wantsProposal: true,
    });
    expect(plan.propose).toBe(false);
  });

  it("「組み立てて」と言われ手持ちがあれば、すぐ提案する", () => {
    const plan = planTurn({
      profile: profileWith({ ownedProductIds: ["cl-curel-foam"] }),
      state: INITIAL_STATE,
      learned: [],
      wantsProposal: true,
    });
    expect(plan.propose).toBe(true);
  });

  it("答えを受け止めてから次を尋ねる", () => {
    const plan = planTurn({
      profile: profileWith({ concerns: ["dryness", "pores"] }),
      state: INITIAL_STATE,
      learned: ["concerns"] as never,
      wantsProposal: false,
    });
    expect(plan.acknowledgement).toBeTruthy();
    expect(plan.acknowledgement).toContain("乾燥");
  });

  it("尋ねたが答えてもらえなかった項目は「仮に置いた」と断る", () => {
    const profile = profileWith({
      concerns: ["dryness"],
      ownedProductIds: ["cl-curel-foam"],
    });
    // 肌・時間・予算は尋ねたが答えが得られなかった状態
    const plan = advance(profile, {
      ...INITIAL_STATE,
      asked: ["concerns", "skin", "time", "budget"],
    });
    expect(plan.state.stage).toBe("confirm");
    expect(plan.message).toContain("伺えていない");
  });

  it("申告済みの項目は断りを入れない", () => {
    let profile = profileWith({
      concerns: ["dryness"],
      ownedProductIds: ["cl-curel-foam"],
    });
    profile = markStated(profile, "skinType", "morningMinutes", "budgetYen");

    const plan = advance(profile, {
      ...INITIAL_STATE,
      asked: ["concerns", "skin", "time", "budget"],
    });
    expect(plan.message).not.toContain("伺えていない");
  });

  it("提案後は追加の相談を受ける", () => {
    const plan = advance(
      profileWith({ ownedProductIds: ["cl-curel-foam"] }),
      { stage: "proposed", asked: [], turn: 5 },
    );
    expect(plan.state.stage).toBe("aftercare");
    expect(plan.propose).toBe(false);
    expect(plan.quickReplies.length).toBeGreaterThan(0);
  });

  it("提案後に条件が変わったら組み直す", () => {
    const plan = planTurn({
      profile: profileWith({
        ownedProductIds: ["cl-curel-foam"],
        budgetYen: 1000,
      }),
      state: { stage: "proposed", asked: [], turn: 5 },
      learned: ["budgetYen"] as never,
      wantsProposal: false,
    });
    expect(plan.propose).toBe(true);
  });

  it("会話の往復が数えられている", () => {
    let state = INITIAL_STATE;
    for (let i = 1; i <= 3; i++) {
      state = advance(DEFAULT_PROFILE, state).state;
      expect(state.turn).toBe(i);
    }
  });
});

describe("組み立ての意思表示", () => {
  it("進めてよい合図を拾う", () => {
    for (const t of [
      "この内容で組み立ててください",
      "それでいいです",
      "お願いします",
      "これで大丈夫です",
      "進めてください",
    ]) {
      expect(wantsProposal(t), t).toBe(true);
    }
  });

  it("まだ話している途中は拾わない", () => {
    for (const t of ["乾燥が気になります", "混合肌です", "毛穴も気になって"]) {
      expect(wantsProposal(t), t).toBe(false);
    }
  });
});
