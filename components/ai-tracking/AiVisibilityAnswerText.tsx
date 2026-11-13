"use client";

import {
  type AnswerHighlightEntity,
  highlightAnswerBrands,
} from "@/lib/ai-tracking/answer-highlight";

export function AiVisibilityAnswerText({
  entities,
  text,
}: Readonly<{ entities: readonly AnswerHighlightEntity[]; text: string }>) {
  const highlight = highlightAnswerBrands(text, entities);
  return (
    <p className="m-0 whitespace-pre-wrap text-sm leading-6">
      {highlight.segments.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={`${segment.kind}-${index}`}>{segment.text}</span>
        ) : (
          <mark
            className={
              segment.kind === "own"
                ? "rounded-sm bg-blue/15 text-blue-text"
                : "rounded-sm bg-yellow/15 text-yellow-text"
            }
            key={`${segment.kind}-${index}`}
          >
            {segment.text}
          </mark>
        ),
      )}
    </p>
  );
}
