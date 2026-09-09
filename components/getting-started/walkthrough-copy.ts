import type { SetupStepId, SetupStepState } from "@/lib/getting-started/setup-steps";

type WalkthroughCopy = { body: string; heading: string };
type WalkthroughStepId = Exclude<SetupStepId, "confirm_competitors">;

const activeCopy: Record<WalkthroughStepId, WalkthroughCopy> = {
  create_project: {
    body: "Name the project you want to track. You can update its details later in Project settings.",
    heading: "Create a project for your search tracking",
  },
  add_keywords: {
    body: "Type or paste your keywords, one per line. We dedupe against what you already track.",
    heading: "Choose the keywords to track",
  },
  connect_source: {
    body: "Search Console is free and takes two clicks. A SERP provider adds live position checks with your own key.",
    heading: "Connect the source for rank data",
  },
  first_check: {
    body: "Run the first check to collect positions for the tracked keywords. Check settings live in the project's tracking settings.",
    heading: "Collect the first keyword positions",
  },
};

const doneCopy: Record<WalkthroughStepId, WalkthroughCopy> = {
  create_project: {
    body: "This happened when you created the project: one domain, with every check and import scoped to it. The name and domain live in Project settings.",
    heading: "Your project was created",
  },
  add_keywords: {
    body: "This happened when you added your first keywords. Each keyword carries its own market and device - edit them on the keyword's row in Rank Tracker.",
    heading: "Your first keywords were added",
  },
  connect_source: {
    body: "This happened when you connected a data source. Rank checks run through it, and the provider bills you directly. Manage or swap it in Integrations.",
    heading: "A data source was connected",
  },
  first_check: {
    body: "This happened when your first check completed: every keyword it covered now has a position and a ranking URL, and history builds from here. Checks follow the project's default schedule - any keyword can override it with its own. Both live in Rank Tracker.",
    heading: "Your first rank check completed",
  },
};

export function walkthroughCopy(id: WalkthroughStepId, state: SetupStepState): WalkthroughCopy {
  return state.family === "done" ? doneCopy[id] : activeCopy[id];
}
