import { InfoIcon as Info, TerminalWindowIcon as TerminalWindow } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function StepLabel({ index, title }: Readonly<{ index: number; title: string }>) {
  return (
    <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
      Step {index} · {title}
    </div>
  );
}

export function TokenSourceStep({
  children,
  step,
  targetLabel,
}: Readonly<{
  children: ReactNode;
  step: number;
  targetLabel: string;
}>) {
  return (
    <>
      <StepLabel
        index={step}
        title={`Create a migration token on the ${targetLabel} destination`}
      />
      <p className="m-0 mt-2 text-[12.5px] leading-5 text-fg-muted">
        The destination import page mints the <code className="font-mono">mig_...</code> token. It
        is shown once there - copy it before leaving that page.
      </p>
      {children}
    </>
  );
}

export function StepHeading({ body, title }: Readonly<{ body: string; title: string }>) {
  return (
    <>
      <h3 className="m-0 text-[15px] font-semibold">{title}</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">{body}</p>
    </>
  );
}

export function InfoBox({
  children,
  icon = "info",
}: Readonly<{ children: ReactNode; icon?: "info" | "terminal" }>) {
  const Icon = icon === "terminal" ? TerminalWindow : Info;
  return (
    <div className="mt-4 flex items-start gap-[9px] rounded-[11px] border border-dashed border-border-strong bg-transparent px-3.5 py-3 text-xs leading-5 text-fg-muted">
      <span className="flex h-5 shrink-0 items-center">
        <Icon aria-hidden className="text-accent-text" size={15} />
      </span>
      <span>{children}</span>
    </div>
  );
}
