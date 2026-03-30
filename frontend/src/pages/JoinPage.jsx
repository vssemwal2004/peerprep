import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { 
  User, Mail, Building2, BookOpen, GitBranch, GraduationCap, Hash,
  CheckCircle, Clock, Loader2, Book, Pen, Backpack, Library, Notebook, 
  Pencil, School, Scissors, Ruler, Brain, Globe, Code, Laptop, Calculator, 
  Microscope, FlaskConical, Palette, Music, Headphones, Gamepad, Watch, 
  Tablet, BookOpen as BookOpenIcon, Highlighter, FileText, Clipboard, Award, Star, Lightbulb
} from 'lucide-react';

const FloatingIcon = ({ icon: IconComp, delay, duration, startX, startY, endX, endY, size = 24, opacity = 0.65 }) => {
  return (
    <div 
      className="absolute text-sky-500/40"
      style={{
        animationName: `float-${delay}`,
        animationDuration: `${duration}s`,
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
        left: `${startX}%`,
        top: `${startY}%`,
        transform: 'translateZ(0)',
        opacity: opacity,
        zIndex: 1,
      }}
    >
      <IconComp size={size} className="drop-shadow-lg brightness-125" />
      <style>{`
        @keyframes float-${delay} {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg) scale(0.6);
            opacity: ${opacity * 0.4};
          }
          25% {
            opacity: ${opacity * 0.9};
            transform: translate3d(${(endX - startX) * 0.3}vw, ${(endY - startY) * 0.3}vh, 10px) rotate(90deg) scale(1.1);
          }
          50% {
            opacity: ${opacity};
            transform: translate3d(${endX - startX}vw, ${endY - startY}vh, 20px) rotate(180deg) scale(1.3);
          }
          75% {
            opacity: ${opacity * 0.8};
            transform: translate3d(${(endX - startX) * 1.3}vw, ${(endY - startY) * 1.3}vh, 10px) rotate(270deg) scale(1.1);
          }
          100% {
            transform: translate3d(${(endX - startX) * 1.6}vw, ${(endY - startY) * 1.6}vh, 0) rotate(360deg) scale(0.6);
            opacity: ${opacity * 0.4};
          }
        }
      `}</style>
    </div>
  );
};

