// zk/finalize-group.js
import fs from "fs";
import path from "path";
import { Group } from "@semaphore-protocol/group";

function bestToString(v) {
  try {
    return v.toString();
  } catch (e) {
    return String(v);
  }
}

function computeRootFromGroupObj(group) {
  // try a few likely property names/methods
  if (!group) return null;
  if (typeof group.root !== "undefined") return group.root;
  if (typeof group.merkleRoot !== "undefined") return group.merkleRoot;
  if (typeof group.getRoot === "function") return group.getRoot();
  if (typeof group.rootHash !== "undefined") return group.rootHash;
  return null;
}

function usage() {
  console.log("Usage: node zk/finalize-group.js [outputSnapshotPath]");
  console.log("Defaults to zk/group_snapshot_<timestamp>.json");
}

async function main() {
  try {
    const outArg = process.argv[2]; // optional
    const baseGroupPath = path.join("zk", "group.json");
    if (!fs.existsSync(baseGroupPath)) {
      console.error("❌ zk/group.json not found. Build your group first.");
      process.exit(1);
    }

    const groupData = JSON.parse(fs.readFileSync(baseGroupPath, "utf8"));
    const depth = groupData.depth || 20;
    const members = (groupData.members || []).map(m => BigInt(m));

    const group = new Group(members, depth);

    // compute root (try several properties/methods)
    let root = computeRootFromGroupObj(group);
    if (root === null) {
      // as a last resort, compute root from leaves by creating a new Group and using its root property
      if (typeof group.root === "undefined") {
        // try to access .root again more defensively
        root = group.root ?? group.merkleRoot ?? null;
      }
    }

    if (root === null || typeof root === "undefined") {
      console.warn("⚠️ Could not detect group root automatically. Attempting string fallback.");
      // attempt stringifying the property if available
      root = (group.root && group.root.toString && group.root.toString()) ||
             (group.merkleRoot && group.merkleRoot.toString && group.merkleRoot.toString()) ||
             null;
    }

    if (!root) {
      console.error("❌ Failed to determine Merkle root from Group object. Aborting.");
      process.exit(1);
    }

    const snapshot = {
      depth: depth,
      members: members.map(m => m.toString()),
      root: bestToString(root),
      frozen: true,
      createdAt: new Date().toISOString()
    };

    const outPath = outArg || path.join("zk", `group_snapshot_${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
    console.log("✅ Group snapshot created:", outPath);
    console.log("📊 Members:", snapshot.members.length);
    console.log("🔐 Root:", snapshot.root);
    console.log("🔒 Snapshot is frozen: no further members should be added to this file.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
