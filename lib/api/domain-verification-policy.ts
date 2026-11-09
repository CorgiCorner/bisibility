import { manageProject } from "./operation-capabilities";
import { policy } from "./operation-policy-helpers";
export const domainVerificationPolicies = {
  getDomainVerification: policy(
    "GET",
    "/projects/{project_id}/domain-verification",
    "admin",
    "read",
    manageProject,
  ),
  issueDomainVerification: policy(
    "POST",
    "/projects/{project_id}/domain-verification",
    "admin",
    "write",
    manageProject,
  ),
  checkDomainVerification: policy(
    "POST",
    "/projects/{project_id}/domain-verification/check",
    "admin",
    "write",
    manageProject,
  ),
};
