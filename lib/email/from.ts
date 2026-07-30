// Environment reads stay literal so the environment-wiring test can assert them.
function configuredValue(value: string | undefined) {
  return value?.trim() || null;
}

export function configuredEmailFrom() {
  return configuredValue(process.env.EMAIL_FROM);
}

export function requireEmailFrom() {
  const from = configuredEmailFrom();
  if (!from) {
    throw new Error("EMAIL_FROM is required to send email.");
  }

  return from;
}

export function configuredAlertsEmailFrom() {
  return configuredValue(process.env.EMAIL_ALERTS_FROM);
}

export function alertsEmailFrom() {
  return configuredAlertsEmailFrom() ?? requireEmailFrom();
}
