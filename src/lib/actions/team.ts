"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { z } from "zod";
import { db } from "../db";
import { newToken, requireEditor, requireUser, ROLES } from "../auth";
import type { FormState } from "./auth";

export async function createInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireEditor();
  const parsed = z
    .object({
      email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email")]),
      role: z.enum(["ADMIN", "PARTNER"]),
    })
    .safeParse({ email: formData.get("email") ?? "", role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.role === "ADMIN" && me.role !== "OWNER") {
    return { error: "Only the owner can invite admins" };
  }
  await db.invite.create({
    data: {
      token: newToken(),
      email: parsed.data.email || null,
      role: parsed.data.role,
      createdById: me.id,
      expiresAt: addDays(new Date(), 7),
    },
  });
  revalidatePath("/team");
  return { success: "Invite link created. Copy it and send it to your partner." };
}

export async function revokeInviteAction(id: string): Promise<void> {
  await requireEditor();
  await db.invite.delete({ where: { id } });
  revalidatePath("/team");
}

export async function changeRoleAction(userId: string, role: string): Promise<FormState> {
  const me = await requireEditor();
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { error: "Unknown role" };
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found" };
  if (target.role === "OWNER") return { error: "The owner's role cannot be changed" };
  if (role === "OWNER") return { error: "Ownership transfer is not supported here" };
  if (role === "ADMIN" && me.role !== "OWNER") return { error: "Only the owner can promote admins" };
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/team");
  return { success: "Role updated" };
}

export async function removeMemberAction(userId: string): Promise<FormState> {
  const me = await requireEditor();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found" };
  if (target.role === "OWNER") return { error: "The owner cannot be removed" };
  if (target.id === me.id) return { error: "You cannot remove yourself" };
  if (target.role === "ADMIN" && me.role !== "OWNER") return { error: "Only the owner can remove admins" };
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/team");
  return { success: "Member removed" };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const { hashPassword, verifyPassword } = await import("../auth");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { error: "New password must be at least 8 characters" };
  const user = await db.user.findUnique({ where: { id: me.id } });
  if (!user || !(await verifyPassword(current, user.passwordHash))) return { error: "Current password is wrong" };
  await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
  return { success: "Password updated" };
}
