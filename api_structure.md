# Backend API Structure

## Authentication & Session Management

- **POST /api/auth/login** - Handle Google OAuth/email login (UI session only)
- **POST /api/auth/logout** - Clear session
- **GET /api/auth/session** - Validate current session
- **POST /api/auth/refresh** - Refresh session token

## Voter Identity & ZK Proof Management

- **POST /api/voter/generate-identity** - Generate ZK identity commitment (or validate client-generated one)
- **GET /api/voter/merkle-proof** - Get Merkle proof for voter's commitment
- **POST /api/voter/verify-eligibility** - Verify if user's commitment exists in Merkle tree
- **GET /api/voter/nullifier-status/:hash** - Check if nullifier has been used

## Vote Submission & Verification

- **POST /api/vote/submit** - Core API - Receive vote + ZK proof, verify, and proxy to blockchain
- **POST /api/vote/verify-proof** - Pre-verify ZK proof before submission (optional validation step)
- **GET /api/vote/transaction-status/:txHash** - Check blockchain transaction status

## Voting Configuration & Results

- **GET /api/voting/config** - Get voting period, candidates, group ID
- **GET /api/voting/status** - Check if voting is active
- **GET /api/voting/results** - Get current vote counts (if allowed during voting)
- **GET /api/voting/results/percentages** - Get percentage breakdown

## Admin/Candidate Management

- **POST /api/admin/candidates** - Add candidate (admin only)
- **PUT /api/admin/candidates/:id** - Update candidate info
- **GET /api/admin/candidates** - List all candidates
- **POST /api/admin/voting/initialize** - Initialize voting parameters
- **POST /api/admin/relayers** - Manage organizational wallets

## Blockchain Interaction

- **GET /api/blockchain/contract-info** - Get contract address, ABI, network info
- **GET /api/blockchain/relayer-status** - Check relayer wallet balances
- **POST /api/blockchain/proxy-transaction** - Internal API for wallet selection and transaction submission

---

# Frontend API Consumption

## Authentication Flow

- Login component calls auth APIs
- Session management across routes
- Protected route handling

## Voting Interface

- Candidate listing from `/api/admin/candidates`
- Real-time voting status from `/api/voting/status`
- ZK identity generation (client-side with backend validation)
- Vote submission to `/api/vote/submit`

## Results Dashboard

- Live results from `/api/voting/results`
- Vote count visualization
- Voting statistics and turnout

---

# Critical Backend Logic (API Implementation Details)

## POST /api/vote/submit - The Core API

**Purpose**: Main voting endpoint - receives ZK proof, verifies, and proxies to blockchain

**Input**:
```json
{
  "candidateId": 0,
  "nullifierHash": "0x...",
  "zkProof": {
    "a": [uint, uint],
    "b": [[uint, uint], [uint, uint]],
    "c": [uint, uint],
    "publicSignals": [uint, uint, uint, uint]
  },
  "merkleTreeDepth": 20
}
```

**Backend Process**:
- Validate ZK proof using Semaphore verifier
- Check nullifier hasn't been used (local cache + contract check)
- Select random organizational wallet
- Submit transaction to VotingSystem contract
- Return transaction hash and status

### Nullifier Management
- In-memory cache for fast duplicate detection
- Database backup for persistence
- Periodic sync with on-chain state

### Wallet Management
- Load balancing across 10 organizational wallets
- Gas fee monitoring and wallet rotation
- Transaction queue management for high load

---

# Database Schema Considerations

- **Sessions**: User session tracking
- **Candidates**: Candidate information (stored in Firebase)
- **Nullifiers**: Used nullifier hashes for duplicate prevention
- **Transactions**: Vote transaction logs
- **Analytics**: Anonymized voting statistics

---

# Additional APIs for Production

## Monitoring & Analytics

- **GET /api/stats/voting-activity** - Real-time voting metrics
- **GET /api/health** - System health check
- **GET /api/metrics/wallets** - Relayer wallet status

## Error Handling

- **GET /api/errors/:errorId** - Detailed error information
- **POST /api/support/report** - Error reporting

---

# Core Vote Submission API

## POST /api/vote/submit

**Purpose**: Main voting endpoint - receives ZK proof, verifies, and proxies to blockchain

**Input**:
```json
{
  "candidateId": 0,
  "nullifierHash": "0x1a2b3c4d5e6f...",
  "zkProof": {
    "a": ["0x...", "0x..."],
    "b": [["0x...", "0x..."], ["0x...", "0x..."]],
    "c": ["0x...", "0x..."],
    "publicSignals": ["0", "0x...", "0x...", "12345"]
  },
  "merkleTreeDepth": 20,
  "sessionToken": "jwt_token_here"
}
```

