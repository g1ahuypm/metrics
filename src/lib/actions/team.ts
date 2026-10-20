"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { z } from "zod";
import { db } from "../db";
import { newToken, requireEditor, requireUser, ROLES } from "../auth";
import { allowedStores } from "../stores";
import type { FormState } from "./auth";

export async function createInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireEditor();
  const parsed = z
    .object({
      email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email")]),
      role: z.enum(["ADMIN", "PARTNER", "SUPPORT"]),
    })
    .safeParse({ email: formData.get("email") ?? "", role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.role === "ADMIN" && me.role !== "OWNER") {
    return { error: "Only the owner can invite admins" };
  }
  // Which stores the new member will see; with a single store, that one.
  const mine = await allowedStores(me);
  const picked = formData.getAll("storeIds").map(String);
  const storeIds = mine.length === 1 ? [mine[0].id] : mine.filter((s) => picked.includes(s.id)).map((s) => s.id);
  if (storeIds.length === 0) return { error: "Tick at least one store they should see" };
  await db.invite.create({
    data: {
      token: newToken(),
      email: parsed.data.email || null,
      role: parsed.data.role,
      storeIds,
      createdById: me.id,
      expiresAt: addDays(new Date(), 7),
    },
  });
  revalidatePath("/team");
  return { success: "Invite link created. Copy it and send it to them." };
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
  const openTasks = await db.task.count({ where: { assigneeId: userId, status: "open" } });
  if (openTasks > 0) return { error: `${target.name} still has ${openTasks} open task${openTasks === 1 ? "" : "s"}. Give ${openTasks === 1 ? "it" : "them"} to someone else first (Tasks → Edit).` };
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

/** Which stores a member sees. Admins can only hand out stores they see themselves. */
export async function setMemberStoresAction(userId: string, storeIds: string[]): Promise<FormState> {
  const me = await requireEditor();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found" };
  if (target.role === "OWNER") return { error: "The owner always sees every store" };
  if (target.role === "ADMIN" && me.role !== "OWNER") return { error: "Only the owner can change an admin's stores" };
  const mine = new Set((await allowedStores(me)).map((s) => s.id));
  const wanted = new Set(storeIds.filter((id) => mine.has(id)));
  const current = await db.userStore.findMany({ where: { userId }, select: { storeId: true } });
  // Stores the editor can't see stay as they are.
  const remove = current.filter((c) => mine.has(c.storeId) && !wanted.has(c.storeId)).map((c) => c.storeId);
  const add = [...wanted].filter((id) => !current.some((c) => c.storeId === id));
  await db.$transaction([
    db.userStore.deleteMany({ where: { userId, storeId: { in: remove } } }),
    db.userStore.createMany({ data: add.map((storeId) => ({ userId, storeId })), skipDuplicates: true }),
  ]);
  revalidatePath("/team");
  return { success: "Saved" };
}
