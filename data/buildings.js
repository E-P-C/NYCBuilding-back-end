import { ObjectId } from 'mongodb';
import { buildings } from '../config/mongoCollections.js';
import {
  VALIDATION_LIMITS,
  checkBoundedText,
  checkId,
  checkOptionalBoundedText,
  checkOptionalBorough,
  checkOptionalEnum,
  checkBorough,
  checkQueryInt
} from './validation.js';

export const BUILDINGS_DEFAULT_LIMIT = 20;
export const BUILDINGS_MAX_LIMIT = 100;
export const BUILDINGS_SEARCH_MAX_LENGTH = 120;
export const BUILDINGS_NEIGHBORHOOD_MAX_LENGTH = 120;
export const BUILDING_RISK_LEVEL_VALUES = Object.freeze(['Low', 'Medium', 'High']);
export const BUILDING_SORT_VALUES = Object.freeze(['risk', 'reviews', 'date']);
export const BUILDING_SORT_ORDER_VALUES = Object.freeze(['asc', 'desc']);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildBuildingSort = (sortBy, sortOrder) => {
  if (!sortBy) return undefined;

  const direction = sortOrder === 'asc' ? 1 : -1;

  if (sortBy === 'risk') {
    return { riskScore: direction, createdAt: -1, _id: 1 };
  }

  if (sortBy === 'reviews') {
    return { reviewCount: direction, createdAt: -1, _id: 1 };
  }

  return { createdAt: direction, _id: 1 };
};

const normalizeDuplicatePart = (value) => String(value || '').trim().toLowerCase();
const normalizeDuplicateKey = ({ streetAddress, borough }) =>
  `${normalizeDuplicatePart(streetAddress)}|${normalizeDuplicatePart(borough)}`;

const normalizeBuildingInput = (data, { requireCoreFields = false } = {}) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw 'data must be an object';
  }

  const normalized = {};

  if (requireCoreFields || hasOwn(data, 'streetAddress')) {
    normalized.streetAddress = checkBoundedText(data.streetAddress, 'streetAddress', {
      minLength: 3,
      maxLength: VALIDATION_LIMITS.streetAddressMaxLength
    });
  }

  if (requireCoreFields || hasOwn(data, 'borough')) {
    normalized.borough = checkBorough(data.borough, 'borough');
  }

  if (hasOwn(data, 'ownerName') && data.ownerName !== undefined) {
    normalized.ownerName = checkBoundedText(data.ownerName, 'ownerName', {
      maxLength: VALIDATION_LIMITS.ownerNameMaxLength
    });
  }

  return normalized;
};

const buildBuildingDocument = (data, normalized, adminId, now) => {
  const {
    _id,
    createdByAdminId,
    updatedByAdminId,
    createdAt,
    updatedAt,
    ...safeData
  } = data;

  return {
    ...safeData,
    ...normalized,
    riskSummary: data.riskSummary ?? { highlights: [], lastCalculatedAt: now },
    housingRecords: data.housingRecords ?? [],
    reviewCount: 0,
    averageRating: 0,
    issueTagFrequency: {},
    createdByAdminId: new ObjectId(adminId),
    updatedByAdminId: new ObjectId(adminId),
    createdAt: now,
    updatedAt: now
  };
};

const normalizeBulkBuildingInput = (buildingList) => {
  if (!Array.isArray(buildingList)) {
    throw 'buildings must be an array';
  }

  if (buildingList.length === 0) {
    throw 'buildings must contain at least one building';
  }

  const seen = new Set();

  return buildingList.map((building, index) => {
    const normalized = normalizeBuildingInput(building, { requireCoreFields: true });
    const duplicateKey = normalizeDuplicateKey(normalized);

    if (seen.has(duplicateKey)) {
      throw `duplicate building in import at index ${index}: ${normalized.streetAddress}, ${normalized.borough}`;
    }

    seen.add(duplicateKey);

    return {
      original: building,
      normalized,
      duplicateKey
    };
  });
};

