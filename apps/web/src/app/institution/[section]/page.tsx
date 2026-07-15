import { notFound } from "next/navigation";
import { InstitutionSectionPage } from "@/features/institution/InstitutionWorkspace";

const sections = new Set(["exposure", "transactions", "documents", "approvals"]);

export default async function InstitutionSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <InstitutionSectionPage section={section} />;
}
