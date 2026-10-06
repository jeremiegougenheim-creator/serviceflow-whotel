import { Lockup } from "@/components/icons";

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-6">
      <Lockup />
      <h1 className="mt-8 text-[28px]">No connection.</h1>
      <p className="muted mt-2 text-[14px]">The last plan you opened is still on this phone. Logs will send when the signal is back.</p>
    </main>
  );
}
