import { MOTION_MENU_ENTER, MOTION_MENU_EXIT } from "@/lib/ui/motion";
import { useCallback, useRef, useState } from "react";

export const menuTransitionDuration = {
  appear: MOTION_MENU_ENTER,
  enter: MOTION_MENU_ENTER,
  exit: MOTION_MENU_EXIT,
} as const;

export function useMenuExitLifecycle(reset: () => void) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const openRef = useRef(false);
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const open = Boolean(anchorEl);

  const openMenu = useCallback((element: HTMLElement) => {
    openRef.current = true;
    setAnchorEl(element);
  }, []);

  const closeMenu = useCallback(() => {
    openRef.current = false;
    setAnchorEl(null);
  }, []);

  const handleExited = useCallback(() => {
    if (openRef.current) return;
    resetRef.current();
  }, []);

  return { anchorEl, closeMenu, handleExited, open, openMenu };
}
