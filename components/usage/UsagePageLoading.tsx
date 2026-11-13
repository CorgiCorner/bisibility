import { PageContent } from "@/components/shell/PageContent";
import { usageBlocks, usagePageClassName } from "./usage-page-layout";

function Bar({ className }: Readonly<{ className: string }>) {
  return <div className={`rounded-control bg-bg-sunken motion-safe:animate-pulse ${className}`} />;
}

export function UsagePageLoading() {
  return (
    <PageContent
      aria-busy="true"
      className={usagePageClassName}
      data-usage-blocks={usageBlocks.join(" ")}
    >
      <div aria-hidden className="flex min-w-0 flex-col gap-5">
        <Bar className="h-5 w-2/3 max-w-3xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-usage-section="tiles">
          {["seo", "provider", "subscriptions", "custom"].map((key) => (
            <div className="min-h-24 rounded-card border border-border bg-bg-elev p-4" key={key}>
              <Bar className="h-4 w-20" />
              <Bar className="mt-3 h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-4" data-usage-section="billing">
          <div className="min-h-24 rounded-card border border-border bg-bg-elev p-4">
            <Bar className="h-5 w-48" />
          </div>
          <div className="min-h-40 rounded-card border border-border bg-bg-elev p-4">
            <Bar className="h-5 w-40" />
            <Bar className="mt-4 h-8 w-full" />
          </div>
        </div>
        <div
          className="min-h-40 rounded-card border border-border bg-bg-elev p-4"
          data-usage-section="subscriptions"
        >
          <Bar className="h-5 w-40" />
          <Bar className="mt-3 h-16 w-full" />
        </div>
      </div>
    </PageContent>
  );
}
