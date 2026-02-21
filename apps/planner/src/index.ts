import { app, config, setMailAddresses } from "./server.js";
import { bootstrapAgentMail } from "./bootstrap-mail.js";

const start = async () => {
  await app.listen({ port: Number(config.PORT), host: config.HOST });
  app.log.info(`Planner orchestrator running on port ${config.PORT}`);

  if (config.AGENTMAIL_API_KEY) {
    try {
      const result = await bootstrapAgentMail({
        apiKey: config.AGENTMAIL_API_KEY,
        plannerBaseUrl: config.PLANNER_BASE_URL,
      });
      setMailAddresses(result);
      app.log.info("[bootstrap-mail] AgentMail inboxes bootstrapped successfully");
    } catch (err) {
      app.log.error(err, "[bootstrap-mail] Failed to bootstrap AgentMail");
    }
  } else {
    console.log("[bootstrap-mail] AGENTMAIL_API_KEY not set, email features disabled");
  }
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
