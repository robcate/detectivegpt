"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";
import Chat from "./components/chat";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import jsPDF from "jspdf";
import getVerifiedLocation from "./utils/getLocation";
import { TIME_ZONE, BRAND_NAME } from "./brandConstants"; // BRAND_LOGO unused in code

/**
 * CHRONO + LUXON
 */
import * as chrono from "chrono-node";
import { DateTime } from "luxon";

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

  // We'll store the entire conversation log
  conversationLog?: string;

  // If user finalizes a short summary
  incidentDescription?: string;

  // The record ID in Airtable
  airtableRecordId?: string;

  // The assigned "Case Number" from Airtable
  caseNumber?: string;

  // We'll store weather in a new "Weather" field
  weather?: string;

  // (NEW) We'll also store the short GPT text describing images
  evidenceObservations?: string;
}

/**
 * We'll fetch /api/airtable to create/update
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
  return data;
}

async function fetchWeather(lat: number, lon: number, isoDatetime: string): Promise<string> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
    if (!apiKey) {
      console.warn("No OPENWEATHER_API_KEY found in env. Returning placeholder weather.");
      return "Weather data not available (no API key).";
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`;
    console.log("🟨 [fetchWeather] => calling =>", url);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn("🟨 [fetchWeather] => fetch not ok =>", resp.status);
      return "Weather fetch failed.";
    }
    const data = await resp.json();
    const desc = data.weather?.[0]?.description || "unknown";
    const temp =
      data.main?.temp !== undefined ? `${Math.round(data.main.temp)}°F` : "??°F";
    const humidity =
      data.main?.humidity !== undefined ? `${data.main.humidity}% humidity` : "";
    const wind =
      data.wind?.speed !== undefined ? `wind ${Math.round(data.wind.speed)} mph` : "";
    const summaryParts = [desc, temp, humidity, wind].filter(Boolean);
    const summary = summaryParts.join(", ");
    return summary || "No weather data available.";
  } catch (err) {
    console.error("❌ [fetchWeather] Unexpected error =>", err);
    return "Error fetching weather data.";
  }
}

/** 
 * Convert first letter of a string to uppercase, leave the rest as-is.
 * e.g. "vehicle theft" => "Vehicle theft"
 */
function capitalizeFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Helper to fetch /logo.png from public/ and convert it to base64
 */
async function fetchPublicLogoAsBase64(): Promise<string | null> {
  try {
    const res = await fetch("/logo.png");
    if (!res.ok) {
      throw new Error("Failed to fetch /logo.png");
    }
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("🟨 [Page] Could not load /logo.png =>", err);
    return null;
  }
}

