export const inputClassName =
  "border border-border-control bg-transparent text-fg outline-none transition-colors placeholder:text-[12px] placeholder:leading-4 placeholder:text-fg-muted focus:border-accent disabled:cursor-not-allowed disabled:border-dashed disabled:bg-bg-sunken disabled:text-fg-muted";

/** Standard form-field geometry, shared by inputs and adjacent actions. */
export const inputControlSizeClassName = "min-h-10 px-[13px] py-[9px] text-ui-body";

// Editable fields use 16px text below sm to prevent browser zoom and become 44px tall.
export const inputActionSizeClassName = `${inputControlSizeClassName} max-sm:min-h-11`;

/** Shared value and placeholder typography for compact search and toolbar controls. */
export const compactInputTypographyClassName =
  "compact-text-12 text-[12px] leading-4 placeholder:text-[12px] placeholder:leading-4 placeholder:text-fg-muted";

/** Geometry for compact standalone controls such as toolbar inputs. */
export const compactInputGeometryClassName = "min-h-[34px] py-1";

export const compactInputClassName = `${compactInputGeometryClassName} ${compactInputTypographyClassName}`;
