import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pd_session";
// API routes enforce their own auth (session or CRON_SECRET) and return JSON instead of redirecting.
const PUBLIC_PREFIXES = ["/login", "/register", "/invite", "/api/", "/_next", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!hasSession && !isPublic && pathname !== "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/dashboard" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
