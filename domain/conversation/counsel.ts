import type { Profile, ProfileField, Stage } from "@/schemas/profile";
import { isStated } from "@/schemas/profile";
import { CONCERN_LABEL, SKIN_LABEL } from "@/domain/recommendation/routine-builder";
import {
  DEFAULT_EXPERT,
  EXPERTS,
  toQuickReplies,
  topicLabel,
  type ExpertId,
} from "./experts";
import type { QuickReply } from "./quick-reply";

export type { QuickReply };

/**
 * 相談の進め方。
 *
 * 1往復で結論を出すと、聞かれてもいないことに答えられた感じになる。
 * 一度に一つだけ尋ね、答えを受け止めてから次へ進む。
 *
 * 進める順序:
 *   スキンケア: 気になっていること → 肌の傾向 → 朝の時間 → 予算 → 手持ち → 確認 → 提案
 *   その他の分野: 気になっていること → いまのやり方 → 使える時間 → 気をつけたいこと → 確認 → 提案
 *
 * すでに分かっている項目は飛ばす。
 * 「わからない」と言われたら、こちらで仮に置いて先へ進み、
 * 何を仮に置いたかを確認のときに伝える。
 *
 * 分野を切り替えても、伺った条件（時間・予算・避けたいもの）は
 * プロファイルに残るため引き継がれる。分野ごとの聞き取り内容は
 * parked に退避し、戻ってきたときに続きから再開する。
 *
 * この判断に AI は関与しない。同じ状況では同じ聞き方になる。
 */

/**
 * 段階の語彙はスキーマ側が持つ（schemas/profile）。
 * ここで再定義すると、API が受け付ける値とずれても気づけないため。
 */
export type { Stage };

/** 待機中の分野の進み具合 */
export type ExpertProgress = {
  expert: ExpertId;
  stage: Stage;
  asked: Stage[];
  topics: string[];
  habits: string[];
};

export type CounselState = {
  stage: Stage;
  /** すでに尋ねた段階（同じことを二度聞かない） */
  asked: Stage[];
  turn: number;
  /** いま話している分野 */
  expert: ExpertId;
  /** いまの分野で伺った関心事 */
  topics: string[];
  /** いまの分野で伺ったやり方・習慣 */
  habits: string[];
  /** 待機中の分野の進み具合。切り替えても失わない。 */
  parked: ExpertProgress[];
};

export const INITIAL_STATE: CounselState = {
  stage: "greeting",
  asked: [],
  turn: 0,
  expert: DEFAULT_EXPERT,
  topics: [],
  habits: [],
  parked: [],
};

export type TurnPlan = {
  state: CounselState;
  /** 受け止めの一言（省略可） */
  acknowledgement: string | null;
  /** 本文（質問または案内） */
  message: string;
  quickReplies: QuickReply[];
  /** この応答で組み立てるか（スキンケアはルーティン、他分野は手順） */
  propose: boolean;
  /** 手持ちの選択 UI を出すか */
  showInventoryPicker: boolean;
  /** 写真で登録する導線を出すか */
  offerPhoto: boolean;
};

/* ------------------------------------------------------------------ *
 * 受け止めの言葉
 * ------------------------------------------------------------------ */

/**
 * 直前の発言で分かったことを、こちらの言葉で言い直す。
 * 相手の言葉をそのまま返すと機械的になるため、要点だけを短く返す。
 */
