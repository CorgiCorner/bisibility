"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { type TagNameFormValues, tagNameFormSchema } from "@/lib/schemas/tag";
import { cn } from "@/lib/ui/cn";
import { MOTION_MENU_EXIT } from "@/lib/ui/motion";
import { PlusIcon as Plus, XIcon as X } from "@phosphor-icons/react";
import { type TransitionEvent, useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Kbd } from "./Kbd";
import {
  tagAdderAffordanceEnterDelayCancelClassName,
  tagAdderAffordanceEnterDelayKbdClassName,
  tagAdderAffordanceMotionClassName,
  tagAdderInputMotionClassName,
  tagAdderShellMotionClassName,
  tagChipClassName,
  tagChipGhostClassName,
} from "./tag-chip-styles";

export type TagAdderProps = {
  disabled?: boolean;
  onAdd: (name: string) => void | Promise<void>;
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const EXIT_FALLBACK_MS = MOTION_MENU_EXIT + 50;

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

export function TagAdder({ disabled = false, onAdd }: Readonly<TagAdderProps>) {
  const [editing, setEditing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const {
    clearErrors,
    formState: { errors },
    getValues,
    register,
    reset,
    trigger,
    watch,
  } = useForm<TagNameFormValues>({
    defaultValues: { name: "" },
    resolver: zodResolver(tagNameFormSchema),
  });
  const value = watch("name");
  const { ref: formRef, ...nameInput } = register("name");
  const skipBlurCommitRef = useRef(false);
  const exitFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitFinishedRef = useRef(false);
  const inputRef = useCallback(
    (input: HTMLInputElement | null) => {
      formRef(input);
      if (input && editing && !exiting) input.focus();
    },
    [editing, exiting, formRef],
  );

  const showEditor = editing || exiting;
  const showAffordances = entered && !exiting;
  const showIdleLabel = !editing || exiting;

  const finishClose = useCallback(() => {
    if (exitFinishedRef.current) return;
    exitFinishedRef.current = true;
    if (exitFallbackRef.current !== null) {
      clearTimeout(exitFallbackRef.current);
      exitFallbackRef.current = null;
    }
    setEditing(false);
    setExiting(false);
    setEntered(false);
    reset();
  }, [reset]);

  function open() {
    if (disabled) return;
    exitFinishedRef.current = false;
    setEditing(true);
    setExiting(false);
    setEntered(false);
    if (prefersReducedMotion()) {
      setEntered(true);
      return;
    }
    requestAnimationFrame(() => setEntered(true));
  }

  function close() {
    skipBlurCommitRef.current = false;
    if (!editing || exiting) return;
    if (prefersReducedMotion()) {
      finishClose();
      return;
    }
    setEntered(false);
    setExiting(true);
    exitFinishedRef.current = false;
    exitFallbackRef.current = setTimeout(() => {
      exitFallbackRef.current = null;
      finishClose();
    }, EXIT_FALLBACK_MS);
  }

  function cancel() {
    skipBlurCommitRef.current = true;
    close();
  }

  function handleEditorTransitionEnd(event: TransitionEvent<HTMLSpanElement>) {
    if (!exiting || event.currentTarget !== event.target || event.propertyName !== "opacity") {
      return;
    }
    finishClose();
  }

  async function commit({ keepOpen }: { keepOpen: boolean }) {
    const name = getValues("name").trim();
    if (!name) {
      clearErrors("name");
      if (!keepOpen) close();
      return;
    }
    if (!(await trigger("name"))) return;
    await onAdd(name);
    reset();
    if (!keepOpen) close();
  }

  return (
    <span
      className={cn(
        tagChipClassName,
        tagAdderShellMotionClassName,
        "relative gap-1 px-2.5",
        showEditor && !exiting
          ? "max-w-none border-solid border-border bg-bg-elev"
          : tagChipGhostClassName,
        editing && !entered && !exiting && "scale-[0.97] opacity-0",
        (editing && entered && !exiting) || exiting || !editing ? "scale-100 opacity-100" : null,
        exiting ? "pointer-events-none" : null,
      )}
    >
      <button
        aria-hidden={!showIdleLabel}
        aria-label="Add tag"
        className={cn(
          "inline-flex items-center gap-1 font-medium text-inherit outline-none transition-opacity duration-[var(--motion-menu-exit)] ease-[var(--ease-out)] motion-reduce:transition-none",
          showIdleLabel ? "relative opacity-100" : "pointer-events-none absolute opacity-0",
          disabled && "opacity-50",
        )}
        disabled={disabled}
        onClick={open}
        tabIndex={showIdleLabel ? 0 : -1}
        type="button"
      >
        <Plus aria-hidden size={12} weight="regular" />
        Add tag
      </button>

      {showEditor ? (
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1 transition-opacity duration-[var(--motion-menu-exit)] ease-[var(--ease-out)] motion-reduce:transition-none",
            exiting ? "pointer-events-none absolute inset-0 opacity-0" : "relative opacity-100",
          )}
          onTransitionEnd={handleEditorTransitionEnd}
        >
          <input
            aria-label="New tag name"
            autoComplete="off"
            className={cn(
              tagAdderInputMotionClassName,
              "min-w-8 max-w-32 flex-1 bg-transparent text-[11px] text-fg outline-none",
              exiting ? "opacity-0" : "opacity-100",
            )}
            disabled={disabled}
            ref={inputRef}
            {...nameInput}
            onBlur={(event) => {
              nameInput.onBlur(event);
              if (skipBlurCommitRef.current) {
                skipBlurCommitRef.current = false;
                return;
              }
              void commit({ keepOpen: false });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                skipBlurCommitRef.current = true;
                void commit({ keepOpen: true });
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
                return;
              }
              if (event.key === "Backspace" && value.length === 0) {
                event.preventDefault();
                cancel();
              }
            }}
            size={Math.max(6, value.length + 1)}
          />
          <Kbd
            aria-hidden
            className={cn(
              tagAdderAffordanceMotionClassName,
              tagAdderAffordanceEnterDelayKbdClassName,
              "h-4 min-w-4 text-[9px]",
            )}
            data-entered={showAffordances ? "" : undefined}
          >
            <span aria-hidden>↵</span>
            <span className="sr-only">Enter</span>
          </Kbd>
          <button
            aria-label="Cancel adding tag"
            className={cn(
              tagAdderAffordanceMotionClassName,
              tagAdderAffordanceEnterDelayCancelClassName,
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full p-0 leading-none text-fg-muted outline-none hover:bg-bg-sunken hover:text-fg focus-visible:bg-bg-sunken focus-visible:text-fg",
            )}
            data-entered={showAffordances ? "" : undefined}
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault();
              skipBlurCommitRef.current = true;
            }}
            onClick={cancel}
            type="button"
          >
            <X aria-hidden className="block shrink-0" size={10} weight="regular" />
          </button>
          {errors.name ? (
            <span className="sr-only" role="alert">
              {errors.name.message}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
