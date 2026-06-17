"use client";

import { usePathname } from "next/navigation";
import HomeClient from "@/app/home-client";

export default function PersistentHome() {
  const pathname = usePathname();
  const active = pathname === "/";

  return (
    <div
      className={
        active
          ? "app-main"
          : "pointer-events-none fixed inset-0 -z-10 h-dvh w-full overflow-hidden opacity-0"
      }
      aria-hidden={!active}
    >
      <HomeClient
        items={[]}
        popularItems={[]}
        totalPopularCount={0}
        active={active}
      />
    </div>
  );
}
