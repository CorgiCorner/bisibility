import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { ScanIcon } from "@phosphor-icons/react/dist/ssr/Scan";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { TargetIcon } from "@phosphor-icons/react/dist/ssr/Target";
import type { NavEntry } from "./nav-items";

export const researchModuleNavEntries = [
  {
    group: "modules",
    label: "AI Visibility",
    scope: "own-axis",
    segment: "ai-visibility",
    icon: SparkleIcon,
  },
  {
    group: "modules",
    label: "Prompt Explorer",
    scope: "own-axis",
    segment: "prompt-explorer",
    icon: ChatCircleTextIcon,
  },
  {
    group: "modules",
    label: "AI Tracking",
    scope: "own-axis",
    segment: "ai-tracking",
    icon: SparkleIcon,
  },
  {
    group: "modules",
    label: "Site Audit",
    scope: "own-axis",
    segment: "site-audit",
    icon: ScanIcon,
  },
] as const satisfies readonly NavEntry[];

export const researchProjectNavEntries = [
  {
    group: "project",
    label: "Project Context",
    scope: "project",
    segment: "context",
    icon: TargetIcon,
  },
  {
    group: "project",
    label: "Agent Reports",
    scope: "project",
    segment: "agent-reports",
    icon: FileTextIcon,
  },
] as const satisfies readonly NavEntry[];
