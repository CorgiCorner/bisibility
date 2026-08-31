import type { ComponentPropsWithoutRef } from "react";

type ThemeRootProps = ComponentPropsWithoutRef<"div">;

/**
 * The shell element the theme scripts paint alongside `<html>` and `<body>`.
 *
 * The root layout's `theme-init` script runs from the App Router `beforeInteractive` queue,
 * which the Next runtime flushes right before hydration - after the body has been parsed - so
 * this element already carries the resolved `data-theme` when React compares the DOM with the
 * rendered props. That attribute belongs to the script and `applyTheme`, never to React, so
 * hydration skips it here exactly as the root layout does for `<html>` and `<body>`.
 */
export function ThemeRoot(props: Readonly<ThemeRootProps>) {
  return <div {...props} data-app-theme-root suppressHydrationWarning />;
}
