export type Role = "OWNER" | "ADMIN" | "PARTNER" | "SUPPORT";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  timeZone: string | null;
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

/** Who creates, assigns and edits team tasks. Everyone else works on the tasks given to them. */
export const canManageTasks = canEdit;
