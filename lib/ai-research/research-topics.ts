/**
 * Topic rule `significant-word-v1`: a topic is a word of at least four letters that is not a
 * common question word and that appears in at least two questions. Each question joins the
 * most frequent such word it contains. Equal frequencies break alphabetically.
 */
export const RESEARCH_TOPIC_RULE = "significant-word-v1";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "best",
  "can",
  "does",
  "for",
  "from",
  "how",
  "into",
  "is",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

export type ResearchTopic = {
  id: string;
  label: string;
  questionIds: readonly string[];
};

export function researchTopicWords(value: string) {
  return [
    ...new Set(
      value
        .normalize("NFKC")
        .toLocaleLowerCase("en")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/u)
        .filter((word) => word.length >= 4 && !STOP_WORDS.has(word)),
    ),
  ];
}

export function researchTopics(
  questions: readonly { id: string; text: string }[],
): ResearchTopic[] {
  const tokenized = questions.map((question) => ({
    id: question.id,
    words: researchTopicWords(question.text),
  }));
  const counts = new Map<string, number>();
  for (const question of tokenized) {
    for (const word of question.words) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const eligible = new Set(
    [...counts.entries()].filter(([, count]) => count >= 2).map(([word]) => word),
  );
  const assigned = new Map<string, string[]>();
  for (const question of tokenized) {
    const word = question.words
      .filter((candidate) => eligible.has(candidate))
      .sort(
        (left, right) =>
          (counts.get(right) ?? 0) - (counts.get(left) ?? 0) || left.localeCompare(right),
      )[0];
    if (!word) continue;
    assigned.set(word, [...(assigned.get(word) ?? []), question.id]);
  }
  return [...assigned.entries()]
    .map(([word, questionIds]) => ({
      id: word,
      label: word.charAt(0).toLocaleUpperCase("en") + word.slice(1),
      questionIds,
    }))
    .sort(
      (left, right) =>
        right.questionIds.length - left.questionIds.length || left.label.localeCompare(right.label),
    );
}
