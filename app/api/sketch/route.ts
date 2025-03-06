import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

export async function POST(req: NextRequest) {
  try {
    // Parse the JSON body from the request
    const { gender, age, hair, clothing, features, refinements } = await req.json();

    // Create the OpenAI client on the server
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_IMAGE_KEY, // or your chosen env var
    });

    // Build a descriptive prompt from the user-provided details
    const promptParts: string[] = [];
    if (gender) promptParts.push(`Gender: ${gender}`);
    if (age) promptParts.push(`Age: ${age}`);
    if (hair) promptParts.push(`Hair: ${hair}`);
    if (clothing) promptParts.push(`Clothing: ${clothing}`);
    if (features) promptParts.push(`Distinctive features: ${features}`);
    if (refinements) promptParts.push(`Additional notes: ${refinements}`);

    // Refined prompt to encourage a more photorealistic style
    const finalPrompt = `
      Create an extremely photorealistic, full-color portrait of a single person from the shoulders up. 
      The image should have lifelike skin texture, cinematic lighting, and be rendered in ultra-high definition (4K or above).
      The subject is facing the camera, with sharp focus on facial details (wrinkles, pores, etc.). 
      The background is neutral and softly blurred, ensuring the subject is the focal point. 
      The style should mimic professional studio photography, with a shallow depth of field and soft, even lighting.
      No text or watermarks in the image.

      Subject Details:
      ${promptParts.join(". ")}.
    `;

    // Log the final prompt for debugging
    console.log("🟨 [route.ts] DALL-E final prompt =>", finalPrompt);

    // Use openai.images.generate() in v4
    const response = await openai.images.generate({
      prompt: finalPrompt,
      n: 1,
      size: "512x512",
    });

    // Grab the first (only) image URL
    const imageUrl = response.data[0].url;
    console.log("🟨 [route.ts] DALL-E imageUrl =>", imageUrl);

    // Return the ephemeral link in JSON
    return NextResponse.json({
      success: true,
      suspectSketchUrl: imageUrl, // Keeping the same key for front-end compatibility
    });
  } catch (error: any) {
    console.error("🟥 [route.ts] Error generating DALL-E image:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error generating image",
        error: error.message || String(error),
      },
      { status: 500 }
    );
  }
}
