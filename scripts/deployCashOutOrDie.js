const hre = require("hardhat");

async function main() {
    console.log("Deploying CashOutOrDie contract...");

    const CashOutOrDie = await hre.ethers.getContractFactory("CashOutOrDie");
    const cashOutOrDie = await CashOutOrDie.deploy();

    await cashOutOrDie.waitForDeployment();

    const address = await cashOutOrDie.getAddress();
    console.log("CashOutOrDie deployed to:", address);

    // Create first game with 0.01 ETH entry fee
    console.log("\nCreating first game with 0.01 ETH entry fee...");
    const tx = await cashOutOrDie.createGame(hre.ethers.parseEther("0.01"));
    await tx.wait();
    console.log("Game #1 created!");

    console.log("\n========================================");
    console.log("DEPLOYMENT COMPLETE");
    console.log("========================================");
    console.log("Contract Address:", address);
    console.log("\nAdd this to your .env.local file:");
    console.log(`NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS=${address}`);
    console.log("========================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
