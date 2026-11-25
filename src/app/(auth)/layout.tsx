import Link from "next/link";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="container topbar__inner">
          <Link href="/login" className="wordmark">budget<span>.</span></Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="container auth-main">
        <Suspense>{children}</Suspense>
      </main>
    </>
  );
}
