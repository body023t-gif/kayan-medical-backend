const {
  verifyFirebaseToken,
  findOrCreateUserByIdentity,
  syncUserIdentity,
  generateJwt,
} = require("../services/authService");
const { requireFirebaseToken } = require("../services/validators");
const { logStep, logError, truncateToken } = require("../utils/logger");

async function firebaseAuth(req, res, next) {
  try {
    logStep("REQUEST", { bodySnapshot: req.body });
    const incomingToken =
      req.body?.firebaseToken ||
      req.body?.firebase_token ||
      req.body?.idToken;
    logStep("TOKEN_RECEIVED", {
      tokenType: typeof incomingToken,
      tokenPreview: truncateToken(incomingToken),
    });
    const firebaseToken = requireFirebaseToken(req.body);
    logStep("VERIFY_START", { tokenPreview: truncateToken(firebaseToken) });
    const decoded = await verifyFirebaseToken(firebaseToken);
    logStep("VERIFY_SUCCESS", {
      uid: decoded && decoded.uid,
      phone_number: decoded && decoded.phone_number,
      name: decoded && decoded.name,
    });
    const phone = decoded.phone_number;
    logStep("PHONE_EXTRACTED", { phone });

    if (!phone) {
      const error = new Error("Phone number is missing from Firebase token.");
      error.status = 400;
      logError("PHONE_MISSING", error);
      throw error;
    }

    logStep("DB_USER", { phase: "before_find_or_create", phone, uid: decoded.uid });
    const baseUser = await findOrCreateUserByIdentity({
      phone,
      firebaseUid: decoded.uid,
      name: decoded.name || null,
    });
    logStep("DB_USER", {
      phase: "after_find_or_create",
      userId: baseUser && baseUser.id,
      phone: baseUser && baseUser.phone,
    });
    logStep("DB_USER", { phase: "before_sync_identity", userId: baseUser && baseUser.id });
    const user = await syncUserIdentity(baseUser, {
      firebaseUid: decoded.uid,
      name: decoded.name || null,
    });
    logStep("DB_USER", {
      phase: "after_sync_identity",
      userId: user && user.id,
      phone: user && user.phone,
    });
    logStep("JWT_CREATED", { phase: "before_generate", userId: user && user.id });
    const token = generateJwt(user);
    logStep("JWT_CREATED", {
      phase: "after_generate",
      tokenType: typeof token,
      tokenPreview: truncateToken(token),
    });

    console.log("[AUTH] Firebase verified", { uid: decoded.uid, phone: user.phone });
    return res.json({ token, user });
  } catch (error) {
    logError("REQUEST_FAIL", error);
    // Stable auth validation: treat invalid Firebase tokens as 401.
    if (error && (error.code === "auth/argument-error" || error.code === "auth/invalid-id-token")) {
      return res.status(401).json({ message: "Unauthorized." });
    }
    console.log("[AUTH] Firebase verification failed", { reason: error.message });
    return next(error);
  }
}

module.exports = { firebaseAuth };
