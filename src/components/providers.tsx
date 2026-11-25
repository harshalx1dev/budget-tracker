"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { RegisterSW } from "./register-sw";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
      <RegisterSW />
    </ThemeProvider>
  );
}
