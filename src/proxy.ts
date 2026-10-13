import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

const APP_PREFIXES = ["/dashboard", "/connections", "/rules", "/activity", "/settings", "/onboarding"];
const nonDefaultLocales = routing.locales.filter((locale) => locale !== routing.defaultLocale);

function stripLocale(pathname: string) {
  for (const locale of nonDefaultLocales) {
    if (pathname === `/${locale}`) return { locale, path: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, path: pathname.slice(locale.length + 1) };
  }
  return { locale: null, path: pathname };
}

/**
 * 1. next-intl locale routing (`as-needed` prefix).
 * 2. Optimistic auth redirect for app routes: cookie presence only. Real
 *    validation happens in getCurrentUser().
 */
export default function proxy(request: NextRequest) {
  const { locale, path } = stripLocale(request.nextUrl.pathname);
  const isAppRoute = APP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (isAppRoute && !getSessionCookie(request)) {
    const signIn = new URL(`${locale ? `/${locale}` : ""}/sign-in`, request.url);
    signIn.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(signIn);
  }
  return intl(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|monitoring|.*\\..*).*)"],
};
