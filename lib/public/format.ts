const mxn = (digits: number) =>
  new Intl.NumberFormat("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: 2 });
const whole = mxn(0);
const cents = mxn(2);

/** Precio público en pesos MXN: "$350", "$1,250.50". Un solo formato para tarjeta y modal. */
export function formatPrice(amount: number): string {
  return `$${Number.isInteger(amount) ? whole.format(amount) : cents.format(amount)}`;
}
