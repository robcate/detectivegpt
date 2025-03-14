// utils/getLocation.js

// --------------
// ADDED: Grab environment fallback city/county for location
// --------------
const ENV_FALLBACK_CITY =
  process.env.NEXT_PUBLIC_FALLBACK_CITY || "San Antonio, TX";
const ENV_FALLBACK_COUNTY =
  process.env.NEXT_PUBLIC_FALLBACK_COUNTY || "Bexar County, TX";

/**
 * getVerifiedLocation(placeName, fallbackMode = "city"):
 *
 * 1) Logs placeName.
 * 2) If placeName doesn't mention city/county/state, we append either:
 *    - environment fallback city (if fallbackMode = "city"), or
 *    - environment fallback county (if fallbackMode = "county").
 * 3) Calls your local /api/geocode route => no CORS issues.
 * 4) Returns multiple or single results, or an error.
 */
export default async function getVerifiedLocation(
  placeName,
  fallbackMode = "city"
) {
  console.log(
    `🟨 [utils/getLocation] Called with placeName="${placeName}" and fallbackMode="${fallbackMode}"`
  );

  if (!placeName) {
    console.warn("🟨 [utils/getLocation] No placeName provided!");
    return {
      success: false,
      locationCandidates: [],
      singleResult: null,
      error: "No place name provided",
    };
  }

  // Decide your fallback based on fallbackMode
  // -------------- CHANGED: We now read from environment --------------
  let fallbackString = "";
  if (fallbackMode === "county") {
    fallbackString = ENV_FALLBACK_COUNTY; // e.g. "Bexar County, TX"
  } else {
    fallbackString = ENV_FALLBACK_CITY;   // e.g. "San Antonio, TX"
  }

  // If user doesn't mention that fallback, append it
  let adjustedLocation = placeName.trim();
  const lc = adjustedLocation.toLowerCase();

  // Expand the logic slightly to catch "texas" or "tx" as well:
  if (
    !lc.includes("san antonio") &&
    !lc.includes("bexar") &&
    !lc.includes("texas") &&
    !lc.includes("tx")
  ) {
    adjustedLocation += `, ${fallbackString}`;
    console.log(
      `🟨 [utils/getLocation] Adjusted location => "${adjustedLocation}"`
    );
  }

  // Call your local route
  const url = `/api/geocode?address=${encodeURIComponent(adjustedLocation)}`;
  console.log("🟨 [utils/getLocation] Fetching local route:", url);

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn("🟨 [utils/getLocation] /api/geocode not ok:", resp.status);
      return {
        success: false,
        locationCandidates: [],
        singleResult: null,
        error: "Local geocode route returned error",
      };
    }

    const data = await resp.json();
    console.log("🟨 [utils/getLocation] Received data from local route:", data);

    if (!data.results || !data.results.length) {
      console.warn("🟨 [utils/getLocation] No results from local route");
      return {
        success: false,
        locationCandidates: [],
        singleResult: null,
        error: data.error || "No matches found",
      };
    }

    if (data.results.length > 1) {
      console.log(
        `🟨 [utils/getLocation] Found multiple matches: ${data.results.length}`
      );
      const locationCandidates = data.results.map((r) => ({
        formattedAddress: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      }));
      return {
        success: true,
        locationCandidates,
        singleResult: null,
        error: null,
      };
    }

    // Exactly one match
    const finalLocation = data.results[0];
    console.log(
      "🟨 [utils/getLocation] Single match:",
      finalLocation.formatted_address
    );

    return {
      success: true,
      locationCandidates: [],
      singleResult: {
        formattedAddress: finalLocation.formatted_address,
        lat: finalLocation.geometry.location.lat,
        lng: finalLocation.geometry.location.lng,
      },
      error: null,
    };
  } catch (err) {
    console.error("🟥 [utils/getLocation] Exception thrown:", err.message);
    return {
      success: false,
      locationCandidates: [],
      singleResult: null,
      error: "Exception thrown in getLocation fetch",
    };
  }
}