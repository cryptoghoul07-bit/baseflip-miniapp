const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("\n========================================");
    console.log("Your Deployer Wallet Address:");
    console.log(deployer.address);
    console.log("========================================\n");
    console.log("Visit this URL to see your recent transactions:");
    console.log(`https://sepolia.basescan.org/address/${deployer.address}`);
    console.log("\nLook for the most recent 'Contract Creation' transaction");
    console.log("Click on it to see the deployed contract address");
    console.log("========================================\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
