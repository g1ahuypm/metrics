import { redirect } from "next/navigation";

// Profit & Loss now lives on the Dashboard (whole store) and on each product page.
export default function ProfitPage() {
  redirect("/dashboard");
}
