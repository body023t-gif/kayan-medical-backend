const fs = require("fs");
const os = require("os");
const path = require("path");

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mobile-backend-e2e-"));
  return path.join(dir, "test.sqlite");
}

module.exports = { makeTempDbPath };

