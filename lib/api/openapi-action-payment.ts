import {
  actionPaymentOptionSchema,
  actionPaymentQuoteSchema,
  actionPaymentReceiptSchema,
} from "@/lib/action-payment/schema";
import { z } from "zod";
import { openEnum, sdkName, taggedUnion } from "./openapi-sdk-schema";

const snake = (value: string) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const pascal = (value: string) =>
  value.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_match, _separator, letter: string) =>
    letter.toUpperCase(),
  );
function wireSchema(input: Record<string, unknown>, name: string): Record<string, unknown> {
  const { properties, required, items, oneOf, $schema: _dialect, ...rest } = input;
  const result = { ...rest };
  if (properties && typeof properties === "object") {
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([key, child]) => [
        snake(key),
        wireSchema(child, name + pascal(key)),
      ]),
    );
    if (Array.isArray(required)) result.required = required.map(snake);
    Object.assign(result, sdkName(name));
  }
  if (items && typeof items === "object")
    result.items = wireSchema(items as Record<string, unknown>, name + "Item");
  if (Array.isArray(rest.enum)) Object.assign(result, openEnum(name));
  if (Array.isArray(oneOf)) {
    const cases = oneOf.map((branch) =>
      String(branch.properties?.kind?.const).replace(/_([a-z])/g, (_match, letter: string) =>
        letter.toUpperCase(),
      ),
    );
    result.oneOf = oneOf.map((branch, index) => wireSchema(branch, name + pascal(cases[index])));
    Object.assign(result, sdkName(name), taggedUnion("kind", cases));
  }
  return result;
}
export const paymentQuoteWireSchema = wireSchema(
  z.toJSONSchema(actionPaymentQuoteSchema, { io: "input" }),
  "ActionPaymentQuote",
);
export const paymentReceiptWireSchema = wireSchema(
  z.toJSONSchema(actionPaymentReceiptSchema, { io: "input" }),
  "ActionPaymentReceipt",
);
export const paymentOptionWireSchema = wireSchema(
  z.toJSONSchema(actionPaymentOptionSchema, { io: "input" }),
  "ActionPaymentOption",
);
function projection(schema: Record<string, unknown>, kind: string) {
  return {
    ...schema,
    ...sdkName(`ActionPayment${pascal(kind)}Projection`),
    properties: { ...(schema.properties as object), kind: { const: kind, type: "string" } },
    required: [...(schema.required as string[]), "kind"],
  };
}
export const paymentResponseFields = {
  payment: {
    description:
      "Server-selected quote for an estimate or retained actual receipt after execution. cost_cents remains upstream USD cents.",
    oneOf: [
      projection(paymentQuoteWireSchema, "quote"),
      projection(paymentReceiptWireSchema, "receipt"),
    ],
    ...sdkName("ActionPaymentProjection"),
    ...taggedUnion("kind", ["quote", "receipt"]),
  },
  payment_options: {
    type: "array",
    items: paymentOptionWireSchema,
    description: "Configured routes compatible with this action, never budget projections.",
  },
};
export const paymentRequestFields = {
  require_payment: {
    type: "boolean",
    description:
      "Require accepted payment consent before any fresh paid request; cached reads remain free.",
  },
  payment_option_id: {
    type: "string",
    minLength: 1,
    maxLength: 120,
    description:
      "Opaque option ID returned by an estimate. Must match connection_id when both are supplied.",
  },
  accepted_payment: {
    type: "object",
    additionalProperties: false,
    required: ["quote_token"],
    properties: { quote_token: { type: "string", minLength: 1, maxLength: 12000 } },
    ...sdkName("AcceptedActionPayment"),
    description:
      "Accepted server quote. Changed/expired payer, request or cached-free state requires a new quote; accepted replay never creates a second paid operation.",
  },
};
