import {
  isMetaPageOauthEnabled,
  isTenantAllowedForMetaPageOauth,
  metaPageOauthAllowlist,
} from "../../src/lib/metaOauth";

describe("Meta Page OAuth gates", () => {
  const keys = [
    "META_PAGE_OAUTH_ENABLED",
    "META_PAGE_OAUTH_PUBLIC",
    "META_PAGE_OAUTH_ALLOWLIST",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (prev[k] == null) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  test("disabled by default", () => {
    delete process.env.META_PAGE_OAUTH_ENABLED;
    expect(isMetaPageOauthEnabled()).toBe(false);
    expect(isTenantAllowedForMetaPageOauth("samurai")).toBe(false);
  });

  test("allow-list samurai/kirin when enabled", () => {
    process.env.META_PAGE_OAUTH_ENABLED = "1";
    delete process.env.META_PAGE_OAUTH_PUBLIC;
    delete process.env.META_PAGE_OAUTH_ALLOWLIST;
    expect(metaPageOauthAllowlist()).toEqual(["samurai", "kirin"]);
    expect(isTenantAllowedForMetaPageOauth("samurai")).toBe(true);
    expect(isTenantAllowedForMetaPageOauth("kirin")).toBe(true);
    expect(isTenantAllowedForMetaPageOauth("other-client")).toBe(false);
  });

  test("public mode allows any tenant when Advanced Access flag set", () => {
    process.env.META_PAGE_OAUTH_ENABLED = "1";
    process.env.META_PAGE_OAUTH_PUBLIC = "1";
    expect(isTenantAllowedForMetaPageOauth("random-outlet")).toBe(true);
  });
});
