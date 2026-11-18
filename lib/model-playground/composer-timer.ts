/** Browser timers overflow beyond a signed 32-bit delay. Recheck the clock at each wake-up. */
export function scheduleComposerExpiry(deadline: number, expired: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) expired();
    else if (Number.isFinite(remaining)) timer = setTimeout(arm, Math.min(remaining, 2 ** 31 - 1));
  };
  arm();
  return () => clearTimeout(timer);
}