export const getAllBuildings = async ({
  search,
  borough,
  neighborhood,
  riskLevel,
  sortBy,
  sortOrder = 'desc',
  page = 1,
  limit = 20
} = {}) => {
  search = checkOptionalBoundedText(search, 'search', {
    maxLength: BUILDINGS_SEARCH_MAX_LENGTH,
    emptyValue: undefined
  });
  borough = checkOptionalBorough(borough, 'borough');
  neighborhood = checkOptionalBoundedText(neighborhood, 'neighborhood', {
    maxLength: BUILDINGS_NEIGHBORHOOD_MAX_LENGTH,
    emptyValue: undefined
  });
  riskLevel = checkOptionalEnum(riskLevel, BUILDING_RISK_LEVEL_VALUES, 'riskLevel', {
    caseInsensitive: true
  });
  sortBy = checkOptionalEnum(sortBy, BUILDING_SORT_VALUES, 'sortBy', {
    caseInsensitive: true
  });
  sortOrder = checkOptionalEnum(sortOrder, BUILDING_SORT_ORDER_VALUES, 'sortOrder', {
    caseInsensitive: true,
    emptyValue: 'desc'
  });
  page = checkQueryInt(page, 'page', { defaultValue: 1, min: 1 });
  limit = checkQueryInt(limit, 'limit', {
    defaultValue: BUILDINGS_DEFAULT_LIMIT,
    min: 1,
    max: BUILDINGS_MAX_LIMIT
  });

  const col = await buildings();
  const query = {};
  if (search) query.$text = { $search: search };
  if (borough) query.borough = borough;
  if (neighborhood) query.neighborhood = new RegExp(`^${escapeRegExp(neighborhood)}$`, 'i');
  if (riskLevel) query.riskLevel = riskLevel;
  const skip = (page - 1) * limit;
  const sort = buildBuildingSort(sortBy, sortOrder);
  let cursor = col.find(query);

  if (sort) {
    cursor = cursor.sort(sort);
  }

  const [items, total] = await Promise.all([
    cursor.skip(skip).limit(limit).toArray(),
    col.countDocuments(query)
  ]);
  return { items, total, page, limit };
};

export const getBuildingById = async (id) => {
  id = checkId(id);
  const col = await buildings();
  const building = await col.findOne({ _id: new ObjectId(id) });
  if (!building) throw 'building not found';
  return building;
};

export const createBuilding = async (data, adminId) => {
  adminId = checkId(adminId, 'adminId');
  const normalized = normalizeBuildingInput(data, { requireCoreFields: true });
  const now = new Date();
  const col = await buildings();
  const doc = buildBuildingDocument(data, normalized, adminId, now);
  const { insertedId } = await col.insertOne(doc);
  return { _id: insertedId.toString() };
};

export const importBuildings = async (buildingList, adminId) => {
  adminId = checkId(adminId, 'adminId');
  const normalizedBuildings = normalizeBulkBuildingInput(buildingList);
  const col = await buildings();
  const boroughs = [...new Set(normalizedBuildings.map(({ normalized }) => normalized.borough))];
  const existingBuildings = await col
    .find(
      { borough: { $in: boroughs } },
      { projection: { streetAddress: 1, borough: 1 } }
    )
    .toArray();
  const existingKeys = new Set(existingBuildings.map(normalizeDuplicateKey));
  const duplicate = normalizedBuildings.find(({ duplicateKey }) => existingKeys.has(duplicateKey));

  if (duplicate) {
    throw `building already exists: ${duplicate.normalized.streetAddress}, ${duplicate.normalized.borough}`;
  }

  const now = new Date();
  const docs = normalizedBuildings.map(({ original, normalized }) =>
    buildBuildingDocument(original, normalized, adminId, now)
  );
  const result = await col.insertMany(docs, { ordered: true });

  return {
    insertedCount: result.insertedCount,
    insertedIds: Object.values(result.insertedIds).map((id) => id.toString())
  };
};

