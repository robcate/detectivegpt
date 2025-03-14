"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";
import Chat from "./components/chat";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import jsPDF from "jspdf";
import getVerifiedLocation from "./utils/getLocation";

/**
 * Types for your data
 */
interface Coordinates {
  lat: number;
  lng: number;
}

interface SuspectDetails {
  gender?: string;
  age?: string;
  hair?: string;
  clothing?: string;
  features?: string;
  height?: string;
  weight?: string;
  tattoos?: string;
  scars?: string;
  accent?: string;
}

interface Witness {
  name: string;
  contact?: string;
}

interface CrimeReportData {
  crime_type?: string;
  datetime?: string;
  location?: string;
  coordinates?: Coordinates;
  suspect?: SuspectDetails;

  vehicles?: string[];
  vehicle?: string; // unify to vehicles[]

  weapon?: string;
  evidence?: string;

  cameras?: string[];
  camera?: string; // unify to cameras[]

  injuries?: string;
  propertyDamage?: string;

  witnesses?: Witness[];
  witness?: Witness; // unify to witnesses[]

  // The conversation log in plain text or concatenated messages
  conversationLog?: string;

  // If the user finalizes a short "incidentDescription", store it
  incidentDescription?: string;

  // The record ID we store to update the same row
  airtableRecordId?: string;

  // We'll store the assigned "Case Number" from Airtable
  caseNumber?: string;
}

