import {
  BrowserProvider,
  Contract,
  ethers,
  type Eip1193Provider,
  type JsonRpcSigner,
} from "ethers";

const PASSPORT_ABI = [
  "function upsertPassport(address agent,uint64 expiresAt,uint128 perCallCap,uint128 dailyCap,uint32 rateLimitPerMin,bytes32[] scopes,bytes32[] services)",
  "function revokePassport(address agent)",
];

const SESSION_ABI = [
  "function grantSession(address agent,address session,uint64 expiresAt,bytes32[] scopeSubset)",
];

export interface PassportWriteInput {
  agentAddress: string;
  expiresAt: number;
  perCallCap: string;
  dailyCap: string;
  rateLimitPerMin: number;
  scopes: string[];
  services: string[];
}

const getEthereum = (): Eip1193Provider => {
  const runtime = globalThis as unknown as {
    ethereum?: Eip1193Provider;
    window?: { ethereum?: Eip1193Provider };
  };
  const ethereum = runtime.window?.ethereum ?? runtime.ethereum;
  if (!ethereum) {
    throw new Error("No EVM wallet found. Install or unlock MetaMask.");
  }
  return ethereum;
};

const getRequiredAddress = (value: string | undefined, name: string): `0x${string}` => {
  if (!value || !value.startsWith("0x")) {
    throw new Error(`${name} is missing. Set it in apps/web/.env.local`);
  }
  return value as `0x${string}`;
};

const switchOrAddChain = async (ethereum: Eip1193Provider, expectedChainId: string) => {
  const hexChainId = "0x" + Number(expectedChainId).toString(16);
  try {
    await (ethereum as unknown as { request: (args: { method: string; params: unknown[] }) => Promise<void> }).request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (switchErr: unknown) {
    // Error code 4902 = chain not added yet — try adding it
    if ((switchErr as { code?: number }).code === 4902) {
      const rpcUrl = process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
      const explorer = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || "https://testnet.kitescan.ai";
      await (ethereum as unknown as { request: (args: { method: string; params: unknown[] }) => Promise<void> }).request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: hexChainId,
          chainName: "Kite AI Testnet",
          nativeCurrency: { name: "KITE", symbol: "KITE", decimals: 18 },
          rpcUrls: [rpcUrl],
          blockExplorerUrls: [explorer],
        }],
      });
    } else {
      throw switchErr;
    }
  }
};

const getSigner = async (): Promise<JsonRpcSigner> => {
  const ethereum = getEthereum();
  const provider = new BrowserProvider(ethereum);
  const expectedChainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  const network = await provider.getNetwork();

  if (expectedChainId && Number(network.chainId) !== Number(expectedChainId)) {
    // Auto-switch to the correct chain
    await switchOrAddChain(ethereum, expectedChainId);
    // Re-create provider after chain switch
    const newProvider = new BrowserProvider(ethereum);
    return newProvider.getSigner();
  }

  return provider.getSigner();
};

const buildExplorerLink = (txHash: string): string | null => {
  const base = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL;
  if (!base) {
    return null;
  }
  return `${base.replace(/\/$/, "")}/tx/${txHash}`;
};

export const onchainTestUtils = {
  getEthereum,
  getRequiredAddress,
  switchOrAddChain,
  buildExplorerLink,
};

export const upsertPassportOnchain = async (
  input: PassportWriteInput
): Promise<{ txHash: string; explorerLink: string | null }> => {
  const signer = await getSigner();
  const passportAddress = getRequiredAddress(
    process.env.NEXT_PUBLIC_PASSPORT_REGISTRY_ADDRESS,
    "NEXT_PUBLIC_PASSPORT_REGISTRY_ADDRESS"
  );
  const passport = new Contract(passportAddress, PASSPORT_ABI, signer);

  const tx = await passport.upsertPassport(
    input.agentAddress,
    input.expiresAt,
    BigInt(input.perCallCap),
    BigInt(input.dailyCap),
    input.rateLimitPerMin,
    input.scopes.map((scope) => ethers.id(scope)),
    input.services.map((service) => ethers.id(service))
  );
  await tx.wait();

  return {
    txHash: tx.hash as string,
    explorerLink: buildExplorerLink(tx.hash),
  };
};

export const grantSessionOnchain = async (input: {
  agentAddress: string;
  sessionAddress: string;
  expiresAt: number;
  scopes: string[];
}): Promise<{ txHash: string; explorerLink: string | null }> => {
  const signer = await getSigner();
  const sessionAddress = getRequiredAddress(
    process.env.NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS,
    "NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS"
  );
  const sessionContract = new Contract(sessionAddress, SESSION_ABI, signer);

  const tx = await sessionContract.grantSession(
    input.agentAddress,
    input.sessionAddress,
    input.expiresAt,
    input.scopes.map((scope) => ethers.id(scope))
  );
  await tx.wait();

  return {
    txHash: tx.hash as string,
    explorerLink: buildExplorerLink(tx.hash),
  };
};

export const revokePassportOnchain = async (input: {
  agentAddress: string;
}): Promise<{ txHash: string; explorerLink: string | null }> => {
  const signer = await getSigner();
  const passportAddress = getRequiredAddress(
    process.env.NEXT_PUBLIC_PASSPORT_REGISTRY_ADDRESS,
    "NEXT_PUBLIC_PASSPORT_REGISTRY_ADDRESS"
  );
  const passport = new Contract(passportAddress, PASSPORT_ABI, signer);

  const tx = await passport.revokePassport(input.agentAddress);
  await tx.wait();

  return {
    txHash: tx.hash as string,
    explorerLink: buildExplorerLink(tx.hash),
  };
};
