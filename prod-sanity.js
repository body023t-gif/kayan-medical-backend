/* eslint-disable no-console */
const axios = require("axios");

const BASE_URL = process.env.BASE_URL || "http://192.168.1.7:3000";
const TOKEN_A = process.env.FIREBASE_TOKEN_A || "";
const TOKEN_B = process.env.FIREBASE_TOKEN_B || "";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function client(jwt) {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    validateStatus: () => true,
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
  });
}

async function main() {
  const results = [];
  const ok = (name) => results.push({ name, ok: true });
  const bad = (name, reason) => results.push({ name, ok: false, reason });

  let jwtA;
  let jwtB;
  let productId;
  let orderId;

  try {
    // 1) Auth real token exchange
    try {
      assert(TOKEN_A && TOKEN_B, "Set FIREBASE_TOKEN_A and FIREBASE_TOKEN_B env vars.");
      const resA = await client().post("/auth/firebase", { firebase_token: TOKEN_A });
      assert(resA.status === 200 && resA.data?.token, `auth A failed: ${resA.status}`);
      jwtA = resA.data.token;

      const resB = await client().post("/auth/firebase", { firebase_token: TOKEN_B });
      assert(resB.status === 200 && resB.data?.token, `auth B failed: ${resB.status}`);
      jwtB = resB.data.token;
      ok("AUTH_REAL");
    } catch (e) {
      bad("AUTH_REAL", e.message);
      throw e;
    }

    // invalid token rejected
    try {
      const badTok = await client().post("/auth/firebase", { firebase_token: "NOT_A_REAL_TOKEN" });
      assert(badTok.status === 401, `invalid token expected 401 got ${badTok.status}`);
      ok("AUTH_INVALID_401");
    } catch (e) {
      bad("AUTH_INVALID_401", e.message);
    }

    // 2) Products + pick product id != 1 to avoid polluted review
    const products = await client(jwtA).get("/products");
    assert(products.status === 200, `products failed: ${products.status}`);
    assert(products.data?.currency === "SAR", "currency not SAR");
    assert(Array.isArray(products.data?.products) && products.data.products.length > 1, "products list too small");
    productId = products.data.products[1].id;

    // 3) Create order
    const order = await client(jwtA).post("/orders", {
      city: "Riyadh",
      details: "Street 2",
      items: [{ product_id: productId, quantity: 1 }],
    });
    assert(order.status === 201, `order create failed: ${order.status}`);
    assert(order.data?.status === "pending", "order not pending");
    orderId = order.data.id;
    ok("ORDER_CREATE");

    // 4) Pay order (REAL upstream)
    const pay = await client(jwtA).post("/payments/pay", { order_id: orderId, method: "card" });
    assert(pay.status === 200, `payment failed: ${pay.status}`);
    // success can be true/false depending on upstream, but must be handled.
    assert(typeof pay.data?.success === "boolean" || pay.data?.success === true || pay.data?.success === false, "payment response missing success flag");
    ok("PAY_ORDER");

    // 5) Verify order status paid/failed
    const orderAfter = await client(jwtA).get(`/orders/${orderId}`);
    assert(orderAfter.status === 200, `get order failed: ${orderAfter.status}`);
    assert(["paid", "failed", "pending"].includes(orderAfter.data?.status), "unexpected order status");
    ok("ORDER_VERIFY");

    // 6) Review: first review should be 201 only if order paid
    if (orderAfter.data.status === "paid") {
      const review1 = await client(jwtA).post("/reviews", { product_id: productId, rating: 5, comment: "Great" });
      assert(review1.status === 201, `review success expected 201 got ${review1.status}`);
      ok("REVIEW_FIRST_201");

      const reviewDup = await client(jwtA).post("/reviews", { product_id: productId, rating: 4, comment: "Dup" });
      assert(reviewDup.status === 409, `duplicate review expected 409 got ${reviewDup.status}`);
      ok("REVIEW_DUP_409");
    } else {
      bad("REVIEW_FIRST_201", "Skipped: order not paid (upstream returned failed/pending).");
      bad("REVIEW_DUP_409", "Skipped: order not paid (upstream returned failed/pending).");
    }

    // 7) Refund: first 201 then duplicate 409
    const refund1 = await client(jwtA).post("/refunds", { order_id: orderId, reason: "Damaged" });
    assert(refund1.status === 201, `refund expected 201 got ${refund1.status}`);
    ok("REFUND_FIRST_201");

    const refundDup = await client(jwtA).post("/refunds", { order_id: orderId, reason: "Duplicate" });
    assert(refundDup.status === 409, `refund dup expected 409 got ${refundDup.status}`);
    ok("REFUND_DUP_409");

    // 8) Unauthorized refund (user B)
    const refundOther = await client(jwtB).post("/refunds", { order_id: orderId, reason: "Try steal" });
    assert(refundOther.status === 403, `unauthorized refund expected 403 got ${refundOther.status}`);
    ok("REFUND_UNAUTH_403");
  } catch (e) {
    // stop on critical errors
  } finally {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    for (const r of results) {
      if (r.ok) console.log(`[${r.name}] ✅ PASS`);
      else console.log(`[${r.name}] ❌ FAIL (${r.reason})`);
    }
    console.log("");
    console.log(`✔ TOTAL PASSED: ${passed}`);
    console.log(`❌ TOTAL FAILED: ${failed}`);
    process.exitCode = failed ? 1 : 0;
  }
}

main();

