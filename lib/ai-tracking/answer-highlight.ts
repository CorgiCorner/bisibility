import {
  type BrandNameSet,
  matchBrandNamesInAnswer,
  normalizeBrandMatchText,
} from "@/lib/ai-tracking/brand-name-match";

export type AnswerHighlightSegment = {
  kind: "competitor" | "own" | "text";
  text: string;
};

export type AnswerHighlightBrand = {
  id: string;
  kind: "competitor" | "project";
  label: string;
};

export type AnswerHighlightEntity = {
  id: string;
  kind: "competitor" | "project";
  label: string;
  names: BrandNameSet;
};

export type AnswerHighlight = {
  brands: readonly AnswerHighlightBrand[];
  segments: readonly AnswerHighlightSegment[];
};

type Span = {
  end: number;
  id: string;
  index: number;
  kind: "competitor" | "own";
  label: string;
  length: number;
};

/**
 * Splits an answer into plain text and brand spans. Spans come from the brand-name
 * matcher, so exclusions already apply. A longer span wins an overlap; equal spans
 * prefer the own brand. The returned text keeps the original answer when normalization
 * does not change indexes.
 */
export function highlightAnswerBrands(
  answer: string,
  entities: readonly AnswerHighlightEntity[],
): AnswerHighlight {
  const spans = resolveOverlaps(collectSpans(answer, entities));
  const mapped = mapSpans(answer, spans);
  const brands = brandsInOrder(mapped.spans);
  return { brands, segments: segmentsFrom(mapped.text, mapped.spans) };
}

function collectSpans(answer: string, entities: readonly AnswerHighlightEntity[]): Span[] {
  return entities.flatMap((entity) => {
    const kind = entity.kind === "project" ? "own" : "competitor";
    return matchBrandNamesInAnswer(answer, entity.names).matches.map((match) => ({
      end: match.index + match.length,
      id: entity.id,
      index: match.index,
      kind,
      label: entity.label,
      length: match.length,
    }));
  });
}

function resolveOverlaps(spans: readonly Span[]): Span[] {
  const ranked = [...spans].sort((left, right) => {
    const length = right.length - left.length;
    if (length) return length;
    if (left.kind !== right.kind) return left.kind === "own" ? -1 : 1;
    return left.index - right.index || left.id.localeCompare(right.id);
  });
  const chosen: Span[] = [];
  for (const span of ranked) {
    const overlaps = chosen.some(
      (other) => span.index < other.end && other.index < span.index + span.length,
    );
    if (!overlaps) chosen.push(span);
  }
  return chosen.sort((left, right) => left.index - right.index || left.id.localeCompare(right.id));
}

function mapSpans(answer: string, spans: readonly Span[]) {
  const starts = normalizationStarts(answer);
  if (!starts) {
    const normalized = normalizeBrandMatchText(answer);
    return {
      spans: spans.map((span) => ({ ...span, end: span.index + span.length })),
      text: normalized,
    };
  }
  return {
    spans: spans.flatMap((span) => {
      const start = starts[span.index];
      const end = span.index + span.length;
      const stop = end === starts.length ? answer.length : starts[end];
      if (start === undefined || stop === undefined || stop < start) return [];
      return [{ ...span, end: stop, index: start }];
    }),
    text: answer,
  };
}

function normalizationStarts(answer: string): number[] | null {
  const starts: number[] = [];
  let built = "";
  for (let index = 0; index < answer.length; ) {
    const point = answer.codePointAt(index);
    if (point === undefined) return null;
    const chars = String.fromCodePoint(point);
    const piece = normalizeBrandMatchText(chars);
    for (let offset = 0; offset < piece.length; offset += 1) starts.push(index);
    built += piece;
    index += chars.length;
  }
  return built === normalizeBrandMatchText(answer) ? starts : null;
}

function brandsInOrder(spans: readonly Span[]): AnswerHighlightBrand[] {
  const brands: AnswerHighlightBrand[] = [];
  for (const span of spans) {
    if (brands.some((brand) => brand.id === span.id)) continue;
    brands.push({
      id: span.id,
      kind: span.kind === "own" ? "project" : "competitor",
      label: span.label,
    });
  }
  return brands;
}

function segmentsFrom(text: string, spans: readonly Span[]): AnswerHighlightSegment[] {
  const segments: AnswerHighlightSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, span.index) });
    }
    segments.push({ kind: span.kind, text: text.slice(span.index, span.end) });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments.filter((segment) => segment.text.length > 0);
}
