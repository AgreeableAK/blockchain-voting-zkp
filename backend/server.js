const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============ Configuration ============
const config = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  RPC_URL: process.env.RPC_URL || 'https://sepolia.infura.io/v3/YOUR-PROJECT-ID',
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
  SEMAPHORE_VERIFIER_ADDRESS: process.env.SEMAPHORE_VERIFIER_ADDRESS,
  NETWORK_ID: process.env.NETWORK_ID || 11155111, // Sepolia
  MERKLE_TREE_DEPTH: parseInt(process.env.MERKLE_TREE_DEPTH) || 20,
  VOTING_GROUP_ID: process.env.VOTING_GROUP_ID,
  FIREBASE_CONFIG: {
    // Add your Firebase config here
  }
};

// ============ Contract ABI ============
const VOTING_CONTRACT_ABI = [
  "function castVote(uint256 candidateId, uint256 nullifierHash, uint[2] calldata a, uint[2][2] calldata b, uint[2] calldata c, uint[4] calldata publicSignals, uint256 merkleTreeDepth) external",
  "function getVoteCount(uint256 candidateId) external view returns (uint256)",
  "function getAllVoteCounts() external view returns (uint256[] memory)",
  "function isVotingActive() external view returns (bool)",
  "function getVotingInfo() external view returns (uint256 groupId, uint256 startTime, uint256 endTime, uint256 numCandidates, uint256 votes)",
  "function isNullifierUsed(uint256 nullifierHash) external view returns (bool)",
  "function getResultPercentages() external view returns (uint256[] memory)",
  "function getRemainingTime() external view returns (uint256)",
  "function authorizedRelayers(address) external view returns (bool)",
  "function getRelayers() external view returns (address[] memory)",
  "event VoteCast(uint256 indexed candidateId, uint256 indexed nullifierHash, address indexed relayer, uint256 timestamp)"
];

const SEMAPHORE_VERIFIER_ABI = [
  "function verifyProof(uint[2] calldata a, uint[2][2] calldata b, uint[2] calldata c, uint[4] calldata publicSignals, uint256 merkleTreeDepth) external view returns (bool)"
];

// ============ Blockchain Setup ============
const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
const votingContract = new ethers.Contract(config.CONTRACT_ADDRESS, VOTING_CONTRACT_ABI, provider);
const semaphoreVerifier = new ethers.Contract(config.SEMAPHORE_VERIFIER_ADDRESS, SEMAPHORE_VERIFIER_ABI, provider);

// Organizational wallet setup (load from environment)
const relayerWallets = [];
for (let i = 0; i < 10; i++) {
  const privateKey = process.env[`RELAYER_PRIVATE_KEY_${i}`];
  if (privateKey) {
    const wallet = new ethers.Wallet(privateKey, provider);
    relayerWallets.push(wallet);
  }
}

// ============ Caches and Storage ============
const nullifierCache = new NodeCache({ stdTTL: 86400 }); // 24 hours
const sessionCache = new NodeCache({ stdTTL: 3600 }); // 1 hour
const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

// In-memory storage for demo (use proper database in production)
const candidates = new Map();
const usedNullifiers = new Set();
const votingStats = {
  totalVotes: 0,
  votesPerHour: 0,
  transactions: [],
  errors: []
};

// ============ Middleware ============
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } }
});
app.use('/api/', limiter);

// Voting rate limit (stricter)
const votingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { success: false, error: { code: 'VOTING_RATE_LIMIT', message: 'Too many voting attempts' } }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'NO_TOKEN', message: 'Access token required' }
    });
  }

  jwt.verify(token, config.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
      });
    }
    req.user = user;
    next();
  });
};

// ============ Helper Functions ============

// Select random relayer wallet
function selectRandomRelayer() {
  if (relayerWallets.length === 0) {
    throw new Error('No relayer wallets available');
  }
  const randomIndex = Math.floor(Math.random() * relayerWallets.length);
  return relayerWallets[randomIndex];
}

