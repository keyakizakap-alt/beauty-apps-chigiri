import type { Profile } from "@/schemas/profile";
import { isStated } from "@/schemas/profile";
import { DISCLAIMER } from "@/domain/recommendation/safety-rules";
import { EXPERTS, topicLabel, type ExpertId } from "./experts";

/**
 * 髪・体・生活の「手順の組み立て」。
 *
 * スキンケアはカタログがあるため商品まで確定できるが、
 * この3分野は商品データを持っていない。
 * 持っていないものを持っているふりはせず、
 * 「いま使っているものと、やり方の順番」だけを決定論的に組み立てる。
 *
 * ここに AI は関与しない。同じ聞き取り内容なら、必ず同じ手順になる。
 */

export type CareStep = {
  order: number;
  title: string;
  detail: string;
  /** どれくらいの頻度で行うか */
  cadence: string;
  /** 時間が取れない日でも残す土台か */
  core: boolean;
};

export type CarePlan = {
  expert: ExpertId;
  headline: string;
  /** 何を前提に組んだか（この相談の中で伺ったことだけ） */
  basis: string[];
  steps: CareStep[];
  cautions: string[];
  /** 買う前に、手持ちと習慣で試せること */
  beforeBuying: string[];
  /** それでも足りないときに検討する「種類」（商品名は挙げない） */
  considerNext: string[];
  /** この分野で扱える範囲 */
  scopeNote: string | null;
  disclaimer: string;
};

type Draft = {
  title: string;
  detail: string;
  cadence: string;
  core: boolean;
};

type Rule = {
  steps?: Draft[];
  cautions?: string[];
  beforeBuying?: string[];
  considerNext?: string[];
};

/* ------------------------------------------------------------------ *
 * ヘアケア
 * ------------------------------------------------------------------ */

const HAIR_BASE: Draft[] = [
  {
    title: "洗う前に、ぬるま湯でしっかり流す",
    detail:
      "38度くらいのぬるま湯で1分ほど流すと、汚れの多くはこの時点で落ちます。シャンプーの量を減らせるので、頭皮への負担も小さくなります。",
    cadence: "毎回",
    core: true,
  },
  {
    title: "タオルで水気を取ってから乾かす",
    detail:
      "濡れたままの髪は表面が開いた状態です。タオルで押さえて水気を取り、ドライヤーは根元 → 中間 → 毛先の順に当てます。最後に冷風を通すと落ち着きます。",
    cadence: "毎回",
    core: true,
  },
];

