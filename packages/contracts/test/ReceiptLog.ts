import { expect } from "chai";
import { ethers } from "hardhat";

describe("ReceiptLog", function () {
  it("records once per actionId", async function () {
    const [admin, gateway, agent, payer, asset] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("ReceiptLog");
    const receiptLog = (await factory.deploy(admin.address, gateway.address)) as any;
    await receiptLog.waitForDeployment();

    const actionId = ethers.id("action-1");
    await receiptLog
      .connect(gateway)
      .recordReceipt(actionId, agent.address, payer.address, asset.address, 100n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"));

    await expect(
      receiptLog
        .connect(gateway)
        .recordReceipt(actionId, agent.address, payer.address, asset.address, 100n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"))
    ).to.be.revertedWith("action already recorded");
  });

  it("enforces gateway role for writing receipts", async function () {
    const [admin, gateway, outsider, agent, payer, asset] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("ReceiptLog");
    const receiptLog = (await factory.deploy(admin.address, gateway.address)) as any;
    await receiptLog.waitForDeployment();

    await expect(
      receiptLog
        .connect(outsider)
        .recordReceipt(ethers.id("action-2"), agent.address, payer.address, asset.address, 100n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"))
    ).to.be.reverted;
  });

  it("allows admin to rotate gateway role", async function () {
    const [admin, gateway, newGateway, agent, payer, asset] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("ReceiptLog");
    const receiptLog = (await factory.deploy(admin.address, gateway.address)) as any;
    await receiptLog.waitForDeployment();

    await receiptLog.connect(admin).setGateway(newGateway.address, true);
    await receiptLog.connect(admin).setGateway(gateway.address, false);

    await expect(
      receiptLog
        .connect(gateway)
        .recordReceipt(ethers.id("action-3"), agent.address, payer.address, asset.address, 100n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"))
    ).to.be.reverted;

    await expect(
      receiptLog
        .connect(newGateway)
        .recordReceipt(ethers.id("action-3"), agent.address, payer.address, asset.address, 100n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"))
    ).to.not.be.reverted;
  });

  it("rejects invalid receipt inputs", async function () {
    const [admin, gateway, agent, payer] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("ReceiptLog");
    const receiptLog = (await factory.deploy(admin.address, gateway.address)) as any;
    await receiptLog.waitForDeployment();

    await expect(
      receiptLog
        .connect(gateway)
        .recordReceipt(ethers.id("action-4"), ethers.ZeroAddress, payer.address, agent.address, 100n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"))
    ).to.be.revertedWith("invalid agent");

    await expect(
      receiptLog
        .connect(gateway)
        .recordReceipt(ethers.id("action-5"), agent.address, ethers.ZeroAddress, agent.address, 100n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"))
    ).to.be.revertedWith("invalid payer");

    await expect(
      receiptLog
        .connect(gateway)
        .recordReceipt(ethers.id("action-6"), agent.address, payer.address, ethers.ZeroAddress, 100n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"))
    ).to.be.revertedWith("invalid asset");

    await expect(
      receiptLog
        .connect(gateway)
        .recordReceipt(ethers.id("action-7"), agent.address, payer.address, agent.address, 0n, ethers.id("route"), ethers.id("settle"), ethers.id("meta"))
    ).to.be.revertedWith("invalid amount");
  });

  it("reverts when reading unknown receipt id", async function () {
    const [admin, gateway] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ReceiptLog");
    const receiptLog = (await factory.deploy(admin.address, gateway.address)) as any;
    await receiptLog.waitForDeployment();

    await expect(receiptLog.getReceipt(ethers.id("missing-action"))).to.be.revertedWith("receipt missing");
  });
});