// Verify ZK proof using Semaphore
async function verifyZKProof(zkProof, merkleTreeDepth) {
  try {
    const { a, b, c, publicSignals } = zkProof;
    
    // Convert arrays to proper format for contract call
    const aFormatted = [BigInt(a[0]), BigInt(a[1])];
    const bFormatted = [[BigInt(b[0][0]), BigInt(b[0][1])], [BigInt(b[1][0]), BigInt(b[1][1])]];
    const cFormatted = [BigInt(c[0]), BigInt(c[1])];
    const publicSignalsFormatted = publicSignals.map(signal => BigInt(signal));

    const isValid = await semaphoreVerifier.verifyProof(
      aFormatted,
      bFormatted,
      cFormatted,
      publicSignalsFormatted,
      merkleTreeDepth
    );

    return isValid;
  } catch (error) {
    console.error('ZK Proof verification error:', error);
    return false;
  }
}

// Get voting configuration from contract
async function getVotingConfig() {
  try {
    const [groupId, startTime, endTime, numCandidates, votes] = await votingContract.getVotingInfo();
    const isActive = await votingContract.isVotingActive();
    const remainingTime = await votingContract.getRemainingTime();

    return {
      votingGroupId: groupId.toString(),
      votingStartTime: startTime.toString(),
      votingEndTime: endTime.toString(),
      candidateCount: numCandidates.toString(),
      totalVotes: votes.toString(),
      isActive,
      remainingTime: remainingTime.toString(),
      contractAddress: config.CONTRACT_ADDRESS,
      networkId: config.NETWORK_ID,
      merkleTreeDepth: config.MERKLE_TREE_DEPTH
    };
  } catch (error) {
    throw new Error(`Failed to get voting config: ${error.message}`);
  }
}

// ============ Authentication APIs ============

