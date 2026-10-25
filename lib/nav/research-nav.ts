import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { EyeIcon } from "@phosphor-icons/react/dist/ssr/Eye";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { ScanIcon } from "@phosphor-icons/react/dist/ssr/Scan";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import type { NavEntry } from "./nav-items";

export const promptResearchNavEntry = {
  group: "ai",
  label: "Prompt Research",
  scope: "own-axis",
  segment: "prompt-research",
  icon: MagnifyingGlassIcon,
} as const satisfies NavEntry;

export const aiTrackingNavEntry = {
  group: "ai",
  label: "Prompt Tracker",
  scope: "own-axis",
  segment: "prompt-tracker",
  icon: SparkleIcon,
} as const satisfies NavEntry;

export const aiSearchNavEntries = [
  {
    group: "ai",
    label: "Brand Visibility",
    scope: "own-axis",
    segment: "brand-visibility",
    icon: EyeIcon,
  },
  {
    group: "ai",
    label: "Prompt Playground",
    scope: "own-axis",
    segment: "prompt-playground",
    icon: ChatCircleTextIcon,
  },
] as const satisfies readonly NavEntry[];

export const researchModuleNavEntries = [
  {
    group: "seo",
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
