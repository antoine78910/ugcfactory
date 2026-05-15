import assert from "node:assert/strict";
import test from "node:test";

import { computeAngleMix, type ClassifiedCompetitorAd } from "@/lib/marketAngleMix";

function ad(partial: Partial<ClassifiedCompetitorAd> & { id: string; angle: string }): ClassifiedCompetitorAd {
  return {
    id: partial.id,
    angle: partial.angle,
    confidence: partial.confidence ?? 0.9,
    copy: partial.copy ?? "test",
    headline: partial.headline ?? "test",
    body: partial.body ?? "",
    reach: partial.reach ?? 100,
    platform: "meta",
    format: "video",
  };
}

test("computeAngleMix ranks by reach share and flags gaps", () => {
  const classified = [
    ad({ id: "1", angle: "gut-friendly", reach: 500 }),
    ad({ id: "2", angle: "gut-friendly", reach: 200 }),
    ad({ id: "3", angle: "mushroom-dosage", reach: 100 }),
  ];
  const result = computeAngleMix(classified, ["Made in France"]);
  const gut = result.mix.find((r) => r.angle === "gut-friendly");
  assert.ok(gut);
  assert.equal(gut!.isGap, true);
  assert.ok(gut!.reachShare >= 50);
  const france = result.mix.find((r) => r.angle === "made-in-france");
  assert.ok(france?.isOwned);
});
