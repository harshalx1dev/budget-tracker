"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/app", label: "overview" },
  { href: "/app/transactions", label: "ledger" },
  { href: "/app/inbox", label: "inbox" },
  { href: "/app/plan", label: "plan" },
  { href: "/app/accounts", label: "accounts" },
  { href: "/app/settings", label: "settings" },
];

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  return (
    <header className="topbar">
      <div className="container topbar__inner">
        <Link href="/app" className="wordmark">budget<span>.</span></Link>
        <nav className="nav" aria-label="main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="pill" aria-current={path === l.href || (l.href !== "/app" && path.startsWith(`${l.href}/`)) ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="topbar__end">
          <ThemeToggle />
          <button type="button" className="icon-btn" aria-label="sign out" onClick={async () => { await authClient.signOut(); router.push("/login"); router.refresh(); }}>
            <LogOut size={18} aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
