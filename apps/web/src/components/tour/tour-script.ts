import type { ClaimWorkspace, DemoRole, DemoScenario } from "@/lib/jejak/gateway";

/**
 * A scripted, strictly-gated walkthrough over the deterministic MOCK gateway.
 * Each step spotlights a real console element and only advances once the user
 * performs the required action (role switch / lifecycle action / acknowledge).
 */
export type StepGate =
  // Advance only when the user clicks the coach-mark "continue" button (pure observe).
  | { kind: "observe" }
  // Advance when the active demo role matches (user must use the role selector).
  | { kind: "role"; role: DemoRole }
  // Advance when the workspace satisfies the predicate (user must run the action).
  | { kind: "action"; until: (workspace: ClaimWorkspace) => boolean; hint: string };

export type TourStep = {
  id: string;
  /** Console route this step happens on; the driver navigates here automatically. */
  route: (claimId: string, workspace: ClaimWorkspace | null) => string;
  /** data-tour selector to spotlight; omit for a centered modal. */
  target?: string;
  title: string;
  body: string;
  gate: StepGate;
};

const institution = (claimId: string) => `/institution/claims/${claimId}`;

const HAPPY: TourStep[] = [
  {
    id: "intro",
    route: () => "/",
    title: "Selamat datang di walkthrough Jejak",
    body: "Walkthrough ini memakai data contoh tanpa transaksi nyata. Anda akan meninjau proses pendanaan marketplace dari awal hingga lunas dan berganti peran sesuai kebutuhan.",
    gate: { kind: "observe" },
  },
  {
    id: "financials",
    route: (claimId) => institution(claimId),
    target: "claim-financials",
    title: "Kenapa bukan seluruh nilai kotor?",
    body: "Perhatikan Gross unsettled selalu lebih besar dari Eligible Value. Selisihnya adalah buffer dilusi (refund, RTO, chargeback). Jejak mendanai nilai yang realistis tertagih, bukan angka kotor.",
    gate: { kind: "observe" },
  },
  {
    id: "role-originator-analyze",
    route: (claimId) => institution(claimId),
    target: "role-switch",
    title: "Berperan sebagai Originator",
    body: "Analisis risiko dilakukan oleh Originator. Buka pemilih peran di bilah atas dan pilih “Originator sandbox”.",
    gate: { kind: "role", role: "ORIGINATOR" },
  },
  {
    id: "analyze",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Hitung SDS, ESV, dan terbitkan JCC",
    body: "Centang kotak konfirmasi lalu klik tombol Analyze. Ini menghitung Settlement Dilution Score dan menerbitkan JCC — kredensial collectibility yang bisa dibagikan.",
    gate: { kind: "action", until: (w) => w.claim.state === "ELIGIBLE", hint: "Centang konfirmasi lalu klik Analyze." },
  },
  {
    id: "observe-jcc",
    route: (claimId) => institution(claimId),
    target: "claim-evidence",
    title: "JCC aktif",
    body: "Perhatikan status JCC menjadi ACTIVE dengan skor SDS. Ini bukti bahwa nilai klaim sudah dinilai sebelum keputusan pendanaan apa pun.",
    gate: { kind: "observe" },
  },
  {
    id: "create-offer",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Buat penawaran pendanaan",
    body: "Masih sebagai Originator: centang konfirmasi lalu klik Create offer untuk menyusun penawaran berdasarkan ESV.",
    gate: { kind: "action", until: (w) => w.latestOffer?.status === "ACTIVE", hint: "Centang konfirmasi lalu klik Create offer." },
  },
  {
    id: "role-seller",
    route: (claimId, w) => (w?.latestOffer ? `/seller/offers/${w.latestOffer.id}` : institution(claimId)),
    target: "role-switch",
    title: "Berganti menjadi Seller",
    body: "Seller yang menerima penawaran. Ganti peran ke “Seller” di bilah atas.",
    gate: { kind: "role", role: "SELLER" },
  },
  {
    id: "accept-offer",
    route: (claimId, w) => (w?.latestOffer ? `/seller/offers/${w.latestOffer.id}` : institution(claimId)),
    target: "op-action",
    title: "Terima penawaran",
    body: "Tinjau term-hash, jumlah, dan kewajiban. Centang konfirmasi lalu klik Accept offer untuk menyetujui.",
    gate: { kind: "action", until: (w) => w.latestOffer?.status === "ACCEPTED", hint: "Centang konfirmasi lalu klik Accept offer." },
  },
  {
    id: "role-originator-control",
    route: (claimId) => institution(claimId),
    target: "role-switch",
    title: "Kembali sebagai Originator",
    body: "Sebelum penerbitan, kontrol payout harus diverifikasi. Ganti peran kembali ke “Originator sandbox”.",
    gate: { kind: "role", role: "ORIGINATOR" },
  },
  {
    id: "verify-control",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Verifikasi bukti kontrol",
    body: "Centang konfirmasi lalu pilih Verify control. Status klaim berubah dari ELIGIBLE menjadi CONTROLLED setelah jalur pembayaran terverifikasi.",
    gate: { kind: "action", until: (w) => w.claim.state === "CONTROLLED", hint: "Centang konfirmasi lalu klik Verify control." },
  },
  {
    id: "role-issuer",
    route: (claimId) => institution(claimId),
    target: "role-switch",
    title: "Berperan sebagai Issuer",
    body: "Issuer menerbitkan aset terbatas jCLAIM di Stellar. Ganti peran ke “Issuer sandbox”.",
    gate: { kind: "role", role: "ISSUER" },
  },
  {
    id: "issue",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Issue jCLAIM",
    body: "Centang konfirmasi lalu klik Issue jCLAIM. Perhatikan referensi transaksi Stellar muncul di panel “Stellar references”.",
    gate: { kind: "action", until: (w) => w.claim.state === "ISSUED", hint: "Centang konfirmasi lalu klik Issue jCLAIM." },
  },
  {
    id: "role-facility",
    route: (claimId) => institution(claimId),
    target: "role-switch",
    title: "Berperan sebagai Facility",
    body: "Facility mendanai dengan JUSD. Ganti peran ke “Facility operator”.",
    gate: { kind: "role", role: "FACILITY" },
  },
  {
    id: "fund",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Danai dengan JUSD",
    body: "Centang konfirmasi lalu klik Fund JUSD. Posisi facility menjadi aktif; klaim berpindah ke FUNDED.",
    gate: { kind: "action", until: (w) => w.claim.state === "FUNDED", hint: "Centang konfirmasi lalu klik Fund JUSD." },
  },
  {
    id: "role-servicer",
    route: (claimId) => institution(claimId),
    target: "role-switch",
    title: "Berperan sebagai Servicer",
    body: "Servicer mencatat settlement dan menjalankan waterfall. Ganti peran ke “Servicer”.",
    gate: { kind: "role", role: "SERVICER" },
  },
  {
    id: "settle",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Catat settlement",
    body: "Centang konfirmasi lalu klik Record settlement. Klaim berpindah ke SETTLING.",
    gate: { kind: "action", until: (w) => w.claim.state === "SETTLING", hint: "Centang konfirmasi lalu klik Record settlement." },
  },
  {
    id: "waterfall",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Jalankan waterfall",
    body: "Centang konfirmasi lalu pilih Run waterfall. Kas dialokasikan secara berurutan untuk biaya, pokok senior, biaya pembiayaan, dan residual seller.",
    gate: { kind: "action", until: (w) => w.claim.state === "CLOSED", hint: "Centang konfirmasi lalu klik Run waterfall." },
  },
  {
    id: "done",
    route: (claimId) => institution(claimId),
    target: "claim-financials",
    title: "Selesai — klaim lunas (CLOSED)",
    body: "Seller menerima dana lebih awal, facility dilunasi penuh, dan seluruh jejak audit + referensi Stellar tercatat. Inilah happy path. Coba bandingkan dengan skenario Adverse.",
    gate: { kind: "observe" },
  },
];