const HAIR_RULES: Record<string, Rule> = {
  hair_dry: {
    steps: [
      {
        title: "洗い流さないケアは毛先から",
        detail:
          "オイルやミルクは毛先 → 中間の順につけ、根元には付けません。根元から付けるとべたつきやすく、毛先には足りなくなります。",
        cadence: "乾かす前に毎回",
        core: true,
      },
    ],
    beforeBuying: [
      "いまお持ちのトリートメントやオイルを、量ではなく「つける順番」から見直してみてください。",
    ],
    considerNext: ["洗い流さないタイプの保湿（ヘアオイル・ヘアミルク）"],
  },
  hair_frizz: {
    steps: [
      {
        title: "8割で止めず、乾かし切る",
        detail:
          "半乾きのまま置くと、乾いていく過程でうねりが出やすくなります。根元を起こしながら乾かし、最後に冷風で形を固定します。",
        cadence: "毎回",
        core: true,
      },
    ],
    beforeBuying: ["乾かし切るだけで収まる日があるか、3日ほど試してみてください。"],
  },
  hair_damage: {
    steps: [
      {
        title: "熱を当てる時間を短くする",
        detail:
          "アイロンは温度を下げて、同じ場所に何度も往復させないほうが負担が小さくなります。濡れた髪や半乾きの髪には当てないでください。",
        cadence: "使う日は毎回",
        core: true,
      },
    ],
    cautions: [
      "傷んだ部分そのものが元に戻ることはありません。これ以上増やさない方向で考えます。",
    ],
  },
  scalp_oil: {
    steps: [
      {
        title: "指の腹で頭皮を洗い、すすぎを長めに",
        detail:
          "泡を頭皮につけ、爪を立てずに指の腹で動かします。すすぎは洗っていた時間より長めに取ると、残りにくくなります。",
        cadence: "毎回",
        core: true,
      },
    ],
    cautions: [
      "一日に何度も洗うと、かえって皮脂が出やすくなることがあります。まずは回数を増やさずに洗い方だけ変えてみてください。",
    ],
  },
  scalp_dry: {
    steps: [
      {
        title: "お湯の温度を下げる",
        detail:
          "38度前後のぬるま湯にすると、頭皮の乾燥やかゆみが出にくくなります。熱いお湯ほどさっぱりしますが、乾きも早くなります。",
        cadence: "毎回",
        core: true,
      },
    ],
    cautions: [
      "かゆみが強い、フケの範囲が広がっている、赤みがあるときは、洗い方の範囲を超えています。皮膚科へご相談ください。",
    ],
  },
  hair_volume: {
    steps: [
      {
        title: "根元を起こしてから乾かす",
        detail:
          "分け目と逆の方向に風を当てて根元を立ち上げ、最後に流したい方向へ整えます。順番を逆にすると寝てしまいます。",
        cadence: "毎回",
        core: false,
      },
    ],
  },
  hair_color: {
    steps: [
      {
        title: "洗う温度と回数を見直す",
        detail:
          "熱いお湯と洗いすぎは色が抜けやすくなります。染めた直後の2〜3日はぬるめのお湯で、回数も控えめにします。",
        cadence: "染めた直後の数日",
        core: false,
      },
    ],
  },
};

const HAIR_HABIT_RULES: Record<string, Rule> = {
  air_dry: {
    steps: [
      {
        title: "自然乾燥をやめて、短時間でも乾かす",
        detail:
          "濡れたまま置く時間が長いほど、頭皮も髪も負担を受けます。全部乾かす時間がない日でも、根元だけは乾かしてください。",
        cadence: "毎回",
        core: true,
      },
    ],
  },
  heat_styling: {
    cautions: [
      "アイロンやコテを使う日は、乾かし切ってから当ててください。半乾きの髪に高温を当てると傷みやすくなります。",
    ],
  },
  wash_daily: {
    beforeBuying: [
      "毎日洗っているなら、シャンプーを変える前に「洗う量」と「すすぎの長さ」を先に見直すほうが変化が分かりやすいです。",
    ],
  },
  treatment: {
    beforeBuying: [
      "いま使っているトリートメントを、つける場所（毛先中心）と置く時間から見直してみてください。買い足す前にできることが残っています。",
    ],
  },
};

/* ------------------------------------------------------------------ *
 * ボディケア
 * ------------------------------------------------------------------ */

const BODY_BASE: Draft[] = [
  {
    title: "お風呂上がり5分以内に塗る",
    detail:
      "水気を拭いたらすぐ塗るのが、いちばん差が出るところです。時間が経つほど乾いていくので、着替えの前に済ませてしまうと続きます。",
    cadence: "毎日",
    core: true,
  },
];

