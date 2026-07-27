import { useNavigate } from "react-router-dom";
import HeroSection from "./sections/HeroSection";
import CapabilityCards from "./sections/CapabilityCards";
import RecruiterMarquee from "./sections/RecruiterMarquee";
import MockInterviewSection from "./sections/MockInterviewSection";
import LearningModuleSection from "./sections/LearningModuleSection";
import ProblemSolvingSection from "./sections/ProblemSolvingSection";
import FinalCTASection from "./sections/FinalCTASection";
import FAQSection from "./sections/FAQSection";
import FooterSection from "./sections/FooterSection";
import Navbar from "./components/Navbar";

export default function LandingPage() {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate("/student");
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#eef7ff] text-slate-950">
      <Navbar onLogin={handleLogin} />
      <HeroSection onPrimaryAction={handleLogin} />
      <CapabilityCards />
      <RecruiterMarquee />
      <MockInterviewSection onPrimaryAction={handleLogin} />
      <LearningModuleSection />
      <ProblemSolvingSection onPrimaryAction={handleLogin} />
      <FinalCTASection onPrimaryAction={handleLogin} />
      <FAQSection />
      <FooterSection />
    </main>
  );
}
