import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Card, Empty, ScreenHead } from "@/components/ui";
import { markNotificationsRead } from "@/lib/actions/ops";
import { getContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(40);
  const list = data ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <>
      <ScreenHead hi={<>Notifications</>} sub={unread ? `${unread} unread` : "all read"} />
      {unread ? <ActionButton variant="ghost" action={markNotificationsRead} label="Mark all read" done="All read" /> : null}
      <div className="mt-4">
        {list.length ? (
          <Card>
            {list.map((n) => (
              <Link key={n.id} href={n.href ?? "/"} className="row hover:bg-navy-mid/40">
                <div className="t min-w-0">
                  <b className={n.read_at ? "!text-mist" : ""}>{n.title}</b>
                  <span>{n.body}</span>
                </div>
                <span className="muted shrink-0 text-[12px]">{new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: ctx.property.timezone }) === new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: ctx.property.timezone }) ? new Date(n.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ctx.property.timezone }) : new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: ctx.property.timezone })}</span>
              </Link>
            ))}
          </Card>
        ) : (
          <Empty>The brief arrives here every evening, the dawn update before service, and the debrief after it.</Empty>
        )}
      </div>
    </>
  );
}