const BODY_RULES: Record<string, Rule> = {
  body_dry: {
    steps: [
      {
        title: "泡で洗って、こすらない",
        detail:
          "泡を手に取って、肌の上をすべらせるだけで足ります。強くこすると必要なうるおいまで落ちてしまいます。",
        cadence: "毎回",
        core: true,
      },
    ],
    beforeBuying: [
      "顔用の乳液やクリーム、ワセリンが余っていれば、体にも使えます。新しく買う前に手持ちを見てください。",
    ],
    considerNext: ["体用の保湿（ボディクリーム・ボディミルク）"],
  },
  body_itch: {
    steps: [
      {
        title: "お湯の温度を下げ、長湯を控える",
        detail:
          "38〜40度で、つかる時間は短めに。熱いお湯ほどさっぱりしますが、乾いてかゆくなりやすくなります。",
        cadence: "毎日",
        core: true,
      },
    ],
    cautions: [
      "かゆみが強い、かき壊している、範囲が広がっているときは、化粧品でできる範囲を超えています。皮膚科へご相談ください。",
    ],
  },
  body_rough: {
    steps: [
      {
        title: "ひじ・ひざ・かかとは湯上がりのやわらかいうちに",
        detail:
          "厚くなっている部分は、乾いてからでは入っていきません。湯上がりのやわらかいうちに、重ねて塗ります。",
        cadence: "毎日",
        core: false,
      },
    ],
    considerNext: ["厚くなった部分向けの保湿（尿素配合・ワセリンなど）"],
  },
  body_bumps: {
    steps: [
      {
        title: "洗い残しと汗を、そのままにしない",
        detail:
          "背中はすすぎ残しが起きやすい場所です。髪をすすいだあとに体を流す順番にすると残りにくくなります。汗をかいた日は早めに着替えます。",
        cadence: "毎日",
        core: true,
      },
    ],
    cautions: [
      "範囲が広い、痛みがある、長く続いているときは、化粧品でできる範囲を超えています。医療機関へご相談ください。",
    ],
  },
  body_odor: {
    steps: [
      {
        title: "汗をかいたら早めに押さえる",
        detail:
          "乾いたタオルでこするより、濡れたタオルで押さえるほうが残りにくくなります。着替えられる日は着替えるのがいちばん確実です。",
        cadence: "汗をかいた日",
        core: false,
      },
    ],
  },
  body_uv: {
    steps: [
      {
        title: "腕と首の後ろだけでも塗る",
        detail:
          "全身は続きません。日が当たる腕と首の後ろに絞ると続きます。汗をかく日は2〜3時間おきに塗り直します。",
        cadence: "日差しのある日",
        core: false,
      },
    ],
    beforeBuying: [
      "顔用の日焼け止めが余っていれば、まず腕と首の後ろに使ってみてください。",
    ],
  },
};

const BODY_HABIT_RULES: Record<string, Rule> = {
  hot_bath: {
    steps: [
      {
        title: "湯温を38〜40度にする",
        detail:
          "熱いお湯は気持ちよさの代わりに、乾きやすさを連れてきます。まず1〜2度下げるところから試してみてください。",
        cadence: "毎日",
        core: true,
      },
    ],
  },
  scrub_wash: {
    steps: [
      {
        title: "ナイロンタオルをやめる",
        detail:
          "手か、やわらかい布に変えるだけで、ざらつきやかゆみが落ち着くことがあります。まず2週間、こすらずに洗ってみてください。",
        cadence: "毎回",
        core: true,
      },
    ],
  },
  no_moisturize: {
    beforeBuying: [
      "まだ何も塗っていないなら、新しく買う前に、家にある乳液やワセリンで1週間試してみてください。それで足りるかどうかが先に分かります。",
    ],
  },
  body_lotion: {
    beforeBuying: [
      "いまお使いのボディクリームを、塗る量ではなく「塗るタイミング」から見直してみてください。湯上がり5分以内かどうかで変わります。",
    ],
  },
  shower_only: {
    cautions: [
      "シャワーだけの日も、上がったあとの乾きやすさは同じです。塗るタイミングは変えずに続けてください。",
    ],
  },
};

/* ------------------------------------------------------------------ *
 * ヘルスケア（生活習慣の整理のみ）
 * ------------------------------------------------------------------ */

const HEALTH_BASE: Draft[] = [
  {
    title: "起きる時刻をひとつ決める",
    detail:
      "寝る時刻より、起きる時刻を揃えるほうが整えやすくなります。休みの日も1時間以内のずれに収まると、翌週が楽になります。",
    cadence: "毎日",
    core: true,
  },
];

