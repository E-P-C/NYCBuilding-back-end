import { ObjectId } from 'mongodb';
import xss from 'xss';
import { shortlists } from '../config/mongoCollections.js';
import {
  VALIDATION_LIMITS,
  checkBoundedText,
  checkId,
  checkOptionalBoundedText
} from './validation.js';

export const getShortlistsByUser = async (userId) => {
  userId = checkId(userId, 'userId');
  const col = await shortlists();
  return col.find({ userId: new ObjectId(userId) }).toArray();
};

export const createShortlist = async (userId, shortlistName) => {
  userId = checkId(userId, 'userId');
  shortlistName = checkBoundedText(shortlistName, 'shortlistName', {
    maxLength: VALIDATION_LIMITS.shortlistNameMaxLength
  });
  const now = new Date();
  const col = await shortlists();
  const { insertedId } = await col.insertOne({
    userId: new ObjectId(userId),
    shortlistName, items: [], createdAt: now, updatedAt: now
  });
  return { _id: insertedId.toString() };
};

export const addItemToShortlist = async (shortlistId, userId, buildingId) => {
  shortlistId = checkId(shortlistId, 'shortlistId');
  userId = checkId(userId, 'userId');
  buildingId = checkId(buildingId, 'buildingId');
  const col = await shortlists();
  const buildingObjectId = new ObjectId(buildingId);

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(shortlistId), userId: new ObjectId(userId) },
    {
      $addToSet: { items: { buildingId: buildingObjectId, privateNote: '' } },
      $set: { updatedAt: new Date() }
    },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw 'shortlist not found or not owned by user';
  return updated;
};

export const updateItemNote = async (shortlistId, userId, buildingId, privateNote) => {
  shortlistId = checkId(shortlistId, 'shortlistId');
  userId = checkId(userId, 'userId');
  buildingId = checkId(buildingId, 'buildingId');
  privateNote = xss(
    checkOptionalBoundedText(privateNote, 'privateNote', {
      maxLength: VALIDATION_LIMITS.privateNoteMaxLength
    })
  );
  const col = await shortlists();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(shortlistId), userId: new ObjectId(userId), 'items.buildingId': new ObjectId(buildingId) },
    { $set: { 'items.$.privateNote': privateNote, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw 'shortlist item not found';
  return updated;
};

export const removeItemFromShortlist = async (shortlistId, userId, buildingId) => {
  shortlistId = checkId(shortlistId, 'shortlistId');
  userId = checkId(userId, 'userId');
  buildingId = checkId(buildingId, 'buildingId');
  const col = await shortlists();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(shortlistId), userId: new ObjectId(userId) },
    { $pull: { items: { buildingId: new ObjectId(buildingId) } }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw 'shortlist not found or not owned by user';
  return updated;
};

export const deleteShortlist = async (shortlistId, userId) => {
  shortlistId = checkId(shortlistId, 'shortlistId');
  userId = checkId(userId, 'userId');
  const col = await shortlists();
  const result = await col.findOneAndDelete({ _id: new ObjectId(shortlistId), userId: new ObjectId(userId) });
  const deleted = result?.value ?? result;
  if (!deleted) throw 'shortlist not found or not owned by user';
  return { deleted: true };
};
