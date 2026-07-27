const topRecruiters = [
  { name: "Atlassian", logo: "/images/recruiters/atlassian.svg" },
  { name: "Microsoft", logo: "/images/recruiters/microsoft.svg" },
  { name: "Google", logo: "/images/recruiters/google.svg" },
  { name: "Adobe", logo: "/images/recruiters/adobe.svg" },
  { name: "Amazon", logo: "/images/recruiters/amazon.svg" },
  { name: "Infosys", logo: "/images/recruiters/infosys.svg" },
  { name: "Wipro", logo: "/images/recruiters/wipro.svg" },
  { name: "Cognizant", logo: "/images/recruiters/cognizant.svg" },
  { name: "TCS", logo: "/images/recruiters/tcs.svg" },
  { name: "HCL", logo: "/images/recruiters/hcl.svg" },
  { name: "Tech Mahindra", logo: "/images/recruiters/tech-mahindra.png" },
  { name: "Deloitte", logo: "/images/recruiters/deloitte.png" },
];

const bottomRecruiters = [
  { name: "DE Shaw", logo: "/images/recruiters/de-shaw.png" },
  { name: "Visa", logo: "/images/recruiters/visa.svg" },
  { name: "JP Morgan", logo: "/images/recruiters/jp-morgan.png" },
  { name: "JSW", logo: "/images/recruiters/jsw.png" },
  { name: "Capgemini", logo: "/images/recruiters/capgemini.png" },
  { name: "Accenture", logo: "/images/recruiters/accenture.svg" },
  { name: "Oracle", logo: "/images/recruiters/oracle.svg" },
  { name: "IBM", logo: "/images/recruiters/ibm.svg" },
  { name: "Samsung", logo: "/images/recruiters/samsung.svg" },
  { name: "Paytm", logo: "/images/recruiters/paytm.svg" },
  { name: "PhonePe", logo: "/images/recruiters/phonepe.svg" },
  { name: "Flipkart", logo: "/images/recruiters/flipkart.svg" },
];

function RecruiterRail({ companies, direction = "left", tone = "sky" }) {
  const repeatedCompanies = [...companies, ...companies];

  return (
    <div className="recruiter-rail" data-direction={direction}>
      <div className="recruiter-track">
        {repeatedCompanies.map((company, index) => (
          <span key={`${company.name}-${index}`} className={`recruiter-logo recruiter-logo-${tone}`}>
            <img
              src={company.logo}
              alt={`${company.name} logo`}
              loading="lazy"
              decoding="async"
              className="recruiter-logo-img"
            />
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RecruiterMarquee() {
  return (
    <section id="recruiters" className="relative overflow-hidden bg-[#eef7ff] py-12 sm:py-14" aria-labelledby="recruiter-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2
          id="recruiter-heading"
          className="mx-auto max-w-3xl text-center text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl"
        >
          Our Students Are Building Careers At
        </h2>

        <div className="mt-9 space-y-4 sm:mt-10 sm:space-y-5">
          <RecruiterRail companies={topRecruiters} direction="left" tone="sky" />
          <RecruiterRail companies={bottomRecruiters} direction="right" tone="indigo" />
        </div>
      </div>

      <style>{`
        .recruiter-rail {
          position: relative;
          overflow: hidden;
          padding-block: 4px;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
        }

        .recruiter-track {
          display: flex;
          width: max-content;
          gap: 14px;
          animation: recruiter-scroll-left 68s linear infinite;
          will-change: transform;
        }

        .recruiter-rail[data-direction="right"] .recruiter-track {
          animation-name: recruiter-scroll-right;
          animation-duration: 76s;
        }

        .recruiter-rail:hover .recruiter-track {
          animation-play-state: paused;
        }

        .recruiter-logo {
          display: inline-flex;
          min-width: clamp(132px, 14vw, 192px);
          height: clamp(58px, 6vw, 76px);
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(14, 116, 144, 0.14);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.84);
          box-shadow: 0 16px 36px rgba(14, 116, 144, 0.08);
          transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease, color 220ms ease;
        }

        .recruiter-logo-img {
          max-width: 72%;
          max-height: 42px;
          object-fit: contain;
          transition: transform 220ms ease, opacity 220ms ease;
        }

        .recruiter-logo:hover {
          transform: translateY(-3px) scale(1.035);
          border-color: rgba(14, 165, 233, 0.45);
          box-shadow: 0 20px 46px rgba(14, 116, 144, 0.16);
        }

        .recruiter-logo:hover .recruiter-logo-img {
          transform: scale(1.04);
          opacity: 0.96;
        }

        .recruiter-logo-indigo:hover {
          border-color: rgba(99, 102, 241, 0.42);
        }

        @keyframes recruiter-scroll-left {
          from { transform: translateX(0); }
          to { transform: translateX(calc(-50% - 7px)); }
        }

        @keyframes recruiter-scroll-right {
          from { transform: translateX(calc(-50% - 7px)); }
          to { transform: translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .recruiter-track {
            animation: none;
            flex-wrap: wrap;
            justify-content: center;
            width: auto;
          }
        }
      `}</style>
    </section>
  );
}