**Backend Processing**:
- Validate session token
- Check `candidateId` < `candidateCount` from contract
- Verify `candidateId` == `publicSignals[0]`
- Check nullifier not in local cache/database
- Call Semaphore verifier locally to pre-validate proof
- Select random relayer from the 10 organizational wallets
- Call contract's `castVote()` function via selected relayer

**Output Success**:
```json
{
  "success": true,
  "data": {
    "transactionHash": "0xabcdef123456...",
    "blockNumber": null,
    "relayerAddress": "0x789...",
    "candidateId": 0,
    "nullifierHash": "0x1a2b3c4d5e6f...",
    "timestamp": "2025-09-23T10:30:00Z",
    "gasUsed": null
  },
  "message": "Vote submitted successfully"
}
```

**Output Error**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CANDIDATE" | "NULLIFIER_USED" | "INVALID_PROOF" | "VOTING_INACTIVE" | "UNAUTHORIZED_RELAYER",
    "message": "Candidate ID 5 is invalid. Valid range: 0-2",
    "details": {
      "candidateId": 5,
      "maxCandidates": 3
    }
  }
}
```

---

# Vote Verification APIs

## POST /api/vote/verify-proof

**Purpose**: Pre-verify ZK proof without submitting (optional validation step)

**Input**:
```json
{
  "zkProof": {
    "a": ["0x...", "0x..."],
    "b": [["0x...", "0x..."], ["0x...", "0x..."]],
    "c": ["0x...", "0x..."],
    "publicSignals": ["0", "0x...", "0x...", "12345"]
  },
  "merkleTreeDepth": 20
}
```

**Output**:
```json
{
  "success": true,
  "data": {
    "proofValid": true,
    "candidateId": 0,
    "nullifierHash": "0x1a2b3c4d5e6f...",
    "merkleRoot": "0x789abc123def...",
    "groupId": "12345"
  }
}
```

## GET /api/vote/nullifier-status/:nullifierHash

**Purpose**: Check if nullifier has been used

**Input**: URL parameter `nullifierHash`

**Output**:
```json
{
  "success": true,
  "data": {
    "nullifierHash": "0x1a2b3c4d5e6f...",
    "isUsed": false,
    "usedAt": null,
    "blockNumber": null
  }
}
```

---

# Voting Configuration APIs

## GET /api/voting/config

**Purpose**: Get voting configuration from contract

**Output** (calls contract's `getVotingInfo()`):
```json
{
  "success": true,
  "data": {
    "votingGroupId": 12345,
    "votingStartTime": 1695456000,
    "votingEndTime": 1695542400,
    "candidateCount": 3,
    "totalVotes": 0,
    "votingInitialized": true,
    "contractAddress": "0x742d35Cc6644C0532925a3b8D7b1a82C5Bd7C3C",
    "networkId": 11155111,
    "merkleTreeDepth": 20
  }
}
```

## GET /api/voting/status

**Purpose**: Check if voting is currently active

**Output** (calls contract's `isVotingActive()`):
```json
{
  "success": true,
  "data": {
    "isActive": true,
    "isPaused": false,
    "remainingTime": 86400,
    "remainingTimeFormatted": "1 day, 0 hours, 0 minutes",
    "currentTimestamp": 1695456000,
    "votingStartTime": 1695456000,
    "votingEndTime": 1695542400
  }
}
```

## GET /api/voting/results

**Purpose**: Get current vote counts

**Output** (calls contract's `getAllVoteCounts()` and `getResultPercentages()`):
```json
{
  "success": true,
  "data": {
    "voteCounts": [150, 75, 25],
    "percentages": [6000, 3000, 1000],
    "totalVotes": 250,
    "candidateCount": 3,
    "lastUpdated": "2025-09-23T10:30:00Z"
  }
}
```

---

# Candidate Management APIs

## GET /api/candidates

**Purpose**: Get all candidates with their details

**Output**:
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "id": 0,
        "name": "Alice Johnson",
        "party": "Progressive Party",
        "imageUrl": "https://firebase-storage.../alice.jpg",
        "biography": "Environmental advocate with 10 years experience...",
        "manifesto": "Clean energy, education reform...",
        "addedAt": "2025-09-20T10:00:00Z"
      },
      {
        "id": 1,
        "name": "Bob Smith",
        "party": "Innovation Alliance",
        "imageUrl": "https://firebase-storage.../bob.jpg",
        "biography": "Tech entrepreneur focused on digital governance...",
        "manifesto": "Digital transformation, startup ecosystem...",
        "addedAt": "2025-09-20T10:05:00Z"
      }
    ],
    "totalCandidates": 2
  }
}
```

