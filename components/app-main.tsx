"use client";

import { usePathname } from "next/navigation";

export default function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className={`app-main ${pathname === "/" ? "hidden" : ""}`}>
      {children}
    </main>
  );
}
