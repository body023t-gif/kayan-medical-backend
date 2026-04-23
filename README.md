# Mobile Backend

Minimal production-safe backend for mobile e-commerce:
- Firebase token verification + JWT issuing
- Products listing
- Order creation and status management
- Payment orchestration via existing Paymob backend

## Stack
- Node.js + Express
- SQLite
- Firebase Admin SDK
- JWT
- dotenv
- axios

## Setup
1. Copy `.env.example` to `.env`.
2. Fill Firebase service account values and your `PAYMOB_BASE_URL`.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run server:
   ```bash
   npm run dev
   ```

Server starts on `http://localhost:3000` by default.

## API

### 1) Firebase Auth -> JWT
`POST /auth/firebase`

Body:
```json
{
  "firebase_token": "FIREBASE_ID_TOKEN"
}
```

Curl:
```bash
curl -X POST http://localhost:3000/auth/firebase \
  -H "Content-Type: application/json" \
  -d "{\"firebase_token\":\"YOUR_FIREBASE_ID_TOKEN\"}"
```

Response includes `token` (JWT) and `user`.

### 2) Products
`GET /products`

Curl:
```bash
curl http://localhost:3000/products
```

### 3) Create Order (Protected)
`POST /orders`

Headers:
- `Authorization: Bearer YOUR_JWT`

Body:
```json
{
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 2, "quantity": 1 }
  ],
  "city": "Riyadh",
  "details": "Olaya District, Building 10"
}
```

Curl:
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d "{\"items\":[{\"product_id\":1,\"quantity\":2},{\"product_id\":2,\"quantity\":1}],\"city\":\"Riyadh\",\"details\":\"Olaya District, Building 10\"}"
```

### 4) Get User Orders (Protected)
`GET /orders/user`

Curl:
```bash
curl http://localhost:3000/orders/user \
  -H "Authorization: Bearer YOUR_JWT"
```

### 5) Get Order By ID (Protected)
`GET /orders/:id`

Curl:
```bash
curl http://localhost:3000/orders/1 \
  -H "Authorization: Bearer YOUR_JWT"
```

### 6) Pay Order (Protected)
`POST /payments/pay`

Body:
```json
{
  "order_id": 1,
  "method": "card"
}
```

`method` supports `card` or `apple-pay`.

Curl:
```bash
curl -X POST http://localhost:3000/payments/pay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d "{\"order_id\":1,\"method\":\"card\"}"
```

## Local Test Flow
1. Get Firebase ID token from the app.
2. Call `POST /auth/firebase` and save JWT.
3. Call `GET /products`.
4. Create order with `POST /orders`.
5. Call `POST /payments/pay`.

## Payment Status Rules
- Paymob success response -> order becomes `paid`.
- Paymob failed business response -> order becomes `failed`.
- Network error/timeout to Paymob backend -> order stays `pending`.

## Notes
- Currency is fixed to `SAR`.
- This service does not use WooCommerce.
- Address is simplified to `city` + `details`.
