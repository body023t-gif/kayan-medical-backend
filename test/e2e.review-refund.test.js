const request = require("supertest");
const { startPaymobStub } = require("./helpers/paymobStub");
const { makeTempDbPath } = require("./helpers/testEnv");

jest.setTimeout(30000);

describe("E2E: reviews + refunds (deterministic)", () => {
  let app;
  let paymob;
  let jwtA;
  let jwtB;
  let orderAId;
  let productToBuyId;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "jest_secret";
    process.env.PORT = "0";
    process.env.DB_PATH = makeTempDbPath();

    paymob = await startPaymobStub({ mode: "success" });
    process.env.PAYMOB_BASE_URL = paymob.baseUrl;

    // Require after env is set so DB + env resolve correctly.
    app = require("../src/app");
    const { createTables } = require("../src/models/schema");
    const { seedProducts } = require("../src/models/seedProducts");
    await createTables();
    await seedProducts();

    // pick a product id deterministically
    const productsRes = await request(app).get("/products");
    expect(productsRes.status).toBe(200);
    expect(Array.isArray(productsRes.body.products)).toBe(true);
    expect(productsRes.body.products.length).toBeGreaterThanOrEqual(2);
    productToBuyId = productsRes.body.products[1].id; // not product 1

    // Deterministic auth for tests without Firebase: create users in DB and sign JWTs
    const authService = require("../src/services/authService");
    const { findOrCreateUserByIdentity } = authService;

    const userA = await findOrCreateUserByIdentity({ phone: "+966500000001", firebaseUid: "test-user-a", name: "Test User A" });
    const userB = await findOrCreateUserByIdentity({ phone: "+966500000002", firebaseUid: "test-user-b", name: "Test User B" });
    jwtA = authService.generateJwt(userA);
    jwtB = authService.generateJwt(userB);
  });

  afterAll(async () => {
    if (paymob) await paymob.close();
  });

  test("Review success (201) after PAID order (new product)", async () => {
    // Create order for productToBuyId
    const orderRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${jwtA}`)
      .send({
        city: "Riyadh",
        details: "Street 2",
        items: [{ product_id: productToBuyId, quantity: 1 }],
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.status).toBe("pending");
    orderAId = orderRes.body.id;

    // Pay it (uses real /payments/pay logic against stub upstream)
    const payRes = await request(app)
      .post("/payments/pay")
      .set("Authorization", `Bearer ${jwtA}`)
      .send({ order_id: orderAId, method: "card" });

    expect(payRes.status).toBe(200);
    expect(payRes.body.success).toBe(true);

    // Verify paid
    const getOrder = await request(app).get(`/orders/${orderAId}`).set("Authorization", `Bearer ${jwtA}`);
    expect(getOrder.status).toBe(200);
    expect(getOrder.body.status).toBe("paid");

    // First review should be 201
    const reviewRes = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${jwtA}`)
      .send({ product_id: productToBuyId, rating: 5, comment: "Great" });

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        user_id: expect.any(Number),
        product_id: productToBuyId,
        rating: 5,
      })
    );
  });

  test("Duplicate review (409) for same user/product", async () => {
    const dup = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${jwtA}`)
      .send({ product_id: productToBuyId, rating: 4, comment: "Dup" });

    expect(dup.status).toBe(409);
  });

  test("Refund success (201) then duplicate refund (409) for same order", async () => {
    const r1 = await request(app)
      .post("/refunds")
      .set("Authorization", `Bearer ${jwtA}`)
      .send({ order_id: orderAId, reason: "Damaged" });

    expect(r1.status).toBe(201);
    expect(r1.body).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        order_id: orderAId,
        reason: "Damaged",
        status: "pending",
      })
    );

    const r2 = await request(app)
      .post("/refunds")
      .set("Authorization", `Bearer ${jwtA}`)
      .send({ order_id: orderAId, reason: "Duplicate" });

    expect(r2.status).toBe(409);
  });

  test("Unauthorized refund (403) by different user", async () => {
    const r = await request(app)
      .post("/refunds")
      .set("Authorization", `Bearer ${jwtB}`)
      .send({ order_id: orderAId, reason: "Try steal" });

    expect(r.status).toBe(403);
    expect(r.body).toEqual({ message: "Unauthorized refund request." });
  });

  test("Auth validation: invalid token rejected, valid accepted", async () => {
    const bad = await request(app).post("/auth/firebase").send({ firebase_token: "NOT_A_REAL_TOKEN" });
    expect(bad.status).toBe(401);

    // We don't test "valid accepted" here because Firebase tokens are real-network dependent.
    // That path is validated in the production sanity script.
  });
});

