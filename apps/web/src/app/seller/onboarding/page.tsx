import { OnboardingForm } from "@/components/seller/seller-actions";
import { PageHeading, StateBanner } from "@/components/seller/seller-ui";

export default function OnboardingPage() {
  return <div className="seller-page narrow-page"><PageHeading title="Start with your business details" description="Jejak uses marketplace data to create a transparent financing simulation." /><StateBanner tone="neutral" title="Early funding, not a receivable sale">Gross earnings, eligible value, funding amount, fees, and your estimated residual always appear separately.</StateBanner><section className="form-panel"><div><h2>Profile and consent</h2><p>Your data is used only in this sandbox. No production marketplace or bank account is connected.</p></div><OnboardingForm /></section></div>;
}
