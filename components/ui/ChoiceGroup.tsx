"use client";

import { cn } from "@/lib/ui/cn";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { type KeyboardEvent, type ReactNode, useId } from "react";

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  description?: ReactNode;
  disabledReason?: string;
};
type SharedProps<T extends string> = {
  label: string;
  options: readonly ChoiceOption<T>[];
  disabled?: boolean;
  className?: string;
};
export type ChoiceGroupProps<T extends string> = SharedProps<T> &
  (
    | {
        mode: "multiple";
        value: readonly T[];
        onChange: (value: T[]) => void;
        max?: number;
        maxHint?: string;
      }
    | { mode: "single"; value: T; onChange: (value: T) => void; max?: never; maxHint?: never }
  );

/** Disabled choices remain focusable so their explanation is available to keyboard users. */
export function ChoiceGroup<T extends string>(props: Readonly<ChoiceGroupProps<T>>) {
  const id = useId();
  const selected = (value: T) =>
    props.mode === "single" ? props.value === value : props.value.includes(value);
  const reached =
    props.mode === "multiple" && props.max !== undefined && props.value.length >= props.max;
  const blocked = (option: ChoiceOption<T>) =>
    Boolean(props.disabled || option.disabledReason || (reached && !selected(option.value)));
  function choose(option: ChoiceOption<T>) {
    if (blocked(option)) return;
    if (props.mode === "single") props.onChange(option.value);
    else
      props.onChange(
        selected(option.value)
          ? props.value.filter((value) => value !== option.value)
          : [...props.value, option.value],
      );
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (
      props.mode !== "single" ||
      !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)
    )
      return;
    event.preventDefault();
    const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
    for (let offset = 1; offset <= props.options.length; offset++) {
      const next = (index + direction * offset + props.options.length) % props.options.length;
      const option = props.options[next];
      if (!blocked(option)) {
        choose(option);
        document.getElementById(`${id}-${next}`)?.focus();
        return;
      }
    }
  }
  return (
    <div
      className={cn("grid min-w-0 gap-2", props.className)}
      role={props.mode === "single" ? "radiogroup" : "group"}
      aria-labelledby={`${id}-label`}
      aria-describedby={props.maxHint ? `${id}-hint` : undefined}
    >
      <span id={`${id}-label`} className="text-ui-body">
        {props.label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-2">
        {props.options.map((option, index) => {
          const active = selected(option.value);
          const disabled = blocked(option);
          const reason = option.disabledReason ?? (reached && !active ? props.maxHint : undefined);
          return (
            <button
              key={option.value}
              id={`${id}-${index}`}
              type="button"
              role={props.mode === "single" ? "radio" : "checkbox"}
              aria-label={option.label}
              aria-checked={active}
              aria-disabled={disabled}
              aria-describedby={reason || option.description ? `${id}-desc-${index}` : undefined}
              onClick={() => choose(option)}
              onKeyDown={(event) => navigate(event, index)}
              className={cn(
                "flex min-h-10 max-w-full items-center gap-2 rounded-control border border-border-control px-3 py-2 text-left text-ui-body text-fg",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid",
                active ? "bg-bg-sunken" : "bg-transparent",
                disabled ? "cursor-not-allowed opacity-55" : "hover:bg-bg-band",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border border-border-control",
                  active && "border-accent-solid bg-accent-solid text-primary-contrast",
                )}
              >
                {active ? <CheckIcon size={12} weight="regular" /> : null}
              </span>
              <span className="min-w-0 break-words">
                <span className="block">{option.label}</span>
                {reason || option.description ? (
                  <span id={`${id}-desc-${index}`} className="block text-ui-xs text-fg-muted">
                    {reason ?? option.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {props.maxHint ? (
        <span id={`${id}-hint`} className="text-ui-xs text-fg-muted" role="status">
          {props.maxHint}
        </span>
      ) : null}
    </div>
  );
}
