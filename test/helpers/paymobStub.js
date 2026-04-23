const http = require("http");

function startPaymobStub({ mode = "success" } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/paymob/pay") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        if (mode === "success") {
          res.end(JSON.stringify({ success: true, status: "success", echo: body ? JSON.parse(body) : null }));
          return;
        }
        res.end(JSON.stringify({ success: false, status: "failed", echo: body ? JSON.parse(body) : null }));
      });
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

module.exports = { startPaymobStub };

