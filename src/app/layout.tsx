import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Providers } from "@/components/providers";
import { Intro } from "@/components/intro";
import { ThemePicker } from "@/components/theme-picker";
import { PALETTE_KEY } from "@/lib/palettes";
import { NavProgress } from "@/components/nav-progress";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Headings, big figures and the wordmark: the same display face as harshalx1.dev.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin", "latin-ext"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0a100e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        {/* the chosen colour theme goes on before first paint, so the default never flashes */}
        <script dangerouslySetInnerHTML={{ __html: `try{var p=localStorage.getItem("${PALETTE_KEY}");if(p&&p!=="passbook")document.documentElement.dataset.palette=p}catch(e){}` }} />
      </head>
      <body>
        <Intro />
        <Suspense><NavProgress /></Suspense>
        <Providers>{children}</Providers>
        <ThemePicker />
      </body>
    </html>
  );
}
