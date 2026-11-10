import { MovementList } from "./MovementList";

export const metadata = { title: "Movimientos · LoloShop" };

export default function MovimientosPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-28 pt-4 md:pb-8">
      <h1 className="mb-3 text-xl font-bold text-[#12211F]">Movimientos</h1>
      <MovementList />
    </main>
  );
}
