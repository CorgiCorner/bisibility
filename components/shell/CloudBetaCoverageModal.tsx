"use client";

import { USAGE_BILLING_TARGET } from "@/components/settings/SettingsSection";
import { Button, Modal } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import {
  CheckIcon as Check,
  CloudIcon as Cloud,
  DownloadSimpleIcon as DownloadSimple,
  HardDrivesIcon as HardDrives,
  XIcon as X,
} from "@phosphor-icons/react";
import Link from "next/link";

type CloudBetaCoverageModalProps = {
  onClose: () => void;
  onExport: () => void;
  open: boolean;
  projectRef: string;
};

const covered = [
  "Rank checks run on schedule, on the same engine as self-host.",
  "Your provider keys and quotas stay yours - no markup, no resale.",
  "Full history is retained for the whole beta, never trimmed.",
  "Export is available at any time, in full fidelity.",
] as const;

const notYet = [
  "No restore guarantee. If we lose data, we cannot roll you back.",
  "No uptime SLA. Maintenance can interrupt checks without notice.",
  "No guaranteed migration path between hosted regions.",
  "Support is best-effort over email, with no response target.",
] as const;

function PolicyColumn({
  items,
  title,
  tone,
}: Readonly<{
  items: readonly string[];
  title: string;
  tone: "covered" | "not-yet";
}>) {
  const coveredTone = tone === "covered";
  return (
    <section className="min-w-0 rounded-[12px] border border-border bg-bg-elev p-3.5">
      <h3 className="m-0 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {title}
      </h3>
      <ul className="m-0 mt-3 grid list-none gap-3 p-0">
        {items.map((item) => (
          <li className="flex items-start gap-2 text-[12px] leading-[1.45]" key={item}>
            <span
              className={`mt-0.5 grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] ${
                coveredTone ? "bg-green/10 text-green-text" : "bg-red/10 text-red-text"
              }`}
            >
              {coveredTone ? (
                <Check aria-hidden size={10} weight="bold" />
              ) : (
                <X aria-hidden size={10} weight="bold" />
              )}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CloudBetaCoverageModal({
  onClose,
  onExport,
  open,
  projectRef,
}: Readonly<CloudBetaCoverageModalProps>) {
  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">
            Close
          </Button>
          <Button
            onClick={onExport}
            startIcon={<DownloadSimple aria-hidden size={15} weight="bold" />}
            type="button"
          >
            Export data
          </Button>
        </>
      }
      headerDivider
      onClose={onClose}
      open={open}
      title={
        <span className="block">
          <span className="block">What the hosted beta covers</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            Hosted beta policy
          </span>
        </span>
      }
      width={600}
    >
      <div className="grid gap-4.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PolicyColumn items={covered} title="Covered" tone="covered" />
          <PolicyColumn items={notYet} title="Not yet" tone="not-yet" />
        </div>

        <section>
          <h3 className="m-0 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            Who does what
          </h3>
          <div className="mt-2 grid gap-2">
            <div className="flex items-start gap-3 rounded-[11px] border border-border px-3.5 py-3">
              <HardDrives
                aria-hidden
                className="mt-0.5 shrink-0 text-fg-muted"
                size={17}
                weight="fill"
              />
              <div>
                <div className="text-[12.5px] font-semibold">On our side</div>
                <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-fg-muted">
                  Nightly snapshots are kept for 7 days on a best-effort basis. A small team runs
                  this open beta, so there is no on-call rota and no incident notice you can rely
                  on: assume you will notice an outage before we do.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-[11px] border border-accent bg-accent-soft px-3.5 py-3">
              <DownloadSimple
                aria-hidden
                className="mt-0.5 shrink-0 text-accent-text"
                size={17}
                weight="bold"
              />
              <div>
                <div className="text-[12.5px] font-semibold">On yours</div>
                <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-fg-muted">
                  Keep a recent export. It is the copy fully under your control and can be restored
                  into self-host.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="m-0 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            When the beta ends
          </h3>
          <div className="mt-2 flex items-start gap-3 rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
            <Cloud aria-hidden className="mt-0.5 shrink-0 text-fg-muted" size={17} weight="fill" />
            <p className="m-0 text-[11.5px] leading-[1.5] text-fg-muted">
              30 days notice before pricing. Nothing charged without your confirmation. Self-host
              stays available.{" "}
              <Link
                className="font-semibold text-accent-text hover:text-accent-text"
                href={`${appPath(projectRef, "settings")}#${USAGE_BILLING_TARGET.id}`}
                onClick={onClose}
              >
                See plan and billing
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
