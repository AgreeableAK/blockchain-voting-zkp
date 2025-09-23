// zk/generate-proof.js
import fs from "fs";
import readline from "readline";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

// Helper function for prompts
async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

// Load or create voter identity from seed
async function loadIdentity() {
  const choice = await prompt("Do you want to:\n1. Enter existing seed\n2. Generate a new seed\nEnter choice (1/2): ");
  if (choice === "1") {
    const seedInput = await prompt("Enter your identity seed: ");
    return new Identity(seedInput.trim());
  } else if (choice === "2") {
    const crypto = await import("crypto");
    const seed = crypto.randomBytes(32).toString("hex");
    const voterIdentity = new Identity(seed);
    console.log("\n🎉 New Identity Created!");
    console.log("📝 SAVE THIS SEED (your identity secret):", seed);
    console.log("🔐 Commitment:", voterIdentity.commitment.toString());
    return voterIdentity;
  } else {
    throw new Error("Invalid choice");
  }
}

async function main() {
  try {
    // Load voter identity
    const voterIdentity = await loadIdentity();

    // Load group
    const groupFile = await prompt("Enter group file path (e.g., zk/group.json): ");
    const groupData = JSON.parse(fs.readFileSync(groupFile));
    const members = groupData.members.map(m => BigInt(m));
    const group = new Group(members, groupData.depth);

    console.log(`\n👥 Current group has ${group.members.length} members`);

    // Check if identity commitment is in the group
    const memberIndex = group.indexOf(voterIdentity.commitment);
    if (memberIndex === -1) {
      throw new Error("❌ Identity commitment not found in group! Make sure you use the correct seed.");
    }
    console.log("✅ Voter commitment found in group at index:", memberIndex);

    // Candidate ID (signal)
    const candidateInput = await prompt("Enter candidate ID to vote for: ");
    const candidateId = BigInt(candidateInput);

    // External nullifier
    const EXTERNAL_NULLIFIER = BigInt(1);

    console.log("\n⏳ Generating proof... (this may take a few seconds)");

    // Generate proof
    const fullProof = await generateProof(voterIdentity, group, EXTERNAL_NULLIFIER, candidateId, groupData.depth);

    const proofData = {
      proof: fullProof,
      publicSignals: {
        merkleRoot: fullProof.merkleTreeRoot.toString(),
        nullifierHash: fullProof.nullifier.toString(),
        signal: fullProof.scope.toString(),
        externalNullifier: fullProof.message.toString()
      },
      identityCommitment: voterIdentity.commitment.toString(),
      timestamp: new Date().toISOString(),
      proofId: `proof_${Date.now()}_${Math.random().toString(36).substr(2,9)}`
    };

    // Save proof
    const proofFilePath = "zk/proof.json";
    let allProofs = [];
    if (fs.existsSync(proofFilePath)) allProofs = JSON.parse(fs.readFileSync(proofFilePath));
    allProofs.push(proofData);
    fs.writeFileSync(proofFilePath, JSON.stringify(allProofs, null, 2));

    console.log("\n✅ Proof generated successfully!");
    console.log("🆔 Proof ID:", proofData.proofId);
    console.log("📊 Merkle Root:", proofData.publicSignals.merkleRoot);
    console.log("🔒 Nullifier Hash:", proofData.publicSignals.nullifierHash);
    console.log("🗳️ Vote for candidate:", proofData.publicSignals.signal);
    console.log("📈 Total proofs in file:", allProofs.length);

  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
  }
}

main();


//--------------------------------------

// // zk/generate-proof.js
// import fs from "fs";
// import path from "path";
// import readline from "readline";
// import { Identity } from "@semaphore-protocol/identity";
// import { Group } from "@semaphore-protocol/group";
// import { generateProof } from "@semaphore-protocol/proof";

// function argValue(flag) {
//   const idx = process.argv.indexOf(flag);
//   if (idx === -1) return null;
//   return process.argv[idx + 1] || null;
// }

// async function prompt(question) {
//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });
//   return new Promise(resolve => rl.question(question, ans => {
//     rl.close();
//     resolve(ans);
//   }));
// }

