import { InstallNudge } from "@/components/install-app";
import { Suspense } from "react";
import { TopBar } from "@/components/top-bar";
import { CommandPalette } from "@/components/command-palette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      {/* usePathname() in TopBar is runtime data on dynamic routes like /loans/[id] */}
      <Suspense fallback={<aside className="sidebar" />}>
        <TopBar />
      </Suspense>
      <CommandPalette />
      <main className="main">
        <div className="container page"><InstallNudge />{children}</div>
      </main>
    </div>
  );
}
