import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProfitDeck",
  description: "Profit, Shopify sales and Meta Ads in one dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