// function safeStringifyIdentity(identity) {
//   try {
//     // some Identity implementations have .toString() or .serialize()
//     if (typeof identity.toString === "function") {
//       const t = identity.toString();
//       if (typeof t === "string" && !t.includes("[object")) return t;
//     }
//     if (typeof identity.serialize === "function") {
//       const s = identity.serialize();
//       if (typeof s === "string") return s;
//     }
//     return JSON.stringify(identity);
//   } catch (e) {
//     return String(identity);
//   }
// }

// function getRootFromGroupData(groupData, groupObj) {
//   if (groupData.root) return groupData.root.toString();
//   if (groupObj) {
//     if (typeof groupObj.root !== "undefined") return groupObj.root.toString?.() ?? String(groupObj.root);
//     if (typeof groupObj.merkleRoot !== "undefined") return groupObj.merkleRoot.toString?.() ?? String(groupObj.merkleRoot);
//     if (typeof groupObj.getRoot === "function") return groupObj.getRoot().toString();
//   }
//   return null;
// }

// async function main() {
//   try {
//     // determine group file path - allow override via --group
//     const supplied = argValue("--group") || argValue("-g");
//     // prefer snapshot file if exists and no explicit --group given
//     let groupFilePath = supplied || (fs.existsSync("zk/group_snapshot.json") ? "zk/group_snapshot.json" : "zk/group.json");
//     if (!fs.existsSync(groupFilePath)) {
//       console.log(`❌ Group file not found at ${groupFilePath}`);
//       process.exit(1);
//     }

//     const groupData = JSON.parse(fs.readFileSync(groupFilePath, "utf8"));
//     const members = (groupData.members || []).map(m => BigInt(m));
//     const group = new Group(members, groupData.depth || 20);

//     console.log("Loaded group file:", groupFilePath);
//     console.log("Current group has", group.members.length, "members");

//     // Ask user what they want to do
//     const choice = await prompt("Choose option:\n1. Create new identity and add to group\n2. Use existing identity secret\n3. Just check if commitment is in group\nEnter choice (1/2/3): ");

//     let voterIdentity;

//     // If snapshot is frozen, we should not mutate it
//     const isFrozenSnapshot = Boolean(groupData.frozen === true);

//     if (choice === "1") {
//       // Create new identity
//       voterIdentity = new Identity();
//       // const identityStr = safeStringifyIdentity(voterIdentity);
//       // console.log("\n🎉 New identity created!");
//       // console.log("📝 Secret (SAVE THIS!!!!!):", JSON.stringify(voterIdentity.toJSON()));

//       // console.log("📝 Secret (SAVE THIS!):", identityStr);
      
//       // Save identity
//     // const identitySecret = JSON.stringify({
//     //   trapdoor: voterIdentity.trapdoor.toString(),
//     //   nullifier: voterIdentity.nullifier.toString()
//     // });
//     // console.log("📝 Secret (SAVE THIS!):", identitySecret);

// const identitySecret = voterIdentity.getSecret
//   ? voterIdentity.getSecret()  // if the method exists
//   : voterIdentity.toString();  // fallback
// console.log("📝 Secret (SAVE THIS!):", identitySecret);

// // After creating a new identity
// // const identitySecret = {
// //   trapdoor: voterIdentity.trapdoor.toString(),
// //   nullifier: voterIdentity.nullifier.toString()
// // };

// console.log("📝 Secret (SAVE THIS!):", JSON.stringify(identitySecret));


//       console.log("🔐 Commitment:", voterIdentity.commitment.toString());

