import { keccak256, toUtf8Bytes, type Wallet } from "ethers";

const stableSerialize = (value: unknown) => JSON.stringify(value ?? {});

export const buildBodyHash = (body: unknown): string => keccak256(toUtf8Bytes(stableSerialize(body)));

export const buildCanonicalMessage = (input: {
  agentAddress: `0x${string}`;
  sessionAddress: `0x${string}`;
  timestamp: string;
  nonce: string;
  bodyHash: string;
}): string =>
  [input.agentAddress, input.sessionAddress, input.timestamp, input.nonce, input.bodyHash].join("|");

export const signEnvelope = async (input: {
  sessionWallet: Wallet;
  agentAddress: `0x${string}`;
  sessionAddress: `0x${string}`;
  timestamp: string;
  nonce: string;
  bodyHash: string;
}): Promise<string> => {
  const message = buildCanonicalMessage(input);
  return input.sessionWallet.signMessage(message);
};
