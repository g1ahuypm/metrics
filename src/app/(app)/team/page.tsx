import { headers } from "next/headers";
import { canEdit, requireUser, ROLE_LABELS, type Role } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { InviteForm, InviteRow, MemberRow } from "./TeamClient";

export default async function TeamPage() {
  const me = await requireUser();
  const editor = canEdit(me.role);
  const [members, invites] = await Promise.all([
    db.user.findMany({ orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
    db.invite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
  ]);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const baseUrl = process.env.APP_URL ?? `${proto}://${host}`;

  return (
    <div>
      <PageHeader
        title="Team"
        description="Everyone who can see this dashboard. Partners get read-only access to every report."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold">Members</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Last sign-in</th>
                  {editor && <th></th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={{ id: m.id, name: m.name, email: m.email, role: m.role as Role, lastLoginAt: fmtDateTime(m.lastLoginAt) }}
                    me={me}
                    editor={editor}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {editor && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold">Invite someone</h2>
              <p className="mt-1 text-xs text-ink-3">Creates a link that works once and expires in 7 days.</p>
              <div className="mt-3">
                <InviteForm isOwner={me.role === "OWNER"} />
              </div>
            </div>
          )}
          <div className="card p-4">
            <h2 className="text-sm font-semibold">Roles</h2>
            <dl className="mt-2 space-y-2 text-xs">
              <div>
                <dt className="font-medium">{ROLE_LABELS.OWNER}</dt>
                <dd className="text-ink-2">Full control, including admins and integrations.</dd>
              </div>
              <div>
                <dt className="font-medium">{ROLE_LABELS.ADMIN}</dt>
                <dd className="text-ink-2">Edits costs, settings and integrations. Invites partners.</dd>
              </div>
              <div>
                <dt className="font-medium">{ROLE_LABELS.PARTNER}</dt>
                <dd className="text-ink-2">Sees every report and cost, cannot change anything.</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {editor && (
        <div className="mt-6 card overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold">Pending invites</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Link</th>
                  <th>For</th>
                  <th>Role</th>
                  <th>Created by</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <InviteRow
                    key={i.id}
                    invite={{
                      id: i.id,
                      url: `${baseUrl}/invite/${i.token}`,
                      email: i.email,
                      role: ROLE_LABELS[i.role as Role],
                      createdBy: i.createdBy.name,
                      expiresAt: fmtDateTime(i.expiresAt),
                    }}
                  />
                ))}
                {invites.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-ink-3">No pending invites</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
