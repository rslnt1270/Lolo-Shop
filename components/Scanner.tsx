"use client";
import { useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

export function Scanner({
  onScan,
}: {
  onScan: (decodedText: string) => void;
}) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scannerRef.current.render(
      (text) => {
        scannerRef.current?.clear();
        onScan(text);
      },
      (error) => {
        // Ignorar errores de escaneo continuo
      }
    );

    return () => {
      scannerRef.current?.clear().catch(console.error);
    };
  }, [onScan]);

  return <div id="reader" className="mx-auto w-full max-w-sm rounded-lg overflow-hidden border"></div>;
}