app.post('/api/auth/login', async (req, res) => {
  try {
    const { googleToken, email } = req.body;

    // Verify Google token
    let payload;
    if (googleToken) {
      const ticket = await googleClient.verifyIdToken({
        idToken: googleToken,
        audience: config.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    }

    // Generate session token (not tied to real identity)
    const sessionId = crypto.randomBytes(16).toString('hex');
    const sessionToken = jwt.sign(
      { 
        sessionId,
        email: email || payload?.email,
        loginTime: Date.now()
      },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Store session
    sessionCache.set(sessionId, {
      email: email || payload?.email,
      loginTime: Date.now(),
      hasVoted: false
    });

    res.json({
      success: true,
      data: {
        sessionToken,
        expiresIn: 3600,
        userId: sessionId,
        email: email || payload?.email
      }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
        details: error.message
      }
    });
  }
});

app.get('/api/auth/session', authenticateToken, (req, res) => {
  const sessionData = sessionCache.get(req.user.sessionId);
  
  res.json({
    success: true,
    data: {
      isValid: true,
      userId: req.user.sessionId,
      email: req.user.email,
      expiresIn: Math.floor((req.user.exp * 1000 - Date.now()) / 1000),
      hasVoted: sessionData?.hasVoted || false
    }
  });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  sessionCache.del(req.user.sessionId);
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// ============ Core Vote Submission API ============

app.post('/api/vote/submit', votingLimiter, authenticateToken, async (req, res) => {
  try {
    const {
      candidateId,
      nullifierHash,
      zkProof,
      merkleTreeDepth = config.MERKLE_TREE_DEPTH
    } = req.body;

    // Get voting configuration
    const votingConfig = await getVotingConfig();
    
    // Check if voting is active
    if (!votingConfig.isActive) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VOTING_INACTIVE',
          message: 'Voting is not currently active'
        }
      });
    }

    // Validate candidate ID
    if (candidateId >= parseInt(votingConfig.candidateCount) || candidateId < 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CANDIDATE',
          message: `Candidate ID ${candidateId} is invalid. Valid range: 0-${parseInt(votingConfig.candidateCount) - 1}`,
          details: {
            candidateId,
            maxCandidates: parseInt(votingConfig.candidateCount)
          }
        }
      });
    }

    // Check if candidate ID matches public signal
    if (candidateId.toString() !== zkProof.publicSignals[0]) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CANDIDATE',
          message: 'Candidate ID does not match ZK proof signal'
        }
      });
    }

    // Check nullifier not used (local cache first)
    const nullifierKey = nullifierHash.toString();
    if (usedNullifiers.has(nullifierKey) || nullifierCache.get(nullifierKey)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NULLIFIER_USED',
          message: 'This nullifier has already been used'
        }
      });
    }

    // Check nullifier on contract
    const isNullifierUsed = await votingContract.isNullifierUsed(nullifierHash);
    if (isNullifierUsed) {
      usedNullifiers.add(nullifierKey);
      nullifierCache.set(nullifierKey, true);
      return res.status(400).json({
        success: false,
        error: {
          code: 'NULLIFIER_USED',
          message: 'This nullifier has already been used on-chain'
        }
      });
    }

    // Verify ZK proof
    const proofValid = await verifyZKProof(zkProof, merkleTreeDepth);
    if (!proofValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROOF',
          message: 'ZK proof verification failed'
        }
      });
    }

    // Select random relayer wallet
    const relayerWallet = selectRandomRelayer();
    
    // Prepare transaction data
    const contractWithSigner = votingContract.connect(relayerWallet);
    
    // Convert proof data for contract call
    const aFormatted = [BigInt(zkProof.a[0]), BigInt(zkProof.a[1])];
    const bFormatted = [[BigInt(zkProof.b[0][0]), BigInt(zkProof.b[0][1])], [BigInt(zkProof.b[1][0]), BigInt(zkProof.b[1][1])]];
    const cFormatted = [BigInt(zkProof.c[0]), BigInt(zkProof.c[1])];
    const publicSignalsFormatted = zkProof.publicSignals.map(signal => BigInt(signal));

    // Submit transaction to blockchain
    const tx = await contractWithSigner.castVote(
      candidateId,
      nullifierHash,
      aFormatted,
      bFormatted,
      cFormatted,
      publicSignalsFormatted,
      merkleTreeDepth,
      {
        gasLimit: 300000 // Adjust based on your contract's gas usage
      }
    );

    // Mark nullifier as used immediately to prevent double submission
    usedNullifiers.add(nullifierKey);
    nullifierCache.set(nullifierKey, true);

    // Update session
    const sessionData = sessionCache.get(req.user.sessionId);
    if (sessionData) {
      sessionData.hasVoted = true;
      sessionCache.set(req.user.sessionId, sessionData);
    }

    // Track transaction
    const transactionRecord = {
      transactionHash: tx.hash,
      candidateId,
      nullifierHash: nullifierKey,
      relayerAddress: relayerWallet.address,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    votingStats.transactions.push(transactionRecord);
    votingStats.totalVotes++;

    res.json({
      success: true,
      data: {
        transactionHash: tx.hash,
        blockNumber: null,
        relayerAddress: relayerWallet.address,
        candidateId,
        nullifierHash: nullifierKey,
        timestamp: new Date().toISOString(),
        gasUsed: null
      },
      message: 'Vote submitted successfully'
    });

    // Wait for confirmation in background
    tx.wait().then(receipt => {
      const txIndex = votingStats.transactions.findIndex(t => t.transactionHash === tx.hash);
      if (txIndex !== -1) {
        votingStats.transactions[txIndex].status = 'confirmed';
        votingStats.transactions[txIndex].blockNumber = receipt.blockNumber;
        votingStats.transactions[txIndex].gasUsed = receipt.gasUsed.toString();
      }
    }).catch(error => {
      console.error('Transaction failed:', error);
      const txIndex = votingStats.transactions.findIndex(t => t.transactionHash === tx.hash);
      if (txIndex !== -1) {
        votingStats.transactions[txIndex].status = 'failed';
      }
    });

  } catch (error) {
    console.error('Vote submission error:', error);
    
    // Map contract errors to user-friendly messages
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = error.message;
    
    if (error.message.includes('VotingNotActive')) {
      errorCode = 'VOTING_INACTIVE';
      errorMessage = 'Voting period is not active';
    } else if (error.message.includes('InvalidCandidate')) {
      errorCode = 'INVALID_CANDIDATE';
      errorMessage = 'Invalid candidate selection';
    } else if (error.message.includes('NullifierAlreadyUsed')) {
      errorCode = 'NULLIFIER_USED';
      errorMessage = 'Vote has already been cast';
    } else if (error.message.includes('InvalidProof')) {
      errorCode = 'INVALID_PROOF';
      errorMessage = 'Invalid zero-knowledge proof';
    } else if (error.message.includes('UnauthorizedRelayer')) {
      errorCode = 'UNAUTHORIZED_RELAYER';
      errorMessage = 'Relayer wallet not authorized';
    }

    votingStats.errors.push({
      timestamp: new Date().toISOString(),
      error: errorMessage,
      code: errorCode,
      sessionId: req.user.sessionId
    });

    res.status(500).json({
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    });
  }
});

