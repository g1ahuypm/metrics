"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/lib/actions/auth";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

export function InviteForm({ token, email }: { token: string; email: string | null }) {
  const [state, action] = useActionState(acceptInviteAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" required className="input" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="input"
          defaultValue={email ?? ""}
          readOnly={Boolean(email)}
          autoComplete="email"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Joining…">Create account</SubmitButton>
    </form>
  );
}