/**
 * We'll fetch the route at /api/airtable to save/update the crime report
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
  return data; // { success: true, recordId, caseNumber, ... }
}

export default function Page() {
  // Local state for the crime report
  const [crimeReport, setCrimeReport] = useState<CrimeReportData>({});

  // We also keep a ref that always has the latest crimeReport, so partial merges don’t overwrite fields
  const crimeReportRef = useRef(crimeReport);
  useEffect(() => {
    crimeReportRef.current = crimeReport;
  }, [crimeReport]);

  // For conversation logging: we’ll store it in a local state as plain text
  const [conversationLog, setConversationLog] = useState("");

  // Initial system prompt
  const [initialMessages] = useState([
    {
      role: "assistant" as const,
      content:
        "🚔 DetectiveGPT ready to take your statement about the incident. " +
        "Please describe clearly what happened, including details about the suspect(s), vehicle(s), and any evidence.",
    },
  ]);

  console.log("🟨 [Page] Rendered. Current crimeReport =>", crimeReport);

  /**
   * PDF generation (includes caseNumber)
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
      doc.text(value || "N/A", 70, yPos);
      yPos += lineSpacing;
    };

    // Case Number
    if (crimeReport.caseNumber) {
      addLine("Case Number", crimeReport.caseNumber);
    }

    if (crimeReport.crime_type) addLine("Crime Type", crimeReport.crime_type);
    if (crimeReport.datetime) addLine("When", crimeReport.datetime);
    if (crimeReport.location) addLine("Location", crimeReport.location);

    if (crimeReport.coordinates) {
      addLine("Latitude", crimeReport.coordinates.lat.toString());
      addLine("Longitude", crimeReport.coordinates.lng.toString());
    }

    // Vehicles
    if (crimeReport.vehicles && crimeReport.vehicles.length > 0) {
      addLine("Vehicles", crimeReport.vehicles.join(", "));
    }

    // Suspect
    if (crimeReport.suspect) {
      if (crimeReport.suspect.gender) addLine("Suspect Gender", crimeReport.suspect.gender);
      if (crimeReport.suspect.age) addLine("Suspect Age", crimeReport.suspect.age);
      if (crimeReport.suspect.hair) addLine("Hair", crimeReport.suspect.hair);
      if (crimeReport.suspect.clothing) addLine("Clothing", crimeReport.suspect.clothing);
      if (crimeReport.suspect.features) addLine("Features", crimeReport.suspect.features);
      if (crimeReport.suspect.height) addLine("Suspect Height", crimeReport.suspect.height);
      if (crimeReport.suspect.weight) addLine("Suspect Weight", crimeReport.suspect.weight);
      if (crimeReport.suspect.tattoos) addLine("Suspect Tattoos", crimeReport.suspect.tattoos);
      if (crimeReport.suspect.scars) addLine("Suspect Scars", crimeReport.suspect.scars);
      if (crimeReport.suspect.accent) addLine("Suspect Accent", crimeReport.suspect.accent);
    }

    if (crimeReport.weapon) addLine("Weapon", crimeReport.weapon);
    if (crimeReport.evidence) addLine("Evidence", crimeReport.evidence);

    // Cameras
    if (crimeReport.cameras && crimeReport.cameras.length > 0) {
      addLine("Cameras", crimeReport.cameras.join(", "));
    }

    // Injuries
    if (crimeReport.injuries) addLine("Injuries", crimeReport.injuries);

    // Property Damage
    if (crimeReport.propertyDamage) addLine("Property Damage", crimeReport.propertyDamage);

    // Witnesses
    if (crimeReport.witnesses && crimeReport.witnesses.length > 0) {
      const witnessStr = crimeReport.witnesses
        .map((w) => (w.contact ? `${w.name} (${w.contact})` : w.name))
        .join("; ");
      addLine("Witnesses", witnessStr);
    }

    // Incident Description if any
    if (crimeReport.incidentDescription) {
      addLine("Incident Description", crimeReport.incidentDescription);
    }

    // (Optional) You could add conversation log, but it might be too large for PDF:
    // if (crimeReport.conversationLog) {
    //   addLine("Conversation Log", crimeReport.conversationLog);
    // }

    const timestamp = new Date().toLocaleString();
    doc.setFontSize(8);
    doc.text(`Report generated by DetectiveGPT on ${timestamp}`, 105, 280, { align: "center" });
    doc.save("crime_report.pdf");
  };

  /**
   * The main function call handler for "update_crime_report"
   * - Translates to English
   * - Unifies singular->array fields
   * - Merges partial updates
   * - Verifies location
   * - Saves to Airtable
   */
  const functionCallHandler = async (call: RequiredActionFunctionToolCall) => {
    console.log("🟨 [Page] functionCallHandler => call:", call);

    // Return JSON if no function name
    if (!call?.function?.name) {
      console.warn("🟨 [Page] No function name in call");
      return JSON.stringify({
        success: false,
        message: "No function name provided.",
      });
    }

    // If the user confirms a final summary, store as incidentDescription
    if (call.function.name === "approve_incident_description") {
      try {
        const parsed = JSON.parse(call.function.arguments);
        const finalSummary = parsed.final_summary || "";
        // Merge into local
        const merged = { ...crimeReportRef.current, incidentDescription: finalSummary };
        setCrimeReport(merged);
        console.log("🟨 [Page] Final incident description =>", finalSummary);

        // Save to Airtable with conversation log, so it’s not lost
        const dataToSave = { ...merged, conversationLog }; // include conversation
        const result = await saveCrimeReportToAirtable(dataToSave);
        if (result.success) {
          // Update local with recordId/caseNumber if needed
          setCrimeReport((prev) => ({
            ...prev,
            airtableRecordId: result.recordId,
            caseNumber: result.caseNumber,
          }));
          return JSON.stringify({
            success: true,
            message: "Incident description approved & saved.",
            recordId: result.recordId,
            caseNumber: result.caseNumber,
          });
        } else {
          return JSON.stringify({
            success: false,
            message: "Failed to save final description to Airtable",
            error: result.error,
          });
        }
      } catch (err) {
        console.error("❌ [Page] Error parsing approve_incident_description =>", err);
        return JSON.stringify({
          success: false,
          message: String(err),
        });
      }
    }

    // If the user calls "summarize_incident_description", just echo back
    if (call.function.name === "summarize_incident_description") {
      try {
        const parsed = JSON.parse(call.function.arguments);
        const raw = parsed.raw_description || "";
        // We'll just respond with success, leaving GPT to show the summary. Then user can call approve_incident_description.
        return JSON.stringify({
          success: true,
          message: "Draft summary generated",
          raw_description: raw,
        });
      } catch (err) {
        console.error("❌ [Page] Error parsing summarize_incident_description =>", err);
        return JSON.stringify({
          success: false,
          message: String(err),
        });
      }
    }

    if (call.function.name === "update_crime_report") {
      const args = JSON.parse(call.function.arguments) as CrimeReportData;
      console.log("🟨 [Page] update_crime_report => parsed args:", args);

      // Unify singular "vehicle" -> vehicles[]
      if (args.vehicle) {
        if (!args.vehicles) args.vehicles = [];
        args.vehicles.push(args.vehicle);
        delete args.vehicle;
      }

      // Unify singular "camera" -> cameras[]
      if (args.camera) {
        if (!args.cameras) args.cameras = [];
        args.cameras.push(args.camera);
        delete args.camera;
      }

      // Unify singular "witness" -> witnesses[]
      if (args.witness) {
        if (!args.witnesses) args.witnesses = [];
        args.witnesses.push(args.witness);
        delete args.witness;
      }

      // -----------------------
      // TRANSLATION LOGIC BEGIN
      // -----------------------
      const translateToEnglish = async (text: string): Promise<string> => {
        if (!text) return text; // skip empty
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
            return text; // fallback
          }
          console.log("🟨 [translateToEnglish] Received translation =>", data.translation);
          return data.translation;
        } catch (err) {
          console.error("❌ [translateToEnglish] Unexpected error =>", err);
          return text; // fallback
        }
      };

      // Translate main fields
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

      // Translate suspect details
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

      // Translate extended suspect fields (height, weight, accent, tattoos, scars)
      if (args.suspect?.height) {
        args.suspect.height = await translateToEnglish(args.suspect.height);
      }
      if (args.suspect?.weight) {
        args.suspect.weight = await translateToEnglish(args.suspect.weight);
      }
      if (args.suspect?.tattoos) {
        args.suspect.tattoos = await translateToEnglish(args.suspect.tattoos);
      }
      if (args.suspect?.scars) {
        args.suspect.scars = await translateToEnglish(args.suspect.scars);
      }
      if (args.suspect?.accent) {
        args.suspect.accent = await translateToEnglish(args.suspect.accent);
      }

      // Translate witnesses
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
      // -----------------------
      // TRANSLATION LOGIC END
      // -----------------------

      // Attempt location verification (in English)
      try {
        if (args.location) {
          console.log("🟨 [Page] Attempting to verify location:", args.location);
          const { success, locationCandidates, singleResult, error } = await getVerifiedLocation(args.location);
          if (!success) {
            console.warn("🟨 [Page] getVerifiedLocation => not successful:", error);
          } else if (locationCandidates.length > 1) {
            // Merge partial fields so we don’t lose them
            const partialMerged = { ...crimeReportRef.current, ...args };
            partialMerged.conversationLog = conversationLog; // keep log
            setCrimeReport(partialMerged);
            console.log("🟨 [Page] Partial update (multiple location matches) =>", partialMerged);

            return JSON.stringify({
              success: true,
              message: "Crime report updated partially, but multiple location matches found.",
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

      // Merge new data into local state
      // Also keep the conversation log from local state
      const merged = { ...crimeReportRef.current, ...args };
      merged.conversationLog = conversationLog;

      setCrimeReport(merged);
      console.log("🟨 [Page] Crime report updated =>", merged);

      // Save/Update to Airtable
      const result = await saveCrimeReportToAirtable(merged);

      if (result.success) {
        console.log("🟨 [Page] Airtable save success => recordId:", result.recordId, "caseNumber:", result.caseNumber);
        // Update local state with the new recordId & caseNumber
        setCrimeReport((prev) => ({
          ...prev,
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

    console.log("🟨 [Page] No matching function for:", call.function.name);
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
        <Chat
          functionCallHandler={async (toolCall) => {
            // 1) Each time user or GPT messages, we’ll keep appending to conversationLog
            // but the best place to do that is in chat.tsx. So we’ll create a function
            // there that returns the entire conversation, or handle it here:
            // We'll do a trick: in Chat's onNewMessage prop we can store them.
            //
            // For this snippet, let's assume Chat calls this function AFTER it appends messages.

            // 2) Actually call your functionCallHandler logic:
            const resultJson = await functionCallHandler(toolCall);

            return resultJson;
          }}
          initialMessages={initialMessages}
          // We'll pass an extra prop so Chat can update our conversationLog as plain text
          onConversationUpdated={(newLog) => {
            setConversationLog(newLog);
          }}
        />
      </div>

      <div className={styles.crimeReportContainer}>
        <h3>Crime Report Summary</h3>

        {/* Show the Case Number */}
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
            {crimeReport.suspect.height && <p>Height: {crimeReport.suspect.height}</p>}
            {crimeReport.suspect.weight && <p>Weight: {crimeReport.suspect.weight}</p>}
            {crimeReport.suspect.tattoos && <p>Tattoos: {crimeReport.suspect.tattoos}</p>}
            {crimeReport.suspect.scars && <p>Scars: {crimeReport.suspect.scars}</p>}
            {crimeReport.suspect.accent && <p>Accent: {crimeReport.suspect.accent}</p>}
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

        {crimeReport.witnesses && crimeReport.witnesses.length > 0 && (
          <div>
            <strong>Witnesses:</strong>
            {crimeReport.witnesses.map((w, i) => (
              <p key={i}>
                {w.name}
                {w.contact ? ` (Contact: ${w.contact})` : ""}
              </p>
            ))}
          </div>
        )}

        {crimeReport.incidentDescription && (
          <p>
            <strong>Incident Description:</strong> {crimeReport.incidentDescription}
          </p>
        )}

        <button className="downloadButton" onClick={downloadPDFReport}>
          📥 Download PDF Report
        </button>
      </div>
    </main>
  );
}