export const updateBuilding = async (id, data, adminId) => {
  id = checkId(id);
  adminId = checkId(adminId, 'adminId');
  const normalized = normalizeBuildingInput(data);
  const col = await buildings();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: {
        ...normalized,
        updatedByAdminId: new ObjectId(adminId),
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw 'building not found';
  return updated;
};

export const deleteBuilding = async (id) => {
  id = checkId(id);
  const col = await buildings();
  const result = await col.findOneAndDelete({ _id: new ObjectId(id) });
  const deleted = result?.value ?? result;
  if (!deleted) throw 'building not found';
  return { deleted: true };
};

export const getBuildingsByOwner = async (ownerName) => {
  ownerName = checkBoundedText(ownerName, 'ownerName', {
    maxLength: VALIDATION_LIMITS.ownerNameMaxLength
  });
  const col = await buildings();
  return col.find({ ownerName }).toArray();
};

export const getNeighborhoodTrends = async (borough) => {
  borough = checkOptionalBorough(borough, 'borough');
  const col = await buildings();

  const matchStage = borough ? { $match: { borough } } : { $match: {} };

  const pipeline = [
    matchStage,
    {
      $facet: {
        boroughStats: [
          {
            $group: {
              _id: '$borough',
              buildingCount: { $sum: 1 },
              totalComplaints: { $sum: '$complaintsCount' },
              totalViolations: { $sum: '$violationsCount' },
              totalBedbugs: { $sum: '$bedbugCount' },
              totalLitigations: { $sum: '$litigationsCount' },
              avgRiskScore: { $avg: '$riskScore' },
              lowCount: {
                $sum: { $cond: [{ $eq: ['$riskLevel', 'Low'] }, 1, 0] }
              },
              mediumCount: {
                $sum: { $cond: [{ $eq: ['$riskLevel', 'Medium'] }, 1, 0] }
              },
              highCount: {
                $sum: { $cond: [{ $eq: ['$riskLevel', 'High'] }, 1, 0] }
              }
            }
          },
          { $sort: { _id: 1 } }
        ],
        issueCategories: [
          { $unwind: '$housingRecords' },
          {
            $group: {
              _id: {
                borough: '$borough',
                category: '$housingRecords.category'
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ]
      }
    }
  ];

  const [result] = await col.aggregate(pipeline).toArray();
  const { boroughStats, issueCategories } = result;

  const issueCategoriesByBorough = {};
  for (const entry of issueCategories) {
    const boroughName = entry._id.borough;
    if (!issueCategoriesByBorough[boroughName]) {
      issueCategoriesByBorough[boroughName] = [];
    }
    issueCategoriesByBorough[boroughName].push({
      category: entry._id.category,
      count: entry.count
    });
  }

  const trends = boroughStats.map((stat) => ({
    borough: stat._id,
    buildingCount: stat.buildingCount,
    totalComplaints: stat.totalComplaints,
    totalViolations: stat.totalViolations,
    totalBedbugs: stat.totalBedbugs,
    totalLitigations: stat.totalLitigations,
    avgRiskScore: Math.round(stat.avgRiskScore * 100) / 100,
    riskDistribution: {
      Low: stat.lowCount,
      Medium: stat.mediumCount,
      High: stat.highCount
    },
    topIssueCategories: (issueCategoriesByBorough[stat._id] || []).slice(0, 5)
  }));

  return { trends };
};

export const getAlternatives = async (id, limit) => {
  id = checkId(id);
  limit = checkQueryInt(limit, 'limit', { defaultValue: 5, min: 1, max: 10 });

  const col = await buildings();
  const sourceBuilding = await col.findOne({ _id: new ObjectId(id) });
  if (!sourceBuilding) throw 'building not found';

  if (sourceBuilding.riskLevel === 'Low') {
    return {
      alternatives: [],
      sourceBuilding: {
        _id: sourceBuilding._id,
        riskScore: sourceBuilding.riskScore
      }
    };
  }

  const alternatives = await col
    .find({
      borough: sourceBuilding.borough,
      _id: { $ne: new ObjectId(id) },
      riskScore: { $lt: sourceBuilding.riskScore }
    })
    .sort({ riskScore: 1 })
    .limit(limit)
    .toArray();

  return {
    alternatives,
    sourceBuilding: {
      _id: sourceBuilding._id,
      riskScore: sourceBuilding.riskScore
    }
  };
};

const CUSTOM_SCORE_DEFAULT_WEIGHTS = Object.freeze({
  complaints: 1,
  violations: 2,
  bedbugs: 3,
  litigations: 4
});

const computeCustomRiskLevel = (score) => {
  if (score < 6) return 'Low';
  if (score <= 15) return 'Medium';
  return 'High';
};

export const calculateCustomScores = async (buildingIds, weights) => {
  if (!Array.isArray(buildingIds) || buildingIds.length === 0) {
    throw 'buildingIds must be a non-empty array';
  }

  const validatedIds = buildingIds.map((bid, index) => {
    const validated = checkId(bid, `buildingIds[${index}]`);
    return new ObjectId(validated);
  });

  const resolvedWeights = {
    complaints: weights?.complaints ?? CUSTOM_SCORE_DEFAULT_WEIGHTS.complaints,
    violations: weights?.violations ?? CUSTOM_SCORE_DEFAULT_WEIGHTS.violations,
    bedbugs: weights?.bedbugs ?? CUSTOM_SCORE_DEFAULT_WEIGHTS.bedbugs,
    litigations: weights?.litigations ?? CUSTOM_SCORE_DEFAULT_WEIGHTS.litigations
  };

  for (const [key, value] of Object.entries(resolvedWeights)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw `weights.${key} must be a finite number`;
    }
  }

  const col = await buildings();
  const docs = await col
    .find({ _id: { $in: validatedIds } })
    .toArray();

  const result = docs.map((doc) => {
    const customScore =
      (doc.complaintsCount || 0) * resolvedWeights.complaints +
      (doc.violationsCount || 0) * resolvedWeights.violations +
      (doc.bedbugCount || 0) * resolvedWeights.bedbugs +
      (doc.litigationsCount || 0) * resolvedWeights.litigations;

    return {
      _id: doc._id,
      streetAddress: doc.streetAddress,
      borough: doc.borough,
      neighborhood: doc.neighborhood,
      riskScore: doc.riskScore,
      complaintsCount: doc.complaintsCount,
      violationsCount: doc.violationsCount,
      bedbugCount: doc.bedbugCount,
      litigationsCount: doc.litigationsCount,
      customScore: Math.round(customScore * 100) / 100,
      riskLevel: computeCustomRiskLevel(customScore)
    };
  });

  return { buildings: result };
};
