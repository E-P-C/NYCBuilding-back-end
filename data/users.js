import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { users } from '../config/mongoCollections.js';
import { reviews } from '../config/mongoCollections.js';
import { shortlists } from '../config/mongoCollections.js';
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

const serializeUserForAdmin = (user) => ({
  _id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  username: user.username,
  role: user.role,
  isBanned: user.isBanned === true,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  bannedAt: user.bannedAt,
  bannedByAdminId: user.bannedByAdminId?.toString(),
  promotedAt: user.promotedAt,
  promotedByAdminId: user.promotedByAdminId?.toString(),
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

  if (!result) throw "user not found";

  return serializeUserForAdmin(result);
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

  if (!result) throw "user not found";

  return serializeUserForAdmin(result);
};

export const getProfile = async (id) => {
  id = checkId(id);
  const col = await users();
  const user = await col.findOne({ _id: new ObjectId(id) });
  if (!user) throw 'user not found';
  const { hashedPassword, ...profile } = user;
  profile._id = profile._id.toString();
  profile.watchlist = (profile.watchlist || []).map(wid => wid.toString());
  return profile;
};

export const updateProfile = async (id, { firstName, lastName, email, username }) => {
  id = checkId(id);
  firstName = checkString(firstName, 'firstName');
  lastName = checkString(lastName, 'lastName');
  email = checkEmail(email);
  username = checkUsername(username, 'username');

  const col = await users();
  const existing = await col.findOne({
    _id: { $ne: new ObjectId(id) },
    $or: [
      { email: buildCaseInsensitiveExactMatch(email) },
      { username: buildCaseInsensitiveExactMatch(username) }
    ]
  });
  if (existing) throw 'email or username already taken';

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { firstName, lastName, email, username, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) throw 'user not found';

  return {
    _id: result._id.toString(),
    firstName: result.firstName,
    lastName: result.lastName,
    username: result.username,
    email: result.email,
    role: result.role
  };
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
  await reviewsCol.updateMany(
    { userId: oid },
    { $set: { status: 'deleted', updatedAt: new Date() } }
  );

  const shortlistsCol = await shortlists();
  await shortlistsCol.deleteMany({ userId: oid });

  await col.deleteOne({ _id: oid });

  return { deleted: true };
};
