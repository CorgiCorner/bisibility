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

export class ApiNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiNotFoundError";
  }
}
