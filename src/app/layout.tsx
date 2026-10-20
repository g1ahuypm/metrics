import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so no request to Google when the page loads.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: "Margin",
  description: "Profit, orders, ads, support and tasks for every store",
  // Opened from the home screen it runs like an app, which iPhones require for notifications.
  appleWebApp: { capable: true, title: "Margin", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f1f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
