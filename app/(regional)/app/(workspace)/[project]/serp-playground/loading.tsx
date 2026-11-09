import { PageContent } from "@/components/shell/PageContent";
export default function Loading() {
  return (
    <PageContent variant="section" aria-busy="true">
      <div className="grid gap-5" aria-hidden="true">
        <div className="h-4 w-72 animate-pulse rounded-control bg-bg-sunken" />
        <div className="h-64 animate-pulse rounded-card border border-border bg-bg-elev" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-96 animate-pulse rounded-card border border-border bg-bg-elev"
            />
          ))}
        </div>
      </div>
    </PageContent>
  );
}
