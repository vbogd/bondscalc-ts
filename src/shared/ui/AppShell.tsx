import type { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen w-full max-w-[560px] px-4 py-5 sm:px-6 sm:py-7">
        {children}
      </div>
    </main>
  );
}
