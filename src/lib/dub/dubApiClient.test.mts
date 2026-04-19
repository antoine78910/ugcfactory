import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

type CapturedRequest = {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
};

async function withJsonServer(
  handler: (url: URL, body: unknown) => { status?: number; body?: unknown },
  run: (baseUrl: string, captured: CapturedRequest[]) => Promise<void>,
) {
  const captured: CapturedRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : null;
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    captured.push({
      method: req.method ?? "",
      url: url.pathname,
      authorization: req.headers.authorization,
      body,
    });

    const response = handler(url, body);
    res.statusCode = response.status ?? 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(response.body ?? { ok: true }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to bind test server");
  }

  try {
    await run(`http://127.0.0.1:${address.port}`, captured);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("postDubTrackLead posts bearer auth and JSON payload", async () => {
  let mod: typeof import("./dubApiClient.ts");
  try {
    mod = await import("./dubApiClient.ts");
  } catch (error) {
    assert.fail(`dubApiClient module missing: ${error instanceof Error ? error.message : String(error)}`);
  }

  await withJsonServer(
    () => ({
      body: {
        click: { id: "clk_123" },
        link: null,
        customer: { name: "Test", email: "test@example.com", avatar: null, externalId: "user_123" },
      },
    }),
    async (baseUrl, captured) => {
      const response = await mod.postDubTrackLead(
        {
          clickId: "clk_123",
          eventName: "Sign Up",
          customerExternalId: "user_123",
          customerEmail: "test@example.com",
          mode: "wait",
        },
        { token: "dub_test_token", baseUrl },
      );

      assert.equal(response.click.id, "clk_123");
      assert.equal(captured.length, 1);
      assert.deepEqual(captured[0], {
        method: "POST",
        url: "/track/lead",
        authorization: "Bearer dub_test_token",
        body: {
          clickId: "clk_123",
          eventName: "Sign Up",
          customerExternalId: "user_123",
          customerEmail: "test@example.com",
          mode: "wait",
        },
      });
    },
  );
});

test("postDubTrackSale posts to the sale endpoint", async () => {
  let mod: typeof import("./dubApiClient.ts");
  try {
    mod = await import("./dubApiClient.ts");
  } catch (error) {
    assert.fail(`dubApiClient module missing: ${error instanceof Error ? error.message : String(error)}`);
  }

  await withJsonServer(
    () => ({
      body: {
        eventName: "Purchase",
        customer: { id: "cus_123", name: "Test", email: "test@example.com", avatar: null, externalId: "user_123" },
        sale: { amount: 4900, currency: "usd", paymentProcessor: "stripe", invoiceId: "in_123", metadata: null },
      },
    }),
    async (baseUrl, captured) => {
      const response = await mod.postDubTrackSale(
        {
          customerExternalId: "user_123",
          amount: 4900,
          currency: "usd",
          eventName: "Purchase",
          paymentProcessor: "stripe",
          leadEventName: "Sign Up",
          invoiceId: "in_123",
        },
        { token: "dub_test_token", baseUrl },
      );

      assert.equal(response.eventName, "Purchase");
      assert.equal(captured.length, 1);
      assert.deepEqual(captured[0], {
        method: "POST",
        url: "/track/sale",
        authorization: "Bearer dub_test_token",
        body: {
          customerExternalId: "user_123",
          amount: 4900,
          currency: "usd",
          eventName: "Purchase",
          paymentProcessor: "stripe",
          leadEventName: "Sign Up",
          invoiceId: "in_123",
        },
      });
    },
  );
});
