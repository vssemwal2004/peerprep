import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, MotionConfig, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Building2, GraduationCap, MessageSquareText,
  Mail, Copy, Check, Clock, Moon, Sun, ChevronDown, Inbox, ShieldCheck, Send, Lightbulb,
} from 'lucide-react';
import { Footer } from '../components/Footer';
import { useTheme } from '../context/ThemeContext';

const SUPPORT_EMAIL = 'peerprep26@gmail.com';

// Tokens mirror the public landing page (public/landing-page/css/base.css) so both feel like one product.
const tokens = `
.cu {
  --cu-bg: #f7f6f2; --cu-bg-2: #efede7; --cu-elev: #ffffff; --cu-sunken: #e9e6df;
  --cu-ink: #0e0f12; --cu-ink-2: #3d4048; --cu-ink-3: #6b6e77;
  --cu-line: rgba(14,15,18,.1); --cu-line-strong: rgba(14,15,18,.18);
  --cu-brand: #00a1db; --cu-brand-ink: #00719c; --cu-brand-soft: rgba(0,161,219,.1);
  --cu-danger: #b42318;
  --cu-shadow: 0 1px 2px rgba(14,15,18,.04), 0 12px 32px -12px rgba(14,15,18,.14);
  --cu-dot: rgba(14,15,18,.07);
}
.dark .cu {
  --cu-bg: #0a0a0b; --cu-bg-2: #0f0f11; --cu-elev: #151518; --cu-sunken: #060607;
  --cu-ink: #f2f2ef; --cu-ink-2: #a9abb1; --cu-ink-3: #8a8c93;
  --cu-line: rgba(255,255,255,.08); --cu-line-strong: rgba(255,255,255,.16);
  --cu-brand: #2bb5ee; --cu-brand-ink: #66ccf5; --cu-brand-soft: rgba(43,181,238,.12);
  --cu-danger: #f97066;
  --cu-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 20px 40px -16px rgba(0,0,0,.6);
  --cu-dot: rgba(255,255,255,.06);
}
.cu-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-style: italic; font-weight: 400; letter-spacing: -0.02em; }
.cu-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.cu-grid {
  background-image: radial-gradient(var(--cu-dot) 1px, transparent 1px);
  background-size: 22px 22px;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%);
  mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%);
}
.cu-field {
  width: 100%; border-radius: 14px; border: 1px solid var(--cu-line-strong);
  background: var(--cu-bg); color: var(--cu-ink); padding: 12px 14px; font-size: 15px;
  transition: border-color .2s, box-shadow .2s;
}
.cu-field::placeholder { color: var(--cu-ink-3); }
.cu-field:focus { outline: none; border-color: var(--cu-brand); box-shadow: 0 0 0 4px var(--cu-brand-soft); }
.cu-field[aria-invalid="true"] { border-color: var(--cu-danger); }
.cu-focus:focus-visible { outline: 2px solid var(--cu-brand); outline-offset: 3px; }
`;

const TOPICS = [
  { id: 'campus-demo', label: 'Campus demo', hint: 'Share your institution, approximate batch size, and what you want to see: assessments, coding practice, mock interviews or analytics.' },
  { id: 'technical', label: 'Technical issue', hint: 'Mention your campus, Student ID and the page where it happened. Attach screenshots once your email app opens.' },
  { id: 'account', label: 'Account & login', hint: 'Include your Student ID and campus. Never share your password with anyone, including us.' },
  { id: 'interviews', label: 'Interview scheduling', hint: 'Include the interview date, your partner (if any) and the slot you were assigned.' },
  { id: 'academic', label: 'Academic inquiry', hint: 'Tell us which program, event or assessment your question is about.' },
  { id: 'feedback', label: 'Feedback & ideas', hint: 'What worked, what did not, and what would make PeerPrep more useful for you.' },
];

const ROLES = ['Student', 'Coordinator', 'TPO / Admin', 'Other'];