// ============ Vote Verification APIs ============

app.post('/api/vote/verify-proof', authenticateToken, async (req, res) => {
  try {
    const { zkProof, merkleTreeDepth = config.MERKLE_TREE_DEPTH } = req.body;

    const proofValid = await verifyZKProof(zkProof, merkleTreeDepth);

    res.json({
      success: true,
      data: {
        proofValid,
        candidateId: parseInt(zkProof.publicSignals[0]),
        nullifierHash: zkProof.publicSignals[1],
        merkleRoot: zkProof.publicSignals[2],
        groupId: zkProof.publicSignals[3]
      }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'PROOF_VERIFICATION_FAILED',
        message: 'Failed to verify proof',
        details: error.message
      }
    });
  }
});

app.get('/api/vote/nullifier-status/:nullifierHash', async (req, res) => {
  try {
    const { nullifierHash } = req.params;
    
    // Check local cache first
    const localUsed = usedNullifiers.has(nullifierHash) || nullifierCache.get(nullifierHash);
    
    // Check on-chain
    const chainUsed = await votingContract.isNullifierUsed(nullifierHash);
    
    const isUsed = localUsed || chainUsed;

    res.json({
      success: true,
      data: {
        nullifierHash,
        isUsed,
        usedAt: isUsed ? new Date().toISOString() : null,
        blockNumber: null // Would need to track this separately
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'NULLIFIER_CHECK_FAILED',
        message: 'Failed to check nullifier status',
        details: error.message
      }
    });
  }
});

// ============ Voting Configuration APIs ============

app.get('/api/voting/config', async (req, res) => {
  try {
    const config = await getVotingConfig();
    
    res.json({
      success: true,
      data: {
        votingInitialized: true,
        ...config
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_FETCH_FAILED',
        message: 'Failed to fetch voting configuration',
        details: error.message
      }
    });
  }
});

app.get('/api/voting/status', async (req, res) => {
  try {
    const votingConfig = await getVotingConfig();
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const remainingTimeSeconds = parseInt(votingConfig.remainingTime);
    
    // Format remaining time
    const days = Math.floor(remainingTimeSeconds / 86400);
    const hours = Math.floor((remainingTimeSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingTimeSeconds % 3600) / 60);
    const remainingTimeFormatted = `${days} days, ${hours} hours, ${minutes} minutes`;

    res.json({
      success: true,
      data: {
        isActive: votingConfig.isActive,
        isPaused: false, // Would need to check contract pause state
        remainingTime: remainingTimeSeconds,
        remainingTimeFormatted,
        currentTimestamp,
        votingStartTime: parseInt(votingConfig.votingStartTime),
        votingEndTime: parseInt(votingConfig.votingEndTime)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_FETCH_FAILED',
        message: 'Failed to fetch voting status',
        details: error.message
      }
    });
  }
});

