function truncateToken(token) {
  if (typeof token !== "string" || !token) return token;
  return `${token.slice(0, 30)}...`;
}

function sanitize(value, depth = 0, maxDepth = 3) {
  if (value == null) return value;
  if (depth >= maxDepth) return "[MaxDepth]";
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1, maxDepth));
  }
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value)) {
      output[key] = sanitize(value[key], depth + 1, maxDepth);
    }
    return output;
  }
  return value;
}

function stringifyData(data) {
  try {
    return JSON.stringify(sanitize(data));
  } catch (_error) {
    return JSON.stringify({ serializationError: true });
  }
}

function logStep(label, data) {
  const prefix = `[DEBUG][AUTH][${label}]`;
  if (typeof data === "undefined") {
    console.log(prefix);
    return;
  }
  console.log(prefix, stringifyData(data));
}

function logError(label, error) {
  const prefix = `[ERROR][AUTH][${label}]`;
  console.log(
    prefix,
    stringifyData({
      message: error && error.message,
      code: error && error.code,
      stack: error && error.stack,
    })
  );
}

module.exports = {
  logStep,
  logError,
  truncateToken,
  stringifyData,
};
