/** Storybook previews never persist experimental-module changes. */
export async function setExperimentalModules() {
  return { enabledExperimentalModules: [] as string[] };
}
