import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth";

// Routes publiques : la page de login et l'API listings (protégée par le
// secret Bearer, pas par le cookie d'accès au site).
function isPublic(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === (await expectedToken())) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
