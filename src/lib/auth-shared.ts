export type Role = "OWNER" | "ADMIN" | "PARTNER" | "SUPPORT";

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
  SUPPORT: "Support (inbox only)",
};

export function canEdit(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Who may read and answer customer emails. Partners see numbers, not customers. */
export function canSupport(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "SUPPORT";
}
