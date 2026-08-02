import Mixer from "@/components/Mixer";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <Mixer initialError={error} />;
}
