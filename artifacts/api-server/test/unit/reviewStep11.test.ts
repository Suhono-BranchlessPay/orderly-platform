import {
  assertPublishGates,
  evaluateOnboardingReview,
} from "../../src/lib/onboardingReview";
import { reviewSchema } from "../../src/lib/onboardingWizard";

describe("review Step 11", () => {
  it("requires both acknowledgements", () => {
    expect(
      reviewSchema.safeParse({
        reviewAcknowledged: true,
        goLiveAcknowledged: true,
      }).success,
    ).toBe(true);

    expect(
      reviewSchema.safeParse({
        reviewAcknowledged: true,
        goLiveAcknowledged: false,
      }).success,
    ).toBe(false);

    expect(
      reviewSchema.safeParse({
        reviewAcknowledged: false,
        goLiveAcknowledged: true,
      }).success,
    ).toBe(false);
  });

  it("evaluateOnboardingReview blocks incomplete steps and publish without step 11", () => {
    const session = {
      id: "s1",
      status: "draft",
      restaurantName: "Test",
      domain: "test.example.com",
      squareMerchantId: "M1",
      squareLocationId: "L1",
      wizard: {
        completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        identity: {
          phone: "+18125550011",
          websiteDomain: "test.example.com",
          publicDisplayName: "Test",
        },
        serviceStyle: { presentation: "plate" },
        hours: {
          timezone: "America/Indiana/Indianapolis",
          timezoneConfirmed: true,
        },
        squareConnect: { taxConfirmed: true, taxRate: 0.07 },
        catalog: {
          ambiguousReviewed: true,
          skuPrefixUniqueConfirmed: true,
          skuPrefix: "T11",
        },
        photos: { coverageAcknowledged: true },
        social: { path: "contact_us", contactUsAcknowledged: true },
        google: {
          gbpStatus: "pending",
          gscPath: "contact_us",
          contactUsAcknowledged: true,
        },
        ops: {
          ownerEmail: "o@example.com",
          sendHourLocal: 4,
          timezone: "America/Indiana/Indianapolis",
          opsAck: true,
        },
        compliance: { healthDeptCleared: true },
      },
    } as any;

    const before = evaluateOnboardingReview(session, { publishEnabled: false });
    expect(before.allRequiredOk).toBe(true);
    expect(before.gates.find((g) => g.key === "review")?.ok).toBe(false);

    expect(() => assertPublishGates(session)).toThrow(/Step 11/);

    session.wizard.review = {
      reviewAcknowledged: true,
      goLiveAcknowledged: true,
    };
    session.wizard.completedSteps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    session.status = "ready";
    expect(() => assertPublishGates(session)).not.toThrow();
  });
});
