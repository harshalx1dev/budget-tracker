"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Inbox, Landmark, LayoutDashboard, LogOut, ReceiptText, Search, Settings, Target } from "lucide-react";
import { LogoMark, Wordmark } from "./logo";
import { BRAND } from "@/lib/brand";
import { authClient } from "@/lib/auth-client";
import { hideLoading, showLoading } from "@/lib/loading";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/app", label: "Overview", Icon: LayoutDashboard },
  { href: "/app/transactions", label: "Transactions", Icon: ReceiptText },
  { href: "/app/inbox", label: "To sort", Icon: Inbox },
  { href: "/app/plan", label: "Plan", Icon: Target },
  { href: "/app/accounts", label: "Accounts", Icon: Landmark },
  { href: "/app/settings", label: "Settings", Icon: Settings },
];

function Brand() {
  return (
    <Link href="/app" className="wordmark" aria-label={`${BRAND.name}, home`}>
      <LogoMark size={26} />
      <Wordmark />
    </Link>
  );
}

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const current = (href: string) => (path === href || (href !== "/app" && path.startsWith(`${href}/`)) ? "page" : undefined);
  const signOut = async () => { showLoading(); try { await authClient.signOut(); router.push("/login"); router.refresh(); } catch { hideLoading(); } };
  const openPalette = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));

  return (
    <>
      <aside className="sidebar">
        <Brand />
        <nav className="side-nav" aria-label="Main">
          {LINKS.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="side-link" aria-current={current(href)}><Icon size={18} aria-hidden />{label}</Link>
          ))}
        </nav>
        <div className="sidebar__foot">
          <button type="button" className="side-btn" onClick={openPalette}><Search size={18} aria-hidden />Search<kbd>Ctrl K</kbd></button>
          <ThemeToggle variant="side" />
          <button type="button" className="side-btn" onClick={signOut}><LogOut size={18} aria-hidden />Sign out</button>
        </div>
      </aside>

      <header className="mbar">
        <Brand />
        <span className="head-actions">
          <ThemeToggle />
          <button type="button" className="icon-btn" aria-label="Sign out" onClick={signOut}><LogOut size={18} aria-hidden /></button>
        </span>
      </header>

      <nav className="tabbar" aria-label="Main">
        {LINKS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="tab" aria-current={current(href)}><Icon size={20} aria-hidden />{label}</Link>
        ))}
      </nav>
    </>
  );
}
