"use client";

import MuiTooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useForkRef } from "@mui/material/utils";
import {
  type CSSProperties,
  cloneElement,
  createContext,
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  type Ref,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { TooltipTransition } from "./TooltipTransition";

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
  children: ReactElement;
  content: string | number;
  placement?: TooltipPlacement;
  arrow?: boolean;
  semantics?: TooltipSemantics;
};

const WARM_WINDOW_MS = 800;
const ENTER_DELAY = 500;
const ENTER_NEXT_DELAY = 0;
const TOUCH_OPEN_DELAY = 700;
const TOUCH_LEAVE_DELAY = 1500;

type TooltipContextValue = {
  beginOpen: () => boolean;
  beginClose: () => void;
};

const fallbackContext: TooltipContextValue = {
  beginOpen: () => false,
  beginClose: () => undefined,
};

const TooltipContext = createContext<TooltipContextValue>(fallbackContext);

type TooltipTriggerProps = HTMLAttributes<HTMLElement> & {
  child: ReactElement<Record<string, unknown>>;
};

const TooltipTrigger = forwardRef<HTMLElement, TooltipTriggerProps>(function TooltipTrigger(
  { child, onTouchStart: _muiTouchStart, ...injectedProps },
  forwardedRef,
) {
  const childRef = (child.props as { ref?: Ref<HTMLElement> }).ref;
  const ref = useForkRef(forwardedRef, childRef);
  return cloneElement(child, { ...injectedProps, ref });
});

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

export function TooltipProvider({ children }: { children: ReactNode }) {
  const warmRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const beginOpen = useCallback(() => {
    const wasWarm = warmRef.current;
    warmRef.current = true;
    if (cooldownTimerRef.current !== undefined) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = undefined;
    }
    return wasWarm;
  }, []);

  const beginClose = useCallback(() => {
    warmRef.current = true;
    if (cooldownTimerRef.current !== undefined) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      warmRef.current = false;
      cooldownTimerRef.current = undefined;
    }, WARM_WINDOW_MS);
  }, []);

  const value = useMemo(() => ({ beginClose, beginOpen }), [beginClose, beginOpen]);

  const cleanupRef = useCallback((_: HTMLSpanElement | null) => {
    return () => {
      if (cooldownTimerRef.current !== undefined) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = undefined;
      }
    };
  }, []);

  return (
    <TooltipContext.Provider value={value}>
      <span hidden ref={cleanupRef} />
      {children}
    </TooltipContext.Provider>
  );
}

export function Tooltip({
  children,
  content,
  placement,
  arrow = false,
  semantics = "label",
}: Readonly<TooltipProps>) {
  const { beginClose, beginOpen } = useContext(TooltipContext);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", {
    noSsr: true,
  });
  const [open, setOpen] = useState(false);
  const [warmCycle, setWarmCycle] = useState(false);

  const isDescription = semantics === "description";
  const descriptionId = useId();

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

  const cleanupRef = useCallback(
    (_: HTMLSpanElement | null) => {
      return () => {
        clearTouchOpenTimer();
        clearTouchLeaveTimer();
        touchActiveRef.current = false;
        touchOpenedRef.current = false;
      };
    },
    [clearTouchLeaveTimer, clearTouchOpenTimer],
  );

  const childProps = children.props as {
    "aria-describedby"?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    onTouchStart?: (e: ReactTouchEvent<Element>) => void;
    onTouchEnd?: (e: ReactTouchEvent<Element>) => void;
    onTouchCancel?: (e: ReactTouchEvent<Element>) => void;
  };

  let childElement = cloneElement(children as ReactElement<Record<string, unknown>>, {
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

  const {
    onTouchStart: _manualTouchStart,
    ref: _childRef,
    ...triggerProps
  } = childElement.props as Record<string, unknown> & { ref?: Ref<HTMLElement> };

  return (
    <>
      <MuiTooltip
        arrow={arrow}
        disableInteractive
        disableTouchListener
        enterDelay={ENTER_DELAY}
        enterNextDelay={ENTER_NEXT_DELAY}
        onClose={() => {
          if (touchActiveRef.current || touchLeaveTimerRef.current !== undefined) return;
          setOpen(false);
          beginClose();
        }}
        onOpen={() => {
          if (touchActiveRef.current || touchOpenedRef.current) return;
          setOpen(true);
          setWarmCycle(beginOpen());
        }}
        open={open}
        placement={placement}
        slots={{ transition: TooltipTransition }}
        slotProps={{
          transition: {
            reducedMotion,
            warm: warmCycle,
          },
        }}
        title={String(content)}
      >
        <TooltipTrigger child={childElement} {...triggerProps} />
      </MuiTooltip>
      {isDescription ? (
        <span id={descriptionId} style={visuallyHidden}>
          {content}
        </span>
      ) : null}
      {/* Callback-ref cleanup avoids an effect for timer ownership. */}
      <span hidden ref={cleanupRef} />
    </>
  );
}
