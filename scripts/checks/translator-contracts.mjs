/** Callable host contracts qualify only while their real constructor proves translated returns. */
export const coreTranslatorContracts = [
  {
    module: "@/lib/measurement-settings/ui-contracts",
    type: "MeasurementTranslator",
    producerModule: "@/components/measurement-settings/translate",
    producer: "createMeasurementTranslator",
  },
  {
    module: "@/lib/dashboard-layout/types",
    type: "DashboardTranslator",
    producerModule: "@/components/dashboard-layout/dashboard-translator",
    producer: "dashboardTranslator",
  },
  {
    module: "@/lib/measurement-help/types",
    type: "HelpTranslator",
    producerModule: "@/components/measurement-help/translate",
    producer: "createHelpTranslator",
  },
];

export function provesContractAlias(declaration, context, analyze) {
  if (!context?.resolveModule) return false;
  return (context.translatorContracts ?? []).some((contract) => {
    const source = context.resolveModule(contract.module, context.fileName);
    if (!source || source.fileName !== context.fileName || contract.type !== declaration.name.text)
      return false;
    return !!analyze(contract.producerModule)?.exportedTranslatorFactory(contract.producer);
  });
}
