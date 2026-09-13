export type SupportWidgetSession = Readonly<{
  expiresAt: Date;
  userId: string;
}>;

export type SupportWidgetPayload = Readonly<{
  apiBase: string;
  appId: string;
  createdAt: number;
  email: string;
  expiresAt: number;
  name: string;
  token: string;
  userId: string;
}>;
