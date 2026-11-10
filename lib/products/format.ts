const TZ = "America/Mexico_City";

/** `$899` o `$320.50`: sin centavos cuando es entero. */
export function formatPriceShort(n: number): string {
  const cents = Math.round(n * 100);
  const whole = cents % 100 === 0;
  return `$${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100)}`;
}

/** `10 nov 18:20` en hora de la Ciudad de México. */
export function formatDateTimeMx(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => (parts.find((p) => p.type === t)?.value ?? "").replace(".", "");
  return `${get("day")} ${get("month")} ${get("hour")}:${get("minute")}`;
}

/** `$899 → $799 · Lolo · 10 nov 18:20` */
export function formatPriceChange(c: { oldPrice: number; newPrice: number; userName: string; createdAt: string }): string {
  return `${formatPriceShort(c.oldPrice)} → ${formatPriceShort(c.newPrice)} · ${c.userName} · ${formatDateTimeMx(c.createdAt)}`;
}
