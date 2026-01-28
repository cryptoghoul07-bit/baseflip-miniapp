const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;
    const BaseFlip = await hre.ethers.getContractFactory("BaseFlip");
    const contract = BaseFlip.attach(contractAddress);

    // Get accumulated fees
    const fees = await contract.collectedFees();
    console.log(`Accumulated Fees: ${hre.ethers.formatEther(fees)} ETH`);

    // Get owner
    const owner = await contract.owner();
    console.log(`Contract Owner: ${owner}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