//       if (isFrozenSnapshot) {
//         console.log("\n🔒 This group snapshot is frozen. I will NOT add the new identity to the snapshot file.");
//         console.log("If you need this new identity to be part of the group, add its commitment to the registration list before finalizing (or create a new snapshot).");
//       } else {
//         // mutate live group (only if not frozen snapshot)
//         group.addMember(voterIdentity.commitment);
//         groupData.members = group.members.map(m => m.toString());
//         fs.writeFileSync(groupFilePath, JSON.stringify(groupData, null, 2));
//         console.log("✅ New identity added to group and", groupFilePath, "updated!");
//       }
//     } else if (choice === "2") {
//       // Use existing identity
//       const secretInput = await prompt("Enter your identity secret: ");
//       voterIdentity = new Identity(secretInput);
//       console.log("🔐 Your identity commitment:", voterIdentity.commitment.toString());
//     } else if (choice === "3") {
//       const commitmentInput = await prompt("Enter commitment to check: ");
//       const commitment = BigInt(commitmentInput);
//       const index = group.indexOf(commitment);
//       if (index === -1) {
//         console.log("❌ Commitment NOT found in group");
//       } else {
//         console.log("✅ Commitment found in group at index:", index);
//       }
//       return;
//     } else {
//       throw new Error("Invalid choice");
//     }

//     // Check if commitment is in the group
//     const memberIndex = group.indexOf(voterIdentity.commitment);
//     if (memberIndex === -1) {
//       throw new Error("Identity commitment not found in group! If you chose option 2, make sure your secret is correct.");
//     }

//     console.log("✅ Voter commitment found in group at index:", memberIndex);

//     // Candidate ID (signal)
//     const candidateInput = await prompt("Enter candidate ID to vote for: ");
//     const candidateId = BigInt(candidateInput);

//     // External nullifier
//     const EXTERNAL_NULLIFIER = BigInt(1);

//     console.log("⏳ Generating proof... (this may take a few seconds)");

//     // Check for local circuit files (informational only)
//     const wasmPath = "./zk/semaphore.wasm";
//     const zkeyPath = "./zk/semaphore.zkey";

//     if (!fs.existsSync(wasmPath)) {
//       console.log("⚠️ WASM file not found at", wasmPath);
//       console.log("Attempting to generate proof without local circuit files...");
//     }
//     if (!fs.existsSync(zkeyPath)) {
//       console.log("⚠️ ZKEY file not found at", zkeyPath);
//     }

//     // Generate proof using provided API
//     const fullProof = await generateProof(
//       voterIdentity,
//       group,
//       EXTERNAL_NULLIFIER,
//       candidateId,
//       groupData.depth || 20
//     );

//     console.log("🔍 Debugging proof object:");
//     console.log("Type of fullProof:", typeof fullProof);
//     console.log("fullProof keys:", fullProof ? Object.keys(fullProof) : "undefined");
//     // Avoid printing massive object in production; keep for debug
//     // console.log("fullProof:", fullProof);

//     if (!fullProof) throw new Error("Proof generation failed - returned undefined");

//     // Build proofData similarly to your original logic but ensure root is taken from snapshot
//     const rootStr = getRootFromGroupData(groupData, group) || (fullProof.merkleTreeRoot?.toString?.() ?? "unknown");

//     // pick fields from fullProof (handle multiple shapes)
//     let publicSignals = {
//       merkleRoot: rootStr,
//       nullifierHash: fullProof.nullifier?.toString?.() || fullProof.publicSignals?.nullifierHash || "unknown",
//       signal: fullProof.scope?.toString?.() || fullProof.publicSignals?.signal || candidateId.toString(),
//       externalNullifier: fullProof.message?.toString?.() || fullProof.publicSignals?.externalNullifier || EXTERNAL_NULLIFIER.toString()
//     };

//     const proofData = {
//       proof: fullProof,
//       publicSignals,
//       identityCommitment: voterIdentity.commitment.toString(),
//       identitySecret: safeStringifyIdentity(voterIdentity),
//       timestamp: new Date().toISOString(),
//       proofId: `proof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
//     };

//     // Save to proof file (same as your logic)
//     const proofFilePath = "zk/proof.json";
//     let allProofs = [];
//     if (fs.existsSync(proofFilePath)) {
//       try {
//         const existingData = JSON.parse(fs.readFileSync(proofFilePath));
//         allProofs = Array.isArray(existingData) ? existingData : [existingData];
//       } catch (err) {
//         console.log("⚠️ Could not read existing proof file, creating new one");
//         allProofs = [];
//       }
//     }

