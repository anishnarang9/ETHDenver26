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
  AGENT_PRIVATE_KEY: z.string().optional(),
  FOODIE_AGENT_PRIVATE_KEY: z.string().optional(),
  PAYMENT_ASSET: z.string().min(1),
  PAYMENT_RECIPIENT: z.string().optional().default(""),
  FOODIE_PAYMENT_RECIPIENT: z.string().optional().default(""),
  FACILITATOR_URL: z.string().optional().default(""),
});

type FoodieParsedEnv = z.infer<typeof EnvSchema>;
export type FoodieEnv = Omit<FoodieParsedEnv, "AGENT_PRIVATE_KEY" | "PAYMENT_RECIPIENT"> & {
  AGENT_PRIVATE_KEY: string;
  PAYMENT_RECIPIENT: string;
};
export const loadConfig = (): FoodieEnv => {
  const parsed = EnvSchema.parse(process.env);
  const agentPrivateKey = parsed.FOODIE_AGENT_PRIVATE_KEY ?? parsed.AGENT_PRIVATE_KEY;
  if (!agentPrivateKey) {
    throw new Error("Missing foodie private key. Set FOODIE_AGENT_PRIVATE_KEY (or AGENT_PRIVATE_KEY).");
  }

  return {
    ...parsed,
    AGENT_PRIVATE_KEY: agentPrivateKey,
    PAYMENT_RECIPIENT: parsed.FOODIE_PAYMENT_RECIPIENT || parsed.PAYMENT_RECIPIENT,
  };
};
