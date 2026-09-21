"use client";

import { useActionState } from "react";
import { registerOwnerAction } from "@/lib/actions/auth";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

export function RegisterForm() {
  const [state, action] = useActionState(registerOwnerAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="storeName">Store name</label>
        <input id="storeName" name="storeName" required className="input" placeholder="Acme Supply Co." />
      </div>
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" required className="input" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
        <p className="mt-1 text-xs text-ink-3">At least 8 characters.</p>
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Creating…">Create account</SubmitButton>
    </form>
  );
}