const ROUTES = [
  {
    icon: Building2,
    tag: 'For TPOs & coordinators',
    title: 'Bring PeerPrep to your campus',
    body: 'Walk through onboarding, assessments, coding practice and placement analytics with our team.',
    points: ['Campus onboarding and student accounts', 'Assessment and coding-practice setup', 'Analytics for TPOs and coordinators'],
    topic: 'campus-demo',
    cta: 'Request a campus demo',
    featured: true,
  },
  {
    icon: GraduationCap,
    tag: 'For students',
    title: 'Get unstuck, fast',
    body: 'Login trouble, assessments, coding problems or mock interviews — we will help you get back to preparing.',
    points: ['Accounts are created by your campus', 'Use “Forgot password” on the login page', 'Include your Student ID for faster help'],
    topic: 'technical',
    cta: 'Get student support',
  },
  {
    icon: MessageSquareText,
    tag: 'For everyone',
    title: 'Spotted a bug or have an idea?',
    body: 'Feedback shapes what we build next. Screenshots help us reproduce issues quickly.',
    points: ['Bug reports and broken flows', 'Feature ideas and suggestions', 'Report inappropriate behaviour'],
    topic: 'feedback',
    cta: 'Share feedback',
  },
];

const STEPS = [
  { icon: Send, title: 'You write in', body: 'Your email app opens with the subject and details already filled in.' },
  { icon: Inbox, title: 'We triage', body: 'Replies usually arrive within 24–48 hours on business days.' },
  { icon: ShieldCheck, title: 'We follow up', body: `Expect our reply from ${SUPPORT_EMAIL} — check your spam folder too.` },
];

const FAQS = [
  { q: 'How do students get a PeerPrep account?', a: 'Student accounts are created by your campus. If you cannot sign in, contact your coordinator or TPO first; if the issue persists, write to us with your Student ID.' },
  { q: 'How do I reset my password?', a: 'Use the “Forgot password” link on the login page. If that does not work, contact support — never share your password in an email.' },
  { q: 'What are the support hours?', a: 'The platform is available 24/7. Support replies are sent during business hours (9 AM – 6 PM), usually within 24–48 hours.' },
  { q: 'Can I change my interview schedule?', a: 'Yes. You can propose new time slots through the dashboard or coordinate directly with your interview partner.' },
  { q: 'How do I report inappropriate behaviour?', a: `Email ${SUPPORT_EMAIL} immediately with the date, the people involved and what happened. Mark the subject “Urgent”.` },
  { q: 'Can my college use PeerPrep?', a: 'Yes — request a campus demo and we will walk your placement team through onboarding and setup.' },
];

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] } }),
};

function Eyebrow({ children }) {
  return (
    <span className="cu-mono inline-flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--cu-ink-3)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--cu-brand)]" />
      {children}
    </span>
  );
}

function useCopy() {
  const [state, setState] = useState('idle');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2200);
  };
  return [state, copy];
}

function buildMail(form) {
  const topic = TOPICS.find((t) => t.id === form.topic)?.label || 'General';
  const subject = `[PeerPrep · ${topic}] ${form.name.trim()}`;
  const body = [
    form.message.trim(),
    '',
    '—',
    `Name: ${form.name.trim()}`,
    `Email: ${form.email.trim()}`,
    `Role: ${form.role}`,
    form.institution.trim() && `Institution: ${form.institution.trim()}`,
  ].filter((line) => line !== false && line !== '').join('\n');
  return { subject, body };
}

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Please add your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email so we can reply.';
  if (form.message.trim().length < 10) errors.message = 'Tell us a little more (at least 10 characters).';
  return errors;
}

