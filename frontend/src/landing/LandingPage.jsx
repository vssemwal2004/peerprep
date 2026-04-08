import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "./sections/HeroSection";
import Navbar from "./components/Navbar";
import FeatureDeepDiveSection from "./sections/FeatureDeepDiveSection";
import FAQSection from "./sections/FAQSection";
import { FEATURE_TABS } from "./constants/featureTabs";
import GridBackground from "./components/GridBackground";
import AnimatedStars from "./components/AnimatedStars";
import { Footer } from "../components/Footer";

export default function LandingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(FEATURE_TABS[0].key);
  const deepDiveRef = useRef(null);

  useEffect(() => {
    const island = document.getElementById("landing-island");
    if (!island) return undefined;

    island.classList.add("li-fade");
    const timeoutId = window.setTimeout(() => island.remove(), 320);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const handleLogin = () => {
    navigate("/student");
  };

  const handleExplore = () => {
    deepDiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleTabSelect = (key) => {
    setActiveTab(key);
    // Ensure React has a chance to render before scrolling.
    window.requestAnimationFrame(() => {
      deepDiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-sky-100 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <GridBackground />
      <AnimatedStars />

      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-24 h-80 w-80 -translate-x-1/2 rounded-full bg-sky-300/35 blur-3xl dark:bg-sky-500/15" />
        <div className="absolute left-12 top-28 h-52 w-52 rounded-full bg-sky-200/55 blur-3xl dark:bg-blue-500/12" />
        <div className="absolute bottom-16 right-10 h-64 w-64 rounded-full bg-emerald-200/35 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.20),transparent_58%)] dark:hidden" />
        <div className="absolute inset-x-0 top-0 hidden h-[28rem] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_62%)] dark:block" />
      </div>

      <Navbar onLogin={handleLogin} />
      <HeroSection
        onPrimaryAction={handleLogin}
        onSecondaryAction={handleExplore}
        activeTab={activeTab}
        onTabSelect={handleTabSelect}
      />
      <FeatureDeepDiveSection
        activeTab={activeTab}
        sectionRef={deepDiveRef}
      />
      <FAQSection />
      <Footer />
    </div>
  );
}
