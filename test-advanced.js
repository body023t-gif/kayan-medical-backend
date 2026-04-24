/* eslint-disable no-console */
const axios = require("axios");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const sqlite3 = require("sqlite3").verbose();
const jwt = require("jsonwebtoken");

const PORT = 3011;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(os.tmpdir(), `kayan-advanced-${Date.now()}.sqlite`);
const BACKEND_ENTRY = path.join(__dirname, "src", "server.js");
const PAYMOB_PORT = 3998;
const PAYMOB_URL = `http://127.0.0.1:${PAYMOB_PORT}`;
const JWT_SECRET = "advanced_test_jwt_secret";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildClient(token) {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    validateStatus: () => true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

function openDb() {
  const db = new sqlite3.Database(DB_PATH);
  function run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        return resolve(this);
      });
    });
  }
  function get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        return resolve(row);
      });
    });
  }
  function close() {
    return new Promise((resolve, reject) => {
      db.close((err) => (err ? reject(err) : resolve()));
    });
  }
  return { run, get, close };
}

function createPaymobStub() {
  const state = {
    mode: "success", // success | fail
    requests: [],
  };
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/paymob/pay") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch (_error) {
        parsed = {};
      }
      state.requests.push(parsed);
      res.setHeader("Content-Type", "application/json");
      if (state.mode === "fail") {
        res.statusCode = 200;
        res.end(JSON.stringify({ success: false, status: "failed", echo: parsed }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, status: "success", echo: parsed }));
    });
  });

  return {
    state,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(PAYMOB_PORT, "127.0.0.1", resolve);
      });
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function spawnBackend() {
  const child = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      DB_PATH,
      JWT_SECRET,
      PAYMOB_BASE_URL: PAYMOB_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.stdout.write(String(d)));
  child.stderr.on("data", (d) => process.stderr.write(String(d)));
  return child;
}

async function waitForHealthy(timeoutMs = 20000) {
  const start = Date.now();
  const client = buildClient();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await client.get("/");
      if (res.status === 200 && res.data && res.data.status === "ok") return true;
    } catch (_error) {
      // ignore while bootstrapping
    }
    await sleep(400);
  }
  return false;
}

async function stopBackend(child) {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
  await sleep(500);
  if (child.exitCode == null) child.kill("SIGKILL");
}

function printTestResult(name, ok, details) {
  console.log(`[${name}]`);
  console.log(`Status: ${ok ? "PASS" : "FAIL"}`);
  console.log(`Details: ${details}`);
  console.log("");
}

async function seedUsersAndTokens() {
  const db = openDb();
  try {
    const userA = await db.run("INSERT INTO users (phone, firebase_uid, name) VALUES (?, ?, ?)", [
      "+966500001111",
      "advanced-user-a",
      "Advanced User A",
    ]);
    const userB = await db.run("INSERT INTO users (phone, firebase_uid, name) VALUES (?, ?, ?)", [
      "+966500002222",
      "advanced-user-b",
      "Advanced User B",
    ]);

    const tokenA = jwt.sign({ sub: String(userA.lastID), phone: "+966500001111" }, JWT_SECRET, { expiresIn: "7d" });
    const tokenB = jwt.sign({ sub: String(userB.lastID), phone: "+966500002222" }, JWT_SECRET, { expiresIn: "7d" });
    const expiredToken = jwt.sign(
      { sub: String(userA.lastID), phone: "+966500001111", exp: Math.floor(Date.now() / 1000) - 60 },
      JWT_SECRET
    );

    return {
      userAId: userA.lastID,
      userBId: userB.lastID,
      tokenA,
      tokenB,
      expiredToken,
    };
  } finally {
    await db.close();
  }
}

