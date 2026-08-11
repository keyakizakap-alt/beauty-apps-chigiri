import ChatPanel from "@/components/ChatPanel";

/**
 * 最初の画面は相談そのもの。
 * 説明を読ませてから始めるのではなく、開いたらすぐ話しかけられる状態にする。
 */
export default function HomePage() {
  return <ChatPanel />;
}
