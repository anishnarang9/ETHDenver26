import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { loadConfig } from "../src/config.js";

interface SpendSnapshot {
  date: string;
  gatewayAddress: string;
  rpcUrl: string;
  startBalanceWei: string;
  lastBalanceWei: string;
  maxKiteSpendPerDay: string;
  updatedAt: string;
}

const dayKey = () => new Date().toISOString().slice(0, 10);
const snapshotPath = (date: string) => `/tmp/kite-stack-spend-${date}.json`;

const readSnapshot = (path: string): SpendSnapshot | null => {
  if (!existsSync(path)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as SpendSnapshot;
  return parsed;
};

const main = async () => {
  const config = loadConfig();
  const provider = new JsonRpcProvider(config.KITE_RPC_URL);
  const wallet = new Wallet(config.GATEWAY_SIGNER_PRIVATE_KEY, provider);
  const date = dayKey();
  const path = snapshotPath(date);
  const balanceWei = await provider.getBalance(wallet.address);

  const current = readSnapshot(path);
  const maxKite = parseEther(config.MAX_KITE_SPEND_PER_DAY);

  const snapshot: SpendSnapshot =
    current &&
    current.gatewayAddress.toLowerCase() === wallet.address.toLowerCase() &&
    current.rpcUrl === config.KITE_RPC_URL
      ? {
          ...current,
          lastBalanceWei: balanceWei.toString(),
          maxKiteSpendPerDay: config.MAX_KITE_SPEND_PER_DAY,
          updatedAt: new Date().toISOString(),
        }
      : {
          date,
          gatewayAddress: wallet.address,
          rpcUrl: config.KITE_RPC_URL,
          startBalanceWei: balanceWei.toString(),
          lastBalanceWei: balanceWei.toString(),
          maxKiteSpendPerDay: config.MAX_KITE_SPEND_PER_DAY,
          updatedAt: new Date().toISOString(),
        };

  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const spentWei = BigInt(snapshot.startBalanceWei) > balanceWei ? BigInt(snapshot.startBalanceWei) - balanceWei : 0n;
  const spentHuman = formatEther(spentWei);

  if (spentWei > maxKite) {
    console.error(
      `[spend-check] FAIL gateway=${wallet.address} spent=${spentHuman} KITE max=${config.MAX_KITE_SPEND_PER_DAY} KITE`
    );
    process.exit(1);
  }

  console.log(
    `[spend-check] OK gateway=${wallet.address} spent=${spentHuman} KITE max=${config.MAX_KITE_SPEND_PER_DAY} KITE`
  );
  console.log(`[spend-check] snapshot=${path}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
