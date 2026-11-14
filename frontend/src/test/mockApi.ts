// Owner: A (Arvind)
// Test control panel for the API. Call `mockApi.enable()` (or `useMockApi()` in a describe block) to switch the
// client to mock mode, then override single endpoints. Everything is reset automatically after each test.
//
//   mockApi.enable();
//   mockApi.respond("GET", "/artifacts", []);                                        // empty list
//   mockApi.respond("GET", "/artifacts", [artifact], { delayMs: 50 });               // data after a delay
//   mockApi.fail("GET", `/artifacts/${id}/graph`, 409, "precondition_failed", "run matching first");
//   mockApi.calls("GET", "/artifacts")                                               // how often it was hit
//
// Paths are relative to /api/v1 and exclude the query string. Unmocked endpoints keep serving the seeded mock data.
import { ApiError } from "../api/errors";
import { resetMocks, setMockOverride } from "../api/mocks";
import type { MockRequest } from "../api/mocks";

const callLog: MockRequest[] = [];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  /** Turns on mock mode for the current test (undone automatically). */
  enable() {
    vi.stubEnv("VITE_USE_MOCKS", "true");
    resetMocks();
  },

  /** Answers `method path` with `data` (an empty array/object is how you test empty states). */
  respond(method: string, path: string, data: unknown, opts: { delayMs?: number } = {}) {
    setMockOverride(method, path, async (req) => {
      callLog.push(req);
      if (opts.delayMs) await wait(opts.delayMs);
      return data;
    });
  },

  /** Answers `method path` with a CONTRACT §4 error: `{error: {code, message, details}}` becomes an ApiError. */
  fail(
    method: string,
    path: string,
    status: number,
    code: string,
    message = code,
    details: Record<string, unknown> = {},
    opts: { delayMs?: number } = {},
  ) {
    setMockOverride(method, path, async (req) => {
      callLog.push(req);
      if (opts.delayMs) await wait(opts.delayMs);
      throw new ApiError(status, code, message, details);
    });
  },

  /** Requests seen by overridden endpoints (optionally filtered by method and path). */
  calls(method?: string, path?: string): MockRequest[] {
    return callLog.filter((c) => (!method || c.method === method.toUpperCase()) && (!path || c.path === path));
  },

  /** Clears overrides, call log and seeded data. Runs automatically after every test. */
  reset() {
    callLog.length = 0;
    resetMocks();
  },
};

/** Registers beforeEach(enable) for a describe block: `describe("x", () => { useMockApi(); ... })`. */
export function useMockApi() {
  beforeEach(() => mockApi.enable());
}
