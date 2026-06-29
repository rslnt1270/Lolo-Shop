export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/((?!login|api/auth|manifest.json|icons|sw.js|workbox|_next).*)"],
};
