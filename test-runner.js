/* eslint-disable no-console */
const axios = require("axios");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SHOULD_MANAGE_BACKEND = String(process.env.MANAGE_BACKEND || "1") === "1";
const SAVE_REPORT = String(process.env.SAVE_REPORT || "1") === "1";

const BACKEND_PORT = Number(new URL(BASE_URL).port || 3000);
const BACKEND_ENTRY = path.join(__dirname, "src", "server.js");
const DB_PATH = path.join(__dirname, "data.sqlite");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function buildClient(token) {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    validateStatus: () => true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

function pass(label) {
  console.log(`[${label}] ✅ PASS`);
}

function fail(label, reason) {
  console.log(`[${label}] ❌ FAIL (${reason})`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function openDb() {
  const db = new sqlite3.Database(DB_PATH);
  function run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve(this);
      });
    });
  }
  function get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }
  function all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }
  function close() {
    return new Promise((resolve, reject) => {
      db.close((err) => (err ? reject(err) : resolve()));
    });
  }
  return { run, get, all, close };
}

async function waitForHealthy(timeoutMs = 20000) {
  const client = buildClient();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await client.get("/");
      if (res.status === 200 && res.data && res.data.status === "ok") return true;
    } catch {
      // ignore
    }
    await sleep(500);
  }
  return false;
}

function createPaymobStub({ port, mode }) {
  // mode: "success" | "fail"
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/paymob/pay") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        if (mode === "success") {
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, status: "success", echo: JSON.parse(body || "{}") }));
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ success: false, status: "failed", echo: JSON.parse(body || "{}") }));
      });
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve());
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

function spawnBackend({ paymobBaseUrl }) {
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    JWT_SECRET: process.env.JWT_SECRET || "test_jwt_secret_change_me",
    PAYMOB_BASE_URL: paymobBaseUrl,
    TEST_MODE: "1",
    // Required in non-test mode; in TEST_MODE we allow them to be empty/dummy.
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "test",
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || "test@example.com",
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n",
  };

  const child = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd: __dirname,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (d) => process.stdout.write(String(d)));
  child.stderr.on("data", (d) => process.stderr.write(String(d)));

  return child;
}

async function stopProcess(child) {
  if (!child) return;
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await sleep(500);
  if (child.exitCode == null) child.kill("SIGKILL");
}