function acknowledge(
  profile: Profile,
  learned: ProfileField[],
  expert: ExpertId,
  learnedTopics: string[],
): string | null {
  if (learnedTopics.length > 0) {
    const labels = learnedTopics
      .slice(0, 2)
      .map((t) => topicLabel(expert, t))
      .join("と");
    return `${labels}が気になっているんですね。`;
  }
  if (learned.includes("concerns") && profile.concerns.length > 0) {
    const labels = profile.concerns
      .slice(0, 2)
      .map((c) => CONCERN_LABEL[c] ?? c)
      .join("と");
    return `${labels}が気になっているんですね。`;
  }
  if (learned.includes("skinType")) {
    return `${SKIN_LABEL[profile.skinType]}なんですね。`;
  }
  if (learned.includes("morningMinutes")) {
    return profile.morningMinutes <= 3
      ? "朝はかなり慌ただしい感じですね。"
      : "朝の時間、教えていただきありがとうございます。";
  }
  if (learned.includes("budgetYen")) {
    return profile.budgetYen === 0
      ? "今は買い足さずに、という感じですね。"
      : `${profile.budgetYen.toLocaleString()}円くらいまで、ですね。`;
  }
  if (learned.includes("avoidIngredients") && profile.avoidIngredients.length > 0) {
    return "避けたいものも覚えておきますね。";
  }
  if (learned.includes("ownedProductIds")) {
    return "お持ちのもの、確認しました。";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 各段階の問いかけ（スキンケア）
 * ------------------------------------------------------------------ */

const CONCERN_CHIPS: QuickReply[] = toQuickReplies(EXPERTS.skincare.concerns);

const SKIN_CHIPS: QuickReply[] = [
  { label: "乾燥肌", send: "乾燥肌だと思います" },
  { label: "脂性肌", send: "脂性肌だと思います" },
  { label: "混合肌", send: "混合肌だと思います" },
  { label: "普通肌", send: "普通肌だと思います" },
  { label: "敏感肌", send: "敏感肌だと思います" },
  { label: "わからない", send: "自分の肌質はよくわかりません" },
];

const TIME_CHIPS: QuickReply[] = [
  { label: "3分もない", send: "朝は3分くらいしか時間がありません" },
  { label: "5分くらい", send: "朝は5分くらい使えます" },
  { label: "10分は取れる", send: "朝は10分くらい使えます" },
];

const BUDGET_CHIPS: QuickReply[] = [
  { label: "できれば買わずに", send: "できれば買い足さずに済ませたいです" },
  { label: "1,000円まで", send: "予算は1000円までです" },
  { label: "3,000円まで", send: "予算は3000円までです" },
  { label: "5,000円まで", send: "予算は5000円までです" },
];

const CONFIRM_CHIPS: QuickReply[] = [
  { label: "これで組んでください", send: "この内容で組み立ててください" },
  { label: "もう少し伝えたい", send: "もう少し伝えたいことがあります" },
];

const AFTERCARE_CHIPS: QuickReply[] = [
  { label: "時短版も見たい", send: "時間がない日の組み方も教えてください" },
  { label: "予算を変えたい", send: "予算を変えて計算し直してください" },
  { label: "別のものを足したい", send: "手持ちを追加したいです" },
];

/** スキンケア以外で、提案のあとに続けて話せること */
const DOMAIN_AFTERCARE_CHIPS: QuickReply[] = [
  { label: "もう少し詳しく", send: "いまの手順をもう少し詳しく教えてください" },
  { label: "気になることを足す", send: "ほかにも気になっていることがあります" },
  { label: "肌の相談に戻る", send: "肌のことも相談したいです" },
];

const NO_CONSTRAINT_CHIP: QuickReply = {
  label: "特にない",
  send: "特に気をつけていることはありません",
};

/* ------------------------------------------------------------------ *
 * 最初のひとこと
 *
 * 画面を開いた時点で、あいさつと最初の問いかけを済ませておく。
 * 「何か話しかけてください」とだけ出して待つと、
 * 相談の入口で手が止まってしまうため。
 * ------------------------------------------------------------------ */

export function openingMessage(
  now = new Date(),
  expert: ExpertId = DEFAULT_EXPERT,
): string {
  const h = now.getHours();
  const greeting =
    h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";

  return (
    `${greeting}。今日はどんなことでお困りですか。\n\n` +
    `${EXPERTS[expert].opening}` +
    "うまく言葉にならなければ、下から近いものを選んでいただくだけでも大丈夫です。"
  );
}

/** 最初から出しておく選択肢 */
export const OPENING_QUICK_REPLIES: QuickReply[] = CONCERN_CHIPS;

/** 最初の問いかけは済ませてある状態から始める */
export const OPENING_STATE: CounselState = {
  ...INITIAL_STATE,
  stage: "concerns",
  asked: ["concerns"],
};

/* ------------------------------------------------------------------ *
 * 分野の切り替え
 * ------------------------------------------------------------------ */

export type ExpertSwitch = {
  state: CounselState;
  /** 引き継いだ内容を明示する案内文 */
  message: string;
  quickReplies: QuickReply[];
};

/**
 * 分野を切り替える。
 *
 * 会話そのものは切り替えない。同じ相談の中で担当が代わるだけで、
 * 伺った条件はそのまま引き継ぐ。
 * 何を引き継いだかは、こちらから言葉にして返す。
 * 黙って持ち越すと、利用者側からは何が伝わっているのか分からないため。
 */
export function switchExpert(
  state: CounselState,
  to: ExpertId,
  profile: Profile,
): ExpertSwitch {
  const definition = EXPERTS[to];

  if (to === state.expert) {
    return {
      state,
      message: `いまも${definition.title}を承っています。続けてどうぞ。`,
      quickReplies: toQuickReplies(definition.concerns),
    };
  }

  /* いまの分野を退避する（戻ってきたときに続きから話せるように） */
  const parked: ExpertProgress[] = [
    ...state.parked.filter((p) => p.expert !== state.expert && p.expert !== to),
    {
      expert: state.expert,
      stage: state.stage,
      asked: state.asked,
      topics: state.topics,
      habits: state.habits,
    },
  ];

  const resumed = state.parked.find((p) => p.expert === to);

  const next: CounselState = {
    stage: resumed?.stage ?? "greeting",
    asked: resumed?.asked ?? [],
    turn: state.turn,
    expert: to,
    topics: resumed?.topics ?? [],
    habits: resumed?.habits ?? [],
    parked,
  };

  const carried = carriedOver(profile);
  const lines = [`${definition.title}に代わりました。${definition.tagline}`];

  if (carried.length > 0) {
    lines.push(
      "",
      `ここまでのお話は引き継いでいます（${carried.join(" / ")}）。同じことをもう一度伺うことはありません。`,
    );
  }
  if (definition.scopeNote) {
    lines.push("", definition.scopeNote);
  }

  /*
   * 続きから再開する場合はそう伝える。
   *
   * 分野によって聞き取りの持ち方が違う（スキンケアは手持ち商品、
   * ほかは関心事）ので、話が残っているかどうかは topics ではなく
   * 「一度でも尋ねたか」で判断する。
   * ここでは次の問いかけまでは書かない。実際に何を尋ねるかは
   * planTurn が決めるため、二重に問いかけないようにしている。
   */
  const resumable =
    resumed &&
    (resumed.asked.length > 0 ||
      resumed.topics.length > 0 ||
      resumed.habits.length > 0);

  if (resumable) {
    lines.push(
      "",
      resumed.topics.length > 0
        ? `前回この分野では ${resumed.topics
            .map((t) => topicLabel(to, t))
            .join("、")} を伺っていました。続きから進めます。`
        : "前回伺ったところから続けます。",
    );
  }

  return {
    state: next,
    message: lines.join("\n"),
    quickReplies: toQuickReplies(definition.concerns),
  };
}

/** 分野をまたいで引き継げる条件（利用者が実際に答えたものだけ） */
function carriedOver(profile: Profile): string[] {
  const carried: string[] = [];
  if (profile.concerns.length > 0) {
    carried.push(
      profile.concerns
        .slice(0, 2)
        .map((c) => CONCERN_LABEL[c] ?? c)
        .join("・"),
    );
  }
  if (isStated(profile, "morningMinutes")) {
    carried.push(`朝は${profile.morningMinutes}分`);
  }
  if (isStated(profile, "budgetYen")) {
    carried.push(
      profile.budgetYen === 0
        ? "買い足しなし"
        : `${profile.budgetYen.toLocaleString()}円まで`,
    );
  }
  if (profile.avoidIngredients.length > 0) {
    carried.push(`避けたい成分${profile.avoidIngredients.length}件`);
  }
  return carried;
}

/* ------------------------------------------------------------------ *
 * 進行の判断
 * ------------------------------------------------------------------ */

/** その項目をこちらが把握しているか */
function known(profile: Profile, field: ProfileField): boolean {
  if (field === "concerns") return profile.concerns.length > 0;
  if (field === "ownedProductIds") return profile.ownedProductIds.length > 0;
  return isStated(profile, field);
}

/**
 * 次に尋ねる段階を決める（スキンケア）。
 * すでに分かっている項目と、一度尋ねた項目は飛ばす。
 */
function nextSkincareStage(profile: Profile, asked: Stage[]): Stage {
  const pending = (stage: Stage, isKnown: boolean) =>
    !isKnown && !asked.includes(stage);

  if (pending("concerns", known(profile, "concerns"))) return "concerns";
  if (pending("skin", known(profile, "skinType"))) return "skin";
  if (pending("time", known(profile, "morningMinutes"))) return "time";
  if (pending("budget", known(profile, "budgetYen"))) return "budget";
  if (!known(profile, "ownedProductIds")) return "inventory";
  if (!asked.includes("confirm")) return "confirm";
  return "proposed";
}

/**
 * 次に尋ねる段階を決める（スキンケア以外）。
 *
 * 手持ち商品のカタログを持たない分野なので、在庫の確認は行わない。
 * 代わりに「いまどうしているか」を伺い、そこから手順を組み直す。
 */
function nextDomainStage(
  profile: Profile,
  asked: Stage[],
  topics: string[],
  habits: string[],
): Stage {
  if (topics.length === 0 && !asked.includes("concerns")) return "concerns";
  if (habits.length === 0 && !asked.includes("habits")) return "habits";
  if (!known(profile, "morningMinutes") && !asked.includes("time")) return "time";
  if (!asked.includes("constraints")) return "constraints";
  if (!asked.includes("confirm")) return "confirm";
  return "proposed";
}

/**
 * 1ターン分の応答を組み立てる。
 *
 * @param learned この発言で新たに分かったプロファイル項目
 * @param detected この発言で新たに拾えた、その分野の関心事・習慣
 * @param wantsProposal 利用者が明示的に「組み立てて」と言ったか
 */
export function planTurn(args: {
  profile: Profile;
  state: CounselState;
  learned: ProfileField[];
  wantsProposal: boolean;
  detected?: { topics: string[]; habits: string[] };
}): TurnPlan {
  const { profile, learned, wantsProposal } = args;
  const incoming = normalize(args.state);

  const learnedTopics = (args.detected?.topics ?? []).filter(
    (t) => !incoming.topics.includes(t),
  );
  const learnedHabits = (args.detected?.habits ?? []).filter(
    (h) => !incoming.habits.includes(h),
  );

  const state: CounselState = {
    ...incoming,
    turn: incoming.turn + 1,
    asked: [...incoming.asked],
    topics: [...incoming.topics, ...learnedTopics],
    habits: [...incoming.habits, ...learnedHabits],
  };

  const ack = acknowledge(profile, learned, state.expert, learnedTopics);

  return state.expert === "skincare"
    ? planSkincareTurn(profile, state, ack, learned, wantsProposal)
    : planDomainTurn(
        profile,
        state,
        ack,
        learned.length + learnedTopics.length + learnedHabits.length,
        wantsProposal,
      );
}

/* ------------------------------------------------------------------ *
 * スキンケア（手持ちのカタログを持つ分野）
 * ------------------------------------------------------------------ */

function planSkincareTurn(
  profile: Profile,
  state: CounselState,
  ack: string | null,
  learned: ProfileField[],
  wantsProposalNow: boolean,
): TurnPlan {
  const hasInventory = known(profile, "ownedProductIds");

  /* 提案済みのあとは、追加の相談を受ける */
  if (state.stage === "proposed" || state.stage === "aftercare") {
    const changed = learned.length > 0;
    return {
      state: { ...state, stage: changed ? "proposed" : "aftercare" },
      acknowledgement: ack,
      message: changed
        ? "いまの内容で組み直しました。"
        : "ほかに気になることがあれば、続けてどうぞ。",
      quickReplies: AFTERCARE_CHIPS,
      propose: changed,
      showInventoryPicker: false,
      offerPhoto: false,
    };
  }

  /* 「組み立てて」と言われ、手持ちがあるなら進む */
  if (wantsProposalNow && hasInventory) {
    return {
      state: { ...state, stage: "proposed", asked: [...state.asked, "confirm"] },
      acknowledgement: null,
      message: "ありがとうございます。いまの内容で組んでみますね。",
      quickReplies: [],
      propose: true,
      showInventoryPicker: false,
      offerPhoto: false,
    };
  }

  const stage = nextSkincareStage(profile, state.asked);
  const asked = state.asked.includes(stage) ? state.asked : [...state.asked, stage];
  const next = { ...state, stage, asked };

  switch (stage) {
    case "concerns":
      return {
        state: next,
        acknowledgement: ack,
        message:
          "今、肌のことでいちばん気になっているのはどんなところですか。\nうまく言葉にならなければ、近いものを選んでいただくだけでも大丈夫です。",
        quickReplies: CONCERN_CHIPS,
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    case "skin":
      return {
        state: next,
        acknowledgement: ack,
        message:
          "普段のお肌は、どちらかというとどんな感じでしょうか。\n季節で変わる方も多いので、最近の状態で構いません。",
        quickReplies: SKIN_CHIPS,
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    case "time":
      return {
        state: next,
        acknowledgement: ack,
        message:
          "朝の支度で、スキンケアにどれくらい時間を使えますか。\n続けられる形にしたいので、正直なところで教えてください。",
        quickReplies: TIME_CHIPS,
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    case "budget":
      return {
        state: next,
        acknowledgement: ack,
        message:
          "もし足りないものがあった場合、いくらまでなら考えられますか。\n買わずに済むならその方がいい、という前提で見ていきます。",
        quickReplies: BUDGET_CHIPS,
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    case "inventory":
      return {
        state: next,
        acknowledgement: ack,
        message:
          "最後に、いま使っているものを教えてください。\n写真を撮っていただければ、こちらで読み取ります。一覧から選んでいただいても大丈夫です。\n使い切っていないものは、あまり使えていないものも含めて挙げてみてください。",
        quickReplies: [],
        propose: false,
        showInventoryPicker: true,
        offerPhoto: true,
      };

    case "confirm":
      return {
        state: next,
        acknowledgement: ack,
        message: buildConfirmation(profile),
        quickReplies: CONFIRM_CHIPS,
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    default:
      return {
        state: { ...state, stage: "proposed" },
        acknowledgement: ack,
        message: "それでは、いまの内容で組んでみますね。",
        quickReplies: [],
        propose: true,
        showInventoryPicker: false,
        offerPhoto: false,
      };
  }
}

/* ------------------------------------------------------------------ *
 * ヘアケア・ボディケア・ヘルスケア
 * ------------------------------------------------------------------ */

function planDomainTurn(
  profile: Profile,
  state: CounselState,
  ack: string | null,
  learnedCount: number,
  wantsProposalNow: boolean,
): TurnPlan {
  const definition = EXPERTS[state.expert];

  if (state.stage === "proposed" || state.stage === "aftercare") {
    const changed = learnedCount > 0;
    return {
      state: { ...state, stage: changed ? "proposed" : "aftercare" },
      acknowledgement: ack,
      message: changed
        ? "伺った内容を足して、手順を組み直しました。"
        : "ほかに気になることがあれば、続けてどうぞ。ほかの分野の相談へ移ることもできます。",
      quickReplies: DOMAIN_AFTERCARE_CHIPS,
      propose: changed,
      showInventoryPicker: false,
      offerPhoto: false,
    };
  }

  /*
   * 「組み立てて」と言われたとき。
   * 何も伺えていない状態で組むと、当たり障りのない一般論になる。
   * せめて気になっていることだけは先に伺う。
   */
  if (wantsProposalNow && state.topics.length > 0) {
    return {
      state: { ...state, stage: "proposed", asked: [...state.asked, "confirm"] },
      acknowledgement: null,
      message: "ありがとうございます。いまの内容で組んでみますね。",
      quickReplies: [],
      propose: true,
      showInventoryPicker: false,
      offerPhoto: false,
    };
  }

  const stage = nextDomainStage(profile, state.asked, state.topics, state.habits);
  const asked = state.asked.includes(stage) ? state.asked : [...state.asked, stage];
  const next = { ...state, stage, asked };

  switch (stage) {
    case "concerns":
      return {
        state: next,
        acknowledgement: ack,
        message: definition.opening,
        quickReplies: toQuickReplies(definition.concerns),
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    case "habits":
      return {
        state: next,
        acknowledgement: ack,
        message: definition.habitQuestion,
        quickReplies: toQuickReplies(definition.habits),
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    case "time":
      return {
        state: next,
        acknowledgement: ack,
        message:
          "朝の支度に、どれくらい時間を使えますか。\n続けられる形にしたいので、正直なところで教えてください。",
        quickReplies: TIME_CHIPS,
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    case "constraints":
      return {
        state: next,
        acknowledgement: ack,
        message: definition.constraintQuestion,
        quickReplies: [NO_CONSTRAINT_CHIP],
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    case "confirm":
      return {
        state: next,
        acknowledgement: ack,
        message: buildDomainConfirmation(profile, state),
        quickReplies: CONFIRM_CHIPS,
        propose: false,
        showInventoryPicker: false,
        offerPhoto: false,
      };

    default:
      return {
        state: { ...state, stage: "proposed" },
        acknowledgement: ack,
        message: "それでは、いまの内容で組んでみますね。",
        quickReplies: [],
        propose: true,
        showInventoryPicker: false,
        offerPhoto: false,
      };
  }
}

/**
 * ここまでの整理を読み上げて確認する（スキンケア）。
 *
 * こちらが仮に置いた項目は「伺っていないので仮に」と明示する。
 * 言っていないことを「あなたはこう言いました」と扱わないため。
 */
function buildConfirmation(profile: Profile): string {
  const lines: string[] = [];

  if (profile.concerns.length > 0) {
    lines.push(
      `・気になっているのは ${profile.concerns.map((c) => CONCERN_LABEL[c] ?? c).join("、")}`,
    );
  }
  lines.push(
    isStated(profile, "skinType")
      ? `・肌は ${SKIN_LABEL[profile.skinType]}`
      : `・肌の傾向は伺えていないので、${SKIN_LABEL[profile.skinType]}として見ています`,
  );
  lines.push(
    isStated(profile, "morningMinutes")
      ? `・朝に使えるのは ${profile.morningMinutes}分`
      : `・朝の時間は伺えていないので、${profile.morningMinutes}分として見ています`,
  );
  lines.push(
    isStated(profile, "budgetYen")
      ? profile.budgetYen === 0
        ? "・買い足しはなしで"
        : `・買い足しは ${profile.budgetYen.toLocaleString()}円まで`
      : `・予算は伺えていないので、${profile.budgetYen.toLocaleString()}円までとして見ています`,
  );
  if (profile.avoidIngredients.length > 0) {
    lines.push(`・避けたいものが ${profile.avoidIngredients.length}件`);
  }
  lines.push(`・お持ちのものが ${profile.ownedProductIds.length}点`);

  return [
    "ここまでを整理すると、こんな形でしょうか。",
    "",
    ...lines,
    "",
    "違っているところがあれば教えてください。このままで良ければ、組み立てます。",
  ].join("\n");
}

/** ここまでの整理を読み上げて確認する（スキンケア以外） */
function buildDomainConfirmation(profile: Profile, state: CounselState): string {
  const lines: string[] = [];

  lines.push(
    state.topics.length > 0
      ? `・気になっているのは ${state.topics
          .map((t) => topicLabel(state.expert, t))
          .join("、")}`
      : "・気になっているところは伺えていないので、まずは土台から整えます",
  );
  lines.push(
    state.habits.length > 0
      ? `・いまのやり方は ${state.habits
          .map((h) => topicLabel(state.expert, h))
          .join("、")}`
      : "・いまのやり方は伺えていないので、一般的な形を前提に置いています",
  );
  lines.push(
    isStated(profile, "morningMinutes")
      ? `・朝に使えるのは ${profile.morningMinutes}分`
      : `・朝の時間は伺えていないので、${profile.morningMinutes}分として見ています`,
  );

  const carried = carriedOver(profile);
  if (carried.length > 0) {
    lines.push(`・ほかの相談から引き継いだ条件: ${carried.join(" / ")}`);
  }

  return [
    "ここまでを整理すると、こんな形でしょうか。",
    "",
    ...lines,
    "",
    "違っているところがあれば教えてください。このままで良ければ、組み立てます。",
  ].join("\n");
}

/**
 * 古い形の状態を受け取っても壊れないようにする。
 * 保存済みの相談ログや、更新前のクライアントから届く場合がある。
 */
function normalize(state: CounselState): CounselState {
  return {
    stage: state.stage,
    asked: state.asked ?? [],
    turn: state.turn ?? 0,
    expert: state.expert ?? DEFAULT_EXPERT,
    topics: state.topics ?? [],
    habits: state.habits ?? [],
    parked: state.parked ?? [],
  };
}

/** 利用者が「組み立てて」と求めているか（決定論的な判定） */
const PROPOSE_INTENT =
  /組み(立て|直し|なおし)|作って|提案して|お願いします|これで|それで(い|良)い|大丈夫です|進めて/;

export function wantsProposal(message: string): boolean {
  return PROPOSE_INTENT.test(message);
}
