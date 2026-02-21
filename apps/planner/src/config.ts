import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const EnvSchema = z.object({
  PORT: z.string().optional().default("4005"),
  HOST: z.string().optional().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  AGENTMAIL_API_KEY: z.string().optional().default(""),
  KITE_RPC_URL: z.string().min(1),
  PAYMENT_ASSET: z.string().min(1),
  PLANNER_AGENT_PRIVATE_KEY: z.string().min(1),
  PLANNER_SESSION_PRIVATE_KEY: z.string().min(1),
  PLANNER_PAYMENT_PRIVATE_KEY: z.string().min(1),
  DEPLOYER_PRIVATE_KEY: z.string().min(1),
  PASSPORT_REGISTRY_ADDRESS: z.string().min(1),
  SESSION_REGISTRY_ADDRESS: z.string().min(1),
  FIRECRAWL_API_KEY: z.string().optional().default(""),
  KITE_WEATHER_URL: z.string().optional().default("https://x402.dev.gokite.ai"),
  FACILITATOR_URL: z.string().optional().default("https://facilitator.pieverse.io"),
  PLANNER_BASE_URL: z.string().optional().default("http://localhost:4005"),
});

export type PlannerEnv = z.infer<typeof EnvSchema>;
export const loadConfig = (): PlannerEnv => EnvSchema.parse(process.env);
