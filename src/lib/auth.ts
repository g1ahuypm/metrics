import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const SESSION_COOKIE = "pd_session";
const SESSION_DAYS = 30;

import { canEdit, canSupport, ROLE_LABELS, type Role, type SessionUser } from "./auth-shared";

export { canEdit, canSupport, ROLE_LABELS };
export type { Role, SessionUser };
export const ROLES: Role[] = ["OWNER", "ADMIN", "PARTNER", "SUPPORT"];

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { token, userId, expiresAt } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { user } = session;
  return { id: user.id, email: user.email, name: user.name, role: user.role as Role };
}

/** Signed in, any role. Support staff only ever see the Support pages. */
export async function requireSignedIn(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects to /login when there is no valid session; Support staff go to their inbox. */
export async function requireUser(): Promise<SessionUser> {
  const user = await requireSignedIn();
  if (user.role === "SUPPORT") redirect("/support");
  return user;
}

/** The Support inbox and knowledge base: owner, admins and support staff. */
export async function requireSupport(): Promise<SessionUser> {
  const user = await requireSignedIn();
  if (!canSupport(user.role)) redirect("/dashboard?denied=1");
  return user;
}

/** Redirects to the dashboard when the user cannot edit. */
export async function requireEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canEdit(user.role)) redirect("/dashboard?denied=1");
  return user;
}

export async function hasAnyUsers(): Promise<boolean> {
  return (await db.user.count()) > 0;
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}
