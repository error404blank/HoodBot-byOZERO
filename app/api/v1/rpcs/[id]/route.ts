import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/src/db";
import { customRpcs } from "@/src/db/schema";
import { getSessionUser } from "@/lib/session";

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  await db.delete(customRpcs).where(
    and(eq(customRpcs.id, Number(id)), eq(customRpcs.userId, user.id))
  );
  return NextResponse.json({ ok: true });
}
