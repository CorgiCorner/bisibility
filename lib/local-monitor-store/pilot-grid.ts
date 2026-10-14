/** Larger grids require a separate product/budget pilot decision. Retained geometry stays readable. */
export const MONITOR_PILOT_GRID_SIZES = [1, 3, 5] as const;
export function monitorPilotGridSupported(size: number) {
  return MONITOR_PILOT_GRID_SIZES.some((supported) => supported === size);
}
