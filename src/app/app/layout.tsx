import { Suspense } from "react";
import { TopBar } from "@/components/top-bar";
import { CommandPalette } from "@/components/command-palette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* usePathname() in TopBar is runtime data on dynamic routes like /loans/[id] */}
      <Suspense fallback={<header className="topbar" />}>
        <TopBar />
      </Suspense>
      <CommandPalette />
      <main className="container page">{children}</main>
    </>
  );
}
