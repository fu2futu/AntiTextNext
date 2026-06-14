"use client";

import { usePathname } from "next/navigation";
import HomeClient from "@/app/home-client";

export default function PersistentHome() {
  const pathname = usePathname();
  const active = pathname === "/";

  return (
    <div className={active ? "app-main" : "hidden"}>
      <HomeClient
        items={[]}
        popularItems={[]}
        totalPopularCount={0}
        active={active}
      />
    </div>
  );
}
