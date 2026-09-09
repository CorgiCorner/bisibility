"use client";

import * as Primitive from "@/components/ui/primitives/tooltip";
import { cn } from "@/lib/ui/cn";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import {
  type CSSProperties,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { TooltipProvider, useTooltipContext, WARM_WINDOW_MS } from "./tooltip-context";

export { TooltipProvider } from "./tooltip-context";

import tooltipStyles from "./tooltip.module.css";

export type TooltipSemantics = "label" | "description";
export type TooltipPlacement =
  | "bottom"
  | "bottom-end"
  | "bottom-start"
  | "left"
  | "left-end"
  | "left-start"
  | "right"
  | "right-end"
  | "right-start"
  | "top"
  | "top-end"
  | "top-start";

export type TooltipProps = {
  children: ReactNode;
  content: ReactNode;
  placement?: TooltipPlacement;
  arrow?: boolean;
  semantics?: TooltipSemantics;
  wrapperClassName?: string;
};

const TOUCH_OPEN_DELAY = 700;
const TOUCH_LEAVE_DELAY = 1500;

function useTooltipTouchCleanup(clearOpen: () => void, clearLeave: () => void) {
  // Releases long-press timers owned by the browser when the trigger unmounts.
  useEffect(
    () => () => {
      clearOpen();
      clearLeave();
    },
    [clearOpen, clearLeave],
  );
}

const visuallyHidden: CSSProperties = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
};

function TooltipContent({
  children,
  content,
  placement,
  arrow = false,
  semantics = "label",
  wrapperClassName,
}: Readonly<TooltipProps>) {
  const { beginClose, beginOpen } = useTooltipContext();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [open, setOpen] = useState(false);
  const [warmCycle, setWarmCycle] = useState(false);

  const isDescription = semantics === "description";
  const descriptionId = useId();

  const clickInProgressRef = useRef(false);
  const touchActiveRef = useRef(false);
  const touchOpenedRef = useRef(false);
  const touchOpenTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearTouchOpenTimer = useCallback(() => {
    if (touchOpenTimerRef.current !== undefined) {
      clearTimeout(touchOpenTimerRef.current);
      touchOpenTimerRef.current = undefined;
    }
  }, []);

  const clearTouchLeaveTimer = useCallback(() => {
    if (touchLeaveTimerRef.current !== undefined) {
      clearTimeout(touchLeaveTimerRef.current);
      touchLeaveTimerRef.current = undefined;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    touchActiveRef.current = true;
    clearTouchLeaveTimer();
    clearTouchOpenTimer();
    if (open) {
      touchOpenedRef.current = true;
    } else {
      touchOpenedRef.current = false;
      touchOpenTimerRef.current = setTimeout(() => {
        touchOpenTimerRef.current = undefined;
        touchOpenedRef.current = true;
        setOpen(true);
        setWarmCycle(beginOpen());
      }, TOUCH_OPEN_DELAY);
    }
  }, [beginOpen, clearTouchLeaveTimer, clearTouchOpenTimer, open]);

  const handleTouchEnd = useCallback(() => {
    clearTouchOpenTimer();
    touchOpenTimerRef.current = setTimeout(() => {
      touchOpenTimerRef.current = undefined;
      touchActiveRef.current = false;
    }, WARM_WINDOW_MS);
    if (touchOpenedRef.current) {
      touchLeaveTimerRef.current = setTimeout(() => {
        touchLeaveTimerRef.current = undefined;
        touchOpenedRef.current = false;
        setOpen(false);
        beginClose();
      }, TOUCH_LEAVE_DELAY);
    }
  }, [beginClose, clearTouchOpenTimer]);

  useTooltipTouchCleanup(clearTouchOpenTimer, clearTouchLeaveTimer);

  if (!isValidElement(children)) return children;

  const child = children as ReactElement<Record<string, unknown>>;
  const childProps = (child.props ?? {}) as {
    "aria-describedby"?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    onTouchStart?: (e: ReactTouchEvent<Element>) => void;
    onTouchEnd?: (e: ReactTouchEvent<Element>) => void;
    onTouchCancel?: (e: ReactTouchEvent<Element>) => void;
  };

  let childElement = cloneElement(child, {
    onTouchStart: (e: ReactTouchEvent<Element>) => {
      childProps.onTouchStart?.(e);
      handleTouchStart();
    },
    onTouchEnd: (e: ReactTouchEvent<Element>) => {
      childProps.onTouchEnd?.(e);
      handleTouchEnd();
    },
    onTouchCancel: (e: ReactTouchEvent<Element>) => {
      childProps.onTouchCancel?.(e);
      handleTouchEnd();
    },
  });

  if (isDescription) {
    childElement = cloneElement(childElement as ReactElement<Record<string, unknown>>, {
      "aria-describedby": [childProps["aria-describedby"], descriptionId].filter(Boolean).join(" "),
      "aria-label": childProps["aria-label"],
      "aria-labelledby": childProps["aria-labelledby"],
    });
  }

  if (
    !isDescription &&
    typeof content === "string" &&
    !childProps["aria-label"] &&
    !childProps["aria-labelledby"]
  ) {
    childElement = cloneElement(childElement, { "aria-label": content });
  }
  const [side, alignment] = (placement ?? "bottom").split("-") as [
    "top" | "bottom" | "left" | "right",
    "start" | "end" | undefined,
  ];

  return (
    <span
      className={cn("relative inline-flex max-w-full", wrapperClassName)}
      onClickCapture={() => {
        clickInProgressRef.current = true;
        queueMicrotask(() => {
          clickInProgressRef.current = false;
        });
      }}
    >
      <Primitive.Tooltip
        open={open}
        onOpenChange={(next) => {
          if (next) {
            if (touchActiveRef.current || touchOpenedRef.current) return;
            setOpen(true);
            setWarmCycle(beginOpen());
          } else {
            if (
              clickInProgressRef.current ||
              touchActiveRef.current ||
              touchLeaveTimerRef.current !== undefined
            )
              return;
            setOpen(false);
            beginClose();
          }
        }}
      >
        <Primitive.TooltipTrigger asChild>{childElement}</Primitive.TooltipTrigger>
        <Primitive.TooltipPortal>
          <Primitive.TooltipContent
            side={side}
            align={alignment ?? "center"}
            sideOffset={6}
            data-ui-tooltip
            className={tooltipStyles.content}
            data-instant={warmCycle || reducedMotion || undefined}
          >
            {content}
            {arrow ? <Primitive.TooltipArrow className="fill-fg" /> : null}
          </Primitive.TooltipContent>
        </Primitive.TooltipPortal>
      </Primitive.Tooltip>
      {isDescription ? (
        <span id={descriptionId} style={visuallyHidden}>
          {content}
        </span>
      ) : null}
    </span>
  );
}

export function Tooltip(props: Readonly<TooltipProps>) {
  const { provided } = useTooltipContext();
  if (props.content == null || props.content === false || props.content === "") {
    return (
      <span className={cn("relative inline-flex max-w-full", props.wrapperClassName)}>
        {props.children}
      </span>
    );
  }
  return provided ? (
    <TooltipContent {...props} />
  ) : (
    <TooltipProvider>
      <TooltipContent {...props} />
    </TooltipProvider>
  );
}
