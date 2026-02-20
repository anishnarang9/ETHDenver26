import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalAtomic = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().regex(/^\d+$/).optional()
);

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
  ROUTE_POLICY_PROFILE: z.enum(["demo", "test"]).optional().default("test"),
  TEST_PRICE_ENRICH_ATOMIC: optionalAtomic,
  TEST_PRICE_PREMIUM_ATOMIC: optionalAtomic,
  TEST_PRICE_WEATHER_KITE_ATOMIC: optionalAtomic,
  TEST_PRICE_WEATHER_FALLBACK_ATOMIC: optionalAtomic,
  MAX_KITE_SPEND_PER_DAY: z.string().optional().default("0.05"),
  FACILITATOR_URL: z.string().optional().default(""),
  EXPLORER_BASE_URL: z.string().optional().default(""),
  PREMIUM_API_URL: z.string().optional().default(""),
  PREMIUM_API_KEY: z.string().optional().default(""),
  WEATHER_UPSTREAM_URL: z.string().optional().default("https://x402.dev.gokite.ai/api/weather"),
  WEATHER_FALLBACK_BASE_URL: z.string().optional().default("http://localhost:4102"),
  WEATHER_PROXY_TIMEOUT_MS: z.coerce.number().int().positive().optional().default(15000),
});

export type GatewayEnv = z.infer<typeof EnvSchema>;

export const loadConfig = (): GatewayEnv => EnvSchema.parse(process.env);
