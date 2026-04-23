const {
  verifyFirebaseToken,
  findOrCreateUserByIdentity,
  syncUserIdentity,
  generateJwt,
} = require("../services/authService");
const { requireFirebaseToken } = require("../services/validators");

async function firebaseAuth(req, res, next) {
  try {
    const firebaseToken = requireFirebaseToken(req.body);
    const decoded = await verifyFirebaseToken(firebaseToken);
    const phone = decoded.phone_number;

    if (!phone) {
      const error = new Error("Phone number is missing from Firebase token.");
      error.status = 400;
      throw error;
    }

    const baseUser = await findOrCreateUserByIdentity({
      phone,
      firebaseUid: decoded.uid,
      name: decoded.name || null,
    });
    const user = await syncUserIdentity(baseUser, {
      firebaseUid: decoded.uid,
      name: decoded.name || null,
    });
    const token = generateJwt(user);

    console.log("[AUTH] Firebase verified", { uid: decoded.uid, phone: user.phone });
    return res.json({ token, user });
  } catch (error) {
    // Stable auth validation: treat invalid Firebase tokens as 401.
    if (error && (error.code === "auth/argument-error" || error.code === "auth/invalid-id-token")) {
      return res.status(401).json({ message: "Unauthorized." });
    }
    console.log("[AUTH] Firebase verification failed", { reason: error.message });
    return next(error);
  }
}

module.exports = { firebaseAuth };