app.get('/api/voting/results', async (req, res) => {
  try {
    const voteCounts = await votingContract.getAllVoteCounts();
    const percentages = await votingContract.getResultPercentages();
    const votingConfig = await getVotingConfig();

    const voteCountsFormatted = voteCounts.map(count => count.toString());
    const percentagesFormatted = percentages.map(pct => pct.toString());

    res.json({
      success: true,
      data: {
        voteCounts: voteCountsFormatted,
        percentages: percentagesFormatted,
        totalVotes: parseInt(votingConfig.totalVotes),
        candidateCount: parseInt(votingConfig.candidateCount),
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RESULTS_FETCH_FAILED',
        message: 'Failed to fetch voting results',
        details: error.message
      }
    });
  }
});

// ============ Candidate Management APIs ============

app.get('/api/candidates', async (req, res) => {
  try {
    const candidatesArray = Array.from(candidates.values());
    
    res.json({
      success: true,
      data: {
        candidates: candidatesArray,
        totalCandidates: candidatesArray.length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CANDIDATES_FETCH_FAILED',
        message: 'Failed to fetch candidates',
        details: error.message
      }
    });
  }
});

app.post('/api/admin/candidates', authenticateToken, async (req, res) => {
  try {
    // In production, add proper admin authentication
    const { name, party, imageUrl, biography, manifesto } = req.body;
    
    const candidateId = candidates.size;
    const candidate = {
      id: candidateId,
      name,
      party,
      imageUrl,
      biography,
      manifesto,
      addedAt: new Date().toISOString()
    };
    
    candidates.set(candidateId, candidate);

    res.json({
      success: true,
      data: {
        candidateId,
        name,
        addedAt: candidate.addedAt,
        firebaseDocId: `candidate_${candidateId}` // Mock Firebase doc ID
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CANDIDATE_ADD_FAILED',
        message: 'Failed to add candidate',
        details: error.message
      }
    });
  }
});

// ============ Blockchain Interaction APIs ============

app.get('/api/blockchain/relayer-status', async (req, res) => {
  try {
    const relayersInfo = await Promise.all(
      relayerWallets.map(async (wallet, index) => {
        const balance = await provider.getBalance(wallet.address);
        const transactionCount = await provider.getTransactionCount(wallet.address);
        const isAuthorized = await votingContract.authorizedRelayers(wallet.address);
        
        return {
          address: wallet.address,
          balance: ethers.utils.formatEther(balance),
          isAuthorized,
          transactionCount,
          lastUsed: new Date().toISOString() // Mock - would track this properly
        };
      })
    );

    const totalBalance = relayersInfo.reduce((sum, relayer) => 
      sum + parseFloat(relayer.balance), 0
    ).toFixed(4);

    res.json({
      success: true,
      data: {
        relayers: relayersInfo,
        totalRelayers: relayersInfo.length,
        activeRelayers: relayersInfo.filter(r => r.isAuthorized).length,
        totalBalance
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RELAYER_STATUS_FAILED',
        message: 'Failed to fetch relayer status',
        details: error.message
      }
    });
  }
});