const ParticleEffect = ({ count = 80 }) => {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    size: Math.random() * 5 + 2,
    left: Math.random() * 100,
    top: Math.random() * 100,
    duration: Math.random() * 15 + 15,
    delay: Math.random() * 8,
  }));

  return (
    <>
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute rounded-full bg-sky-400/20"
          style={{
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            animationName: 'particle-float',
            animationDuration: `${particle.duration}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDelay: `${particle.delay}s`,
            zIndex: 1,
          }}
        />
      ))}
    </>
  );
};

const AnimatedGrid = () => {
  return (
    <div className="absolute inset-0 opacity-20">
      <div 
        className="absolute inset-0 bg-white dark:bg-gray-900"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(14, 165, 233, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(14, 165, 233, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          animation: 'grid-pulse 4s ease-in-out infinite',
        }}
      />
    </div>
  );
};

const CircuitLine = ({ id, points, duration = 20, delay = 0 }) => {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        animationName: `circuit-glow-${id}`,
        animationDuration: `${duration}s`,
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
        animationDelay: `${delay}s`,
        zIndex: 1,
      }}
    >
      <defs>
        <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(14, 165, 233, 0)" />
          <stop offset="50%" stopColor="rgba(14, 165, 233, 0.3)" />
          <stop offset="100%" stopColor="rgba(14, 165, 233, 0)" />
        </linearGradient>
      </defs>
      <path
        d={points}
        fill="none"
        stroke={`url(#gradient-${id})`}
        strokeWidth="2"
        className="drop-shadow-lg"
      />
      <style>{`
        @keyframes circuit-glow-${id} {
          0% { opacity: 0.3; }
          50% { opacity: 0.8; }
          100% { opacity: 0.3; }
        }
      `}</style>
    </svg>
  );
};

export default function JoinPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    university: '',
    course: '',
    branch: '',
    semester: '',
    studentId: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [existingStatus, setExistingStatus] = useState(null);

  // Check if user already submitted a request
  useEffect(() => {
    const savedEmail = localStorage.getItem('joinRequestEmail');
    if (savedEmail) {
      checkStatus(savedEmail);
    }
  }, []);

  const checkStatus = async (email) => {
    try {
      const res = await api.checkJoinStatus(email);
      if (res.status === 'pending') {
        setExistingStatus('pending');
      } else if (res.status === 'approved') {
        setExistingStatus('approved');
      }
    } catch {
      // Ignore
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email format';
    if (!form.university.trim()) errs.university = 'University is required';
    if (!form.course.trim()) errs.course = 'Course is required';
    if (!form.branch.trim()) errs.branch = 'Branch is required';
    if (!form.semester) errs.semester = 'Semester is required';
    else {
      const sem = parseInt(form.semester);
      if (isNaN(sem) || sem < 1 || sem > 8) errs.semester = 'Semester must be 1-8';
    }
    if (!form.studentId.trim()) errs.studentId = 'Student ID is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setServerError('');
    try {
      await api.submitJoinRequest(form);
      localStorage.setItem('joinRequestEmail', form.email.toLowerCase());
      setExistingStatus('pending');
    } catch (err) {
      setServerError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const floatingIcons = [
    { icon: Book, delay: 1, duration: 25, startX: 5, startY: 15, endX: 85, endY: 75, size: 36, opacity: 0.6 },
    { icon: Pen, delay: 2, duration: 30, startX: 95, startY: 8, endX: 15, endY: 85, size: 32, opacity: 0.55 },
    { icon: Backpack, delay: 3, duration: 22, startX: 2, startY: 85, endX: 90, endY: 10, size: 34, opacity: 0.65 },
    { icon: GraduationCap, delay: 4, duration: 35, startX: 98, startY: 65, endX: 8, endY: 25, size: 30, opacity: 0.5 },
    { icon: Library, delay: 5, duration: 28, startX: 45, startY: 2, endX: 65, endY: 95, size: 33, opacity: 0.6 },
    { icon: Notebook, delay: 6, duration: 24, startX: 25, startY: 95, endX: 75, endY: 15, size: 35, opacity: 0.65 },
    { icon: Pencil, delay: 7, duration: 32, startX: 85, startY: 90, endX: 35, endY: 20, size: 31, opacity: 0.55 },
    { icon: School, delay: 8, duration: 26, startX: 15, startY: 45, endX: 95, endY: 55, size: 38, opacity: 0.6 },
    { icon: Scissors, delay: 9, duration: 33, startX: 70, startY: 5, endX: 30, endY: 90, size: 34, opacity: 0.65 },
    { icon: Ruler, delay: 10, duration: 25, startX: 10, startY: 70, endX: 80, endY: 35, size: 32, opacity: 0.55 },
    { icon: Brain, delay: 11, duration: 29, startX: 90, startY: 30, endX: 20, endY: 80, size: 33, opacity: 0.6 },
    { icon: Globe, delay: 12, duration: 36, startX: 55, startY: 85, endX: 45, endY: 12, size: 35, opacity: 0.65 },
    { icon: Code, delay: 13, duration: 23, startX: 35, startY: 25, endX: 78, endY: 70, size: 31, opacity: 0.55 },
    { icon: Laptop, delay: 14, duration: 31, startX: 88, startY: 50, endX: 12, endY: 45, size: 36, opacity: 0.6 },
    { icon: Calculator, delay: 15, duration: 27, startX: 60, startY: 95, endX: 40, endY: 5, size: 32, opacity: 0.65 },
    { icon: Microscope, delay: 16, duration: 34, startX: 20, startY: 10, endX: 80, endY: 90, size: 34, opacity: 0.55 },
    { icon: FlaskConical, delay: 17, duration: 26, startX: 90, startY: 70, endX: 10, endY: 30, size: 30, opacity: 0.6 },
    { icon: Palette, delay: 18, duration: 32, startX: 5, startY: 50, endX: 95, endY: 50, size: 33, opacity: 0.65 },
    { icon: Music, delay: 19, duration: 28, startX: 75, startY: 15, endX: 25, endY: 85, size: 35, opacity: 0.55 },
    { icon: Headphones, delay: 20, duration: 35, startX: 40, startY: 80, endX: 60, endY: 20, size: 31, opacity: 0.6 },
  ];

  const circuitLines = [
    { id: 1, points: "M0,20 Q100,0 200,50 T400,30 T600,70 T800,10 T1000,40", duration: 25 },
    { id: 2, points: "M0,80 Q150,100 300,60 T600,90 T800,40 T1000,70", duration: 30 },
    { id: 3, points: "M0,60 Q200,30 400,80 T600,20 T800,60 T1000,30", duration: 35 },
  ];

  return (
    <div className="relative bg-white overflow-hidden h-screen w-screen flex items-center justify-center">
      {/* Enhanced Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <AnimatedGrid />
        {circuitLines.map(line => (
          <CircuitLine key={line.id} {...line} />
        ))}
        <ParticleEffect count={100} />
        {floatingIcons.map((iconProps, index) => (
          <FloatingIcon key={`icon-${index}`} {...iconProps} />
        ))}
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full h-full flex items-center justify-center px-4 md:px-8 lg:px-16 py-4">
        {/* Outer container - 70% transparent */}
        <div className="w-full max-w-6xl h-[95vh] bg-white/30 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden border-2 border-[#bcd4ff]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
            
            {/* Left Panel - Image Section */}
            <div className="hidden lg:flex items-center justify-center p-10">
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="relative w-full aspect-square max-w-md rounded-lg overflow-hidden bg-transparent">
                  <img 
                    src="/images/loginimg.webp" 
                    alt="Student Registration" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-sky-600/20 via-transparent to-sky-400/10"></div>
                </div>
                <div className="absolute -top-2 -left-2 w-14 h-14 bg-sky-400/10 rounded-full blur-xl animate-pulse"></div>
                <div className="absolute -bottom-2 -right-2 w-18 h-18 bg-sky-300/15 rounded-full blur-xl animate-pulse-slow"></div>
              </div>
            </div>

            {/* Right Panel - Registration Form */}
            <div className="flex items-center justify-center p-4 lg:p-6 overflow-hidden">
              <div className="relative w-full max-w-md">
                <div className="relative bg-transparent rounded-lg w-full">
                  {/* Header */}
                  <div className="relative text-center mb-2">
                    <div className="inline-flex items-center justify-center mb-1">
                      <img 
                        src="/images/logo.png" 
                        alt="Logo" 
                        className="h-14 lg:h-16 w-auto object-contain drop-shadow-lg"
                      />
                    </div>
                    <h1 className="text-lg lg:text-xl font-bold text-sky-800 mb-1 drop-shadow-lg">
                      {existingStatus === 'pending' ? 'Request Pending' : 
                       existingStatus === 'approved' ? 'Already Approved!' : 
                       'Student Registration'}
                    </h1>
                    <p className="text-sky-600/90 text-xs lg:text-sm font-medium mb-1">
                      {existingStatus === 'pending' ? 'Your request is under review' :
                       existingStatus === 'approved' ? 'Check your email for login credentials' :
                       'Join PeerPrep platform'}
                    </p>
                    {!existingStatus && (
                      <div className="flex items-center justify-center space-x-6 mt-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-lg"></div>
                          <span className="text-sky-600/80 text-xs font-medium">System</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-sky-400 rounded-full shadow-lg"></div>
                          <span className="text-sky-600/80 text-xs font-medium">Online</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status Display for Pending/Approved */}
                  {existingStatus === 'pending' && (
                    <div className="bg-amber-50/60 backdrop-blur-sm border border-amber-300/50 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-3">
                        <Clock className="w-8 h-8 text-amber-600" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800">Request Under Review</p>
                          <p className="text-xs text-amber-600 mt-1">You will receive an email once approved by the admin team.</p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => navigate('/')}
                          className="flex-1 py-2.5 bg-white/80 text-sky-700 rounded-lg font-semibold text-sm border border-sky-200 hover:bg-white transition-all"
                        >
                          Home
                        </button>
                        <button
                          onClick={() => navigate('/student')}
                          className="flex-1 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg font-semibold text-sm hover:scale-[1.02] transition-all"
                        >
                          Login
                        </button>
                      </div>
                    </div>
                  )}

                  {existingStatus === 'approved' && (
                    <div className="bg-green-50/60 backdrop-blur-sm border border-green-300/50 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                        <div>
                          <p className="text-sm font-semibold text-green-800">Account Approved!</p>
                          <p className="text-xs text-green-600 mt-1">Check your email for login credentials.</p>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate('/student')}
                        className="mt-4 w-full py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg font-semibold text-sm hover:scale-[1.02] transition-all"
                      >
                        Go to Login
                      </button>
                    </div>
                  )}

                  {/* Registration Form - Only show if no existing status */}
                  {!existingStatus && (
                    <form onSubmit={handleSubmit} className="relative space-y-2">
                      {/* Name */}
                      <div className="group">
                        <label className="block text-xs font-semibold text-sky-700/90 mb-1 uppercase tracking-wide">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <User size={16} className="text-sky-500 group-focus-within:text-sky-600 transition-colors duration-300" />
                          </div>
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            onKeyPress={handleKeyPress}
                            className="w-full pl-10 pr-4 py-1.5 bg-white/60 border border-sky-200/50 rounded-lg focus:ring-2 focus:ring-sky-300/50 focus:border-sky-300 transition-all duration-300 backdrop-blur-sm hover:bg-white/70 text-sky-800 placeholder-sky-600/70 font-medium text-sm"
                            placeholder="Enter your full name"
                          />
                        </div>
                        {errors.name && <p className="mt-1 text-xs text-red-600 font-medium">{errors.name}</p>}
                      </div>

                      {/* Email */}
                      <div className="group">
                        <label className="block text-xs font-semibold text-sky-700/90 mb-1 uppercase tracking-wide">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail size={16} className="text-sky-500 group-focus-within:text-sky-600 transition-colors duration-300" />
                          </div>
                          <input
                            type="email"
                            value={form.email}
                            onChange={(e) => handleChange('email', e.target.value)}
                            onKeyPress={handleKeyPress}
                            className="w-full pl-10 pr-4 py-1.5 bg-white/60 border border-sky-200/50 rounded-lg focus:ring-2 focus:ring-sky-300/50 focus:border-sky-300 transition-all duration-300 backdrop-blur-sm hover:bg-white/70 text-sky-800 placeholder-sky-600/70 font-medium text-sm"
                            placeholder="Enter your email"
                          />
                        </div>
                        {errors.email && <p className="mt-1 text-xs text-red-600 font-medium">{errors.email}</p>}
                      </div>

                      {/* University */}
                      <div className="group">
                        <label className="block text-xs font-semibold text-sky-700/90 mb-1 uppercase tracking-wide">
                          University / College <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Building2 size={16} className="text-sky-500 group-focus-within:text-sky-600 transition-colors duration-300" />
                          </div>
                          <input
                            type="text"
                            value={form.university}
                            onChange={(e) => handleChange('university', e.target.value)}
                            onKeyPress={handleKeyPress}
                            className="w-full pl-10 pr-4 py-1.5 bg-white/60 border border-sky-200/50 rounded-lg focus:ring-2 focus:ring-sky-300/50 focus:border-sky-300 transition-all duration-300 backdrop-blur-sm hover:bg-white/70 text-sky-800 placeholder-sky-600/70 font-medium text-sm"
                            placeholder="e.g., Delhi Technical University"
                          />
                        </div>
                        {errors.university && <p className="mt-1 text-xs text-red-600 font-medium">{errors.university}</p>}
                      </div>

                      {/* Course and Branch - Two Columns on Desktop */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Course */}
                        <div className="group">
                          <label className="block text-xs font-semibold text-sky-700/90 mb-1 uppercase tracking-wide">
                            Course <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <BookOpen size={16} className="text-sky-500 group-focus-within:text-sky-600 transition-colors duration-300" />
                            </div>
                            <input
                              type="text"
                              value={form.course}
                              onChange={(e) => handleChange('course', e.target.value)}
                              onKeyPress={handleKeyPress}
                              className="w-full pl-10 pr-4 py-1.5 bg-white/60 border border-sky-200/50 rounded-lg focus:ring-2 focus:ring-sky-300/50 focus:border-sky-300 transition-all duration-300 backdrop-blur-sm hover:bg-white/70 text-sky-800 placeholder-sky-600/70 font-medium text-sm"
                              placeholder="B.Tech, BCA"
                            />
                          </div>
                          {errors.course && <p className="mt-1 text-xs text-red-600 font-medium">{errors.course}</p>}
                        </div>

                        {/* Branch */}
                        <div className="group">
                          <label className="block text-xs font-semibold text-sky-700/90 mb-1 uppercase tracking-wide">
                            Branch <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <GitBranch size={16} className="text-sky-500 group-focus-within:text-sky-600 transition-colors duration-300" />
                            </div>
                            <input
                              type="text"
                              value={form.branch}
                              onChange={(e) => handleChange('branch', e.target.value)}
                              onKeyPress={handleKeyPress}
                              className="w-full pl-10 pr-4 py-1.5 bg-white/60 border border-sky-200/50 rounded-lg focus:ring-2 focus:ring-sky-300/50 focus:border-sky-300 transition-all duration-300 backdrop-blur-sm hover:bg-white/70 text-sky-800 placeholder-sky-600/70 font-medium text-sm"
                              placeholder="CS, IT"
                            />
                          </div>
                          {errors.branch && <p className="mt-1 text-xs text-red-600 font-medium">{errors.branch}</p>}
                        </div>
                      </div>

                      {/* Semester */}
                      <div className="group">
                        <label className="block text-xs font-semibold text-sky-700/90 mb-1 uppercase tracking-wide">
                          Semester <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <GraduationCap size={16} className="text-sky-500 group-focus-within:text-sky-600 transition-colors duration-300" />
                          </div>
                          <select
                            value={form.semester}
                            onChange={(e) => handleChange('semester', e.target.value)}
                            className="w-full pl-10 pr-4 py-1.5 bg-white/60 border border-sky-200/50 rounded-lg focus:ring-2 focus:ring-sky-300/50 focus:border-sky-300 transition-all duration-300 backdrop-blur-sm hover:bg-white/70 text-sky-800 font-medium text-sm appearance-none"
                          >
                            <option value="">Select Semester</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                              <option key={s} value={s}>Semester {s}</option>
                            ))}
                          </select>
                        </div>
                        {errors.semester && <p className="mt-1 text-xs text-red-600 font-medium">{errors.semester}</p>}
                      </div>

                      {/* Student ID */}
                      <div className="group">
                        <label className="block text-xs font-semibold text-sky-700/90 mb-1 uppercase tracking-wide">
                          Student ID <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Hash size={16} className="text-sky-500 group-focus-within:text-sky-600 transition-colors duration-300" />
                          </div>
                          <input
                            type="text"
                            value={form.studentId}
                            onChange={(e) => handleChange('studentId', e.target.value)}
                            onKeyPress={handleKeyPress}
                            className="w-full pl-10 pr-4 py-1.5 bg-white/60 border border-sky-200/50 rounded-lg focus:ring-2 focus:ring-sky-300/50 focus:border-sky-300 transition-all duration-300 backdrop-blur-sm hover:bg-white/70 text-sky-800 placeholder-sky-600/70 font-medium text-sm"
                            placeholder="Enter your student ID"
                          />
                        </div>
                        {errors.studentId && <p className="mt-1 text-xs text-red-600 font-medium">{errors.studentId}</p>}
                      </div>

                      {/* Error Message */}
                      {serverError && (
                        <div className="bg-red-50/60 backdrop-blur-sm border border-red-200 rounded-lg p-3">
                          <p className="text-sm text-red-600 font-medium">{serverError}</p>
                        </div>
                      )}

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full group relative bg-gradient-to-r from-sky-500 to-sky-600 text-white py-2 px-6 rounded-lg font-bold transform transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 focus:ring-2 focus:ring-sky-300/50 overflow-hidden shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                        <span className="relative flex items-center justify-center text-base font-semibold gap-2">
                          {loading ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            'Submit Join Request'
                          )}
                        </span>
                      </button>

                      <p className="text-center text-xs text-sky-600/80 mt-2">
                        Already have an account?{' '}
                        <button type="button" onClick={() => navigate('/student')} className="font-semibold text-sky-600 hover:text-sky-700 hover:underline">
                          Login here
                        </button>
                      </p>
                    </form>
                  )}
                </div>
                <div className="absolute -z-10 -top-2 -left-2 w-12 h-12 bg-sky-300/20 rounded-full blur-lg"></div>
                <div className="absolute -z-10 -bottom-2 -right-2 w-14 h-14 bg-sky-400/15 rounded-full blur-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        @keyframes particle-float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.3; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.7; }
        }
        @keyframes grid-pulse {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.3; }
        }
        .animate-pulse-slow {
          animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        /* Mobile-specific optimizations */
        @media (max-width: 1024px) {
          input, select, button, a {
            font-size: 16px;
            -webkit-tap-highlight-color: transparent;
          }
        }
      `}</style>
    </div>
  );
}
