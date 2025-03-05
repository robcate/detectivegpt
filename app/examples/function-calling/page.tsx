"use client";

import React, { useState } from "react";
import styles from "../shared/page.module.css";
import Chat from "../../components/chat";
import WeatherWidget from "../../components/weather-widget";
import { getWeather } from "../../utils/weather";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

// We’ll store Weather data in its own interface:
interface WeatherData {
  location?: string;
  temperature?: number;
  conditions?: string;
}

// Match your crime function schema. All fields optional, since "required": [].
interface SuspectDetails {
  gender?: string;
  age?: string;
  hair?: string;
  clothing?: string;
  features?: string;
}

// This matches the top-level "properties" in your JSON schema
interface CrimeReportData {
  crime_type?: string;
  datetime?: string;
  location?: string;
  suspect?: SuspectDetails;
  vehicle?: string;
  weapon?: string;
  evidence?: string;
}

// Main component for function-calling example
const FunctionCalling = () => {
  // For weather
  const [weatherData, setWeatherData] = useState<WeatherData>({});
  const isEmptyWeather = Object.keys(weatherData).length === 0;

  // For crime data, we store one “report” in state (or you could store an array)
  const [crimeReport, setCrimeReport] = useState<CrimeReportData>({});

  // The functionCallHandler is where we handle *any* function calls
  const functionCallHandler = async (call: RequiredActionFunctionToolCall) => {
    if (!call?.function?.name) return;

    // 1) If it's "get_weather"
    if (call.function.name === "get_weather") {
      const args = JSON.parse(call.function.arguments); // { location: "San Francisco", ... }
      const data = getWeather(args.location); 
      setWeatherData(data);

      // Return the result as a JSON string
      return JSON.stringify(data);
    }

    // 2) If it's "update_crime_report"
    if (call.function.name === "update_crime_report") {
      // The Assistant may call with fields like crime_type, datetime, etc.
      const args = JSON.parse(call.function.arguments) as CrimeReportData;

      console.log("Received update_crime_report call:", args);

      // Store these details in state:
      setCrimeReport((prev) => ({
        ...prev,
        ...args,
        // Merge in the new fields from the call
      }));

      // Return something meaningful back to the Assistant
      return JSON.stringify({
        success: true,
        message: "Crime report updated",
        updatedFields: args
      });
    }

    // Otherwise do nothing
    return;
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Left column: Weather widget and crime report summary */}
        <div className={styles.column}>
          <WeatherWidget
            location={weatherData.location || "---"}
            temperature={weatherData.temperature?.toString() || "---"}
            conditions={weatherData.conditions || "Sunny"}
            isEmpty={isEmptyWeather}
          />

          {/* Display partial or full crime report info */}
          <div style={{ marginTop: "1rem" }}>
            <h3>Crime Report</h3>
            <p>Type: {crimeReport.crime_type || "N/A"}</p>
            <p>When: {crimeReport.datetime || "N/A"}</p>
            <p>Location: {crimeReport.location || "N/A"}</p>
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
            <p>Vehicle: {crimeReport.vehicle || "N/A"}</p>
            <p>Weapon: {crimeReport.weapon || "N/A"}</p>
            <p>Evidence: {crimeReport.evidence || "N/A"}</p>
          </div>
        </div>

        {/* Right column: The chat */}
        <div className={styles.chatContainer}>
          <div className={styles.chat}>
            {/* We pass functionCallHandler to the Chat component so it can run our code when a function is called */}
            <Chat functionCallHandler={functionCallHandler} />
          </div>
        </div>
      </div>
    </main>
  );
};

export default FunctionCalling;
