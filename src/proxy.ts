import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic routing on the session cookie only; real authorization is requireUser() in the data layer.
export function proxy(request: NextRequest) {
  const hasCookie = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;
  // Signed-in visitors go straight to the app; everyone else sees the landing page.
  if (pathname === "/") return hasCookie ? NextResponse.redirect(new URL("/app", request.url)) : NextResponse.next();
  if (!hasCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/app/:path*"] };
