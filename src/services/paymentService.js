const axios = require("axios");
const env = require("../config/env");

const client = axios.create({
  baseURL: env.paymobBaseUrl,
  timeout: 15000,
});

function endpointForMethod(method) {
  // Existing deployed paymob-backend exposes only POST /paymob/pay.
  // Both card and apple-pay methods are proxied to this endpoint for now.
  return "/paymob/pay";
}

function isSuccessResponse(data) {
  if (!data || typeof data !== "object") return false;
  if (data.success === true) return true;
  if (data.status && String(data.status).toLowerCase() === "success") return true;
  return false;
}

function isNetworkOrTimeoutError(error) {
  return !error.response;
}

async function callPaymob({ method, payload }) {
  const endpoint = endpointForMethod(method);
  const fullUrl = `${env.paymobBaseUrl}${endpoint}`;

  console.log("[PAYMENT][UPSTREAM] Calling URL", { url: fullUrl, method });
  console.log("[PAYMENT][UPSTREAM] Request payload", payload);

  const response = await client.post(endpoint, payload);

  console.log("[PAYMENT][UPSTREAM] Response", {
    status: response.status,
    data: response.data,
  });

  return response;
}

module.exports = {
  callPaymob,
  isSuccessResponse,
  isNetworkOrTimeoutError,
};
