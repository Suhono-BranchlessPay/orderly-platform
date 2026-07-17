// Import via `expo/config-plugins` (re-export) so it resolves reliably under
// pnpm, where the transitive `@expo/config-plugins` may not be hoisted.
const { withXcodeProject } = require("expo/config-plugins");

/**
 * Square In-App Payments SDK ships its .framework bundles with a nested
 * `Frameworks/` directory and an unsigned `setup` helper script. App Store
 * validation rejects those:
 *   ITMS-90205 / ITMS-90206 — disallowed nested bundles / disallowed file 'Frameworks'
 *   ITMS-90035            — SquareInAppPaymentsSDK.framework/setup not signed
 *
 * Square's official fix is to add a Run Script build phase (AFTER the embed
 * frameworks phase) that executes each framework's `setup` script; that script
 * un-nests the frameworks and then deletes itself, leaving a store-valid bundle.
 *
 * Expo's managed prebuild does NOT add this phase, so we inject it here. Because
 * `addBuildPhase` appends to the end of the phase list, it runs after
 * "[CP] Embed Pods Frameworks" / "Embed Frameworks", as Square requires.
 */
const PHASE_NAME = "Square SDK setup (un-nest frameworks)";

const shellScript = [
  "# Auto-added by plugins/withSquareSetupScript.js — do not edit in prebuild output.",
  "# Runs Square SDK setup so nested frameworks are un-nested and the unsigned",
  "# 'setup' helper deletes itself (fixes App Store ITMS-90205/90206/90035).",
  "for FW in SquareInAppPaymentsSDK SquareBuyerVerificationSDK; do",
  '  SETUP="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}/${FW}.framework/setup"',
  '  if [ -f "$SETUP" ]; then',
  '    echo "[square-setup] running setup for ${FW}"',
  '    "$SETUP"',
  "  else",
  '    echo "[square-setup] no setup script for ${FW} (already clean)"',
  "  fi",
  "done",
].join("\n");

module.exports = function withSquareSetupScript(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    // Idempotent: don't add the phase twice.
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const exists = Object.values(phases).some(
      (p) =>
        p &&
        typeof p === "object" &&
        typeof p.name === "string" &&
        p.name.replace(/"/g, "").includes(PHASE_NAME),
    );

    if (!exists) {
      const target = project.getFirstTarget().uuid;
      project.addBuildPhase(
        [],
        "PBXShellScriptBuildPhase",
        PHASE_NAME,
        target,
        {
          shellPath: "/bin/sh",
          shellScript,
        },
      );
    }

    return cfg;
  });
};
