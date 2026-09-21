import type { FormState } from "@/lib/actions/auth";

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error) return <div className="alert-error">{state.error}</div>;
  if (state.success) return <div className="alert-success">{state.success}</div>;
  return null;
}
