export interface SignedRequestEnvelope {
  agentAddress: `0x${string}`;
  sessionAddress: `0x${string}`;
  timestamp: string;
  nonce: string;
  bodyHash: string;
  signature: string;
}

export interface SessionGrant {
  agentAddress: `0x${string}`;
  sessionAddress: `0x${string}`;
  expiresAt: string;
  scopes: string[];
}

export interface PassportPolicyInput {
  agentAddress: `0x${string}`;
  expiresAt: string;
  perCallCap: string;
  dailyCap: string;
  rateLimitPerMin: number;
  scopes: string[];
  services: string[];
}
