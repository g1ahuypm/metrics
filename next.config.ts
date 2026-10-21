import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Going back to a page opened in the last 30 seconds shows it at once instead of rebuilding it.
  // Saving anything still refreshes the pages straight away.
  experimental: { staleTimes: { dynamic: 30 } },
};

export default nextConfig;
