import { createCloudImportWorkspace, createCloudWorkspace } from "@/lib/actions/cloud";
import {
  ArrowRightIcon as ArrowRight,
  CloudArrowUpIcon as CloudArrowUp,
  InfoIcon as Info,
  SparkleIcon as Sparkle,
} from "@phosphor-icons/react/dist/ssr";

/**
 * Create-new stays primary and first; import stays secondary. Omit recommendation
 * badges and use "/" as the sole separator.
 */
export function CloudOnboarding() {
  return (
    <div>
      <div className="mt-[30px] grid grid-cols-1 gap-4 sm:grid-cols-2">
        <form action={createCloudWorkspace}>
          <button
            className="flex h-full w-full flex-col rounded-[16px] border-[1.5px] border-accent bg-bg-elev p-[22px] text-left transition-colors hover:bg-accent-soft"
            type="submit"
          >
            <span className="grid h-[46px] w-[46px] place-items-center rounded-[12px] bg-accent-soft text-accent">
              <Sparkle aria-hidden size={24} weight="fill" />
            </span>
            <span className="mt-4 text-[17px] font-semibold tracking-[-0.4px] text-fg">
              Create a new workspace
            </span>
            <span className="mt-[7px] text-[13px] leading-[1.55] text-fg-muted">
              Start fresh. Add keywords manually or by CSV import, and connect a SERP provider.
            </span>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-accent">
              Start fresh
              <ArrowRight aria-hidden size={12} weight="bold" />
            </span>
          </button>
        </form>

        <form action={createCloudImportWorkspace}>
          <button
            className="flex h-full w-full flex-col rounded-[16px] border border-border bg-bg-elev p-[22px] text-left transition-colors hover:border-fg-faint"
            type="submit"
          >
            <span className="grid h-[46px] w-[46px] place-items-center rounded-[12px] bg-bg-sunken text-fg-muted">
              <CloudArrowUp aria-hidden size={24} weight="fill" />
            </span>
            <span className="mt-4 text-[17px] font-semibold tracking-[-0.4px] text-fg">
              Import from a self-hosted instance
            </span>
            <span className="mt-[7px] text-[13px] leading-[1.55] text-fg-muted">
              Already self-hosting bisibility? Bring your keywords, ranking history, tags, alerts
              and saved views across.
            </span>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-fg-muted">
              Set up import
              <ArrowRight aria-hidden size={12} weight="bold" />
            </span>
          </button>
        </form>
      </div>

      <p className="mt-[22px] flex items-start gap-[9px] text-[12.5px] leading-[1.5] text-fg-faint">
        <Info aria-hidden className="mt-0.5 flex-none" size={14} />
        <span>
          You can import into a workspace later too, from{" "}
          <strong className="font-semibold text-fg-muted">Settings / Import from self-host</strong>.
          Self-hosting stays free and open source forever; with Cloud we run the servers, scaling
          and upgrades for you.
        </span>
      </p>
    </div>
  );
}
