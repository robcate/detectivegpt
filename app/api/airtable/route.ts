// app/api/airtable/route.ts
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_ACCESS_TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const TABLE_NAME = "reports";

// 🔹 Flatten function (adjust field names to match your Airtable columns)
function flattenCrimeReport(data: any) {
  console.log("🔹 [route.ts] Flattening crime report data for Airtable...");

  return {
    "Crime Type": data.crime_type || "N/A",
    "Datetime": data.datetime || "N/A",
    "Location": data.location || "N/A",
    "Latitude": data.coordinates?.lat ?? 0,
    "Longitude": data.coordinates?.lng ?? 0,
    "Suspect (Gender/Age/Hair/Clothing/Features)": data.suspect
      ? `Gender: ${data.suspect.gender || "N/A"}, Age: ${data.suspect.age || "N/A"}, Hair: ${data.suspect.hair || "N/A"}, Clothing: ${data.suspect.clothing || "N/A"}, Features: ${data.suspect.features || "N/A"}`
      : "N/A",
    "Vehicles":
      data.vehicles && data.vehicles.length > 0 ? data.vehicles.join(", ") : "N/A",
    "Cameras":
      data.cameras && data.cameras.length > 0 ? data.cameras.join(", ") : "N/A",
    "Injuries": data.injuries || "N/A",
    "Property Damage": data.propertyDamage || "N/A",
    "Witnesses":
      data.witnesses && data.witnesses.length > 0
        ? data.witnesses
            .map((w: any) => (w.contact ? `${w.name} (${w.contact})` : w.name))
            .join("; ")
        : "N/A",
    "Weapon": data.weapon || "N/A",
    "Evidence": data.evidence || "N/A",
  };
}

export async function POST(request: NextRequest) {
  try {
    const crimeReport = await request.json();
    console.log("🔹 [route.ts] Received crimeReport:", crimeReport);

    // Flatten data for Airtable
    const fields = flattenCrimeReport(crimeReport);

    // Decide if we're creating or updating
    let response;
    if (crimeReport.airtableRecordId) {
      // We have an existing record ID => PATCH
      console.log(
        "🔹 [route.ts] Updating existing record:",
        crimeReport.airtableRecordId
      );
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
    } else {
      // No record ID => create a new record via POST
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
    }

    // Extract recordId & caseNumber
    let recordId: string | undefined;
    let caseNumber: string | undefined;

    if (crimeReport.airtableRecordId) {
      // PATCH response => single record
      recordId = response.data.id;
      caseNumber = response.data.fields?.["Case Number"] || "N/A";
    } else {
      // POST response => array of records
      const createdRecord = response.data.records[0];
      recordId = createdRecord.id;
      caseNumber = createdRecord.fields?.["Case Number"] || "N/A";
    }

    console.log("🔹 [route.ts] Returning recordId:", recordId, "caseNumber:", caseNumber);
    return NextResponse.json({
      success: true,
      recordId,
      caseNumber,
    });
  } catch (error: any) {
    console.error("❌ [route.ts] Error creating/updating Airtable record:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
