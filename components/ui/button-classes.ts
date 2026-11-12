export type ButtonVariant = "primary" | "outline" | "danger";
export type ButtonState = { disabled?: boolean; loading?: boolean; success?: boolean };

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa-texto lolo-btn";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-turquesa text-tinta border-2 border-transparent",
  outline: "bg-white text-turquesa-texto border-2 border-turquesa-texto",
  danger: "bg-white text-agotado border-2 border-agotado",
};

const DISABLED = "disabled:bg-[#BFE9E9] disabled:text-[#5C6E6D] disabled:border-transparent disabled:cursor-not-allowed";
const DISABLED_OUTLINE = "disabled:border-borde-control disabled:text-[#5C6E6D] disabled:cursor-not-allowed";

/** Sufijo de estado deshabilitado para <button> crudos con buttonClasses (mismos tokens que Button). */
export function disabledClasses(variant: ButtonVariant): string {
  return variant === "outline" ? DISABLED_OUTLINE : DISABLED;
}

export function buttonClasses(variant: ButtonVariant, state: ButtonState = {}): string {
  const parts = [BASE, VARIANTS[variant]];
  if (state.disabled) parts.push(variant === "outline" ? DISABLED_OUTLINE : DISABLED);
  if (state.success) parts.push("lolo-btn-success");
  return parts.join(" ");
}
