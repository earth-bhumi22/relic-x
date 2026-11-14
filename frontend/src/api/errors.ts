// Owner: A (Arvind)
/** Error with the backend's standard shape: {error: {code, message, details}} (CONTRACT §4). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}
