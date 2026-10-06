import { Lockup } from "@/components/icons";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; sent?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-6 py-12">
      <div className="mb-10">
        <Lockup />
      </div>
      <h1 className="text-[34px] leading-tight">
        Tomorrow&rsquo;s plan,
        <br />
        <em>built tonight.</em>
      </h1>
      <p className="muted mt-3 text-[14px]">Sign in with the email your hotel invited. We send a one-time link; no password to remember.</p>
      <LoginForm next={sp.next ?? "/"} error={sp.error} sent={sp.sent === "1"} />
      <p className="muted mt-10 text-[12px]">ServiceFlow by SparkEdge · the data stays in your hotel&rsquo;s own database.</p>
    </main>
  );
}
