import fs from "fs";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";

async function main() {
  const depth = 20;

  // Load existing group if exists, otherwise create new
  let groupData;
  let members = [];
  try {
    groupData = JSON.parse(fs.readFileSync("zk/group.json"));
    members = groupData.members.map((m) => BigInt(m));
  } catch {
    groupData = null;
    members = [];
  }

  const group = new Group(members, depth);

  // Add a new voter identity
  const voterIdentity = new Identity();
  console.log("New voter identity commitment:", voterIdentity.commitment.toString());

  if (!members.includes(voterIdentity.commitment)) {
    members.push(voterIdentity.commitment);
    group.addMember(voterIdentity.commitment);
  }

  // Save updated group info
  const newGroupData = {
    depth,
    members: members.map((x) => x.toString()),
    root: group.root.toString()
  };

  fs.writeFileSync("zk/group.json", JSON.stringify(newGroupData, null, 2));
  console.log("Group saved to zk/group.json ✅");
}

main().catch((err) => {
  console.error("Error setting up group:", err);
});


// // zk/setup-group.js
// import { Group } from "@semaphore-protocol/group";
// import fs from "fs";

// async function main() {
//   // Create an empty array of members
//   const members = [];

//   // Set Merkle tree depth (must match your contract)
//   const depth = 20;

//   // Initialize the group
//   const group = new Group(members, depth);

//   // Add dummy members
//   for (let i = 1; i <= 5; i++) {
//     const idCommitment = BigInt(i); // placeholder identity commitment
//     members.push(idCommitment);
//     group.addMember(idCommitment);
//   }

//   console.log("Merkle root:", group.root.toString());

//   // Save group info to JSON
//   const groupData = {
//     depth,
//     members: members.map((x) => x.toString()),
//     root: group.root.toString()
//   };

//   fs.writeFileSync("zk/group.json", JSON.stringify(groupData, null, 2));
//   console.log("Group saved to zk/group.json ✅");
// }

// main().catch((err) => {
//   console.error("Error setting up group:", err);
// });
