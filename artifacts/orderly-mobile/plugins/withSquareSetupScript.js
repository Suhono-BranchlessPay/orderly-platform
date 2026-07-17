// Import via `expo/config-plugins` (re-export) so it resolves reliably under
// pnpm, where the transitive `@expo/config-plugins` may not be hoisted.
const { withXcodeProject, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Square In-App Payments SDK → App Store ITMS-90035 / 90205 / 90206.
 *
 * Root cause (confirmed via build 4 Xcode log phase order):
 *   … → Copy Pods Resources
 *     → [CP] Square In-App Payments SDK Setup   (too early)
 *     → Square SDK setup (our phase)            (too early — "already clean")
 *     → [CP] Embed Pods Frameworks              ← frameworks land HERE
 *
 * CocoaPods adds "[CP] Embed Pods Frameworks" during *integrate*, which runs
 * AFTER `post_install`. So a post_install reorder can never place us after
 * Embed (build 8: "Embed Pods Frameworks phase not found" at post_install).
 *
 * Fix: run plugins/reorderSquareSetup.js from Podfile `post_integrate`
 * (after Embed exists) so our phase is moved to the absolute end.
 */
const PHASE_NAME = "Square SDK setup (un-nest frameworks)";
const REORDER_MARKER = "square-setup-reorder";

const shellScript = [
  "# Auto-added by plugins/withSquareSetupScript.js",
  "# Must run AFTER [CP] Embed Pods Frameworks (moved via post_integrate).",
  "set -e",
  'FW_DIR="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}"',
  'echo "[square-setup] FW_DIR=${FW_DIR}"',
  'SETUP="${FW_DIR}/SquareInAppPaymentsSDK.framework/setup"',
  'if [ ! -f "$SETUP" ]; then',
  '  echo "error: [square-setup] setup not found — phase still before Embed Pods Frameworks?"',
  '  ls -la "${FW_DIR}" 2>/dev/null || true',
  "  exit 1",
  "fi",
  'echo "[square-setup] running setup"',
  '"$SETUP"',
  "DIRTY=0",
  "for FW in SquareInAppPaymentsSDK SquareBuyerVerificationSDK; do",
  '  BASE="${FW_DIR}/${FW}.framework"',
  '  [ -d "$BASE" ] || continue',
  '  if [ -d "${BASE}/Frameworks" ]; then',
  '    echo "error: [square-setup] ${FW}.framework still has nested Frameworks/"',
  "    DIRTY=1",
  "  fi",
  '  if [ -f "${BASE}/setup" ]; then',
  '    echo "error: [square-setup] ${FW}.framework/setup still present"',
  "    DIRTY=1",
  "  fi",
  "done",
  'if [ "$DIRTY" -ne 0 ]; then exit 1; fi',
  'echo "[square-setup] OK"',
].join("\n");

function withSquareSetupBuildPhase(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const nativeTargets = project.hash.project.objects.PBXNativeTarget || {};
    const target = project.getFirstTarget().uuid;

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

// post_integrate (NOT post_install): Embed Pods Frameworks already exists.
const integrateRuby = `
# >>> ${REORDER_MARKER}
post_integrate do |installer|
  reorder_script = File.expand_path('../plugins/reorderSquareSetup.js', __dir__)
  if File.exist?(reorder_script)
    system('node', reorder_script) or raise '[square-setup-reorder] post_integrate failed'
  else
    Pod::UI.warn "[square-setup-reorder] missing #{reorder_script}"
  end
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

      // Strip any prior injection (post_install or post_integrate form).
      contents = contents.replace(
        new RegExp(
          `# >>> ${REORDER_MARKER}[\\s\\S]*?# <<< ${REORDER_MARKER}\\n?`,
        ),
        "",
      );
      // Also strip old post_install-only injection without markers if present.
      contents = contents.replace(
        /\n\s*# >>> square-setup-reorder[\s\S]*?# <<< square-setup-reorder\n?/,
        "\n",
      );

      contents = contents.replace(/\s*$/, "\n") + integrateRuby;
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
