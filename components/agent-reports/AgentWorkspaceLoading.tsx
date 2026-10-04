import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";

export function AgentWorkspaceLoading() {
  return (
    <PageContent variant="constrained">
      <Card aria-busy="true">
        <div aria-hidden="true" className="grid gap-5 motion-safe:animate-pulse">
          {["title", "body", "footer"].map((key) => (
            <div className="h-20 rounded-control bg-bg-sunken" key={key} />
          ))}
        </div>
      </Card>
    </PageContent>
  );
}
