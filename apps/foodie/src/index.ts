import { app, config } from "./server.js";

const start = async () => {
  await app.listen({ port: Number(config.PORT), host: config.HOST });
  app.log.info(`Foodie agent running on port ${config.PORT}`);
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