async function ensureCouponsSeeded() {
  const db = openDb();
  try {
    const now = Date.now();
    const validExpiry = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
    const expiredExpiry = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    await db.run(
      `
      INSERT OR IGNORE INTO coupons (code, discount_percentage, min_order_amount, expires_at, max_usage, used_count)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      ["VALID10", 10, 0, validExpiry, 100, 0]
    );
    await db.run(
      `
      INSERT OR IGNORE INTO coupons (code, discount_percentage, min_order_amount, expires_at, max_usage, used_count)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      ["EXPIRED10", 10, 0, expiredExpiry, 100, 0]
    );
    await db.run(
      `
      INSERT OR IGNORE INTO coupons (code, discount_percentage, min_order_amount, expires_at, max_usage, used_count)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      ["MIN200", 10, 200, validExpiry, 100, 0]
    );
  } finally {
    await db.close();
  }
}

async function main() {
  const report = {
    started_at: nowIso(),
    base_url: BASE_URL,
    sections: [],
    totals: { passed: 0, failed: 0 },
  };

  const record = (name, ok, reason = null, details = null) => {
    report.sections.push({ name, ok, reason, details, at: nowIso() });
    if (ok) report.totals.passed += 1;
    else report.totals.failed += 1;
  };

  let backend = null;
  let paymobStub = null;
  let paymobBaseUrl = process.env.PAYMOB_BASE_URL || "http://127.0.0.1:3999";

  try {
    if (SHOULD_MANAGE_BACKEND) {
      // Start with SUCCESS mode stub
      paymobStub = createPaymobStub({ port: 3999, mode: "success" });
      await paymobStub.listen();
      paymobBaseUrl = "http://127.0.0.1:3999";
      backend = spawnBackend({ paymobBaseUrl });
      const healthy = await waitForHealthy();
      assert(healthy, "Backend did not become healthy on time. Is port in use?");
    } else {
      const healthy = await waitForHealthy();
      assert(healthy, "Backend not reachable at BASE_URL.");
    }

    await ensureCouponsSeeded();

    // 1) AUTH FLOW
    let tokenA;
    let tokenB;
    try {
      const client = buildClient();
      const resA = await client.post("/auth/firebase", { firebase_token: "TEST_USER_A" });
      assert(resA.status === 200, `expected 200, got ${resA.status}`);
      assert(resA.data && resA.data.token, "missing token for user A");
      tokenA = resA.data.token;

      const resB = await client.post("/auth/firebase", { firebase_token: "TEST_USER_B" });
      assert(resB.status === 200, `expected 200, got ${resB.status}`);
      assert(resB.data && resB.data.token, "missing token for user B");
      tokenB = resB.data.token;

      pass("AUTH");
      record("AUTH", true);
    } catch (e) {
      fail("AUTH", e.message);
      record("AUTH", false, e.message);
      throw new Error("Critical failure: AUTH");
    }

    const clientA = buildClient(tokenA);
    const clientB = buildClient(tokenB);

    // 2) PRODUCTS
    let firstProductId = null;
    try {
      const res = await buildClient().get("/products");
      assert(res.status === 200, `expected 200, got ${res.status}`);
      assert(res.data && res.data.currency === "SAR", "currency must be SAR");
      assert(Array.isArray(res.data.products), "products must be an array");
      assert(res.data.products.length > 0, "products array is empty (seed missing?)");
      firstProductId = res.data.products[0].id;
      assert(Number.isInteger(firstProductId) && firstProductId > 0, "invalid first product id");
      pass("PRODUCTS");
      record("PRODUCTS", true);
    } catch (e) {
      fail("PRODUCTS", e.message);
      record("PRODUCTS", false, e.message);
      throw new Error("Critical failure: PRODUCTS");
    }

    // 3) SEARCH + FILTER + PAGINATION
    try {
      const res = await buildClient().get("/products?search=cream&page=1&limit=5");
      assert(res.status === 200, `expected 200, got ${res.status}`);
      assert(res.data && res.data.pagination, "pagination missing");
      assert(Array.isArray(res.data.data), "data must be array");
      assert(res.data.data.length <= 5, "more than 5 items returned");

      const res2 = await buildClient().get("/products?category_id=1&min_price=1&max_price=1000&page=1&limit=10");
      assert(res2.status === 200, `expected 200, got ${res2.status}`);
      pass("SEARCH");
      record("SEARCH", true);
    } catch (e) {
      fail("SEARCH", e.message);
      record("SEARCH", false, e.message);
    }

    // 4) FAVORITES
    try {
      const add = await clientA.post("/favorites", { product_id: firstProductId });
      assert(add.status === 201 || add.status === 409, `expected 201/409, got ${add.status}`);

      const list = await clientA.get("/favorites");
      assert(list.status === 200, `expected 200, got ${list.status}`);
      assert(Array.isArray(list.data.favorites), "favorites must be array");
      const has = list.data.favorites.some((f) => f && f.product && f.product.id === firstProductId);
      assert(has, "favorite product not found in favorites list");

      const del = await clientA.delete(`/favorites/${firstProductId}`);
      assert(del.status === 200, `expected 200, got ${del.status}`);

      const list2 = await clientA.get("/favorites");
      const has2 = list2.data.favorites.some((f) => f && f.product && f.product.id === firstProductId);
      assert(!has2, "favorite still present after delete");

      pass("FAVORITES");
      record("FAVORITES", true);
    } catch (e) {
      fail("FAVORITES", e.message);
      record("FAVORITES", false, e.message);
    }

    // 5) ADDRESS
    try {
      const a1 = await clientA.post("/address", { city: "Riyadh", details: "Street 1" });
      assert(a1.status === 201, `expected 201, got ${a1.status}`);
      assert(a1.data && a1.data.id, "created address missing id");

      const a2 = await clientA.post("/address", { city: "Riyadh", details: "Street 2" });
      assert(a2.status === 201, `expected 201, got ${a2.status}`);

      const getOne = await clientA.get("/address");
      assert(getOne.status === 200, `expected 200, got ${getOne.status}`);
      assert(getOne.data && typeof getOne.data.address === "object", "address must be a single object");
      assert(getOne.data.address.details === "Street 2", "address was not overwritten");

      pass("ADDRESS");
      record("ADDRESS", true);
    } catch (e) {
      fail("ADDRESS", e.message);
      record("ADDRESS", false, e.message);
    }

    // 6) ORDER FLOW
    let orderIdPending = null;
    try {
      const create = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Street 2",
        items: [{ product_id: firstProductId, quantity: 1 }],
      });
      assert(create.status === 201, `expected 201, got ${create.status}`);
      assert(create.data && create.data.status === "pending", "order must start pending");
      orderIdPending = create.data.id;

      const history = await clientA.get("/orders/user?lang=en");
      assert(history.status === 200, `expected 200, got ${history.status}`);
      assert(Array.isArray(history.data.orders), "orders must be array");
      const found = history.data.orders.some((o) => o && o.id === orderIdPending);
      assert(found, "order not found in /orders/user");

      pass("ORDERS");
      record("ORDERS", true);
    } catch (e) {
      fail("ORDERS", e.message);
      record("ORDERS", false, e.message);
      throw new Error("Critical failure: ORDERS");
    }

    // 7) PAYMENT (CRITICAL)
    let orderIdPaid = null;
    let orderIdFailed = null;
    let orderIdNetwork = null;
    try {
      // A) SUCCESS (paymob stub success)
      const payOk = await clientA.post("/payments/pay", { order_id: orderIdPending, method: "card" });
      assert(payOk.status === 200, `expected 200, got ${payOk.status}`);
      assert(payOk.data && payOk.data.success === true, "expected success=true");
      const paid = await clientA.get(`/orders/${orderIdPending}`);
      assert(paid.status === 200, `expected 200, got ${paid.status}`);
      assert(paid.data.status === "paid", "order should be paid");
      orderIdPaid = orderIdPending;

      // B) FAIL (restart backend with fail stub)
      if (SHOULD_MANAGE_BACKEND) {
        await stopProcess(backend);
        backend = null;
        await paymobStub.close();
        paymobStub = createPaymobStub({ port: 3999, mode: "fail" });
        await paymobStub.listen();
        backend = spawnBackend({ paymobBaseUrl: "http://127.0.0.1:3999" });
        const healthy2 = await waitForHealthy();
        assert(healthy2, "Backend did not restart for fail stub");
      }

      // create new pending order
      const create2 = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Street 2",
        items: [{ product_id: firstProductId, quantity: 1 }],
      });
      assert(create2.status === 201, `expected 201, got ${create2.status}`);
      orderIdFailed = create2.data.id;

      const payFail = await clientA.post("/payments/pay", { order_id: orderIdFailed, method: "card" });
      assert(payFail.status === 200, `expected 200, got ${payFail.status}`);
      assert(payFail.data && payFail.data.success === false, "expected success=false");
      const failed = await clientA.get(`/orders/${orderIdFailed}`);
      assert(failed.status === 200, `expected 200, got ${failed.status}`);
      assert(failed.data.status === "failed", "order should be failed");

      // C) NETWORK ERROR (restart backend with unreachable upstream)
      if (SHOULD_MANAGE_BACKEND) {
        await stopProcess(backend);
        backend = null;
        await paymobStub.close();
        paymobStub = null;
        backend = spawnBackend({ paymobBaseUrl: "http://127.0.0.1:5999" }); // nothing listening
        const healthy3 = await waitForHealthy();
        assert(healthy3, "Backend did not restart for network error");
      }

      const create3 = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Street 2",
        items: [{ product_id: firstProductId, quantity: 1 }],
      });
      assert(create3.status === 201, `expected 201, got ${create3.status}`);
      orderIdNetwork = create3.data.id;

      const payNet = await clientA.post("/payments/pay", { order_id: orderIdNetwork, method: "card" });
      assert(payNet.status === 502, `expected 502, got ${payNet.status}`);
      const netOrder = await clientA.get(`/orders/${orderIdNetwork}`);
      assert(netOrder.status === 200, `expected 200, got ${netOrder.status}`);
      assert(netOrder.data.status === "pending", "order should remain pending on network error");

      pass("PAYMENT");
      record("PAYMENT", true);
    } catch (e) {
      fail("PAYMENT", e.message);
      record("PAYMENT", false, e.message);
      throw new Error("Critical failure: PAYMENT");
    }

    // 8) PAYMENT EDGE CASES
    try {
      // Retry failed order should work (restart backend with success stub if managed)
      if (SHOULD_MANAGE_BACKEND) {
        await stopProcess(backend);
        backend = null;
        paymobStub = createPaymobStub({ port: 3999, mode: "success" });
        await paymobStub.listen();
        backend = spawnBackend({ paymobBaseUrl: "http://127.0.0.1:3999" });
        const healthy4 = await waitForHealthy();
        assert(healthy4, "Backend did not restart for edge cases");
      }

      const retryFailed = await clientA.post("/payments/pay", { order_id: orderIdFailed, method: "card" });
      assert(retryFailed.status === 200, `expected 200, got ${retryFailed.status}`);
      const afterRetry = await clientA.get(`/orders/${orderIdFailed}`);
      assert(afterRetry.data.status === "paid", "failed order should become paid after retry");

      const retryPaid = await clientA.post("/payments/pay", { order_id: orderIdPaid, method: "card" });
      assert(retryPaid.status === 400, `expected 400, got ${retryPaid.status}`);

      // Double click payment => one 429
      const create4 = await clientA.post("/orders", {
        city: "Riyadh",
        details: "Street 2",
        items: [{ product_id: firstProductId, quantity: 1 }],
      });
      const orderDouble = create4.data.id;
      const [p1, p2] = await Promise.all([
        clientA.post("/payments/pay", { order_id: orderDouble, method: "card" }),
        clientA.post("/payments/pay", { order_id: orderDouble, method: "card" }),
      ]);
      assert([p1.status, p2.status].includes(429), "expected one request to be 429 for double click");

      pass("PAYMENT_EDGE");
      record("PAYMENT_EDGE", true);
    } catch (e) {
      fail("PAYMENT_EDGE", e.message);
      record("PAYMENT_EDGE", false, e.message);
    }

    // 9) REVIEWS
    try {
      // Try without purchase (user B on a product they didn't buy)
      const noPurchase = await clientB.post("/reviews", { product_id: firstProductId, rating: 5, comment: "x" });
      assert(noPurchase.status === 403, `expected 403, got ${noPurchase.status}`);

      // Review after paid order (user A)
      const ok = await clientA.post("/reviews", { product_id: firstProductId, rating: 5, comment: "Great" });
      assert(ok.status === 201 || ok.status === 409, `expected 201/409, got ${ok.status}`);

      // Duplicate review
      const dup = await clientA.post("/reviews", { product_id: firstProductId, rating: 4, comment: "Dup" });
      assert(dup.status === 409, `expected 409, got ${dup.status}`);

      pass("REVIEWS");
      record("REVIEWS", true);
    } catch (e) {
      fail("REVIEWS", e.message);
      record("REVIEWS", false, e.message);
    }

    // 10) COUPONS
    try {
      const valid = await clientA.post("/coupons/validate", { code: "VALID10", order_total: 50 });
      assert(valid.status === 200, `expected 200, got ${valid.status}`);
      assert(valid.data && valid.data.valid === true, "expected valid=true");

      const expired = await clientA.post("/coupons/validate", { code: "EXPIRED10", order_total: 50 });
      assert(expired.status === 400, `expected 400, got ${expired.status}`);

      const minFail = await clientA.post("/coupons/validate", { code: "MIN200", order_total: 100 });
      assert(minFail.status === 400, `expected 400, got ${minFail.status}`);

      const minOk = await clientA.post("/coupons/validate", { code: "MIN200", order_total: 250 });
      assert(minOk.status === 200, `expected 200, got ${minOk.status}`);

      pass("COUPONS");
      record("COUPONS", true);
    } catch (e) {
      fail("COUPONS", e.message);
      record("COUPONS", false, e.message);
    }

    // 11) REFUND
    try {
      const r1 = await clientA.post("/refunds", { order_id: orderIdPaid, reason: "Damaged" });
      assert(r1.status === 201 || r1.status === 409, `expected 201/409, got ${r1.status}`);

      const r2 = await clientB.post("/refunds", { order_id: orderIdPaid, reason: "Try steal" });
      assert(r2.status === 403, `expected 403, got ${r2.status}`);

      const r3 = await clientA.post("/refunds", { order_id: orderIdPaid, reason: "Duplicate" });
      assert(r3.status === 409, `expected 409, got ${r3.status}`);

      pass("REFUND");
      record("REFUND", true);
    } catch (e) {
      fail("REFUND", e.message);
      record("REFUND", false, e.message);
    }

    // 12) SECURITY
    try {
      const noToken = await buildClient().get("/orders/user");
      assert(noToken.status === 401, `expected 401, got ${noToken.status}`);

      const tampered = buildClient(tokenA.slice(0, -1) + "x");
      const tamperedRes = await tampered.get("/orders/user");
      assert(tamperedRes.status === 401, `expected 401, got ${tamperedRes.status}`);

      const otherOrder = await clientB.get(`/orders/${orderIdPaid}`);
      assert(otherOrder.status === 404, `expected 404, got ${otherOrder.status}`);

      pass("SECURITY");
      record("SECURITY", true);
    } catch (e) {
      fail("SECURITY", e.message);
      record("SECURITY", false, e.message);
    }

    // 13) RATE LIMIT
    try {
      let limited = 0;
      const calls = [];
      for (let i = 0; i < 60; i += 1) {
        calls.push(clientA.get("/orders/user"));
      }
      const results = await Promise.all(calls);
      for (const r of results) if (r.status === 429) limited += 1;
      assert(limited > 0, "expected some 429 responses");
      pass("RATE_LIMIT");
      record("RATE_LIMIT", true, null, { limited });
    } catch (e) {
      fail("RATE_LIMIT", e.message);
      record("RATE_LIMIT", false, e.message);
    }
  } catch (fatal) {
    // already logged at section level
    report.fatal = { message: fatal.message, at: nowIso() };
  } finally {
    report.finished_at = nowIso();
    if (SAVE_REPORT) {
      try {
        fs.writeFileSync(path.join(__dirname, "test-report.json"), JSON.stringify(report, null, 2));
      } catch (e) {
        console.error("Failed to write test-report.json:", e.message);
      }
    }

    if (paymobStub) await paymobStub.close();
    if (SHOULD_MANAGE_BACKEND) await stopProcess(backend);

    console.log("");
    console.log(`✔ TOTAL PASSED: ${report.totals.passed}`);
    console.log(`❌ TOTAL FAILED: ${report.totals.failed}`);

    process.exitCode = report.totals.failed > 0 ? 1 : 0;
  }
}

main();

