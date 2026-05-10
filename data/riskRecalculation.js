import { buildings } from '../config/mongoCollections.js';

const computeRiskScore = (building) => {
  const complaints  = Number(building.complaintsCount)  || 0;
  const violations  = Number(building.violationsCount)  || 0;
  const bedbugs     = Number(building.bedbugCount)      || 0;
  const litigations = Number(building.litigationsCount) || 0;
  return complaints + violations * 2 + bedbugs * 3 + litigations * 4;
};

let isRunning = false;

export const runRiskRecalculation = async () => {
  if (isRunning) return;
  isRunning = true;

  try {
    const col = await buildings();
    const cursor = col.find({}, {
      projection: { complaintsCount: 1, violationsCount: 1, bedbugCount: 1, litigationsCount: 1 }
    });

    const now = new Date();
    const bulkOps = [];

    for await (const b of cursor) {
      const riskScore = computeRiskScore(b);
      const riskLevel = riskScore >= 15 ? 'High' : riskScore >= 6 ? 'Medium' : 'Low';

      bulkOps.push({
        updateOne: {
          filter: { _id: b._id },
          update: { $set: { riskScore, riskLevel, 'riskSummary.lastCalculatedAt': now } }
        }
      });
    }

    if (bulkOps.length) {
      await col.bulkWrite(bulkOps, { ordered: false });
    }

    console.log(`[risk-recalculation] recalculated ${bulkOps.length} buildings`);
  } finally {
    isRunning = false;
  }
};

export const startRiskRecalculation = (intervalMs = 60 * 1000) => {
  runRiskRecalculation().catch(console.error);

  return setInterval(() => {
    runRiskRecalculation().catch(console.error);
  }, intervalMs);
};
