import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const RunnerConfigSchema = z.object({
  GATEWAY_BASE_URL: z.string().default("http://localhost:4001"),
  KITE_RPC_URL: z.string().min(1),
  RUNNER_AGENT_PRIVATE_KEY: z.string().min(1),
  RUNNER_SESSION_PRIVATE_KEY: z.string().min(1),
  RUNNER_PAYMENT_PRIVATE_KEY: z.string().min(1),
  RUNNER_ROUTES: z.string().optional().default("enrich-wallet"),
  RUNNER_ITERATIONS: z.coerce.number().int().positive().default(1),
  RUNNER_DISABLE_FACILITATOR: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  FACILITATOR_URL: z.string().optional().default(""),
  PAYMENT_ASSET: z.string().min(1),
});

export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

export const loadRunnerConfig = (): RunnerConfig => RunnerConfigSchema.parse(process.env);
