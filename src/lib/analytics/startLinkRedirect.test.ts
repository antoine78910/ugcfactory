import assert from "node:assert/strict";
import test from "node:test";

import { marketingStartRedirectUrl } from "./startLinkRedirect";

test("marketingStartRedirectUrl adds default Instagram UTMs", () => {
  const url = new URL(marketingStartRedirectUrl(new URLSearchParams()));
  assert.equal(url.searchParams.get("utm_source"), "instagram");
  assert.equal(url.searchParams.get("utm_medium"), "social");
});

test("marketingStartRedirectUrl lets incoming UTMs override defaults", () => {
  const url = new URL(
    marketingStartRedirectUrl(new URLSearchParams("utm_source=tiktok&utm_campaign=test")),
  );
  assert.equal(url.searchParams.get("utm_source"), "tiktok");
  assert.equal(url.searchParams.get("utm_medium"), "social");
  assert.equal(url.searchParams.get("utm_campaign"), "test");
});