//     // Check duplicate nullifier
//     const existingNullifier = allProofs.find(p => p.publicSignals?.nullifierHash === proofData.publicSignals.nullifierHash);
//     if (existingNullifier) {
//       console.log("⚠️ WARNING: This nullifier already exists! This might be a double vote attempt.");
//       console.log("Existing proof ID:", existingNullifier.proofId);
//       console.log("Existing timestamp:", existingNullifier.timestamp);
//       const proceed = await prompt("Do you want to continue anyway? (y/N): ");
//       if (proceed.toLowerCase() !== "y" && proceed.toLowerCase() !== "yes") {
//         console.log("❌ Proof generation cancelled");
//         return;
//       }
//     }

//     allProofs.push(proofData);
//     fs.writeFileSync(proofFilePath, JSON.stringify(allProofs, null, 2));

//     console.log("✅ Proof generated and added to zk/proof.json");
//     console.log("🆔 Proof ID:", proofData.proofId);
//     console.log("📊 Merkle Root:", proofData.publicSignals.merkleRoot);
//     console.log("🔒 Nullifier Hash:", proofData.publicSignals.nullifierHash);
//     console.log("🗳️ Vote for candidate:", proofData.publicSignals.signal);
//     console.log("📈 Total proofs in file:", allProofs.length);

//     // Show vote tally (by counting stored proofs' signals)
//     const voteTally = {};
//     allProofs.forEach(proof => {
//       const candidate = proof.publicSignals?.signal || "unknown";
//       voteTally[candidate] = (voteTally[candidate] || 0) + 1;
//     });

//     console.log("\n📊 Current vote tally:");
//     Object.entries(voteTally).forEach(([candidate, votes]) => {
//       console.log(`   Candidate ${candidate}: ${votes} vote${votes !== 1 ? "s" : ""}`);
//     });

//   } catch (err) {
//     console.error("❌ Error:", err.message);
//     console.error(err.stack);
//   }
// }

// main();






//---------------------------------------------working but with a lil problem of group being updated---------------------------
// import fs from "fs";
// import readline from "readline";
// import { Identity } from "@semaphore-protocol/identity";
// import { Group } from "@semaphore-protocol/group";
// import { generateProof } from "@semaphore-protocol/proof";

// async function prompt(question) {
//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });
//   return new Promise(resolve => rl.question(question, ans => {
//     rl.close();
//     resolve(ans);
//   }));
// }

// async function main() {
//   try {
//     // Load group
//     const groupData = JSON.parse(fs.readFileSync("zk/group.json"));
//     const members = groupData.members.map(m => BigInt(m));
//     const group = new Group(members, groupData.depth);

//     console.log("Current group has", group.members.length, "members");
    
//     // Ask user what they want to do
//     const choice = await prompt("Choose option:\n1. Create new identity and add to group\n2. Use existing identity secret\n3. Just check if commitment is in group\nEnter choice (1/2/3): ");
    
//     let voterIdentity;
    
//     if (choice === "1") {
//       // Create new identity and add to group
//       voterIdentity = new Identity();
//       console.log("\n🎉 New identity created!");
//       console.log("📝 Secret (SAVE THIS!):", voterIdentity.toString());
//       console.log("🔐 Commitment:", voterIdentity.commitment.toString());
      
//       // Add the new identity to the group
//       group.addMember(voterIdentity.commitment);
      
//       // Update the group.json file
//       groupData.members = group.members.map(m => m.toString());
//       fs.writeFileSync("zk/group.json", JSON.stringify(groupData, null, 2));
      
//       console.log("✅ New identity added to group and group.json updated!");
      
//     } else if (choice === "2") {
//       // Use existing identity
//       const secretInput = await prompt("Enter your identity secret: ");
//       voterIdentity = new Identity(secretInput);
//       console.log("🔐 Your identity commitment:", voterIdentity.commitment.toString());
      
