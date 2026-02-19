import { Contract, JsonRpcProvider, Wallet, ZeroAddress, ethers } from "ethers";
import type { PassportClient, SessionClient } from "@kite-stack/provider-kit";

const PASSPORT_ABI = [
  "function getPassport(address agent) view returns (address owner,address agentAddress,uint64 expiresAt,uint128 perCallCap,uint128 dailyCap,uint32 rateLimitPerMin,bool revoked,uint32 version,uint64 updatedAt,bytes32[] scopes,bytes32[] services)",
  "function isScopeAllowed(address agent, bytes32 scope) view returns (bool)",
  "function isServiceAllowed(address agent, bytes32 service) view returns (bool)",
  "function revokePassport(address agent)",
  "function upsertPassport(address agent,uint64 expiresAt,uint128 perCallCap,uint128 dailyCap,uint32 rateLimitPerMin,bytes32[] scopes,bytes32[] services)",
];

const SESSION_ABI = [
  "function getSession(address session) view returns (address owner,address agent,address sessionAddress,uint64 expiresAt,bool revoked,uint64 updatedAt,bytes32[] scopes)",
  "function isSessionActive(address session) view returns (bool)",
  "function hasScope(address session, bytes32 scope) view returns (bool)",
  "function grantSession(address agent,address session,uint64 expiresAt,bytes32[] scopeSubset)",
  "function revokeSession(address session)",
];

const RECEIPT_ABI = [
  "function recordReceipt(bytes32 actionId,address agent,address payer,address asset,uint256 amount,bytes32 routeId,bytes32 paymentRef,bytes32 metadataHash)",
];

export interface ContractClients {
  provider: JsonRpcProvider;
  signer: Wallet;
  passportContract: Contract;
  sessionContract: Contract;
  receiptContract: Contract;
}

export const createContractClients = (input: {
  rpcUrl: string;
  signerPrivateKey: string;
  passportRegistryAddress: string;
  sessionRegistryAddress: string;
  receiptLogAddress: string;
}): ContractClients => {
  const provider = new JsonRpcProvider(input.rpcUrl);
  const signer = new Wallet(input.signerPrivateKey, provider);

  const passportContract = new Contract(input.passportRegistryAddress, PASSPORT_ABI, provider);
  const sessionContract = new Contract(input.sessionRegistryAddress, SESSION_ABI, provider);
  const receiptContract = new Contract(input.receiptLogAddress, RECEIPT_ABI, signer);

  return {
    provider,
    signer,
    passportContract,
    sessionContract,
    receiptContract,
  };
};

export class OnchainPassportClient implements PassportClient {
  constructor(private readonly contract: Contract) {}

  async getPassport(agent: `0x${string}`) {
    const data = await this.contract.getPassport(agent);
    if (!data?.owner || data.owner === ZeroAddress) {
      return null;
    }

    return {
      owner: data.owner as `0x${string}`,
      agent: data.agentAddress as `0x${string}`,
      expiresAt: Number(data.expiresAt),
      perCallCap: BigInt(data.perCallCap.toString()),
      dailyCap: BigInt(data.dailyCap.toString()),
      rateLimitPerMin: Number(data.rateLimitPerMin),
      revoked: Boolean(data.revoked),
      scopes: (data.scopes as string[]).map((value) => value.toLowerCase()),
      services: (data.services as string[]).map((value) => value.toLowerCase()),
    };
  }

  async isScopeAllowed(agent: `0x${string}`, scope: string): Promise<boolean> {
    const scopeHash = ethers.id(scope);
    return this.contract.isScopeAllowed(agent, scopeHash);
  }

  async isServiceAllowed(agent: `0x${string}`, service: string): Promise<boolean> {
    const serviceHash = ethers.id(service);
    return this.contract.isServiceAllowed(agent, serviceHash);
  }
}

export class OnchainSessionClient implements SessionClient {
  constructor(private readonly contract: Contract) {}

  async getSession(session: `0x${string}`) {
    const data = await this.contract.getSession(session);
    if (!data?.owner || data.owner === ZeroAddress) {
      return null;
    }

    return {
      owner: data.owner as `0x${string}`,
      agent: data.agent as `0x${string}`,
      session: data.sessionAddress as `0x${string}`,
      expiresAt: Number(data.expiresAt),
      revoked: Boolean(data.revoked),
      scopes: (data.scopes as string[]).map((value) => value.toLowerCase()),
    };
  }

  async isSessionActive(session: `0x${string}`): Promise<boolean> {
    return this.contract.isSessionActive(session);
  }

  async hasScope(session: `0x${string}`, scope: string): Promise<boolean> {
    const scopeHash = ethers.id(scope);
    return this.contract.hasScope(session, scopeHash);
  }
}

export class OnchainReceiptWriter {
  constructor(private readonly contract: Contract) {}

  async recordOnchain(input: {
    actionId: string;
    agent: `0x${string}`;
    payer: `0x${string}`;
    amountAtomic: string;
    asset: `0x${string}`;
    routeId: string;
    paymentRef: string;
    metadataHash: string;
  }): Promise<{ txHash: `0x${string}`; receiptId: string }> {
    const tx = await this.contract.recordReceipt(
      ethers.id(input.actionId),
      input.agent,
      input.payer,
      input.asset,
      BigInt(input.amountAtomic),
      ethers.id(input.routeId),
      ethers.id(input.paymentRef),
      (`0x${input.metadataHash}` as `0x${string}`)
    );

    const receipt = await tx.wait();

    return {
      txHash: tx.hash as `0x${string}`,
      receiptId: ethers.id(input.actionId),
    };
  }
}
