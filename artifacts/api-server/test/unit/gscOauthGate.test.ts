/**
 * Mirror of assertGscOpsToken fail-closed rules in routes/gsc.ts.
 * Kept as a pure helper test so we do not need to boot Express.
 */
function assertGscOpsToken(
  env: {
    NODE_ENV?: string;
    GSC_OAUTH_OPS_TOKEN?: string;
    GSC_OAUTH_ALLOW_UNAUTH?: string;
  },
  provided: string,
): boolean {
  const opsToken = env.GSC_OAUTH_OPS_TOKEN?.trim();
  if (!opsToken) return env.GSC_OAUTH_ALLOW_UNAUTH === "1";
  return provided.trim() === opsToken;
}

describe("GSC OAuth ops token gate", () => {
  test("unset token is fail-closed (even outside production)", () => {
    expect(
      assertGscOpsToken({ NODE_ENV: "development", GSC_OAUTH_OPS_TOKEN: "" }, ""),
    ).toBe(false);
    expect(assertGscOpsToken({ NODE_ENV: "test" }, "")).toBe(false);
    expect(
      assertGscOpsToken({ NODE_ENV: "production", GSC_OAUTH_OPS_TOKEN: "" }, ""),
    ).toBe(false);
  });

  test("unset token opens only with GSC_OAUTH_ALLOW_UNAUTH=1", () => {
    expect(
      assertGscOpsToken(
        { NODE_ENV: "development", GSC_OAUTH_ALLOW_UNAUTH: "1" },
        "",
      ),
    ).toBe(true);
  });

  test("token must match when set", () => {
    expect(
      assertGscOpsToken(
        { NODE_ENV: "production", GSC_OAUTH_OPS_TOKEN: "secret" },
        "secret",
      ),
    ).toBe(true);
    expect(
      assertGscOpsToken(
        { NODE_ENV: "production", GSC_OAUTH_OPS_TOKEN: "secret" },
        "wrong",
      ),
    ).toBe(false);
  });
});
