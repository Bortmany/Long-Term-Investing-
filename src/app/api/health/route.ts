import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Always answers 200. `db` tells you whether the database is reachable.
export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  return NextResponse.json({ status: "ok", db });
}
