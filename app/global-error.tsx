"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-MX">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {/* Altura real (dvh) con respaldo en vh; globals.css puede no estar cargado aquí. */}
        <style>{".lolo-global-error{min-height:100vh;min-height:100dvh}"}</style>
        <main className="lolo-global-error" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>Algo falló.</h1>
          <button
            type="button"
            onClick={() => reset()}
            style={{ minHeight: 44, padding: "0 20px", borderRadius: 8, border: 0, background: "#007272", color: "#fff", fontWeight: 600, fontSize: 14 }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
