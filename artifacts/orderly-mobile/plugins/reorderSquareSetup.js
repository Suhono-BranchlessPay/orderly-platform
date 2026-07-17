/**
 * Move the "Square SDK setup" Run Script phase to the END of the app target's
 * buildPhases list in ios/*.xcodeproj/project.pbxproj.
 *
 * Why: CocoaPods appends "[CP] Embed Pods Frameworks" during `pod install`,
 * AFTER Expo prebuild has already added our Square setup phase. If setup runs
 * before Embed, it finds no frameworks ("already clean"), then Embed copies the
 * nested/unsigned Square frameworks into the .app — and App Store rejects with
 * ITMS-90035 / 90205 / 90206.
 *
 * Invoked from the Podfile post_install (see withSquareSetupScript.js) so it
 * always runs after CocoaPods has finished mutating the project.
 */
const fs = require("node:fs");
const path = require("node:path");

const PHASE_NEEDLE = "Square SDK setup";
const iosRoot = path.resolve(__dirname, "..", "ios");

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

function main() {
  const pbxPath = findPbxproj(iosRoot);
  if (!pbxPath) {
    console.log("[square-setup-reorder] no ios/*.xcodeproj found — skip");
    return;
  }

  let src = fs.readFileSync(pbxPath, "utf8");

  // Find the Square setup PBXShellScriptBuildPhase UUID by its name.
  // Example block:
  //   ABC123 /* Square SDK setup (un-nest frameworks) */ = {
  //     isa = PBXShellScriptBuildPhase;
  //     ...
  //     name = "Square SDK setup (un-nest frameworks)";
  const phaseRe =
    /([A-F0-9]{24})\s*\/\*\s*Square SDK setup[^*]*\*\/\s*=\s*\{[\s\S]*?isa\s*=\s*PBXShellScriptBuildPhase[\s\S]*?\n\t\t\};/g;
  const phaseMatch = phaseRe.exec(src);
  if (!phaseMatch) {
    // Fallback: hunt by name= line
    const nameRe =
      /([A-F0-9]{24})\s*\/\*[^*]*\*\/\s*=\s*\{[^}]*?name\s*=\s*"[^"]*Square SDK setup[^"]*"[\s\S]*?isa\s*=\s*PBXShellScriptBuildPhase[\s\S]*?\n\t\t\};/;
    // Simpler: just find UUID near the name string
    const simple = src.match(
      /([A-F0-9]{24})\s*\/\*\s*([^*]*Square SDK setup[^*]*)\*\//,
    );
    if (!simple) {
      console.log(
        "[square-setup-reorder] Square setup phase not found in pbxproj — skip",
      );
      return;
    }
    var phaseUuid = simple[1];
    var phaseComment = simple[2].trim();
  } else {
    var phaseUuid = phaseMatch[1];
    var phaseComment = PHASE_NEEDLE;
  }

  // Force the phase to always run (disable "Based on dependency analysis").
  // Insert alwaysOutOfDate = 1; into the phase block if missing.
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
    return open + b + close;
  });

  // Find PBXNativeTarget buildPhases lists that contain our phase and move it last.
  // Example:
  //   buildPhases = (
  //     AAA /* Sources */,
  //     BBB /* Frameworks */,
  //     CCC /* Square SDK setup ... */,
  //     DDD /* [CP] Embed Pods Frameworks */,
  //   );
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
    // Ensure trailing commas
    const ordered = [...rest, ...ours].map((l) =>
      l.endsWith(",") ? l : `${l},`,
    );
    moved += 1;
    const rebuilt = ordered.map((l) => `\t\t\t\t${l}`).join("\n");
    return `buildPhases = (\n${rebuilt}\n\t\t\t);`;
  });

  fs.writeFileSync(pbxPath, src, "utf8");
  console.log(
    `[square-setup-reorder] moved phase ${phaseUuid} (${phaseComment}) to end in ${moved} target(s); alwaysOutOfDate=1`,
  );
}

main();
