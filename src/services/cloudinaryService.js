const { v2: cloudinary } = require("cloudinary");
const env = require("../config/env");

const isConfigured =
  Boolean(env.cloudinaryCloudName) &&
  Boolean(env.cloudinaryApiKey) &&
  Boolean(env.cloudinaryApiSecret);

if (isConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
  });
}

async function uploadImage(imageData, folder = "mobile-backend") {
  if (!imageData) return null;
  if (typeof imageData === "string" && imageData.startsWith("http")) {
    return imageData;
  }
  if (!isConfigured) {
    const error = new Error("Cloudinary is not configured.");
    error.status = 500;
    throw error;
  }
  const result = await cloudinary.uploader.upload(imageData, { folder });
  return result.secure_url;
}

module.exports = { uploadImage, isCloudinaryConfigured: isConfigured };
