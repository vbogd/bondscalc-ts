import type { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-950">
      <div className="mx-auto min-h-screen w-full max-w-[480px] bg-neutral-50 px-4 py-5 shadow-[0_0_40px_rgba(15,23,42,0.08)] sm:px-6">
        {children}
      </div>
    </main>
  );
}
