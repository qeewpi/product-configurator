import Configurator from "@/components/Configurator";

export default function Home() {
  return (
    <main className="flex h-screen flex-col">
      <nav className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-xl">
        <span className="font-headline text-xl font-extrabold tracking-tight text-slate-900">
          Product Configurator
        </span>
      </nav>
      <div className="flex flex-1 overflow-hidden pt-16">
        <Configurator />
      </div>
    </main>
  );
}
