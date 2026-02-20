import { JsonRpcProvider, Wallet } from "ethers";
import { loadRunnerConfig } from "./config.js";
import { runAutonomousLoop } from "./flow.js";

const config = loadRunnerConfig();
const provider = new JsonRpcProvider(config.KITE_RPC_URL);

const agentWallet = new Wallet(config.RUNNER_AGENT_PRIVATE_KEY, provider);
const sessionWallet = new Wallet(config.RUNNER_SESSION_PRIVATE_KEY, provider);
const paymentWallet = new Wallet(config.RUNNER_PAYMENT_PRIVATE_KEY, provider);

const main = async () => {
  const summary = await runAutonomousLoop({
    config,
    provider,
    agentWallet,
    sessionWallet,
    paymentWallet,
  });
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
