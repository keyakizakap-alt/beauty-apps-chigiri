import { describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  openingMessage,
  openingQuickReplies,
  openingState,
  planTurn,
  type CounselState,
} from "@/domain/conversation/counsel";
import {
  detectExpertSwitch,
  detectHabits,
  detectTopics,
  EXPERTS,
  EXPERT_IDS,
  scopePatchToExpert,
} from "@/domain/conversation/experts";
import { buildCarePlan } from "@/domain/conversation/care-plan";
import { areExpressionsSafe, evaluateSafety } from "@/domain/recommendation/safety-rules";
import {
  DEFAULT_PROFILE,
  markStated,
  type ExpertId,
  type Profile,
} from "@/schemas/profile";
import { CarePlanSchema } from "@/schemas/recommendation";

function profileWith(patch: Partial<Profile>): Profile {
  return { ...DEFAULT_PROFILE, ...patch };
}

function stateFor(expert: ExpertId, patch: Partial<CounselState> = {}): CounselState {
  return { ...INITIAL_STATE, expert, ...patch };
}

function advance(
  profile: Profile,
  state: CounselState,
  detected?: { topics: string[]; habits: string[] },
) {
  return planTurn({
    profile,
    state,
    learned: [],
    wantsProposal: false,
    detected,
  });
}

describe("分野ごとに独立した相談", () => {
  it("相談の開始状態は、その分野のもの", () => {
    for (const expert of EXPERT_IDS) {
      const state = openingState(expert);
      expect(state.expert, expert).toBe(expert);
      expect(state.topics, expert).toEqual([]);
      expect(state.habits, expert).toEqual([]);
      expect(state.stage, expert).toBe("concerns");
    }
  });

  it("最初の問いかけと選択肢が分野ごとに違う", () => {
    const hair = openingMessage(new Date("2026-08-11T10:00:00"), "haircare");
    const body = openingMessage(new Date("2026-08-11T10:00:00"), "bodycare");
    expect(hair).toContain("髪や頭皮");
    expect(body).toContain("体のこと");
    expect(hair).not.toBe(body);

    expect(openingQuickReplies("haircare").map((q) => q.label)).toContain(
      "パサつき",
    );
    expect(openingQuickReplies("bodycare").map((q) => q.label)).not.toContain(
      "パサつき",
    );
  });

  it("進み具合は1分野分しか持たない", () => {
    // ほかの分野の聞き取り内容を抱え込む場所が無いこと。
    // 持ってしまうと、独立しているはずの相談が互いに影響する。
    const state = openingState("haircare");
    expect(Object.keys(state).sort()).toEqual(
      ["asked", "expert", "habits", "stage", "topics", "turn"].sort(),
    );
  });

  it("相談を進めても分野は変わらない", () => {
    let state = openingState("bodycare");
    for (let i = 0; i < 8; i++) {
      const plan = advance(DEFAULT_PROFILE, state, {
        topics: ["body_dry"],
        habits: [],
      });
      expect(plan.state.expert).toBe("bodycare");
      state = plan.state;
    }
  });

  it("確認では、ほかの分野で伺った内容を前提に並べない", () => {
    // 別の相談で答えたことを、この相談が知っている前提にしない
    let profile = profileWith({ concerns: ["dryness", "pores"] });
    profile = markStated(profile, "skinType");

    const plan = advance(
      profile,
      stateFor("haircare", {
        asked: ["concerns", "habits", "time", "constraints"],
        topics: ["hair_dry"],
      }),
    );
    expect(plan.state.stage).toBe("confirm");
    expect(plan.message).not.toContain("引き継");
    expect(plan.message).not.toContain("乾燥");
    expect(plan.message).not.toContain("毛穴");
  });

  it("手順の前提にも、ほかの分野の内容が出てこない", () => {
    const profile = profileWith({ concerns: ["dryness", "pores"] });
    const plan = buildCarePlan({
      expert: "haircare",
      profile,
      topics: ["hair_dry"],
      habits: [],
    });
    expect(plan.basis.some((b) => b.includes("肌"))).toBe(false);
    expect(plan.basis.some((b) => b.includes("乾燥"))).toBe(false);
  });
});

describe("ほかの分野の話が出たとき", () => {
  it("どの分野の相談かを言い当てる", () => {
    expect(detectExpertSwitch("髪のことも相談したいです")).toBe("haircare");
    expect(detectExpertSwitch("体のケアについて教えてください")).toBe("bodycare");
    expect(detectExpertSwitch("生活リズムを整えたいです")).toBe("healthcare");
    expect(detectExpertSwitch("肌の相談に戻りたいです")).toBe("skincare");
  });

  it("話題に触れただけでは案内しない", () => {
    expect(detectExpertSwitch("髪もパサついています")).toBeNull();
    expect(detectExpertSwitch("体が冷えます")).toBeNull();
    expect(detectExpertSwitch("乾燥が気になります")).toBeNull();
  });
});

