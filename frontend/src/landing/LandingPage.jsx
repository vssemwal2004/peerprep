import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "./sections/HeroSection";
import Navbar from "./components/Navbar";

export default function LandingPage() {
  const navigate = useNavigate();

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
    document.getElementById("platform-preview")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <div className="relative overflow-hidden">
      <Navbar onLogin={handleLogin} />
      <HeroSection onPrimaryAction={handleLogin} onSecondaryAction={handleExplore} />
    </div>
  );
}
