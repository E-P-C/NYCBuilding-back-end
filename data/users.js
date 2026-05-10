import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { users, buildings, reviews, shortlists } from '../config/mongoCollections.js';
import { refreshBuildingReviewAggregation } from './reviews.js';
import {
  checkString,
  checkId,
  checkEmail,
  checkUsername,
  checkPassword,
  checkRole,
} from "./validation.js";

const normalizeLoginCredential = (value) =>
  String(value).includes("@")
    ? {
        field: "emailNormalized",
        value: checkEmail(value, "email"),
      }
    : {
        field: "usernameNormalized",
        value: checkUsername(value, "username"),
      };

const serializeProfile = (user) => ({
  _id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email: user.email,
  role: user.role,
  watchlist: (user.watchlist || []).map((id) => id.toString()),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const serializeUserForAdmin = (user) => ({
  _id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email: user.email,
  role: user.role,
  isBanned: user.isBanned === true,
  bannedAt: user.bannedAt,
  bannedByAdminId: user.bannedByAdminId?.toString?.() ?? undefined,
  promotedAt: user.promotedAt,
  promotedByAdminId: user.promotedByAdminId?.toString?.() ?? undefined,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const serializeBuilding = (building) => ({
  _id: building._id.toString(),
  streetAddress: building.streetAddress,
  borough: building.borough,
  ownerName: building.ownerName,
  housingRecords: building.housingRecords,
  riskSummary: building.riskSummary,
  createdAt: building.createdAt,
  updatedAt: building.updatedAt
});

export const createUser = async (
  firstName,
  lastName,
  email,
  username,
  password,
  role = "user",
) => {
  firstName = checkString(firstName, "firstName");
  lastName = checkString(lastName, "lastName");
  email = checkEmail(email);
  username = checkUsername(username, "username");
  password = checkPassword(password, "password");
  role = checkRole(role, "role");

  const emailNormalized = email.toLowerCase();
  const usernameNormalized = username.toLowerCase();

  const hashedPassword = await bcrypt.hash(password, 12);
  const now = new Date();
  const col = await users();

  let insertedId;
  try {
    ({ insertedId } = await col.insertOne({
      firstName,
      lastName,
      email,
      emailNormalized,
      username,
      usernameNormalized,
      hashedPassword,
      role,
      isBanned: false,
      watchlist: [],
      createdAt: now,
      updatedAt: now,
    }));
  } catch (e) {
    if (e?.code === 11000) throw "email or username already taken";
    throw e;
  }

  return { _id: insertedId.toString() };
};

export const loginUser = async (username, password) => {
  const credential = normalizeLoginCredential(username);
  password = checkPassword(password, "password", { enforceStrength: false });

  const col = await users();

  const user = await col.findOne({
    [credential.field]: credential.value,
  });

  if (!user || !(await bcrypt.compare(password, user.hashedPassword))) {
    throw "invalid username or password";
  }

  if (user.isBanned === true) {
    throw "account is banned";
  }

  return {
    _id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    role: user.role,
    isBanned: false,
  };
};

export const getUserById = async (id) => {
  id = checkId(id);
  const col = await users();
  const user = await col.findOne({ _id: new ObjectId(id) });
  if (!user) throw "user not found";
  return user;
};

export const toggleWatchlist = async (userId, buildingId) => {
  userId = checkId(userId, "userId");
  buildingId = checkId(buildingId, "buildingId");

  const col = await users();
  const user = await col.findOne({ _id: new ObjectId(userId) });
  if (!user) throw "user not found";

  const bid = new ObjectId(buildingId);
  const inList = user.watchlist.some((id) => id.equals(bid));
  const op = inList
    ? { $pull: { watchlist: bid } }
    : { $addToSet: { watchlist: bid } };

  await col.updateOne(
    { _id: new ObjectId(userId) },
    { ...op, $set: { updatedAt: new Date() } },
  );

  return { watching: !inList };
};

export const getAllUsersForAdmin = async () => {
  const col = await users();
  const userList = await col
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  return userList.map(serializeUserForAdmin);
};

export const banUser = async (id, adminId) => {
  id = checkId(id, "userId");
  adminId = checkId(adminId, "adminId");

  if (id === adminId) {
    throw "admins cannot ban their own account";
  }

  const now = new Date();
  const col = await users();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: {
        isBanned: true,
        bannedAt: now,
        bannedByAdminId: new ObjectId(adminId),
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  const updated = result?.value ?? result;
  if (!updated) throw "user not found";
  return serializeUserForAdmin(updated);
};

export const promoteUserToAdmin = async (id, adminId) => {
  id = checkId(id, "userId");
  adminId = checkId(adminId, "adminId");

  const now = new Date();
  const col = await users();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: {
        role: "admin",
        promotedAt: now,
        promotedByAdminId: new ObjectId(adminId),
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  const updated = result?.value ?? result;
  if (!updated) throw "user not found";
  return serializeUserForAdmin(updated);
};

export const getProfile = async (id) => {
  id = checkId(id);
  const col = await users();
  const user = await col.findOne({ _id: new ObjectId(id) });
  if (!user) throw 'user not found';
  return serializeProfile(user);
};

export const updateProfile = async (id, { firstName, lastName, email, username }) => {
  id = checkId(id);
  firstName = checkString(firstName, 'firstName');
  lastName = checkString(lastName, 'lastName');
  email = checkEmail(email);
  username = checkUsername(username, 'username');
  const emailNormalized = email.toLowerCase();
  const usernameNormalized = username.toLowerCase();

  const col = await users();
  const existing = await col.findOne({
    _id: { $ne: new ObjectId(id) },
    $or: [
      { emailNormalized },
      { usernameNormalized }
    ]
  });
  if (existing) throw 'email or username already taken';

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: {
        firstName,
        lastName,
        email,
        emailNormalized,
        username,
        usernameNormalized,
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw 'user not found';
  return serializeProfile(updated);
};

export const getUserWatchlist = async (id) => {
  id = checkId(id);
  const col = await users();
  const user = await col.findOne({ _id: new ObjectId(id) });
  if (!user) throw 'user not found';

  const watchlistIds = user.watchlist || [];
  if (watchlistIds.length === 0) return [];

  const buildingCol = await buildings();
  const watchlistBuildings = await buildingCol
    .find({ _id: { $in: watchlistIds } })
    .limit(100)
    .toArray();
  const buildingsById = new Map(
    watchlistBuildings.map((building) => [building._id.toString(), building])
  );

  return watchlistIds
    .map((buildingId) => buildingsById.get(buildingId.toString()))
    .filter(Boolean)
    .map(serializeBuilding);
};

export const changePassword = async (id, currentPassword, newPassword) => {
  id = checkId(id);
  currentPassword = checkPassword(currentPassword, 'currentPassword', { enforceStrength: false });
  newPassword = checkPassword(newPassword, 'newPassword');

  const col = await users();
  const user = await col.findOne({ _id: new ObjectId(id) });
  if (!user) throw 'user not found';

  if (!(await bcrypt.compare(currentPassword, user.hashedPassword)))
    throw 'current password is incorrect';

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { hashedPassword, updatedAt: new Date() } }
  );

  return { updated: true };
};

export const deleteUser = async (id) => {
  id = checkId(id);
  const oid = new ObjectId(id);

  const col = await users();
  const user = await col.findOne({ _id: oid });
  if (!user) throw 'user not found';

  const reviewsCol = await reviews();
  const userReviews = await reviewsCol
    .find({ userId: oid }, { projection: { buildingId: 1 } })
    .toArray();
  const buildingIdsToRefresh = [
    ...new Set(userReviews.map((review) => review.buildingId.toString()))
  ];

  await reviewsCol.updateMany(
    { userId: oid },
    { $set: { status: 'deleted', updatedAt: new Date() } }
  );
  await Promise.all(buildingIdsToRefresh.map(refreshBuildingReviewAggregation));

  const shortlistsCol = await shortlists();
  await shortlistsCol.deleteMany({ userId: oid });

  await col.deleteOne({ _id: oid });

  return { deleted: true };
};
