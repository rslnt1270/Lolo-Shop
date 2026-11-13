"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  onSubmit: (code: string) => void;
  onNoBarcode: () => void;
  /** Texto del botón de prenda sin código (por defecto «Prenda sin código»). */
  noBarcodeLabel?: string;
  noBarcodeDisabled?: boolean;
};

export function ManualCodeEntry({ onSubmit, onNoBarcode, noBarcodeLabel = "Prenda sin código", noBarcodeDisabled = false }: Props) {
  const [code, setCode] = useState("");
  const trimmed = code.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
    setCode("");
  };

  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="codigo-manual" className="block text-sm font-medium text-gray-700">
          Código del producto
        </label>
        <input
          id="codigo-manual"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Escribe el código"
          className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
        />
        <Button type="submit" disabled={!trimmed} className="w-full">
          Usar este código
        </Button>
      </form>
      <Button variant="outline" onClick={onNoBarcode} disabled={noBarcodeDisabled} className="w-full">
        {noBarcodeLabel}
      </Button>
    </div>
  );
}
