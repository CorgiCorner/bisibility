import { BrandLockup, Button, type ButtonProps } from "@/components/ui";
import { DOCS_URL } from "@/lib/site/site";
import {
  ArrowUpRightIcon as ArrowUpRight,
  BinocularsIcon as Binoculars,
  LifebuoyIcon as Lifebuoy,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

type SystemPageProps = {
  actions: ReactNode;
  description: string;
  kicker: string;
  statusLabel: string;
  terminal: ReactNode;
  title: string;
};

type TerminalBlockProps = {
  note: string;
  path: string;
  routes: string[];
  status: "404" | "500";
};

const actionSx = {
  borderRadius: "11px",
  fontSize: "14.5px",
  gap: "8px",
  minHeight: 46,
  padding: "12px 20px",
};

export function SystemPrimaryAction(props: ButtonProps) {
  return <Button size="lg" sx={actionSx} variant="primary" {...props} />;
}

export function SystemSecondaryAction(props: ButtonProps) {
  return <Button size="lg" sx={actionSx} variant="secondary" {...props} />;
}

export function SystemPage({
  actions,
  description,
  kicker,
  statusLabel,
  terminal,
  title,
}: Readonly<SystemPageProps>) {
  return (
    <main className="flex min-h-screen flex-col bg-bg text-fg">
      <div className="flex items-center justify-between px-5 py-5.5 sm:px-8">
        <a className="flex min-w-0" href="/">
          <BrandLockup />
        </a>
        <span className="font-mono text-[11px] text-fg-muted">{statusLabel}</span>
      </div>

      <section className="flex flex-1 flex-col items-center justify-center px-6 pb-[90px] pt-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-[17px] bg-accent-soft text-accent-text">
          <Binoculars aria-hidden size={34} weight="bold" />
        </span>
        <p className="mb-0 mt-6 font-mono text-[13px] tracking-[0.5px] text-accent-text">
          {kicker}
        </p>
        <h1 className="mb-0 mt-3 max-w-[760px] text-[34px] font-semibold leading-[1.05] tracking-[-1.6px] sm:text-[44px] lg:text-[52px]">
          {title}
        </h1>
        <p className="mb-0 mt-3.5 max-w-[440px] text-[15px] leading-[1.55] text-fg-muted">
          {description}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-[11px]">{actions}</div>
        {terminal}
        <a
          className="mt-5.5 inline-flex items-center gap-[7px] text-[13px] text-fg-muted hover:text-accent-text"
          href={DOCS_URL}
          rel="noreferrer noopener"
          target="_blank"
        >
          <Lifebuoy aria-hidden size={16} />
          Still stuck? Read the docs
          <ArrowUpRight aria-hidden size={14} weight="bold" />
        </a>
      </section>
    </main>
  );
}

export function TerminalBlock({ note, path, routes, status }: Readonly<TerminalBlockProps>) {
  return (
    <div className="mt-[34px] w-full max-w-[430px] overflow-hidden rounded-xl border border-border text-left">
      <div className="flex items-center gap-[7px] border-code-faint border-b bg-code-bg px-[13px] py-[9px]">
        <span className="h-[9px] w-[9px] rounded-full bg-red" />
        <span className="h-[9px] w-[9px] rounded-full bg-yellow" />
        <span className="h-[9px] w-[9px] rounded-full bg-green" />
      </div>
      <div
        className="overflow-x-auto p-[14px_15px] font-mono text-[12px] leading-[1.8] text-code-fg"
        style={{
          backgroundColor: "color-mix(in srgb, var(--code-bg) 88%, var(--bg))",
        }}
      >
        <div className="whitespace-nowrap">
          <span className="text-accent-text">GET</span> {path}
          <span className="text-code-faint"> -&gt; </span>
          <span className="text-red-text">{status}</span>
        </div>
        <div className="whitespace-nowrap text-code-faint"># {note}</div>
        <div className="whitespace-nowrap">
          {routes.map((route, index) => (
            <span key={route}>
              {index > 0 ? " " : null}
              <span className="text-blue-text">-&gt;</span>
              {route}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SystemLoadingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-bg text-fg">
      <div className="flex items-center justify-between px-5 py-5.5 sm:px-8">
        <a className="flex min-w-0" href="/">
          <BrandLockup />
        </a>
        <span className="font-mono text-[11px] text-fg-muted">INDEXING</span>
      </div>

      <section className="flex flex-1 flex-col items-center justify-center px-6 pb-[90px] pt-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-[17px] bg-accent-soft text-accent-text">
          <Binoculars aria-hidden size={34} weight="bold" />
        </span>
        <SkeletonBlock className="mt-6 h-[15px] w-[136px]" />
        <SkeletonBlock className="mt-4 h-[52px] w-full max-w-[520px]" />
        <SkeletonBlock className="mt-4 h-[48px] w-full max-w-[440px]" />
        <div className="mt-7 flex flex-wrap justify-center gap-[11px]">
          <SkeletonBlock className="h-[46px] w-[172px] rounded-[11px]" />
          <SkeletonBlock className="h-[46px] w-[154px] rounded-[11px]" />
        </div>
        <div className="mt-[34px] w-full max-w-[430px] overflow-hidden rounded-xl border border-border">
          <div className="flex items-center gap-[7px] border-code-faint border-b bg-code-bg px-[13px] py-[9px]">
            <span className="h-[9px] w-[9px] rounded-full bg-red" />
            <span className="h-[9px] w-[9px] rounded-full bg-yellow" />
            <span className="h-[9px] w-[9px] rounded-full bg-green" />
          </div>
          <div
            className="space-y-3 p-[15px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--code-bg) 88%, var(--bg))",
            }}
          >
            <SkeletonBlock className="h-3 w-[72%]" tone="code" />
            <SkeletonBlock className="h-3 w-[58%]" tone="code" />
            <SkeletonBlock className="h-3 w-[82%]" tone="code" />
          </div>
        </div>
      </section>
    </main>
  );
}

function SkeletonBlock({
  className,
  tone = "surface",
}: Readonly<{
  className: string;
  tone?: "code" | "surface";
}>) {
  const background =
    tone === "code"
      ? "color-mix(in srgb, var(--code-faint) 34%, var(--code-bg))"
      : "linear-gradient(90deg, var(--bg-sunken), var(--bg-inset), var(--bg-sunken))";

  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded bg-bg-sunken ${className}`}
      style={{ background }}
    />
  );
}
