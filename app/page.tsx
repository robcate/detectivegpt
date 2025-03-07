"use client";

import React, { useState } from "react";
import styles from "./page.module.css";
import Chat from "./components/chat";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import jsPDF from "jspdf";
import getVerifiedLocation from "./utils/getLocation";

/** 
 * We'll call our server route `/api/translate` to do the actual 
 * Google Cloud translation on the server side. 
 */
async function translateToEnglish(text: string): Promise<string> {
  if (!text) return text; // no-op if empty
  try {
    console.log("🟨 [translateToEnglish] Sending text to /api/translate =>", text);
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang: "en" }),
    });
    const data = await res.json();
    if (!data.success) {
      console.error("❌ [translateToEnglish] Translation failed:", data.error);
      return text; // fallback to original
    }
    console.log("🟨 [translateToEnglish] Received translation =>", data.translation);
    return data.translation;
  } catch (err) {
    console.error("❌ [translateToEnglish] Unexpected error =>", err);
    return text; // fallback
  }
}

/** Coordinates from geocoding */
interface Coordinates {
  lat: number;
  lng: number;
}

/** Basic suspect details */
interface SuspectDetails {
  gender?: string;
  age?: string;
  hair?: string;
  clothing?: string;
  features?: string;
}

/** Witness structure (name + optional contact) */
interface Witness {
  name: string;
  contact?: string;
}

/** 
 * CrimeReportData includes all the fields we store,
 * plus "airtableRecordId" and "caseNumber" for updates.
 */
interface CrimeReportData {
  crime_type?: string;
  datetime?: string;
  location?: string;
  coordinates?: Coordinates;
  suspect?: SuspectDetails;

  vehicles?: string[];
  vehicle?: string; // unify to vehicles

  weapon?: string;
  evidence?: string;

  cameras?: string[];
  camera?: string; // unify to cameras

  injuries?: string;
  propertyDamage?: string;

  witnesses?: Witness[];
  witness?: Witness; // unify to witnesses

  // For updating the same row in Airtable
  airtableRecordId?: string;

  // The assigned "Case Number" from Airtable
  caseNumber?: string;
}

/** 
 * We'll fetch the route at /api/airtable to save/update the crime report.
 */
async function saveCrimeReportToAirtable(crimeReport: CrimeReportData) {
  console.log("🔹 [saveCrimeReportToAirtable] Sending to /api/airtable =>", crimeReport);

  const res = await fetch("/api/airtable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(crimeReport),
  });

  const data = await res.json();
  console.log("🔹 [saveCrimeReportToAirtable] Response =>", data);
  return data; // { success: boolean, recordId: string, caseNumber: string, ... }
}

