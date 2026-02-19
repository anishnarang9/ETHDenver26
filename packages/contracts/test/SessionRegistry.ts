import { expect } from "chai";
import { ethers } from "hardhat";

describe("SessionRegistry", function () {
  const setup = async () => {
    const [owner, sessionSigner, agentSigner, attacker] = await ethers.getSigners();

    const passportFactory = await ethers.getContractFactory("PassportRegistry");
    const passport = (await passportFactory.deploy(owner.address)) as any;
    await passport.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await passport.upsertPassport(
      agentSigner.address,
      now + 3600,
      1000n,
      10000n,
      30,
      [ethers.id("enrich.wallet"), ethers.id("premium.intel")],
      [ethers.id("internal.enrich")]
    );

    const sessionFactory = await ethers.getContractFactory("SessionRegistry");
    const sessions = (await sessionFactory.deploy(await passport.getAddress())) as any;
    await sessions.waitForDeployment();

    return { owner, sessionSigner, agentSigner, attacker, sessions, passport, now };
  };

  it("grants and revokes session scope subset", async function () {
    const { sessionSigner, agentSigner, sessions, now } = await setup();

    await sessions.grantSession(
      agentSigner.address,
      sessionSigner.address,
      now + 1800,
      [ethers.id("enrich.wallet")]
    );

    expect(await sessions.isSessionActive(sessionSigner.address)).to.equal(true);
    expect(await sessions.hasScope(sessionSigner.address, ethers.id("enrich.wallet"))).to.equal(true);
    expect(await sessions.hasScope(sessionSigner.address, ethers.id("premium.intel"))).to.equal(false);

    await sessions.revokeSession(sessionSigner.address);
    expect(await sessions.isSessionActive(sessionSigner.address)).to.equal(false);
  });

  it("requires passport owner to grant sessions", async function () {
    const { sessionSigner, agentSigner, sessions, attacker, now } = await setup();

    await expect(
      sessions
        .connect(attacker)
        .grantSession(agentSigner.address, sessionSigner.address, now + 1800, [ethers.id("enrich.wallet")])
    ).to.be.revertedWith("not owner");
  });

  it("allows wildcard scope when scope subset is empty", async function () {
    const { sessionSigner, agentSigner, sessions, now } = await setup();

    await sessions.grantSession(agentSigner.address, sessionSigner.address, now + 1800, []);

    expect(await sessions.hasScope(sessionSigner.address, ethers.id("enrich.wallet"))).to.equal(true);
    expect(await sessions.hasScope(sessionSigner.address, ethers.id("premium.intel"))).to.equal(true);
  });

  it("updates scope subset on re-grant", async function () {
    const { sessionSigner, agentSigner, sessions, now } = await setup();

    await sessions.grantSession(
      agentSigner.address,
      sessionSigner.address,
      now + 1800,
      [ethers.id("enrich.wallet")]
    );

    await sessions.grantSession(
      agentSigner.address,
      sessionSigner.address,
      now + 2000,
      [ethers.id("premium.intel")]
    );

    expect(await sessions.hasScope(sessionSigner.address, ethers.id("enrich.wallet"))).to.equal(false);
    expect(await sessions.hasScope(sessionSigner.address, ethers.id("premium.intel"))).to.equal(true);
  });
});
