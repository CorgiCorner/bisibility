import messagesEn from "@/messages/core/en/project-ai-tracking.json";
import messagesEs from "@/messages/core/es-ES/project-ai-tracking.json";
import messagesJa from "@/messages/core/ja/project-ai-tracking.json";
import messagesPl from "@/messages/core/pl/project-ai-tracking.json";
import { createTranslator } from "use-intl/core";
import { expect, it } from "vitest";

const catalogs = [
  { locale: "en", messages: messagesEn },
  { locale: "es-ES", messages: messagesEs },
  { locale: "ja", messages: messagesJa },
  { locale: "pl", messages: messagesPl },
] as const;

function insight(
  locale: (typeof catalogs)[number]["locale"],
  messages: (typeof catalogs)[number]["messages"],
) {
  return createTranslator({
    locale,
    messages: messages.projectAiTracking.overview,
  });
}

it("agrees the insight verb with one engine and with several", () => {
  const values = { answers: 2, domains: "example.com", engines: "Gemini" };
  expect(insight("en", messagesEn)("insightBuilt", { ...values, engineCount: 1 })).toBe(
    "Gemini cites example.com in 2 unbranded answers that do not name you.",
  );
  expect(insight("en", messagesEn)("insightBuilt", { ...values, engineCount: 2 })).toBe(
    "Gemini cite example.com in 2 unbranded answers that do not name you.",
  );
  expect(insight("es-ES", messagesEs)("insightBuilt", { ...values, engineCount: 1 })).toBe(
    "Gemini cita example.com en 2 respuestas sin marca que no te nombran.",
  );
  expect(insight("es-ES", messagesEs)("insightBuilt", { ...values, engineCount: 3 })).toBe(
    "Gemini citan example.com en 2 respuestas sin marca que no te nombran.",
  );
  expect(insight("pl", messagesPl)("insightBuilt", { ...values, engineCount: 1 })).toBe(
    "Gemini cytuje example.com w 2 odpowiedziach bez marki, które Cię nie wymieniają.",
  );
  expect(insight("pl", messagesPl)("insightBuilt", { ...values, engineCount: 3 })).toBe(
    "Gemini cytują example.com w 2 odpowiedziach bez marki, które Cię nie wymieniają.",
  );
  expect(insight("pl", messagesPl)("insightBuilt", { ...values, engineCount: 5 })).toBe(
    "Gemini cytuje example.com w 2 odpowiedziach bez marki, które Cię nie wymieniają.",
  );
  const japanese =
    "Geminiは、あなたを名指ししない2件のブランド名のない回答でexample.comを引用しています。";
  expect(insight("ja", messagesJa)("insightBuilt", { ...values, engineCount: 1 })).toBe(japanese);
  expect(insight("ja", messagesJa)("insightBuilt", { ...values, engineCount: 3 })).toBe(japanese);
});
