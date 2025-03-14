"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";
import Chat from "./components/chat";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import jsPDF from "jspdf";
import getVerifiedLocation from "./utils/getLocation";

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

  // (NEW) We'll store weather in a new "Weather" field
  weather?: string;
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

/**
 * (NEW) fetchWeather: A simple function to fetch current weather from OpenWeather
 * You need an OPENWEATHER_API_KEY in your environment. 
 */
async function fetchWeather(lat: number, lon: number, isoDatetime: string): Promise<string> {
  try {
    // For a real "past weather" query, you'd use a different endpoint or a 'timestamp' param. 
    // We'll do a simpler approach for demonstration => current weather. 
    const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY; // or process.env.OPENWEATHER_API_KEY
    if (!apiKey) {
      console.warn("No OPENWEATHER_API_KEY found in env. Returning placeholder weather.");
      return "Weather data not available (no API key).";
    }

    // Example: get current weather
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`;
    console.log("🟨 [fetchWeather] => calling =>", url);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn("🟨 [fetchWeather] => fetch not ok =>", resp.status);
      return "Weather fetch failed.";
    }
    const data = await resp.json();
    // Let's build a short textual summary
    // e.g. "Clear (72°F), humidity 40%"
    const desc = data.weather?.[0]?.description || "unknown";
    const temp = data.main?.temp !== undefined ? `${Math.round(data.main.temp)}°F` : "??°F";
    const humidity = data.main?.humidity !== undefined ? `${data.main.humidity}% humidity` : "";
    const wind = data.wind?.speed !== undefined ? `wind ${Math.round(data.wind.speed)} mph` : "";
    const summaryParts = [desc, temp, humidity, wind].filter(Boolean);
    const summary = summaryParts.join(", ");
    return summary || "No weather data available.";
  } catch (err) {
    console.error("❌ [fetchWeather] Unexpected error =>", err);
    return "Error fetching weather data.";
  }
}

export default function Page() {
  const [crimeReport, setCrimeReport] = useState<CrimeReportData>({});
  const crimeReportRef = useRef(crimeReport);

  useEffect(() => {
    crimeReportRef.current = crimeReport;
  }, [crimeReport]);

  // We'll hold a conversationLog
  const [conversationLog, setConversationLog] = useState("");

  const [initialMessages] = useState([
    {
      role: "assistant" as const,
      content:
        "I'm ready to take your statement about the incident. " +
        "Please describe clearly what happened, including details about the suspect(s), vehicle(s), and any evidence.",
    },
  ]);

  console.log("🟨 [Page] Rendered. Current crimeReport =>", crimeReport);

  /**
   * PDF Generation
   * - Uppercases each value
   * - Wraps text with doc.splitTextToSize so it doesn't run off page
   */
  const downloadPDFReport = () => {
    console.log("🟨 [Page] Generating PDF...");
    const doc = new jsPDF({ unit: "pt", format: "letter" }); // letter: 612 x 792pt
    doc.setFontSize(18);
    doc.text("Detective GPT Crime Report", 306, 40, { align: "center" }); 
    // x=306 => half of 612 (for center alignment on letter width)

    doc.setFontSize(12);
    let yPos = 70;
    const lineSpacing = 16;
    const wrapWidth = 480; // ~6.5" text width, leaving margins

    function addLine(label: string, value: string) {
      if (!value) return;
      // Convert value to uppercase
      const upperValue = value.toUpperCase();
      const line = `${label.toUpperCase()}: ${upperValue}`;

      // Wrap text to avoid overflow
      const wrapped = doc.splitTextToSize(line, wrapWidth);
      wrapped.forEach((wrappedLine) => {
        doc.text(wrappedLine, 60, yPos); // left margin ~60pt
        yPos += lineSpacing;
      });
    }

    // Now we pass each field to addLine
    if (crimeReport.caseNumber) {
      addLine("Case Number", crimeReport.caseNumber);
    }
    if (crimeReport.crime_type) {
      addLine("Type", crimeReport.crime_type);
    }
    if (crimeReport.datetime) {
      addLine("When", crimeReport.datetime);
    }
    if (crimeReport.location) {
      addLine("Location", crimeReport.location);
    }

    if (crimeReport.coordinates) {
      addLine("Latitude", crimeReport.coordinates.lat.toString());
      addLine("Longitude", crimeReport.coordinates.lng.toString());
    }

    if (crimeReport.weather) {
      addLine("Weather", crimeReport.weather);
    }

    if (crimeReport.vehicles && crimeReport.vehicles.length > 0) {
      addLine("Vehicles", crimeReport.vehicles.join(", "));
    }

    if (crimeReport.suspect) {
      if (crimeReport.suspect.gender) addLine("Suspect Gender", crimeReport.suspect.gender);
      if (crimeReport.suspect.age) addLine("Suspect Age", crimeReport.suspect.age);
      if (crimeReport.suspect.hair) addLine("Suspect Hair", crimeReport.suspect.hair);
      if (crimeReport.suspect.clothing) addLine("Suspect Clothing", crimeReport.suspect.clothing);
      if (crimeReport.suspect.features) addLine("Suspect Features", crimeReport.suspect.features);
      if (crimeReport.suspect.height) addLine("Suspect Height", crimeReport.suspect.height);
      if (crimeReport.suspect.weight) addLine("Suspect Weight", crimeReport.suspect.weight);
      if (crimeReport.suspect.tattoos) addLine("Suspect Tattoos", crimeReport.suspect.tattoos);
      if (crimeReport.suspect.scars) addLine("Suspect Scars", crimeReport.suspect.scars);
      if (crimeReport.suspect.accent) addLine("Suspect Accent", crimeReport.suspect.accent);
    }

    if (crimeReport.weapon) {
      addLine("Weapon", crimeReport.weapon);
    }
    if (crimeReport.evidence) {
      addLine("Evidence", crimeReport.evidence);
    }

    if (crimeReport.cameras && crimeReport.cameras.length > 0) {
      addLine("Cameras", crimeReport.cameras.join(", "));
    }

    if (crimeReport.injuries) {
      addLine("Injuries", crimeReport.injuries);
    }
    if (crimeReport.propertyDamage) {
      addLine("Property Damage", crimeReport.propertyDamage);
    }

    if (crimeReport.witnesses && crimeReport.witnesses.length > 0) {
      const witnessStr = crimeReport.witnesses
        .map((w) => (w.contact ? `${w.name} (${w.contact})` : w.name))
        .join("; ");
      addLine("Witnesses", witnessStr);
    }

    if (crimeReport.incidentDescription) {
      addLine("Incident Description", crimeReport.incidentDescription);
    }

    // Footer
    doc.setFontSize(8);
    doc.text(
      `Report generated by DetectiveGPT on ${new Date().toLocaleString()}`,
      306,
      770,
      { align: "center" }
    );

    doc.save("crime_report.pdf");
  };

  /**
   * The main functionCallHandler for "update_crime_report", "approve_incident_description", etc.
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

      // -----------------------
      // TRANSLATION w/ /api/translate
      // -----------------------
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
          return text; // fallback
        }
      };

      // main fields
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

      // suspect
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

      // witnesses
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
          const { success, locationCandidates, singleResult, error } = await getVerifiedLocation(args.location);
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

      // CHRONO + LUXON parse datetime
      if (args.datetime) {
        console.log("🟨 [Page] Attempting to parse user datetime =>", args.datetime);
        const parsedResults = chrono.parse(args.datetime);
        if (parsedResults && parsedResults.length > 0) {
          const bestResult = parsedResults[0];
          const dateObj = bestResult.start.date();
          console.log("🟨 [Page] chrono parsed date =>", dateObj);

          const fallbackTZ = process.env.NEXT_PUBLIC_TIME_ZONE || "America/Chicago";
          const dt = DateTime.fromJSDate(dateObj, { zone: fallbackTZ });
          const isoStr = dt.toISO({ suppressMilliseconds: true });
          console.log("🟨 [Page] chrono => luxon => final =>", isoStr);

          args.datetime = isoStr;
        }
      }

      // (NEW) If we have coordinates + datetime => fetch weather
      //  - For demonstration we only do "current" weather ignoring time 
      //    but you can adapt as needed.
      if (args.coordinates && args.coordinates.lat && args.coordinates.lng) {
        try {
          const lat = args.coordinates.lat;
          const lng = args.coordinates.lng;
          const isoTime = args.datetime || new Date().toISOString(); // fallback to now
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

      // Save to Airtable
      const result = await saveCrimeReportToAirtable(merged);
      if (result.success) {
        console.log("🟨 [Page] Airtable save success => recordId:", result.recordId, "caseNumber:", result.caseNumber);
        setCrimeReport((prev) => ({
          ...prev,
          airtableRecordId: result.recordId,
          caseNumber: result.caseNumber,
        }));

        // Return a short message to the GPT thread 
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

  return (
    <main className={styles.main}>
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
            <p><strong>Latitude:</strong> {crimeReport.coordinates.lat}</p>
            <p><strong>Longitude:</strong> {crimeReport.coordinates.lng}</p>
          </>
        )}

        {/* (NEW) Display weather if present */}
        {crimeReport.weather && (
          <p>
            <strong>Weather:</strong> {crimeReport.weather}
          </p>
        )}

        {crimeReport.vehicles && crimeReport.vehicles.length > 0 && (
          <p><strong>Vehicles:</strong> {crimeReport.vehicles.join(", ")}</p>
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
          <p><strong>Weapon:</strong> {crimeReport.weapon}</p>
        )}
        {crimeReport.evidence && (
          <p><strong>Evidence:</strong> {crimeReport.evidence}</p>
        )}
        {crimeReport.cameras && crimeReport.cameras.length > 0 && (
          <p><strong>Cameras:</strong> {crimeReport.cameras.join(", ")}</p>
        )}
        {crimeReport.injuries && (
          <p><strong>Injuries:</strong> {crimeReport.injuries}</p>
        )}
        {crimeReport.propertyDamage && (
          <p><strong>Property Damage:</strong> {crimeReport.propertyDamage}</p>
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

        <button 
          className="button-common centered" 
          onClick={downloadPDFReport}
        >
          📥 Download PDF Report
        </button>
      </div>

      <div className={styles.chatContainer}>
        <Chat
          functionCallHandler={async (toolCall) => {
            // Chat handles user/assistant messages; we store conversationLog
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
