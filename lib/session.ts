import { NextRequest } from "next/server";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/src/db";
import { webSessions, users } from "@/src/db/schema";
import type { User } from "@/src/db/schema";

export async function getSessionUser(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get("hoodbot_session")?.value;
  if (!token) return null;

  const now = new Date();
  const session = await db.query.webSessions.findFirst({
    where: and(eq(webSessions.token, token), gt(webSessions.expiresAt, now)),
  });

  if (!session) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  return user ?? null;
}

export async function requireSession(req: NextRequest): Promise<User> {
  const user = await getSessionUser(req);
  if (!user) throw new Error("Unauthorized");
  return user;
}
