import { redirect } from "next/navigation";
import { hasAnyUsers } from "@/lib/auth";
import { RegisterForm } from "./RegisterForm";

// Reads the database on every request; must not be baked in at build time.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await hasAnyUsers()) redirect("/login");
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Create the owner account</h1>
      <p className="mt-1 text-sm text-ink-2">
        This is a one-time setup. You will be able to invite partners and teammates afterwards.
      </p>
      <div className="mt-6">
        <RegisterForm />
      </div>
    </div>
  );
}
