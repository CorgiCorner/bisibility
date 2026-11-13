import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";
import "./ModelPlaygroundLoading.module.css";
import { cn } from "@/lib/ui/cn";
import { modelPlaygroundBlocks } from "./model-playground-layout";

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <div className={cn("rounded-control bg-bg-sunken motion-safe:animate-pulse", className)} />
  );
}

/** Mirrors the model playground: composer, view switch, and results. No provider notice. */
export function ModelPlaygroundLoading() {
  return (
    <PageContent aria-busy="true" variant="section">
      <div
        aria-hidden
        className="grid min-w-0 gap-5"
        data-model-playground-blocks={modelPlaygroundBlocks.join(" ")}
        data-model-playground-layout=""
      >
        <Card
          className="model-playground-composer-loading grid gap-4"
          data-model-playground-block="composer"
        >
          <Bar className="h-4 w-24" />
          <Bar className="h-24 w-full" />
          <div className="flex flex-col gap-4 md:flex-row">
            <Bar className="h-10 w-full max-w-sm" />
            <Bar className="h-10 w-48" />
          </div>
          <Bar className="h-16 w-full" />
          <Bar className="h-16 w-full max-w-40" />
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Bar className="h-9 w-24" />
            <Bar className="h-4 w-32" />
          </div>
        </Card>
        <div className="grid min-w-0 gap-4" data-model-playground-block="results">
          <div
            className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between"
            data-model-playground-block="toolbar"
          >
            <Bar className="h-9 w-64 max-w-full" />
            <div className="flex flex-wrap gap-2">
              <Bar className="h-9 w-28" />
              <Bar className="h-9 w-28" />
              <Bar className="h-9 w-28" />
            </div>
          </div>
          <Card className="min-h-40" />
        </div>
      </div>
    </PageContent>
  );
}
