import { Lockup } from "@/components/icons";

export default function Welcome() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center px-6 py-12">
      <Lockup />
      <h1 className="mt-10 text-[30px]">Your hotel has not added you yet.</h1>
      <p className="muted mt-3 text-[14px]">Ask your general manager to invite this email from Set-up → Team. Once the invitation is in, sign in again and the plan is waiting.</p>
      <form action="/auth/signout" method="post" className="mt-8">
        <button className="btn btn-ghost" type="submit">Sign out</button>
      </form>
    </main>
  );
}
