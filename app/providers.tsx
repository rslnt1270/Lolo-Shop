"use client";
import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "framer-motion";
export default function Providers({ children }: { children: React.ReactNode }) {
  // reducedMotion="user": respeta prefers-reduced-motion en todas las animaciones de transform.
  return (
    <MotionConfig reducedMotion="user">
      <SessionProvider>{children}</SessionProvider>
    </MotionConfig>
  );
}
