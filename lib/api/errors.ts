export class ApiInputError extends Error {
  readonly code: "bad_request" | "invalid_cursor" | "invalid_public_id";

  constructor(
    message: string,
    code: "bad_request" | "invalid_cursor" | "invalid_public_id" = "bad_request",
  ) {
    super(message);
    this.name = "ApiInputError";
    this.code = code;
  }
}

export class ApiConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConflictError";
  }
}

export class ApiForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiForbiddenError";
  }
}

export class ApiNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiNotFoundError";
  }
}

export class RequestBodyLimitError extends Error {
  readonly reason: "too_large" | "unreadable";

  constructor(reason: "too_large" | "unreadable") {
    super(
      reason === "too_large" ? "Request body is too large." : "The request body could not be read.",
    );
    this.name = "RequestBodyLimitError";
    this.reason = reason;
  }
}