describe("条件の書き換え範囲", () => {
  const patch = {
    concerns: ["dryness"],
    skinType: "dry",
    avoidTextures: ["sticky"],
    budgetYen: 1000,
    morningMinutes: 3,
    avoidIngredients: ["alcohol"],
  };

  it("肌の相談では、すべての項目を書き換えられる", () => {
    expect(scopePatchToExpert("skincare", patch)).toEqual(patch);
  });

  it("髪や体の話で、肌の条件を書き換えない", () => {
    // 「髪のパサつき」を肌の乾燥として記録すると、
    // 肌の相談を開いたときに言っていないことを言ったことにしてしまう
    for (const expert of ["haircare", "bodycare", "healthcare"] as ExpertId[]) {
      const scoped = scopePatchToExpert(expert, patch);
      expect(scoped.concerns, expert).toBeUndefined();
      expect(scoped.skinType, expert).toBeUndefined();
      expect(scoped.avoidTextures, expert).toBeUndefined();
    }
  });

  it("時間・予算・避けたい成分は、その相談の中で受け取れる", () => {
    const scoped = scopePatchToExpert("haircare", patch);
    expect(scoped.budgetYen).toBe(1000);
    expect(scoped.morningMinutes).toBe(3);
    expect(scoped.avoidIngredients).toEqual(["alcohol"]);
  });

  it("元の値を書き換えない", () => {
    const original = { ...patch };
    scopePatchToExpert("haircare", patch);
    expect(patch).toEqual(original);
  });
});

describe("分野ごとの聞き取り", () => {
  it("自由文から関心事を拾う", () => {
    expect(detectTopics("haircare", "髪がパサついて広がります")).toContain("hair_dry");
    expect(detectTopics("haircare", "髪がパサついて広がります")).toContain("hair_frizz");
    expect(detectTopics("bodycare", "ひじがざらざらします")).toContain("body_rough");
    expect(detectTopics("healthcare", "夜更かしが続いています")).toContain("sleep");
  });

  it("別の分野の語彙は拾わない", () => {
    expect(detectTopics("bodycare", "髪がパサついています")).toEqual([]);
  });

  it("いまのやり方を拾う", () => {
    expect(detectHabits("haircare", "洗ったあとは自然乾燥です")).toContain("air_dry");
    expect(detectHabits("bodycare", "ナイロンタオルでゴシゴシ洗っています")).toContain(
      "scrub_wash",
    );
  });
});

describe("スキンケア以外の相談の進み方", () => {
  it("気になっていること → やり方 → 時間 → 気をつけたいこと → 確認 の順に進む", () => {
    const profile = DEFAULT_PROFILE;
    let state = stateFor("haircare");

    const first = advance(profile, state);
    expect(first.state.stage).toBe("concerns");

    state = first.state;
    const second = advance(profile, state, { topics: ["hair_dry"], habits: [] });
    expect(second.state.stage).toBe("habits");

    state = second.state;
    const third = advance(profile, state, { topics: [], habits: ["air_dry"] });
    expect(third.state.stage).toBe("time");

    state = third.state;
    const fourth = advance(profile, state);
    expect(fourth.state.stage).toBe("constraints");

    state = fourth.state;
    const fifth = advance(profile, state);
    expect(fifth.state.stage).toBe("confirm");
    expect(fifth.propose).toBe(false);

    state = fifth.state;
    expect(advance(profile, state).propose).toBe(true);
  });

  it("すでに伺った時間は、分野が変わっても尋ね直さない", () => {
    const profile = markStated(DEFAULT_PROFILE, "morningMinutes");
    const state = stateFor("haircare", {
      asked: ["concerns", "habits"],
      topics: ["hair_dry"],
      habits: ["air_dry"],
    });
    expect(advance(profile, state).state.stage).toBe("constraints");
  });

  it("手持ちの一覧は出さない（この分野にはカタログが無い）", () => {
    let state = stateFor("bodycare");
    for (let i = 0; i < 6; i++) {
      const plan = advance(DEFAULT_PROFILE, state);
      expect(plan.showInventoryPicker).toBe(false);
      expect(plan.offerPhoto).toBe(false);
      state = plan.state;
    }
  });

  it("何も伺えていないうちは「組み立てて」でも進めない", () => {
    const plan = planTurn({
      profile: DEFAULT_PROFILE,
      state: stateFor("healthcare"),
      learned: [],
      wantsProposal: true,
      detected: { topics: [], habits: [] },
    });
    expect(plan.propose).toBe(false);
  });

  it("気になっていることが分かれば、すぐ組み立てられる", () => {
    const plan = planTurn({
      profile: DEFAULT_PROFILE,
      state: stateFor("healthcare", { topics: ["sleep"] }),
      learned: [],
      wantsProposal: true,
      detected: { topics: [], habits: [] },
    });
    expect(plan.propose).toBe(true);
  });

  it("確認では、伺えていない項目に断りを入れる", () => {
    const plan = advance(
      DEFAULT_PROFILE,
      stateFor("haircare", {
        asked: ["concerns", "habits", "time", "constraints"],
        topics: ["hair_dry"],
      }),
    );
    expect(plan.state.stage).toBe("confirm");
    expect(plan.message).toContain("伺えていない");
  });
});

