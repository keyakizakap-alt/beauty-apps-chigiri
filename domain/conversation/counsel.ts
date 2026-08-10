import type { Profile, ProfileField } from "@/schemas/profile";
import { isStated } from "@/schemas/profile";
import { CONCERN_LABEL, SKIN_LABEL } from "@/domain/recommendation/routine-builder";

/**
 * 相談の進め方。
 *
 * 1往復で結論を出すと、聞かれてもいないことに答えられた感じになる。
 * 一度に一つだけ尋ね、答えを受け止めてから次へ進む。
 *
 * 進める順序:
 *   気になっていること → 肌の傾向 → 朝の時間 → 予算 → 手持ち → 確認 → 提案
 *
 * すでに分かっている項目は飛ばす。
 * 「わからない」と言われたら、こちらで仮に置いて先へ進み、
 * 何を仮に置いたかを確認のときに伝える。
 *
 * この判断に AI は関与しない。同じ状況では同じ聞き方になる。
 */

export type Stage =
  | "greeting"
  | "concerns"
  | "skin"
  | "time"
  | "budget"
  | "inventory"
  | "confirm"
  | "proposed"
  | "aftercare";

export type CounselState = {
  stage: Stage;
  /** すでに尋ねた段階（同じことを二度聞かない） */
  asked: Stage[];
  turn: number;
};

export const INITIAL_STATE: CounselState = {
  stage: "greeting",
  asked: [],
  turn: 0,
};

export type QuickReply = {
  label: string;
  /** 押したときに送る文章 */
  send: string;
};

export type TurnPlan = {
  state: CounselState;
  /** 受け止めの一言（省略可） */
  acknowledgement: string | null;
  /** 本文（質問または案内） */
  message: string;
  quickReplies: QuickReply[];
  /** この応答でルーティンを組み立てるか */
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
function acknowledge(profile: Profile, learned: ProfileField[]): string | null {
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
 * 各段階の問いかけ
 * ------------------------------------------------------------------ */

const CONCERN_CHIPS: QuickReply[] = [
  { label: "乾燥", send: "乾燥が気になります" },
  { label: "毛穴", send: "毛穴が気になります" },
  { label: "ベタつき", send: "皮脂やベタつきが気になります" },
  { label: "くすみ", send: "くすみが気になります" },
  { label: "肌あれ", send: "肌あれしやすいです" },
  { label: "日によってゆらぐ", send: "日によって肌がゆらぎます" },
];

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

/* ------------------------------------------------------------------ *
 * 最初のひとこと
 *
 * 画面を開いた時点で、あいさつと最初の問いかけを済ませておく。
 * 「何か話しかけてください」とだけ出して待つと、
 * 相談の入口で手が止まってしまうため。
 * ------------------------------------------------------------------ */

export function openingMessage(now = new Date()): string {
  const h = now.getHours();
  const greeting =
    h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";

  return (
    `${greeting}。今日はどんなことでお困りですか。\n\n` +
    "肌のことでいちばん気になっているところから、ゆっくり聞かせてください。" +
    "うまく言葉にならなければ、下から近いものを選んでいただくだけでも大丈夫です。"
  );
}

/** 最初から出しておく選択肢 */
export const OPENING_QUICK_REPLIES: QuickReply[] = CONCERN_CHIPS;

/** 最初の問いかけは済ませてある状態から始める */
export const OPENING_STATE: CounselState = {
  stage: "concerns",
  asked: ["concerns"],
  turn: 0,
};

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
 * 次に尋ねる段階を決める。
 * すでに分かっている項目と、一度尋ねた項目は飛ばす。
 */
function nextStage(profile: Profile, asked: Stage[]): Stage {
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
 * 1ターン分の応答を組み立てる。
 *
 * @param learned この発言で新たに分かった項目
 * @param wantsProposal 利用者が明示的に「組み立てて」と言ったか
 */
export function planTurn(args: {
  profile: Profile;
  state: CounselState;
  learned: ProfileField[];
  wantsProposal: boolean;
}): TurnPlan {
  const { profile, learned, wantsProposal } = args;
  const state: CounselState = {
    ...args.state,
    turn: args.state.turn + 1,
    asked: [...args.state.asked],
  };

  const ack = acknowledge(profile, learned);
  const hasInventory = known(profile, "ownedProductIds");

  /* 提案済みのあとは、追加の相談を受ける */
  if (state.stage === "proposed" || state.stage === "aftercare") {
    // 手持ちが増えた・条件が変わったなら組み直す
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
  if (wantsProposal && hasInventory) {
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

  const stage = nextStage(profile, state.asked);
  const asked = state.asked.includes(stage) ? state.asked : [...state.asked, stage];

  switch (stage) {
    case "concerns":
      return {
        state: { ...state, stage, asked },
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
        state: { ...state, stage, asked },
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
        state: { ...state, stage, asked },
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
        state: { ...state, stage, asked },
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
        state: { ...state, stage, asked },
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
        state: { ...state, stage, asked },
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

/**
 * ここまでの整理を読み上げて確認する。
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

/** 利用者が「組み立てて」と求めているか（決定論的な判定） */
const PROPOSE_INTENT =
  /組み(立て|直し|なおし)|作って|提案して|お願いします|これで|それで(い|良)い|大丈夫です|進めて/;

export function wantsProposal(message: string): boolean {
  return PROPOSE_INTENT.test(message);
}