export default function Page() {
  const [crimeReport, setCrimeReport] = useState<CrimeReportData>({});
  const crimeReportRef = useRef(crimeReport);

  useEffect(() => {
    crimeReportRef.current = crimeReport;
  }, [crimeReport]);

  const [conversationLog, setConversationLog] = useState("");

  const [initialMessages] = useState([
    {
      role: "assistant" as const,
      content:
        `Hello, this is ${BRAND_NAME}. I'm ready to take your statement about the incident, in any language you prefer. Please describe clearly what happened, including details about the suspect(s), vehicle(s), and any evidence.`,
    },
  ]);

  console.log("🟨 [Page] Rendered. Current crimeReport =>", crimeReport);

  /**
   * PDF Generation - keep subheadings uppercase, but only capitalize first letter of values
   */
  const downloadPDFReport = async () => {
    console.log("🟨 [Page] Generating PDF...");
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    // Light gray background
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFillColor(241, 245, 249);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    // Logo with top spacing
    const publicLogoBase64 = await fetchPublicLogoAsBase64();
    if (publicLogoBase64) {
      doc.addImage(publicLogoBase64, "PNG", 50, 40, 50, 50);
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor("#333");
    doc.text(`${BRAND_NAME} Report`, pageWidth / 2, 100, { align: "center" });

    // Body style
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor("#444");

    let yPos = 180;
    const lineSpacing = 20;

    // Helper for subheadings
    function addSubheading(title: string) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor("#000");
      doc.text(title.toUpperCase(), 60, yPos);
      yPos += lineSpacing;
      // revert
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor("#444");
    }

    // Print label in bold, then value with only first letter capitalized
    function addLine(label: string, value: string) {
      if (!value) return;
      doc.setFont("helvetica", "bold");
      const labelText = label.toUpperCase() + ": ";
      const labelWidth = doc.getTextWidth(labelText);
      doc.text(labelText, 60, yPos);

      doc.setFont("helvetica", "normal");
      doc.text(capitalizeFirst(value), 60 + labelWidth, yPos);

      yPos += lineSpacing;
    }

    // 1) CASE INFO
    const hasCaseInfo =
      crimeReport.caseNumber ||
      crimeReport.crime_type ||
      crimeReport.datetime ||
      crimeReport.location ||
      crimeReport.coordinates ||
      crimeReport.weather ||
      (crimeReport.vehicles && crimeReport.vehicles.length > 0);

    if (hasCaseInfo) {
      addSubheading("Case Info");
      if (crimeReport.caseNumber) addLine("Case Number", crimeReport.caseNumber);
      if (crimeReport.crime_type) addLine("Type", crimeReport.crime_type);
      if (crimeReport.datetime) addLine("When", crimeReport.datetime);
      if (crimeReport.location) addLine("Location", crimeReport.location);

      if (crimeReport.coordinates) {
        if (crimeReport.coordinates.lat) {
          addLine("Latitude", String(crimeReport.coordinates.lat));
        }
        if (crimeReport.coordinates.lng) {
          addLine("Longitude", String(crimeReport.coordinates.lng));
        }
      }

      if (crimeReport.weather) {
        addLine("Weather", crimeReport.weather);
      }
      if (crimeReport.vehicles && crimeReport.vehicles.length > 0) {
        addLine("Vehicles", crimeReport.vehicles.join(", "));
      }
    }

    // 2) SUSPECT DETAILS
    if (crimeReport.suspect) {
      const s = crimeReport.suspect;
      const hasSuspectFields =
        s.gender ||
        s.age ||
        s.hair ||
        s.clothing ||
        s.features ||
        s.height ||
        s.weight ||
        s.tattoos ||
        s.scars ||
        s.accent;

      if (hasSuspectFields) {
        addSubheading("Suspect Details");
        if (s.gender) addLine("Gender", s.gender);
        if (s.age) addLine("Age", s.age);
        if (s.hair) addLine("Hair", s.hair);
        if (s.clothing) addLine("Clothing", s.clothing);
        if (s.features) addLine("Features", s.features);
        if (s.height) addLine("Height", s.height);
        if (s.weight) addLine("Weight", s.weight);
        if (s.tattoos) addLine("Tattoos", s.tattoos);
        if (s.scars) addLine("Scars", s.scars);
        if (s.accent) addLine("Accent", s.accent);
      }
    }

    // 3) WEAPON & EVIDENCE
    const hasWeaponOrEvidence =
      crimeReport.weapon ||
      (crimeReport.evidenceObservations && crimeReport.evidenceObservations.trim()) ||
      crimeReport.evidence ||
      (crimeReport.cameras && crimeReport.cameras.length > 0) ||
      crimeReport.injuries ||
      crimeReport.propertyDamage;

    if (hasWeaponOrEvidence) {
      addSubheading("Weapon & Evidence");
      if (crimeReport.weapon) addLine("Weapon", crimeReport.weapon);

      if (crimeReport.evidenceObservations && crimeReport.evidenceObservations.trim()) {
        addLine("Evidence", crimeReport.evidenceObservations);
      } else if (crimeReport.evidence) {
        addLine("Evidence", crimeReport.evidence);
      }

      if (crimeReport.cameras && crimeReport.cameras.length > 0) {
        addLine("Cameras", crimeReport.cameras.join(", "));
      }
      if (crimeReport.injuries) addLine("Injuries", crimeReport.injuries);
      if (crimeReport.propertyDamage) addLine("Property Damage", crimeReport.propertyDamage);
    }

    // 4) WITNESSES
    if (crimeReport.witnesses && crimeReport.witnesses.length > 0) {
      addSubheading("Witnesses");
      const witnessStr = crimeReport.witnesses
        .map((w) => (w.contact ? `${w.name} (${w.contact})` : w.name))
        .join("; ");
      addLine("Witnesses", witnessStr);
    }

    // 5) INCIDENT DESCRIPTION
    if (crimeReport.incidentDescription) {
      addSubheading("Incident Description");
      addLine("Description", crimeReport.incidentDescription);
    }

    // Footer
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#666");
    doc.text(
      `Report generated by ${BRAND_NAME} on ${new Date().toLocaleString()}`,
      pageWidth / 2,
      pageHeight - 30,
      { align: "center" }
    );

    doc.save("crime_report.pdf");
  };

  /**
   * The main functionCallHandler
   */
  const functionCallHandler = async (call: RequiredActionFunctionToolCall) => {
    console.log("🟨 [Page] functionCallHandler => call:", call);

    if (!call?.function?.name) {
      console.warn("🟨 [Page] No function name in call");
      return JSON.stringify({ success: false, message: "No function name provided." });
    }

    // Approve final summary
    if (call.function.name === "approve_incident_description") {
      try {
        const parsed = JSON.parse(call.function.arguments);
        const finalSummary = parsed.final_summary || "";
        const merged = { ...crimeReportRef.current, incidentDescription: finalSummary };
        setCrimeReport(merged);
        console.log("🟨 [Page] Final incident description =>", finalSummary);

        const dataToSave = { ...merged, conversationLog };
        const result = await saveCrimeReportToAirtable(dataToSave);
        if (result.success) {
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
        return JSON.stringify({ success: false, message: String(err) });
      }
    }

    // Summarize final description
    if (call.function.name === "summarize_incident_description") {
      try {
        const parsed = JSON.parse(call.function.arguments);
        const raw = parsed.raw_description || "";
        return JSON.stringify({
          success: true,
          message: "Draft summary generated",
          raw_description: raw,
        });
      } catch (err) {
        console.error("❌ [Page] Error parsing summarize_incident_description =>", err);
        return JSON.stringify({ success: false, message: String(err) });
      }
    }

    // Update crime report
    if (call.function.name === "update_crime_report") {
      const args = JSON.parse(call.function.arguments) as CrimeReportData;
      console.log("🟨 [Page] update_crime_report => parsed args:", args);

      // unify single->array
      if (args.vehicle) {
        if (!args.vehicles) args.vehicles = [];
        args.vehicles.push(args.vehicle);
        delete args.vehicle;
      }
      if (args.camera) {
        if (!args.cameras) args.cameras = [];
        args.cameras.push(args.camera);
        delete args.camera;
      }
      if (args.witness) {
        if (!args.witnesses) args.witnesses = [];
        args.witnesses.push(args.witness);
        delete args.witness;
      }

      // Translation
      const translateToEnglish = async (text: string): Promise<string> => {
        if (!text) return text;
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
            return text;
          }
          console.log("🟨 [translateToEnglish] Received translation =>", data.translation);
          return data.translation;
        } catch (err) {
          console.error("❌ [translateToEnglish] Unexpected error =>", err);
          return text;
        }
      };

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
        if (args.suspect.height) {
          args.suspect.height = await translateToEnglish(args.suspect.height);
        }
        if (args.suspect.weight) {
          args.suspect.weight = await translateToEnglish(args.suspect.weight);
        }
        if (args.suspect.tattoos) {
          args.suspect.tattoos = await translateToEnglish(args.suspect.tattoos);
        }
        if (args.suspect.scars) {
          args.suspect.scars = await translateToEnglish(args.suspect.scars);
        }
        if (args.suspect.accent) {
          args.suspect.accent = await translateToEnglish(args.suspect.accent);
        }
      }

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

      // Attempt location verification
      try {
        if (args.location) {
          console.log("🟨 [Page] Attempting to verify location:", args.location);
          const { success, locationCandidates, singleResult, error } =
            await getVerifiedLocation(args.location);
          if (!success) {
            console.warn("🟨 [Page] getVerifiedLocation => not successful:", error);
          } else if (locationCandidates.length > 1) {
            const partialMerged = { ...crimeReportRef.current, ...args };
            partialMerged.conversationLog = conversationLog;
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

      // CHRONO parse
      if (args.datetime) {
        console.log("🟨 [Page] Attempting to parse user datetime =>", args.datetime);
        const parsedResults = chrono.parse(args.datetime);
        if (parsedResults && parsedResults.length > 0) {
          const bestResult = parsedResults[0];
          const dateObj = bestResult.start.date();
          console.log("🟨 [Page] chrono parsed date =>", dateObj);

          const dt = DateTime.fromJSDate(dateObj, { zone: TIME_ZONE });
          const isoStr = dt.toISO({ suppressMilliseconds: true });
          console.log("🟨 [Page] chrono => luxon => final =>", isoStr);

          args.datetime = isoStr;
        }
      }

      // If we have coords/time => attempt fetchWeather
      if (args.coordinates && args.coordinates.lat && args.coordinates.lng) {
        try {
          const lat = args.coordinates.lat;
          const lng = args.coordinates.lng;
          const isoTime = args.datetime || new Date().toISOString();
          console.log("🟨 [Page] Attempting to fetch weather =>", lat, lng, isoTime);
          const weatherSummary = await fetchWeather(lat, lng, isoTime);
          console.log("🟨 [Page] Weather =>", weatherSummary);
          args.weather = weatherSummary;
        } catch (err) {
          console.error("❌ [Page] Weather fetch error =>", err);
        }
      }

      const merged = { ...crimeReportRef.current, ...args };
      merged.conversationLog = conversationLog;
      setCrimeReport(merged);
      console.log("🟨 [Page] Crime report updated =>", merged);

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
          airtableRecordId: result.recordId,
          caseNumber: result.caseNumber,
        }));

        return JSON.stringify({
          success: true,
          message: "Crime report updated & saved to Airtable. Weather added if coords/time available.",
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
    return JSON.stringify({ success: false, message: "No matching function found." });
  };

  // ---- RENDERED PAGE ----
  return (
    <main className={styles.main}>
      <div className={styles.crimeReportContainer}>
        {/* Header */}
        <div className={styles.cardHeader}>
          <img
            src="/logo.png"
            alt={`${BRAND_NAME} Logo`}
            style={{ height: 50, width: "auto" }}
          />
          <h1>{BRAND_NAME}</h1>
        </div>

        <h3 className={styles.sectionTitle}>Report Summary</h3>

        {/* Basic Case Info */}
        <section className={styles.caseInfo}>
          {crimeReport.caseNumber && (
            <p>
              <strong>Case Number:</strong> {capitalizeFirst(crimeReport.caseNumber)}
            </p>
          )}
          {crimeReport.crime_type && (
            <p>
              <strong>Type:</strong> {capitalizeFirst(crimeReport.crime_type)}
            </p>
          )}
          {crimeReport.datetime && (
            <p>
              <strong>When:</strong> {capitalizeFirst(crimeReport.datetime)}
            </p>
          )}
          {crimeReport.location && (
            <p>
              <strong>Location:</strong> {capitalizeFirst(crimeReport.location)}
            </p>
          )}
          {crimeReport.coordinates && (
            <>
              <p>
                <strong>Latitude:</strong> {String(crimeReport.coordinates.lat)}
              </p>
              <p>
                <strong>Longitude:</strong> {String(crimeReport.coordinates.lng)}
              </p>
            </>
          )}
          {crimeReport.weather && (
            <p>
              <strong>Weather:</strong> {capitalizeFirst(crimeReport.weather)}
            </p>
          )}
          {crimeReport.vehicles && crimeReport.vehicles.length > 0 && (
            <p>
              <strong>Vehicles:</strong> {capitalizeFirst(crimeReport.vehicles.join(", "))}
            </p>
          )}
        </section>

        {/* Suspect Details */}
        {crimeReport.suspect && (
          <section className={styles.suspectInfo}>
            <strong>Suspect Details:</strong>
            {crimeReport.suspect.gender && (
              <p>Gender: {capitalizeFirst(crimeReport.suspect.gender)}</p>
            )}
            {crimeReport.suspect.age && (
              <p>Age: {capitalizeFirst(crimeReport.suspect.age)}</p>
            )}
            {crimeReport.suspect.hair && (
              <p>Hair: {capitalizeFirst(crimeReport.suspect.hair)}</p>
            )}
            {crimeReport.suspect.clothing && (
              <p>Clothing: {capitalizeFirst(crimeReport.suspect.clothing)}</p>
            )}
            {crimeReport.suspect.features && (
              <p>Features: {capitalizeFirst(crimeReport.suspect.features)}</p>
            )}
            {crimeReport.suspect.height && (
              <p>Height: {capitalizeFirst(crimeReport.suspect.height)}</p>
            )}
            {crimeReport.suspect.weight && (
              <p>Weight: {capitalizeFirst(crimeReport.suspect.weight)}</p>
            )}
            {crimeReport.suspect.tattoos && (
              <p>Tattoos: {capitalizeFirst(crimeReport.suspect.tattoos)}</p>
            )}
            {crimeReport.suspect.scars && (
              <p>Scars: {capitalizeFirst(crimeReport.suspect.scars)}</p>
            )}
            {crimeReport.suspect.accent && (
              <p>Accent: {capitalizeFirst(crimeReport.suspect.accent)}</p>
            )}
          </section>
        )}

        {/* Weapon / Evidence / Cameras / Injuries / Damage */}
        <section className={styles.evidenceInfo}>
          {crimeReport.weapon && (
            <p>
              <strong>Weapon:</strong> {capitalizeFirst(crimeReport.weapon)}
            </p>
          )}

          {crimeReport.evidenceObservations && crimeReport.evidenceObservations.trim() ? (
            <p>
              <strong>Evidence:</strong> {capitalizeFirst(crimeReport.evidenceObservations)}
            </p>
          ) : crimeReport.evidence ? (
            <p>
              <strong>Evidence:</strong> {capitalizeFirst(crimeReport.evidence)}
            </p>
          ) : null}

          {crimeReport.cameras && crimeReport.cameras.length > 0 && (
            <p>
              <strong>Cameras:</strong> {capitalizeFirst(crimeReport.cameras.join(", "))}
            </p>
          )}
          {crimeReport.injuries && (
            <p>
              <strong>Injuries:</strong> {capitalizeFirst(crimeReport.injuries)}
            </p>
          )}
          {crimeReport.propertyDamage && (
            <p>
              <strong>Property Damage:</strong> {capitalizeFirst(crimeReport.propertyDamage)}
            </p>
          )}
        </section>

        {/* Witnesses */}
        {crimeReport.witnesses && crimeReport.witnesses.length > 0 && (
          <section className={styles.witnessInfo}>
            <strong>Witnesses:</strong>
            {crimeReport.witnesses.map((w, i) => (
              <p key={i}>
                {capitalizeFirst(w.name)}
                {w.contact ? ` (Contact: ${capitalizeFirst(w.contact)})` : ""}
              </p>
            ))}
          </section>
        )}

        {/* Incident Description */}
        {crimeReport.incidentDescription && (
          <section className={styles.incidentInfo}>
            <p>
              <strong>Incident Description:</strong>{" "}
              {capitalizeFirst(crimeReport.incidentDescription)}
            </p>
          </section>
        )}

        {/* Download Button */}
        <button className="button-common centered" onClick={downloadPDFReport}>
          📥 Download PDF Report
        </button>
      </div>

      <div className={styles.chatContainer}>
        <Chat
          functionCallHandler={async (toolCall) => {
            const resultJson = await functionCallHandler(toolCall);
            return resultJson;
          }}
          initialMessages={initialMessages}
          onConversationUpdated={(newLog) => {
            setConversationLog(newLog);
          }}
        />
      </div>
    </main>
  );
}