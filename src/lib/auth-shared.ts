export type Role = "OWNER" | "ADMIN" | "PARTNER";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PARTNER: "Partner (read-only)",
};

export function canEdit(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}
