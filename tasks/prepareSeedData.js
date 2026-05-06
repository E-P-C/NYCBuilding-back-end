import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input and output paths
const outputDir = path.join(__dirname, "seed-data");
const outputPath = path.join(outputDir, "buildings.json");
const complaintsInputPath = path.join(__dirname, "raw-data", "complaints.csv");
const inputPath = path.join(
  __dirname,
  "raw-data",
  "Buildings_Subject_to_HPD_Jurisdiction_20260505.csv",
);
const bedbugInputPath = path.join(
  __dirname,
  "raw-data",
  "Bedbug_Reporting_20260505.csv",
);
const violationsInputPath = path.join(
  __dirname,
  "raw-data",
  "Housing_Maintenance_Code_Violations_20260505.csv",
);
const MAX_BUILDINGS = 100;
const normalizeBorough = (boro) => {
  if (!boro) return "";
  const value = boro.toString().trim().toUpperCase();

  const map = {
    MANHATTAN: "Manhattan",
    BROOKLYN: "Brooklyn",
    QUEENS: "Queens",
    BRONX: "Bronx",
    "STATEN ISLAND": "Staten Island",
  };

  return map[value] || boro.toString().trim();
};

const safeString = (value) => {
  if (value === null || value === undefined) return "";
  return value.toString().trim();
};

const buildStreetAddress = (houseNumber, streetName) => {
  return `${safeString(houseNumber)} ${safeString(streetName)}`.trim();
};

const buildBBL = (block, lot) => {
  const cleanBlock = safeString(block);
  const cleanLot = safeString(lot);

  if (!cleanBlock || !cleanLot) return "";
  return `${cleanBlock}-${cleanLot}`;
};

const isUsableRow = (row) => {
  const recordStatus = safeString(row.RecordStatus || row.recordstatus);
  const houseNumber = safeString(row.HouseNumber || row.housenumber);
  const streetName = safeString(row.StreetName || row.streetname);
  const zip = safeString(row.Zip || row.zip);
  const bin = safeString(row.BIN || row.bin);
  const boro = safeString(row.Boro || row.boro);

  if (recordStatus.toUpperCase() !== "ACTIVE") return false;
  if (!houseNumber) return false;
  if (!streetName) return false;
  if (!zip) return false;
  if (!bin) return false;
  if (!boro) return false;

  return true;
};

const transformRowToBuilding = (row) => {
  const houseNumber = safeString(row.HouseNumber || row.housenumber);
  const streetName = safeString(row.StreetName || row.streetname);
  const borough = normalizeBorough(row.Boro || row.boro);
  const zipCode = safeString(row.Zip || row.zip);
  const bin = safeString(row.BIN || row.bin);
  const block = safeString(row.Block || row.block);
  const lot = safeString(row.Lot || row.lot);
  const registrationId = safeString(row.RegistrationID || row.registrationid);
  const recordStatus = safeString(row.RecordStatus || row.recordstatus);

  return {
    buildingName: "",
    streetAddress: buildStreetAddress(houseNumber, streetName),
    borough,
    neighborhood: "",
    zipCode,
    bin,
    bbl: buildBBL(block, lot),
    ownerName: "",
    managerName: "",
    riskSummary: {
      highlights: [],
      lastCalculatedAt: new Date().toISOString(),
    },
    housingRecords: [
      {
        sourceDataset: "Buildings Subject to HPD Jurisdiction",
        recordType: "registration",
        category: `HPD jurisdiction${registrationId ? ` / registration ${registrationId}` : ""}`,
        status: recordStatus.toLowerCase(),
        recordDate: new Date().toISOString(),
      },
    ],
  };
};

