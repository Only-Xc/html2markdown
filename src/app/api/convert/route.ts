import { NextRequest, NextResponse } from "next/server";
import { convert } from "@/lib/converter";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || typeof (body as { html?: unknown }).html !== "string") {
    return NextResponse.json({ error: "Missing required field: html (string)" }, { status: 400 });
  }

  const { html } = body as { html: string };
  const markdown = convert(html);

  return NextResponse.json({ markdown });
}