export default function ContactUs() {
  const { theme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const composerRef = useRef(null);
  const nameRef = useRef(null);
  const [emailCopy, copyEmail] = useCopy();
  const [messageCopy, copyMessage] = useCopy();
  const [openFaq, setOpenFaq] = useState(0);
  const [form, setForm] = useState({ name: '', email: '', role: 'Student', institution: '', topic: 'technical', message: '' });
  const [errors, setErrors] = useState({});
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Contact — PeerPrep';
    return () => { document.title = previous; };
  }, []);

  const activeTopic = TOPICS.find((t) => t.id === form.topic);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const goToComposer = (topic, role) => {
    setForm((f) => ({ ...f, topic, ...(role ? { role } : {}) }));
    composerRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => nameRef.current?.focus({ preventScroll: true }), reduceMotion ? 0 : 500);
  };

  const submit = (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const { subject, body } = buildMail(form);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

  const copyComposed = () => {
    const { subject, body } = buildMail(form);
    copyMessage(`To: ${SUPPORT_EMAIL}\nSubject: ${subject}\n\n${body}`);
  };

  return (
    <MotionConfig reducedMotion="user">
      <style>{tokens}</style>
      <div className="cu relative flex min-h-screen flex-col overflow-x-clip bg-[var(--cu-bg)] font-sans text-[var(--cu-ink)] antialiased">
        {/* Ambient background */}
        <div aria-hidden className="cu-grid pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[var(--cu-brand)] opacity-[0.12] blur-[120px]" />
        <div aria-hidden className="pointer-events-none absolute -left-48 top-[420px] h-[380px] w-[380px] rounded-full bg-[var(--cu-brand)] opacity-[0.06] blur-[120px]" />

        {/* Top bar */}
        <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" className="cu-focus flex items-center gap-3 rounded-lg">
            <img src="/landing-page/assets/logo-light.png" alt="PeerPrep" className="h-8 w-auto dark:hidden" />
            <img src="/landing-page/assets/logo-dark.png" alt="PeerPrep" className="hidden h-8 w-auto dark:block" />
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/" className="cu-focus hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[var(--cu-ink-2)] transition-colors hover:text-[var(--cu-ink)] sm:inline-flex">
              <ArrowLeft size={16} /> Home
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="cu-focus grid h-10 w-10 place-items-center rounded-full border border-[var(--cu-line-strong)] text-[var(--cu-ink-2)] transition-colors hover:text-[var(--cu-ink)]"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link to="/student" className="cu-focus inline-flex h-10 items-center gap-2 rounded-full bg-[var(--cu-ink)] px-5 text-sm font-semibold text-[var(--cu-bg)] transition-transform hover:-translate-y-px">
              Student login
            </Link>
          </nav>
        </header>

        <main className="relative z-10 flex-grow">
          {/* Hero */}
          <section className="mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pt-16">
            <motion.div initial="hidden" animate="show">
              <motion.div variants={rise} custom={0}><Eyebrow>Contact · PeerPrep</Eyebrow></motion.div>
              <motion.h1 variants={rise} custom={1} className="mt-6 text-[clamp(44px,6.4vw,92px)] font-bold leading-[0.98] tracking-[-0.05em]">
                Talk to the team<br />
                behind <span className="cu-serif text-[var(--cu-brand)]">PeerPrep.</span>
              </motion.h1>
              <motion.p variants={rise} custom={2} className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--cu-ink-2)]">
                Bringing PeerPrep to your campus, stuck on something as a student, or have feedback to share?
                Pick a route below and we will take it from there.
              </motion.p>
              <motion.div variants={rise} custom={3} className="mt-9 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => goToComposer('campus-demo', 'TPO / Admin')}
                  className="cu-focus group inline-flex h-14 items-center gap-2.5 rounded-full bg-[var(--cu-ink)] px-7 text-[15px] font-semibold text-[var(--cu-bg)] shadow-[var(--cu-shadow)] transition-transform hover:-translate-y-px"
                >
                  Request a campus demo
                  <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  type="button"
                  onClick={() => goToComposer('technical', 'Student')}
                  className="cu-focus inline-flex h-14 items-center gap-2.5 rounded-full border border-[var(--cu-line-strong)] px-7 text-[15px] font-semibold transition-all hover:-translate-y-px hover:border-[var(--cu-ink)]"
                >
                  I'm a student
                </button>
              </motion.div>
            </motion.div>

            {/* Direct line card */}
            <motion.div
              initial={{ opacity: 0, y: 24, rotate: -1 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto w-full max-w-md lg:max-w-none"
            >
              <div aria-hidden className="absolute inset-0 translate-x-4 translate-y-4 rotate-[3deg] rounded-[28px] border border-[var(--cu-line)] bg-[var(--cu-bg-2)]" />
              <div aria-hidden className="absolute inset-0 translate-x-2 translate-y-2 rotate-[1.5deg] rounded-[28px] border border-[var(--cu-line)] bg-[var(--cu-elev)] opacity-70" />
              <div className="relative overflow-hidden rounded-[28px] border border-[var(--cu-line)] bg-[var(--cu-elev)] p-7 shadow-[var(--cu-shadow)] sm:p-8">
                <div className="flex items-center justify-between">
                  <span className="cu-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cu-ink-3)]">Direct line</span>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--cu-brand-soft)] text-[var(--cu-brand-ink)]">
                    <Mail size={20} />
                  </span>
                </div>
                <p className="mt-8 text-sm font-medium text-[var(--cu-ink-3)]">Write to us anytime</p>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="cu-focus mt-1 block break-all rounded text-[clamp(22px,2.6vw,30px)] font-bold tracking-[-0.03em] transition-colors hover:text-[var(--cu-brand-ink)]">
                  {SUPPORT_EMAIL}
                </a>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyEmail(SUPPORT_EMAIL)}
                    className="cu-focus inline-flex h-10 items-center gap-2 rounded-full border border-[var(--cu-line-strong)] px-4 text-sm font-semibold transition-colors hover:border-[var(--cu-ink)]"
                  >
                    {emailCopy === 'copied' ? <Check size={15} className="text-[var(--cu-brand-ink)]" /> : <Copy size={15} />}
                    {emailCopy === 'copied' ? 'Copied' : emailCopy === 'failed' ? 'Copy failed — select it' : 'Copy address'}
                  </button>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="cu-focus inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--cu-brand-ink)] hover:underline">
                    Open mail <ArrowUpRight size={15} />
                  </a>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--cu-line)] bg-[var(--cu-line)]">
                  <div className="bg-[var(--cu-elev)] p-4">
                    <Clock size={16} className="text-[var(--cu-ink-3)]" />
                    <p className="mt-3 text-[15px] font-bold">24–48 hrs</p>
                    <p className="text-xs text-[var(--cu-ink-3)]">Typical reply, business days</p>
                  </div>
                  <div className="bg-[var(--cu-elev)] p-4">
                    <Inbox size={16} className="text-[var(--cu-ink-3)]" />
                    <p className="mt-3 text-[15px] font-bold">9 AM – 6 PM</p>
                    <p className="text-xs text-[var(--cu-ink-3)]">Support hours</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          {/* Routes */}
          <section className="border-y border-[var(--cu-line)] bg-[var(--cu-bg-2)]">
            <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <Eyebrow>Choose a route</Eyebrow>
                  <h2 className="mt-4 text-[clamp(32px,4vw,52px)] font-bold leading-[1.02] tracking-[-0.04em]">
                    The right people, <span className="cu-serif">first time.</span>
                  </h2>
                </div>
                <p className="max-w-sm text-[var(--cu-ink-2)]">Each route pre-fills the message form so your request lands with the right context.</p>
              </div>

              <div className="mt-12 grid gap-5 lg:grid-cols-3">
                {ROUTES.map((route, i) => {
                  const Icon = route.icon;
                  return (
                    <motion.article
                      key={route.title}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-60px' }}
                      transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                      className={`group relative flex flex-col overflow-hidden rounded-[24px] border p-7 transition-transform duration-300 hover:-translate-y-1 ${
                        route.featured
                          ? 'border-transparent bg-[var(--cu-ink)] text-[var(--cu-bg)]'
                          : 'border-[var(--cu-line)] bg-[var(--cu-elev)]'
                      }`}
                    >
                      {route.featured && (
                        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[var(--cu-brand)] opacity-30 blur-3xl" />
                      )}
                      <div className="relative flex items-center justify-between">
                        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${route.featured ? 'bg-white/10 text-[var(--cu-brand)] dark:bg-black/10' : 'bg-[var(--cu-brand-soft)] text-[var(--cu-brand-ink)]'}`}>
                          <Icon size={22} />
                        </span>
                        <span className={`cu-mono text-[11px] uppercase tracking-[0.14em] ${route.featured ? 'opacity-60' : 'text-[var(--cu-ink-3)]'}`}>{route.tag}</span>
                      </div>
                      <h3 className="relative mt-8 text-2xl font-bold tracking-[-0.03em]">{route.title}</h3>
                      <p className={`relative mt-3 leading-relaxed ${route.featured ? 'opacity-70' : 'text-[var(--cu-ink-2)]'}`}>{route.body}</p>
                      <ul className="relative mt-6 space-y-2.5">
                        {route.points.map((point) => (
                          <li key={point} className={`flex items-start gap-2.5 text-sm ${route.featured ? 'opacity-85' : 'text-[var(--cu-ink-2)]'}`}>
                            <Check size={16} className="mt-0.5 flex-none text-[var(--cu-brand)]" />
                            {point}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => goToComposer(route.topic, route.topic === 'campus-demo' ? 'TPO / Admin' : undefined)}
                        className={`cu-focus relative mt-auto inline-flex items-center gap-2 self-start pt-8 text-[15px] font-semibold ${route.featured ? '' : 'text-[var(--cu-ink)]'}`}
                      >
                        <span className={`border-b pb-0.5 ${route.featured ? 'border-current/40' : 'border-[var(--cu-line-strong)]'}`}>{route.cta}</span>
                        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                      </button>
                    </motion.article>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Composer */}
          <section ref={composerRef} className="mx-auto grid max-w-7xl scroll-mt-6 gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <Eyebrow>Send a message</Eyebrow>
              <h2 className="mt-4 text-[clamp(32px,4vw,52px)] font-bold leading-[1.02] tracking-[-0.04em]">
                Tell us what <span className="cu-serif">you need.</span>
              </h2>
              <p className="mt-5 max-w-md text-[var(--cu-ink-2)]">
                Fill this in and we will open your email app with everything ready to send. Nothing is sent until you press send there.
              </p>

              <ol className="relative mt-12 space-y-8">
                <span aria-hidden className="absolute bottom-3 left-[19px] top-3 w-px bg-[var(--cu-line-strong)]" />
                {STEPS.map(({ icon: Icon, title, body }, i) => (
                  <li key={title} className="relative flex gap-5">
                    <span className="relative grid h-10 w-10 flex-none place-items-center rounded-full border border-[var(--cu-line-strong)] bg-[var(--cu-bg)] text-[var(--cu-brand-ink)]">
                      <Icon size={17} />
                    </span>
                    <div>
                      <p className="cu-mono text-[11px] uppercase tracking-[0.14em] text-[var(--cu-ink-3)]">Step 0{i + 1}</p>
                      <p className="mt-1 font-bold">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--cu-ink-2)]">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <form noValidate onSubmit={submit} className="rounded-[28px] border border-[var(--cu-line)] bg-[var(--cu-elev)] p-6 shadow-[var(--cu-shadow)] sm:p-8">
              <fieldset>
                <legend className="text-sm font-semibold">What is this about?</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TOPICS.map((t) => {
                    const active = form.topic === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setForm((f) => ({ ...f, topic: t.id }))}
                        className={`cu-focus rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                          active
                            ? 'border-[var(--cu-ink)] bg-[var(--cu-ink)] text-[var(--cu-bg)]'
                            : 'border-[var(--cu-line-strong)] text-[var(--cu-ink-2)] hover:border-[var(--cu-ink)] hover:text-[var(--cu-ink)]'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <AnimatePresence mode="wait">
                <motion.p
                  key={activeTopic?.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4 flex gap-2.5 rounded-2xl bg-[var(--cu-brand-soft)] p-4 text-sm leading-relaxed text-[var(--cu-ink-2)]"
                >
                  <Lightbulb size={17} className="mt-0.5 flex-none text-[var(--cu-brand-ink)]" />
                  {activeTopic?.hint}
                </motion.p>
              </AnimatePresence>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field label="Your name" error={errors.name} id="cu-name">
                  <input ref={nameRef} id="cu-name" className="cu-field" value={form.name} onChange={update('name')} autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'cu-name-err' : undefined} />
                </Field>
                <Field label="Email for our reply" error={errors.email} id="cu-email">
                  <input id="cu-email" type="email" className="cu-field" value={form.email} onChange={update('email')} autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'cu-email-err' : undefined} />
                </Field>
                <Field label="I am a" id="cu-role">
                  <select id="cu-role" className="cu-field" value={form.role} onChange={update('role')}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Institution" optional id="cu-inst">
                  <input id="cu-inst" className="cu-field" value={form.institution} onChange={update('institution')} autoComplete="organization" />
                </Field>
              </div>

              <div className="mt-5">
                <Field label="Message" error={errors.message} id="cu-msg">
                  <textarea id="cu-msg" rows={5} className="cu-field resize-y" value={form.message} onChange={update('message')} aria-invalid={!!errors.message} aria-describedby={errors.message ? 'cu-msg-err' : undefined} placeholder="Describe your question or issue in a few lines…" />
                </Field>
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="submit" className="cu-focus group inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-[var(--cu-ink)] px-6 text-[15px] font-semibold text-[var(--cu-bg)] transition-transform hover:-translate-y-px">
                  Open in email app
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  type="button"
                  onClick={copyComposed}
                  className="cu-focus inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--cu-line-strong)] px-6 text-[15px] font-semibold transition-colors hover:border-[var(--cu-ink)]"
                >
                  {messageCopy === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                  {messageCopy === 'copied' ? 'Copied' : messageCopy === 'failed' ? 'Copy failed' : 'Copy message'}
                </button>
              </div>
              <p role="status" className="mt-4 text-xs leading-relaxed text-[var(--cu-ink-3)]">
                {opened
                  ? `Your email app should be open. If nothing happened, use “Copy message” and send it to ${SUPPORT_EMAIL}.`
                  : `Goes to ${SUPPORT_EMAIL}. No email app? Use “Copy message” and paste it into any mail service.`}
              </p>
            </form>
          </section>

          {/* FAQ */}
          <section className="border-t border-[var(--cu-line)] bg-[var(--cu-bg-2)]">
            <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <Eyebrow>FAQ</Eyebrow>
                <h2 className="mt-4 text-[clamp(32px,4vw,52px)] font-bold leading-[1.02] tracking-[-0.04em]">
                  Quick <span className="cu-serif">answers.</span>
                </h2>
                <p className="mt-5 max-w-sm text-[var(--cu-ink-2)]">The questions we hear most. Still stuck? The form above reaches us directly.</p>
              </div>
              <div className="divide-y divide-[var(--cu-line)] border-y border-[var(--cu-line)]">
                {FAQS.map((item, i) => {
                  const open = openFaq === i;
                  return (
                    <div key={item.q}>
                      <h3>
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={`cu-faq-${i}`}
                          onClick={() => setOpenFaq(open ? -1 : i)}
                          className="cu-focus flex w-full items-center justify-between gap-6 py-6 text-left text-lg font-semibold tracking-[-0.01em]"
                        >
                          {item.q}
                          <ChevronDown size={20} className={`flex-none text-[var(--cu-ink-3)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                        </button>
                      </h3>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            id={`cu-faq-${i}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <p className="max-w-2xl pb-6 leading-relaxed text-[var(--cu-ink-2)]">{item.a}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Closing CTA */}
          <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <div className="relative overflow-hidden rounded-[32px] bg-[var(--cu-ink)] px-7 py-14 text-[var(--cu-bg)] sm:px-14">
              <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-[var(--cu-brand)] opacity-40 blur-[90px]" />
              <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-[clamp(28px,3.6vw,46px)] font-bold leading-[1.05] tracking-[-0.04em]">
                    Running placements<br />for a <span className="cu-serif text-[var(--cu-brand)]">campus?</span>
                  </h2>
                  <p className="mt-4 max-w-md opacity-70">See how PeerPrep brings learning, practice, assessments and interviews into one place for your students.</p>
                </div>
                <button
                  type="button"
                  onClick={() => goToComposer('campus-demo', 'TPO / Admin')}
                  className="cu-focus group inline-flex h-14 flex-none items-center gap-2.5 self-start rounded-full bg-[var(--cu-bg)] px-7 text-[15px] font-semibold text-[var(--cu-ink)] transition-transform hover:-translate-y-px md:self-auto"
                >
                  Request a campus demo
                  <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </MotionConfig>
  );
}

function Field({ label, error, optional, id, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-baseline justify-between text-sm font-semibold">
        {label}
        {optional && <span className="text-xs font-medium text-[var(--cu-ink-3)]">Optional</span>}
      </label>
      {children}
      {error && <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-[var(--cu-danger)]">{error}</p>}
    </div>
  );
}
