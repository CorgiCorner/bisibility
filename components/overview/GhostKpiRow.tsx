import { Card } from "@/components/ui";

const ghostLabels = ["Avg. position", "Tracked keywords", "In top 10", "Visibility"];

export function GhostKpiRow() {
  return (
    <section aria-hidden className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
      {ghostLabels.map((label) => (
        <Card className="min-w-0 px-[18px] py-4" key={label} size="md">
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
            {label}
          </div>
          <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-1px] text-fg-faint">
            &ndash;
          </div>
          <div className="mt-1.5 h-1.5 w-3/5 rounded-[3px] bg-bg-sunken" />
        </Card>
      ))}
    </section>
  );
}
