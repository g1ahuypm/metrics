"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, CheckSquare, LayoutDashboard, LifeBuoy, LogOut, Megaphone, MoreHorizontal, Package, Receipt, Settings, ShoppingBag, Users, X } from "lucide-react";
import { Logo } from "./Logo";
import { DeviceSetup } from "./DeviceSetup";
import { StoreSwitcher, type SwitcherStore } from "./StoreSwitcher";
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
  stores,
  currentStore,
  supportCount,
  inboxCount,
  overdueCount,
  children,
}: {
  user: SessionUser;
  storeName: string;
  stores: SwitcherStore[];
  currentStore: string | null;
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

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const link = ({ href, label, icon: Icon }: (typeof NAV)[number]) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm transition-colors ${
          active ? "bg-accent-soft font-bold text-accent-text" : "font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
        <span className="flex-1">{label}</span>
        {href === "/support" && supportCount > 0 && (
          <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[11px] font-bold text-warn-text">{supportCount}</span>
        )}
        {href === "/tasks" && overdue > 0 && (
          <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[11px] font-bold text-bad-text" title="Overdue">{overdue}</span>
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
      <div className="mt-5 mb-1 px-3 text-xs font-semibold text-ink-3">Setup</div>
      {setup.map(link)}
    </nav>
  );
  const bell = (
    <Link
      href="/inbox"
      onClick={() => setOpen(false)}
      aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}
      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${
        pathname === "/inbox" ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-ink hover:bg-accent-soft"
      }`}
    >
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-page bg-bad px-1 text-[10px] font-bold leading-none text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
  const overdueBar = overdue > 0 && !pathname.startsWith("/tasks") && (
    <Link href="/tasks" className="mb-4 flex items-center gap-3 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad-text hover:bg-bad/15">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1 font-medium">
        You have {overdue} overdue task{overdue === 1 ? "" : "s"}.
      </span>
      <span className="font-bold underline-offset-2 hover:underline">Open my tasks</span>
    </Link>
  );
  const userBlock = (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">
        {user.name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{user.name}</div>
        <div className="truncate text-xs text-ink-3">{ROLE_LABELS[user.role]}</div>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-surface hover:text-ink" aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </div>
  );

  // Phone tab bar: the most used pages, the rest under More.
  const tabs = [
    ...(supportOnly ? [] : [NAV[0], NAV[1]]),
    TASKS,
    ...(canSupport(user.role) ? [SUPPORT] : []),
  ];
  const moreActive = !tabs.some((t) => isActive(t.href)) && pathname !== "/inbox";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr] lg:gap-4 lg:p-4">
      {/* Desktop sidebar: a floating card */}
      <aside className="hidden lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-2rem)] lg:flex-col lg:gap-6 lg:overflow-y-auto lg:rounded-[22px] lg:border lg:border-border lg:bg-surface lg:px-3.5 lg:py-5">
        <div className="flex items-center justify-between gap-2 pl-2">
          <div className="min-w-0">
            <Logo />
            <div className="mt-1 truncate pl-0.5 text-xs text-ink-3">{storeName}</div>
          </div>
          {bell}
        </div>
        <div className="flex-1">{nav}</div>
        {userBlock}
      </aside>

      {/* Phone top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-page/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href={supportOnly ? "/support" : "/dashboard"} aria-label="Margin home">
          <Logo />
        </Link>
        {bell}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col gap-6 overflow-y-auto rounded-r-[22px] bg-surface px-3.5 py-5">
            <div className="flex items-center justify-between pl-2">
              <Logo />
              <button className="grid h-11 w-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1">{nav}</div>
            {userBlock}
          </aside>
        </div>
      )}

      <main className="min-w-0 px-4 pb-32 pt-2 sm:px-6 lg:px-4 lg:pb-10 lg:pt-4">
        <div className="mx-auto max-w-7xl">
          {overdueBar}
          {!/^\/(tasks|inbox|team)(\/|$)|^\/products\/./.test(pathname) && <StoreSwitcher stores={stores} current={currentStore} />}
          {children}
        </div>
      </main>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto grid max-w-md gap-1 rounded-full bg-[#191a23] p-1.5 shadow-lg shadow-black/20" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            const badge = href === "/tasks" ? overdue : href === "/support" ? supportCount : 0;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold ${
                  active ? "bg-accent text-white" : "text-[#a9aab8] hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label === "Meta Ads" ? "Ads" : label}
                {badge > 0 && (
                  <span className={`absolute right-[18%] top-1 h-2 w-2 rounded-full ${href === "/tasks" ? "bg-[#ff6b70]" : "bg-warn"}`} aria-hidden="true" />
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold ${
              moreActive ? "bg-accent text-white" : "text-[#a9aab8] hover:text-white"
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
      <DeviceSetup timeZone={user.timeZone} />
    </div>
  );
}
