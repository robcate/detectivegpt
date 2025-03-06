// utils/getLocation.js

import axios from "axios";

/**
 * getVerifiedLocation(placeName)
 * 
 * 1) Logs extensively to see exactly what's happening.
 * 2) Appends a default city/state if not mentioned.
 * 3) Attempts Google Geocoding first, then Google Places Text Search if no results.
 * 4) Returns singleResult or locationCandidates for multiple matches.
 * 5) Return shape:
 *    {
 *      success: boolean,
 *      locationCandidates: Array<{ formattedAddress, lat, lng }>,
 *      singleResult: { formattedAddress, lat, lng } | null,
 *      error: string | null
 *    }
 */
export async function getVerifiedLocation(placeName) {
  console.log(`🟨 [getVerifiedLocation] Called with placeName="${placeName}"`);

  // 1) If placeName is missing
  if (!placeName) {
    console.warn("🟨 [getVerifiedLocation] No placeName provided!");
    return {
      success: false,
      locationCandidates: [],
      singleResult: null,
      error: "No place name provided",
    };
  }

  // 2) Append fallback city/state if not included
  let adjustedLocation = placeName.trim();
  const fallbackCity = "Springfield";
  const fallbackState = "IL";
  const lc = adjustedLocation.toLowerCase();

  if (!lc.includes(fallbackCity.toLowerCase()) && !lc.includes(fallbackState.toLowerCase())) {
    adjustedLocation += `, ${fallbackCity}, ${fallbackState}`;
    console.log(`🟨 [getVerifiedLocation] Adjusted location to: "${adjustedLocation}"`);
  }

  try {
    // 3) Attempt Google Geocoding
    console.log("🟨 [getVerifiedLocation] Attempting Google Geocoding...");
    let response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: {
        address: adjustedLocation,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
      timeout: 8000,
    });

    let data = response.data;
    console.log("🟨 [getVerifiedLocation] Geocoding response status:", data.status);
    let results = data.results || [];

    // If no results or status not OK, fallback to Places
    if (data.status !== "OK" || !results.length) {
      console.warn(`🟨 [getVerifiedLocation] Geocoding returned no results. Trying Places Text Search...`);
      response = await axios.get("https://maps.googleapis.com/maps/api/place/textsearch/json", {
        params: {
          query: adjustedLocation,
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
        timeout: 8000,
      });

      data = response.data;
      results = data.results || [];
      console.log("🟨 [getVerifiedLocation] Places response status:", data.status);
    }

    if (!results.length) {
      console.warn("🟨 [getVerifiedLocation] Still no results after Places fallback!");
      return {
        success: false,
        locationCandidates: [],
        singleResult: null,
        error: "No matches found for that location",
      };
    }

    // 4) If multiple matches
    if (results.length > 1) {
      console.log(`🟨 [getVerifiedLocation] Found multiple matches: ${results.length}`);
      const locationCandidates = results.map((r) => ({
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

    // 5) Exactly one match
    const finalLocation = results[0];
    console.log(`🟨 [getVerifiedLocation] Single match: ${finalLocation.formatted_address}`);
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
    console.error("🟥 [getVerifiedLocation] Exception thrown:", err.message);
    return {
      success: false,
      locationCandidates: [],
      singleResult: null,
      error: "Exception thrown while fetching location data",
    };
  }
}

export default getVerifiedLocation;
