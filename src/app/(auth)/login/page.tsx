import Link from "next/link";
import { hasAnyUsers } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const usersExist = await hasAnyUsers();
  return (
    <div>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-ink-2">Welcome back. Enter your details to continue.</p>
      <div className="mt-6">
        <LoginForm />
      </div>
      {!usersExist && (
        <p className="mt-6 text-sm text-ink-2">
          No account yet?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Set up the owner account
          </Link>
        </p>
      )}
    </div>
  );
}
