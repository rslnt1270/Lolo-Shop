"use client";

import { Heart } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";

interface Props {
  productId: string;
  title: string;
  saved: boolean;
  disabled: boolean;
  onToggle: () => void;
  className?: string;
}

export const STORAGE_BLOCKED_TEXT = "Tu navegador no permite guardar favoritos.";

export function FavoriteButton({ productId, title, saved, disabled, onToggle, className }: Props) {
  const descId = `fav-desc-${productId}`;
  return (
    <div className={["flex flex-col gap-1", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={`Guardar ${title} en favoritos`}
        aria-describedby={disabled ? descId : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onToggle();
        }}
        className={`${buttonClasses("primary", { disabled })} w-full`}
      >
        <Heart className="h-4 w-4" fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        <span>{saved ? "En favoritos" : "Guardar en favoritos"}</span>
      </button>
      {disabled && (
        <span id={descId} className="text-xs leading-snug text-gray-600">
          {STORAGE_BLOCKED_TEXT}
        </span>
      )}
    </div>
  );
}
