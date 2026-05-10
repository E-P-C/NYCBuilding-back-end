import { ObjectId } from 'mongodb';
import xss from 'xss';
import { buildings, reviews } from '../config/mongoCollections.js';
import {
  VALIDATION_LIMITS,
  checkBoundedText,
  checkId,
  checkEnum,
  checkInt,
  checkIssueTags
} from './validation.js';

export const DUPLICATE_REVIEW_ERROR =
  'review already exists for this building; please edit your existing review instead';
export const REVIEW_MODERATION_STATUS_VALUES = Object.freeze(['flagged', 'hidden', 'deleted']);

const REVIEW_STATUS_BY_MODERATION_STATUS = Object.freeze({
  hidden: 'hidden',
  deleted: 'deleted'
});

const getIssueTagFrequency = (reviewList) => {
  const frequency = {};

  for (const review of reviewList) {
    for (const tag of review.issueTags || []) {
      frequency[tag] = (frequency[tag] || 0) + 1;
    }
  }

  return frequency;
};

export const refreshBuildingReviewAggregation = async (buildingId) => {
  buildingId = checkId(buildingId, 'buildingId');
  const buildingObjectId = new ObjectId(buildingId);
  const reviewCol = await reviews();
  const publishedReviews = await reviewCol
    .find(
      { buildingId: buildingObjectId, status: 'published' },
      { projection: { rating: 1, issueTags: 1 } }
    )
    .toArray();

  const reviewCount = publishedReviews.length;
  const ratingTotal = publishedReviews.reduce((total, review) => total + review.rating, 0);
  const averageRating = reviewCount === 0 ? 0 : Number((ratingTotal / reviewCount).toFixed(2));
  const issueTagFrequency = getIssueTagFrequency(publishedReviews);
  const buildingCol = await buildings();
  const result = await buildingCol.updateOne(
    { _id: buildingObjectId },
    {
      $set: {
        reviewCount,
        averageRating,
        issueTagFrequency
      }
    }
  );

  if (result.matchedCount === 0) throw 'building not found';

  return { reviewCount, averageRating, issueTagFrequency };
};

export const getReviewsByBuilding = async (buildingId) => {
  buildingId = checkId(buildingId, 'buildingId');
  const col = await reviews();
  return col.find({ buildingId: new ObjectId(buildingId), status: 'published' })
    .sort({ createdAt: -1 }).toArray();
};

export const createReview = async (buildingId, userId, reviewText, rating, issueTags = []) => {
  buildingId = checkId(buildingId, 'buildingId');
  userId = checkId(userId, 'userId');
  reviewText = xss(
    checkBoundedText(reviewText, 'reviewText', {
      maxLength: VALIDATION_LIMITS.reviewTextMaxLength
    })
  );
  checkInt(rating, 'rating', 1, 5);
  issueTags = checkIssueTags(issueTags, 'issueTags');
  const now = new Date();
  const col = await reviews();
  const buildingObjectId = new ObjectId(buildingId);
  const userObjectId = new ObjectId(userId);
  const existingReview = await col.findOne({
    buildingId: buildingObjectId,
    userId: userObjectId,
    status: 'published'
  });

  if (existingReview) {
    throw DUPLICATE_REVIEW_ERROR;
  }

  let insertedId;
  try {
    ({ insertedId } = await col.insertOne({
      buildingId: buildingObjectId,
      userId: userObjectId,
      reviewText, rating, issueTags,
      status: 'published',
      createdAt: now, updatedAt: now
    }));
  } catch (e) {
    if (e?.code === 11000) throw DUPLICATE_REVIEW_ERROR;
    throw e;
  }

  await refreshBuildingReviewAggregation(buildingId);

  return { _id: insertedId.toString() };
};

export const getAllReviewsForAdmin = async ({ limit = 200 } = {}) => {
  limit = checkInt(limit, 'limit', 1, 500);

  const col = await reviews();
  const pipeline = [
    { $sort: { createdAt: -1, _id: 1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'buildings',
        localField: 'buildingId',
        foreignField: '_id',
        as: 'building'
      }
    },
    { $unwind: { path: '$building', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        buildingAddress: '$building.streetAddress',
        firstName: '$user.firstName',
        lastName: '$user.lastName',
        username: '$user.username'
      }
    },
    {
      $project: {
        building: 0,
        user: 0
      }
    }
  ];

  return col.aggregate(pipeline).toArray();
};

const moderateReviewByAdmin = async (id, adminId, moderationStatus) => {
  id = checkId(id);
  adminId = checkId(adminId, 'adminId');
  moderationStatus = checkEnum(
    moderationStatus,
    REVIEW_MODERATION_STATUS_VALUES,
    'moderationStatus'
  );

  const now = new Date();
  const update = {
    moderationStatus,
    moderatedByAdminId: new ObjectId(adminId),
    moderatedAt: now,
    updatedAt: now
  };
  const status = REVIEW_STATUS_BY_MODERATION_STATUS[moderationStatus];

  if (status) {
    update.status = status;
  }

  const col = await reviews();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;

  if (!updated) throw 'review not found';

  if (status) {
    await refreshBuildingReviewAggregation(updated.buildingId.toString());
  }

  return updated;
};

export const flagReviewByAdmin = async (id, adminId) =>
  moderateReviewByAdmin(id, adminId, 'flagged');

export const hideReviewByAdmin = async (id, adminId) =>
  moderateReviewByAdmin(id, adminId, 'hidden');

export const deleteReviewByAdmin = async (id, adminId) =>
  moderateReviewByAdmin(id, adminId, 'deleted');

export const updateReview = async (id, userId, reviewText, rating, issueTags) => {
  id = checkId(id);
  userId = checkId(userId, 'userId');
  reviewText = xss(
    checkBoundedText(reviewText, 'reviewText', {
      maxLength: VALIDATION_LIMITS.reviewTextMaxLength
    })
  );
  checkInt(rating, 'rating', 1, 5);
  issueTags = checkIssueTags(issueTags ?? [], 'issueTags');
  const col = await reviews();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId: new ObjectId(userId) },
    { $set: { reviewText, rating, issueTags, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw 'review not found or not owned by user';

  await refreshBuildingReviewAggregation(updated.buildingId.toString());

  return updated;
};

export const deleteReview = async (id, userId) => {
  id = checkId(id);
  userId = checkId(userId, 'userId');
  const col = await reviews();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId: new ObjectId(userId) },
    { $set: { status: 'deleted', updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw 'review not found or not owned by user';

  await refreshBuildingReviewAggregation(updated.buildingId.toString());

  return { deleted: true };
};
