/**
 * Called from Podfile `post_integrate` (AFTER CocoaPods adds
 * "[CP] Embed Pods Frameworks" to the app target).
 *
 * Moves our "Square SDK setup" Run Script to the absolute end of the app
 * target's buildPhases so it runs AFTER Embed copies Square frameworks into
 * the .app (where their `setup` helper lives).
 *
 * Build 4 phase order proved the bug:
 *   Square setup → then Embed Pods Frameworks  (setup too early)
 * Build 8 proved post_install is too soon:
 *   "Embed Pods Frameworks phase not found" during post_install
 */
const fs = require("node:fs");
const path = require("node:path");

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
    console.log("[square-setup-reorder] ERROR: no ios/*.xcodeproj");
    process.exit(1);
  }

  let src = fs.readFileSync(pbxPath, "utf8");

  const hasEmbed = /\[CP\] Embed Pods Frameworks/.test(src);
  console.log(
    "[square-setup-reorder] [CP] Embed Pods Frameworks present:",
    hasEmbed,
  );
  if (!hasEmbed) {
    console.log(
      "[square-setup-reorder] ERROR: Embed phase missing — post_integrate timing wrong?",
    );
    process.exit(1);
  }

  const simple = src.match(
    /([A-F0-9]{24})\s*\/\*\s*([^*]*Square SDK setup[^*]*)\*\//,
  );
  if (!simple) {
    console.log(
      "[square-setup-reorder] ERROR: our Square SDK setup phase not found",
    );
    process.exit(1);
  }
  const phaseUuid = simple[1];
  const phaseComment = simple[2].trim();

  // Move our phase to the end of every buildPhases list that contains it.
  const buildPhasesRe = /buildPhases\s*=\s*\(\s*([\s\S]*?)\s*\);/g;
  let moved = 0;
  let embedAfterUs = false;
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
    // Verify Embed is before us in the new order
    const idxEmbed = ordered.findIndex((l) =>
      l.includes("Embed Pods Frameworks"),
    );
    const idxOurs = ordered.findIndex((l) => l.includes(phaseUuid));
    if (idxEmbed >= 0 && idxOurs >= 0 && idxEmbed < idxOurs) {
      embedAfterUs = false; // Embed is before us — good
    } else if (idxEmbed >= 0 && idxOurs >= 0 && idxEmbed > idxOurs) {
      embedAfterUs = true; // bad
    }
    const rebuilt = ordered.map((l) => `\t\t\t\t${l}`).join("\n");
    // Log final order of shell-ish phases for this target
    console.log(
      "[square-setup-reorder] buildPhases tail:",
      ordered
        .slice(-6)
        .map((l) => l.replace(/,/g, "").replace(/.*\*\/\s*/, "").trim())
        .join(" → "),
    );
    return `buildPhases = (\n${rebuilt}\n\t\t\t);`;
  });

  if (embedAfterUs) {
    console.log(
      "[square-setup-reorder] ERROR: Embed still after our phase after move",
    );
    process.exit(1);
  }

  fs.writeFileSync(pbxPath, src, "utf8");
  console.log(
    `[square-setup-reorder] moved ${phaseUuid} (${phaseComment}) to end in ${moved} target(s); Embed is before us`,
  );
  console.log("[square-setup-reorder] wrote", pbxPath);
}

main();
