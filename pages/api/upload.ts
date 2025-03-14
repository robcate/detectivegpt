// pages/api/upload.ts

import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs";
import { Storage } from "@google-cloud/storage";
import vision from "@google-cloud/vision";
import OpenAI from "openai";

// -------------------- GCS & Vision setup --------------------
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEYFILE_PATH,
});
const bucket = storage.bucket(process.env.GCP_BUCKET_NAME || "my-bucket");

const visionClient = new vision.ImageAnnotatorClient({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEYFILE_PATH,
});

// -------------------- FORCE CLEAN KEY --------------------
let rawKey = process.env.OPENAI_API_KEY || "";
rawKey = rawKey.trim();
rawKey = rawKey.replace(/^Bearer\s+/, "");
rawKey = rawKey.replace(/^"(.*)"$/, "$1");

// Create the OpenAI client
const openai = new OpenAI({
  apiKey: rawKey,
});

/**
 * Provide a thorough but concise observation
 */
async function createObservation(labels: string[]): Promise<string> {
  console.log("🟨 [upload.ts] => createObservation => labels:", labels);

  // We'll allow up to four sentences for more detail
  const labelList = labels.join(", ");
  const prompt = `
You are an advanced photo analyst. The user uploaded an image with these labels: ${labelList}.
In no more than four sentences, thoroughly describe any key details or context visible in the image. 
Maintain a direct, professional style, but provide enough detail to be helpful.
Avoid unobservable speculation or tangents.
  `;

  // If you have GPT-4, you can use model: "gpt-4"
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are an advanced photo analyst." },
      { role: "user", content: prompt },
    ],
    temperature: 0.5, // a bit more creative than 0.3
  });

  const text = response.choices[0]?.message?.content?.trim() || "";
  return text;
}

// -------------------- Next.js config --------------------
export const config = {
  api: {
    bodyParser: false, // Important for Formidable
  },
};

// -------------------- Handler --------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("🟨 [upload.ts] => Incoming request to /api/upload...");
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    // 1) Parse form with formidable
    const { files } = await parseForm(req);

    // 2) Convert single vs multiple
    const fileList = Array.isArray(files.files) ? files.files : [files.files];
    console.log("🟨 [upload.ts] => Total files:", fileList.length);

    const fileUrls: string[] = [];
    const observations: string[] = [];

    // 3) Upload each file to GCS & optionally analyze
    for (const file of fileList) {
      if (!file) continue;

      console.log("🟨 [upload.ts] => Uploading file:", file.originalFilename);
      const publicUrl = await uploadFileToGCS(file);
      fileUrls.push(publicUrl);

      // If it's an image, do Vision + GPT
      if ((file.mimetype || "").startsWith("image/")) {
        const labelDescriptions = await analyzeImage(publicUrl);
        const labelsArray = labelDescriptions.split(", ").map((s) => s.trim());
        const shortObservation = await createObservation(labelsArray);
        observations.push(shortObservation);
      } else {
        console.log("🟨 [upload.ts] => Skipping for non-image:", file.mimetype);
        observations.push("No observation (not an image).");
      }
    }

    console.log("🟨 [upload.ts] => All files processed => returning JSON...");
    return res.json({
      success: true,
      fileUrls,
      observations,
    });
  } catch (err: any) {
    console.error("🟥 [upload.ts] => Unexpected error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// -------------------- parseForm Helper --------------------
function parseForm(req: NextApiRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: true,
      maxFileSize: 2 * 1024 * 1024 * 1024,
      uploadDir: "/tmp",
      keepExtensions: true,
    });

    form.on("progress", (bytesReceived, bytesExpected) => {
      console.log(`🟨 [upload.ts] => progress: ${bytesReceived} / ${bytesExpected}`);
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error("🟥 [upload.ts] => Formidable error:", err);
        return reject(err);
      }
      resolve({ fields, files });
    });
  });
}

// -------------------- uploadFileToGCS Helper --------------------
function uploadFileToGCS(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const safeFilename = file.originalFilename || "upload";
    const destination = `uploads/${timestamp}_${safeFilename}`;

    const gcsFile = bucket.file(destination);
    console.log("🟨 [upload.ts] => Writing file =>", destination);

    fs.createReadStream(file.filepath)
      .pipe(
        gcsFile.createWriteStream({
          resumable: false,
          contentType: file.mimetype || undefined,
        })
      )
      .on("error", (err) => {
        console.error("🟥 [upload.ts] => GCS upload error:", err);
        reject(err);
      })
      .on("finish", async () => {
        try {
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
          console.log("🟨 [upload.ts] => File uploaded =>", publicUrl);
          resolve(publicUrl);
        } catch (err) {
          console.error("🟥 [upload.ts] => Error making file public:", err);
          reject(err);
        }
      });
  });
}

// -------------------- analyzeImage (Vision) Helper --------------------
async function analyzeImage(publicUrl: string): Promise<string> {
  console.log("🟨 [upload.ts] => Analyzing image =>", publicUrl);
  try {
    // We request both label detection AND object localization
    const [result] = await visionClient.annotateImage({
      image: { source: { imageUri: publicUrl } },
      features: [
        { type: "LABEL_DETECTION", maxResults: 20 },
        { type: "OBJECT_LOCALIZATION" },
      ],
    });

    const labelAnnotations = result.labelAnnotations || [];
    const objectAnnotations = result.localizedObjectAnnotations || [];

    // Convert label descriptions to string
    const labelDescs = labelAnnotations.map((l) => l.description);
    // Convert object names to string
    const objectNames = objectAnnotations.map((o) => o.name);

    console.log("🟨 [upload.ts] => Vision labels =>", labelDescs.join(", "));
    console.log("🟨 [upload.ts] => Vision objects =>", objectNames.join(", "));

    // Combine them all for GPT
    const combined = [...labelDescs, ...objectNames];
    const labelDescriptions = combined.join(", ");

    return labelDescriptions;
  } catch (err) {
    console.error("🟥 [upload.ts] => Vision error:", err);
    return "Analysis failed";
  }
}
