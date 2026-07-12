import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/src/db";
import { customRpcs } from "@/src/db/schema";
import { getSessionUser } from "@/lib/session";

const DEFAULT_RPCS = [
  { chainId: 1,    chainName: "Ethereum",       name: "Llamarpc",         url: "https://eth.llamarpc.com" },
  { chainId: 1,    chainName: "Ethereum",       name: "Cloudflare",       url: "https://cloudflare-eth.com" },
  { chainId: 4663, chainName: "Robinhood Chain", name: "Official RPC",    url: "https://rpc.mainnet.chain.robinhood.com" },
  { chainId: 8453, chainName: "Base",            name: "Base Official",   url: "https://mainnet.base.org" },
  { chainId: 8453, chainName: "Base",            name: "Llamarpc Base",   url: "https://base.llamarpc.com" },
];

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rpcs = await db.query.customRpcs.findMany({
    where: eq(customRpcs.userId, user.id),
    orderBy: (t, { asc }) => [asc(t.chainId), asc(t.createdAt)],
  });

  // Seed default RPCs for new users
  if (rpcs.length === 0) {
    const rows = DEFAULT_RPCS.map((r, i) => ({
      ...r,
      userId: user.id,
      isDefault: i === 0 || r.chainId === 4663 || (r.chainId === 8453 && r.name === "Base Official"),
    }));
    // Set only one default per chain
    const seenDefault = new Set<number>();
    for (const row of rows) {
      row.isDefault = !seenDefault.has(row.chainId);
      if (row.isDefault) seenDefault.add(row.chainId);
    }
    await db.insert(customRpcs).values(rows);
    rpcs = await db.query.customRpcs.findMany({ where: eq(customRpcs.userId, user.id) });
  }

  return NextResponse.json({ rpcs });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { chainId: number; chainName: string; name: string; url: string; isDefault?: boolean };
  const { chainId, chainName, name, url, isDefault = false } = body;

  if (!chainId || !chainName || !name || !url) {
    return NextResponse.json({ error: "chainId, chainName, name, url required" }, { status: 400 });
  }

  // If setting as default, unset others for this chain
  if (isDefault) {
    await db.update(customRpcs)
      .set({ isDefault: false })
      .where(and(eq(customRpcs.userId, user.id), eq(customRpcs.chainId, chainId)));
  }

  const [rpc] = await db.insert(customRpcs)
    .values({ userId: user.id, chainId, chainName, name, url, isDefault })
    .returning();

  return NextResponse.json({ rpc });
}
