import Link from "next/link";
import { Suspense } from "react";
import { LogoMark, Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { BRAND } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="authbar">
        <Link href="/" className="wordmark" aria-label={`${BRAND.name}, home`}>
          <LogoMark size={26} />
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>
      <main className="container auth-main">
        <Suspense>{children}</Suspense>
      </main>
    </>
  );
}
