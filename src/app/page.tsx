import { Suspense } from "react";
import Configurator from "@/components/Configurator";

export default function Home() {
  return (
    <main className="flex h-screen flex-col">
      <nav className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-surface-container-highest bg-white/80 px-6 backdrop-blur-xl">
        <span className="font-headline text-xl font-black tracking-tighter text-black uppercase">
          PRODUCT CONFIGURATOR
        </span>
      </nav>
      <div className="flex flex-1 overflow-hidden pt-16">
        <Suspense fallback={null}>
          <Configurator />
        </Suspense>
      </div>
    </main>
  );
}