## POST /api/admin/candidates (Admin Only)

**Purpose**: Add new candidate

**Input**:
```json
{
  "name": "Charlie Brown",
  "party": "People's Choice",
  "imageUrl": "https://firebase-storage.../charlie.jpg",
  "biography": "Community organizer with grassroots experience...",
  "manifesto": "Healthcare access, affordable housing...",
  "adminToken": "admin_jwt_token"
}
```

**Output**:
```json
{
  "success": true,
  "data": {
    "candidateId": 2,
    "name": "Charlie Brown",
    "addedAt": "2025-09-23T10:30:00Z",
    "firebaseDocId": "candidate_doc_id_123"
  }
}
```

---

# Identity & Merkle Tree APIs

## POST /api/voter/generate-identity

**Purpose**: Validate client-generated ZK identity or help generate one

**Input**:
```json
{
  "identityCommitment": "0x1234567890abcdef...",
  "sessionToken": "jwt_token_here"
}
```

**Output**:
```json
{
  "success": true,
  "data": {
    "identityCommitment": "0x1234567890abcdef...",
    "isEligible": true,
    "merkleProof": {
      "pathElements": ["0x...", "0x...", "0x..."],
      "pathIndices": [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
    },
    "merkleRoot": "0x789abc123def...",
    "leafIndex": 42
  }
}
```

## GET /api/voter/merkle-proof/:identityCommitment

**Purpose**: Get Merkle proof for specific identity commitment

**Output**:
```json
{
  "success": true,
  "data": {
    "identityCommitment": "0x1234567890abcdef...",
    "merkleProof": {
      "pathElements": ["0x...", "0x...", "0x..."],
      "pathIndices": [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
    },
    "merkleRoot": "0x789abc123def...",
    "treeDepth": 20,
    "leafIndex": 42
  }
}
```

---

# Blockchain Interaction APIs

## GET /api/blockchain/relayer-status

**Purpose**: Check status of organizational wallets

**Output**:
```json
{
  "success": true,
  "data": {
    "relayers": [
      {
        "address": "0x1111...",
        "balance": "0.5",
        "isAuthorized": true,
        "transactionCount": 25,
        "lastUsed": "2025-09-23T09:15:00Z"
      },
      {
        "address": "0x2222...",
        "balance": "0.3",
        "isAuthorized": true,
        "transactionCount": 18,
        "lastUsed": "2025-09-23T08:30:00Z"
      }
    ],
    "totalRelayers": 10,
    "activeRelayers": 10,
    "totalBalance": "4.2"
  }
}
```

## GET /api/blockchain/transaction/:txHash

**Purpose**: Get transaction status

**Output**:
```json
{
  "success": true,
  "data": {
    "transactionHash": "0xabcdef123456...",
    "status": "confirmed" | "pending" | "failed",
    "blockNumber": 12345678,
    "gasUsed": 150000,
    "candidateId": 0,
    "nullifierHash": "0x1a2b3c4d5e6f...",
    "relayerAddress": "0x789...",
    "timestamp": "2025-09-23T10:30:00Z",
    "confirmations": 3
  }
}
```

---

# Authentication APIs

## POST /api/auth/login

**Purpose**: Handle Google OAuth login (UI session only)

**Input**:
```json
{
  "googleToken": "google_oauth_token_here",
  "email": "voter@example.com"
}
```

**Output**:
```json
{
  "success": true,
  "data": {
    "sessionToken": "jwt_session_token",
    "expiresIn": 3600,
    "userId": "anonymous_session_id_123",
    "email": "voter@example.com"
  }
}
```

## GET /api/auth/session

**Purpose**: Validate current session

**Headers**: Authorization: Bearer jwt_token

**Output**:
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "userId": "anonymous_session_id_123",
    "email": "voter@example.com",
    "expiresIn": 2400,
    "hasVoted": false
  }
}
```

---

# Analytics & Monitoring APIs

## GET /api/stats/voting-activity

**Purpose**: Real-time voting statistics

**Output**:
```json
{
  "success": true,
  "data": {
    "totalVotes": 250,
    "votesPerHour": 15,
    "peakVotingTime": "2025-09-23T14:00:00Z",
    "averageProofVerificationTime": 150,
    "transactionSuccessRate": 98.5,
    "activeRelayers": 10,
    "failedTransactions": 2
  }
}
```

This covers all the major APIs needed.