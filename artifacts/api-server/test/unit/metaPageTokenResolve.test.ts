import { encryptToken } from "../../src/lib/tokenCrypto";

jest.mock("@workspace/db", () => {
  const actual = jest.requireActual("@workspace/db");
  return {
    ...actual,
    db: {
      select: jest.fn(),
    },
  };
});

import { db } from "@workspace/db";
import { resolveMetaPageAccessToken } from "../../src/lib/metaOauth";

describe("resolveMetaPageAccessToken (fail-closed)", () => {
  const encKey = "test-orderly-token-encryption-key-meta";
  const prevEnc = process.env.ORDERLY_TOKEN_ENCRYPTION_KEY;
  const prevGlobal = process.env.META_PAGE_ACCESS_TOKEN;
  const prevTenant = process.env.TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN;
  const prevKirin = process.env.TENANT_KIRIN_META_PAGE_ACCESS_TOKEN;

  beforeEach(() => {
    process.env.ORDERLY_TOKEN_ENCRYPTION_KEY = encKey;
    delete process.env.META_PAGE_ACCESS_TOKEN;
    delete process.env.TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN;
    delete process.env.TENANT_KIRIN_META_PAGE_ACCESS_TOKEN;
    jest.resetAllMocks();
  });

  afterAll(() => {
    if (prevEnc == null) delete process.env.ORDERLY_TOKEN_ENCRYPTION_KEY;
    else process.env.ORDERLY_TOKEN_ENCRYPTION_KEY = prevEnc;
    if (prevGlobal == null) delete process.env.META_PAGE_ACCESS_TOKEN;
    else process.env.META_PAGE_ACCESS_TOKEN = prevGlobal;
    if (prevTenant == null) delete process.env.TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN;
    else process.env.TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN = prevTenant;
    if (prevKirin == null) delete process.env.TENANT_KIRIN_META_PAGE_ACCESS_TOKEN;
    else process.env.TENANT_KIRIN_META_PAGE_ACCESS_TOKEN = prevKirin;
  });

  function mockConn(row: Record<string, unknown> | null) {
    const limit = jest.fn().mockResolvedValue(row ? [row] : []);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    (db.select as jest.Mock).mockReturnValue({ from });
  }

  test("oauth DB token wins over tenant env", async () => {
    process.env.TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN = "env-token-should-lose";
    process.env.META_PAGE_ACCESS_TOKEN = "global-must-never-win";
    mockConn({
      tenantId: "samurai",
      pageId: "1031895316670551",
      pageName: "Samuraimartinsville",
      pageAccessTokenEnc: encryptToken("oauth-db-token"),
    });
    const r = await resolveMetaPageAccessToken("samurai");
    expect(r).toEqual({
      token: "oauth-db-token",
      source: "oauth_db",
      pageId: "1031895316670551",
      pageName: "Samuraimartinsville",
    });
  });

  test("tenant env used when no oauth row", async () => {
    mockConn(null);
    process.env.TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN = "samurai-only";
    process.env.META_PAGE_ACCESS_TOKEN = "global-must-never-win";
    const r = await resolveMetaPageAccessToken("samurai");
    expect(r).toEqual({
      token: "samurai-only",
      source: "tenant_env",
      pageId: null,
      pageName: null,
    });
  });

  test("never falls back to global META_PAGE_ACCESS_TOKEN", async () => {
    mockConn(null);
    process.env.META_PAGE_ACCESS_TOKEN = "samurai-global-env";
    const r = await resolveMetaPageAccessToken("kirin");
    expect(r).toBeNull();
  });

  test("kirin does not inherit samurai tenant env", async () => {
    mockConn(null);
    process.env.TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN = "samurai-only";
    const r = await resolveMetaPageAccessToken("kirin");
    expect(r).toBeNull();
  });
});
