import "./landing.css";
import { LandingHero } from "@/components/landing/LandingHero";
import { ForInstitution, ForSeller, HowItWorks, LandingFooter, LandingHeader, StellarSection } from "@/components/landing/LandingSections";

export default function Home() {
  return (
    <div className="landing">
      <LandingHeader />
      <LandingHero />
      <main>
        <HowItWorks />
        <ForSeller />
        <ForInstitution />
        <StellarSection />
      </main>
      <LandingFooter />
    </div>
  );
}
