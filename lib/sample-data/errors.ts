export class SampleDataError extends Error {
  constructor(
    public readonly code: "not_sample_project",
    message = "Only sample projects can be removed by this action.",
  ) {
    super(message);
    this.name = "SampleDataError";
  }
}
