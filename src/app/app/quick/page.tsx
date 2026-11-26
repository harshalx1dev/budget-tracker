import Link from "next/link";
import { QuickAddBar } from "@/components/quick-add-bar";

export const metadata = { title: "quick add" };

// No personal data on this page on purpose: the service worker keeps a copy so it opens offline.
export default function Quick() {
  return (
    <div className="stack">
      <h1>quick add</h1>
      <QuickAddBar />
      <p className="label">Works without a connection: entries wait on this device and sync by themselves. <Link href="/app/transactions" className="link">see the ledger</Link></p>
    </div>
  );
}
