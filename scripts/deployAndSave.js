const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("Deploying...");
    const CashOutOrDie = await hre.ethers.getContractFactory("CashOutOrDie");
    const contract = await CashOutOrDie.deploy();
    await contract.waitForDeployment();
    const address = await contract.getAddress();

    console.log("Deployed to:", address);
    fs.writeFileSync('deployed_address.txt', address.trim());

    // Create Game #1
    const tx = await contract.createGame(hre.ethers.parseEther("0.01"));
    await tx.wait();
    console.log("Game created.");
}

main().catch(console.error);
