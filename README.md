# blockchain-voting-zkp
Blockchain-based voting system with Zero Knowledge Proof (Major Project)

## 🔹 How to Use Branches

- **main** → Final demo-ready code (Stable)  
- **dev** → Testing branch (all features merged here first)  
- **feat/contracts** → Smart Contracts (N + Amit)  
- **feat/frontend** → Next.js UI (M)  
- **feat/backend** → Firebase backend (K)  
- **feat/docs** → Documentation + PPTs (Amit + helpers)  


### 1. Clone the Repo
```bash
git clone https://github.com/YOUR_USERNAME/blockchain-voting-zkp.git
cd blockchain-voting-zkp

git checkout feat/contracts

**### 2. Create or Switch to Your Branch**

If you are starting new work (branch doesn’t exist yet):
git checkout -b feat/contracts

If branch already exists (already pushed to GitHub):
git checkout feat/contracts

### 3. Always Pull Latest Changes Before Working
git pull origin dev

### 4. Make Your Changes

Do your coding or documentation. Then save and commit:
git add .
git commit -m "feat: added castVote function"

### 5. Push Your Branch to GitHub
git push origin feat/contracts

### 6. Open a Pull Request (PR)

Go to GitHub → Pull Requests → New Pull Request

Compare your branch (feat/...) → merge into dev

Add description (what you did + tested)

Assign reviewer (Amit or N)

### 7. Final Merge

Amit merges dev → main only when stable.

main must always stay demo-ready.

**# Quick Commands Cheat Sheet**
# Clone the project
git clone <repo-link>

# See all branches
git branch -a

# Create a new branch
git checkout -b feat/myfeature

# Switch to a branch
git checkout feat/myfeature

# Pull updates from dev
git pull origin dev

# Stage and commit changes
git add .
git commit -m "your message"

# Push branch to GitHub
git push origin feat/myfeature


gitGraph
   commit id: "Start"
   branch dev
   commit id: "Setup Project"
   branch feat/contracts
   commit id: "Add Smart Contract"
   checkout dev
   merge feat/contracts
   branch feat/frontend
   commit id: "Add Login UI"
   checkout dev
   merge feat/frontend
   checkout main
   merge dev
   commit id: "Final Demo Build"
