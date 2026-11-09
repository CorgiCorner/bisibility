import { expect, it } from "vitest";
import { dispatchDomainVerification, domainVerificationTools } from "./domain-verification-tools";

it("routes each tool to the corresponding project API operation", () => {
  const project_id = "prj_abcdefghijklmnopqrstuvwx";
  expect(domainVerificationTools.map((tool) => tool.name)).toEqual([
    "get_domain_verification",
    "issue_domain_verification",
    "check_domain_verification",
  ]);
  expect(dispatchDomainVerification("getDomainVerification", { project_id })).toMatchObject({
    method: "GET",
    path: `/projects/${project_id}/domain-verification`,
    projectId: project_id,
  });
  expect(
    dispatchDomainVerification("issueDomainVerification", { project_id, method: "dns_txt" }),
  ).toMatchObject({
    method: "POST",
    path: `/projects/${project_id}/domain-verification`,
    body: { method: "dns_txt" },
  });
  expect(dispatchDomainVerification("checkDomainVerification", { project_id })).toMatchObject({
    method: "POST",
    path: `/projects/${project_id}/domain-verification/check`,
  });
});
