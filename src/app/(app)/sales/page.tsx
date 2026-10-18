import { redirect } from "next/navigation";

// Sales became the Orders page.
export default function SalesPage() {
  redirect("/orders");
}
