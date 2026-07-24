import {
  defaultDishTerm,
  serviceStyleSchema,
} from "../../src/lib/onboardingWizard";
import {
  parseServiceStyleFromTheme,
  serviceStylePromptBlock,
  SERVICE_STYLE_MISSING,
} from "../../src/lib/serviceStyle";

describe("serviceStyle Step 2", () => {
  it("defaults dish term from presentation", () => {
    expect(defaultDishTerm("box")).toBe("boxes");
    expect(defaultDishTerm("plate")).toBe("plates");
  });

  it("parses theme.serviceStyle", () => {
    const style = parseServiceStyleFromTheme({
      serviceStyle: {
        presentation: "box",
        cookingShow: false,
        dishTerm: "boxes",
        dineIn: false,
        outdoorSeating: false,
      },
    });
    expect(style?.cookingShow).toBe(false);
    expect(style?.presentation).toBe("box");
  });

  it("rejects incomplete style", () => {
    expect(parseServiceStyleFromTheme({ serviceStyle: { presentation: "box" } })).toBeNull();
  });

  it("prompt block forbids show claims when cookingShow=false", () => {
    const parsed = serviceStyleSchema.parse({
      presentation: "box",
      cookingShow: false,
      dishTerm: "boxes",
      dineIn: false,
      outdoorSeating: false,
    });
    const block = serviceStylePromptBlock(parsed);
    expect(block).toMatch(/never claim/i);
    expect(block).toMatch(/BOXES/i);
  });

  it("exports stable AI gate error code", () => {
    expect(SERVICE_STYLE_MISSING).toBe("service_style_required");
  });
});
