"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { createSession, destroySession, hasAnyUsers, hashPassword, verifyPassword } from "../auth";

export type FormState = { error?: string; success?: string } | undefined;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password" };
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function registerOwnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (await hasAnyUsers()) {
    return { error: "An owner already exists. Ask them for an invite link." };
  }
  const parsed = credentials
    .extend({
      name: z.string().trim().min(1, "Enter your name"),
      storeName: z.string().trim().min(1, "Enter your store name"),
    })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      name: formData.get("name"),
      storeName: formData.get("storeName"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await db.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      role: "OWNER",
    },
  });
  await db.settings.upsert({
    where: { id: "default" },
    update: { storeName: parsed.data.storeName },
    create: { id: "default", storeName: parsed.data.storeName },
  });
  await createSession(user.id);
  redirect("/settings?welcome=1");
}

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return { error: "This invite link is invalid or has expired." };
  }
  const parsed = credentials
    .extend({ name: z.string().trim().min(1, "Enter your name") })
    .safeParse({
      email: invite.email ?? formData.get("email"),
      password: formData.get("password"),
      name: formData.get("name"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (await db.user.findUnique({ where: { email: parsed.data.email } })) {
    return { error: "An account with that email already exists. Sign in instead." };
  }

  const user = await db.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      role: invite.role,
    },
  });
  await db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
