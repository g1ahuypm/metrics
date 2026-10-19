import type { MetadataRoute } from "next";

/** Lets the dashboard be added to a phone's home screen, which iPhones need for notifications. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProfitDeck",
    short_name: "ProfitDeck",
    description: "Profit, tasks and support for the team",
    start_url: "/tasks",
    display: "standalone",
    background_color: "#f6f6f4",
    theme_color: "#2a78d6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
