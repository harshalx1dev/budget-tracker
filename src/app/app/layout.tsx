import { Suspense } from "react";
import { TopBar } from "@/components/top-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* usePathname() in TopBar is runtime data on dynamic routes like /loans/[id] */}
      <Suspense fallback={<header className="topbar" />}>
        <TopBar />
      </Suspense>
      <main className="container page">{children}</main>
    </>
  );
}
