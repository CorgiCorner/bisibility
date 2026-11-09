export type ResultReceipt = {
  userId: string;
  surface: "app" | "api" | "mcp" | "email" | "alert";
  nonEmpty: boolean;
  at?: Date;
};
