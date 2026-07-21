import {
  signSquareTenantOauthState,
  verifySquareTenantOauthState,
  dashboardSquareSessionKey,
} from "../../src/lib/squareOauth";

describe("Square dashboard tenant OAuth state", () => {
  const prev = process.env.ORDERLY_TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ORDERLY_TOKEN_ENCRYPTION_KEY = "unit-test-square-oauth-key-32b!!";
  });

  afterAll(() => {
    if (prev == null) delete process.env.ORDERLY_TOKEN_ENCRYPTION_KEY;
    else process.env.ORDERLY_TOKEN_ENCRYPTION_KEY = prev;
  });

  test("round-trips tenant id", () => {
    const state = signSquareTenantOauthState("samurai-linton");
    const v = verifySquareTenantOauthState(state);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.tenantId).toBe("samurai-linton");
  });

  test("rejects tampered state", () => {
    const state = signSquareTenantOauthState("kirin");
    const bad = state.slice(0, -2) + "xx";
    expect(verifySquareTenantOauthState(bad).ok).toBe(false);
  });

  test("synthetic dashboard session key", () => {
    expect(dashboardSquareSessionKey("kirin")).toBe("dashboard:kirin");
  });
});