export default function Page() {
  // Local state for the crime report
  const [crimeReport, setCrimeReport] = useState<CrimeReportData>({});

  // The initial assistant greeting in English:
  const [initialMessages] = useState([
    {
      role: "assistant" as const,
      content:
        "Hello, I'm Detective GPT. Please describe the incident in as much detail as possible. " +
        "If you speak another language, I will respond in that language. However, " +
        "all information is ultimately stored in English for official records.",
    },
  ]);

  console.log("🟨 [Page] Rendered. Current crimeReport =>", crimeReport);

  /**
   * PDF generation: includes caseNumber, etc.
   */
  const downloadPDFReport = () => {
    console.log("🟨 [Page] Generating PDF...");
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Detective GPT Crime Report", 105, 20, { align: "center" });

    doc.setFontSize(12);
    let yPos = 35;
    const lineSpacing = 8;

    const addLine = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 20, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(value, 70, yPos);
      yPos += lineSpacing;
    };

    if (crimeReport.caseNumber) {
      addLine("Case Number", crimeReport.caseNumber);
    }

    if (crimeReport.crime_type) addLine("Crime Type", crimeReport.crime_type);
    if (crimeReport.datetime) addLine("When", crimeReport.datetime || "N/A");
    if (crimeReport.location) addLine("Location", crimeReport.location || "N/A");

    if (crimeReport.coordinates) {
      addLine("Latitude", crimeReport.coordinates.lat.toString());
      addLine("Longitude", crimeReport.coordinates.lng.toString());
    }

    if (crimeReport.vehicles && crimeReport.vehicles.length > 0) {
      addLine("Vehicles", crimeReport.vehicles.join(", "));
    }

    if (crimeReport.suspect) {
      if (crimeReport.suspect.gender) addLine("Suspect Gender", crimeReport.suspect.gender);
      if (crimeReport.suspect.age) addLine("Suspect Age", crimeReport.suspect.age);
      if (crimeReport.suspect.hair) addLine("Hair", crimeReport.suspect.hair);
      if (crimeReport.suspect.clothing) addLine("Clothing", crimeReport.suspect.clothing);
      if (crimeReport.suspect.features) addLine("Features", crimeReport.suspect.features);
    }

    if (crimeReport.weapon) addLine("Weapon", crimeReport.weapon);
    if (crimeReport.evidence) addLine("Evidence", crimeReport.evidence);

    if (crimeReport.cameras && crimeReport.cameras.length > 0) {
      addLine("Cameras", crimeReport.cameras.join(", "));
    }

    if (crimeReport.injuries) addLine("Injuries", crimeReport.injuries);
    if (crimeReport.propertyDamage) addLine("Property Damage", crimeReport.propertyDamage);

    if (crimeReport.witnesses && crimeReport.witnesses.length > 0) {
      const witnessStr = crimeReport.witnesses
        .map((w) => (w.contact ? `${w.name} (${w.contact})` : w.name))
        .join("; ");
      addLine("Witnesses", witnessStr);
    }

    const timestamp = new Date().toLocaleString();
    doc.setFontSize(8);
    doc.text(`Report generated by DetectiveGPT on ${timestamp}`, 105, 280, { align: "center" });
    doc.save("crime_report.pdf");
  };

  /**
   * The main function call handler for "update_crime_report".
   * We ensure fields are translated to English so the DB is consistent.
   */
  const functionCallHandler = async (call: RequiredActionFunctionToolCall) => {
    console.log("🟨 [Page] functionCallHandler => call:", call);

    // Always return a JSON string (OpenAI function calling spec).
    if (!call?.function?.name) {
      console.warn("🟨 [Page] No function name in call");
      return JSON.stringify({
        success: false,
        message: "No function name provided.",
      });
    }

    if (call.function.name === "update_crime_report") {
      const args = JSON.parse(call.function.arguments) as CrimeReportData;
      console.log("🟨 [Page] update_crime_report => parsed args:", args);

      // 1) Unify singular -> arrays BEFORE translation
      if (args.vehicle) {
        console.log("🟨 [Page] Found singular 'vehicle' =>", args.vehicle);
        if (!args.vehicles) args.vehicles = [];
        args.vehicles.push(args.vehicle);
        delete args.vehicle;
      }
      if (args.camera) {
        console.log("🟨 [Page] Found singular 'camera' =>", args.camera);
        if (!args.cameras) args.cameras = [];
        args.cameras.push(args.camera);
        delete args.camera;
      }
      if (args.witness) {
        console.log("🟨 [Page] Found singular 'witness' =>", args.witness);
        if (!args.witnesses) args.witnesses = [];
        args.witnesses.push(args.witness);
        delete args.witness;
      }

      // 2) Translate everything to English
      //    a) Simple strings
      if (args.crime_type) {
        args.crime_type = await translateToEnglish(args.crime_type);
      }
      if (args.datetime) {
        args.datetime = await translateToEnglish(args.datetime);
      }
      if (args.location) {
        args.location = await translateToEnglish(args.location);
      }
      if (args.weapon) {
        args.weapon = await translateToEnglish(args.weapon);
      }
      if (args.evidence) {
        args.evidence = await translateToEnglish(args.evidence);
      }
      if (args.injuries) {
        args.injuries = await translateToEnglish(args.injuries);
      }
      if (args.propertyDamage) {
        args.propertyDamage = await translateToEnglish(args.propertyDamage);
      }

      //    b) Arrays (vehicles, cameras)
      if (args.vehicles && args.vehicles.length > 0) {
        const translatedVehicles: string[] = [];
        for (const v of args.vehicles) {
          translatedVehicles.push(await translateToEnglish(v));
        }
        args.vehicles = translatedVehicles;
      }
      if (args.cameras && args.cameras.length > 0) {
        const translatedCameras: string[] = [];
        for (const c of args.cameras) {
          translatedCameras.push(await translateToEnglish(c));
        }
        args.cameras = translatedCameras;
      }

      //    c) Suspect details
      if (args.suspect) {
        if (args.suspect.gender) {
          args.suspect.gender = await translateToEnglish(args.suspect.gender);
        }
        if (args.suspect.age) {
          args.suspect.age = await translateToEnglish(args.suspect.age);
        }
        if (args.suspect.hair) {
          args.suspect.hair = await translateToEnglish(args.suspect.hair);
        }
        if (args.suspect.clothing) {
          args.suspect.clothing = await translateToEnglish(args.suspect.clothing);
        }
        if (args.suspect.features) {
          args.suspect.features = await translateToEnglish(args.suspect.features);
        }
      }

      //    d) Witnesses (name + contact)
      if (args.witnesses && args.witnesses.length > 0) {
        for (const witness of args.witnesses) {
          if (witness.name) {
            witness.name = await translateToEnglish(witness.name);
          }
          if (witness.contact) {
            witness.contact = await translateToEnglish(witness.contact);
          }
        }
      }

      // 3) Attempt location verification
      try {
        if (args.location) {
          console.log("🟨 [Page] Attempting to verify location:", args.location);
          const { success, locationCandidates, singleResult, error } = await getVerifiedLocation(args.location);
          if (!success) {
            console.warn("🟨 [Page] getVerifiedLocation => not successful:", error);
          } else if (locationCandidates.length > 1) {
            console.log("🟨 [Page] Multiple location matches => returning them to model...");
            return JSON.stringify({
              success: true,
              message: "Crime report updated, but multiple location matches found.",
              locationCandidates,
              updatedFields: args,
            });
          } else if (singleResult) {
            console.log("🟨 [Page] Single location match found:", singleResult);
            args.coordinates = { lat: singleResult.lat, lng: singleResult.lng };
            args.location = singleResult.formattedAddress;
          }
        }
      } catch (geoErr) {
        console.error("🟥 [Page] Error verifying location:", geoErr);
      }

      // 4) Merge old + new so we keep airtableRecordId if we have it
      const merged = { ...crimeReport, ...args };
      setCrimeReport(merged);
      console.log("🟨 [Page] Crime report updated:", merged);

      // 5) Save/Update in Airtable
      const result = await saveCrimeReportToAirtable(merged);
      if (result.success) {
        console.log(
          "🟨 [Page] Airtable save success => recordId:",
          result.recordId,
          "caseNumber:",
          result.caseNumber
        );
        setCrimeReport((prev) => ({
          ...prev,
          ...args,
          airtableRecordId: result.recordId,
          caseNumber: result.caseNumber,
        }));

        return JSON.stringify({
          success: true,
          message: "Crime report updated & saved to Airtable",
          recordId: result.recordId,
          caseNumber: result.caseNumber,
          updatedFields: args,
        });
      } else {
        console.error("❌ [Page] Error saving to Airtable:", result.error);
        return JSON.stringify({
          success: false,
          message: "Crime report updated but failed to save to Airtable",
          error: result.error,
        });
      }
    }

    // If none match
    console.log("🟨 [Page] No matching function =>", call.function.name);
    return JSON.stringify({
      success: false,
      message: "No matching function found.",
    });
  };

  return (
    <main className={styles.main}>
      <header className="header">
        <h1>🚔 DETECTIVE GPT READY TO ASSIST</h1>
        <p>Report crimes securely & anonymously. Your information is protected.</p>
      </header>

      <div className={styles.chatContainer}>
        <Chat functionCallHandler={functionCallHandler} initialMessages={initialMessages} />
      </div>

      <div className={styles.crimeReportContainer}>
        <h3>Crime Report Summary</h3>

        {crimeReport.caseNumber && (
          <p>
            <strong>Case Number:</strong> {crimeReport.caseNumber}
          </p>
        )}

        {crimeReport.crime_type && (
          <p>
            <strong>Type:</strong> {crimeReport.crime_type}
          </p>
        )}

        {crimeReport.datetime && (
          <p>
            <strong>When:</strong> {crimeReport.datetime}
          </p>
        )}

        {crimeReport.location && (
          <p>
            <strong>Location:</strong> {crimeReport.location}
          </p>
        )}

        {crimeReport.coordinates && (
          <>
            <p>
              <strong>Latitude:</strong> {crimeReport.coordinates.lat}
            </p>
            <p>
              <strong>Longitude:</strong> {crimeReport.coordinates.lng}
            </p>
          </>
        )}

        {crimeReport.vehicles && crimeReport.vehicles.length > 0 && (
          <p>
            <strong>Vehicles:</strong> {crimeReport.vehicles.join(", ")}
          </p>
        )}

        {crimeReport.suspect && (
          <div>
            <strong>Suspect Details:</strong>
            {crimeReport.suspect.gender && <p>Gender: {crimeReport.suspect.gender}</p>}
            {crimeReport.suspect.age && <p>Age: {crimeReport.suspect.age}</p>}
            {crimeReport.suspect.hair && <p>Hair: {crimeReport.suspect.hair}</p>}
            {crimeReport.suspect.clothing && <p>Clothing: {crimeReport.suspect.clothing}</p>}
            {crimeReport.suspect.features && <p>Features: {crimeReport.suspect.features}</p>}
          </div>
        )}

        {crimeReport.weapon && (
          <p>
            <strong>Weapon:</strong> {crimeReport.weapon}
          </p>
        )}

        {crimeReport.evidence && (
          <p>
            <strong>Evidence:</strong> {crimeReport.evidence}
          </p>
        )}

        {crimeReport.cameras && crimeReport.cameras.length > 0 && (
          <p>
            <strong>Cameras:</strong> {crimeReport.cameras.join(", ")}
          </p>
        )}

        {crimeReport.injuries && (
          <p>
            <strong>Injuries:</strong> {crimeReport.injuries}
          </p>
        )}

        {crimeReport.propertyDamage && (
          <p>
            <strong>Property Damage:</strong> {crimeReport.propertyDamage}
          </p>
        )}

        <button className="downloadButton" onClick={downloadPDFReport}>
          📥 Download PDF Report
        </button>
      </div>
    </main>
  );
}
