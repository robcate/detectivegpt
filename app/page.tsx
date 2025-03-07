"use client";

import React, { useState } from "react";
import styles from "./page.module.css";
import Chat from "./components/chat";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import jsPDF from "jspdf";
import getVerifiedLocation from "./utils/getLocation";

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
 * CrimeReportData includes optional "incidentDescription" if you want it,
 * plus "airtableRecordId" and "caseNumber" for updating the same row in Airtable.
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

  // For storing a final "incidentDescription"
  incidentDescription?: string;

  // The record ID for updates
  airtableRecordId?: string;

  // The assigned "Case Number" from Airtable
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
  return data; // { success, recordId, caseNumber, ... }
}

export default function Page() {
  // Local state for the crime report
  const [crimeReport, setCrimeReport] = useState<CrimeReportData>({});

  // Initial system prompt
  const [initialMessages] = useState([
    {
      role: "assistant" as const,
      content:
        "I'm ready to take your statement about the incident. " +
        "Please describe clearly what happened, including details about the suspect(s), vehicle(s), and any evidence.",
    },
  ]);

  console.log("🟨 [page.tsx] Rendered. Current crimeReport =>", crimeReport);

  /**
   * PDF generation (includes caseNumber, etc.)
   */
  const downloadPDFReport = () => {
    console.log("🟨 [page.tsx] Generating PDF...");
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

    // If you have incidentDescription
    if (crimeReport.incidentDescription) {
      addLine("Incident Description", crimeReport.incidentDescription);
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

    const timestamp = new Date().toLocaleString();
    doc.setFontSize(8);
    doc.text(`Report generated by DetectiveGPT on ${timestamp}`, 105, 280, { align: "center" });
    doc.save("crime_report.pdf");
  };

  /**
   * The main function call handler
   * - Summaries or approvals (optional)
   * - Merges new data (update_crime_report)
   * - Calls Airtable
   */
  const functionCallHandler = async (call: RequiredActionFunctionToolCall) => {
    console.log("🟨 [page.tsx] functionCallHandler => call:", call);

    if (!call?.function?.name) {
      console.warn("🟨 [page.tsx] No function name in call");
      return;
    }

    // #1 Summarize
    if (call.function.name === "summarize_incident_description") {
      const args = JSON.parse(call.function.arguments);
      console.log("🟨 [page.tsx] Summarize => raw_description:", args.raw_description);

      // The LLM will produce the summary in the next assistant message
      return JSON.stringify({
        output: "Summarize function called. The model will provide a formal summary next.",
        success: true,
      });
    }

    // #2 Approve
    if (call.function.name === "approve_incident_description") {
      const args = JSON.parse(call.function.arguments);
      console.log("🟨 [page.tsx] Approve => final_summary:", args.final_summary);

      // Merge final summary into local state
      const merged = { ...crimeReport, incidentDescription: args.final_summary };
      setCrimeReport(merged);
      console.log("🟨 [page.tsx] Approved summary =>", merged.incidentDescription);

      // Immediately save to Airtable so it's guaranteed to appear
      const result = await saveCrimeReportToAirtable(merged);
      if (result.success) {
        console.log("🟨 [page.tsx] Airtable updated with final summary => recordId:", result.recordId);
        setCrimeReport((prev) => ({
          ...prev,
          airtableRecordId: result.recordId,
          caseNumber: result.caseNumber,
        }));
        return JSON.stringify({
          output: "Incident description approved & saved to Airtable.",
          success: true,
          final_summary: args.final_summary,
        });
      } else {
        console.error("❌ [page.tsx] Error saving final summary to Airtable:", result.error);
        return JSON.stringify({
          output: "Approved summary but failed to save to Airtable.",
          success: false,
          error: result.error,
        });
      }
    }

    // #3 update_crime_report
    if (call.function.name === "update_crime_report") {
      const args = JSON.parse(call.function.arguments) as CrimeReportData;
      console.log("🟨 [page.tsx] update_crime_report => parsed args:", args);

      // Unify singular "vehicle" -> vehicles[]
      if (args.vehicle) {
        console.log("🟨 [page.tsx] Found singular 'vehicle' =>", args.vehicle);
        if (!args.vehicles) {
          args.vehicles = [];
        }
        args.vehicles.push(args.vehicle);
        delete args.vehicle;
      }

      // Unify singular "camera" -> cameras[]
      if (args.camera) {
        console.log("🟨 [page.tsx] Found singular 'camera' =>", args.camera);
        if (!args.cameras) {
          args.cameras = [];
        }
        args.cameras.push(args.camera);
        delete args.camera;
      }

      // Unify singular "witness" -> witnesses[]
      if (args.witness) {
        console.log("🟨 [page.tsx] Found singular 'witness' =>", args.witness);
        if (!args.witnesses) {
          args.witnesses = [];
        }
        args.witnesses.push(args.witness);
        delete args.witness;
      }

      // Google location verification
      try {
        if (args.location) {
          console.log("🟨 [page.tsx] Attempting to verify location:", args.location);
          const { success, locationCandidates, singleResult, error } = await getVerifiedLocation(args.location);
          if (!success) {
            console.warn("🟨 [page.tsx] getVerifiedLocation => not successful:", error);
          } else if (locationCandidates.length > 1) {
            console.log("🟨 [page.tsx] Multiple location matches => returning them to model...");
            return JSON.stringify({
              output: "Multiple location matches found. Please clarify location.",
              success: true,
              message: "Crime report updated, but multiple location matches found.",
              locationCandidates,
              updatedFields: args,
            });
          } else if (singleResult) {
            console.log("🟨 [page.tsx] Single location match =>", singleResult);
            args.coordinates = { lat: singleResult.lat, lng: singleResult.lng };
            args.location = singleResult.formattedAddress;
          }
        }
      } catch (geoErr) {
        console.error("🟥 [page.tsx] Error verifying location:", geoErr);
      }

      // Merge old + new so we keep airtableRecordId if we have it
      const merged = { ...crimeReport, ...args };
      setCrimeReport(merged);
      console.log("🟨 [page.tsx] Crime report updated:", merged);

      // Save/Update to /api/airtable with the merged data
      const result = await saveCrimeReportToAirtable(merged);

      if (result.success) {
        console.log("🟨 [page.tsx] Airtable save success => recordId:", result.recordId, "caseNumber:", result.caseNumber);
        setCrimeReport((prev) => ({
          ...prev,
          airtableRecordId: result.recordId,
          caseNumber: result.caseNumber,
        }));

        return JSON.stringify({
          output: "Crime report updated & saved to Airtable successfully.",
          success: true,
          message: "Crime report updated & saved to Airtable",
          recordId: result.recordId,
          caseNumber: result.caseNumber,
          updatedFields: merged,
        });
      } else {
        console.error("❌ [page.tsx] Error saving to Airtable:", result.error);
        return JSON.stringify({
          output: "Crime report updated but failed to save to Airtable.",
          success: false,
          message: "Crime report updated but failed to save to Airtable",
          error: result.error,
        });
      }
    }

    console.log("🟨 [page.tsx] No matching function =>", call.function.name);
    return JSON.stringify({
      output: "No matching function found.",
      success: false,
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

        {crimeReport.incidentDescription && (
          <p>
            <strong>Incident Description:</strong> {crimeReport.incidentDescription}
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
