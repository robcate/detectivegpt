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

/** Suspect details interface */
interface SuspectDetails {
  gender?: string;
  age?: string;
  hair?: string;
  clothing?: string;
  features?: string;
}

/** Witness interface */
interface Witness {
  name: string;
  contact?: string;
}

/** Extended CrimeReportData interface with new fields */
interface CrimeReportData {
  crime_type?: string;
  datetime?: string;
  location?: string;
  coordinates?: Coordinates;
  suspect?: SuspectDetails;

  vehicles?: string[];
  vehicle?: string; // singular to be unified into vehicles

  weapon?: string;
  evidence?: string;

  cameras?: string[];
  camera?: string; // singular to be unified into cameras

  injuries?: string;
  propertyDamage?: string;

  witnesses?: Witness[];
  witness?: Witness; // singular to be unified into witnesses
}

export default function Page() {
  // Local state for the crime report
  const [crimeReport, setCrimeReport] = useState<CrimeReportData>({});

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

  // PDF generation with extended fields
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

    if (crimeReport.crime_type) addLine("Crime Type", crimeReport.crime_type);
    if (crimeReport.datetime) addLine("When", crimeReport.datetime);
    if (crimeReport.location) addLine("Location", crimeReport.location);

    if (crimeReport.coordinates) {
      addLine("Latitude", crimeReport.coordinates.lat.toString());
      addLine("Longitude", crimeReport.coordinates.lng.toString());
    }

    // Vehicles (array)
    if (crimeReport.vehicles && crimeReport.vehicles.length > 0) {
      addLine("Vehicles", crimeReport.vehicles.join(", "));
    }

    // Suspect details
    if (crimeReport.suspect) {
      if (crimeReport.suspect.gender) addLine("Suspect Gender", crimeReport.suspect.gender);
      if (crimeReport.suspect.age) addLine("Suspect Age", crimeReport.suspect.age);
      if (crimeReport.suspect.hair) addLine("Hair", crimeReport.suspect.hair);
      if (crimeReport.suspect.clothing) addLine("Clothing", crimeReport.suspect.clothing);
      if (crimeReport.suspect.features) addLine("Features", crimeReport.suspect.features);
    }

    if (crimeReport.weapon) addLine("Weapon", crimeReport.weapon);
    if (crimeReport.evidence) addLine("Evidence", crimeReport.evidence);

    // Cameras (array)
    if (crimeReport.cameras && crimeReport.cameras.length > 0) {
      addLine("Cameras", crimeReport.cameras.join(", "));
    }

    if (crimeReport.injuries) addLine("Injuries", crimeReport.injuries);
    if (crimeReport.propertyDamage) addLine("Property Damage", crimeReport.propertyDamage);

    // Witnesses (array)
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

  // Function call handler merging new fields with working Google location verification
  const functionCallHandler = async (call: RequiredActionFunctionToolCall) => {
    console.log("🟨 [Page] functionCallHandler => call:", call);

    if (!call?.function?.name) {
      console.warn("🟨 [Page] No function name in call");
      return;
    }

    if (call.function.name === "update_crime_report") {
      const args = JSON.parse(call.function.arguments) as CrimeReportData;
      console.log("🟨 [Page] update_crime_report => parsed args:", args);

      // Unify singular "vehicle" to vehicles array
      if (args.vehicle) {
        console.log("🟨 [Page] Found singular 'vehicle' =>", args.vehicle);
        if (!args.vehicles) {
          args.vehicles = [];
        }
        args.vehicles.push(args.vehicle);
        delete args.vehicle;
      }

      // Unify singular "camera" to cameras array
      if (args.camera) {
        console.log("🟨 [Page] Found singular 'camera' =>", args.camera);
        if (!args.cameras) {
          args.cameras = [];
        }
        args.cameras.push(args.camera);
        delete args.camera;
      }

      // Unify singular "witness" to witnesses array
      if (args.witness) {
        console.log("🟨 [Page] Found singular 'witness' =>", args.witness);
        if (!args.witnesses) {
          args.witnesses = [];
        }
        args.witnesses.push(args.witness);
        delete args.witness;
      }

      // Google location verification
      try {
        if (args.location) {
          console.log("🟨 [Page] Attempting to verify location:", args.location);
          const { success, locationCandidates, singleResult, error } = await getVerifiedLocation(args.location);
          if (!success) {
            console.warn("🟨 [Page] getVerifiedLocation => not successful:", error);
          } else if (locationCandidates.length > 1) {
            console.log("🟨 [Page] Multiple location matches found, returning them to model...");
            // Return them so ChatGPT can ask user to clarify
            return JSON.stringify({
              // 1) Add "output" for Beta Tools
              output: "Multiple location matches found. Please clarify location.",
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

      // Merge new data into local state
      setCrimeReport((prev) => ({ ...prev, ...args }));
      console.log("🟨 [Page] Crime report updated:", args);

      // 2) Return "output" in the JSON
      return JSON.stringify({
        output: "Crime report updated successfully.",
        success: true,
        message: "Crime report updated",
        updatedFields: args,
      });
    }

    console.log("🟨 [Page] No matching function for:", call.function.name);
    // Optionally add an output for no match
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
