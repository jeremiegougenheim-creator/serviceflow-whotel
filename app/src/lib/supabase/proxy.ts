import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./env";

const PUBLIC_PATHS = ["/login", "/auth", "/api/jobs", "/api/health", "/manifest.webmanifest", "/icons", "/welcome"];

/** Set by the proxy after it has validated the session, read by getContext() so the page does not validate it a second time. Never trusted from the client: the proxy overwrites it on every request. */
export const USER_ID_HEADER = "x-sf-user-id";
export const USER_EMAIL_HEADER = "x-sf-user-email";

/** Refreshes the Supabase session cookie on every request and sends signed-out visitors to /login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the token with the Auth server; getSession() would trust the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Pass the validated user to the server components (one Auth round-trip per request, not two).
  const headers = new Headers(request.headers);
  headers.delete(USER_ID_HEADER);
  headers.delete(USER_EMAIL_HEADER);
  if (user) {
    headers.set(USER_ID_HEADER, user.id);
    if (user.email) headers.set(USER_EMAIL_HEADER, user.email);
  }
  const forwarded = NextResponse.next({ request: { headers } });
  response.cookies.getAll().forEach((c) => forwarded.cookies.set(c));
  return forwarded;
}
