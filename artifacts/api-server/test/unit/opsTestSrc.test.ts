import {
  isOpsTestSrc,
  withOpsTestSourceDetail,
} from "../../src/lib/opsTestSrc";
import { shouldServeWebviewEscape } from "../../src/lib/webviewEscape";

describe("ops test src", () => {
  test("detects test/probe patterns", () => {
    expect(isOpsTestSrc("test-manual")).toBe(true);
    expect(isOpsTestSrc("tiktok-test")).toBe(true);
    expect(isOpsTestSrc("fb-test")).toBe(true);
    expect(isOpsTestSrc("fb-src-probe-1784419368")).toBe(true);
    expect(isOpsTestSrc("probe-redirect")).toBe(true);
    expect(isOpsTestSrc("test-shortlink-manual-20260718")).toBe(true);
    expect(isOpsTestSrc("fb-rainbowroll-20260719")).toBe(false);
    expect(isOpsTestSrc("ig-bio")).toBe(false);
    expect(isOpsTestSrc("tiktok-bio")).toBe(false);
  });

  test("auto-flags source_detail", () => {
    const flagged = withOpsTestSourceDetail({ src: "tiktok-test" });
    expect(flagged.is_test).toBe(true);
    expect(flagged.test_reason).toBe("auto_src_test_pattern");
    expect(withOpsTestSourceDetail({ src: "ig-bio" }).is_test).toBeUndefined();
  });
});

describe("stay=1 does not bypass IAB Continue", () => {
  test("Instagram UA still escapes even with stay=1", () => {
    expect(
      shouldServeWebviewEscape("Mozilla/5.0 Instagram IABMV/1", "1"),
    ).toBe(true);
  });

  test("Safari with stay=1 does not escape", () => {
    expect(
      shouldServeWebviewEscape(
        "Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1",
        "1",
      ),
    ).toBe(false);
  });
});
