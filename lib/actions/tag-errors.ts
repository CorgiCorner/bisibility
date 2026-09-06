// Tag domain errors shared by the tag actions and the ActionResult mapping
// helper. Kept out of the "use server" module so both can reference the classes.

export class TagAlreadyExistsError extends Error {
  readonly code = "conflict";
  readonly status = 409;

  constructor() {
    super("Tag already exists.");
    this.name = "TagAlreadyExistsError";
  }
}

export class TagNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;

  constructor() {
    super("Tag not found.");
    this.name = "TagNotFoundError";
  }
}