const dedupeBuildings = (buildings) => {
  const seen = new Set();
  const result = [];

  for (const building of buildings) {
    const key = `${building.bin}|${building.streetAddress}|${building.zipCode}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(building);
    }
  }

  return result;
};

const getComplaintBin = (row) =>
  safeString(row.BIN || row.bin || row.BuildingID || row["Building ID"]);

const getComplaintBBL = (row) =>
  safeString(row.BBL || row.bbl || row.BoroBlockLot || row["Boro Block Lot"]);

const getComplaintDate = (row) =>
  safeString(
    row.ReceivedDate || row["Received Date"] || row.receiveddate || row.Date,
  );

const transformComplaintToHousingRecord = (row) => {
  const category = safeString(
    row.MajorCategory ||
      row["Major Category"] ||
      row.major_category ||
      row.ComplaintCategory ||
      row["Complaint Category"] ||
      row.Type ||
      row.type,
  );

  const status = safeString(
    row.ComplaintStatus ||
      row["Complaint Status"] ||
      row.complaint_status ||
      row.Status ||
      row.status,
  );

  const recordDateRaw = getComplaintDate(row);
  const recordDate = recordDateRaw
    ? new Date(recordDateRaw).toISOString()
    : new Date().toISOString();

  return {
    sourceDataset: "Housing Maintenance Code Complaints and Problems",
    recordType: "complaint",
    category: category || "housing complaint",
    status: status.toLowerCase() || "unknown",
    recordDate,
  };
};
const getBedbugBin = (row) => safeString(row.BIN || row.bin);

const getBedbugBBL = (row) => safeString(row.BBL || row.bbl);

const getBedbugDate = (row) =>
  safeString(row["Filing Date"] || row.FilingDate || row.filing_date);

const transformBedbugToHousingRecord = (row) => {
  const infestedCount = Number(
    safeString(
      row["Infested Dwelling Unit Count"] || row.infested_dwelling_unit_count,
    ) || 0,
  );

  const eradicatedCount = Number(
    safeString(row["Eradicated Unit Count"] || row.eradicated_unit_count) || 0,
  );

  const reinfestedCount = Number(
    safeString(
      row["Re-infested  Dwelling Unit Count"] ||
        row["Re-infested Dwelling Unit Count"] ||
        row.re_infested_dwelling_unit_count,
    ) || 0,
  );

  const recordDateRaw = getBedbugDate(row);
  const recordDate = recordDateRaw
    ? new Date(recordDateRaw).toISOString()
    : new Date().toISOString();

  return {
    sourceDataset: "Bedbug Reporting",
    recordType: "bedbug report",
    category: `infested units: ${infestedCount}, eradicated: ${eradicatedCount}, re-infested: ${reinfestedCount}`,
    status:
      infestedCount > 0 || reinfestedCount > 0
        ? "reported"
        : "no infestation reported",
    recordDate,
  };
};

const getViolationBin = (row) =>
  safeString(row.BIN || row.bin || row.BuildingID || row.buildingid);

const getViolationBBL = (row) => safeString(row.BBL || row.bbl);

const getViolationDate = (row) =>
  safeString(
    row.InspectionDate ||
      row.inspectiondate ||
      row["Inspection Date"] ||
      row.NOVIssuedDate ||
      row.novissueddate,
  );

const transformViolationToHousingRecord = (row) => {
  const violationClass = safeString(row.Class || row.class);
  const status = safeString(
    row.CurrentStatus ||
      row.currentstatus ||
      row.ViolationStatus ||
      row.violationstatus,
  );

  const description = safeString(
    row.NOVDescription || row.novdescription || row.NovType || row.novtype,
  );

  const recordDateRaw = getViolationDate(row);
  const recordDate = recordDateRaw
    ? new Date(recordDateRaw).toISOString()
    : new Date().toISOString();

  return {
    sourceDataset: "Housing Maintenance Code Violations",
    recordType: "violation",
    category: violationClass
      ? `Class ${violationClass} violation`
      : "housing violation",
    status: status.toLowerCase() || "unknown",
    recordDate,
    description: description.slice(0, 300),
  };
};
const main = async () => {
  try {
    const csvText = fs.readFileSync(inputPath, "utf8");

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    });

    const usableRows = records.filter(isUsableRow);
    const transformed = usableRows.map(transformRowToBuilding);
    const deduped = dedupeBuildings(transformed).slice(0, MAX_BUILDINGS);
    let finalBuildings = deduped;

    if (fs.existsSync(complaintsInputPath)) {
      const complaintsText = fs.readFileSync(complaintsInputPath, "utf8");

      const complaintRecords = parse(complaintsText, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
      });

      const buildingsByBin = new Map();
      const buildingsByBBL = new Map();

      for (const building of finalBuildings) {
        if (building.bin) buildingsByBin.set(building.bin, building);
        if (building.bbl) buildingsByBBL.set(building.bbl, building);
      }

      let matchedComplaints = 0;

      for (const complaint of complaintRecords) {
        const bin = getComplaintBin(complaint);
        const bbl = getComplaintBBL(complaint);

        const building = buildingsByBin.get(bin) || buildingsByBBL.get(bbl);

        if (!building) continue;

        building.housingRecords.push(
          transformComplaintToHousingRecord(complaint),
        );
        matchedComplaints += 1;
      }

      for (const building of finalBuildings) {
        const complaintRecords = building.housingRecords.filter(
          (record) => record.recordType === "complaint",
        );

        const heatComplaints = complaintRecords.filter((record) =>
          record.category.toLowerCase().includes("heat"),
        );

        if (complaintRecords.length >= 3) {
          building.riskSummary.highlights.push(
            "Multiple housing complaints found",
          );
        }

        if (heatComplaints.length > 0) {
          building.riskSummary.highlights.push(
            "Heat or hot water complaint history found",
          );
        }

        building.riskSummary.highlights = [
          ...new Set(building.riskSummary.highlights),
        ];
      }

      console.log(`Read ${complaintRecords.length} complaint rows.`);
      console.log(
        `Matched ${matchedComplaints} complaints to seeded buildings.`,
      );
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (fs.existsSync(bedbugInputPath)) {
      const bedbugText = fs.readFileSync(bedbugInputPath, "utf8");

      const bedbugRecords = parse(bedbugText, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
      });

      const buildingsByBin = new Map();
      const buildingsByBBL = new Map();

      for (const building of finalBuildings) {
        if (building.bin) buildingsByBin.set(building.bin, building);
        if (building.bbl) buildingsByBBL.set(building.bbl, building);
      }

      let matchedBedbugReports = 0;

      for (const bedbug of bedbugRecords) {
        const bin = getBedbugBin(bedbug);
        const bbl = getBedbugBBL(bedbug);

        const building = buildingsByBin.get(bin) || buildingsByBBL.get(bbl);

        if (!building) continue;

        building.housingRecords.push(transformBedbugToHousingRecord(bedbug));
        matchedBedbugReports += 1;
      }

      for (const building of finalBuildings) {
        const bedbugReports = building.housingRecords.filter(
          (record) => record.recordType === "bedbug report",
        );

        const positiveBedbugReports = bedbugReports.filter(
          (record) => record.status === "reported",
        );

        if (positiveBedbugReports.length > 0) {
          building.riskSummary.highlights.push("Bedbug history found");
        }

        building.riskSummary.highlights = [
          ...new Set(building.riskSummary.highlights),
        ];
      }

      console.log(`Read ${bedbugRecords.length} bedbug rows.`);
      console.log(
        `Matched ${matchedBedbugReports} bedbug reports to seeded buildings.`,
      );
    }
    if (fs.existsSync(violationsInputPath)) {
      const violationsText = fs.readFileSync(violationsInputPath, "utf8");

      const violationRecords = parse(violationsText, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
      });

      const buildingsByBin = new Map();
      const buildingsByBBL = new Map();

      for (const building of finalBuildings) {
        if (building.bin) buildingsByBin.set(building.bin, building);
        if (building.bbl) buildingsByBBL.set(building.bbl, building);
      }

      let matchedViolations = 0;

      for (const violation of violationRecords) {
        const bin = getViolationBin(violation);
        const bbl = getViolationBBL(violation);

        const building = buildingsByBin.get(bin) || buildingsByBBL.get(bbl);

        if (!building) continue;

        building.housingRecords.push(
          transformViolationToHousingRecord(violation),
        );
        matchedViolations += 1;
      }

      for (const building of finalBuildings) {
        const violationReports = building.housingRecords.filter(
          (record) => record.recordType === "violation",
        );

        const classCViolations = violationReports.filter((record) =>
          record.category.toLowerCase().includes("class c"),
        );

        const openViolations = violationReports.filter((record) =>
          record.status.includes("open"),
        );

        if (violationReports.length >= 3) {
          building.riskSummary.highlights.push(
            "Multiple housing violations found",
          );
        }

        if (classCViolations.length > 0) {
          building.riskSummary.highlights.push(
            "Class C violation history found",
          );
        }

        if (openViolations.length > 0) {
          building.riskSummary.highlights.push("Open housing violations found");
        }

        building.riskSummary.highlights = [
          ...new Set(building.riskSummary.highlights),
        ];
      }

      console.log(`Read ${violationRecords.length} violation rows.`);
      console.log(
        `Matched ${matchedViolations} violations to seeded buildings.`,
      );
    }
    fs.writeFileSync(
      outputPath,
      JSON.stringify(finalBuildings, null, 2),
      "utf8",
    );

    console.log(`Read ${records.length} rows from CSV.`);
    console.log(`Kept ${usableRows.length} usable rows.`);
    console.log(`Wrote ${finalBuildings.length} buildings to ${outputPath}.`);
  } catch (error) {
    console.error("Failed to prepare seed data:", error);
    process.exit(1);
  }
};

main();
