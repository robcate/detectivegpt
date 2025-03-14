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

    // Flatten (merge old + new) using our safe approach
    const fields = flattenCrimeReport(existingFields, crimeReport);

    let response;
    if (crimeReport.airtableRecordId) {
      // PATCH existing record
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
      console.log("🔹 [route.ts] Returning recordId:", recordId, "caseNumber:", caseNumber);

      return NextResponse.json({
        success: true,
        recordId,
        caseNumber,
      });
    } else {
      // Create new record
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

      const createdRecord = response.data.records[0];
      const recordId = createdRecord.id;
      const caseNumber = createdRecord.fields?.["Case Number"] || "N/A";
      console.log("🔹 [route.ts] Returning recordId:", recordId, "caseNumber:", caseNumber);

      return NextResponse.json({
        success: true,
        recordId,
        caseNumber,
      });
    }
  } catch (error: any) {
    console.error("❌ [route.ts] Error creating/updating:", error.message);
    if (error.response) {
      console.error("❌ Airtable error details:", JSON.stringify(error.response.data, null, 2));
    }
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Safely "flatten" (merge) the new crimeReport data into existing Airtable fields
 * without overwriting fields with "N/A" if new data is missing.
 */
function flattenCrimeReport(existingFields: any, newData: any) {
  console.log("🔹 [flattenCrimeReport] Merging old + new data...");

  // We'll read old fields, or empty object if record didn't exist
  const oldFields = existingFields || {};
  const fields: any = {};

  // --------------------------------------------
  // Helper #1: Safe merge for TEXT fields
  // Only overwrite if newVal is not undefined.
  // If newVal is "", or "N/A", that means user wants to clear => store "N/A".
  // Otherwise, optionally "append" or "replace."
  // (Below we show an example of "append if different.")
  // --------------------------------------------
  function safeMergeText(
    oldVal: string | undefined,
    newVal: string | undefined
  ): string {
    // If no new value => keep old
    if (newVal === undefined) {
      return oldVal ?? "N/A";
    }
    // If newVal is empty or "N/A", we interpret as clearing
    if (!newVal || newVal.toUpperCase() === "N/A") {
      return "N/A";
    }
    // If oldVal was missing or "N/A", just store new
    if (!oldVal || oldVal === "N/A") {
      return newVal;
    }
    // If oldVal includes newVal, skip duplication
    if (oldVal.includes(newVal)) {
      return oldVal;
    }
    // Otherwise, append them with newline
    return (oldVal + "\n" + newVal).trim();
  }

  // --------------------------------------------
  // Helper #2: Safe merge for ARRAYS (like vehicles, cameras)
  // If newVal is undefined => keep old.
  // If newVal is a real array => combine them, remove duplicates.
  // --------------------------------------------
  function safeMergeArrayStrings(
    oldVal: string | undefined,
    newVal: string[] | undefined
  ): string {
    // If newVal is undefined => no change
    if (newVal === undefined) {
      return oldVal ?? "N/A";
    }
    // Convert oldVal (like "Red truck, Blue Honda") -> array
    let oldArr =
      !oldVal || oldVal === "N/A" ? [] : oldVal.split(",").map((s) => s.trim());
    // Merge & remove duplicates
    const combined = Array.from(new Set([...oldArr, ...newVal]));
    if (combined.length === 0) {
      return "N/A";
    }
    return combined.join(", ");
  }

  // --------------------------------------------
  // Helper #3: Safe merge for WITNESSES
  // Old is "John (555-5555); Jane (222-3333)"
  // We'll parse both, combine, remove duplicates
  // --------------------------------------------
  function parseWitnesses(str: string): Array<{ name: string; contact?: string }> {
    if (!str || str === "N/A") return [];
    return str.split(";").map((segment) => {
      const s = segment.trim();
      const match = s.match(/\((.*)\)/);
      if (match) {
        // everything before "(" is name, inside parentheses is contact
        const contact = match[1];
        const name = s.replace(`(${contact})`, "").trim();
        return { name, contact };
      } else {
        return { name: s };
      }
    });
  }

  function safeMergeWitnesses(
    oldVal: string | undefined,
    newVal: any[] | undefined
  ): string {
    // If newVal is undefined => skip
    if (newVal === undefined) {
      return oldVal ?? "N/A";
    }
    let oldWits = parseWitnesses(oldVal || "");
    for (const w of newVal) {
      const already = oldWits.find(
        (ow) => ow.name === w.name && ow.contact === w.contact
      );
      if (!already) {
        oldWits.push(w);
      }
    }
    if (oldWits.length === 0) {
      return "N/A";
    }
    return oldWits
      .map((wit) =>
        wit.contact ? `${wit.name} (${wit.contact})` : wit.name
      )
      .join("; ");
  }

  // --------------------------------------------
  // Helper #4: Safe merge for EVIDENCE attachments
  // We always append any new attachments that appear in newData.evidence
  // If newData.evidence is undefined => no change
  // --------------------------------------------
  function safeMergeEvidence(
    oldEvidence: any,
    newEvidence: string | undefined
  ) {
    // Old might be an array of { url, filename, ... } or undefined
    if (!Array.isArray(oldEvidence)) {
      oldEvidence = [];
    }
    if (newEvidence === undefined) {
      return oldEvidence;
    }
    // newEvidence might be "url1, url2"
    const splitted = newEvidence.split(",").map((s) => s.trim()).filter(Boolean);
    const newAttachments = splitted.map((url) => ({ url }));
    return [...oldEvidence, ...newAttachments];
  }

  // --------------------------------------------
  // TEXT FIELDS
  // --------------------------------------------
  fields["Incident Description"] = safeMergeText(
    oldFields["Incident Description"],
    newData.incidentDescription
  );
  fields["Crime Type"] = safeMergeText(
    oldFields["Crime Type"],
    newData.crime_type
  );
  fields["Datetime"] = safeMergeText(
    oldFields["Datetime"],
    newData.datetime
  );
  fields["Location"] = safeMergeText(
    oldFields["Location"],
    newData.location
  );
  fields["Injuries"] = safeMergeText(
    oldFields["Injuries"],
    newData.injuries
  );
  fields["Property Damage"] = safeMergeText(
    oldFields["Property Damage"],
    newData.propertyDamage
  );
  fields["Weapon"] = safeMergeText(
    oldFields["Weapon"],
    newData.weapon
  );

  // (NEW) WEATHER
  fields["Weather"] = safeMergeText(
    oldFields["Weather"],
    newData.weather
  );

  // --------------------------------------------
  // ARRAYS => vehicles, cameras
  // --------------------------------------------
  fields["Vehicles"] = safeMergeArrayStrings(
    oldFields["Vehicles"],
    newData.vehicles
  );
  fields["Cameras"] = safeMergeArrayStrings(
    oldFields["Cameras"],
    newData.cameras
  );

  // --------------------------------------------
  // SUSPECT subfields (gender, age, etc.)
  // We skip overwriting if newData.suspect?.xyz is undefined
  // --------------------------------------------
  fields["Suspect Gender"] = safeMergeText(
    oldFields["Suspect Gender"],
    newData.suspect?.gender
  );
  fields["Suspect Age"] = safeMergeText(
    oldFields["Suspect Age"],
    newData.suspect?.age
  );
  fields["Suspect Hair"] = safeMergeText(
    oldFields["Suspect Hair"],
    newData.suspect?.hair
  );
  fields["Suspect Clothing"] = safeMergeText(
    oldFields["Suspect Clothing"],
    newData.suspect?.clothing
  );
  fields["Suspect Features"] = safeMergeText(
    oldFields["Suspect Features"],
    newData.suspect?.features
  );
  fields["Suspect Height"] = safeMergeText(
    oldFields["Suspect Height"],
    newData.suspect?.height
  );
  fields["Suspect Weight"] = safeMergeText(
    oldFields["Suspect Weight"],
    newData.suspect?.weight
  );
  fields["Suspect Tattoos"] = safeMergeText(
    oldFields["Suspect Tattoos"],
    newData.suspect?.tattoos
  );
  fields["Suspect Scars"] = safeMergeText(
    oldFields["Suspect Scars"],
    newData.suspect?.scars
  );
  fields["Suspect Accent"] = safeMergeText(
    oldFields["Suspect Accent"],
    newData.suspect?.accent
  );

  // --------------------------------------------
  // WITNESSES => parse old, merge new
  // --------------------------------------------
  fields["Witnesses"] = safeMergeWitnesses(
    oldFields["Witnesses"],
    newData.witnesses
  );

  // --------------------------------------------
  // EVIDENCE => always append new attachments
  // --------------------------------------------
  fields["Evidence"] = safeMergeEvidence(
    oldFields["Evidence"],
    newData.evidence
  );

  // If you want to store "Image Observations" as text, do a safe merge:
  fields["Image Observations"] = safeMergeText(
    oldFields["Image Observations"],
    newData.evidenceObservations
  );

  // --------------------------------------------
  // COORDINATES => only overwrite if newData.coordinates is not undefined
  // --------------------------------------------
  const oldLat = oldFields["Latitude"];
  const oldLng = oldFields["Longitude"];
  if (newData.coordinates !== undefined) {
    fields["Latitude"] =
      newData.coordinates.lat !== undefined ? newData.coordinates.lat : oldLat ?? 0;
    fields["Longitude"] =
      newData.coordinates.lng !== undefined ? newData.coordinates.lng : oldLng ?? 0;
  } else {
    // keep old
    fields["Latitude"] = oldLat ?? 0;
    fields["Longitude"] = oldLng ?? 0;
  }

  // --------------------------------------------
  // CONVERSATION LOG => safe merge text
  // --------------------------------------------
  fields["Conversation Log"] = safeMergeText(
    oldFields["Conversation Log"],
    newData.conversationLog
  );

  console.log("🟨 [flattenCrimeReport] => final fields =>", fields);
  return fields;
}
