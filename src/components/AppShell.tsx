"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, CheckSquare, LayoutDashboard, LifeBuoy, LogOut, Megaphone, Menu, Package, Receipt, Settings, ShoppingBag, Users, X } from "lucide-react";
import { Logo } from "./Logo";
import { DeviceSetup } from "./DeviceSetup";
import { logoutAction } from "@/lib/actions/auth";
import { canEdit, canSupport, ROLE_LABELS, type SessionUser } from "@/lib/auth-shared";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/products", label: "Products", icon: Package },
  { href: "/ads", label: "Meta Ads", icon: Megaphone },
];

const SUPPORT = { href: "/support", label: "Support", icon: LifeBuoy };
const TASKS = { href: "/tasks", label: "Tasks", icon: CheckSquare };

const SETUP = [
  { href: "/expenses", label: "Expenses & fees", icon: Receipt },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings, editorOnly: true },
];

export function AppShell({
  user,
  storeName,
  supportCount,
  inboxCount,
  overdueCount,
  children,
}: {
  user: SessionUser;
  storeName: string;
  supportCount: number;
  inboxCount: number;
  overdueCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The layout isn't re-rendered when moving between pages, so the counts refresh themselves.
  const [counts, setCounts] = useState({ unread: inboxCount, overdue: overdueCount });
  useEffect(() => setCounts({ unread: inboxCount, overdue: overdueCount }), [inboxCount, overdueCount]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/inbox/count", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => alive && c && setCounts({ unread: c.unread, overdue: c.overdue }))
        .catch(() => {});
    const timer = setTimeout(load, 300);
    const every = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(every);
      window.removeEventListener("focus", load);
    };
  }, [pathname]);
  const unread = counts.unread;
  const overdue = counts.overdue;
  const supportOnly = user.role === "SUPPORT";
  const setup = SETUP.filter((n) => !n.editorOnly || canEdit(user.role));

  const link = ({ href, label, icon: Icon }: (typeof NAV)[number]) => {
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
        {href === "/support" && supportCount > 0 && (
          <span className="ml-auto rounded-full bg-warn/20 px-1.5 text-[11px] font-semibold text-warn-text">{supportCount}</span>
        )}
        {href === "/tasks" && overdue > 0 && (
          <span className="ml-auto rounded-full bg-bad/15 px-1.5 text-[11px] font-semibold text-bad-text" title="Overdue">{overdue}</span>
        )}
      </Link>
    );
  };

  const nav = supportOnly ? (
    <nav className="flex flex-col gap-1">
      {link(SUPPORT)}
      {link(TASKS)}
    </nav>
  ) : (
    <nav className="flex flex-col gap-1">
      {NAV.map(link)}
      {canSupport(user.role) && link(SUPPORT)}
      {link(TASKS)}
      <div className="mt-5 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Setup</div>
      {setup.map(link)}
    </nav>
  );
  const bell = (
    <Link
      href="/inbox"
      onClick={() => setOpen(false)}
      aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}
      className={`relative grid h-9 w-9 place-items-center rounded-lg ${pathname === "/inbox" ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
    >
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-none text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
  const overdueBar = overdue > 0 && !pathname.startsWith("/tasks") && (
    <Link href="/tasks" className="mb-4 flex items-center gap-2 rounded-xl border border-bad/30 bg-bad/10 px-4 py-2.5 text-sm text-bad-text hover:bg-bad/15">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        You have {overdue} overdue task{overdue === 1 ? "" : "s"}.
      </span>
      <span className="font-medium underline-offset-2 hover:underline">Open my tasks</span>
    </Link>
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
        <div className="mb-6 flex items-start justify-between gap-2 pl-3">
          <div className="min-w-0">
            <Logo />
            <div className="mt-1 text-xs text-ink-3 truncate">{storeName}</div>
          </div>
          {bell}
        </div>
        <div className="flex-1">{nav}</div>
        {userBlock}
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Logo />
        <div className="-mr-2 flex items-center gap-1">
          {bell}
          <button className="btn-ghost" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
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
        <div className="mx-auto max-w-7xl">
          {overdueBar}
          {children}
        </div>
      </main>
      <DeviceSetup timeZone={user.timeZone} />
    </div>
  );
}


