"use client";

import React, { useState } from "react";
import styles from "./shared/page.module.css";
import Chat from "./components/chat";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";


interface SuspectDetails {
  gender?: string;
  age?: string;
  hair?: string;
  clothing?: string;
  features?: string;
}

interface CrimeReportData {
  crime_type?: string;
  datetime?: string;
  location?: string;
  suspect?: SuspectDetails;
  vehicle?: string;
  weapon?: string;
  evidence?: string;
}

const FunctionCalling = () => {
  const [crimeReport, setCrimeReport] = useState<CrimeReportData>({});

  const functionCallHandler = async (call: RequiredActionFunctionToolCall) => {
    if (!call?.function?.name) return;

    if (call.function.name === "update_crime_report") {
      const args = JSON.parse(call.function.arguments) as CrimeReportData;

      console.log("Received update_crime_report call:", args);

      setCrimeReport((prev) => ({
        ...prev,
        ...args,
      }));

      return JSON.stringify({
        success: true,
        message: "Crime report updated",
        updatedFields: args,
      });
    }

    return;
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.column}>
          <div style={{ marginTop: "1rem" }}>
            <h3>Crime Report</h3>
            <p><strong>Type:</strong> {crimeReport.crime_type || "N/A"}</p>
            <p><strong>When:</strong> {crimeReport.datetime || "N/A"}</p>
            <p><strong>Location:</strong> {crimeReport.location || "N/A"}</p>

            {crimeReport.suspect && (
              <div>
                <strong>Suspect Details:</strong>
                <p>Gender: {crimeReport.suspect.gender || "N/A"}</p>
                <p>Age: {crimeReport.suspect.age || "N/A"}</p>
                <p>Hair: {crimeReport.suspect.hair || "N/A"}</p>
                <p>Clothing: {crimeReport.suspect.clothing || "N/A"}</p>
                <p>Features: {crimeReport.suspect.features || "N/A"}</p>
              </div>
            )}

            <p><strong>Vehicle:</strong> {crimeReport.vehicle || "N/A"}</p>
            <p><strong>Weapon:</strong> {crimeReport.weapon || "N/A"}</p>
            <p><strong>Evidence:</strong> {crimeReport.evidence || "N/A"}</p>
          </div>
        </div>

        <div className={styles.chatContainer}>
          <div className={styles.chat}>
            <Chat functionCallHandler={functionCallHandler} />
          </div>
        </div>
      </div>
    </main>
  );
};

export default FunctionCalling;