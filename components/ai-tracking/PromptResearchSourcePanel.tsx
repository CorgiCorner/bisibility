"use client";
import type { ResearchedPrompt } from "@/lib/ai-research/prompt-research-projection";
import { PromptResearchSources } from "./PromptResearchSources";

/** Starts at the prompt text edge: section and prompt cells share their padding, so the
 * offset is exactly the 44px DataTable selection column. Measuring at mount raced layout. */
export function PromptResearchSourcePanel({ prompt }: Readonly<{ prompt: ResearchedPrompt }>) {
  return (
    <div
      id={`research-sources-${prompt.rowIndex}`}
      className="w-full min-w-0 py-1 pl-11 font-normal"
    >
      <PromptResearchSources prompt={prompt} />
    </div>
  );
}
