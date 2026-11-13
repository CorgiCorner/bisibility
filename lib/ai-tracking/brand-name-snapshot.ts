export type TrackingSnapshotProject = {
  brandAliases?: readonly string[] | null;
  brandExcludedNames?: readonly string[] | null;
  domain: string | null;
  id: string;
  name: string;
  publicId: string;
};

export type TrackingSnapshotCompetitor = {
  aliases: readonly string[];
  domain: string;
  excludedNames?: readonly string[] | null;
  id: string;
  label: string | null;
  publicId: string;
};

export function trackingRunSnapshot(
  project: TrackingSnapshotProject,
  competitors: readonly TrackingSnapshotCompetitor[],
) {
  return [
    {
      aliases: [...(project.brandAliases ?? [])],
      domain: project.domain,
      excludedNames: [...(project.brandExcludedNames ?? [])],
      id: project.id,
      kind: "project" as const,
      label: project.name,
      publicId: project.publicId,
    },
    ...competitors.map((competitor) => ({
      aliases: [...competitor.aliases],
      domain: competitor.domain,
      excludedNames: [...(competitor.excludedNames ?? [])],
      id: competitor.id,
      kind: "competitor" as const,
      label: competitor.label,
      publicId: competitor.publicId,
    })),
  ];
}
