import fs from "fs";
import readline from "readline";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

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
    // Load group
    const groupData = JSON.parse(fs.readFileSync("zk/group.json"));
    const members = groupData.members.map(m => BigInt(m));
    const group = new Group(members, groupData.depth);

    console.log("Current group has", group.members.length, "members");
    
    // Ask user what they want to do
    const choice = await prompt("Choose option:\n1. Create new identity and add to group\n2. Use existing identity secret\n3. Just check if commitment is in group\nEnter choice (1/2/3): ");
    
    let voterIdentity;
    
    if (choice === "1") {
      // Create new identity and add to group
      voterIdentity = new Identity();
      console.log("\n🎉 New identity created!");
      console.log("📝 Secret (SAVE THIS!):", voterIdentity.toString());
      console.log("🔐 Commitment:", voterIdentity.commitment.toString());
      
      // Add the new identity to the group
      group.addMember(voterIdentity.commitment);
      
      // Update the group.json file
      groupData.members = group.members.map(m => m.toString());
      fs.writeFileSync("zk/group.json", JSON.stringify(groupData, null, 2));
      
      console.log("✅ New identity added to group and group.json updated!");
      
    } else if (choice === "2") {
      // Use existing identity
      const secretInput = await prompt("Enter your identity secret: ");
      voterIdentity = new Identity(secretInput);
      console.log("🔐 Your identity commitment:", voterIdentity.commitment.toString());
      
    } else if (choice === "3") {
      // Just check commitment
      const commitmentInput = await prompt("Enter commitment to check: ");
      const commitment = BigInt(commitmentInput);
      const index = group.indexOf(commitment);
      if (index === -1) {
        console.log("❌ Commitment NOT found in group");
      } else {
        console.log("✅ Commitment found in group at index:", index);
      }
      return;
    } else {
      throw new Error("Invalid choice");
    }

    // Check if commitment is in the group
    const memberIndex = group.indexOf(voterIdentity.commitment);
    if (memberIndex === -1) {
      throw new Error("Identity commitment not found in group! If you chose option 2, make sure your secret is correct.");
    }

    console.log("✅ Voter commitment found in group at index:", memberIndex);

    // Candidate ID (signal)
    const candidateInput = await prompt("Enter candidate ID to vote for: ");
    const candidateId = BigInt(candidateInput);

    // External nullifier
    const EXTERNAL_NULLIFIER = BigInt(1);

    console.log("⏳ Generating proof... (this may take a few seconds)");

    // Check if circuit files exist
    const wasmPath = "./zk/semaphore.wasm";
    const zkeyPath = "./zk/semaphore.zkey";
    
    if (!fs.existsSync(wasmPath)) {
      console.log("⚠️ WASM file not found at", wasmPath);
      console.log("Attempting to generate proof without local circuit files...");
      console.log("This will download the files from the network (may be slower).");
    }
    
    if (!fs.existsSync(zkeyPath)) {
      console.log("⚠️ ZKEY file not found at", zkeyPath);
    }

    // Generate proof using the correct Semaphore v3 API
    const fullProof = await generateProof(
      voterIdentity, 
      group, 
      EXTERNAL_NULLIFIER, 
      candidateId,
      groupData.depth
    );

    console.log("🔍 Debugging proof object:");
    console.log("Type of fullProof:", typeof fullProof);
    console.log("fullProof keys:", fullProof ? Object.keys(fullProof) : "undefined");
    console.log("fullProof:", fullProof);

    // Check if proof was generated successfully
    if (!fullProof) {
      throw new Error("Proof generation failed - returned undefined");
    }

    // Handle different possible proof structures
    let proofData;
    
    // This appears to be the actual format your Semaphore version uses
    if (fullProof.merkleTreeRoot && fullProof.nullifier) {
      proofData = {
        proof: fullProof,
        publicSignals: {
          merkleRoot: fullProof.merkleTreeRoot.toString(),
          nullifierHash: fullProof.nullifier.toString(),
          signal: fullProof.scope.toString(), // 'scope' contains the vote/signal
          externalNullifier: fullProof.message.toString() // 'message' contains external nullifier
        },
        identityCommitment: voterIdentity.commitment.toString(),
        identitySecret: voterIdentity.toString()
      };
    }
    // Check if it's the new format with proof and publicSignals separated
    else if (fullProof.proof && fullProof.publicSignals) {
      proofData = {
        proof: fullProof.proof,
        publicSignals: {
          merkleRoot: fullProof.publicSignals.merkleRoot || fullProof.publicSignals[0],
          nullifierHash: fullProof.publicSignals.nullifierHash || fullProof.publicSignals[1], 
          signal: fullProof.publicSignals.signal || fullProof.publicSignals[2],
          externalNullifier: fullProof.publicSignals.externalNullifier || EXTERNAL_NULLIFIER.toString()
        },
        identityCommitment: voterIdentity.commitment.toString(),
        identitySecret: voterIdentity.toString()
      };
    }
    // Check if it has direct properties (older format)
    else if (fullProof.merkleRoot || fullProof.nullifierHash || fullProof.signal) {
      proofData = {
        proof: fullProof,
        publicSignals: {
          merkleRoot: fullProof.merkleRoot?.toString() || "unknown",
          nullifierHash: fullProof.nullifierHash?.toString() || "unknown",
          signal: fullProof.signal?.toString() || candidateId.toString(),
          externalNullifier: EXTERNAL_NULLIFIER.toString()
        },
        identityCommitment: voterIdentity.commitment.toString(),
        identitySecret: voterIdentity.toString()
      };
    }
    // If it's an array format
    else if (Array.isArray(fullProof) && fullProof.length >= 3) {
      proofData = {
        proof: fullProof,
        publicSignals: {
          merkleRoot: fullProof[0]?.toString() || "unknown",
          nullifierHash: fullProof[1]?.toString() || "unknown", 
          signal: fullProof[2]?.toString() || candidateId.toString(),
          externalNullifier: EXTERNAL_NULLIFIER.toString()
        },
        identityCommitment: voterIdentity.commitment.toString(),
        identitySecret: voterIdentity.toString()
      };
    }
    else {
      // Fallback - save whatever we got for debugging
      proofData = {
        proof: fullProof,
        publicSignals: {
          merkleRoot: "unknown",
          nullifierHash: "unknown",
          signal: candidateId.toString(),
          externalNullifier: EXTERNAL_NULLIFIER.toString()
        },
        identityCommitment: voterIdentity.commitment.toString(),
        identitySecret: voterIdentity.toString(),
        rawProofObject: fullProof // Save the raw object for debugging
      };
    }

    // Load existing proofs or create new array
    let allProofs = [];
    const proofFilePath = "zk/proof.json";
    
    if (fs.existsSync(proofFilePath)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(proofFilePath));
        // Handle both old format (single proof) and new format (array of proofs)
        if (Array.isArray(existingData)) {
          allProofs = existingData;
        } else {
          // Convert old single proof format to array
          allProofs = [existingData];
          console.log("📝 Converted existing single proof to array format");
        }
      } catch (err) {
        console.log("⚠️ Could not read existing proof file, creating new one");
        allProofs = [];
      }
    }

    // Add timestamp and unique ID to the new proof
    proofData.timestamp = new Date().toISOString();
    proofData.proofId = `proof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check for duplicate nullifier (prevent double voting)
    const existingNullifier = allProofs.find(p => 
      p.publicSignals?.nullifierHash === proofData.publicSignals.nullifierHash
    );
    
    if (existingNullifier) {
      console.log("⚠️ WARNING: This nullifier already exists! This might be a double vote attempt.");
      console.log("Existing proof ID:", existingNullifier.proofId);
      console.log("Existing timestamp:", existingNullifier.timestamp);
      
      const proceed = await prompt("Do you want to continue anyway? (y/N): ");
      if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
        console.log("❌ Proof generation cancelled");
        return;
      }
    }

    // Add the new proof to the array
    allProofs.push(proofData);

    // Save updated proofs array
    fs.writeFileSync(proofFilePath, JSON.stringify(allProofs, null, 2));
    
    console.log("✅ Proof generated and added to zk/proof.json");
    console.log("🆔 Proof ID:", proofData.proofId);
    console.log("📊 Merkle Root:", proofData.publicSignals.merkleRoot);
    console.log("🔒 Nullifier Hash:", proofData.publicSignals.nullifierHash);
    console.log("🗳️ Vote for candidate:", proofData.publicSignals.signal);
    console.log("📈 Total proofs in file:", allProofs.length);
    
    // Show vote tally
    const voteTally = {};
    allProofs.forEach(proof => {
      const candidate = proof.publicSignals?.signal || 'unknown';
      voteTally[candidate] = (voteTally[candidate] || 0) + 1;
    });
    
    console.log("\n📊 Current vote tally:");
    Object.entries(voteTally).forEach(([candidate, votes]) => {
      console.log(`   Candidate ${candidate}: ${votes} vote${votes !== 1 ? 's' : ''}`);
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error("Stack:", err.stack);
  }
}

main();