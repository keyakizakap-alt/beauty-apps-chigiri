import { redirect } from "next/navigation";

/** 相談画面はトップに統合したため、旧 URL はそちらへ寄せる */
export default function ChatPage() {
  redirect("/");
}
