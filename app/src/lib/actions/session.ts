"use server";

import { cookies } from "next/headers";
import { PROPERTY_COOKIE, requireSession } from "@/lib/session";

export async function switchProperty(propertyId: string) {
  const session = await requireSession();
  if (!session.properties.some((p) => p.property.id === propertyId)) throw new Error("not a member of that property");
  const store = await cookies();
  store.set(PROPERTY_COOKIE, propertyId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}
