import fs from "node:fs";
import path from "node:path";

const EM = "\u2014";
const PLACEHOLDER = "-"; // empty table / missing label (was em dash)

function isTargetFile(name) {
  if (name.endsWith(".tsx") || name.endsWith(".mts") || name.endsWith(".html")) return true;
  if (name.endsWith(".ts") && !name.endsWith(".d.ts")) return true;
  return false;
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (isTargetFile(ent.name)) out.push(p);
  }
}

const roots = [
  path.join(process.cwd(), "src"),
  path.join(process.cwd(), "supabase", "templates"),
  path.join(process.cwd(), "supabase", "functions"),
];

const files = [];
for (const r of roots) {
  if (fs.existsSync(r)) walk(r, files);
}

let touched = 0;
for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  const orig = s;
  // Typical clause break: space + em dash + space → comma + space
  s = s.split(` ${EM} `).join(", ");
  // Empty / missing UI cells (keep ASCII hyphen, not comma)
  s = s.split(`"${EM}"`).join(`"${PLACEHOLDER}"`);
  s = s.split(`'${EM}'`).join(`'${PLACEHOLDER}'`);
  s = s.split(`>${EM}<`).join(`>${PLACEHOLDER}<`);
  s = s.split(`>${EM}</`).join(`>${PLACEHOLDER}</`);
  s = s.split(`{${EM}}`).join(`{${PLACEHOLDER}}`);
  // Tight pairs like "idea" + em dash + "no" become "idea, no" (no spaces around the dash)
  s = s.replace(new RegExp(`([A-Za-z0-9)])${EM}([A-Za-z(])`, "g"), "$1, $2");
  if (s !== orig) {
    fs.writeFileSync(f, s, "utf8");
    touched++;
  }
}

console.log(`Updated ${touched} files (${files.length} scanned).`);
