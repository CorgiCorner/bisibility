"use client";
import { Button } from "@/components/ui/Button";
import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import type { ModelConnection } from "@/lib/model-playground/composer-state";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { ModelPlaygroundConnect } from "./ModelPlaygroundConnect";

export function ModelPlaygroundAddColumn({
  reason,
  onAdd,
  connections,
  projectId,
  canConnect,
  copy,
}: Readonly<{
  reason?: string;
  onAdd: () => void;
  connections: readonly ModelConnection[];
  projectId: string;
  canConnect: boolean;
  copy: ModelPlaygroundCopy;
}>) {
  return (
    <div className="model-playground-add gap-2" data-add-column>
      <Button
        className="whitespace-nowrap"
        startIcon={<PlusIcon aria-hidden size={16} weight="regular" />}
        size="sm"
        variant="outline"
        disabled={Boolean(reason)}
        title={reason}
        onClick={onAdd}
      >
        {copy.addModel}
      </Button>
      {reason ? <p className="m-0 text-ui-caption text-fg-muted">{reason}</p> : null}
      {reason !== copy.noModels ? null : (
        <ModelPlaygroundConnect
          connections={connections}
          projectId={projectId}
          canConnect={canConnect}
          copy={copy}
          size="sm"
        />
      )}
    </div>
  );
}
