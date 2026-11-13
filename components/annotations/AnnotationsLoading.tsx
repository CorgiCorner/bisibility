import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";
import { annotationsBlocks, annotationsLayoutClassName } from "./annotations-layout";

function Bar({ className, ...props }: Readonly<{ className: string } & Record<string, string>>) {
  return (
    <div
      className={`rounded-control bg-bg-sunken motion-safe:animate-pulse ${className}`}
      {...props}
    />
  );
}

export function AnnotationsLoading() {
  return (
    <PageContent aria-busy="true">
      <div
        aria-hidden
        className={annotationsLayoutClassName}
        data-annotations-blocks={annotationsBlocks.join(" ")}
      >
        <Bar className="h-5 w-2/3 max-w-3xl" data-annotations-section="lead" />
        <Card className="flex min-h-40 flex-col gap-3" data-annotations-section="ruler">
          <Bar className="h-5 w-40" />
          <Bar className="h-16 w-full" />
          <Bar className="h-4 w-64" />
        </Card>
        <Bar className="h-10 w-full" data-annotations-section="composer" />
        <Bar className="h-8 w-full" data-annotations-section="filters" />
        <div className="grid gap-4 lg:grid-cols-2" data-annotations-section="board">
          <Card>
            <Bar className="h-64 w-full" />
          </Card>
          <Card>
            <Bar className="h-64 w-full" />
          </Card>
        </div>
        <Card className="flex flex-col gap-3" data-annotations-section="sources">
          <Bar className="h-5 w-32" />
          <Bar className="h-10 w-full" />
          <Bar className="h-10 w-full" />
        </Card>
      </div>
    </PageContent>
  );
}
