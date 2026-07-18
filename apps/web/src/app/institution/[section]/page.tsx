import { redirect } from "next/navigation";

// Retired: split into dedicated per-role consoles (/originator, /facility, /issuer, /servicer).
export default function InstitutionSection() {
  redirect("/login");
}
