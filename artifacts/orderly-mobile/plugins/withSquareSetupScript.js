// Import via `expo/config-plugins` (re-export) so it resolves reliably under
// pnpm, where the transitive `@expo/config-plugins` may not be hoisted.
const { withXcodeProject, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Square In-App Payments SDK ships nested `Frameworks/` + an unsigned `setup`
 * helper. App Store rejects those (ITMS-90035 / 90205 / 90206).
 *
 * Square's fix is to run each framework's `setup` AFTER the frameworks are
 * copied into the .app. On EAS/Xcode New Build System, a standalone Run Script
 * phase can still execute BEFORE Embed even when listed last (no input files /
 * "ambiguous dependencies") — confirmed by build 5 ("not embedded yet").
 *
 * Strategy:
 *  1) withXcodeProject: add a VERIFICATION Run Script phase (fail-loud).
 *  2) withDangerousMod: Podfile post_install runs plugins/reorderSquareSetup.js
 *     which APPENDS the actual setup invocation to the end of
 *     "[CP] Embed Pods Frameworks" (guaranteed after the copy) and moves the
 *     verification phase last with an inputPath dependency.
 */
const PHASE_NAME = "Square SDK setup (un-nest frameworks)";
const REORDER_MARKER = "square-setup-reorder";

// Verification only — setup itself is appended to [CP] Embed Pods Frameworks.
const shellScript = [
  "# Auto-added by plugins/withSquareSetupScript.js — verification phase.",
  "# Actual Square setup runs at the end of [CP] Embed Pods Frameworks",
  "# (see plugins/reorderSquareSetup.js). This phase fails the archive if",
  "# anything is still dirty (nested Frameworks/ or unsigned setup).",
  "set -e",
  'FW_DIR="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}"',
  'echo "[square-setup] verify FW_DIR=${FW_DIR}"',
  'if [ ! -d "${FW_DIR}/SquareInAppPaymentsSDK.framework" ]; then',
  '  echo "error: [square-setup] SquareInAppPaymentsSDK.framework missing at verify time"',
  "  exit 1",
  "fi",
  "# If setup is somehow still present (embed-append didn't run), run it now.",
  'if [ -f "${FW_DIR}/SquareInAppPaymentsSDK.framework/setup" ]; then',
  '  echo "[square-setup] verify-phase fallback: running setup"',
  '  "${FW_DIR}/SquareInAppPaymentsSDK.framework/setup"',
  "fi",
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
  'echo "[square-setup] verify OK"',
].join("\n");

function withSquareSetupBuildPhase(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const nativeTargets = project.hash.project.objects.PBXNativeTarget || {};
    const target = project.getFirstTarget().uuid;

    // Drop any prior Square setup phase so we always ship the latest script.
    for (const [phaseKey, p] of Object.entries(phases)) {
      if (
        !p ||
        typeof p !== "object" ||
        typeof p.name !== "string" ||
        !p.name.replace(/"/g, "").includes(PHASE_NAME)
      ) {
        continue;
      }
      const uuid = phaseKey.replace(/_comment$/, "");
      delete phases[phaseKey];
      if (phases[`${uuid}_comment`]) delete phases[`${uuid}_comment`];
      for (const t of Object.values(nativeTargets)) {
        if (!t || !Array.isArray(t.buildPhases)) continue;
        t.buildPhases = t.buildPhases.filter(
          (ref) => ref && ref.value !== uuid,
        );
      }
    }

    project.addBuildPhase([], "PBXShellScriptBuildPhase", PHASE_NAME, target, {
      shellPath: "/bin/sh",
      shellScript,
    });

    return cfg;
  });
}

const reorderRuby = `
    # >>> ${REORDER_MARKER}
    # Append Square setup to [CP] Embed Pods Frameworks + move verify phase last.
    # See plugins/reorderSquareSetup.js. Prevents ITMS-90035/90205/90206.
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
