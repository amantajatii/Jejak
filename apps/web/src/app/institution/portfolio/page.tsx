import { redirect } from "next/navigation";

// The generic institution console was split into dedicated per-role consoles
// (/originator, /facility, /issuer, /servicer). This route is retired.
export default function InstitutionPortfolio() {
  redirect("/login");
}
