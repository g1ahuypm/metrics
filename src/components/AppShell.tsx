"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {

  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { Logo } from "./Logo";
import { logoutAction } from "@/lib/actions/auth";
import { canEdit, ROLE_LABELS, type SessionUser } from "@/lib/auth-shared";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profit", label: "Profit & Loss", icon: Landmark },
  { href: "/sales", label: "Sales", icon: ShoppingBag },
  { href: "/ads", label: "Meta Ads", icon: Megaphone },
  { href: "/products", label: "Product costs", icon: Package },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings, editorOnly: true },
];

export function AppShell({
  user,
  storeName,
  children,
}: {
  user: SessionUser;
  storeName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.editorOnly || canEdit(user.role));

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const userBlock = (
    <div className="border-t border-border pt-4">
      <div className="px-3">
        <div className="text-sm font-medium truncate">{user.name}</div>
        <div className="text-xs text-ink-3 truncate">{user.email}</div>
        <div className="mt-1 badge">{ROLE_LABELS[user.role]}</div>
      </div>
      <form action={logoutAction} className="mt-3">
        <button type="submit" className="btn-ghost w-full justify-start">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen border-r border-border bg-surface px-4 py-5">
        <div className="px-3 mb-6">
          <Logo />
          <div className="mt-1 text-xs text-ink-3 truncate">{storeName}</div>
        </div>
        <div className="flex-1">{nav}</div>
        {userBlock}
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Logo />
        <button className="btn-ghost -mr-2" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface border-r border-border px-4 py-5 flex flex-col">
            <div className="flex items-center justify-between px-3 mb-6">
              <Logo />
              <button className="btn-ghost -mr-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1">{nav}</div>
            {userBlock}
          </aside>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}


