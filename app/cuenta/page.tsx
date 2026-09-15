"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { changePasswordAction } from "@/lib/actions";
import { validateNewPassword } from "@/lib/auth/password-rules";

const inputClass =
  "w-full rounded-xl border border-[rgba(226,232,240,0.5)] bg-[#F9FAFB] p-3.5 text-sm text-[#18181B] transition-colors focus:border-[#2DD4BF] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]";
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#71717A]";

export default function CuentaPage() {
  const { data: session } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);

    // Validación local antes de ir al servidor (el servidor vuelve a validar).
    const problem = validateNewPassword(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("La confirmación no coincide con la nueva contraseña.");

    setSaving(true);
    try {
      const res = await changePasswordAction(current, next);
      if (!res.ok) {
        setError(res.error);
      } else {
        setDone(true);
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    } catch {
      setError("No se pudo cambiar la contraseña. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3 bg-gradient-to-br from-loloteal to-[#147E7E] px-5 pb-8 pt-6 text-white">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 border-white/60 bg-white/10">
          <KeyRound size={20} />
        </div>
        <div>
          <p className="text-lg font-extrabold leading-tight">Mi cuenta</p>
          <p className="mt-0.5 font-mono text-[0.74rem] tracking-wide text-white/85">
            {session?.user?.name ?? "—"} · {session?.user?.role ?? ""}
          </p>
        </div>
      </div>

      <div className="-mt-3 rounded-t-2xl bg-[#F4FBFA] px-4 pb-8 pt-5">
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-[20px] border border-[rgba(18,33,31,0.12)] bg-white p-5 shadow-sm"
        >
          <h2 className="text-base font-extrabold text-[#18181B]">Cambiar contraseña</h2>

          <div>
            <label className={labelClass} htmlFor="actual">Contraseña actual</label>
            <input
              id="actual"
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="nueva">Nueva contraseña</label>
            <input
              id="nueva"
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <p className="mt-1.5 text-[0.7rem] text-[#71717A]">
              Mínimo 10 caracteres, con letras y números. Una frase como <span className="font-mono">Bosque-Limon-42</span> funciona bien.
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="confirmar">Confirmar nueva contraseña</label>
            <input
              id="confirmar"
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-center text-sm font-medium text-red-500">{error}</p>}
          {done && (
            <p className="flex items-center justify-center gap-2 text-center text-sm font-medium text-[#147E7E]">
              <CheckCircle2 size={16} /> Contraseña actualizada.
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center rounded-xl bg-[#2DD4BF] p-3.5 font-semibold text-white shadow-sm transition-all hover:bg-[#25B5A3] active:scale-[0.98] disabled:opacity-70"
          >
            {saving ? "Guardando…" : "Guardar nueva contraseña"}
          </button>
        </form>
      </div>
    </main>
  );
}
