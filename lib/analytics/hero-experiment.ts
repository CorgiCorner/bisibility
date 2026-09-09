export const HERO_EXPERIMENT_FLAG = "landing-hero-actions";
export const HERO_EXPERIMENT_PROPERTY = "$feature/landing-hero-actions";
export type HeroExperimentVariant = "control" | "dual_cta";

type HeroExperimentState = Readonly<{
  analyticsAllowed: boolean;
  variant: HeroExperimentVariant | null;
}>;

const initialState: HeroExperimentState = { analyticsAllowed: false, variant: null };
let state = initialState;
const listeners = new Set<() => void>();

export function getHeroExperimentState() {
  return state;
}

export function getServerHeroExperimentState() {
  return initialState;
}

export function subscribeHeroExperiment(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function syncHeroExperiment(analyticsAllowed: boolean, flag: unknown) {
  const variant = analyticsAllowed && (flag === "control" || flag === "dual_cta") ? flag : null;
  if (state.analyticsAllowed === analyticsAllowed && state.variant === variant) return;
  state = { analyticsAllowed, variant };
  for (const listener of listeners) listener();
}
