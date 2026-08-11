"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  CounselStateSchema,
  DEFAULT_PROFILE,
  ExpertIdSchema,
  ProfileSchema,
  type ExpertId,
  type Profile,
} from "@/schemas/profile";
import { CarePlanSchema, RecommendationSchema } from "@/schemas/recommendation";

/**
 * 相談ログ（会話履歴）の保存。
 *
 * 方針:
 * - 保存先は利用者の端末（localStorage）だけ。サーバーへは送らない。
 * - 会話ごとに、そのときの条件（プロファイル）も一緒に残す。
 *   過去の相談を開いたときに「何を前提に出した結論か」まで戻せるようにするため。
 * - 生成済みのルーティンも保存する。振り返りで結論だけ消えていると意味がないため。
 * - スキーマが変わって読めなくなった要素は、全体を捨てずにその要素だけ落とす。
 */

const KEY = "chigiri.conversations.v1";

/** 端末の保存領域を使い切らないための上限 */
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONVERSATION = 80;

export const StoredMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  /**
   * 生成済みのルーティン。
   * スキーマ変更で読めない場合は null に落として、発言そのものは残す。
   */
  rec: RecommendationSchema.nullable().catch(null).default(null),
  /** 髪・体・生活の手順（スキンケア以外の分野で確定したもの） */
  carePlan: CarePlanSchema.nullable().catch(null).default(null),
  missing: z.array(z.string()).default([]),
  at: z.string(),
});
export type StoredMessage = z.infer<typeof StoredMessageSchema>;

