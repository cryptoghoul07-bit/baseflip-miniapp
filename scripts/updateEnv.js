const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const addressPath = path.join(__dirname, '../deployed_address.txt');

try {
    const newAddress = fs.readFileSync(addressPath, 'utf8').trim();
    console.log("New Address:", newAddress);

    let envContent = fs.readFileSync(envPath, 'utf8');

    // Regex to find and replace the line
    const regex = /^NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS=.*$/m;

    if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS=${newAddress}`);
        console.log("Updated existing entry.");
    } else {
        envContent += `\nNEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS=${newAddress}`;
        console.log("Appended new entry.");
    }

    fs.writeFileSync(envPath, envContent);
    console.log("Successfully updated .env.local");

} catch (err) {
    console.error("Error:", err);
}
