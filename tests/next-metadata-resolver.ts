type AccumulateMetadata =
  typeof import("next/dist/lib/metadata/resolve-metadata").accumulateMetadata;

type ResolverModule = {
  accumulateMetadata: AccumulateMetadata;
};

const resolverModulePaths = [
  "next/dist/esm/lib/metadata/resolve-metadata",
  "next/dist/lib/metadata/resolve-metadata",
] as const;

let resolverPromise: Promise<AccumulateMetadata> | undefined;

async function loadResolver() {
  for (const modulePath of resolverModulePaths) {
    try {
      const module = (await import(/* @vite-ignore */ modulePath)) as ResolverModule;
      if (typeof module.accumulateMetadata === "function") {
        return module.accumulateMetadata;
      }
    } catch {
      // Try the next known Next.js module format.
    }
  }

  throw new Error("Unable to load the Next.js metadata resolver.");
}

export async function resolveNextMetadata(...args: Parameters<AccumulateMetadata>) {
  resolverPromise ??= loadResolver();
  const resolver = await resolverPromise;
  return resolver(...args);
}
