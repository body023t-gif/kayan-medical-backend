const jwt = require("jsonwebtoken");
const admin = require("../config/firebase");
const env = require("../config/env");
const { get, run } = require("../config/database");

async function verifyFirebaseToken(idToken) {
  return admin.auth().verifyIdToken(idToken);
}

async function findOrCreateUserByIdentity({ phone, firebaseUid, name = null }) {
  let user = null;
  if (firebaseUid) {
    user = await get("SELECT id, phone, firebase_uid, name, profile_image_url, created_at FROM users WHERE firebase_uid = ?", [
      firebaseUid,
    ]);
  }
  if (!user) {
    user = await get("SELECT id, phone, firebase_uid, name, profile_image_url, created_at FROM users WHERE phone = ?", [phone]);
  }
  if (user) return user;

  const insertResult = await run("INSERT INTO users (phone, firebase_uid, name) VALUES (?, ?, ?)", [
    phone,
    firebaseUid || null,
    name,
  ]);
  user = await get("SELECT id, phone, firebase_uid, name, profile_image_url, created_at FROM users WHERE id = ?", [
    insertResult.lastID,
  ]);
  return user;
}

async function syncUserIdentity(user, { firebaseUid, name }) {
  const nextUid = firebaseUid || user.firebase_uid || null;
  const nextName = name || user.name || null;
  if (nextUid !== user.firebase_uid || nextName !== user.name) {
    await run("UPDATE users SET firebase_uid = ?, name = ? WHERE id = ?", [nextUid, nextName, user.id]);
    return get("SELECT id, phone, firebase_uid, name, profile_image_url, created_at FROM users WHERE id = ?", [
      user.id,
    ]);
  }
  return user;
}

function generateJwt(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      phone: user.phone,
    },
    env.jwtSecret,
    { expiresIn: "7d" }
  );
}

module.exports = {
  verifyFirebaseToken,
  findOrCreateUserByIdentity,
  syncUserIdentity,
  generateJwt,
};