//     } else if (choice === "3") {
//       // Just check commitment
//       const commitmentInput = await prompt("Enter commitment to check: ");
//       const commitment = BigInt(commitmentInput);
//       const index = group.indexOf(commitment);
//       if (index === -1) {
//         console.log("❌ Commitment NOT found in group");
//       } else {
//         console.log("✅ Commitment found in group at index:", index);
//       }
//       return;
//     } else {
//       throw new Error("Invalid choice");
//     }

//     // Check if commitment is in the group
//     const memberIndex = group.indexOf(voterIdentity.commitment);
//     if (memberIndex === -1) {
//       throw new Error("Identity commitment not found in group! If you chose option 2, make sure your secret is correct.");
//     }

//     console.log("✅ Voter commitment found in group at index:", memberIndex);

//     // Candidate ID (signal)
//     const candidateInput = await prompt("Enter candidate ID to vote for: ");
//     const candidateId = BigInt(candidateInput);

//     // External nullifier
//     const EXTERNAL_NULLIFIER = BigInt(1);

//     console.log("⏳ Generating proof... (this may take a few seconds)");

//     // Check if circuit files exist
//     const wasmPath = "./zk/semaphore.wasm";
//     const zkeyPath = "./zk/semaphore.zkey";
    
//     if (!fs.existsSync(wasmPath)) {
//       console.log("⚠️ WASM file not found at", wasmPath);
//       console.log("Attempting to generate proof without local circuit files...");
//       console.log("This will download the files from the network (may be slower).");
//     }
    
//     if (!fs.existsSync(zkeyPath)) {
//       console.log("⚠️ ZKEY file not found at", zkeyPath);
//     }

//     // Generate proof using the correct Semaphore v3 API
//     const fullProof = await generateProof(
//       voterIdentity, 
//       group, 
//       EXTERNAL_NULLIFIER, 
//       candidateId,
//       groupData.depth
//     );

//     console.log("🔍 Debugging proof object:");
//     console.log("Type of fullProof:", typeof fullProof);
//     console.log("fullProof keys:", fullProof ? Object.keys(fullProof) : "undefined");
//     console.log("fullProof:", fullProof);

//     // Check if proof was generated successfully
//     if (!fullProof) {
//       throw new Error("Proof generation failed - returned undefined");
//     }

//     // Handle different possible proof structures
//     let proofData;
    
//     // This appears to be the actual format your Semaphore version uses
//     if (fullProof.merkleTreeRoot && fullProof.nullifier) {
//       proofData = {
//         proof: fullProof,
//         publicSignals: {
//           merkleRoot: fullProof.merkleTreeRoot.toString(),
//           nullifierHash: fullProof.nullifier.toString(),
//           signal: fullProof.scope.toString(), // 'scope' contains the vote/signal
//           externalNullifier: fullProof.message.toString() // 'message' contains external nullifier
//         },
//         identityCommitment: voterIdentity.commitment.toString(),
//         identitySecret: voterIdentity.toString()
//       };
//     }
//     // Check if it's the new format with proof and publicSignals separated
//     else if (fullProof.proof && fullProof.publicSignals) {
//       proofData = {
//         proof: fullProof.proof,
//         publicSignals: {
//           merkleRoot: fullProof.publicSignals.merkleRoot || fullProof.publicSignals[0],
//           nullifierHash: fullProof.publicSignals.nullifierHash || fullProof.publicSignals[1], 
//           signal: fullProof.publicSignals.signal || fullProof.publicSignals[2],
//           externalNullifier: fullProof.publicSignals.externalNullifier || EXTERNAL_NULLIFIER.toString()
//         },
//         identityCommitment: voterIdentity.commitment.toString(),
//         identitySecret: voterIdentity.toString()
//       };
//     }
//     // Check if it has direct properties (older format)
//     else if (fullProof.merkleRoot || fullProof.nullifierHash || fullProof.signal) {
//       proofData = {
//         proof: fullProof,
//         publicSignals: {
//           merkleRoot: fullProof.merkleRoot?.toString() || "unknown",
//           nullifierHash: fullProof.nullifierHash?.toString() || "unknown",
//           signal: fullProof.signal?.toString() || candidateId.toString(),
//           externalNullifier: EXTERNAL_NULLIFIER.toString()
//         },
//         identityCommitment: voterIdentity.commitment.toString(),
//         identitySecret: voterIdentity.toString()
//       };
//     }
//     // If it's an array format
//     else if (Array.isArray(fullProof) && fullProof.length >= 3) {
//       proofData = {
//         proof: fullProof,
//         publicSignals: {
//           merkleRoot: fullProof[0]?.toString() || "unknown",
//           nullifierHash: fullProof[1]?.toString() || "unknown", 
//           signal: fullProof[2]?.toString() || candidateId.toString(),
//           externalNullifier: EXTERNAL_NULLIFIER.toString()
//         },
//         identityCommitment: voterIdentity.commitment.toString(),
//         identitySecret: voterIdentity.toString()
//       };
//     }
//     else {
//       // Fallback - save whatever we got for debugging
//       proofData = {
//         proof: fullProof,
//         publicSignals: {
//           merkleRoot: "unknown",
//           nullifierHash: "unknown",
//           signal: candidateId.toString(),
//           externalNullifier: EXTERNAL_NULLIFIER.toString()
//         },
//         identityCommitment: voterIdentity.commitment.toString(),
//         identitySecret: voterIdentity.toString(),
//         rawProofObject: fullProof // Save the raw object for debugging
//       };
//     }

