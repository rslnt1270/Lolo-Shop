import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold text-gray-900">No encontramos esta página.</h1>
      <Link href="/" className={buttonClasses("primary")}>
        Ir al inicio
      </Link>
    </main>
  );
}
