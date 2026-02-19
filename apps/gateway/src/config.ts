import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  GATEWAY_PORT: z.string().optional().default("4001"),
  GATEWAY_HOST: z.string().optional().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  KITE_RPC_URL: z.string().min(1),
  PASSPORT_REGISTRY_ADDRESS: z.string().min(1),
  SESSION_REGISTRY_ADDRESS: z.string().min(1),
  RECEIPT_LOG_ADDRESS: z.string().min(1),
  GATEWAY_SIGNER_PRIVATE_KEY: z.string().min(1),
  PAYMENT_RECIPIENT: z.string().min(1),
  PAYMENT_ASSET: z.string().min(1),
  FACILITATOR_URL: z.string().optional().default(""),
  EXPLORER_BASE_URL: z.string().optional().default(""),
  PREMIUM_API_URL: z.string().optional().default(""),
  PREMIUM_API_KEY: z.string().optional().default(""),
});

export type GatewayEnv = z.infer<typeof EnvSchema>;

export const loadConfig = (): GatewayEnv => EnvSchema.parse(process.env);
