/** Storybook forms never persist subscriptions or send email. */
export async function requestRoadmapNotification() {
  return { ok: true } as const;
}

export async function submitRoadmapFeedback() {
  return { ok: true } as const;
}
