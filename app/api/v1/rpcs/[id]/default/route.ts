import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/src/db";
import { customRpcs } from "@/src/db/schema";
import { getSessionUser } from "@/lib/session";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  // Find the RPC to get its chainId
  const rpc = await db.query.customRpcs.findFirst({
    where: and(eq(customRpcs.id, Number(id)), eq(customRpcs.userId, user.id)),
  });
  if (!rpc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Unset all defaults for this chain, then set this one
  await db.update(customRpcs)
    .set({ isDefault: false })
    .where(and(eq(customRpcs.userId, user.id), eq(customRpcs.chainId, rpc.chainId)));

  await db.update(customRpcs)
    .set({ isDefault: true })
    .where(eq(customRpcs.id, rpc.id));

  return NextResponse.json({ ok: true });
}
