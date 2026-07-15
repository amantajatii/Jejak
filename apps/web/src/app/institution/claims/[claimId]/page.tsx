import { ClaimDetailPage } from "@/features/institution/InstitutionWorkspace";
export default async function InstitutionClaim({ params }: { params: Promise<{ claimId: string }> }) { const { claimId } = await params; return <ClaimDetailPage claimId={claimId} />; }
