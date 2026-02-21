import { Wallet, HDNodeWallet, Contract, JsonRpcProvider, ethers, NonceManager } from "ethers";
import { randomUUID } from "node:crypto";
import type { SSEHub } from "./sse-emitter.js";

const PASSPORT_ABI = [
  "function upsertPassport(address agent,uint64 expiresAt,uint128 perCallCap,uint128 dailyCap,uint32 rateLimitPerMin,bytes32[] scopes,bytes32[] services)",
  "function revokePassport(address agent)",
];

const SESSION_ABI = [
  "function grantSession(address agent,address session,uint64 expiresAt,bytes32[] scopeSubset)",
];

const ERC20_ABI = [
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

export interface SpawnedAgent {
  id: string;
  role: string;
  wallet: HDNodeWallet;
  address: string;
  passportTxHash?: string;
  sessionTxHash?: string;
  fundingTxHash?: string;
  status: "spawning" | "active" | "completed" | "failed" | "revoked";
  createdAt: number;
}

export interface SpawnAgentOpts {
  role: string;
  scopes: string[];
  services?: string[];
  fundingAmount?: bigint;
}

export class AgentSpawner {
  private agents = new Map<string, SpawnedAgent>();
  private provider: JsonRpcProvider;
  private deployerWallet: Wallet;
  private nonceManager: NonceManager;
  private paymentWallet: Wallet;
  private passportRegistry: string;
  private sessionRegistry: string;
  private paymentAsset: string;
  private sseHub: SSEHub;

  constructor(opts: {
    rpcUrl: string;
    deployerPrivateKey: string;
    paymentPrivateKey: string;
    passportRegistryAddress: string;
    sessionRegistryAddress: string;
    paymentAsset: string;
    sseHub: SSEHub;
  }) {
    this.provider = new JsonRpcProvider(opts.rpcUrl);
    this.deployerWallet = new Wallet(opts.deployerPrivateKey, this.provider);
    this.nonceManager = new NonceManager(this.deployerWallet);
    this.paymentWallet = new Wallet(opts.paymentPrivateKey, this.provider);
    this.passportRegistry = opts.passportRegistryAddress;
    this.sessionRegistry = opts.sessionRegistryAddress;
    this.paymentAsset = opts.paymentAsset;
    this.sseHub = opts.sseHub;
  }

  async spawnAgent(opts: SpawnAgentOpts): Promise<SpawnedAgent> {
    const id = `agent-${randomUUID().slice(0, 8)}`;
    const wallet = Wallet.createRandom().connect(this.provider);

    const agent: SpawnedAgent = {
      id,
      role: opts.role,
      wallet,
      address: wallet.address,
      status: "spawning",
      createdAt: Date.now(),
    };

    this.agents.set(id, agent);
    this.sseHub.emit({
      type: "agent_spawning",
      agentId: id,
      payload: { role: opts.role, address: wallet.address, step: "wallet_created" },
    });

    try {
      // Step 1: Fund the agent wallet
      const fundingAmount = opts.fundingAmount ?? ethers.parseUnits("0.001", 18);
      const token = new Contract(this.paymentAsset, ERC20_ABI, this.paymentWallet);
      const fundTx = await token.transfer(wallet.address, fundingAmount);
      await fundTx.wait();
      agent.fundingTxHash = fundTx.hash;

      this.sseHub.emit({
        type: "agent_spawning",
        agentId: id,
        payload: { role: opts.role, step: "funded", txHash: fundTx.hash, amount: fundingAmount.toString() },
      });

      // Step 2: Deploy passport via deployer key (NonceManager handles parallel txs)
      const passportContract = new Contract(this.passportRegistry, PASSPORT_ABI, this.nonceManager);
      const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
      const scopes = opts.scopes.map((s) => ethers.id(s));
      const services = (opts.services ?? ["gateway", "planner"]).map((s) => ethers.id(s));

      const passportTx = await passportContract.upsertPassport(
        wallet.address,
        expiresAt,
        ethers.parseUnits("1", 18),  // perCallCap: 1 token
        ethers.parseUnits("10", 18), // dailyCap: 10 tokens
        30,                           // rateLimitPerMin
        scopes,
        services,
      );
      await passportTx.wait();
      agent.passportTxHash = passportTx.hash;

      this.sseHub.emit({
        type: "agent_spawning",
        agentId: id,
        payload: { role: opts.role, step: "passport_deployed", txHash: passportTx.hash },
      });

      // Step 3: Grant session (agent is its own session key for simplicity)
      const sessionContract = new Contract(this.sessionRegistry, SESSION_ABI, this.nonceManager);
      const sessionTx = await sessionContract.grantSession(
        wallet.address,
        wallet.address,
        expiresAt,
        scopes,
      );
      await sessionTx.wait();
      agent.sessionTxHash = sessionTx.hash;

      this.sseHub.emit({
        type: "agent_spawning",
        agentId: id,
        payload: { role: opts.role, step: "session_granted", txHash: sessionTx.hash },
      });

      // Mark as active
      agent.status = "active";
      this.sseHub.emit({
        type: "agent_spawned",
        agentId: id,
        payload: {
          role: opts.role,
          address: wallet.address,
          fundingTxHash: agent.fundingTxHash,
          passportTxHash: agent.passportTxHash,
          sessionTxHash: agent.sessionTxHash,
        },
      });

      return agent;
    } catch (err) {
      agent.status = "failed";
      this.sseHub.emit({
        type: "agent_spawning",
        agentId: id,
        payload: { role: opts.role, step: "failed", error: (err as Error).message },
      });
      throw err;
    }
  }

  async revokeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const passportContract = new Contract(this.passportRegistry, PASSPORT_ABI, this.nonceManager);
    const tx = await passportContract.revokePassport(agent.address);
    await tx.wait();

    agent.status = "revoked";
    this.sseHub.emit({
      type: "agent_status",
      agentId,
      payload: { status: "revoked", txHash: tx.hash },
    });
  }

  getSpawnedAgents(): SpawnedAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(agentId: string): SpawnedAgent | undefined {
    return this.agents.get(agentId);
  }
}
