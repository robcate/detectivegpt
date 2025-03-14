import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_ACCESS_TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const TABLE_NAME = "reports";

/**
 * Helper: get existing record from Airtable so we can read existing fields
 */
async function getExistingRecord(airtableRecordId: string) {
  try {
    const resp = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${airtableRecordId}`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_ACCESS_TOKEN}`,
        },
      }
    );
    // Returns { id, fields, createdTime }
    return resp.data;
  } catch (err) {
    console.error("🟥 [route.ts] getExistingRecord error:", err);
    return null;
  }
}

/**
 * Merge logic for arrays: combines old array + new array, removing duplicates if you like.
 */
function mergeArrays(oldArr: string[] = [], newArr: string[] = []): string[] {
  // In simplest form, just concat:
  const combined = [...oldArr, ...newArr];
  // Optional: remove duplicates
  const unique = Array.from(new Set(combined));
  return unique;
}

/**
 * Flatten the crime report data, merging with existing fields so we never lose data.
 */
function flattenCrimeReport(existingFields: any, newData: any) {
  console.log("🔹 [flattenCrimeReport] Merging old + new data...");

  // We'll build a new `fields` object that merges existing with new
  const fields: any = {};

  // -------------------------------------------
  // For text fields, keep old if new is "N/A" or empty
  // or append if you want to keep everything
  // -------------------------------------------
  function mergeText(oldVal: string | undefined, newVal: string | undefined) {
    if (!oldVal || oldVal === "N/A") oldVal = "";
    if (!newVal || newVal === "N/A") newVal = "";
    // Example strategy: append if both exist
    if (oldVal && newVal && oldVal !== newVal) {
      return oldVal.includes(newVal) ? oldVal : (oldVal + "\n" + newVal).trim();
    }
    // if new is non-empty, use it, else use old
    return newVal || oldVal || "N/A";
  }

  // Helper for arrays
  function mergeStringArray(
    oldVal: string | undefined,
    newVal: string | undefined
  ) {
    // oldVal might be "Red truck, Blue Honda" => turn it into an array
    let oldArr = (oldVal && oldVal !== "N/A") ? oldVal.split(",").map((s) => s.trim()) : [];
    let newArr = (newVal && newVal !== "N/A") ? newVal.split(",").map((s) => s.trim()) : [];
    // merge them
    let merged = mergeArrays(oldArr, newArr);
    if (merged.length === 0) return "N/A";
    return merged.join(", ");
  }

  // existingFields might be undefined if the record didn't exist
  const oldFields = existingFields || {};

  // 1) Incident Description
  fields["Incident Description"] = mergeText(
    oldFields["Incident Description"],
    newData.incidentDescription
  );

  // 2) Crime Type
  fields["Crime Type"] = mergeText(
    oldFields["Crime Type"],
    newData.crime_type
  );

  // 3) Datetime
  fields["Datetime"] = mergeText(
    oldFields["Datetime"],
    newData.datetime
  );

  // 4) Location
  fields["Location"] = mergeText(
    oldFields["Location"],
    newData.location
  );

  // 5) Coordinates (here we only store the *latest* lat/lng if provided)
  const oldLat = oldFields["Latitude"] ?? 0;
  const oldLng = oldFields["Longitude"] ?? 0;
  const newLat = newData.coordinates?.lat;
  const newLng = newData.coordinates?.lng;
  fields["Latitude"] = newLat !== undefined ? newLat : oldLat;
  fields["Longitude"] = newLng !== undefined ? newLng : oldLng;

  // 6) Merge suspect details
  // We'll keep old unless new is not N/A
  function keepOrReplace(oldVal: string, newVal: string) {
    if (!newVal || newVal === "N/A") return oldVal || "N/A";
    return newVal;
  }

  fields["Suspect Gender"]   = keepOrReplace(oldFields["Suspect Gender"],   newData.suspect?.gender);
  fields["Suspect Age"]      = keepOrReplace(oldFields["Suspect Age"],      newData.suspect?.age);
  fields["Suspect Hair"]     = keepOrReplace(oldFields["Suspect Hair"],     newData.suspect?.hair);
  fields["Suspect Clothing"] = keepOrReplace(oldFields["Suspect Clothing"], newData.suspect?.clothing);
  fields["Suspect Features"] = keepOrReplace(oldFields["Suspect Features"], newData.suspect?.features);
  fields["Suspect Height"]   = keepOrReplace(oldFields["Suspect Height"],   newData.suspect?.height);
  fields["Suspect Weight"]   = keepOrReplace(oldFields["Suspect Weight"],   newData.suspect?.weight);
  fields["Suspect Tattoos"]  = keepOrReplace(oldFields["Suspect Tattoos"],  newData.suspect?.tattoos);
  fields["Suspect Scars"]    = keepOrReplace(oldFields["Suspect Scars"],    newData.suspect?.scars);
  fields["Suspect Accent"]   = keepOrReplace(oldFields["Suspect Accent"],   newData.suspect?.accent);

  // 7) Vehicles & Cameras => we treat as comma-separated arrays
  fields["Vehicles"] = mergeStringArray(
    oldFields["Vehicles"],
    (newData.vehicles && newData.vehicles.length > 0)
      ? newData.vehicles.join(", ")
      : "N/A"
  );
  fields["Cameras"] = mergeStringArray(
    oldFields["Cameras"],
    (newData.cameras && newData.cameras.length > 0)
      ? newData.cameras.join(", ")
      : "N/A"
  );

  // 8) Injuries & Property Damage => keep new if not empty
  fields["Injuries"] = keepOrReplace(oldFields["Injuries"], newData.injuries);
  fields["Property Damage"] = keepOrReplace(oldFields["Property Damage"], newData.propertyDamage);

  // 9) Witnesses => we might want to *append* new witnesses
  // old might be "John (555-5555)", new might be "Jane (222-3333)"
  // Let's parse old into an array, parse new into an array, merge, then join
  function parseWitnesses(str: string): Array<{name:string, contact?:string}> {
    // Typically you don't have a perfect parse— but let's approximate:
    // e.g. "John (555-5555); Jane (abc@xyz.com)"
    if (!str || str === "N/A") return [];
    return str.split(";").map(s => {
      s = s.trim();
      const match = s.match(/\((.*)\)/);
      if (match) {
        // everything before "(" is the name, inside parentheses is contact
        const contact = match[1];
        const name = s.replace(`(${contact})`, "").trim();
        return { name, contact };
      } else {
        return { name: s };
      }
    });
  }

  let oldWits = parseWitnesses(oldFields["Witnesses"]);
  let newWits = newData.witnesses || [];
  // Merge them by name+contact
  // We can do a quick approach: oldWits + newWits => unique
  let combinedWits = [...oldWits];
  for (const nw of newWits) {
    const already = combinedWits.find(ow => ow.name === nw.name && ow.contact === nw.contact);
    if (!already) {
      combinedWits.push(nw);
    }
  }
  if (combinedWits.length === 0) {
    fields["Witnesses"] = "N/A";
  } else {
    // turn them back into "Name (contact); Name (contact)"
    fields["Witnesses"] = combinedWits.map(w => w.contact ? `${w.name} (${w.contact})` : w.name).join("; ");
  }

  // 10) Weapon
  fields["Weapon"] = keepOrReplace(oldFields["Weapon"], newData.weapon);

  // 11) Evidence as attachments => We definitely want to append
  // old might be an array of { url, filename, ... }, new might be a string or array
  const oldEvidence = Array.isArray(oldFields["Evidence"]) ? oldFields["Evidence"] : [];
  let newEvidenceArr = [];
  if (newData.evidence) {
    // newData.evidence might be "https://..., https://..."
    // or a single string
    const splitted = newData.evidence.split(",").map((s: string) => s.trim());
    newEvidenceArr = splitted.map((url: string) => ({ url }));
  }
  const mergedEvidence = [...oldEvidence, ...newEvidenceArr];
  fields["Evidence"] = mergedEvidence;

  // 12) Conversation Log => optionally append or keep new only
  // If you want to keep the entire conversation in a single field over time, do:
  const oldLog = oldFields["Conversation Log"] || "";
  const newLog = newData.conversationLog || "";
  const appendedLog = [oldLog, newLog].filter(Boolean).join("\n").trim() || "N/A";
  fields["Conversation Log"] = appendedLog;

  console.log("🟨 [flattenCrimeReport] => final fields =>", fields);
  return fields;
}

