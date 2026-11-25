import { redirect } from "next/navigation";

// proxy.ts routes "/" by session cookie; this is the fallback.
export default function Home() {
  redirect("/app");
}
