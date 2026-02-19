import { ethers } from "hardhat";

async function main() {
  const [deployer, gateway] = await ethers.getSigners();

  const PassportRegistry = await ethers.getContractFactory("PassportRegistry");
  const passportRegistry = await PassportRegistry.deploy(deployer.address);
  await passportRegistry.waitForDeployment();

  const SessionRegistry = await ethers.getContractFactory("SessionRegistry");
  const sessionRegistry = await SessionRegistry.deploy(await passportRegistry.getAddress());
  await sessionRegistry.waitForDeployment();

  const ReceiptLog = await ethers.getContractFactory("ReceiptLog");
  const receiptLog = await ReceiptLog.deploy(deployer.address, gateway.address);
  await receiptLog.waitForDeployment();

  console.log("PassportRegistry:", await passportRegistry.getAddress());
  console.log("SessionRegistry:", await sessionRegistry.getAddress());
  console.log("ReceiptLog:", await receiptLog.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
