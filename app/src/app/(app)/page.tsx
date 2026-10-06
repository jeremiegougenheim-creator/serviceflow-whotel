import { redirect } from "next/navigation";
import { getContext } from "@/lib/data/context";
import { homeFor } from "@/lib/nav";

export default async function Index() {
  const ctx = await getContext();
  redirect(homeFor(ctx.role));
}
