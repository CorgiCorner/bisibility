"use client";

import type { ResearchQuestion } from "@/lib/ai-research/research-questions";
import type { AnswerHighlightEntity } from "@/lib/ai-tracking/answer-highlight";
import { AiVisibilityAnswerText } from "./AiVisibilityAnswerText";
import { PromptResearchSources } from "./PromptResearchSources";

export function ResearchAnswerPanel({
  entities,
  question,
}: Readonly<{ entities: readonly AnswerHighlightEntity[]; question: ResearchQuestion }>) {
  return (
    <div className="grid min-w-0 gap-3 py-2 pl-11" id={`research-answer-${question.rowIndex}`}>
      {question.answer ? (
        <AiVisibilityAnswerText entities={[...entities]} text={question.answer} />
      ) : null}
      <PromptResearchSources prompt={question.prompt} />
    </div>
  );
}
