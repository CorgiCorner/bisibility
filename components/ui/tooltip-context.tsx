"use client";
import * as Primitive from "@/components/ui/primitives/tooltip";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
export const WARM_WINDOW_MS = 800;
const ENTER_DELAY = 500;
type TooltipContextValue = {
  provided: boolean;
  beginOpen: () => boolean;
  beginClose: () => void;
};

const fallbackContext: TooltipContextValue = {
  provided: false,
  beginOpen: () => false,
  beginClose: () => undefined,
};

const TooltipContext = createContext<TooltipContextValue>(fallbackContext);

function useTooltipProviderCooldownCleanup(
  cooldownTimerRef: RefObject<ReturnType<typeof setTimeout> | undefined>,
) {
  // Synchronizes timer ownership with the browser lifecycle on provider unmount.
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== undefined) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = undefined;
      }
    };
  }, [cooldownTimerRef]);
}

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

  const value = useMemo(() => ({ beginClose, beginOpen, provided: true }), [beginClose, beginOpen]);

  useTooltipProviderCooldownCleanup(cooldownTimerRef);

  return (
    <TooltipContext.Provider value={value}>
      <Primitive.TooltipProvider
        delayDuration={ENTER_DELAY}
        skipDelayDuration={WARM_WINDOW_MS}
        disableHoverableContent
      >
        {children}
      </Primitive.TooltipProvider>
    </TooltipContext.Provider>
  );
}

export function useTooltipContext() {
  return useContext(TooltipContext);
}
