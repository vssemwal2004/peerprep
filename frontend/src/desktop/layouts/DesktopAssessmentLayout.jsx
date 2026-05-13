import { useLocation } from 'react-router-dom';

export default function DesktopAssessmentLayout({ children }) {
  const location = useLocation();
  const showLeftLogoOnly = location.pathname === '/student/assessments';
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {showLeftLogoOnly && (
        <div className="pointer-events-none fixed left-6 top-0 z-50">
          <img
            src="/images/logo.png"
            alt="PeerPrep"
            className="h-24 w-auto object-contain opacity-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)]"
          />
        </div>
      )}
      {children}
    </div>
  );
}
