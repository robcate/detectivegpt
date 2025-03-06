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

    // Collect user inputs into a single array
    const subjectDescriptionParts: string[] = [];
    if (gender) subjectDescriptionParts.push(`they are ${gender}`);
    if (age) subjectDescriptionParts.push(`approximately ${age} years old`);
    if (hair) subjectDescriptionParts.push(`with ${hair} hair`);
    if (clothing) subjectDescriptionParts.push(`wearing ${clothing}`);
    if (features) subjectDescriptionParts.push(`distinctive features include ${features}`);
    if (refinements) subjectDescriptionParts.push(`${refinements}`);

    // Join them into a single phrase
    const subjectDescription = subjectDescriptionParts.length
      ? subjectDescriptionParts.join(", ")
      : "with no specific additional details";

    // Construct the final prompt
    const finalPrompt = `
      You are a highly skilled portrait photographer. 
      Generate one extremely realistic, full-color, single head-and-shoulders portrait of a person facing the camera. 
      They have the following key details: 
      - ${gender || "male"}, around ${age || "20s"} 
      - ${hair || "short blond hair"} 
      - ${features || "brown eyes, freckles on the nose, pointy nose, larger lips"} 

      The subject is posed against a plain, softly blurred, neutral background (light gray or off-white) so the face is the clear focus. 
      Shot on a high-end DSLR camera at 50mm, f/2.8, ISO 100, with even lighting. 
      Skin texture, facial hair, pores, and lighting must be lifelike, as if captured in a real photograph. 
      No stylized effects, no collages, no text, and no watermarks. 
      This should look indistinguishable from an authentic studio portrait. 
  `.trim();


    console.log("🟨 [route.ts] DALL-E final prompt =>", finalPrompt);

    // Call the OpenAI Images API
    const response = await openai.images.generate({
      prompt: finalPrompt,
      n: 1,
      size: "512x512",
    });

    // Get the URL of the generated image
    const imageUrl = response.data[0].url;
    console.log("🟨 [route.ts] DALL-E imageUrl =>", imageUrl);

    // Return the ephemeral link in JSON
    return NextResponse.json({
      success: true,
      suspectSketchUrl: imageUrl,
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
