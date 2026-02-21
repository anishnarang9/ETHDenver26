import { JsonRpcProvider, Contract } from "ethers";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

export function createKiteProvider(rpcUrl?: string) {
  return new JsonRpcProvider(rpcUrl || process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/");
}

export async function getTokenBalance(address: string, assetAddress?: string, rpcUrl?: string): Promise<string> {
  const provider = createKiteProvider(rpcUrl);
  let nativeVal = 0;
  let erc20Val = 0;

  // Check native KITE balance
  try {
    const nativeBal = await provider.getBalance(address);
    nativeVal = Number(nativeBal) / 1e18;
  } catch (err) {
    console.warn("[kite-rpc] native balance fetch failed for", address, err);
  }

  // Check ERC-20 stablecoin balance
  try {
    const asset = assetAddress || process.env.NEXT_PUBLIC_PAYMENT_ASSET || "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
    const token = new Contract(asset, ERC20_ABI, provider);
    const raw = await token.balanceOf(address);
    erc20Val = Number(raw) / 1e18;
  } catch (err) {
    console.warn("[kite-rpc] ERC-20 balance fetch failed for", address, err);
  }

  // Return whichever is higher
  const best = Math.max(nativeVal, erc20Val);
  return best.toFixed(4);
}
