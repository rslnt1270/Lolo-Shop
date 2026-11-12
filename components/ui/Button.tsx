import type { ButtonHTMLAttributes } from "react";
import { buttonClasses, type ButtonVariant } from "./button-classes";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  success?: boolean;
};

export function Button({
  variant = "primary",
  loading = false,
  success = false,
  type = "button",
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled) || loading;
  const classes = [buttonClasses(variant, { disabled: isDisabled, loading, success }), className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={classes}
    >
      {loading && (
        <svg className="lolo-btn-spinner h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {success && !loading && (
        <svg className="lolo-btn-check h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {children}
    </button>
  );
}
