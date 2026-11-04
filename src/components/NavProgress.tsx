"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Instant feedback on every click to another page: a thin bar runs along the top until the
 * new page is on screen, and `onNavigate` tells the menu which item to light up right away.
 * (A loading.tsx skeleton did this before, but with it Next.js 15.5 could leave a page frozen
 * after a save whose answer streams in several parts, so the old page stays until the new one is ready.)
 */
export function NavProgress({ onNavigate }: { onNavigate: (path: string | null) => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [active, setActive] = useState(false);

  // The new page is showing: done.
  useEffect(() => {
    setActive(false);
    onNavigate(null);
  }, [pathname, search, onNavigate]);

  // Never left running if a click doesn't end up opening a page.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      setActive(false);
      onNavigate(null);
    }, 10_000);
    return () => clearTimeout(t);
  }, [active, onNavigate]);

  useEffect(() => {
    // Capture phase: runs before Next's <Link> handles (and prevents) the click.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      // Same page (or only a #section on it): nothing to wait for.
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
      onNavigate(url.pathname);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [onNavigate]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden" role="progressbar" aria-label="Loading page" aria-busy="true">
      <div className="nav-progress h-full w-1/3 rounded-full bg-accent" />
    </div>
  );
}