/** 相談を開き直したときに戻る進み具合の初期値 */
const initialCounsel = (expert: ExpertId) => ({
  stage: "greeting" as const,
  asked: [],
  turn: 0,
  expert,
  topics: [],
  habits: [],
});

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  /**
   * この相談の分野。作成時に決まり、あとから変わらない。
   * 分野ごとに独立した相談にするための要。
   */
  expert: ExpertIdSchema.catch("skincare").default("skincare"),
  messages: z.array(StoredMessageSchema).default([]),
  /** この相談を行ったときの条件 */
  profile: ProfileSchema.catch(DEFAULT_PROFILE),
  /**
   * 相談の進み具合。
   * これを残さないと、開き直したときに最初から聞き直すことになる。
   */
  counsel: CounselStateSchema.catch(initialCounsel("skincare")).default(
    initialCounsel("skincare"),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

const StoreSchema = z.object({
  version: z.literal(1).catch(1),
  activeId: z.string().nullable().default(null),
  /**
   * いま開いている分野。
   * その分野の相談がまだ1件も無い状態でも覚えておく必要があるため、
   * activeId とは別に持つ。
   */
  activeExpert: ExpertIdSchema.catch("skincare").default("skincare"),
  conversations: z.array(ConversationSchema).default([]),
});
export type ConversationStore = z.infer<typeof StoreSchema>;

const EMPTY_STORE: ConversationStore = {
  version: 1,
  activeId: null,
  activeExpert: "skincare",
  conversations: [],
};

/* ------------------------------------------------------------------ */

let seq = 0;
export const newId = () =>
  `c${Date.now().toString(36)}${(seq++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

export const NEW_CONVERSATION_TITLE = "新しい相談";

/** 最初のユーザー発言から見出しを作る */
export function deriveTitle(messages: readonly StoredMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return NEW_CONVERSATION_TITLE;
  const text = firstUser.text.replace(/\s+/g, " ").trim();
  if (text.length === 0) return NEW_CONVERSATION_TITLE;
  return text.length > 22 ? `${text.slice(0, 22)}…` : text;
}

/** 一覧に出す一行の要約 */
export function deriveSnippet(conversation: Conversation): string {
  const lastAssistant = [...conversation.messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const source = lastAssistant ?? conversation.messages[conversation.messages.length - 1];
  if (!source) return "まだ発言がありません";
  const text = source.text.replace(/\s+/g, " ").trim();
  return text.length > 34 ? `${text.slice(0, 34)}…` : text;
}

export function createConversation(
  profile: Profile,
  expert: ExpertId,
): Conversation {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: NEW_CONVERSATION_TITLE,
    expert,
    messages: [],
    profile,
    counsel: initialCounsel(expert),
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */

function load(): ConversationStore {
  if (typeof window === "undefined") return EMPTY_STORE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STORE;
    const parsed = StoreSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_STORE;
  } catch {
    return EMPTY_STORE;
  }
}

/** 上限を超えた分を落とす（古い相談から） */
function prune(store: ConversationStore): ConversationStore {
  const conversations = [...store.conversations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS)
    .map((c) =>
      c.messages.length > MAX_MESSAGES_PER_CONVERSATION
        ? { ...c, messages: c.messages.slice(-MAX_MESSAGES_PER_CONVERSATION) }
        : c,
    );

  const ids = new Set(conversations.map((c) => c.id));
  return {
    ...store,
    conversations,
    activeId: store.activeId && ids.has(store.activeId) ? store.activeId : null,
  };
}

/** その分野のうち、いちばん新しい相談 */
function latestOf(
  conversations: readonly Conversation[],
  expert: ExpertId,
): Conversation | null {
  return (
    [...conversations]
      .filter((c) => c.expert === expert)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

/* ------------------------------------------------------------------ *
 * 状態の遷移（純粋な関数）
 *
 * 相談が分野をまたいで混ざらないことが、この機能の要になる。
 * React の外に出しておき、そのまま検証できるようにする。
 * ------------------------------------------------------------------ */

/**
 * 分野を開く。
 * その分野の最新の相談へ移るだけで、ほかの相談には何も起こらない。
 */
export function openExpertIn(
  store: ConversationStore,
  expert: ExpertId,
): ConversationStore {
  if (store.activeExpert === expert) return store;
  return {
    ...store,
    activeExpert: expert,
    activeId: latestOf(store.conversations, expert)?.id ?? null,
  };
}

/**
 * 相談を開く。
 * 相談には分野が固定されているので、開いた相談の分野へ揃える。
 * ここを揃えないと、一覧と本文の分野が食い違う。
 */
export function openConversationIn(
  store: ConversationStore,
  id: string,
): ConversationStore {
  const target = store.conversations.find((c) => c.id === id);
  if (!target) return store;
  return { ...store, activeId: id, activeExpert: target.expert };
}

/** いま開いている分野に、新しい相談を足す */
export function addConversationIn(
  store: ConversationStore,
  conversation: Conversation,
): ConversationStore {
  return {
    ...store,
    activeId: conversation.id,
    activeExpert: conversation.expert,
    // 発言のないまま放置された相談は残さない。
    // 「新しい相談」を続けて押したときに空の行が積み上がるのを防ぐ。
    conversations: [
      conversation,
      ...store.conversations.filter((c) => c.messages.length > 0),
    ],
  };
}

/**
 * 相談を消す。
 * いま見ているものを消した場合は、同じ分野の次の相談へ移る。
 * ほかの分野へ飛ばさない。
 */
export function removeConversationIn(
  store: ConversationStore,
  id: string,
): ConversationStore {
  const conversations = store.conversations.filter((c) => c.id !== id);
  return {
    ...store,
    conversations,
    activeId:
      store.activeId === id
        ? (latestOf(conversations, store.activeExpert)?.id ?? null)
        : store.activeId,
  };
}

/** 分野ごとの相談件数（発言のないものは数えない） */
export function countByExpert(
  conversations: readonly Conversation[],
): Record<ExpertId, number> {
  const counts = Object.fromEntries(
    ExpertIdSchema.options.map((id) => [id, 0]),
  ) as Record<ExpertId, number>;
  for (const c of conversations) {
    if (c.messages.length > 0) counts[c.expert] += 1;
  }
  return counts;
}

/**
 * 保存の状態。
 *
 * 失敗を黙って握りつぶすと、画面上は保存されたように見えて
 * リロードで消える。何が起きたのかを利用者へ伝えるために状態として返す。
 */
export type StorageState =
  | "ok"
  /** 端末が保存領域を提供していない（プライベートモード等） */
  | "unavailable"
  /** 保存領域が一杯で書き込めない */
  | "full";

function persist(store: ConversationStore): StorageState {
  if (typeof window === "undefined") return "ok";
  const pruned = prune(store);

  try {
    window.localStorage.setItem(KEY, JSON.stringify(pruned));
    return "ok";
  } catch {
    // 保存領域が足りない場合、ルーティン本体を古い相談から落として再挑戦する。
    // 会話そのものを消すより、添付を捨てるほうが失うものが小さい。
    try {
      const lightened: ConversationStore = {
        ...pruned,
        conversations: pruned.conversations.map((c, i) =>
          i === 0
            ? c
            : { ...c, messages: c.messages.map((m) => ({ ...m, rec: null })) },
        ),
      };
      window.localStorage.setItem(KEY, JSON.stringify(lightened));
      return "ok";
    } catch {
      // 書き込みが根本的にできないのか、容量の問題かを切り分ける
      try {
        const probe = `${KEY}.probe`;
        window.localStorage.setItem(probe, "1");
        window.localStorage.removeItem(probe);
        return "full";
      } catch {
        return "unavailable";
      }
    }
  }
}

/* ------------------------------------------------------------------ */

export type UseConversations = {
  hydrated: boolean;
  /** 端末への保存が効いているか */
  storage: StorageState;
  /**
   * いま開いている分野の相談だけ。
   * 分野ごとに独立した相談にするため、一覧も分野で分ける。
   */
  conversations: Conversation[];
  /** 分野ごとの相談件数（選択タブに出す） */
  countByExpert: Record<ExpertId, number>;
  active: Conversation | null;
  activeId: string | null;
  activeExpert: ExpertId;
  /** 分野を開く。その分野の最新の相談へ移る（無ければ空のまま） */
  selectExpert: (expert: ExpertId) => void;
  startNew: (profile: Profile) => string;
  select: (id: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  /** 現在の相談の発言・条件・進み具合を差し替える */
  syncActive: (
    messages: StoredMessage[],
    profile: Profile,
    counsel: Conversation["counsel"],
  ) => void;
};

export function useConversations(): UseConversations {
  const [store, setStore] = useState<ConversationStore>(EMPTY_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [storage, setStorage] = useState<StorageState>("ok");
  /** 読み込み直後の1回は書き戻さない（同じ内容を書くだけなので） */
  const skipPersist = useRef(true);

  useEffect(() => {
    setStore(load());
    setHydrated(true);
  }, []);

  /*
   * 保存は状態の更新が確定してから行う。
   * setStore の更新関数の中で保存すると、React が更新関数を
   * 2回呼ぶ場合に二重に書き込まれるため。
   */
  useEffect(() => {
    if (!hydrated) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    setStorage(persist(store));
  }, [store, hydrated]);

  const update = useCallback(
    (fn: (prev: ConversationStore) => ConversationStore) => {
      setStore((prev) => fn(prev));
    },
    [],
  );

  /**
   * いま開いている分野に、新しい相談を作る。
   * 分野は相談に固定されるため、あとから変わることはない。
   */
  const startNew = useCallback(
    (profile: Profile) => {
      const id = newId();
      update((prev) =>
        addConversationIn(prev, {
          ...createConversation(profile, prev.activeExpert),
          id,
        }),
      );
      return id;
    },
    [update],
  );

  /**
   * 分野を開く。
   *
   * その分野の最新の相談へ移るだけで、いまの相談には何も起こらない。
   * 戻ってきたときには、そのまま続きが残っている。
   */
  const selectExpert = useCallback(
    (expert: ExpertId) => update((prev) => openExpertIn(prev, expert)),
    [update],
  );

  const select = useCallback(
    (id: string) => update((prev) => openConversationIn(prev, id)),
    [update],
  );

  const remove = useCallback(
    (id: string) => update((prev) => removeConversationIn(prev, id)),
    [update],
  );

  const clearAll = useCallback(
    () => update(() => EMPTY_STORE),
    [update],
  );

  const syncActive = useCallback(
    (
      messages: StoredMessage[],
      profile: Profile,
      counsel: Conversation["counsel"],
    ) =>
      update((prev) => {
        if (!prev.activeId) return prev;
        return {
          ...prev,
          conversations: prev.conversations.map((c) =>
            c.id === prev.activeId
              ? {
                  ...c,
                  messages,
                  profile,
                  counsel,
                  title:
                    c.title === NEW_CONVERSATION_TITLE
                      ? deriveTitle(messages)
                      : c.title,
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        };
      }),
    [update],
  );

  /* 一覧はいま開いている分野の分だけ。相談は分野ごとに独立している。 */
  const conversations = useMemo(
    () =>
      store.conversations
        .filter((c) => c.expert === store.activeExpert)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [store.conversations, store.activeExpert],
  );

  const counts = useMemo(
    () => countByExpert(store.conversations),
    [store.conversations],
  );

  const active = useMemo(
    () => store.conversations.find((c) => c.id === store.activeId) ?? null,
    [store.conversations, store.activeId],
  );

  return {
    hydrated,
    storage,
    conversations,
    countByExpert: counts,
    active,
    activeId: store.activeId,
    activeExpert: store.activeExpert,
    selectExpert,
    startNew,
    select,
    remove,
    clearAll,
    syncActive,
  };
}
