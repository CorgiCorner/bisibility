import type { KeyboardEvent } from "react";

type ShellKeyOptions = {
  closePalette: () => void;
  paletteOpen: boolean;
  togglePalette: () => void;
};

export function handleShellKeyDown(
  event: KeyboardEvent<HTMLElement>,
  { closePalette, paletteOpen, togglePalette }: ShellKeyOptions,
) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    togglePalette();
    return;
  }

  if (event.key === "Escape") {
    if (paletteOpen) {
      event.preventDefault();
      closePalette();
      return;
    }
    if (closeOpenMuiOverlay()) {
      event.preventDefault();
    }
    return;
  }

  if (event.key === "/" && !hasShortcutModifier(event) && !isTypingTarget(event.target)) {
    focusKeywordSearch(event);
  }
}

function focusKeywordSearch(event: KeyboardEvent<HTMLElement>) {
  if (hasOpenMuiOverlay()) {
    return;
  }
  const searchInput = document.getElementById("keywords-filter");
  if (!(searchInput instanceof HTMLInputElement) || searchInput.disabled) {
    return;
  }
  event.preventDefault();
  searchInput.focus();
  searchInput.select();
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.closest("[contenteditable='true']")) {
    return true;
  }
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function hasShortcutModifier(event: KeyboardEvent<HTMLElement>) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function hasOpenMuiOverlay() {
  return Boolean(document.querySelector(".MuiModal-root"));
}

function closeOpenMuiOverlay() {
  const backdrops = document.querySelectorAll<HTMLElement>(".MuiModal-root .MuiBackdrop-root");
  const backdrop = backdrops[backdrops.length - 1];
  if (!backdrop) {
    return false;
  }
  backdrop.click();
  return true;
}
