import { Wallet, hexlify, randomBytes } from "ethers";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  PaymentRequirementsV1,
  SchemeNetworkClient,
} from "@x402/core/types";

const TRANSFER_AUTH_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "token", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

type GokiteAaAuthorization = {
  from: string;
  to: string;
  token: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
};

type GokiteAaPayload = {
  signature: `0x${string}`;
  authorization: GokiteAaAuthorization;
  sessionId?: string;
};

type V1PaymentPayload = Pick<PaymentPayload, "x402Version" | "payload"> & {
  scheme: string;
  network: Network;
};

export type GokiteAaSchemeClientOptions = {
  signer: Wallet;
  chainId: bigint;
  payerAddress?: `0x${string}`;
  sessionId?: string;
};

const resolveAmount = (requirements: PaymentRequirements): string => {
  const v1Requirements = requirements as unknown as PaymentRequirementsV1;
  if (typeof v1Requirements.maxAmountRequired === "string" && v1Requirements.maxAmountRequired.length > 0) {
    return v1Requirements.maxAmountRequired;
  }

  const v2Amount = (requirements as { amount?: unknown }).amount;
  if (typeof v2Amount === "string" && v2Amount.length > 0) {
    return v2Amount;
  }

  throw new Error("payment requirements missing maxAmountRequired/amount for gokite-aa payload");
};

const resolveTimeoutSeconds = (requirements: PaymentRequirements): bigint => {
  const v1Requirements = requirements as unknown as PaymentRequirementsV1;
  if (
    typeof v1Requirements.maxTimeoutSeconds === "number" &&
    Number.isFinite(v1Requirements.maxTimeoutSeconds) &&
    v1Requirements.maxTimeoutSeconds > 0
  ) {
    return BigInt(v1Requirements.maxTimeoutSeconds);
  }
  return 300n;
};

export class GokiteAaSchemeClient implements SchemeNetworkClient {
  readonly scheme = "gokite-aa";

  private readonly signer: Wallet;
  private readonly chainId: bigint;
  private readonly payerAddress?: `0x${string}`;
  private readonly sessionId?: string;

  constructor(options: GokiteAaSchemeClientOptions) {
    this.signer = options.signer;
    this.chainId = options.chainId;
    this.payerAddress = options.payerAddress;
    this.sessionId = options.sessionId;
  }

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements
  ): Promise<V1PaymentPayload> {
    if (x402Version !== 1) {
      throw new Error(`gokite-aa adapter only supports x402Version=1, received ${x402Version}`);
    }

    const amount = resolveAmount(paymentRequirements);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const timeoutSeconds = resolveTimeoutSeconds(paymentRequirements);
    const payerAddress = this.payerAddress ?? (this.signer.address as `0x${string}`);

    const authorization: GokiteAaAuthorization = {
      from: payerAddress,
      to: paymentRequirements.payTo,
      token: paymentRequirements.asset,
      value: amount,
      validAfter: (nowSeconds - 60n).toString(),
      validBefore: (nowSeconds + timeoutSeconds).toString(),
      nonce: hexlify(randomBytes(32)) as `0x${string}`,
    };

    const signature = await this.signer.signTypedData(
      {
        name: "GokiteAccount",
        version: "1",
        chainId: this.chainId,
        verifyingContract: payerAddress,
      },
      TRANSFER_AUTH_TYPES,
      {
        from: authorization.from,
        to: authorization.to,
        token: authorization.token,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      }
    );

    const payload: GokiteAaPayload = {
      signature: signature as `0x${string}`,
      authorization,
    };

    if (this.sessionId) {
      payload.sessionId = this.sessionId;
    }

    return {
      x402Version: 1,
      scheme: this.scheme,
      network: paymentRequirements.network,
      payload,
    };
  }
}