/**
 * POST /api/airtable
 * Creates or updates a record, merging new + old data so you never lose info.
 */
export async function POST(request: NextRequest) {
  try {
    const crimeReport = await request.json();
    console.log("🔹 [route.ts] Received crimeReport:", crimeReport);

    let existingFields = null;
    // If there's an existing record ID, fetch the record first
    if (crimeReport.airtableRecordId) {
      console.log("🔹 [route.ts] fetching existing record =>", crimeReport.airtableRecordId);
      const existing = await getExistingRecord(crimeReport.airtableRecordId);
      existingFields = existing?.fields || null;
    }

    // Flatten (merge old + new)
    const fields = flattenCrimeReport(existingFields, crimeReport);

    let response;
    if (crimeReport.airtableRecordId) {
      // PATCH
      console.log("🔹 [route.ts] Updating existing record:", crimeReport.airtableRecordId);
      response = await axios.patch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${crimeReport.airtableRecordId}`,
        { fields },
        {
          headers: {
            Authorization: `Bearer ${AIRTABLE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ [route.ts] Record updated via PATCH:", response.data);

      const recordId = response.data.id;
      const caseNumber = response.data.fields?.["Case Number"] || "N/A";
      return NextResponse.json({ success: true, recordId, caseNumber });
    } else {
      // Create new
      console.log("🔹 [route.ts] Creating a new record in Airtable...");
      response = await axios.post(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`,
        { records: [{ fields }] },
        {
          headers: {
            Authorization: `Bearer ${AIRTABLE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ [route.ts] New record created:", response.data);

      const created = response.data.records[0];
      const recordId = created.id;
      const caseNumber = created.fields?.["Case Number"] || "N/A";
      return NextResponse.json({ success: true, recordId, caseNumber });
    }
  } catch (error: any) {
    console.error("❌ [route.ts] Error creating/updating:", error.message);
    if (error.response) {
      console.error("❌ Airtable error details:", JSON.stringify(error.response.data, null, 2));
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}