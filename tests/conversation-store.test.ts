import { describe, expect, it } from "vitest";
import {
  addConversationIn,
  countByExpert,
  createConversation,
  ConversationSchema,
  openConversationIn,
  openExpertIn,
  removeConversationIn,
  type Conversation,
  type ConversationStore,
} from "@/lib/conversations";
import { DEFAULT_PROFILE, type ExpertId } from "@/schemas/profile";

/**
 * 相談が分野をまたいで混ざらないこと。
 * ここが崩れると「独立した相談」という前提そのものが成立しない。
 */

const EMPTY: ConversationStore = {
  version: 1,
  activeId: null,
  activeExpert: "skincare",
  conversations: [],
};

let seq = 0;

/** 発言のある相談を1件作る */
function conversationOf(
  expert: ExpertId,
  updatedAt: string,
  id = `c${++seq}`,
): Conversation {
  return {
    ...createConversation(DEFAULT_PROFILE, expert),
    id,
    title: `${expert} の相談`,
    updatedAt,
    messages: [
      {
        id: `${id}-m1`,
        role: "user",
        text: "こんにちは",
        rec: null,
        carePlan: null,
        missing: [],
        at: updatedAt,
      },
    ],
  };
}

function storeWith(...conversations: Conversation[]): ConversationStore {
  return { ...EMPTY, conversations };
}

describe("相談は分野に属する", () => {
  it("作った相談には分野が付く", () => {
    const c = createConversation(DEFAULT_PROFILE, "haircare");
    expect(c.expert).toBe("haircare");
    expect(c.counsel.expert).toBe("haircare");
  });

  it("分野を持たない古い保存データはスキンケア扱いで読める", () => {
    const parsed = ConversationSchema.safeParse({
      id: "old",
      title: "以前の相談",
      messages: [],
      profile: DEFAULT_PROFILE,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.expert).toBe("skincare");
  });
});

describe("分野を開く", () => {
  it("その分野の最新の相談へ移る", () => {
    const older = conversationOf("haircare", "2026-08-01T00:00:00.000Z");
    const newer = conversationOf("haircare", "2026-08-09T00:00:00.000Z");
    const skin = conversationOf("skincare", "2026-08-10T00:00:00.000Z");

    const next = openExpertIn(storeWith(older, newer, skin), "haircare");
    expect(next.activeExpert).toBe("haircare");
    expect(next.activeId).toBe(newer.id);
  });

  it("その分野の相談がまだ無ければ、開くものが無い状態になる", () => {
    const skin = conversationOf("skincare", "2026-08-10T00:00:00.000Z");
    const next = openExpertIn({ ...storeWith(skin), activeId: skin.id }, "bodycare");
    expect(next.activeExpert).toBe("bodycare");
    expect(next.activeId).toBeNull();
  });

  it("ほかの分野の相談には何も起こらない", () => {
    const skin = conversationOf("skincare", "2026-08-10T00:00:00.000Z");
    const hair = conversationOf("haircare", "2026-08-09T00:00:00.000Z");
    const before = storeWith(skin, hair);

    const moved = openExpertIn(before, "haircare");
    expect(moved.conversations).toEqual(before.conversations);

    // 戻ってくると、元の相談がそのまま開く
    const back = openExpertIn(moved, "skincare");
    expect(back.activeId).toBe(skin.id);
  });

  it("同じ分野を選び直しても何も変わらない", () => {
    const before = { ...storeWith(), activeExpert: "bodycare" as const };
    expect(openExpertIn(before, "bodycare")).toBe(before);
  });
});

describe("相談を開く", () => {
  it("開いた相談の分野へ揃える", () => {
    // 一覧と本文の分野が食い違うと、次の発言が別の分野の相談に入る
    const hair = conversationOf("haircare", "2026-08-09T00:00:00.000Z");
    const next = openConversationIn(storeWith(hair), hair.id);
    expect(next.activeId).toBe(hair.id);
    expect(next.activeExpert).toBe("haircare");
  });

  it("存在しない相談は開かない", () => {
    const before = storeWith();
    expect(openConversationIn(before, "missing")).toBe(before);
  });
});

describe("新しい相談", () => {
  it("いま開いている分野に作られる", () => {
    const store = { ...EMPTY, activeExpert: "healthcare" as const };
    const created = createConversation(DEFAULT_PROFILE, store.activeExpert);
    const next = addConversationIn(store, created);

    expect(next.activeId).toBe(created.id);
    expect(next.activeExpert).toBe("healthcare");
    expect(next.conversations[0].expert).toBe("healthcare");
  });

  it("発言のない相談は積み上がらないが、ほかの分野の相談は消えない", () => {
    const hair = conversationOf("haircare", "2026-08-09T00:00:00.000Z");
    const emptyOne = createConversation(DEFAULT_PROFILE, "skincare");
    const store = addConversationIn(storeWith(hair), emptyOne);

    const another = createConversation(DEFAULT_PROFILE, "skincare");
    const next = addConversationIn(store, { ...another, id: "another" });

    expect(next.conversations.map((c) => c.id)).toEqual(["another", hair.id]);
  });
});

describe("相談を消す", () => {
  it("同じ分野の次の相談へ移る", () => {
    const older = conversationOf("haircare", "2026-08-01T00:00:00.000Z");
    const newer = conversationOf("haircare", "2026-08-09T00:00:00.000Z");
    const skin = conversationOf("skincare", "2026-08-10T00:00:00.000Z");
    const store = {
      ...storeWith(older, newer, skin),
      activeExpert: "haircare" as const,
      activeId: newer.id,
    };

    const next = removeConversationIn(store, newer.id);
    expect(next.activeId).toBe(older.id);
  });

  it("その分野の最後の1件を消しても、ほかの分野へ飛ばない", () => {
    const hair = conversationOf("haircare", "2026-08-09T00:00:00.000Z");
    const skin = conversationOf("skincare", "2026-08-10T00:00:00.000Z");
    const store = {
      ...storeWith(hair, skin),
      activeExpert: "haircare" as const,
      activeId: hair.id,
    };

    const next = removeConversationIn(store, hair.id);
    expect(next.activeExpert).toBe("haircare");
    expect(next.activeId).toBeNull();
    // 別の分野の相談は残っている
    expect(next.conversations.map((c) => c.id)).toEqual([skin.id]);
  });

  it("見ていない相談を消しても、表示中の相談は変わらない", () => {
    const hair = conversationOf("haircare", "2026-08-09T00:00:00.000Z");
    const skin = conversationOf("skincare", "2026-08-10T00:00:00.000Z");
    const store = { ...storeWith(hair, skin), activeId: skin.id };

    expect(removeConversationIn(store, hair.id).activeId).toBe(skin.id);
  });
});

describe("分野ごとの件数", () => {
  it("分野ごとに数える", () => {
    const counts = countByExpert([
      conversationOf("haircare", "2026-08-01T00:00:00.000Z"),
      conversationOf("haircare", "2026-08-02T00:00:00.000Z"),
      conversationOf("skincare", "2026-08-03T00:00:00.000Z"),
    ]);
    expect(counts).toEqual({
      skincare: 1,
      haircare: 2,
      bodycare: 0,
      healthcare: 0,
    });
  });

  it("発言のない相談は数えない", () => {
    // 開いただけのものを件数に出すと、あるはずのない相談が見える
    const counts = countByExpert([createConversation(DEFAULT_PROFILE, "bodycare")]);
    expect(counts.bodycare).toBe(0);
  });
});
