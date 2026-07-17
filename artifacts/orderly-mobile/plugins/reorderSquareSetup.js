/**
 * After `pod install`, patch ios/*.xcodeproj/project.pbxproj so Square SDK
 * frameworks are cleaned BEFORE the archive is sealed.
 *
 * Why a plain phase-order move is NOT enough:
 *   Xcode's New Build System may run Run Script phases with no input/output
 *   files out of list-order ("ambiguous dependencies"). Build 5 proved this:
 *   we moved the phase to the end of buildPhases, yet it still ran before
 *   frameworks were embedded → "not embedded yet".
 *
 * Fix (belt + suspenders):
 *   1) APPEND the Square setup invocation to the END of the
 *      "[CP] Embed Pods Frameworks" shell script (runs in the same phase that
 *      just copied the frameworks — guaranteed ordering).
 *   2) Keep a separate verification phase (fail-loud if still dirty) at the
 *      end of the app target, with an inputPath so the New Build System
 *      schedules it after the framework binary exists.
 */
const fs = require("node:fs");
const path = require("node:path");

const iosRoot = path.resolve(__dirname, "..", "ios");

const APPEND_LINES = [
  "",
  "# >>> square-setup-embed (Orderly) — must stay at end of this phase",
  'FW_DIR="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}"',
  'echo "[square-setup] post-embed FW_DIR=${FW_DIR}"',
  'if [ -f "${FW_DIR}/SquareInAppPaymentsSDK.framework/setup" ]; then',
  '  echo "[square-setup] running SquareInAppPaymentsSDK.framework/setup"',
  '  "${FW_DIR}/SquareInAppPaymentsSDK.framework/setup"',
  "fi",
  "for FW in SquareInAppPaymentsSDK SquareBuyerVerificationSDK; do",
  '  BASE="${FW_DIR}/${FW}.framework"',
  '  [ -d "$BASE" ] || continue',
  '  if [ -d "${BASE}/Frameworks" ] || [ -f "${BASE}/setup" ]; then',
  '    echo "error: [square-setup] ${FW}.framework still dirty after setup"',
  '    ls -la "$BASE" || true',
  "    exit 1",
  "  fi",
  "done",
  'echo "[square-setup] post-embed OK"',
  "# <<< square-setup-embed",
  "",
].join("\n");

function findPbxproj(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && ent.name.endsWith(".xcodeproj")) {
      const p = path.join(dir, ent.name, "project.pbxproj");
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function unescapePbx(s) {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function escapePbx(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function main() {
  const pbxPath = findPbxproj(iosRoot);
  if (!pbxPath) {
    console.log("[square-setup-reorder] no ios/*.xcodeproj found — skip");
    return;
  }

  let src = fs.readFileSync(pbxPath, "utf8");

  // ---- 1) Append Square setup to [CP] Embed Pods Frameworks ----
  const embedUuidMatch = src.match(
    /([A-F0-9]{24})\s*\/\*\s*\[CP\] Embed Pods Frameworks\s*\*\//,
  );
  if (!embedUuidMatch) {
    console.log(
      "[square-setup-reorder] WARN: [CP] Embed Pods Frameworks phase not found",
    );
  } else {
    const embedUuid = embedUuidMatch[1];
    const embedBlockRe = new RegExp(
      `(${embedUuid}\\s*/\\*\\s*\\[CP\\] Embed Pods Frameworks\\s*\\*/\\s*=\\s*\\{[\\s\\S]*?shellScript\\s*=\\s*")([\\s\\S]*?)("\\s*;)`,
    );
    const m = src.match(embedBlockRe);
    if (!m) {
      console.log(
        "[square-setup-reorder] WARN: could not parse Embed Pods Frameworks shellScript",
      );
    } else if (m[2].includes("square-setup-embed")) {
      console.log(
        "[square-setup-reorder] Embed Pods Frameworks already has square-setup-embed",
      );
    } else {
      const current = unescapePbx(m[2]);
      const newBody = current.replace(/\s*$/, "") + "\n" + APPEND_LINES;
      src = src.replace(embedBlockRe, `$1${escapePbx(newBody)}$3`);
      console.log(
        "[square-setup-reorder] appended square-setup-embed to [CP] Embed Pods Frameworks",
      );
    }
  }

  // ---- 2) Move verification phase last + alwaysOutOfDate + inputPaths ----
  const simple = src.match(
    /([A-F0-9]{24})\s*\/\*\s*([^*]*Square SDK setup[^*]*)\*\//,
  );
  if (!simple) {
    console.log(
      "[square-setup-reorder] Square verification phase not found — skip move",
    );
  } else {
    const phaseUuid = simple[1];
    const phaseComment = simple[2].trim();

    const phaseBlockRe = new RegExp(
      `(${phaseUuid}\\s*/\\*[^*]*\\*/\\s*=\\s*\\{)([\\s\\S]*?)(\\n\\t\\t\\};)`,
    );
    src = src.replace(phaseBlockRe, (full, open, body, close) => {
      let b = body;
      if (!/alwaysOutOfDate\s*=/.test(b)) {
        b = b.replace(
          /(isa\s*=\s*PBXShellScriptBuildPhase;)/,
          "$1\n\t\t\talwaysOutOfDate = 1;",
        );
      }
      if (!/inputPaths\s*=/.test(b)) {
        b = b.replace(
          /(isa\s*=\s*PBXShellScriptBuildPhase;)/,
          `$1\n\t\t\tinputPaths = (\n\t\t\t\t"\${BUILT_PRODUCTS_DIR}/\${FRAMEWORKS_FOLDER_PATH}/SquareInAppPaymentsSDK.framework/SquareInAppPaymentsSDK",\n\t\t\t);`,
        );
      }
      return open + b + close;
    });

    const buildPhasesRe = /buildPhases\s*=\s*\(\s*([\s\S]*?)\s*\);/g;
    let moved = 0;
    src = src.replace(buildPhasesRe, (full, inner) => {
      if (!inner.includes(phaseUuid)) return full;
      const lines = inner
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const ours = lines.filter((l) => l.includes(phaseUuid));
      const rest = lines.filter((l) => !l.includes(phaseUuid));
      if (ours.length === 0) return full;
      const ordered = [...rest, ...ours].map((l) =>
        l.endsWith(",") ? l : `${l},`,
      );
      moved += 1;
      const rebuilt = ordered.map((l) => `\t\t\t\t${l}`).join("\n");
      return `buildPhases = (\n${rebuilt}\n\t\t\t);`;
    });
    console.log(
      `[square-setup-reorder] verification phase ${phaseUuid} (${phaseComment}) → end in ${moved} target(s)`,
    );
  }

  fs.writeFileSync(pbxPath, src, "utf8");
  console.log("[square-setup-reorder] wrote", pbxPath);
}

main();
