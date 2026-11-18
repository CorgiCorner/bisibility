import type { ReactNode } from "react";
import { ModelPlaygroundColumnFrame } from "./ModelPlaygroundColumnFrame";
export type ModelPlaygroundDraftCard = {
  id: string;
  label: string;
  modelId: string;
  providerLabel: string;
  fundingSource?: "byok" | "platform";
  allowedProviders?: readonly string[];
  title: string;
  description: string;
  notices: string[];
  blocked: boolean;
  connect?: ReactNode;
};
export function ModelPlaygroundIdleColumn({
  column,
  onRemove,
  onSettings,
  disabled,
}: Readonly<{
  column: ModelPlaygroundDraftCard;
  onRemove: (id: string) => void;
  onSettings?: (id: string) => void;
  disabled?: boolean;
}>) {
  return (
    <ModelPlaygroundColumnFrame
      column={column}
      onRemove={onRemove}
      onSettings={onSettings}
      disabled={disabled}
    >
      <div className="grid gap-2 py-6" data-idle-column>
        <p className="m-0 text-ui-body font-medium">{column.title}</p>
        <p className="m-0 text-ui-body text-fg-muted" role={column.blocked ? "alert" : undefined}>
          {column.description}
        </p>
        {column.connect}
      </div>
      {column.notices.map((notice) => (
        <p key={notice} className="m-0 text-ui-caption text-fg-muted" role="status">
          {notice}
        </p>
      ))}
    </ModelPlaygroundColumnFrame>
  );
}