//     // Load existing proofs or create new array
//     let allProofs = [];
//     const proofFilePath = "zk/proof.json";
    
//     if (fs.existsSync(proofFilePath)) {
//       try {
//         const existingData = JSON.parse(fs.readFileSync(proofFilePath));
//         // Handle both old format (single proof) and new format (array of proofs)
//         if (Array.isArray(existingData)) {
//           allProofs = existingData;
//         } else {
//           // Convert old single proof format to array
//           allProofs = [existingData];
//           console.log("📝 Converted existing single proof to array format");
//         }
//       } catch (err) {
//         console.log("⚠️ Could not read existing proof file, creating new one");
//         allProofs = [];
//       }
//     }

//     // Add timestamp and unique ID to the new proof
//     proofData.timestamp = new Date().toISOString();
//     proofData.proofId = `proof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
//     // Check for duplicate nullifier (prevent double voting)
//     const existingNullifier = allProofs.find(p => 
//       p.publicSignals?.nullifierHash === proofData.publicSignals.nullifierHash
//     );
    
//     if (existingNullifier) {
//       console.log("⚠️ WARNING: This nullifier already exists! This might be a double vote attempt.");
//       console.log("Existing proof ID:", existingNullifier.proofId);
//       console.log("Existing timestamp:", existingNullifier.timestamp);
      
//       const proceed = await prompt("Do you want to continue anyway? (y/N): ");
//       if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
//         console.log("❌ Proof generation cancelled");
//         return;
//       }
//     }

//     // Add the new proof to the array
//     allProofs.push(proofData);

//     // Save updated proofs array
//     fs.writeFileSync(proofFilePath, JSON.stringify(allProofs, null, 2));
    
//     console.log("✅ Proof generated and added to zk/proof.json");
//     console.log("🆔 Proof ID:", proofData.proofId);
//     console.log("📊 Merkle Root:", proofData.publicSignals.merkleRoot);
//     console.log("🔒 Nullifier Hash:", proofData.publicSignals.nullifierHash);
//     console.log("🗳️ Vote for candidate:", proofData.publicSignals.signal);
//     console.log("📈 Total proofs in file:", allProofs.length);
    
//     // Show vote tally
//     const voteTally = {};
//     allProofs.forEach(proof => {
//       const candidate = proof.publicSignals?.signal || 'unknown';
//       voteTally[candidate] = (voteTally[candidate] || 0) + 1;
//     });
    
//     console.log("\n📊 Current vote tally:");
//     Object.entries(voteTally).forEach(([candidate, votes]) => {
//       console.log(`   Candidate ${candidate}: ${votes} vote${votes !== 1 ? 's' : ''}`);
//     });

//   } catch (err) {
//     console.error("❌ Error:", err.message);
//     console.error("Stack:", err.stack);
//   }
// }

// main();