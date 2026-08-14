type AccumulateMetadata =
  typeof import("next/dist/lib/metadata/resolve-metadata").accumulateMetadata;

let resolverPromise: Promise<AccumulateMetadata> | undefined;

async function loadResolver() {
  const module = (await import(
    // @ts-expect-error Next publishes declarations for the matching CJS module only.
    "next/dist/esm/lib/metadata/resolve-metadata.js"
  )) as typeof import("next/dist/lib/metadata/resolve-metadata");
  return module.accumulateMetadata;
}

export async function resolveNextMetadata(...args: Parameters<AccumulateMetadata>) {
  resolverPromise ??= loadResolver();
  const resolver = await resolverPromise;
  return resolver(...args);
}
