// Owner: A (Arvind)
// Runs before every test file. Isolation between tests: vite.config.ts sets restoreMocks / unstubGlobals /
// unstubEnvs, RTL unmounts after each test, and the mock API (data, overrides, call log) is reset here.
import "@testing-library/jest-dom/vitest";
import { mockApi } from "./test/mockApi";

// Tests must not depend on the shell or CI environment: real mode is the default, and a test opts in to
// mock mode with mockApi.enable() / useMockApi(). (CI sets VITE_USE_MOCKS=true; this keeps that harmless.)
beforeEach(() => {
  vi.stubEnv("VITE_USE_MOCKS", "false");
});

afterEach(() => {
  mockApi.reset();
  window.localStorage.clear();
});
