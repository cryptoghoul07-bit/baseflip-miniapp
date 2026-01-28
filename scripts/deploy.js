const hre = require("hardhat");

async function main() {
    console.log("Deploying BaseFlip contract...");

    const BaseFlip = await hre.ethers.getContractFactory("BaseFlip");
    const baseFlip = await BaseFlip.deploy();

    await baseFlip.waitForDeployment();

    const address = await baseFlip.getAddress();
    console.log("BaseFlip deployed to:", address);
    console.log("Save this address to your .env file as NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS");

    // Get current round info
    const currentRound = await baseFlip.getCurrentRound();
    console.log("\nInitial Round Info:");
    console.log("- Round ID:", currentRound[0].toString());
    console.log("- Level ID:", currentRound[1].toString());
    console.log("- Pool A:", hre.ethers.formatEther(currentRound[2]), "ETH");
    console.log("- Pool B:", hre.ethers.formatEther(currentRound[3]), "ETH");
    console.log("- Target Size:", hre.ethers.formatEther(currentRound[4]), "ETH");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
