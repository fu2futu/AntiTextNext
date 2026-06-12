import HomeClient from "./home-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <HomeClient 
      items={[]} 
      popularItems={[]}
      totalPopularCount={0}
    />
  );
}