describe("手順の組み立て", () => {
  it("聞き取った内容に応じた手順が並ぶ", () => {
    const plan = buildCarePlan({
      expert: "haircare",
      profile: DEFAULT_PROFILE,
      topics: ["hair_dry"],
      habits: ["air_dry"],
    });
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.map((s) => s.order)).toEqual(
      plan.steps.map((_, i) => i + 1),
    );
    expect(plan.steps.some((s) => s.title.includes("毛先"))).toBe(true);
    expect(plan.steps.some((s) => s.title.includes("自然乾燥"))).toBe(true);
  });

  it("同じ聞き取り内容なら、同じ手順になる", () => {
    const args = {
      expert: "bodycare" as const,
      profile: DEFAULT_PROFILE,
      topics: ["body_dry"],
      habits: ["hot_bath"],
    };
    expect(buildCarePlan(args)).toEqual(buildCarePlan(args));
  });

  it("手順が重複しない", () => {
    const plan = buildCarePlan({
      expert: "bodycare",
      profile: DEFAULT_PROFILE,
      topics: ["body_dry", "body_itch", "body_rough"],
      habits: ["hot_bath", "scrub_wash"],
    });
    const titles = plan.steps.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("時間が取れないと伝えていれば、土台だけに絞って断りを入れる", () => {
    const profile = markStated(profileWith({ morningMinutes: 3 }), "morningMinutes");
    const full = buildCarePlan({
      expert: "haircare",
      profile: DEFAULT_PROFILE,
      topics: ["hair_volume", "hair_color"],
      habits: [],
    });
    const tight = buildCarePlan({
      expert: "haircare",
      profile,
      topics: ["hair_volume", "hair_color"],
      habits: [],
    });

    expect(tight.steps.length).toBeLessThan(full.steps.length);
    expect(tight.steps.every((s) => s.core)).toBe(true);
    expect(tight.cautions.some((c) => c.includes("外して"))).toBe(true);
  });

  it("何も伺えていなくても、土台は渡せる", () => {
    for (const expert of ["haircare", "bodycare", "healthcare"] as ExpertId[]) {
      const plan = buildCarePlan({
        expert,
        profile: DEFAULT_PROFILE,
        topics: [],
        habits: [],
      });
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.beforeBuying.length).toBeGreaterThan(0);
    }
  });

  it("買わない選択をしている場合、買い足しの案内を出さない", () => {
    const plan = buildCarePlan({
      expert: "bodycare",
      profile: profileWith({ allowPurchase: false }),
      topics: ["body_dry"],
      habits: [],
    });
    expect(plan.considerNext).toEqual([]);
    expect(plan.beforeBuying.length).toBeGreaterThan(0);
  });

  it("商品名は出さず、種類までにとどめる", () => {
    const plan = buildCarePlan({
      expert: "bodycare",
      profile: DEFAULT_PROFILE,
      topics: ["body_dry"],
      habits: [],
    });
    expect(plan.considerNext.length).toBeGreaterThan(0);
    expect(plan.scopeNote).toContain("商品名");
  });

  it("この相談で伺った条件を前提として明示する", () => {
    let profile = profileWith({ budgetYen: 0 });
    profile = markStated(profile, "budgetYen");

    const plan = buildCarePlan({
      expert: "haircare",
      profile,
      topics: ["hair_dry"],
      habits: [],
    });
    expect(plan.basis.some((b) => b.includes("買い足しはなし"))).toBe(true);
  });

  it("伺っていない条件を前提に並べない", () => {
    const plan = buildCarePlan({
      expert: "haircare",
      profile: DEFAULT_PROFILE,
      topics: ["hair_dry"],
      habits: [],
    });
    expect(plan.basis.some((b) => b.includes("円"))).toBe(false);
    expect(plan.basis.some((b) => b.includes("分"))).toBe(false);
  });

  it("スキーマに適合する", () => {
    const plan = buildCarePlan({
      expert: "healthcare",
      profile: DEFAULT_PROFILE,
      topics: ["sleep", "movement"],
      habits: ["late_night"],
    });
    expect(CarePlanSchema.safeParse(plan).success).toBe(true);
  });

  it("すべての文言が薬機法上の禁止表現を含まない", () => {
    const texts: string[] = [];

    for (const expert of ["haircare", "bodycare", "healthcare"] as ExpertId[]) {
      const definition = EXPERTS[expert];
      const topics = definition.concerns.map((c) => c.id);
      const habits = definition.habits.map((h) => h.id);

      // 一括と、1件ずつの両方を検査する（組み合わせで出る文言も拾うため）
      const plans = [
        buildCarePlan({ expert, profile: DEFAULT_PROFILE, topics, habits }),
        ...topics.map((t) =>
          buildCarePlan({ expert, profile: DEFAULT_PROFILE, topics: [t], habits: [] }),
        ),
        ...habits.map((h) =>
          buildCarePlan({ expert, profile: DEFAULT_PROFILE, topics: [], habits: [h] }),
        ),
      ];

      for (const plan of plans) {
        texts.push(plan.headline, ...plan.basis, ...plan.cautions);
        texts.push(...plan.beforeBuying, ...plan.considerNext);
        for (const s of plan.steps) texts.push(s.title, s.detail, s.cadence);
        if (plan.scopeNote) texts.push(plan.scopeNote);
      }

      texts.push(definition.opening, definition.tagline, definition.habitQuestion);
      texts.push(definition.constraintQuestion);
      for (const c of definition.concerns) texts.push(c.label, c.send);
      for (const h of definition.habits) texts.push(h.label, h.send);
    }

    const result = areExpressionsSafe(texts);
    expect(result.hits).toEqual([]);
    expect(result.safe).toBe(true);
  });
});