const ADVERSE: TourStep[] = [
  {
    id: "intro",
    route: () => "/",
    title: "Skenario resolusi dengan data contoh",
    body: "Skenario dimulai dari klaim berstatus FUNDED sebelum terjadi lonjakan refund. Anda akan meninjau cara Jejak menangani penurunan nilai dan mengalokasikan kerugian secara terkendali.",
    gate: { kind: "observe" },
  },
  {
    id: "funded",
    route: (claimId) => institution(claimId),
    target: "claim-financials",
    title: "Klaim sudah didanai",
    body: "Klaim ini berada di status FUNDED — modal senior sudah dicairkan dan first-loss sudah didanai. Sekarang sesuatu memburuk.",
    gate: { kind: "observe" },
  },
  {
    id: "role-originator",
    route: (claimId) => institution(claimId),
    target: "role-switch",
    title: "Berperan sebagai Originator",
    body: "Lonjakan refund memicu atestasi ulang. Ganti peran ke “Originator sandbox”.",
    gate: { kind: "role", role: "ORIGINATOR" },
  },
  {
    id: "refund-spike",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Injeksi lonjakan refund",
    body: "Centang konfirmasi lalu klik Inject refund spike. Perhatikan ESV turun dan SDS naik tajam — nilai tertagih memburuk setelah pendanaan.",
    gate: { kind: "action", until: (w) => w.claim.reasonCodes.includes("CHARGEBACK_SPIKE"), hint: "Centang konfirmasi lalu klik Inject refund spike." },
  },
  {
    id: "role-servicer-settle",
    route: (claimId) => institution(claimId),
    target: "role-switch",
    title: "Berperan sebagai Servicer",
    body: "Servicer mencatat settlement yang tersisa. Ganti peran ke “Servicer”.",
    gate: { kind: "role", role: "SERVICER" },
  },
  {
    id: "settle",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Catat settlement",
    body: "Centang konfirmasi lalu klik Record settlement. Klaim berpindah ke SETTLING.",
    gate: { kind: "action", until: (w) => w.claim.state === "SETTLING", hint: "Centang konfirmasi lalu klik Record settlement." },
  },
  {
    id: "waterfall",
    route: (claimId) => institution(claimId),
    target: "op-action",
    title: "Jalankan waterfall (kas kurang)",
    body: "Centang konfirmasi lalu pilih Run waterfall. Karena kas tidak mencukupi, klaim berubah menjadi SHORTFALL dan first-loss mulai digunakan.",
    gate: { kind: "action", until: (w) => w.claim.state === "SHORTFALL", hint: "Centang konfirmasi lalu klik Run waterfall." },
  },
  {
    id: "role-resolver",
    route: (claimId, w) => `/resolution/${w?.claim.id ?? ""}`,
    target: "role-switch",
    title: "Berperan sebagai Resolver",
    body: "Klaim distressed ditangani oleh Authorized Resolver. Ganti peran ke “Authorized resolver”.",
    gate: { kind: "role", role: "RESOLVER" },
  },
  {
    id: "open-resolution",
    route: (claimId, w) => `/resolution/${w?.claim.id ?? ""}`,
    target: "op-action",
    title: "Buka resolusi",
    body: "Centang konfirmasi lalu klik Open resolution. Klaim masuk proses recovery terkendali.",
    gate: { kind: "action", until: (w) => w.claim.state === "RESOLUTION", hint: "Centang konfirmasi lalu klik Open resolution." },
  },
  {
    id: "record-recovery",
    route: (claimId, w) => `/resolution/${w?.claim.id ?? ""}`,
    target: "op-action",
    title: "Catat recovery",
    body: "Centang konfirmasi lalu klik Record recovery untuk mencatat dana yang berhasil ditarik kembali.",
    gate: { kind: "action", until: (w) => (w.resolutionCase?.recovered.amountMinor ?? "0") !== "0", hint: "Centang konfirmasi lalu klik Record recovery." },
  },
  {
    id: "close-resolution",
    route: (claimId, w) => `/resolution/${w?.claim.id ?? ""}`,
    target: "op-action",
    title: "Tutup dengan kerugian final",
    body: "Centang konfirmasi lalu klik Close with final loss. Kerugian dialokasikan eksplisit: first-loss dulu, lalu senior. Klaim berpindah ke CLOSED_WITH_LOSS.",
    gate: { kind: "action", until: (w) => w.claim.state === "CLOSED_WITH_LOSS", hint: "Centang konfirmasi lalu klik Close with final loss." },
  },
  {
    id: "done",
    route: (claimId, w) => `/resolution/${w?.claim.id ?? ""}`,
    target: "claim-financials",
    title: "Selesai — CLOSED_WITH_LOSS",
    body: "Kerugian diserap oleh first-loss sebelum dialokasikan ke senior dan seluruh hasilnya tercatat. Bandingkan dengan alur pendanaan untuk melihat perbedaan alokasi.",
    gate: { kind: "observe" },
  },
];

export const TOUR_SCRIPTS: Record<DemoScenario, TourStep[]> = { HAPPY, ADVERSE };
