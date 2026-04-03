import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import fs from "fs/promises";
import path from "path";

// Simple file-based storage for MVP (replace with Vercel KV in production)
const STORE_PATH = path.join(process.cwd(), ".designs.json");

async function readStore(): Promise<Record<string, unknown>> {
  try {
    const data = await fs.readFile(STORE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeStore(store: Record<string, unknown>) {
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

export async function POST(request: NextRequest) {
  const config = await request.json();
  const id = config.id || nanoid(10);

  const store = await readStore();
  store[id] = {
    ...config,
    id,
    updatedAt: new Date().toISOString(),
    createdAt: config.createdAt || new Date().toISOString(),
  };
  await writeStore(store);

  return NextResponse.json({ id });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const store = await readStore();
  const config = store[id];

  if (!config) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(config);
}
