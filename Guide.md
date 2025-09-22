# Foundry + Semaphore Setup Guide

## 🔧 Here's the breakdown:**

### **Use `forge install` for:**
- ✅ **Smart contract dependencies** (Solidity libraries)
- ✅ **On-chain verification contracts**
- ✅ **Gas-optimized libraries**

### **Use `npm install` for:**
- ✅ **JavaScript/TypeScript utilities**
- ✅ **ZK proof generation libraries**
- ✅ **Frontend integration tools**
- ✅ **Build scripts and testing utilities**

## 🚀 **Complete Setup Sequence**

### Step 1: Initialize Foundry Project
```bash
# Install Foundry (if not already done)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Create project
forge init blockchain-voting-zk
cd blockchain-voting-zk
```

### Step 2: Install Smart Contract Libraries (using forge)
```bash
# Core Semaphore contracts for on-chain verification
forge install semaphore-protocol/semaphore      # ZK verification

# Essential smart contract libraries
forge install OpenZeppelin/openzeppelin-contracts # Security standards
forge install transmissions11/solmate             # Gas optimization
forge install Vectorized/solady                   # More optimizations
forge install Brechtpd/base64                     # Utilities

# Update remappings
echo '@semaphore-protocol/=lib/semaphore/packages/contracts/contracts/' >> remappings.txt
echo '@openzeppelin/=lib/openzeppelin-contracts/' >> remappings.txt
echo 'solmate/=lib/solmate/src/' >> remappings.txt
echo 'solady/=lib/solady/src/' >> remappings.txt
```

### Step 3: Install JavaScript/ZK Libraries (using npm)
```bash
# Initialize npm in your project
npm init -y

# Core Semaphore JavaScript libraries
npm install @semaphore-protocol/identity
npm install @semaphore-protocol/group
npm install @semaphore-protocol/proof

# Additional ZK utilities
npm install @zk-kit/poseidon-cipher
npm install snarkjs

# Development dependencies
npm install --save-dev typescript @types/node
npm install --save-dev dotenv
```

### Step 4: Create Project Structure
```bash
# Create directories
mkdir scripts zk frontend-sdk
mkdir contracts/interfaces contracts/libraries

# Create key files
touch contracts/VotingSystem.sol
touch scripts/deploy.js
touch scripts/generate-wallets.js
touch zk/setup-group.js
touch zk/generate-proof.js
```

## 📁 **Your Project Structure Will Look Like:**

```
blockchain-voting-zk/
├── contracts/                    # Solidity contracts
│   ├── VotingSystem.sol          # Main voting contract
│   └── interfaces/
├── lib/                          # Forge dependencies
│   ├── semaphore/               # forge install
│   ├── openzeppelin-contracts/  # forge install
│   └── solmate/                 # forge install
├── node_modules/                 # npm dependencies
│   ├── @semaphore-protocol/     # npm install
│   └── snarkjs/                 # npm install
├── scripts/                      # JavaScript utilities
│   ├── deploy.js                # Deployment script
│   └── generate-wallets.js      # Wallet generation
├── zk/                          # ZK proof utilities
│   ├── setup-group.js           # Merkle tree setup
│   └── generate-proof.js        # Proof generation
├── test/                        # Foundry tests
├── foundry.toml                 # Foundry config
├── package.json                 # npm dependencies
└── remappings.txt               # Import path mappings
```

## 🎯 **Why This Hybrid Approach:**

**Forge libraries (Solidity):**
```solidity
// In your contracts, you import from forge libraries:
import "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "solmate/tokens/ERC20.sol";
```

**npm libraries (JavaScript):**
```javascript
// In your scripts, you use npm libraries:
import { Identity } from "@semaphore-protocol/identity"
import { Group } from "@semaphore-protocol/group"
import { generateProof } from "@semaphore-protocol/proof"
```

## 🔧 **Configure Your foundry.toml**

```toml
[profile.default]
src = "contracts"
out = "out"
libs = ["lib"]
remappings = [
    "@semaphore-protocol/=lib/semaphore/packages/contracts/contracts/",
    "@openzeppelin/=lib/openzeppelin-contracts/",
    "solmate/=lib/solmate/src/",
    "solady/=lib/solady/src/"
]

[profile.default.fuzz]
runs = 1000

[profile.default.invariant]
runs = 1000
depth = 500
```

## 🔧 **Configure Your package.json Scripts**

```json
{
  "name": "blockchain-voting-zk",
  "scripts": {
    "compile": "forge build", 
    "test": "forge test",
    "deploy": "node scripts/deploy.js",
    "setup-group": "node zk/setup-group.js",
    "generate-proof": "node zk/generate-proof.js",
    "generate-wallets": "node scripts/generate-wallets.js"
  }
}
```

## ✅ **Verify Everything Works**

```bash
# Test Foundry compilation
forge build

# Test Foundry testing
forge test

# Test npm packages
node -e "console.log('Semaphore Identity:', require('@semaphore-protocol/identity'))"

# Check remappings
forge remappings
```

## 🎯 **Next Steps:**

1. **Create your first contract** using Semaphore interfaces
2. **Set up ZK proof generation** with npm libraries  
3. **Write Foundry tests** that verify the integration
4. **Create deployment scripts** that handle both contracts and ZK setup

## 💡 **Pro Tips:**

- **Use forge for contracts**: Fast compilation, testing, deployment
- **Use npm for ZK logic**: Proof generation, Merkle trees, frontend integration
- **Keep them separate**: Don't mix JavaScript in Solidity tests (Foundry is pure Solidity)
- **Use scripts/ folder**: For JavaScript utilities that interact with your contracts

This hybrid approach gives you the best of both worlds - Foundry's speed for contracts and Semaphore's mature ZK libraries for cryptography!