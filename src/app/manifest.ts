import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "budget tracker",
    short_name: "budget",
    description: "Track what comes in, what goes out, and plan what comes next.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1fb",
    theme_color: "#6d28d9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "quick add", url: "/app/quick" }, { name: "inbox", url: "/app/inbox" }],
  };
}
