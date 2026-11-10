"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold text-gray-900">Algo falló.</h1>
      <button
        type="button"
        onClick={() => reset()}
        className="min-h-[44px] rounded-lg bg-loloteal px-5 text-sm font-semibold text-white active:bg-loloteal-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-loloteal focus-visible:ring-offset-2"
      >
        Reintentar
      </button>
    </main>
  );
}
