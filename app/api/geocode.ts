// pages/api/geocode.ts

import type { NextApiRequest, NextApiResponse } from "next";

/**
 * A simple route to fetch lat/lng from the Google Maps Geocoding API.
 * Make sure you set GOOGLE_MAPS_API_KEY in .env.local
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { address } = req.query;
    if (!address || typeof address !== "string") {
      return res.status(400).json({ error: "Address is required" });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "Google Maps API key not configured in .env.local" });
    }

    const encoded = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.results?.length > 0) {
      // Return an array of possible matches
      const results = data.results.map((r: any) => ({
        formattedAddress: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      }));
      return res.status(200).json({ results });
    } else {
      // No matches found
      return res.status(404).json({ results: [] });
    }
  } catch (error) {
    console.error("Geocoding error:", error);
    return res.status(500).json({ error: "Failed to fetch geocode data" });
  }
}
