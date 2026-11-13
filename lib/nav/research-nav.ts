import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { ScanIcon } from "@phosphor-icons/react/dist/ssr/Scan";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import type { NavEntry } from "./nav-items";

export const aiVisibilityNavEntry = {
  badge: "new",
  group: "ai",
  keywords: [
    "geo",
    "aeo",
    "llm",
    "llmo",
    "chatgpt",
    "ai search",
    "prompt tracker",
    "prompt research",
    "brand visibility",
  ],
  label: "AI Visibility",
  scope: "own-axis",
  segment: "ai-visibility",
  icon: SparkleIcon,
} as const satisfies NavEntry;

export const aiSearchNavEntries = [
  {
    badge: "new",
    group: "ai",
    keywords: ["prompt playground", "compare models", "llm"],
    label: "Model Playground",
    scope: "own-axis",
    segment: "model-playground",
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
  label: "Reports",
  scope: "project",
  segment: "agent-reports",
  icon: FileTextIcon,
} as const satisfies NavEntry;