describe("ヘルスケアで扱える範囲", () => {
  it("体調そのものの相談は止める", () => {
    for (const text of [
      "最近ずっと動悸がします",
      "立ちくらみがひどいです",
      "何日も眠れていません",
      "体重が急に落ちました",
    ]) {
      const gate = evaluateSafety(text, "healthcare");
      expect(gate.kind, text).toBe("stop");
      expect(gate.notices[0].message).toContain("医療機関");
    }
  });

  it("薬・サプリ・減量の判断は引き受けない", () => {
    for (const text of [
      "このサプリを飲んでもいいですか",
      "市販薬と一緒に使えますか",
      "ダイエットのやり方を教えてください",
    ]) {
      const gate = evaluateSafety(text, "healthcare");
      expect(gate.kind, text).toBe("stop");
    }
  });

  it("つらさの訴えには相談窓口を案内し、提案はしない", () => {
    const gate = evaluateSafety("もう消えたいです", "healthcare");
    expect(gate.kind).toBe("stop");
    expect(gate.notices[0].message).toContain("0570-064-556");
  });

  it("生活習慣の相談はそのまま通す", () => {
    for (const text of [
      "夜更かしが続いていて、起きる時間がまちまちです",
      "座りっぱなしの日が多いです",
      "朝ごはんを抜くことが多いです",
    ]) {
      expect(evaluateSafety(text, "healthcare").kind, text).toBe("ok");
    }
  });

  it("湯温の話を発熱として止めない", () => {
    expect(evaluateSafety("お風呂は38度にしています", "bodycare").kind).toBe("ok");
    expect(evaluateSafety("40度のお湯で洗っています", "haircare").kind).toBe("ok");
  });

  it("妊娠中の相談は止めず、判断しないことを先に伝える", () => {
    const gate = evaluateSafety("妊娠中でも使えますか", "skincare");
    expect(gate.kind).toBe("ok");
    expect(gate.notices.some((n) => n.message.includes("判断は、このサービスでは行いません"))).toBe(
      true,
    );
  });
});

describe("分野の定義", () => {
  it("商品まで提案できるのはスキンケアだけ", () => {
    const withCatalog = EXPERT_IDS.filter((id) => EXPERTS[id].recommendsProducts);
    expect(withCatalog).toEqual(["skincare"]);
  });

  it("カタログを持たない分野は、その旨を明示している", () => {
    for (const id of EXPERT_IDS) {
      if (EXPERTS[id].recommendsProducts) continue;
      expect(EXPERTS[id].scopeNote, id).toBeTruthy();
    }
  });

  it("関心事の id が分野内で重複しない", () => {
    for (const id of EXPERT_IDS) {
      const ids = EXPERTS[id].concerns.map((c) => c.id);
      expect(new Set(ids).size, id).toBe(ids.length);
    }
  });
});
