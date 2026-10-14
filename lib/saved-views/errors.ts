export class SavedViewConflictError extends Error {
  readonly code = "saved_view_conflict";
  readonly status = 409;

  constructor(message = "This view changed. Reload it before saving again.") {
    super(message);
    this.name = "SavedViewConflictError";
  }
}

export class SavedViewUnavailableError extends Error {
  readonly code = "saved_view_unavailable";
  readonly status = 404;

  constructor() {
    super("This saved view is unavailable.");
    this.name = "SavedViewUnavailableError";
  }
}

export class ViewPreferenceConflictError extends Error {
  readonly code = "view_preference_conflict";
  readonly status = 409;

  constructor() {
    super("Your display preference changed. Reload it before saving again.");
    this.name = "ViewPreferenceConflictError";
  }
}

export class PrivateViewCreationUnavailableError extends Error {
  readonly code = "private_view_creation_unavailable";
  readonly status = 403;
  constructor() {
    super("Creating private saved views is temporarily unavailable.");
    this.name = "PrivateViewCreationUnavailableError";
  }
}
