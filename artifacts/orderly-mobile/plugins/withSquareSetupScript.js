// Import via `expo/config-plugins` (re-export) so it resolves reliably under
// pnpm, where the transitive `@expo/config-plugins` may not be hoisted.
const { withXcodeProject, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Square In-App Payments SDK ships its .framework bundles with a nested
 * `Frameworks/` directory (e.g. ThreeDS_SDK.framework, CorePaymentCard.framework)
 * and an unsigned `setup` helper script. App Store validation rejects those:
 *   ITMS-90205 / ITMS-90206 — disallowed nested bundles / disallowed file 'Frameworks'
 *   ITMS-90035            — SquareInAppPaymentsSDK.framework/setup not signed
 *
 * Square's official fix is a Run Script build phase that runs each framework's
 * `setup` script; that script un-nests the frameworks, re-signs them, and then
 * deletes itself. It MUST run AFTER "[CP] Embed Pods Frameworks".
 *
 * Build 1 (and build 4) of Samurai Martinsville were rejected because the phase
 * ran BEFORE Embed — log said "already clean" (setup not found yet), then Embed
 * copied the nested/unsigned frameworks into the IPA. Fix:
 *  1) withXcodeProject: add the Run Script phase (fail-loud if still dirty).
 *  2) withDangerousMod:  Podfile post_install calls plugins/reorderSquareSetup.js
 *     AFTER CocoaPods finishes, so the phase is guaranteed last.
 */
const PHASE_NAME = "Square SDK setup (un-nest frameworks)";
const REORDER_MARKER = "square-setup-reorder";

// Fail loud if frameworks aren't embedded yet OR still nested after setup —
// never silently "already clean" (that produced the rejected IPA).
const shellScript = [
  "# Auto-added by plugins/withSquareSetupScript.js — do not edit in prebuild output.",
  "# MUST run AFTER [CP] Embed Pods Frameworks (reordered via Podfile post_install).",
  "set -e",
  'FW_DIR="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}"',
  'echo "[square-setup] FW_DIR=${FW_DIR}"',
  'if [ ! -d "${FW_DIR}/SquareInAppPaymentsSDK.framework" ]; then',
  '  echo "error: [square-setup] SquareInAppPaymentsSDK.framework not embedded yet."',
  '  echo "error: Build phase order is wrong — this script must run AFTER [CP] Embed Pods Frameworks."',
  "  exit 1",
  "fi",
  'SETUP="${FW_DIR}/SquareInAppPaymentsSDK.framework/setup"',
  'if [ -f "$SETUP" ]; then',
  '  echo "[square-setup] running SquareInAppPaymentsSDK.framework/setup"',
  '  "$SETUP"',
  "else",
  '  echo "[square-setup] setup script already removed (ok if frameworks are clean)"',
  "fi",
  "# Verify — fail the archive here so App Store never sees a dirty IPA.",
  "DIRTY=0",
  "for FW in SquareInAppPaymentsSDK SquareBuyerVerificationSDK; do",
  '  BASE="${FW_DIR}/${FW}.framework"',
  '  [ -d "$BASE" ] || continue',
  '  if [ -d "${BASE}/Frameworks" ]; then',
  '    echo "error: [square-setup] ${FW}.framework still has nested Frameworks/"',
  "    DIRTY=1",
  "  fi",
  '  if [ -f "${BASE}/setup" ]; then',
  '    echo "error: [square-setup] ${FW}.framework/setup still present (unsigned)"',
  "    DIRTY=1",
  "  fi",
  "done",
  'if [ "$DIRTY" -ne 0 ]; then',
  '  echo "error: [square-setup] Square frameworks not cleaned — refusing to archive."',
  "  exit 1",
  "fi",
  'echo "[square-setup] OK — nested Frameworks removed, setup deleted"',
].join("\n");

function withSquareSetupBuildPhase(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const exists = Object.values(phases).some(
      (p) =>
        p &&
        typeof p === "object" &&
        typeof p.name === "string" &&
        p.name.replace(/"/g, "").includes(PHASE_NAME),
    );

    const target = project.getFirstTarget().uuid;

    // Drop any prior Square setup phase so we always ship the fail-loud script
    // body (EAS prebuild is clean each run; local prebuild may be sticky).
    if (exists) {
      const nativeTargets = project.hash.project.objects.PBXNativeTarget || {};
      for (const [phaseKey, p] of Object.entries(phases)) {
        if (
          !p ||
          typeof p !== "object" ||
          typeof p.name !== "string" ||
          !p.name.replace(/"/g, "").includes(PHASE_NAME)
        ) {
          continue;
        }
        delete phases[phaseKey];
        const commentKey = `${phaseKey}_comment`;
        if (phases[commentKey]) delete phases[commentKey];
        for (const t of Object.values(nativeTargets)) {
          if (!t || !Array.isArray(t.buildPhases)) continue;
          t.buildPhases = t.buildPhases.filter(
            (ref) => ref && ref.value !== phaseKey.replace(/_comment$/, ""),
          );
        }
      }
    }

    project.addBuildPhase([], "PBXShellScriptBuildPhase", PHASE_NAME, target, {
      shellPath: "/bin/sh",
      shellScript,
    });

    return cfg;
  });
}

// Podfile post_install: after CocoaPods appends [CP] Embed Pods Frameworks,
// run the node reorder script (edits pbxproj) so Square setup is last.
const reorderRuby = `
    # >>> ${REORDER_MARKER}
    # Move Square SDK setup Run Script to the very end of the app target's
    # build phases (AFTER [CP] Embed Pods Frameworks). Without this, setup
    # runs too early → IPA ships nested/unsigned Square frameworks → ITMS-90035/90205/90206.
    reorder_script = File.expand_path('../plugins/reorderSquareSetup.js', __dir__)
    if File.exist?(reorder_script)
      system('node', reorder_script) or raise '[square-setup-reorder] node plugins/reorderSquareSetup.js failed'
    else
      Pod::UI.warn "[square-setup-reorder] missing #{reorder_script}"
    end
    # <<< ${REORDER_MARKER}
`;

function withSquareSetupReorder(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile",
      );
      let contents = fs.readFileSync(podfilePath, "utf8");

      // Idempotent: replace previous injection if present, else insert.
      if (contents.includes(REORDER_MARKER)) {
        contents = contents.replace(
          new RegExp(
            `# >>> ${REORDER_MARKER}[\\s\\S]*?# <<< ${REORDER_MARKER}\\n?`,
          ),
          reorderRuby.trimStart(),
        );
      } else {
        const re = /post_install do \|installer\|[^\n]*\n/;
        if (re.test(contents)) {
          contents = contents.replace(re, (m) => `${m}${reorderRuby}`);
        } else {
          contents += `\npost_install do |installer|\n${reorderRuby}\nend\n`;
        }
      }
      fs.writeFileSync(podfilePath, contents, "utf8");

      return cfg;
    },
  ]);
}

module.exports = function withSquareSetupScript(config) {
  config = withSquareSetupBuildPhase(config);
  config = withSquareSetupReorder(config);
  return config;
};
