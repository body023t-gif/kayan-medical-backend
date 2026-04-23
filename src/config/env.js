const dotenv = require("dotenv");

dotenv.config();

// Hard safeguard: never allow TEST_MODE in production.
if (String(process.env.NODE_ENV || "").trim() === "production") {
  process.env.TEST_MODE = "0";
}

const requiredEnvVars = [
  "PORT",
  "JWT_SECRET",
  "PAYMOB_BASE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];

for (const key of requiredEnvVars) {
  if (!process.env[key] || !process.env[key].trim()) {
    throw new Error(`❌ Missing required environment variable: ${key}. Check your .env file.`);
  }
}

// Production validation: Paymob URL must be HTTPS and not localhost.
if (String(process.env.NODE_ENV || "").trim() === "production") {
  const paymob = String(process.env.PAYMOB_BASE_URL || "");
  if (!/^https:\/\//i.test(paymob)) {
    throw new Error("❌ PAYMOB_BASE_URL must be https:// in production.");
  }
  if (/localhost|127\.0\.0\.1/i.test(paymob)) {
    throw new Error("❌ PAYMOB_BASE_URL must not point to localhost in production.");
  }
}

function normalizeEnvMultilineSecret(value) {
  if (value == null) return "";
  let v = String(value).trim();
  // Common .env copy/paste mistakes: trailing comma and quoted blobs.
  if (v.endsWith(",")) v = v.slice(0, -1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.replace(/\\n/g, "\n");
}

module.exports = {
  port: Number.parseInt(process.env.PORT, 10) || 3000,
  jwtSecret: process.env.JWT_SECRET,
  paymobBaseUrl: process.env.PAYMOB_BASE_URL.replace(/\/+$/, ""),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: normalizeEnvMultilineSecret(process.env.FIREBASE_PRIVATE_KEY),
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
};
