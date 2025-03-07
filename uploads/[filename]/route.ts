// app/uploads/[filename]/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filePath = path.join(process.cwd(), "uploads", params.filename);

    if (!fs.existsSync(filePath)) {
      return new NextResponse("File not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    // Basic content-type detection by extension
    const ext = path.extname(filePath).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".mp4") contentType = "video/mp4";
    // etc. for more file types

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    console.error("Error serving file =>", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
