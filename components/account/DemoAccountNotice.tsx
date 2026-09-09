import { AccountShell } from "./AccountShell";
import type { AccountSectionId } from "./account-sections";

export function DemoAccountNotice({ section }: { section: AccountSectionId }) {
  return (
    <AccountShell activeSection={section}>
      <section className="rounded-card border border-border bg-bg-elev p-5">
        <h1 className="m-0 text-lg font-semibold">Demo account</h1>
        <p className="mb-0 text-sm text-fg-muted">
          This shared account is read-only. Email, profile and security settings cannot be changed.
        </p>
      </section>
    </AccountShell>
  );
}
