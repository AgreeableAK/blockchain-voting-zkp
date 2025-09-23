// zk/create-identity.js
import fs from "fs";
import crypto from "crypto";
import { Identity } from "@semaphore-protocol/identity";
import readline from "readline";

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(question, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function main() {
  try {
    // Ask if user wants a random seed or custom
    const choice = await prompt("Do you want to generate a random seed? (y/N): ");
    let seed;
    if (choice.toLowerCase() === 'y' || choice.toLowerCase() === 'yes') {
      seed = crypto.randomBytes(32).toString("hex");
    } else {
      seed = await prompt("Enter your custom seed string: ");
    }

    // Create identity from seed
    const voterIdentity = new Identity(seed.trim());

    console.log("\n🎉 New Identity Created!");
    console.log("📝 SAVE THIS SEED (your identity secret):", seed);
    console.log("🔐 Commitment:", voterIdentity.commitment.toString());

    // Optional: save commitment and seed locally
    const saveFile = await prompt("Save identity to file? (y/N): ");
    if (saveFile.toLowerCase() === 'y' || saveFile.toLowerCase() === 'yes') {
      const filePath = `zk/identity_${Date.now()}.json`;
      fs.writeFileSync(filePath, JSON.stringify({
        seed: seed,
        commitment: voterIdentity.commitment.toString()
      }, null, 2));
      console.log("✅ Identity saved to:", filePath);
    }

  } catch (err) {
    console.error("❌ Error:", err);
  }
}

main();
