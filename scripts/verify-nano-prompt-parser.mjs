// Smoke test for parseNanoEditableSections regex behavior.
// Reproduces the exact "## EDIT, Avatar/Scene/Scene (continued)/Shot:" output
// from a non-compliant model and asserts each section lands in the right bucket.

const sectionHeaderRe =
  /^\s*(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(?:EDIT\s*[—:,-]\s*)?(Avatar|Person|Scene|Shot|Product(?:\s*(?:&|and)\s*action)?)(?:\s*\([^)]*\))?\s*(?::\s*(.*))?\s*(?:\*{0,2})?\s*$/i;

const technicalOrStopRe =
  /^\s*(?:\*{0,2}\s*)?(?:TECHNICAL|NEGATIVE\s+PROMPT)\b|^\s*---+\s*$|^\s*(?:[#*]+\s*)?PROMPT\s*[123]\b/i;

const cleanupRe =
  /^\s*(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(?:EDIT\s*[—:,-]\s*)?(?:Avatar|Person|Scene|Shot|Product(?:\s*(?:&|and)\s*action)?)(?:\s*\([^)]*\))?\s*:?\s*(?:\*{0,2})?\s*$/gim;

const structuredTestRe =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(?:EDIT\s*[—:,-]\s*)?(?:Person|Avatar|Scene|Shot|Product(?:\s*(?:&|and)\s*action)?)\b/im;

function parse(raw) {
  if (!structuredTestRe.test(raw)) {
    return { person: raw.trim(), scene: "", product: "", structured: false };
  }
  const buckets = { person: [], scene: [], product: [] };
  let current = null;
  let saw = false;
  for (const line of raw.split("\n")) {
    if (technicalOrStopRe.test(line)) {
      current = null;
      continue;
    }
    const hm = line.match(sectionHeaderRe);
    if (hm) {
      saw = true;
      const label = String(hm[1] ?? "").toLowerCase();
      if (label === "avatar" || label === "person") current = "person";
      else if (label === "scene") current = "scene";
      else current = "product";
      const inline = String(hm[2] ?? "").trim();
      if (inline) buckets[current].push(inline);
      continue;
    }
    if (current) buckets[current].push(line);
  }
  if (!saw) return { person: raw.trim(), scene: "", product: "", structured: false };
  const cleanup = (t) => t.replace(cleanupRe, "").trim();
  return {
    person: cleanup(buckets.person.join("\n")),
    scene: cleanup(buckets.scene.join("\n")),
    product: cleanup(buckets.product.join("\n")),
    structured: true,
  };
}

const cases = [
  {
    name: "## EDIT headers + Scene (continued)",
    input: `## EDIT, Avatar:

Woman in her late twenties, East Asian descent.

## EDIT, Scene:

Bedroom interior, evening.

## EDIT, Scene (continued):

Atmosphere is calm and unhurried.

## EDIT, Shot:

Close-up, mirror selfie, vertical frame.`,
    expect: {
      personHas: "late twenties",
      sceneHas: ["Bedroom interior", "calm and unhurried"],
      productHas: "mirror selfie",
      personMustNotHave: ["Bedroom interior", "mirror selfie", "EDIT,"],
      sceneMustNotHave: ["mirror selfie", "EDIT,"],
      productMustNotHave: ["EDIT,"],
    },
  },
  {
    name: "Plain EDIT, Avatar (no markdown)",
    input: `EDIT, Avatar:
A persona.

EDIT, Scene:
A room.

EDIT, Shot:
A shot.`,
    expect: { personHas: "persona", sceneHas: "room", productHas: "shot" },
  },
  {
    name: "Bold **EDIT, Scene:**",
    input: `**EDIT, Avatar:**
P.

**EDIT, Scene:**
S.

**EDIT, Shot:**
T.`,
    expect: { personHas: "P", sceneHas: "S", productHas: "T" },
  },
  {
    name: "Unstructured blob",
    input: `Just a single paragraph about a thing happening.`,
    expect: { structured: false, personHas: "single paragraph" },
  },
];

let fail = 0;
for (const c of cases) {
  const out = parse(c.input);
  const e = c.expect;
  const checkContains = (label, actual, needle) => {
    const list = Array.isArray(needle) ? needle : [needle];
    for (const n of list) {
      if (!actual.includes(n)) {
        console.error(`FAIL [${c.name}] ${label} should contain "${n}" — got: ${JSON.stringify(actual)}`);
        fail++;
      }
    }
  };
  const checkExcludes = (label, actual, needle) => {
    const list = Array.isArray(needle) ? needle : [needle];
    for (const n of list) {
      if (actual.includes(n)) {
        console.error(`FAIL [${c.name}] ${label} must NOT contain "${n}" — got: ${JSON.stringify(actual)}`);
        fail++;
      }
    }
  };
  if (e.structured === false && out.structured !== false) {
    console.error(`FAIL [${c.name}] expected unstructured fallback, got structured=${out.structured}`);
    fail++;
  }
  if (e.personHas) checkContains("person", out.person, e.personHas);
  if (e.sceneHas) checkContains("scene", out.scene, e.sceneHas);
  if (e.productHas) checkContains("product", out.product, e.productHas);
  if (e.personMustNotHave) checkExcludes("person", out.person, e.personMustNotHave);
  if (e.sceneMustNotHave) checkExcludes("scene", out.scene, e.sceneMustNotHave);
  if (e.productMustNotHave) checkExcludes("product", out.product, e.productMustNotHave);
}

if (fail === 0) {
  console.log(`OK — all ${cases.length} parser cases pass.`);
  process.exit(0);
} else {
  console.error(`${fail} parser assertion(s) failed.`);
  process.exit(1);
}
