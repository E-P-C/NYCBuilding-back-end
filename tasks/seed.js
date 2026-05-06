import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { closeConnection } from "../config/mongoConnection.js";
import {
  users,
  buildings,
  reviews,
  shortlists,
} from "../config/mongoCollections.js";

import { createUser, toggleWatchlist } from "../data/users.js";
import { createBuilding } from "../data/buildings.js";
import { createReview } from "../data/reviews.js";
import {
  createShortlist,
  addItemToShortlist,
  updateItemNote,
} from "../data/shortlists.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seed = async () => {
  try {
    const reviewCollection = await reviews();
    const shortlistCollection = await shortlists();
    const buildingCollection = await buildings();
    const userCollection = await users();

    await reviewCollection.deleteMany({});
    await shortlistCollection.deleteMany({});
    await buildingCollection.deleteMany({});
    await userCollection.deleteMany({});

    console.log("Old data removed.");

    const admin = await createUser(
      "Admin",
      "User",
      "admin@leasewise.com",
      "admin",
      "Admin1234!",
      "admin",
    );
    const cindy = await createUser(
      "Cindy",
      "Xin",
      "cindy@example.com",
      "cindyx",
      "Password123!",
      "user",
    );
    const peter = await createUser(
      "Peter",
      "Liao",
      "peter@example.com",
      "peterl",
      "Password123!",
      "user",
    );
    const amy = await createUser(
      "Amy",
      "Chen",
      "amy@example.com",
      "amyc",
      "Password123!",
      "user",
    );
    const david = await createUser(
      "David",
      "Kim",
      "david@example.com",
      "davidk",
      "Password123!",
      "user",
    );
    const maria = await createUser(
      "Maria",
      "Garcia",
      "maria@example.com",
      "mariag",
      "Password123!",
      "user",
    );
    const jason = await createUser(
      "Jason",
      "Lee",
      "jason@example.com",
      "jasonl",
      "Password123!",
      "user",
    );

    console.log("Users seeded.");

    const buildingsPath = path.join(__dirname, "seed-data", "buildings.json");
    const buildingsData = JSON.parse(fs.readFileSync(buildingsPath, "utf8"));

    if (!Array.isArray(buildingsData) || buildingsData.length === 0) {
      throw new Error("buildings.json is missing or empty.");
    }

    const createdBuildings = [];

    for (const building of buildingsData) {
      const buildingForSeed = {
        ...building,
        buildingName:
          building.buildingName && building.buildingName.trim()
            ? building.buildingName
            : `${building.streetAddress} Building`,
        neighborhood:
          building.neighborhood && building.neighborhood.trim()
            ? building.neighborhood
            : "Queens",
        ownerName:
          building.ownerName && building.ownerName.trim()
            ? building.ownerName
            : "Unknown Owner",
        managerName:
          building.managerName && building.managerName.trim()
            ? building.managerName
            : "Unknown Management",
      };

      const created = await createBuilding(buildingForSeed, admin._id);
      createdBuildings.push(created);
    }

    console.log(`Buildings seeded: ${createdBuildings.length}`);

    if (createdBuildings.length < 10) {
      throw new Error(
        "Need at least 10 buildings in buildings.json for full-flow manual QA.",
      );
    }

    const [
      building1,
      building2,
      building3,
      building4,
      building5,
      building6,
      building7,
      building8,
      building9,
      building10,
    ] = createdBuildings;

    await createReview(
      building1._id,
      cindy._id,
      "The location is convenient, but the heat issues in winter were very frustrating.",
      3,
      ["heat", "maintenance"],
    );

    await createReview(
      building1._id,
      peter._id,
      "I liked the neighborhood, but the open violations would make me think twice.",
      2,
      ["violations", "repairs"],
    );

    await createReview(
      building2._id,
      amy._id,
      "Management responded fairly quickly, and the building felt safer than expected.",
      4,
      ["responsiveness"],
    );

    await createReview(
      building2._id,
      cindy._id,
      "Past bedbug history is a concern, but the recent records looked better.",
      3,
      ["bedbugs"],
    );

    await createReview(
      building3._id,
      peter._id,
      "The unit layout was nice, but I was concerned after seeing litigation history.",
      2,
      ["litigation"],
    );

    await createReview(
      building4._id,
      amy._id,
      "This was one of the cleaner options I checked, and the records looked relatively calm.",
      5,
      ["overall"],
    );

    await createReview(
      building5._id,
      david._id,
      "The building looked fine during the tour, but I want to compare its maintenance history before deciding.",
      4,
      ["maintenance", "overall"],
    );

    await createReview(
      building6._id,
      maria._id,
      "I liked the apartment, but pest-related records would be a major concern for me.",
      2,
      ["pests", "maintenance"],
    );

    await createReview(
      building7._id,
      jason._id,
      "Good location and transit access, but I would still check recent violations.",
      4,
      ["overall", "violations"],
    );

    await createReview(
      building8._id,
      cindy._id,
      "This option seems safer than some others I checked, but I want to monitor updates.",
      5,
      ["overall", "maintenance"],
    );

    await createReview(
      building9._id,
      peter._id,
      "The records seem mixed, so I would not sign before comparing it with other buildings.",
      3,
      ["violations", "overall"],
    );

    await createReview(
      building10._id,
      amy._id,
      "The management information is useful, but I would like to see more history before applying.",
      3,
      ["responsiveness", "maintenance"],
    );

    console.log("Reviews seeded.");

    const cindyShortlist = await createShortlist(
      cindy._id,
      "My Apartment Hunt",
    );
    await addItemToShortlist(cindyShortlist._id, cindy._id, building1._id);
    await addItemToShortlist(cindyShortlist._id, cindy._id, building2._id);
    await addItemToShortlist(cindyShortlist._id, cindy._id, building4._id);
    await updateItemNote(
      cindyShortlist._id,
      cindy._id,
      building1._id,
      "Great location, but I need to ask more about heat complaints.",
    );
    await updateItemNote(
      cindyShortlist._id,
      cindy._id,
      building2._id,
      "Worth comparing because management seems somewhat responsive.",
    );
    await updateItemNote(
      cindyShortlist._id,
      cindy._id,
      building4._id,
      "Looks like the safest option so far.",
    );

    const peterShortlist = await createShortlist(
      peter._id,
      "Buildings to Compare",
    );
    await addItemToShortlist(peterShortlist._id, peter._id, building2._id);
    await addItemToShortlist(peterShortlist._id, peter._id, building3._id);
    await updateItemNote(
      peterShortlist._id,
      peter._id,
      building2._id,
      "Need to verify if the bedbug issue is fully resolved.",
    );
    await updateItemNote(
      peterShortlist._id,
      peter._id,
      building3._id,
      "Check whether litigation is still active before considering.",
    );

    const amyShortlist = await createShortlist(amy._id, "Safer Queens Options");
    await addItemToShortlist(amyShortlist._id, amy._id, building4._id);
    await addItemToShortlist(amyShortlist._id, amy._id, building8._id);
    await addItemToShortlist(amyShortlist._id, amy._id, building10._id);
    await updateItemNote(
      amyShortlist._id,
      amy._id,
      building4._id,
      "Looks clean and has lower risk signals.",
    );
    await updateItemNote(
      amyShortlist._id,
      amy._id,
      building8._id,
      "Good candidate for comparison because the review is positive.",
    );
    await updateItemNote(
      amyShortlist._id,
      amy._id,
      building10._id,
      "Need to check management history before deciding.",
    );

    const davidShortlist = await createShortlist(
      david._id,
      "Tour Follow-up List",
    );
    await addItemToShortlist(davidShortlist._id, david._id, building5._id);
    await addItemToShortlist(davidShortlist._id, david._id, building6._id);
    await addItemToShortlist(davidShortlist._id, david._id, building9._id);
    await updateItemNote(
      davidShortlist._id,
      david._id,
      building5._id,
      "Follow up after apartment tour.",
    );
    await updateItemNote(
      davidShortlist._id,
      david._id,
      building6._id,
      "Possible pest concern. Compare carefully.",
    );
    await updateItemNote(
      davidShortlist._id,
      david._id,
      building9._id,
      "Mixed risk profile, keep as backup option.",
    );

    console.log("Shortlists seeded.");

    await toggleWatchlist(cindy._id, building1._id);
    await toggleWatchlist(cindy._id, building4._id);
    await toggleWatchlist(cindy._id, building8._id);

    await toggleWatchlist(peter._id, building2._id);
    await toggleWatchlist(peter._id, building9._id);

    await toggleWatchlist(amy._id, building3._id);
    await toggleWatchlist(amy._id, building4._id);
    await toggleWatchlist(amy._id, building10._id);

    await toggleWatchlist(david._id, building5._id);
    await toggleWatchlist(david._id, building6._id);

    await toggleWatchlist(maria._id, building6._id);
    await toggleWatchlist(maria._id, building7._id);

    await toggleWatchlist(jason._id, building7._id);
    await toggleWatchlist(jason._id, building9._id);

    console.log("Watchlists seeded.");
    console.log("Seed complete.");
  } catch (e) {
    console.error("Seed failed:", e);
  } finally {
    await closeConnection();
  }
};

seed();
