import {
  resolveMetaCapiCreds,
  isMetaCapiGloballyEnabled,
} from "../../src/lib/metaCapiConfig";

describe("metaCapiConfig fail-closed credentials", () => {
  const prev: Record<string, string | undefined> = {};

  function snap(keys: string[]) {
    for (const k of keys) prev[k] = process.env[k];
  }
  function restore(keys: string[]) {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }

  const keys = [
    "META_CAPI_ENABLED",
    "META_PIXEL_ID",
    "META_CAPI_ACCESS_TOKEN",
    "META_CAPI_TEST_EVENT_CODE",
    "TENANT_SAMURAI_META_PIXEL_ID",
    "TENANT_SAMURAI_META_CAPI_ACCESS_TOKEN",
    "TENANT_SAMURAI_META_CAPI_TEST_EVENT_CODE",
    "TENANT_OTHER_META_PIXEL_ID",
    "TENANT_OTHER_META_CAPI_ACCESS_TOKEN",
  ];

  beforeEach(() => {
    snap(keys);
    for (const k of keys) delete process.env[k];
  });
  afterEach(() => restore(keys));

  it("does not use global META_PIXEL_ID / META_CAPI_ACCESS_TOKEN", () => {
    process.env.META_PIXEL_ID = "global-pixel";
    process.env.META_CAPI_ACCESS_TOKEN = "global-token";
    expect(resolveMetaCapiCreds("samurai")).toBeNull();
  });

  it("resolves only TENANT_{ID}_* credentials", () => {
    process.env.META_PIXEL_ID = "global-pixel";
    process.env.META_CAPI_ACCESS_TOKEN = "global-token";
    process.env.TENANT_SAMURAI_META_PIXEL_ID = "samurai-pixel";
    process.env.TENANT_SAMURAI_META_CAPI_ACCESS_TOKEN = "samurai-token";
    process.env.TENANT_SAMURAI_META_CAPI_TEST_EVENT_CODE = "TEST123";
    const creds = resolveMetaCapiCreds("samurai");
    expect(creds).toEqual({
      pixelId: "samurai-pixel",
      accessToken: "samurai-token",
      testEventCode: "TEST123",
    });
    // Other tenant must not inherit Samurai or global
    expect(resolveMetaCapiCreds("other")).toBeNull();
  });

  it("META_CAPI_ENABLED stays opt-in", () => {
    expect(isMetaCapiGloballyEnabled()).toBe(false);
    process.env.META_CAPI_ENABLED = "1";
    expect(isMetaCapiGloballyEnabled()).toBe(true);
  });
});
