"use client";

import { AdminAccountActions } from "@/components/admin/AdminAccountActions";
import { displayTime } from "@/components/admin/AdminPrimitives";
import { Button, Card, SectionTitle } from "@/components/ui";
import { lookupInstanceAdminAccount } from "@/lib/actions/instance-admin-account";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  MagnifyingGlassIcon as MagnifyingGlass,
  UserIcon as User,
} from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const emailSchema = z.string().email();
const lookupSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter an exact email or user ID.")
    .max(320, "Enter an exact email or user ID.")
    .refine(
      (value) => emailSchema.safeParse(value).success || /^[^\s@]+$/.test(value),
      "Enter an exact email or user ID.",
    ),
});

type LookupForm = z.infer<typeof lookupSchema>;
type LookupResult = Awaited<ReturnType<typeof lookupInstanceAdminAccount>>;
type FoundAccount = Extract<LookupResult, { status: "found" }>["account"];

const count = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

function MetadataTile({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border-soft bg-bg-elev px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.4px] text-fg-faint">{label}</div>
      <div className="mt-auto pt-1 text-[13px] font-semibold text-fg">{value}</div>
    </div>
  );
}

function AccountMetadata({
  account,
  onStatusChange,
}: Readonly<{
  account: FoundAccount;
  onStatusChange: (status: FoundAccount["status"]) => void;
}>) {
  return (
    <div className="mt-4 rounded-[13px] border border-border bg-bg-sunken px-4 py-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[12.5px] font-bold">{account.id}</span>
        <span aria-hidden className="h-3 w-px bg-border-strong" />
        <span className="font-mono text-[11.5px] text-fg-muted">{account.email}</span>
        <span className="inline-flex rounded-full bg-green/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-green">
          {account.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <MetadataTile label="Created" value={displayTime(account.createdAt)} />
        <MetadataTile label="Last active" value={displayTime(account.lastActiveAt)} />
        <MetadataTile label="Projects" value={count.format(account.projectCount)} />
        <MetadataTile label="Keywords" value={count.format(account.keywordCount)} />
        <MetadataTile
          label="Spend this month"
          value={money.format(account.monthlySpendCents / 100)}
        />
        <MetadataTile
          label="Connections by kind"
          value={
            account.providerConnectionsByKind.length === 0 ? (
              "0"
            ) : (
              <span className="flex flex-col gap-0.5 font-mono text-[11px]">
                {account.providerConnectionsByKind.map((connection) => (
                  <span key={connection.kind}>
                    {connection.kind}: {count.format(connection.count)}
                  </span>
                ))}
              </span>
            )
          }
        />
      </div>
      <AdminAccountActions
        onStatusChange={onStatusChange}
        status={account.status}
        userId={account.id}
      />
    </div>
  );
}

function LookupOutcome({
  onStatusChange,
  result,
}: Readonly<{
  onStatusChange: (status: FoundAccount["status"]) => void;
  result: LookupResult | null;
}>) {
  if (!result) return null;
  if (result.status === "found") {
    return <AccountMetadata account={result.account} onStatusChange={onStatusChange} />;
  }

  if (result.status === "not_found") {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-[13px] border border-border-strong border-dashed bg-bg-sunken px-4 py-3.5">
        <User aria-hidden className="text-fg-faint" size={16} />
        <span className="text-[12.5px] text-fg-muted">No account matches this identifier.</span>
      </div>
    );
  }

  return (
    <p
      className={`mt-3 text-xs ${result.status === "rate_limited" ? "text-yellow" : "text-red"}`}
      role="alert"
    >
      {result.message}
    </p>
  );
}

export function AdminAccountLookup() {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LookupForm>({
    defaultValues: { identifier: "" },
    resolver: zodResolver(lookupSchema),
  });

  function onSubmit(values: LookupForm) {
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await lookupInstanceAdminAccount(values));
      } catch {
        setResult({ message: "Account lookup failed.", status: "failed" });
      }
    });
  }

  function updateAccountStatus(status: FoundAccount["status"]) {
    setResult((current) =>
      current?.status === "found"
        ? { ...current, account: { ...current.account, status } }
        : current,
    );
  }

  return (
    <Card component="section" size="lg" aria-labelledby="admin-account-lookup-heading">
      <SectionTitle id="admin-account-lookup-heading">Account lookup</SectionTitle>
      <p className="mt-1 text-xs text-fg-muted">
        Exact-match lookup returning account metadata only - never tenant content.
      </p>
      <form className="mt-3" onSubmit={handleSubmit(onSubmit)}>
        <label
          className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted"
          htmlFor="admin-account-identifier"
        >
          Exact email or user ID
        </label>
        <div className="mt-1.5 flex flex-wrap items-start gap-2.5">
          <span className="flex min-h-10 min-w-[240px] max-w-[420px] flex-1 items-center gap-2 rounded-[10px] border border-border-strong bg-bg-sunken px-3 focus-within:border-accent">
            <MagnifyingGlass aria-hidden className="shrink-0 text-fg-faint" size={14} />
            <input
              aria-invalid={errors.identifier ? "true" : undefined}
              className="min-w-0 flex-1 border-0 bg-transparent py-2 font-mono text-[12.5px] text-fg outline-none"
              id="admin-account-identifier"
              placeholder="Exact email or user ID"
              spellCheck={false}
              {...register("identifier")}
            />
          </span>
          <Button disabled={pending} loading={pending} loadingLabel="Looking up..." type="submit">
            Look up
          </Button>
        </div>
        {errors.identifier ? (
          <p className="mt-1.5 text-[11px] text-red" role="alert">
            {errors.identifier.message}
          </p>
        ) : null}
      </form>
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-fg-faint">
        <ClockCounterClockwise aria-hidden size={12} />
        Lookups are recorded in the admin audit log.
      </p>
      <LookupOutcome onStatusChange={updateAccountStatus} result={result} />
    </Card>
  );
}
