import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUsers } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  if (!(await hasAnyUsers())) redirect("/register");
  redirect("/login");
}
