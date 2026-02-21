import { JsonRpcProvider, Contract } from "ethers";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

export function createKiteProvider(rpcUrl?: string) {
  return new JsonRpcProvider(rpcUrl || process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/");
}

export async function getTokenBalance(address: string, assetAddress?: string, rpcUrl?: string): Promise<string> {
  const provider = createKiteProvider(rpcUrl);

  // Check native KITE balance first, fall back to ERC-20 if an asset is explicitly provided
  if (!assetAddress) {
    const nativeBal = await provider.getBalance(address);
    if (nativeBal > 0n) {
      return (Number(nativeBal) / 1e18).toFixed(4);
    }
  }

  // Also check ERC-20 stablecoin balance
  const asset = assetAddress || process.env.NEXT_PUBLIC_PAYMENT_ASSET || "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
  const token = new Contract(asset, ERC20_ABI, provider);
  const raw = await token.balanceOf(address);
  const erc20 = Number(raw) / 1e18;
  if (erc20 > 0) return erc20.toFixed(4);

  // Return native balance as last resort (could be zero)
  const nativeFallback = await provider.getBalance(address);
  return (Number(nativeFallback) / 1e18).toFixed(4);
}
