"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type DemoRole, type DemoScenario } from "@/lib/jejak/gateway";
import { useJejak } from "@/lib/jejak/provider";

const ROLES: DemoRole[] = ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER"];
const INITIALS: Record<DemoRole, string> = { SELLER: "SL", ORIGINATOR: "OR", ISSUER: "IS", FACILITY: "FC", SERVICER: "SV", RESOLVER: "RS" };

export default function LoginPage() {
  const { signInAs, loading, error } = useJejak();
  const router = useRouter();
  const [scenario, setScenario] = useState<DemoScenario>("HAPPY");
  const [pendingRole, setPendingRole] = useState<DemoRole | null>(null);

  async function enter(role: DemoRole) {
    setPendingRole(role);
    try {
      const route = await signInAs(role, scenario);
      router.push(route);
    } catch {
      setPendingRole(null);
    }
  }

  return (
    <div className="jj-shell">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px clamp(20px,4vw,56px)" }}>
        <Link href="/" aria-label="Jejak home"><Image src="/jejak-logo-light.png" alt="" width={110} height={57} /></Link>
        <span className="jj-badge"><span className="jj-badge-dot" />SANDBOX · STELLAR TESTNET</span>
      </header>

      <div className="jj-container jj-login-hero">
        <span className="jj-eyebrow">Ready-made accounts</span>
        <h1>Masuk sebagai salah satu dari enam peran</h1>
        <p>
          Setiap akun sudah tersambung ke identitas dan kewenangan RBAC yang nyata di backend Jejak —
          bukan mock. Tidak perlu mendaftar; pilih peran untuk masuk ke konsol yang sesuai dengan pekerjaannya.
        </p>
        <div className="jj-scenario-toggle" role="tablist" aria-label="Demo scenario">
          {(["HAPPY", "ADVERSE"] as DemoScenario[]).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={scenario === value} className={scenario === value ? "active" : ""} onClick={() => setScenario(value)}>
              {value === "HAPPY" ? "Skenario lancar" : "Skenario adverse"}
            </button>
          ))}
        </div>
      </div>

      <div className="jj-container">
        <div className="jj-account-grid">
          {ROLES.map((role) => (
            <div key={role} className="jj-card jj-account-card">
              <div className="jj-account-card-icon">{INITIALS[role]}</div>
              <h2>{ROLE_LABELS[role]}</h2>
              <p>{ROLE_DESCRIPTIONS[role]}</p>
              <button type="button" className="jj-button jj-button-primary" disabled={loading || pendingRole !== null} onClick={() => enter(role)}>
                {pendingRole === role ? "Masuk…" : `Masuk sebagai ${ROLE_LABELS[role]}`}
              </button>
            </div>
          ))}
        </div>
        {error && <p role="alert" style={{ color: "#9a0d29", fontSize: 13, marginTop: -60, paddingBottom: 40 }}>{error.detail}</p>}
      </div>
    </div>
  );
}
