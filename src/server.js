const env = require("./config/env");
const app = require("./app");
const { createTables } = require("./models/schema");
const { seedProducts } = require("./models/seedProducts");

async function bootstrap() {
  await createTables();
  await seedProducts();

  app.listen(env.port, () => {
    console.log(`Mobile backend running on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start mobile backend:", error);
  process.exit(1);
});
