import type { Prisma, SignalSeverity, SignalSource } from "@/lib/generated/prisma/client";

export const SIGNAL_TYPES = {
  rankingChanged: "ranking.changed",
  rankingUrlChanged: "ranking_url.changed",
  note: "note",
  deployCompleted: "deploy.completed",
  sitemapChanged: "sitemap.changed",
  pageChanged: "page.changed",
  urlIndexed: "url.indexed",
  urlDeindexed: "url.deindexed",
  searchEngineUpdate: "search_engine.update",
} as const;

export type SignalType = (typeof SIGNAL_TYPES)[keyof typeof SIGNAL_TYPES];

export type SignalInput = {
  createdById?: string | null;
  happenedAt?: Date;
  keywordId?: string | null;
  payload?: Prisma.InputJsonValue | null;
  projectId: string;
  severity?: SignalSeverity;
  source: SignalSource;
  type: SignalType | (string & {});
  url?: string | null;
};

export type RankingChangedPayload = {
  after: number | null;
  before: number | null;
  delta: number | null;
};

export type RankingUrlChangedPayload = {
  after: string | null;
  before: string | null;
  matchesTargetUrl: boolean | null;
};

export type NotePayload = {
  note: string;
};