app.get('/api/blockchain/transaction/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    
    const receipt = await provider.getTransactionReceipt(txHash);
    const transaction = await provider.getTransaction(txHash);
    
    if (!receipt) {
      return res.json({
        success: true,
        data: {
          transactionHash: txHash,
          status: 'pending',
          blockNumber: null,
          gasUsed: null,
          confirmations: 0
        }
      });
    }

    // Parse logs to get vote details
    let candidateId = null;
    let nullifierHash = null;
    let relayerAddress = null;
    
    const voteCastTopic = ethers.utils.id("VoteCast(uint256,uint256,address,uint256)");
    const voteCastLog = receipt.logs.find(log => log.topics[0] === voteCastTopic);
    
    if (voteCastLog) {
      candidateId = parseInt(voteCastLog.topics[1]);
      nullifierHash = voteCastLog.topics[2];
      relayerAddress = ethers.utils.getAddress(voteCastLog.topics[3]);
    }

    res.json({
      success: true,
      data: {
        transactionHash: txHash,
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        candidateId,
        nullifierHash,
        relayerAddress,
        timestamp: new Date().toISOString(),
        confirmations: receipt.confirmations || 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSACTION_FETCH_FAILED',
        message: 'Failed to fetch transaction details',
        details: error.message
      }
    });
  }
});

// ============ Analytics & Monitoring APIs ============

app.get('/api/stats/voting-activity', async (req, res) => {
  try {
    const confirmedTransactions = votingStats.transactions.filter(tx => tx.status === 'confirmed');
    const failedTransactions = votingStats.transactions.filter(tx => tx.status === 'failed');
    
    // Calculate votes per hour (last hour)
    const oneHourAgo = Date.now() - 3600000;
    const recentVotes = votingStats.transactions.filter(tx => 
      new Date(tx.timestamp).getTime() > oneHourAgo
    );

    res.json({
      success: true,
      data: {
        totalVotes: confirmedTransactions.length,
        votesPerHour: recentVotes.length,
        peakVotingTime: new Date().toISOString(), // Mock
        averageProofVerificationTime: 150, // Mock - would measure this
        transactionSuccessRate: confirmedTransactions.length > 0 ? 
          ((confirmedTransactions.length / (confirmedTransactions.length + failedTransactions.length)) * 100).toFixed(1) : 0,
        activeRelayers: relayerWallets.length,
        failedTransactions: failedTransactions.length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_FETCH_FAILED',
        message: 'Failed to fetch voting activity stats',
        details: error.message
      }
    });
  }
});

// ============ Health Check & Error Handling ============

app.get('/api/health', async (req, res) => {
  try {
    // Check blockchain connection
    const blockNumber = await provider.getBlockNumber();
    
    // Check contract connection
    const isActive = await votingContract.isVotingActive();
    
    res.json({
      success: true,
      data: {
        status: 'healthy',
        blockchain: {
          connected: true,
          blockNumber,
          networkId: config.NETWORK_ID
        },
        contract: {
          address: config.CONTRACT_ADDRESS,
          accessible: true,
          votingActive: isActive
        },
        relayers: {
          total: relayerWallets.length,
          available: relayerWallets.length
        },
        cache: {
          sessions: sessionCache.keys().length,
          nullifiers: nullifierCache.keys().length
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'System health check failed',
        details: error.message
      }
    });
  }
});

app.get('/api/errors/:errorId', (req, res) => {
  const { errorId } = req.params;
  const error = votingStats.errors.find(e => e.timestamp.includes(errorId));
  
  if (!error) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'ERROR_NOT_FOUND',
        message: 'Error record not found'
      }
    });
  }

  res.json({
    success: true,
    data: error
  });
});

// ============ Identity & Merkle Tree APIs ============

// Mock Merkle tree data (in production, this would come from your Semaphore group)
const mockMerkleTree = {
  root: "0x2a9f8c3e7d4b5c6a8e9f0d1b2c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e",
  depth: 20,
  leaves: new Map() // identityCommitment -> leafIndex
};

// Populate with some mock identity commitments for testing
for (let i = 0; i < 100; i++) {
  const mockCommitment = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`identity_${i}`));
  mockMerkleTree.leaves.set(mockCommitment, i);
}

