import { RoleGate } from "@/components/jejak/role-gate";

export default function ResolutionLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate role="RESOLVER">{children}</RoleGate>;
}
