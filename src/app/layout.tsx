import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProfitDeck",
  description: "Profit, Shopify sales and Meta Ads in one dashboard",
  // Opened from the home screen it runs like an app, which iPhones require for notifications.
  appleWebApp: { capable: true, title: "ProfitDeck", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
