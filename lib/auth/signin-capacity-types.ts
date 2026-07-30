export const EMAIL_CAPACITY_EXHAUSTED = "capacity_exhausted";
export const GOOGLE_CAPACITY_EXHAUSTED = "google_signup_capacity_exhausted";

export type CapacityMeter = {
  cap: number;
  left: number;
};

export type EmailCapacityConstraint = "daily" | "monthly";

export type EmailCapacityMeter = CapacityMeter & {
  binding: EmailCapacityConstraint;
};

export type SignInCapacity = {
  emailCodes: EmailCapacityMeter | null;
  googleSpots: CapacityMeter;
  signupsToday: number;
};

export type SignInCapacityMiss = "email" | "google" | null;
