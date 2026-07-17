"use client";

import { useRef, useState } from "react";
import { ACTION_LABELS, ROLE_LABELS, type JejakAction } from "@/lib/jejak/gateway";
import { describeAsset, formatMoney } from "@/lib/jejak/money";
import { useJejak } from "@/lib/jejak/provider";

const ROLE_BY_ACTION = { ANALYZE: "ORIGINATOR", CREATE_OFFER: "ORIGINATOR", ACCEPT_OFFER: "SELLER", VERIFY_CONTROL: "ORIGINATOR", ISSUE: "ISSUER", FUND: "FACILITY", RECORD_SETTLEMENT: "SERVICER", RUN_WATERFALL: "SERVICER", REFUND_SPIKE: "ORIGINATOR", OPEN_RESOLUTION: "RESOLVER", RECORD_RECOVERY: "RESOLVER", CLOSE_RESOLUTION: "RESOLVER" } as const;

export function OperationPanel({ action }: { action: JejakAction }) {
  const { workspace, session, execute } = useJejak();
  const [confirmed, setConfirmed] = useState(false); const [submitting, setSubmitting] = useState(false);
  const keyRef = useRef<string | null>(null);
  if (!workspace) return null;
  const requiredRole = ROLE_BY_ACTION[action]; const eligible = session?.role === requiredRole; const pending = workspace.pendingOperation;
  async function submit() {
    if (!confirmed || submitting) return;
    keyRef.current ??= crypto.randomUUID(); setSubmitting(true);
    try { await execute(action, keyRef.current, workspace?.latestOffer?.termsHash); keyRef.current = null; setConfirmed(false); }
    catch { /* Provider exposes the authoritative error and keeps the command identity for retry. */ }
    finally { setSubmitting(false); }
  }
  return <section className="jejak-operation panel" data-tour="op-action" aria-live="polite">
    <span className="section-label">Primary next action</span><h2>{ACTION_LABELS[action]}</h2>
    <p>Required role: <strong>{ROLE_LABELS[requiredRole]}</strong>. Success appears only after workspace reconciliation.</p>
    <dl><div><dt>Amount</dt><dd>{formatMoney(workspace.claim.principal)}</dd></div><div><dt>Asset</dt><dd>{describeAsset(workspace.claim.principal)}</dd></div><div><dt>Current state/version</dt><dd>{workspace.claim.state} · v{workspace.claim.version}</dd></div><div><dt>Intended outcome</dt><dd>{ACTION_LABELS[action]}</dd></div></dl>
    <label className="operation-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the amount, asset, role, state, and intended outcome.</span></label>
    <button className="primary-button" type="button" disabled={!eligible || !confirmed || submitting || Boolean(pending)} aria-busy={submitting || Boolean(pending)} onClick={submit}>{submitting ? "Submitting…" : pending ? pending.stage.replaceAll("_", " ") : ACTION_LABELS[action]}</button>
    {!eligible && <p className="operation-guidance">Switch to {ROLE_LABELS[requiredRole]} to continue.</p>}
    {pending && <div className="operation-status" role="status"><strong>{pending.stage.replaceAll("_", " ")}</strong><span>{pending.message}</span></div>}
  </section>;
}
