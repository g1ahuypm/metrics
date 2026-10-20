"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { changeRoleAction, createInviteAction, removeMemberAction, revokeInviteAction, setMemberStoresAction } from "@/lib/actions/team";
import { ROLE_LABELS, type Role, type SessionUser } from "@/lib/auth-shared";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

type StoreChip = { id: string; name: string; color: string };

function StoreBoxes({ stores, picked, onToggle, name }: { stores: StoreChip[]; picked?: Set<string>; onToggle?: (id: string) => void; name?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {stores.map((s) => (
        <label key={s.id} className="flex min-h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2.5 text-xs has-[:checked]:border-ink has-[:checked]:bg-surface-2">
          <input
            type="checkbox"
            name={name}
            value={s.id}
            {...(picked ? { checked: picked.has(s.id), onChange: () => onToggle?.(s.id) } : { defaultChecked: true })}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
          {s.name}
        </label>
      ))}
    </div>
  );
}

export function InviteForm({ isOwner, stores }: { isOwner: boolean; stores: StoreChip[] }) {
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
          <option value="SUPPORT">{ROLE_LABELS.SUPPORT}</option>
          {isOwner && <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>}
        </select>
      </div>
      {stores.length > 1 && (
        <fieldset>
          <legend className="label">Stores they will see</legend>
          <StoreBoxes stores={stores} name="storeIds" />
        </fieldset>
      )}
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
  stores,
}: {
  member: { id: string; name: string; email: string; role: Role; lastLoginAt: string; storeIds: string[] };
  me: SessionUser;
  editor: boolean;
  stores: StoreChip[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState(new Set(member.storeIds));
  const isSelf = member.id === me.id;
  const locked = member.role === "OWNER" || isSelf || (member.role === "ADMIN" && me.role !== "OWNER");
  const dirty = picked.size !== member.storeIds.length || member.storeIds.some((id) => !picked.has(id));
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
            <option value="SUPPORT">{ROLE_LABELS.SUPPORT}</option>
            {me.role === "OWNER" && <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>}
          </select>
        ) : (
          <span className="badge">{ROLE_LABELS[member.role]}</span>
        )}
      </td>
      {stores.length > 1 && (
        <td>
          {member.role === "OWNER" ? (
            <span className="text-xs text-ink-2">All stores</span>
          ) : editor && !locked ? (
            <div className="space-y-1.5">
              <StoreBoxes stores={stores} picked={picked} onToggle={toggle} />
              {dirty && (
                <button
                  type="button"
                  className="btn-primary py-1 text-xs"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await setMemberStoresAction(member.id, [...picked]);
                      setError(r?.error ?? null);
                    })
                  }
                >
                  Save stores
                </button>
              )}
            </div>
          ) : (
            <span className="text-xs text-ink-2">{stores.filter((s) => member.storeIds.includes(s.id)).map((s) => s.name).join(", ") || "No stores"}</span>
          )}
        </td>
      )}
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
