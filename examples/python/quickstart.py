from __future__ import annotations

import os
import sys
import time

from bisibility import BisibilityApiError, BisibilityClient

EXAMPLE_ID = "python-quickstart"
MAX_HISTORY_ATTEMPTS = 5

# docs:start:method-contract
DOCS_METHOD_CONTRACT = {
    "List projects": BisibilityClient.list_projects,
    "Create a project": BisibilityClient.create_project,
    "Add keywords": BisibilityClient.create_keywords,
    "Run a rank check": BisibilityClient.run_rank_check,
    "Read a rank-check result": BisibilityClient.get_rank_check_result,
}
# docs:end:method-contract


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def wait_for_rank_history(client: BisibilityClient, keyword_id: str, expected_check_id: str):
    for _attempt in range(MAX_HISTORY_ATTEMPTS):
        history = client.list_rank_checks(keyword_id, {"limit": 10, "status": "completed"})
        for check in history.data:
            if check.id == expected_check_id:
                return check
        time.sleep(0.5)

    raise RuntimeError(f"Rank history did not include check {expected_check_id}.")


def run() -> None:
    keyword_id: str | None = None
    # docs:start:client-usage
    with BisibilityClient(
        api_key=required_env("BISIBILITY_API_KEY"),
        base_url=required_env("BISIBILITY_BASE_URL"),
    ) as client:
        try:
            print("Listing projects")
            projects = client.list_projects()
            # docs:end:client-usage
            project = projects.data[0] if projects.data else None
            if project is None:
                raise RuntimeError("No projects are available for this API key.")

            suffix = f"{int(time.time() * 1000)}-{os.getpid()}"
            keyword = f"sdk quickstart {suffix}"
            print(f"Using project {project.id}")
            print(f"Creating keyword {keyword}")

            created = client.create_keywords(
                project.id,
                {
                    "keywords": [
                        {
                            "keyword": keyword,
                            "tags": ["sdk-example"],
                            "target_url": f"https://{project.domain}/quickstart",
                        }
                    ]
                },
                request_options={"idempotency_key": f"{EXAMPLE_ID}-{suffix}"},
            )

            keyword_id = created.results[0].keyword.id if created.results else None
            if not keyword_id:
                raise RuntimeError("Keyword creation did not return a keyword id.")
            print(f"Created keyword {keyword_id}")

            print("Running rank check")
            check = client.run_rank_check(keyword_id)
            position = check.position if check.position is not None else "none"
            print(f"Rank check {check.id} completed with position {position}")

            print("Reading rank history")
            history_check = wait_for_rank_history(client, keyword_id, check.id)
            print(f"History includes {history_check.id} from {history_check.checked_at}")
        finally:
            if keyword_id:
                print(f"Deleting keyword {keyword_id}")
                client.delete_keyword(keyword_id)

    print(f"OK {EXAMPLE_ID}")


if __name__ == "__main__":
    try:
        run()
    except BisibilityApiError as error:
        detail = error.problem.detail if error.problem else str(error)
        print(f"API error {error.status}: {detail}", file=sys.stderr)
        raise SystemExit(1) from error
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
