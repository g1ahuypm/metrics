import Link from "next/link";
import { db } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/auth";
import { InviteForm } from "./InviteForm";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.invite.findUnique({ where: { token }, include: { createdBy: true } });
  const settings = await db.settings.findUnique({ where: { id: "default" } });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Invite not valid</h1>
        <p className="mt-2 text-sm text-ink-2">
          This invite link has expired or was already used. Ask the person who invited you for a new one.
        </p>
        <Link href="/login" className="btn-secondary mt-6">Go to sign in</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Join {settings?.storeName ?? "the team"}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {invite.createdBy.name} invited you as <strong>{ROLE_LABELS[invite.role as Role]}</strong>. Create your
        account to get access to the dashboard.
      </p>
      <div className="mt-6">
        <InviteForm token={token} email={invite.email} />
      </div>
    </div>
  );
}
