"use client";

import { appPath } from "@/lib/routing/app-path";
import { usePathname } from "next/navigation";
import { type RefCallback, useRef } from "react";

const ACTION_PARAM = "action";
const RETRY_LIMIT = 60;

const keywordCommandActionValues = ["add", "import", "export", "filter", "run-check"] as const;

export type KeywordCommandAction = (typeof keywordCommandActionValues)[number];

const actionButtonLabels = {
  add: ["add keyword"],
  export: ["export"],
  import: ["import csv", "import"],
  "run-check": ["run checks"],
} satisfies Record<Exclude<KeywordCommandAction, "filter">, string[]>;

let pendingKeywordCommandAction: KeywordCommandAction | null = null;

export function keywordActionHref(projectRef: string, action: KeywordCommandAction) {
  return `${appPath(projectRef, "rank-tracker")}?${ACTION_PARAM}=${action}`;
}

export function parseKeywordCommandAction(value: string | null | undefined) {
  return keywordCommandActionValues.includes(value as KeywordCommandAction)
    ? (value as KeywordCommandAction)
    : null;
}

export function setPendingKeywordCommandAction(action: KeywordCommandAction) {
  pendingKeywordCommandAction = action;
}

export function consumePendingKeywordCommandAction() {
  const action = pendingKeywordCommandAction;
  pendingKeywordCommandAction = null;
  return action;
}

export function runKeywordCommandFromPalette(
  projectRef: string,
  action: KeywordCommandAction,
  push: (href: string) => void,
) {
  if (
    typeof window !== "undefined" &&
    window.location.pathname === appPath(projectRef, "rank-tracker")
  ) {
    if (performKeywordCommandAction(action)) {
      clearKeywordCommandActionParam();
      return;
    }
  }

  setPendingKeywordCommandAction(action);
  push(keywordActionHref(projectRef, action));
}

export function performKeywordCommandAction(action: KeywordCommandAction, root?: ParentNode) {
  const targetRoot = root ?? (typeof document === "undefined" ? null : document);
  if (!targetRoot) {
    return false;
  }

  if (action === "filter") {
    return performFilterAction(targetRoot);
  }

  const button =
    findButtonByLabel(targetRoot, actionButtonLabels[action]) ??
    (action === "add" ? findEmptyStateAddButton(targetRoot) : null);

  if (!button) {
    return false;
  }

  button.click();
  return true;
}

export function clearKeywordCommandActionParam() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (!parseKeywordCommandAction(url.searchParams.get(ACTION_PARAM))) {
    return;
  }

  url.searchParams.delete(ACTION_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function KeywordCommandActionBridge({ projectRef }: Readonly<{ projectRef: string }>) {
  const pathname = usePathname();
  const keywordsPath = appPath(projectRef, "rank-tracker");
  const handledKeyRef = useRef<string | null>(null);
  const attachBridge: RefCallback<HTMLSpanElement> = (node) => {
    if (!node || pathname !== keywordsPath || typeof window === "undefined") {
      return;
    }

    const action = consumePendingKeywordCommandAction() ?? actionFromLocation();
    if (!action) {
      return;
    }

    const key = `${pathname}:${action}:${window.location.search}`;
    if (handledKeyRef.current === key) {
      return;
    }

    handledKeyRef.current = key;
    runKeywordActionWithRetry(action);
  };

  return (
    <span
      aria-hidden
      data-keyword-command-action-bridge=""
      hidden
      key={pathname}
      ref={attachBridge}
    />
  );
}

function actionFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return parseKeywordCommandAction(params.get(ACTION_PARAM));
}

function runKeywordActionWithRetry(action: KeywordCommandAction) {
  let attempts = 0;
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => window.setTimeout(callback, 16);

  const tryRun = () => {
    attempts += 1;
    if (performKeywordCommandAction(action)) {
      clearKeywordCommandActionParam();
      return;
    }
    if (attempts < RETRY_LIMIT) {
      schedule(tryRun);
      return;
    }

    clearKeywordCommandActionParam();
  };

  schedule(tryRun);
}

function performFilterAction(root: ParentNode) {
  const input = root.querySelector<HTMLInputElement>(
    "#keywords-filter, input[aria-label='Filter keywords']",
  );
  const button = findButtonByLabel(root, ["filters"]);
  input?.focus();
  button?.click();
  return Boolean(input || button);
}

function findButtonByLabel(root: ParentNode, labels: readonly string[]) {
  const normalizedLabels = new Set(labels.map(normalizeText));
  return buttons(root).find((button) => normalizedLabels.has(normalizeText(button.textContent)));
}

function findEmptyStateAddButton(root: ParentNode) {
  return buttons(root).find((button) => {
    const form = button.closest("form");
    return (
      normalizeText(button.textContent) === "add" &&
      Boolean(form?.querySelector("input[aria-label='Keyword']"))
    );
  });
}

function buttons(root: ParentNode) {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => !button.disabled,
  );
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
