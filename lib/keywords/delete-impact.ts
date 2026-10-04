export type KeywordDeleteImpact = {
  keywordCount: number;
  targetCount: number;
  runningTargetCount: number;
  schedules: { publicId: string; name: string; removedTargets: number; remainingTargets: number }[];
};