async function main() {
  const results = [];
  let backend = null;
  let paymobStub = null;

  const record = (name, ok, details) => {
    results.push({ name, ok, details });
    printTestResult(name, ok, details);
  };

  try {
    paymobStub = createPaymobStub();
    await paymobStub.listen();
    backend = spawnBackend();
    const healthy = await waitForHealthy();
    if (!healthy) throw new Error("Backend failed to become healthy in time.");

    const { userAId, userBId, tokenA, tokenB, expiredToken } = await seedUsersAndTokens();
    const clientA = buildClient(tokenA);
    const clientB = buildClient(tokenB);
    const anon = buildClient();

    const productsRes = await anon.get("/products");
    const productId = productsRes.data && productsRes.data.products && productsRes.data.products[0] && productsRes.data.products[0].id;
    if (!productId) throw new Error("Failed to obtain seeded product id.");

    // TEST GROUP 1 — RACE CONDITIONS
    {
      const orderRes = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Race Street",
        items: [{ product_id: productId, quantity: 1 }],
      });
      const orderId = orderRes.data.id;
      const parallel = await Promise.all(
        Array.from({ length: 5 }).map(() => clientA.post("/payments/pay", { order_id: orderId, method: "card" }))
      );
      const statuses = parallel.map((r) => r.status);
      const successCount = parallel.filter((r) => r.status === 200 && r.data && r.data.success === true).length;
      const allowedFailures = parallel.every((r) => successCount > 0 && (r.status === 200 || r.status === 400 || r.status === 429));
      const orderAfter = await clientA.get(`/orders/${orderId}`);
      const ok = successCount === 1 && allowedFailures && orderAfter.data.status === "paid";
      record(
        "Payment double-click race (parallel x5)",
        ok,
        ok
          ? `single success enforced; statuses=${JSON.stringify(statuses)}; final_status=${orderAfter.data.status}`
          : `unexpected race outcome; statuses=${JSON.stringify(statuses)}; final_status=${orderAfter.data.status}`
      );
    }

    {
      const orders = await Promise.all(
        Array.from({ length: 10 }).map((_, i) =>
          clientA.post("/orders", {
            city: "Riyadh",
            details: `Flood ${i}`,
            items: [{ product_id: productId, quantity: 1 }],
          })
        )
      );
      const ids = orders.filter((r) => r.status === 201).map((r) => r.data.id);
      const unique = new Set(ids);
      const ok = ids.length === 10 && unique.size === 10;
      record(
        "Order creation flood (parallel x10)",
        ok,
        ok ? `10 unique orders created (${JSON.stringify(ids)})` : `duplicate/missing ids detected (${JSON.stringify(ids)})`
      );
    }

    // TEST GROUP 2 — PAYMENT INTEGRITY
    {
      const orderRes = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Integrity Street",
        items: [{ product_id: productId, quantity: 2 }],
      });
      const orderId = orderRes.data.id;
      const expectedTotal = Number(orderRes.data.total_price);
      paymobStub.state.requests.length = 0;
      const payRes = await clientA.post("/payments/pay", {
        order_id: orderId,
        method: "card",
        amount: 1,
      });
      const lastRequest = paymobStub.state.requests[paymobStub.state.requests.length - 1];
      const sentAmount = lastRequest && lastRequest.amount;
      const ok = payRes.status === 200 && sentAmount === expectedTotal;
      record(
        "Manipulated amount ignored",
        ok,
        ok
          ? `client_amount=1 ignored; upstream_amount=${sentAmount}; expected=${expectedTotal}`
          : `integrity mismatch; upstream_amount=${sentAmount}; expected=${expectedTotal}; status=${payRes.status}`
      );
    }

    {
      const payRes = await clientA.post("/payments/pay", { order_id: 9999999, method: "card" });
      const ok = payRes.status === 404;
      record(
        "Invalid order payment",
        ok,
        ok ? "nonexistent order correctly rejected with 404" : `expected 404, got ${payRes.status}, body=${JSON.stringify(payRes.data)}`
      );
    }

    // TEST GROUP 3 — JWT SECURITY
    {
      const tampered = `${tokenA.slice(0, -1)}${tokenA.slice(-1) === "a" ? "b" : "a"}`;
      const tamperedRes = await buildClient(tampered).get("/orders/user");
      const ok = tamperedRes.status === 401;
      record(
        "Tampered token rejected",
        ok,
        ok ? "tampered JWT rejected with 401" : `expected 401, got ${tamperedRes.status}, body=${JSON.stringify(tamperedRes.data)}`
      );
    }

    {
      const expiredRes = await buildClient(expiredToken).get("/orders/user");
      const ok = expiredRes.status === 401;
      record(
        "Expired token rejected",
        ok,
        ok ? "expired JWT rejected with 401" : `expected 401, got ${expiredRes.status}, body=${JSON.stringify(expiredRes.data)}`
      );
    }

    {
      const noAuthRes = await anon.get("/orders/user");
      const ok = noAuthRes.status === 401;
      record(
        "Missing token rejected",
        ok,
        ok ? "missing Authorization header rejected with 401" : `expected 401, got ${noAuthRes.status}, body=${JSON.stringify(noAuthRes.data)}`
      );
    }

    // TEST GROUP 4 — DATA CONSISTENCY
    {
      const db = openDb();
      try {
        const orderRes = await clientA.post("/orders", {
          city: "Riyadh",
          details: "Snapshot Street",
          items: [{ product_id: productId, quantity: 1 }],
        });
        const orderId = orderRes.data.id;
        const totalBefore = Number(orderRes.data.total_price);
        await db.run("UPDATE products SET price = price + 999 WHERE id = ?", [productId]);
        const fetched = await clientA.get(`/orders/${orderId}`);
        const totalAfter = Number(fetched.data.total_price);
        const ok = totalAfter === totalBefore;
        record(
          "Order price snapshot immutability",
          ok,
          ok ? `order total stayed ${totalAfter} after product price change` : `total changed from ${totalBefore} to ${totalAfter}`
        );
      } finally {
        await db.close();
      }
    }

    // TEST GROUP 5 — VALIDATION HARDENING
    {
      const badQuantity = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Bad quantity",
        items: [{ product_id: productId, quantity: -1 }],
      });
      const badProduct = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Bad product",
        items: [{ product_id: "invalid", quantity: 1 }],
      });
      const badRating = await clientA.post("/reviews", {
        product_id: productId,
        rating: 6,
        comment: "bad",
      });
      const emptySearch = await anon.get("/products?search=");
      const pageNegative = await anon.get("/products?page=-5");
      const limitLarge = await anon.get("/products?limit=1000");

      const statusSafe =
        badQuantity.status === 400 &&
        badProduct.status === 400 &&
        badRating.status === 400 &&
        emptySearch.status === 200 &&
        pageNegative.status === 200 &&
        limitLarge.status === 200 &&
        pageNegative.data &&
        pageNegative.data.pagination &&
        pageNegative.data.pagination.page === 1 &&
        limitLarge.data &&
        limitLarge.data.pagination &&
        limitLarge.data.pagination.limit === 50;

      record(
        "Validation hardening",
        statusSafe,
        statusSafe
          ? "invalid payloads returned 400; pagination safely normalized (page=1, limit=50 cap)"
          : `unexpected statuses q=${badQuantity.status} p=${badProduct.status} r=${badRating.status} es=${emptySearch.status} pg=${pageNegative.status} lm=${limitLarge.status}`
      );
    }

    // TEST GROUP 6 — AUTHORIZATION ATTACKS
    {
      const orderForB = await clientB.post("/orders", {
        city: "Riyadh",
        details: "B owns this",
        items: [{ product_id: productId, quantity: 1 }],
      });
      const orderBId = orderForB.data.id;
      paymobStub.state.mode = "success";
      await clientB.post("/payments/pay", { order_id: orderBId, method: "card" });

      const readByA = await clientA.get(`/orders/${orderBId}`);
      const refundByA = await clientA.post("/refunds", { order_id: orderBId, reason: "steal" });

      await clientB.post("/address", { city: "Dammam", details: "B Address" });
      await clientA.put("/address", { city: "Riyadh", details: "A Address" });
      const addrB = await clientB.get("/address");
      const addrA = await clientA.get("/address");

      const ok =
        (readByA.status === 404 || readByA.status === 403) &&
        (refundByA.status === 404 || refundByA.status === 403) &&
        addrB.status === 200 &&
        addrA.status === 200 &&
        addrB.data.address &&
        (!addrA.data.address || addrB.data.address.details !== addrA.data.address.details);

      record(
        "Authorization attacks (A vs B)",
        ok,
        ok
          ? `order_access=${readByA.status}, refund=${refundByA.status}, addresses isolated`
          : `unexpected authz behavior: order_access=${readByA.status}, refund=${refundByA.status}, addrB=${JSON.stringify(
              addrB.data
            )}, addrA=${JSON.stringify(addrA.data)}`
      );
    }

    // TEST GROUP 8 — IDEMPOTENCY
    {
      const orderRes = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Idempotency",
        items: [{ product_id: productId, quantity: 1 }],
      });
      const orderId = orderRes.data.id;
      paymobStub.state.mode = "success";
      const p1 = await clientA.post("/payments/pay", { order_id: orderId, method: "card" });
      const p2 = await clientA.post("/payments/pay", { order_id: orderId, method: "card" });
      const p3 = await clientA.post("/payments/pay", { order_id: orderId, method: "card" });
      const finalOrder = await clientA.get(`/orders/${orderId}`);

      const ok =
        p1.status === 200 &&
        p1.data &&
        p1.data.success === true &&
        (p2.status === 400 || p2.status === 429) &&
        (p3.status === 400 || p3.status === 429) &&
        finalOrder.data.status === "paid";

      record(
        "Payment idempotency (sequential repeats)",
        ok,
        ok
          ? `first=${p1.status}, second=${p2.status}, third=${p3.status}, final=${finalOrder.data.status}`
          : `unexpected idempotency result: first=${p1.status}, second=${p2.status}, third=${p3.status}, final=${finalOrder.data.status}`
      );
    }

    // TEST GROUP 7 — RATE LIMIT STABILITY
    {
      const burst = await Promise.all(Array.from({ length: 100 }).map(() => clientA.get("/orders/user")));
      const ok200 = burst.filter((r) => r.status === 200).length;
      const ok429 = burst.filter((r) => r.status === 429).length;
      const ok = ok200 > 0 && ok429 > 0;
      record(
        "Rate limit stability (100 rapid requests)",
        ok,
        ok ? `balanced throttling observed: 200=${ok200}, 429=${ok429}` : `unexpected throttling distribution: 200=${ok200}, 429=${ok429}`
      );
    }
  } catch (error) {
    record("Fatal execution", false, error.message);
  } finally {
    const totalPassed = results.filter((r) => r.ok).length;
    const totalFailed = results.length - totalPassed;
    const criticalIssues = results.filter((r) => !r.ok).map((r) => `- ${r.name}: ${r.details}`);
    const score = results.length > 0 ? Math.max(0, Math.round((totalPassed / results.length) * 100)) : 0;

    console.log("===== FINAL RESULT =====");
    console.log(`Total Passed: ${totalPassed}`);
    console.log(`Total Failed: ${totalFailed}`);
    console.log("Critical Issues:");
    if (criticalIssues.length === 0) {
      console.log("- None");
    } else {
      for (const issue of criticalIssues) console.log(issue);
    }
    console.log(`Production Readiness Score: ${score}%`);

    if (paymobStub) await paymobStub.close();
    await stopBackend(backend);
    try {
      fs.unlinkSync(DB_PATH);
    } catch (_error) {
      // ignore
    }

    process.exitCode = totalFailed > 0 ? 1 : 0;
  }
}

main();
