import {
  users,
  buildings,
  reviews,
  shortlists,
} from "../config/mongoCollections.js";
import { closeConnection } from "../config/mongoConnection.js";

const createIndexes = async () => {
  const userCollection = await users();
  const buildingCollection = await buildings();
  const reviewCollection = await reviews();
  const shortlistCollection = await shortlists();

  console.log("Creating MongoDB indexes...");

  await userCollection.createIndex(
    { emailNormalized: 1 },
    { unique: true, name: "unique_email_normalized" },
  );

  await userCollection.createIndex(
    { usernameNormalized: 1 },
    { unique: true, name: "unique_username_normalized" },
  );

  await buildingCollection.createIndex(
    {
      streetAddress: "text",
      buildingName: "text",
      borough: "text",
      ownerName: "text",
    },
    { name: "building_text_search_index" },
  );

  await buildingCollection.createIndex(
    { borough: 1 },
    { name: "building_borough_index" },
  );

  await buildingCollection.createIndex(
    { ownerName: 1 },
    { name: "building_owner_name_index" },
  );

  await reviewCollection.createIndex(
    { buildingId: 1, status: 1, createdAt: -1 },
    { name: "review_building_status_created_index" },
  );

  await reviewCollection.createIndex(
    { buildingId: 1, userId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: "published" },
      name: "unique_published_review_per_user_building",
    },
  );

  await shortlistCollection.createIndex(
    { userId: 1 },
    { name: "shortlist_user_id_index" },
  );

  console.log("Indexes created successfully.");
};

try {
  await createIndexes();
} catch (e) {
  console.error("Failed to create indexes:", e);
  process.exitCode = 1;
} finally {
  await closeConnection();
}
