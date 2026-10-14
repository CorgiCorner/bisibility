type StagedMigrationPipeline = {
  activeIds: readonly string[];
  completed: () => Promise<ReadonlySet<string>>;
  prisma: (completed: ReadonlySet<string>) => Promise<void>;
  runData: () => Promise<void>;
  contracts: () => Promise<void>;
};

/** Advance only after real data completion unlocks the next guarded DDL prefix. */
export async function runStagedMigrationPipeline(pipeline: StagedMigrationPipeline) {
  let completed = await pipeline.completed();
  for (let stage = 0; stage <= pipeline.activeIds.length; stage += 1) {
    await pipeline.prisma(completed);
    await pipeline.runData();
    const next = await pipeline.completed();
    if (pipeline.activeIds.every((id) => next.has(id))) {
      await pipeline.contracts();
      return;
    }
    if (!pipeline.activeIds.some((id) => next.has(id) && !completed.has(id))) {
      throw new Error("Data migration prerequisites could not advance the guarded schema.");
    }
    completed = next;
  }
  throw new Error("Data migration stages exceeded the active manifest boundary.");
}