const HEALTH_RULES: Record<string, Rule> = {
  sleep: {
    steps: [
      {
        title: "寝る前1時間の過ごし方を決めておく",
        detail:
          "「何をやめるか」より「何をするか」を先に決めておくほうが続きます。部屋を暗くする、明日の服を出す、といった短い動作で構いません。",
        cadence: "毎晩",
        core: true,
      },
    ],
  },
  hydration: {
    steps: [
      {
        title: "起きてすぐコップ1杯",
        detail:
          "回数を増やすより、決まった場面に紐づけるほうが続きます。まずは起床時の1杯だけを固定してみてください。",
        cadence: "毎朝",
        core: false,
      },
    ],
  },
  meals: {
    steps: [
      {
        title: "朝に何かひとつ口に入れる",
        detail:
          "量より時刻を揃えるほうが続きます。果物ひとつ、汁物1杯でも構いません。食べる時刻が毎日同じことのほうが大事です。",
        cadence: "毎朝",
        core: false,
      },
    ],
  },
  movement: {
    steps: [
      {
        title: "1日1回、10分だけ歩く時間を決める",
        detail:
          "運動の時間を新しく作るより、すでにある移動を10分だけ長くするほうが続きます。ひと駅手前で降りる、昼に外へ出る、などです。",
        cadence: "毎日",
        core: false,
      },
    ],
  },
  screen: {
    steps: [
      {
        title: "寝る30分前に、画面を置く場所を決める",
        detail:
          "時間で我慢するより、場所を決めるほうが守れます。充電器を寝室の外に移すだけでも変わります。",
        cadence: "毎晩",
        core: false,
      },
    ],
  },
  pace: {
    steps: [
      {
        title: "何もしない10分を、先に予定へ入れる",
        detail:
          "空いたら休む、では空きません。先に予定として置いておくほうが残ります。短い時間でも、毎日同じ時刻にあることが大事です。",
        cadence: "毎日",
        core: false,
      },
    ],
  },
};

const HEALTH_HABIT_RULES: Record<string, Rule> = {
  late_night: {
    steps: [
      {
        title: "就寝を15分ずつ前へ動かす",
        detail:
          "一気に2時間早めても戻ってしまいます。1週間ごとに15分ずつなら、無理なく寄せられます。",
        cadence: "1週間ごと",
        core: false,
      },
    ],
  },
  irregular_wake: {
    cautions: [
      "起きる時刻のばらつきが大きいと、他の習慣も揃いにくくなります。まずここから固定するのがおすすめです。",
    ],
  },
  skip_breakfast: {
    beforeBuying: [
      "何かを買い足す前に、家にあるもので「朝に口へ入れるものをひとつ決める」ところから始めてみてください。",
    ],
  },
  desk_bound: {
    steps: [
      {
        title: "1時間に1回、立ち上がる合図を決める",
        detail:
          "時間を計るより、区切りに紐づけるほうが続きます。会議の終わり、飲み物を取りに行くタイミングなどで構いません。",
        cadence: "日中",
        core: false,
      },
    ],
  },
  night_screen: {
    cautions: [
      "寝る直前の画面は、眠りにつくまでの時間に影響することがあります。置き場所を変えるところから試してみてください。",
    ],
  },
};

/* ------------------------------------------------------------------ */

const BASE: Record<ExpertId, Draft[]> = {
  skincare: [],
  haircare: HAIR_BASE,
  bodycare: BODY_BASE,
  healthcare: HEALTH_BASE,
};

const TOPIC_RULES: Record<ExpertId, Record<string, Rule>> = {
  skincare: {},
  haircare: HAIR_RULES,
  bodycare: BODY_RULES,
  healthcare: HEALTH_RULES,
};

const HABIT_RULES: Record<ExpertId, Record<string, Rule>> = {
  skincare: {},
  haircare: HAIR_HABIT_RULES,
  bodycare: BODY_HABIT_RULES,
  healthcare: HEALTH_HABIT_RULES,
};

/** 何も挙がらなかったときに、それでも渡せる土台 */
const FALLBACK_HEADLINE: Record<ExpertId, string> = {
  skincare: "いまの手順を整理しました",
  haircare: "まずは洗い方と乾かし方を整えます",
  bodycare: "まずはお風呂上がりの手順を整えます",
  healthcare: "まずは起きる時刻から整えます",
};

/** 時間が足りない日に何を残すかの目安（分） */
const TIGHT_MINUTES = 3;

