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
  const doc = {
    ...data,
    ...normalized,
    riskSummary: data.riskSummary ?? { highlights: [], lastCalculatedAt: now },
    housingRecords: data.housingRecords ?? [],
    createdByAdminId: new ObjectId(adminId),
    updatedByAdminId: new ObjectId(adminId),
    createdAt: now,
    updatedAt: now
  };
  const { insertedId } = await col.insertOne(doc);
  return { _id: insertedId.toString() };
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
        ...data,
        ...normalized,
        updatedByAdminId: new ObjectId(adminId),
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );
  if (!result) throw 'building not found';
  return result;
};

export const deleteBuilding = async (id) => {
  id = checkId(id);
  const col = await buildings();
  const result = await col.findOneAndDelete({ _id: new ObjectId(id) });
  if (!result) throw 'building not found';
  return { deleted: true };
};

export const getBuildingsByOwner = async (ownerName) => {
  ownerName = checkBoundedText(ownerName, 'ownerName', {
    maxLength: VALIDATION_LIMITS.ownerNameMaxLength
  });
  const col = await buildings();
  return col.find({ ownerName }).toArray();
};
