"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { changeRoleAction, createInviteAction, removeMemberAction, revokeInviteAction } from "@/lib/actions/team";
import { ROLE_LABELS, type Role, type SessionUser } from "@/lib/auth-shared";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

export function InviteForm({ isOwner }: { isOwner: boolean }) {
  const [state, action] = useActionState(createInviteAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div>
        <label className="label">Email (optional, locks the invite to this address)</label>
        <input name="email" type="email" className="input" placeholder="partner@example.com" />
      </div>
      <div>
        <label className="label">Role</label>
        <select name="role" className="input" defaultValue="PARTNER">
          <option value="PARTNER">{ROLE_LABELS.PARTNER}</option>
          {isOwner && <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>}
        </select>
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Creating…">Create invite link</SubmitButton>
    </form>
  );
}

export function InviteRow({
  invite,
}: {
  invite: { id: string; url: string; email: string | null; role: string; createdBy: string; expiresAt: string };
}) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2">
          <code className="max-w-[260px] truncate rounded bg-surface-2 px-1.5 py-0.5 text-xs">{invite.url}</code>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={async () => {
              await navigator.clipboard.writeText(invite.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            aria-label="Copy invite link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-good-text" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </td>
      <td className="text-ink-2">{invite.email ?? "anyone with the link"}</td>
      <td className="text-ink-2">{invite.role}</td>
      <td className="text-ink-2">{invite.createdBy}</td>
      <td className="text-ink-2 whitespace-nowrap">{invite.expiresAt}</td>
      <td className="text-right">
        <button type="button" className="btn-danger py-1" disabled={pending} onClick={() => start(() => revokeInviteAction(invite.id))} aria-label="Revoke invite">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

export function MemberRow({
  member,
  me,
  editor,
}: {
  member: { id: string; name: string; email: string; role: Role; lastLoginAt: string };
  me: SessionUser;
  editor: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isSelf = member.id === me.id;
  const locked = member.role === "OWNER" || isSelf || (member.role === "ADMIN" && me.role !== "OWNER");

  return (
    <tr>
      <td>
        <div className="font-medium">
          {member.name} {isSelf && <span className="text-xs text-ink-3">(you)</span>}
        </div>
        <div className="text-xs text-ink-3">{member.email}</div>
        {error && <div className="text-xs text-bad-text">{error}</div>}
      </td>
      <td>
        {editor && !locked ? (
          <select
            className="input w-auto py-1 text-xs"
            value={member.role}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                const r = await changeRoleAction(member.id, e.target.value);
                setError(r?.error ?? null);
              })
            }
          >
            <option value="PARTNER">{ROLE_LABELS.PARTNER}</option>
            {me.role === "OWNER" && <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>}
          </select>
        ) : (
          <span className="badge">{ROLE_LABELS[member.role]}</span>
        )}
      </td>
      <td className="text-ink-2 whitespace-nowrap">{member.lastLoginAt}</td>
      {editor && (
        <td className="text-right">
          {!locked && (
            <button
              type="button"
              className="btn-danger py-1"
              disabled={pending}
              onClick={() => {
                if (confirm(`Remove ${member.name} from the team?`)) {
                  start(async () => {
                    const r = await removeMemberAction(member.id);
                    setError(r?.error ?? null);
                  });
                }
              }}
              aria-label="Remove member"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