export function buildCarePlan(args: {
  expert: ExpertId;
  profile: Profile;
  topics: string[];
  habits: string[];
}): CarePlan {
  const { expert, profile, topics, habits } = args;
  const definition = EXPERTS[expert];

  const rules: Rule[] = [
    ...topics.map((t) => TOPIC_RULES[expert][t]).filter(Boolean),
    ...habits.map((h) => HABIT_RULES[expert][h]).filter(Boolean),
  ];

  /* 手順。土台を先に置き、聞き取った内容の分を後ろへ足す。 */
  const drafts: Draft[] = [...BASE[expert]];
  for (const rule of rules) {
    for (const step of rule.steps ?? []) drafts.push(step);
  }

  const seen = new Set<string>();
  let deduped = drafts.filter((d) => {
    if (seen.has(d.title)) return false;
    seen.add(d.title);
    return true;
  });

  /*
   * 使える時間が短い場合は、土台だけに絞る。
   * 全部渡して「できませんでした」になるより、
   * 残るものを渡したほうが続く。
   */
  const tight = isStated(profile, "morningMinutes") && profile.morningMinutes <= TIGHT_MINUTES;
  const dropped = tight ? deduped.filter((d) => !d.core).length : 0;
  if (tight) deduped = deduped.filter((d) => d.core);

  const steps: CareStep[] = deduped.map((d, i) => ({
    order: i + 1,
    title: d.title,
    detail: d.detail,
    cadence: d.cadence,
    core: d.core,
  }));

  /* 注意 */
  const cautions = unique(rules.flatMap((r) => r.cautions ?? []));
  if (dropped > 0) {
    cautions.push(
      `時間が取りにくいと伺ったので、余裕のある日向けの手順を${dropped}件外して、土台だけにしています。時間が取れる日は足してみてください。`,
    );
  }

  /* 買う前にできること */
  const beforeBuying = unique(rules.flatMap((r) => r.beforeBuying ?? []));
  if (beforeBuying.length === 0) {
    beforeBuying.push(
      "いまお使いのものを続けたまま、上の手順だけを2週間ほど変えてみてください。買い足すかどうかは、そのあとで判断できます。",
    );
  }

  /* それでも足りないときに検討するもの */
  const considerNext = unique(rules.flatMap((r) => r.considerNext ?? []));

  return {
    expert,
    headline: buildHeadline(expert, topics),
    basis: buildBasis(profile, topics, expert),
    steps,
    cautions,
    beforeBuying,
    considerNext: profile.allowPurchase ? considerNext : [],
    scopeNote: definition.scopeNote,
    disclaimer: DISCLAIMER,
  };
}

function buildHeadline(expert: ExpertId, topics: string[]): string {
  if (topics.length === 0) return FALLBACK_HEADLINE[expert];
  const labels = topics.slice(0, 2).map((t) => topicLabel(expert, t));
  return `${labels.join("と")}に向けて、いまのやり方を組み直しました`;
}

/**
 * 何を前提に組んだか。
 *
 * この相談の中で伺ったことだけを並べる。
 * 相談は分野ごとに独立しているため、ほかの分野で話した内容を
 * 「知っている」ことにしない。伺っていない項目も前提に並べない。
 */
function buildBasis(
  profile: Profile,
  topics: string[],
  expert: ExpertId,
): string[] {
  const basis: string[] = [];

  if (topics.length > 0) {
    basis.push(
      `気になっているのは ${topics.map((t) => topicLabel(expert, t)).join("、")}`,
    );
  }
  if (isStated(profile, "morningMinutes")) {
    basis.push(`朝に使えるのは ${profile.morningMinutes}分`);
  }
  if (isStated(profile, "budgetYen")) {
    basis.push(
      profile.budgetYen === 0
        ? "買い足しはなしで"
        : `買い足しは ${profile.budgetYen.toLocaleString()}円まで`,
    );
  }
  if (profile.avoidIngredients.length > 0) {
    basis.push(`避けたい成分が ${profile.avoidIngredients.length}件`);
  }

  return basis;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
