export async function settleViaPieverse(opts: {
  facilitatorUrl: string;
  authorization: unknown;
  signature: string;
  network: "kite-testnet";
}): Promise<{ txHash: string; settled: boolean }> {
  const res = await fetch(`${opts.facilitatorUrl}/v2/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authorization: opts.authorization,
      signature: opts.signature,
      network: opts.network,
    }),
  });
  if (!res.ok) throw new Error(`Pieverse settle failed: ${res.status}`);
  return res.json() as Promise<{ txHash: string; settled: boolean }>;
}

export async function verifyViaPieverse(opts: {
  facilitatorUrl: string;
  authorization: unknown;
  signature: string;
  network: "kite-testnet";
}): Promise<{ valid: boolean; reason?: string }> {
  const res = await fetch(`${opts.facilitatorUrl}/v2/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authorization: opts.authorization,
      signature: opts.signature,
      network: opts.network,
    }),
  });
  if (!res.ok) throw new Error(`Pieverse verify failed: ${res.status}`);
  return res.json() as Promise<{ valid: boolean; reason?: string }>;
}
