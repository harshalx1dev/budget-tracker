import type { Metadata, Viewport } from "next";
import { Outfit, Onest } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["300", "500"] });
const onest = Onest({ variable: "--font-onest", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "budget tracker",
  description: "Track what comes in, what goes out, and plan what comes next.",
  appleWebApp: { capable: true, title: "budget", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0b17" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${onest.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
