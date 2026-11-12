"use client";
import { Button } from "@/components/ui/Button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold text-gray-900">Algo falló.</h1>
      <Button onClick={() => reset()}>Reintentar</Button>
    </main>
  );
}
