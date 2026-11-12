"use client";
import { useId } from "react";
import type { PaymentMethod, SaleChannel } from "@/lib/domain/sale";
import { MAX_ALIAS_LENGTH } from "@/lib/domain/sale";

type Props = {
  channel: SaleChannel;
  method: PaymentMethod;
  alias: string;
  onChannel: (c: SaleChannel) => void;
  onMethod: (m: PaymentMethod) => void;
  onAlias: (a: string) => void;
  /** Cobro en curso o bloqueado: no se cambia canal, método ni alias. */
  disabled?: boolean;
};

const CHANNELS: { value: SaleChannel; label: string }[] = [
  { value: "store", label: "Tienda" },
  { value: "whatsapp", label: "WhatsApp" },
];
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "spay_transfer", label: "Transferencia SPAY" },
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
];

function Choice<T extends string>({
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="relative flex-1 basis-[7.5rem]">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
            className="peer sr-only"
          />
          <span className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border-2 border-turquesa-texto bg-white px-3 text-center text-sm font-semibold text-turquesa-texto peer-checked:border-turquesa peer-checked:bg-turquesa peer-checked:text-tinta peer-focus-visible:ring-2 peer-focus-visible:ring-turquesa-texto peer-focus-visible:ring-offset-2">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export function PaymentPicker({ channel, method, alias, onChannel, onMethod, onAlias, disabled = false }: Props) {
  const uid = useId();
  const aliasHelp = `${uid}-alias-ayuda`;
  const showAlias = channel === "whatsapp" && method === "spay_transfer";

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-tinta">Canal de venta</legend>
        <Choice name={`${uid}-canal`} options={CHANNELS} value={channel} onChange={onChannel} disabled={disabled} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-tinta">Método de pago</legend>
        <Choice name={`${uid}-pago`} options={METHODS} value={method} onChange={onMethod} disabled={disabled} />
        {method === "spay_transfer" && (
          <p className="text-sm text-tinta">
            La venta queda pendiente hasta que el dueño o el encargado confirme la transferencia.
          </p>
        )}
      </fieldset>

      {showAlias && (
        <div>
          <label htmlFor={`${uid}-alias`} className="block text-sm font-semibold text-tinta">
            Alias del pedido <span className="font-normal text-tinta">(opcional)</span>
          </label>
          <input
            id={`${uid}-alias`}
            type="text"
            value={alias}
            disabled={disabled}
            maxLength={MAX_ALIAS_LENGTH}
            onChange={(e) => onAlias(e.target.value)}
            aria-describedby={aliasHelp}
            autoComplete="off"
            className="mt-1 min-h-[44px] w-full rounded-lg border border-borde-control bg-white px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
          />
          <p id={aliasHelp} className="mt-1 text-sm text-tinta">
            Máximo 40 caracteres. Sin teléfono ni nombre completo.
          </p>
        </div>
      )}
    </div>
  );
}
