import { expect } from "chai";
import { ethers } from "hardhat";

describe("PassportRegistry", function () {
  it("creates, updates, and revokes a passport", async function () {
    const [owner, _, agentSigner] = await ethers.getSigners();
    const agent = agentSigner.address;

    const factory = await ethers.getContractFactory("PassportRegistry");
    const registry = (await factory.deploy(owner.address)) as any;
    await registry.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const scope = ethers.id("enrich.wallet");
    const service = ethers.id("internal.enrich");

    await registry.upsertPassport(agent, now + 3600, 1000n, 10000n, 60, [scope], [service]);

    const details = await registry.getPassport(agent);
    expect(details[0]).to.equal(owner.address);
    expect(details[6]).to.equal(false);
    expect(await registry.isScopeAllowed(agent, scope)).to.equal(true);
    expect(await registry.isServiceAllowed(agent, service)).to.equal(true);

    await registry.upsertPassport(agent, now + 7200, 1500n, 15000n, 90, [scope], [service]);
    const updated = await registry.getPassport(agent);
    expect(updated[7]).to.equal(2);

    await registry.revokePassport(agent);
    expect(await registry.isScopeAllowed(agent, scope)).to.equal(false);
    expect(await registry.isServiceAllowed(agent, service)).to.equal(false);
  });

  it("blocks non-owner updates and revocations", async function () {
    const [owner, attacker, agentSigner] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("PassportRegistry");
    const registry = (await factory.deploy(owner.address)) as any;
    await registry.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const scope = ethers.id("enrich.wallet");
    const service = ethers.id("internal.enrich");

    await registry.upsertPassport(agentSigner.address, now + 3600, 1000n, 10000n, 60, [scope], [service]);

    await expect(
      registry
        .connect(attacker)
        .upsertPassport(agentSigner.address, now + 3600, 1000n, 10000n, 60, [scope], [service])
    ).to.be.revertedWith("not owner");

    await expect(registry.connect(attacker).revokePassport(agentSigner.address)).to.be.revertedWith("not owner");
  });

  it("replaces policy lists on update", async function () {
    const [owner, _, agentSigner] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("PassportRegistry");
    const registry = (await factory.deploy(owner.address)) as any;
    await registry.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const scopeA = ethers.id("enrich.wallet");
    const scopeB = ethers.id("premium.intel");
    const serviceA = ethers.id("internal.enrich");
    const serviceB = ethers.id("external.premium");

    await registry.upsertPassport(agentSigner.address, now + 3600, 1000n, 10000n, 60, [scopeA], [serviceA]);

    expect(await registry.isScopeAllowed(agentSigner.address, scopeA)).to.equal(true);
    expect(await registry.isScopeAllowed(agentSigner.address, scopeB)).to.equal(false);

    await registry.upsertPassport(agentSigner.address, now + 7200, 1000n, 10000n, 60, [scopeB], [serviceB]);

    expect(await registry.isScopeAllowed(agentSigner.address, scopeA)).to.equal(false);
    expect(await registry.isScopeAllowed(agentSigner.address, scopeB)).to.equal(true);
    expect(await registry.isServiceAllowed(agentSigner.address, serviceA)).to.equal(false);
    expect(await registry.isServiceAllowed(agentSigner.address, serviceB)).to.equal(true);
  });

  it("rejects zero agent and expired passport upserts", async function () {
    const [owner, , agentSigner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("PassportRegistry");
    const registry = (await factory.deploy(owner.address)) as any;
    await registry.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const scope = ethers.id("enrich.wallet");
    const service = ethers.id("internal.enrich");

    await expect(
      registry.upsertPassport(ethers.ZeroAddress, now + 3600, 1000n, 10000n, 60, [scope], [service])
    ).to.be.revertedWith("invalid agent");

    await expect(
      registry.upsertPassport(agentSigner.address, now, 1000n, 10000n, 60, [scope], [service])
    ).to.be.revertedWith("invalid expiry");
  });

  it("reports expiration status after time advances", async function () {
    const [owner, , agentSigner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("PassportRegistry");
    const registry = (await factory.deploy(owner.address)) as any;
    await registry.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const scope = ethers.id("enrich.wallet");
    const service = ethers.id("internal.enrich");

    await registry.upsertPassport(agentSigner.address, now + 5, 1000n, 10000n, 60, [scope], [service]);

    expect(await registry.isExpired(agentSigner.address)).to.equal(false);

    await ethers.provider.send("evm_increaseTime", [6]);
    await ethers.provider.send("evm_mine", []);

    expect(await registry.isExpired(agentSigner.address)).to.equal(true);
  });
});