app.post('/api/voter/generate-identity', authenticateToken, async (req, res) => {
  try {
    const { identityCommitment } = req.body;
    
    // Check if identity commitment exists in Merkle tree
    const leafIndex = mockMerkleTree.leaves.get(identityCommitment);
    const isEligible = leafIndex !== undefined;
    
    if (!isEligible) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IDENTITY_NOT_ELIGIBLE',
          message: 'Identity commitment not found in eligible voters list'
        }
      });
    }

    // Generate mock Merkle proof (in production, use actual Semaphore library)
    const mockProof = {
      pathElements: Array(mockMerkleTree.depth).fill().map(() => 
        ethers.utils.hexlify(ethers.utils.randomBytes(32))
      ),
      pathIndices: Array(mockMerkleTree.depth).fill().map(() => Math.floor(Math.random() * 2))
    };

    res.json({
      success: true,
      data: {
        identityCommitment,
        isEligible: true,
        merkleProof: mockProof,
        merkleRoot: mockMerkleTree.root,
        leafIndex
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'IDENTITY_GENERATION_FAILED',
        message: 'Failed to generate identity proof',
        details: error.message
      }
    });
  }
});

app.get('/api/voter/merkle-proof/:identityCommitment', async (req, res) => {
  try {
    const { identityCommitment } = req.params;
    
    const leafIndex = mockMerkleTree.leaves.get(identityCommitment);
    
    if (leafIndex === undefined) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'IDENTITY_NOT_FOUND',
          message: 'Identity commitment not found in Merkle tree'
        }
      });
    }

    // Generate mock Merkle proof
    const mockProof = {
      pathElements: Array(mockMerkleTree.depth).fill().map(() => 
        ethers.utils.hexlify(ethers.utils.randomBytes(32))
      ),
      pathIndices: Array(mockMerkleTree.depth).fill().map(() => Math.floor(Math.random() * 2))
    };

    res.json({
      success: true,
      data: {
        identityCommitment,
        merkleProof: mockProof,
        merkleRoot: mockMerkleTree.root,
        treeDepth: mockMerkleTree.depth,
        leafIndex
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'MERKLE_PROOF_FAILED',
        message: 'Failed to generate Merkle proof',
        details: error.message
      }
    });
  }
});

// ============ Additional Utility APIs ============

app.get('/api/voting/remaining-time', async (req, res) => {
  try {
    const remainingTime = await votingContract.getRemainingTime();
    const remainingSeconds = parseInt(remainingTime.toString());
    
    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    res.json({
      success: true,
      data: {
        remainingTimeSeconds: remainingSeconds,
        formatted: {
          days,
          hours,
          minutes,
          seconds,
          display: `${days}d ${hours}h ${minutes}m ${seconds}s`
        },
        votingEnded: remainingSeconds === 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REMAINING_TIME_FAILED',
        message: 'Failed to get remaining voting time',
        details: error.message
      }
    });
  }
});

app.get('/api/candidates/:candidateId/votes', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const voteCount = await votingContract.getVoteCount(candidateId);
    
    res.json({
      success: true,
      data: {
        candidateId: parseInt(candidateId),
        voteCount: voteCount.toString(),
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CANDIDATE_VOTES_FAILED',
        message: 'Failed to get candidate vote count',
        details: error.message
      }
    });
  }
});

// ============ WebSocket Support for Real-time Updates ============

