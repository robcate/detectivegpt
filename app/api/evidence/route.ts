import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createWriteStream } from "fs";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
  try {
    console.log("🟨 [api/evidence] Upload handler invoked...");

    // 1) Build a base URL from the request
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    // 2) Ensure "uploads" folder exists
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
      console.log("🟨 [api/evidence] Created 'uploads' folder:", uploadsDir);
    }

    // 3) Parse multipart form data
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    console.log("🟨 [api/evidence] Received files =>", files.map((f) => f.name));

    const fileUrls: string[] = [];

    // 4) Write each file to disk
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uniqueName = nanoid() + "_" + file.name;
      const filePath = path.join(uploadsDir, uniqueName);

      await new Promise<void>((resolve, reject) => {
        const stream = createWriteStream(filePath);
        stream.write(buffer);
        stream.end();
        stream.on("finish", resolve);
        stream.on("error", reject);
      });

      // 5) Return a FULL URL => "http(s)://host/uploads/uniqueName"
      const fullUrl = `${baseUrl}/uploads/${uniqueName}`;
      fileUrls.push(fullUrl);
    }

    console.log("🟨 [api/evidence] Wrote =>", fileUrls);
    return NextResponse.json({ success: true, fileUrls });
  } catch (err: any) {
    console.error("🟥 [api/evidence] Upload error =>", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
