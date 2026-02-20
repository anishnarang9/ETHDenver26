import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const EnvSchema = z.object({
  PORT: z.string().optional().default("4003"),
  HOST: z.string().optional().default("0.0.0.0"),
  OPENAI_API_KEY: z.string().min(1),
  FIRECRAWL_API_KEY: z.string().optional().default(""),
  KITE_RPC_URL: z.string().min(1),
  PASSPORT_REGISTRY_ADDRESS: z.string().min(1),
  SESSION_REGISTRY_ADDRESS: z.string().min(1),
  RECEIPT_LOG_ADDRESS: z.string().min(1),
  AGENT_PRIVATE_KEY: z.string().min(1),
  PAYMENT_ASSET: z.string().min(1),
  PAYMENT_RECIPIENT: z.string().optional().default(""),
  FACILITATOR_URL: z.string().optional().default(""),
});

export type FoodieEnv = z.infer<typeof EnvSchema>;
export const loadConfig = (): FoodieEnv => EnvSchema.parse(process.env);
