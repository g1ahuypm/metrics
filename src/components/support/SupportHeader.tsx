import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { CheckNowButton } from "./CheckNowButton";

/** Title, the two Support sections, and "Check mail now". */
export function SupportHeader({
  active,
  mailbox,
  lastCheck,
  timeZone,
}: {
  active: "inbox" | "knowledge";
  mailbox: string | null;
  lastCheck: Date | null;
  timeZone: string;
}) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${on ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}>
      {label}
    </Link>
  );
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-extrabold tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-ink-2">
          {mailbox ? `${mailbox} · checked ${fmtDateTime(lastCheck, timeZone)}` : "Customer emails, answered from one place"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex rounded-full border border-border bg-surface p-1">
          {tab("/support", "Inbox", active === "inbox")}
          {tab("/support/knowledge", "Knowledge base", active === "knowledge")}
        </nav>
        {mailbox && <CheckNowButton />}
      </div>
    </div>
  );
}
