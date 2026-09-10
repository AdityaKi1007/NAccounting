import { getEntity } from "@/lib/entities";
import { notFound } from "next/navigation";
import EntityListPage from "@/components/crud/EntityListPage";

export default function SlugListPage({ params }: { params: { slug: string } }) {
  const entity = getEntity(params.slug);
  if (!entity) notFound();
  return <EntityListPage entityKey={params.slug} />;
}
