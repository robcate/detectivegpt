import { NextResponse } from "next/server";

/**
 * A Next.js App Router "route handler" for geocoding. 
 * Calls Google Geocoding or fallback to Places, logs everything.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    console.log("🟨 [app/api/geocode] Called with address:", address);

    if (!address) {
      console.warn("🟨 [app/api/geocode] No address provided");
      return NextResponse.json(
        { error: "Address is required", results: [] },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("🟥 [app/api/geocode] Missing GOOGLE_MAPS_API_KEY");
      return NextResponse.json(
        { error: "Google Maps API key not configured", results: [] },
        { status: 500 }
      );
    }

    // Attempt Geocoding
    const encoded = encodeURIComponent(address);
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;
    console.log("🟨 [app/api/geocode] Geocode URL:", geocodeUrl);

    let geocodeResp = await fetch(geocodeUrl);
    if (!geocodeResp.ok) {
      console.warn("🟨 [app/api/geocode] Geocode fetch not ok:", geocodeResp.status);
      return NextResponse.json(
        { error: "Failed to fetch from Google Geocoding", results: [] },
        { status: 500 }
      );
    }

    let geocodeData = await geocodeResp.json();
    console.log("🟨 [app/api/geocode] Geocode status:", geocodeData.status);

    let results = geocodeData.results || [];

    // If no results, fallback to Places
    if (geocodeData.status !== "OK" || !results.length) {
      console.warn("🟨 [app/api/geocode] Geocoding returned no results. Trying Places...");
      const placeUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encoded}&key=${apiKey}`;
      console.log("🟨 [app/api/geocode] Places URL:", placeUrl);

      const placeResp = await fetch(placeUrl);
      if (!placeResp.ok) {
        console.warn("🟨 [app/api/geocode] Places fetch not ok:", placeResp.status);
        return NextResponse.json(
          { error: "Failed to fetch from Google Places", results: [] },
          { status: 500 }
        );
      }

      const placeData = await placeResp.json();
      console.log("🟨 [app/api/geocode] Places status:", placeData.status);
      results = placeData.results || [];
    }

    if (!results.length) {
      console.warn("🟨 [app/api/geocode] No results after fallback");
      return NextResponse.json(
        { error: "No matches found for that location", results: [] },
        { status: 200 }
      );
    }

    console.log(`🟨 [app/api/geocode] Returning ${results.length} match(es)`);
    return NextResponse.json({
      error: null,
      results,
    });
  } catch (error: any) {
    console.error("🟥 [app/api/geocode] Exception:", error.message);
    return NextResponse.json(
      { error: "Exception thrown while fetching location data", results: [] },
      { status: 500 }
    );
  }
}
