# **🗳️ Team Guide: Setting Up the Firebase Backend Locally**

Welcome to the project\! This guide is for team members who need to set up their local environment to work with the **already created and configured** Firebase backend.  
You will **not** create a new Firebase project or manage billing. Your goal is to connect your local code to the existing cloud project, allowing you to deploy updates.

## **📋 Prerequisites**

Ensure you have the following tools installed and configured on your system:

1. **Git:** For version control.  
2. **Node.js v20:** You must be using Node.js v20. Use a Node Version Manager (nvm or nvm-windows) and run nvm use 20\.  
3. **Firebase CLI:** The command-line interface for Firebase. If not installed, run npm install \-g firebase-tools.

## **🔥 Step 1: Get Access to the Shared Firebase Project**

Before you can do anything, the project owner must grant you access to the Firebase project.

1. **Provide Your Email:** Give your Google account email address to the project owner.  
2. **Accept the Invitation:** The owner will invite you to the Firebase project with the **"Editor"** role. You will receive an invitation via email. Click the link and accept it. This role will allow you to deploy functions.

## **🚀 Step 2: Set Up Your Local Environment**

Now, let's get the code and connect it to the Firebase project.

1. **Clone the Repository:**  
   git clone \[https://github.com/AgreeableAK/blockchain-voting-zkp.git\](https://github.com/AgreeableAK/blockchain-voting-zkp.git)  
   cd blockchain-voting-zkp

2. **Switch to the Backend Branch:** All backend work is done on the feat/backend branch.  
   git checkout feat/backend

3. **Log into Firebase:** Open your terminal and run this command. It will open a browser window for you to log into the Google account that was invited to the project.  
   firebase login

4. **Link Your Local Project:** Now, link your local firebase-backend directory to the shared cloud project.  
   * First, navigate into the backend folder:  
     cd firebase-backend

   * Next, run the firebase use command. The CLI will present a list of projects you have access to. Select the shared zk-voting-project from the list.  
     firebase use \--add

## **🛠️ Step 3: Install Dependencies**

Your local environment is now connected to the cloud project. The final step before configuration is to install the necessary Node.js packages.

1. **Navigate to the Functions Directory:**  
   \# If you are in the 'firebase-backend' directory:  
   cd functions

2. **Install Dependencies:** Run npm install to download all the packages listed in package.json.  
   npm install

## **🔐 Step 4: Configure the Function for Deployment (Important)**

Before you can deploy, you must configure the backend function with the correct blockchain network and smart contract addresses.

1. **Get Secrets from Project Owner:** Ask the project owner (your teammate) for the following values from the root .env file of the contract project:  
   * SEPOLIA\_RPC\_URL (including the API key)  
   * The latest CONTRACT\_ADDRESS from their most recent deployment.  
2. **Update index.js:** Open the firebase-backend/functions/index.js file. Find the following lines near the top of the file:  
   // \--- IMPORTANT: CONFIGURE THESE VALUES \---  
   const SEPOLIA\_RPC\_URL \= "\[https://eth-sepolia.g.alchemy.com/v2/YOUR\_API\_KEY\](https://eth-sepolia.g.alchemy.com/v2/YOUR\_API\_KEY)";  
   const CONTRACT\_ADDRESS \= "0xYOUR\_DEPLOYED\_CONTRACT\_ADDRESS";

3. **Replace the Placeholders:** Replace the placeholder strings with the actual values you received from the project owner. **The function will not deploy or work without this step.**

## **✅ How to Deploy Changes**

If you make any changes to the backend code, you can deploy the new version to the cloud by running the following command from the firebase-backend directory:  
\# Make sure you are inside the 'firebase-backend' directory  
firebase deploy \--only functions  
