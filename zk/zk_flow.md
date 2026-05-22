# Full ZKP Voting Flow

## 1️⃣ Create Voter Identities

**Script**: `create-identity.js`  
**Purpose**: Generate a voter’s private seed and public commitment.

**Steps**:
- Ask the voter if they want a random seed or to enter their own.
- Generate a new Identity using the seed.
- Display:
  - Seed (must be saved by the voter)
  - Commitment (used in the voter group)
- Optionally save to a file:
  ```json
  {
    "seed": "b9ed3c0dd86f7322d80533bb1d6ebe40537d94c83ebff70638b30cb6f0bea84d",
    "commitment": "8016030189702710763110050363840478720643835053036461389371845080646801880822"
  }
  ```

**Key Points**:
- The seed is the only thing the voter needs to keep.
- Never store trapdoor/nullifier manually.

## 2️⃣ Build and Finalize the Group

**File**: `group.json`  
Contains the commitments of all eligible voters:
```json
{
  "depth": 20,
  "members": [
    "1234567890...",
    "35861676228...",
    "8016030189702710763..."
  ],
  "root": "10296963778401874923833083922539164644645097642959841144655251762176912142992"
}
```

**Rules**:
- Freeze the group before voting.
- No new members are added after voting starts.
- This ensures Merkle root consistency.
- If you add a new member:
  - The Merkle root changes.
  - All previously generated proofs become invalid.

## 3️⃣ Generate Proof (Vote)

**Script**: `generate-proof.js`  
**Purpose**: Create a zero-knowledge proof for a voter to vote anonymously.

**Steps**:
- Load voter identity from seed.
- Load `group.json`.
- Verify the voter’s commitment exists in the group.
- Ask the voter for candidate ID.
- Generate the Semaphore proof:
  - Proves:
    - You are a member of the group (Merkle proof)
    - You haven’t voted yet (nullifier)
    - Your vote is valid (signal)
- Save proof in `proof.json`:
  ```json
  [
    {
      "proof": { /* cryptographic proof */ },
      "publicSignals": {
        "merkleRoot": "10296963778401874923833083922539164644645097642959841144655251762176912142992",
        "nullifierHash": "17766884331336309081551377118401823786117525973338267877591115718544843",
        "signal": "2",
        "externalNullifier": "1"
      },
      "identityCommitment": "8016030189702710763110050363840478720643835053036461389371845080646801880822",
      "timestamp": "2025-09-23T04:01:19.164Z",
      "proofId": "proof_1758600079166_gqoqzbwvw"
    }
  ]
  ```

**Key Points**:
- Only the `publicSignals` and `proof` are saved — the voter’s seed stays private.
- The proof binds to the Merkle root, so group changes invalidate old proofs.

## 4️⃣ Verify Proofs

**Script**: `verify-proof.js`  
**Purpose**: Check all submitted proofs and tally votes.

**Steps**:
- Load `group.json` (current Merkle root).
- Load all proofs from `proof.json`.
- For each proof:
  - Check Merkle root matches the group.
  - Check nullifier hasn’t been used (prevents double votes).
  - Check signal is valid (candidate ID).
- Count valid votes per candidate.

**Example Output**:
```
✅ Valid proofs: 5
❌ Invalid proofs: 0
🗳️ Vote tally:
   Candidate 1: 2 votes
   Candidate 2: 3 votes
```

## 5️⃣ Best Practices

- **Freeze the group before voting**:
  - Any group change invalidates previously generated proofs.
- **Save seeds securely**:
  - Each voter’s seed is their private key.
  - Losing it means the voter can’t generate proofs.
- **Use snapshots for voting**:
  - If you want multiple elections or rounds, take a snapshot of the group at the start.
  - Only proofs generated with that snapshot are valid.
- **Never store secrets in proof.json**:
  - Only the commitment is needed for verification.
- **External nullifier**:
  - Use a unique number per election/round.
  - Prevents voting across multiple elections with the same proof.

## Flow Diagram (Conceptual)

```
[ Voter Seed ] 
     ↓
[ Identity Object ] 
     ↓
[ Commitment ] → Added to group.json (Merkle Tree)
     ↓
[ generate-proof.js ]
     → Proof: {merkleRoot, nullifierHash, signal}
     ↓
[ proof.json ]
     ↓
[ verify-proof.js ]
     → Checks: Merkle root, nullifier, vote validity
     ↓
[ Vote tally ]
```

## ✅ This Flow Ensures:
- **Privacy**: Voters remain anonymous.
- **Integrity**: Only eligible voters can vote.
- **Double-vote prevention**: Nullifiers ensure one vote per voter.
- **Verifiability**: Anyone can check the proofs without knowing voter identities.