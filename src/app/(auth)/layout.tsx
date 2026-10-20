import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="card w-full max-w-md p-6 sm:p-9">{children}</div>
      <p className="mt-6 text-xs text-ink-3">Profit, orders, ads, support and tasks for every store.</p>
    </div>
  );
}