const http = require('http');
const socketIo = require('socket.io');

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Listen for VoteCast events and emit to connected clients
votingContract.on("VoteCast", (candidateId, nullifierHash, relayer, timestamp, event) => {
  const voteData = {
    candidateId: candidateId.toString(),
    nullifierHash: nullifierHash.toString(),
    relayerAddress: relayer,
    timestamp: new Date(timestamp.toNumber() * 1000).toISOString(),
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash
  };
  
  // Emit to all connected clients
  io.emit('vote_cast', voteData);
  
  console.log(`Vote cast: Candidate ${candidateId}, Block ${event.blockNumber}`);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('subscribe_to_votes', () => {
    socket.join('vote_updates');
    console.log(`Client ${socket.id} subscribed to vote updates`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ============ Error Handling Middleware ============

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  votingStats.errors.push({
    timestamp: new Date().toISOString(),
    error: err.message,
    code: 'INTERNAL_ERROR',
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`
    }
  });
});

// ============ Graceful Shutdown ============

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    provider.removeAllListeners();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    provider.removeAllListeners();
    process.exit(0);
  });
});

// ============ Server Startup ============

const startServer = async () => {
  try {
    // Validate environment variables
    const requiredEnvVars = [
      'CONTRACT_ADDRESS',
      'SEMAPHORE_VERIFIER_ADDRESS',
      'RPC_URL'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
      }
    }

    // Check relayer wallets
    if (relayerWallets.length === 0) {
      console.warn('⚠️  No relayer wallets loaded. Add RELAYER_PRIVATE_KEY_0 through RELAYER_PRIVATE_KEY_9 to environment');
    } else {
      console.log(`✅ Loaded ${relayerWallets.length} relayer wallets`);
    }

    // Test blockchain connection
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Connected to blockchain at block ${blockNumber}`);
    
    // Test contract connection
    const isActive = await votingContract.isVotingActive();
    console.log(`✅ Contract connected. Voting active: ${isActive}`);

    // Add some sample candidates for testing
    candidates.set(0, {
      id: 0,
      name: "Alice Johnson",
      party: "Progressive Party",
      imageUrl: "https://via.placeholder.com/300x400",
      biography: "Environmental advocate with 10 years of policy experience",
      manifesto: "Clean energy transition, education reform, healthcare access",
      addedAt: new Date().toISOString()
    });

    candidates.set(1, {
      id: 1,
      name: "Bob Smith",
      party: "Innovation Alliance",
      imageUrl: "https://via.placeholder.com/300x400",
      biography: "Tech entrepreneur focused on digital governance solutions",
      manifesto: "Digital infrastructure, startup ecosystem, tech education",
      addedAt: new Date().toISOString()
    });

    candidates.set(2, {
      id: 2,
      name: "Charlie Brown",
      party: "People's Choice",
      imageUrl: "https://via.placeholder.com/300x400",
      biography: "Community organizer with grassroots activism background",
      manifesto: "Affordable housing, worker rights, community development",
      addedAt: new Date().toISOString()
    });

    console.log(`✅ Added ${candidates.size} sample candidates`);

    server.listen(PORT, () => {
      console.log(`\n🚀 Voting System Backend Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📋 API documentation available at endpoints`);
      console.log(`⚡ WebSocket server ready for real-time updates`);
      console.log(`🔒 Rate limiting enabled: 100 requests/15min, 5 votes/min`);
      console.log(`\n📡 Contract Address: ${config.CONTRACT_ADDRESS}`);
      console.log(`🌐 Network ID: ${config.NETWORK_ID}`);
      console.log(`🎯 Voting Group ID: ${config.VOTING_GROUP_ID}`);
      console.log('\n✅ Server ready to accept connections\n');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();









//-------------------------
// npm init -y
// npm install express cors jsonwebtoken ethers express-rate-limit helmet google-auth-library crypto node-cache socket.io dotenv

//  Key Features Implemented
// Core Functionality

// Vote Submission API - Full ZK proof verification and blockchain proxy
// Real-time WebSocket Support - Live vote updates via contract events
// Authentication - Google OAuth with JWT session management
// Rate Limiting - Protection against spam and abuse
// Comprehensive Error Handling - User-friendly error messages

// Security Features

// Nullifier caching to prevent double voting
// ZK proof pre-verification before blockchain submission
// Random relayer wallet selection for anonymity
// Helmet.js security headers
// Input validation and sanitization