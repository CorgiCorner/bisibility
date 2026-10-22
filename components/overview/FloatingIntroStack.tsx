"use client";

import { useOptionalSidebarCollapsed } from "@/components/shell/SidebarCollapsedState";
import { type ReactNode, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import styles from "./FloatingIntroStack.module.css";

export type FloatingIntroCard = Readonly<{ id: string; content: ReactNode }>;

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** The first card owns interaction; later cards have decorative backs only. */
export function FloatingIntroStack({ cards }: Readonly<{ cards: readonly FloatingIntroCard[] }>) {
  const client = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const sidebar = useOptionalSidebarCollapsed();
  const active = cards[0];
  if (!client || !active) return null;
  const backCount = Math.min(cards.length - 1, 2);
  return createPortal(
    <div
      className={styles.stack}
      data-floating-intro-stack=""
      data-active-intro-id={active.id}
      data-sidebar={sidebar ? (sidebar.collapsed ? "collapsed" : "expanded") : "none"}
      key={active.id}
    >
      {Array.from({ length: backCount }, (_, index) => backCount - index).map((depth) => (
        <div aria-hidden="true" className={styles.back} data-depth={depth} key={cards[depth].id} />
      ))}
      <div className={styles.active}>{active.content}</div>
    </div>,
    document.body,
  );
}
