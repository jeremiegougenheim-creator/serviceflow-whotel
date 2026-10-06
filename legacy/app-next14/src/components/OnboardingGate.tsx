"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/welcome") return;
    try {
      if (!localStorage.getItem("onboarded")) {
        router.replace("/welcome");
      }
    } catch {}
  }, [pathname, router]);

  return null;
}
