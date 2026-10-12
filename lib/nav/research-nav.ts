import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { ScanIcon } from "@phosphor-icons/react/dist/ssr/Scan";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import type { NavEntry } from "./nav-items";

export const aiTrackingNavEntry = {
  group: "tracking",
  label: "AI Tracking",
  scope: "own-axis",
  segment: "ai-tracking",
  icon: SparkleIcon,
} as const satisfies NavEntry;

export const researchModuleNavEntries = [
  {
    group: "research",
    label: "AI Visibility",
    scope: "own-axis",
    segment: "ai-visibility",
    icon: SparkleIcon,
  },
  {
    group: "research",
    label: "Prompt Explorer",
    scope: "own-axis",
    segment: "prompt-explorer",
    icon: ChatCircleTextIcon,
  },
  {
    group: "research",
    label: "Site Audit",
    scope: "own-axis",
    segment: "site-audit",
    icon: ScanIcon,
  },
] as const satisfies readonly NavEntry[];

export const agentReportsNavEntry = {
  group: "reports",
  label: "Agent Reports",
  scope: "project",
  segment: "agent-reports",
  icon: FileTextIcon,
} as const satisfies NavEntry;
