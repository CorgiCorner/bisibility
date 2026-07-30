from __future__ import annotations

import os
import sys
from collections.abc import Callable
from dataclasses import dataclass

from bisibility import BisibilityApiError, BisibilityClient

EXAMPLE_ID = "python-error-handling"


@dataclass(frozen=True)
class ExpectedApiError:
    code: str
    status: int
    title: str


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def problem_code(error: BisibilityApiError) -> str | None:
    if error.problem is None:
        return None
    return error.problem.type.rsplit("/", 1)[-1]


def expect_api_error(
    label: str,
    expected: ExpectedApiError,
    operation: Callable[[], object],
) -> None:
    try:
        operation()
    except BisibilityApiError as error:
        if error.status != expected.status:
            raise AssertionError(f"{label} returned status {error.status}.") from error
        if error.problem is None:
            raise AssertionError(f"{label} did not include problem details.") from error
        if error.problem.status != expected.status:
            raise AssertionError(
                f"{label} problem status was {error.problem.status}."
            ) from error
        expected_type = f"https://bisibility.com/problems/{expected.code}"
        if error.problem.type != expected_type:
            raise AssertionError(f"{label} problem type was {error.problem.type}.") from error
        if problem_code(error) != expected.code:
            raise AssertionError(f"{label} problem code was {problem_code(error)}.") from error
        if error.problem.title != expected.title:
            raise AssertionError(f"{label} problem title was {error.problem.title}.") from error
        print(f"{label}: {error.problem.title} ({problem_code(error)})")
        return

    raise RuntimeError(f"{label} did not fail.")


def run() -> None:
    base_url = required_env("BISIBILITY_BASE_URL")
    with (
        BisibilityClient(api_key=required_env("BISIBILITY_API_KEY"), base_url=base_url) as client,
        BisibilityClient(
            api_key=f"{required_env('BISIBILITY_API_KEY')}_invalid",
            base_url=base_url,
        ) as invalid_client,
    ):
        expect_api_error(
            "Invalid API key",
            ExpectedApiError(code="unauthorized", status=401, title="Unauthorized"),
            invalid_client.list_projects,
        )

        expect_api_error(
            "Missing keyword",
            ExpectedApiError(code="not_found", status=404, title="Not found"),
            lambda: client.get_keyword("kw_z00000000000000000000000"),
        )

        projects = client.list_projects()
        project = projects.data[0] if projects.data else None
        if project is None:
            raise RuntimeError("No projects are available for this API key.")

        expect_api_error(
            "Invalid keyword payload",
            ExpectedApiError(code="validation_failed", status=400, title="Validation failed"),
            lambda: client.create_keywords(project.id, {"keywords": [{"keyword": ""}]}),
        )

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
