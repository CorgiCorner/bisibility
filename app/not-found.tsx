import {
  SystemPage,
  SystemPrimaryAction,
  SystemSecondaryAction,
  TerminalBlock,
} from "@/components/marketing/system/SystemPage";
import { deploymentMode } from "@/lib/deployment/deployment";
import { appRootPath } from "@/lib/routing/app-path";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: null },
  robots: { follow: false, index: false },
  title: "Page not found",
};

// Rendered per-request so the secondary action reflects the runtime deployment mode:
// the self-host build has no homepage - its root only redirects to the sign-in page.
export const dynamic = "force-dynamic";

export default function NotFound() {
  const selfHost = deploymentMode() !== "cloud";
  return (
    <SystemPage
      actions={
        <>
          <SystemPrimaryAction
            href={appRootPath()}
            startIcon={<SquaresFour size={16} weight="bold" />}
          >
            Back to dashboard
          </SystemPrimaryAction>
          <SystemSecondaryAction href={selfHost ? "/login" : "/"}>
            {selfHost ? "Go to sign in" : "Go to homepage"}
          </SystemSecondaryAction>
        </>
      }
      description="We tracked every URL we could find and this one didn't rank. It may have moved, or never existed."
      kicker="404 - NOT FOUND"
      statusLabel="HTTP 404"
      terminal={
        <TerminalBlock
          note="try one of these instead"
          path="/this-page"
          routes={selfHost ? [appRootPath(), "/login"] : ["/dashboard", "/docs", "/"]}
          status="404"
        />
      }
      title="This page isn't in the index"
    />
  );
}
