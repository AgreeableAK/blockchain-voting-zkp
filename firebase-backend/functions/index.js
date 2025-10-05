const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/v2/params");
const logger = require("firebase-functions/logger");
const {ethers} = require("ethers");
const {verifyProof} = require("@semaphore-protocol/proof");
const fs = require("fs");
const path = require("path");

// Load project artifacts that we copied into this directory
const contractABI = require("./sepolia-abi.json");
const groupData = require("./group.json");
const ZK_CIRCUITS_PATH = path.resolve(__dirname, "../../zk/circuits");

// Define connection to the Sepolia network
// IMPORTANT: Replace "YOUR_ALCHEMY_API_KEY" with your actual key from Alchemy.
const SEPOLIA_RPC_URL =
  "[https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY](https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY)";
const CONTRACT_ADDRESS = "0x881f0f817B0bdE9F9495dDbDB4E6C06A9D9F5714";

// Access secrets using the recommended defineSecret method
const encryptedWalletsSecret = defineSecret("ENCRYPTED_WALLETS");
const walletPasswordSecret = defineSecret("WALLET_PASSWORD");

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);

// --- Main Cloud Function: castVote ---
exports.castVote = onCall(
    {secrets: [encryptedWalletsSecret, walletPasswordSecret]},
    async (request) => {
      logger.info("Received a request to castVote", {structuredData: true});

      const {candidateId, nullifierHash, proof} = request.data;
      if (!candidateId || !nullifierHash || !proof) {
        logger.error("Validation Error: Missing required fields.");
        throw new HttpsError(
            "invalid-argument",
            "Missing fields: candidateId, nullifierHash, and proof required.",
        );
      }

      try {
        logger.info("Step 1: Validating ZK proof off-chain...");
        const verificationKey = JSON.parse(
            fs.readFileSync(
                path.join(ZK_CIRCUITS_PATH, "semaphore.json"),
                "utf-8",
            ),
        );

        const isValid = await verifyProof(
            {
              merkleTreeRoot: groupData.root,
              nullifierHash: nullifierHash,
              signal: candidateId.toString(),
              externalNullifier: groupData.id,
              proof: proof,
            },
            verificationKey,
        );

        if (!isValid) {
          logger.error("Verification Failure: ZK proof is invalid.");
          throw new HttpsError("unauthenticated", "Invalid ZK proof.");
        }
        logger.info("✅ ZK Proof is valid.");

        logger.info("Step 2: Checking on-chain nullifier...");
        const isNullifierUsed = await contract.usedNullifiers(nullifierHash);
        if (isNullifierUsed) {
          logger.error("Duplicate Vote Error: Nullifier has been used.");
          throw new HttpsError("already-exists", "This vote has been cast.");
        }
        logger.info("✅ Nullifier is unused.");

        logger.info("Step 3: Loading relayers and submitting the vote...");
        const encryptedWalletsJson = Buffer.from(
            encryptedWalletsSecret.value(), "base64",
        ).toString("utf-8");
        const encryptedWallets = JSON.parse(encryptedWalletsJson);

        const decryptedWallets = await Promise.all(
            encryptedWallets.map((ew) =>
              ethers.Wallet.fromEncryptedJson(
                  JSON.stringify(ew), walletPasswordSecret.value(),
              ),
            ),
        );

        const relayers = decryptedWallets.map((w) => w.connect(provider));
        const randomRelayer =
        relayers[Math.floor(Math.random() * relayers.length)];
        const contractWithSigner = contract.connect(randomRelayer);

        logger.info(`Submitting vote with relayer: ${randomRelayer.address}`);
        const tx = await contractWithSigner.castVote(
            candidateId, nullifierHash, proof,
        );
        await tx.wait();

        logger.info(`✅ Vote successfully cast! Transaction Hash: ${tx.hash}`);

        return {
          message: "Vote cast successfully!",
          transactionHash: tx.hash,
        };
      } catch (error) {
        logger.error("An error occurred while casting the vote:", error);
        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError("internal", "An internal server error occurred.", {
          details: error.message,
        });
      }
    },
);
