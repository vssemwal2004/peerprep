import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import DarkModeToggle from '../components/DarkModeToggle';
import { 
  Users, ArrowRight, Video, MessageCircle, Target, Calendar, Shield, 
  BookOpen, TrendingUp, Bell, Clock, FileText, Star, Award, 
  CheckCircle, Mail, Upload, BarChart3, RefreshCw, UserCheck,
  GitBranch, Lightbulb, Sparkles, Layers, Zap, PlayCircle
} from 'lucide-react';

export default function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [visibleSections, setVisibleSections] = useState(new Set());
  const navigate = useNavigate();
  const observerRef = useRef(null);

  // ── ISLAND ARCHITECTURE: dismiss the static HTML shell ──────────────
  // The static #landing-island in index.html is visible while this
  // component's JS chunk is being downloaded. Once we mount, the real
  // React page is rendered underneath — fade the island out so the
  // transition is seamless (no blank flash).
  useEffect(() => {
    const island = document.getElementById('landing-island');
    if (island) {
      island.classList.add('li-fade');
      const t = setTimeout(() => island.remove(), 320);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    setIsVisible(true);
    
    
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    
    // Intersection Observer for scroll animations
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections(prev => new Set(prev).add(entry.target.id));
          }
        });
      },
      { threshold: 0.1 }
    );
    
    document.querySelectorAll('[data-animate]').forEach((el) => {
      observerRef.current.observe(el);
    });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  const handleLoginClick = () => {
    navigate('/student');
  };


  const isInView = (sectionId) => visibleSections.has(sectionId);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-0 right-0 w-56 h-56 sm:w-96 sm:h-96 bg-gradient-to-br from-indigo-200/30 to-sky-200/20 rounded-full blur-3xl"
          style={{ transform: `translateY(${scrollY * 0.1}px)` }}
        ></div>
        <div 
          className="absolute top-10 left-0 sm:top-auto sm:bottom-0 w-56 h-56 sm:w-80 sm:h-80 bg-gradient-to-tr from-blue-200/20 to-purple-200/20 rounded-full blur-3xl"
          style={{ transform: `translateY(${-scrollY * 0.15}px)` }}
        ></div>
        <div className="hidden sm:block absolute top-1/3 right-1/4 w-64 h-64 bg-gradient-to-br from-teal-200/20 to-cyan-200/15 rounded-full blur-2xl"></div>
      </div>

      {/* Navbar - Sleek and Professional */}
      <nav className={`z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 sticky top-0 transition-all duration-700 shadow-sm ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4 sm:space-x-12">
              <img 
                src="/images/logo.png" 
                alt="PeerPrep Logo" 
                className="h-10 sm:h-12 lg:h-28 w-auto object-contain"
              />
              <div className="hidden md:flex items-center space-x-8">
                <a href="#features" className="text-sm font-medium text-slate-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-200">Features</a>
                <a href="#platform" className="text-sm font-medium text-slate-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-200">Platform</a>
                <a href="#system" className="text-sm font-medium text-slate-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-200">System</a>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <DarkModeToggle />
              <button 
                onClick={handleLoginClick} 
                className="px-4 py-2 sm:px-6 sm:py-2.5 bg-sky-500 dark:bg-sky-600 text-white dark:text-white rounded-xl font-semibold text-sm sm:text-base shadow-md hover:shadow-lg hover:bg-sky-600 dark:hover:bg-sky-500 transform hover:scale-105 transition-all duration-300"
              >
                Login
              </button>
            </div>
          </div>

          {/* Mobile Tabs (3 across) */}
          <div className="md:hidden pb-3">
            <div className="grid grid-cols-3 gap-2">
              <a href="#features" className="text-center text-xs font-semibold text-slate-700 dark:text-gray-200 bg-slate-100/80 dark:bg-gray-800/80 border border-slate-200/60 dark:border-gray-700/60 rounded-lg py-2 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors duration-200">Features</a>
              <a href="#platform" className="text-center text-xs font-semibold text-slate-700 dark:text-gray-200 bg-slate-100/80 dark:bg-gray-800/80 border border-slate-200/60 dark:border-gray-700/60 rounded-lg py-2 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors duration-200">Platform</a>
              <a href="#system" className="text-center text-xs font-semibold text-slate-700 dark:text-gray-200 bg-slate-100/80 dark:bg-gray-800/80 border border-slate-200/60 dark:border-gray-700/60 rounded-lg py-2 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors duration-200">System</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Premium Design */}
      <section className={`relative z-10 pt-8 pb-14 sm:pt-12 sm:pb-20 transition-all duration-700 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left Content */}
            <div className="space-y-6 sm:space-y-8">
              <div 
                className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-sky-50 dark:from-gray-800 dark:to-gray-700 backdrop-blur-sm rounded-full px-5 py-2.5 border border-indigo-200/60 dark:border-gray-600 shadow-sm"
                style={{ animation: 'fadeInUp 0.6s ease-out' }}
              >
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-semibold bg-gradient-to-r from-indigo-600 to-sky-600 bg-clip-text text-transparent">
                  Complete Interview Preparation Platform
                </span>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h1 
                  className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-gray-100 leading-tight"
                  style={{ animation: 'fadeInUp 0.8s ease-out 0.2s backwards' }}
                >
                  Transform Your
                  <span className="block bg-gradient-to-r from-indigo-600 via-sky-600 to-blue-600 bg-clip-text text-transparent">
                    Interview Success
                  </span>
                </h1>

                <p 
                  className="text-base sm:text-lg text-slate-600 dark:text-gray-300 leading-relaxed max-w-xl"
                  style={{ animation: 'fadeInUp 1s ease-out 0.4s backwards' }}
                >
                  A comprehensive platform featuring mock interviews, skill exchange, live discussions, personalized learning paths, and intelligent feedback systems designed to accelerate your career growth.
                </p>
              </div>

              <div 
                className="flex flex-col sm:flex-row gap-4"
                style={{ animation: 'fadeInUp 1.2s ease-out 0.6s backwards' }}
              >
                <button 
                  onClick={handleLoginClick}
                  className="px-7 py-3 sm:px-10 sm:py-4 bg-sky-500 dark:bg-sky-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:bg-sky-600 dark:hover:bg-sky-500 transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  Login
                </button>
                <button 
                  onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}
                  className="px-7 py-3 sm:px-10 sm:py-4 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 rounded-xl font-semibold border-2 border-slate-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  Explore Features
                  <PlayCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Right - Enhanced Visual */}
            <div 
              className="relative max-w-md mx-auto lg:max-w-none lg:mx-0"
              style={{ animation: 'fadeInRight 1s ease-out 0.4s backwards' }}
            >
              {/* Floating Elements */}
              <div className="absolute -top-4 -left-4 sm:-top-6 sm:-left-6 w-16 h-16 sm:w-24 sm:h-24 bg-gradient-to-br from-indigo-400/20 to-sky-400/20 rounded-2xl blur-2xl animate-pulse"></div>
              <div className="absolute -top-4 -right-4 sm:-bottom-6 sm:-right-6 sm:top-auto w-20 h-20 sm:w-32 sm:h-32 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-2xl blur-2xl animate-pulse" style={{ animationDelay: '1s' }}></div>
              
              <div className="relative bg-gradient-to-br from-indigo-600 via-sky-600 to-blue-600 rounded-3xl p-1 shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-105">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 sm:p-8 backdrop-blur-xl">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                        <div className="absolute inset-0 w-3 h-3 bg-emerald-500 rounded-full animate-ping"></div>
                      </div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-gray-200">Live Mock Interview</span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg">
                      <Clock className="w-3 h-3 text-slate-600 dark:text-gray-300" />
                      <span className="text-xs font-medium text-slate-600 dark:text-gray-300">15:42</span>
                    </div>
                  </div>
                  
                  {/* Main Content */}
                  <div className="space-y-6">
                    {/* Video Area */}
                    <div className="bg-gradient-to-br from-indigo-50 via-sky-50 to-blue-50 dark:from-gray-700 dark:via-gray-700 dark:to-gray-700 rounded-2xl p-5 sm:p-8 border-2 border-indigo-100 dark:border-gray-600">
                      <div className="flex justify-center items-center gap-6">
                        {/* Interviewer */}
                        <div className="flex flex-col items-center transform hover:scale-110 transition-transform duration-300">
                          <div className="relative mb-3">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg rotate-3 hover:rotate-6 transition-transform duration-300">
                              <Video className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white"></div>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-800 dark:text-gray-200">Interviewer</p>
                            <p className="text-xs text-slate-500 dark:text-gray-400">Sarah M.</p>
                          </div>
                        </div>

                        {/* Connection Line */}
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 sm:w-16 h-0.5 bg-gradient-to-r from-indigo-400 to-sky-400"></div>
                          <Video className="w-6 h-6 text-indigo-500" />
                          <div className="w-10 sm:w-16 h-0.5 bg-gradient-to-r from-sky-400 to-indigo-400"></div>
                        </div>

                        {/* Candidate */}
                        <div className="flex flex-col items-center transform hover:scale-110 transition-transform duration-300">
                          <div className="relative mb-3">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg -rotate-3 hover:-rotate-6 transition-transform duration-300">
                              <Users className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white"></div>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-800 dark:text-gray-200">Candidate</p>
                            <p className="text-xs text-slate-500 dark:text-gray-400">Alex K.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Features Bar */}
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <div className="flex items-center gap-2 bg-indigo-50 dark:bg-gray-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg">
                        <MessageCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="text-xs font-medium text-indigo-700 dark:text-gray-200">Live Feedback</span>
                      </div>
                      <div className="flex items-center gap-2 bg-sky-50 dark:bg-gray-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg">
                        <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        <span className="text-xs font-medium text-sky-700 dark:text-gray-200">Analytics</span>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex justify-center gap-3 pt-2">
                      <button className="w-9 h-9 sm:w-11 sm:h-11 bg-slate-100 dark:bg-gray-700 rounded-xl flex items-center justify-center hover:bg-slate-200 dark:hover:bg-gray-600 transform hover:scale-110 transition-all duration-200 shadow-sm">
                        <div className="w-5 h-5 bg-slate-600 dark:bg-gray-300 rounded-sm"></div>
                      </button>
                      <button className="w-9 h-9 sm:w-11 sm:h-11 bg-slate-100 dark:bg-gray-700 rounded-xl flex items-center justify-center hover:bg-slate-200 dark:hover:bg-gray-600 transform hover:scale-110 transition-all duration-200 shadow-sm">
                        <div className="w-5 h-5 bg-slate-600 dark:bg-gray-300 rounded-sm"></div>
                      </button>
                      <button className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center hover:from-red-600 hover:to-red-700 transform hover:scale-110 transition-all duration-200 shadow-lg">
                        <div className="w-6 h-6 bg-white rounded-sm"></div>
                      </button>
                      <button className="w-9 h-9 sm:w-11 sm:h-11 bg-slate-100 dark:bg-gray-700 rounded-xl flex items-center justify-center hover:bg-slate-200 dark:hover:bg-gray-600 transform hover:scale-110 transition-all duration-200 shadow-sm">
                        <div className="w-5 h-5 bg-slate-600 dark:bg-gray-300 rounded-sm"></div>
                      </button>
                      <button className="w-9 h-9 sm:w-11 sm:h-11 bg-slate-100 dark:bg-gray-700 rounded-xl flex items-center justify-center hover:bg-slate-200 dark:hover:bg-gray-600 transform hover:scale-110 transition-all duration-200 shadow-sm">
                        <div className="w-5 h-5 bg-slate-600 dark:bg-gray-300 rounded-sm"></div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Overview */}
      <section id="features" className="relative z-10 py-16 sm:py-24 bg-gradient-to-br from-white via-indigo-50/30 to-sky-50/40 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900" data-animate>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className={`text-center mb-16 transition-all duration-1000 ${isInView('features') ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-100 to-sky-100 dark:from-gray-800 dark:to-gray-700 rounded-full px-5 py-2 mb-6">
              <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-semibold text-indigo-700 dark:text-gray-200">Core Platform Features</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 mb-6">
              Complete Interview
              <span className="block bg-gradient-to-r from-indigo-600 to-sky-600 bg-clip-text text-transparent">
                Preparation Ecosystem
              </span>
            </h2>
            <p className="text-lg text-slate-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Comprehensive suite of tools and features designed to transform your interview skills and accelerate career success
            </p>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-8 sm:mb-12">
            {[
              {
                icon: Video,
                title: 'Mock Interview System',
                description: 'Live video interviews with real-time collaboration, role assignment, and professional meeting environments',
                bgColor: 'from-indigo-50 to-indigo-100/50 dark:from-gray-800 dark:to-gray-700',
                iconBg: 'from-indigo-600 to-indigo-700',
                borderColor: 'border-indigo-200 dark:border-gray-600',
                delay: '0s'
              },
              {
                icon: Users,
                title: 'Intelligent Pairing',
                description: 'Advanced rotation algorithm ensuring unique, fair matches with automated role distribution',
                bgColor: 'from-sky-50 to-sky-100/50 dark:from-gray-800 dark:to-gray-700',
                iconBg: 'from-sky-600 to-sky-700',
                borderColor: 'border-sky-200 dark:border-gray-600',
                delay: '0.1s'
              },
              {
                icon: Calendar,
                title: 'Smart Scheduling',
                description: 'Time slot proposals, automated matching, meeting link generation with calendar integration',
                bgColor: 'from-blue-50 to-blue-100/50 dark:from-gray-800 dark:to-gray-700',
                iconBg: 'from-blue-600 to-blue-700',
                borderColor: 'border-blue-200 dark:border-gray-600',
                delay: '0.2s'
              },
                {
                  icon: MessageCircle,
                  title: 'Comprehensive Feedback',
                  description: 'Multi-criteria rating system with detailed analytics and constructive insights',
                  bgColor: 'from-teal-50 to-teal-100/50 dark:from-gray-800 dark:to-gray-700',
                  iconBg: 'from-teal-600 to-teal-700',
                  borderColor: 'border-teal-200 dark:border-gray-600',
                delay: '0.3s'
              },
                {
                  icon: BookOpen,
                  title: 'Learning Management',
                  description: 'Structured content hierarchy with progress tracking, video modules, and question banks',
                  bgColor: 'from-purple-50 to-purple-100/50 dark:from-gray-800 dark:to-gray-700',
                  iconBg: 'from-purple-600 to-purple-700',
                  borderColor: 'border-purple-200 dark:border-gray-600',
                delay: '0.4s'
              },
              {
                icon: Target,
                title: 'Event Management',
                description: 'Complete event lifecycle with templates, analytics, and participant management',
                bgColor: 'from-pink-50 to-pink-100/50 dark:from-gray-800 dark:to-gray-700',
                iconBg: 'from-pink-600 to-pink-700',
                borderColor: 'border-pink-200 dark:border-gray-600',
                delay: '0.5s'
              },
                {
                  icon: TrendingUp,
                  title: 'Progress Analytics',
                  description: 'Track performance metrics, topic completion, and skill development over time',
                  bgColor: 'from-emerald-50 to-emerald-100/50 dark:from-gray-800 dark:to-gray-700',
                  iconBg: 'from-emerald-600 to-emerald-700',
                  borderColor: 'border-emerald-200 dark:border-gray-600',
                delay: '0.6s'
              },
              {
                icon: Bell,
                title: 'Smart Notifications',
                description: 'Automated reminders, email notifications, and real-time updates for all activities',
                bgColor: 'from-orange-50 to-orange-100/50 dark:from-gray-800 dark:to-gray-700',
                iconBg: 'from-orange-600 to-orange-700',
                borderColor: 'border-orange-200 dark:border-gray-600',
                delay: '0.7s'
              },
              {
                icon: Shield,
                title: 'Secure Authentication',
                description: 'Multi-role access control with JWT tokens and mandatory password security',
                bgColor: 'from-slate-50 to-slate-100/50 dark:from-gray-800 dark:to-gray-700',
                iconBg: 'from-slate-600 to-slate-700',
                borderColor: 'border-slate-200 dark:border-gray-600',
                delay: '0.8s'
              }
            ].map((feature, index) => (
              <div
                key={index}
                data-animate
                className={`group relative bg-gradient-to-br ${feature.bgColor} rounded-xl sm:rounded-2xl border-2 ${feature.borderColor} p-3 sm:p-7 transform hover:-translate-y-2 hover:shadow-2xl transition-all duration-500 ${isInView('features') ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}
                style={{ transitionDelay: isInView('features') ? feature.delay : '0s' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-gray-600/20 dark:to-transparent rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative">
                  <div className={`w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br ${feature.iconBg} rounded-xl flex items-center justify-center mb-3 sm:mb-5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg`}>
                    <feature.icon className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <h3 className="text-xs sm:text-xl font-bold leading-tight text-slate-900 dark:text-gray-100 mb-0 sm:mb-3 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors duration-300">
                    {feature.title}
                  </h3>
                  <p className="hidden sm:block text-sm text-slate-600 dark:text-gray-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Capabilities */}
      <section id="platform" className="relative z-10 py-16 sm:py-24 bg-gradient-to-br from-slate-50 to-white dark:from-gray-900 dark:to-gray-800" data-animate>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className={`text-center mb-16 transition-all duration-1000 ${isInView('platform') ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-100 to-blue-100 dark:from-gray-800 dark:to-gray-700 rounded-full px-5 py-2 mb-6">
              <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-sm font-semibold text-sky-700 dark:text-gray-200">Platform Capabilities</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-gray-100 mb-6">
              Advanced Features for
              <span className="block bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                Every Learning Need
              </span>
            </h2>
          </div>

          {/* User Management */}
          <div className={`mb-16 transition-all duration-1000 delay-200 ${isInView('platform') ? 'translate-x-0 opacity-100' : '-translate-x-12 opacity-0'}`}>
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-slate-200 dark:border-gray-700 p-8 lg:p-12 hover:shadow-2xl transition-all duration-500">
              <div className="flex flex-col lg:flex-row gap-8 items-center">
                <div className="lg:w-1/3">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl mb-6">
                    <UserCheck className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-gray-100 mb-4">User Management</h3>
                  <p className="text-slate-600 dark:text-gray-300 leading-relaxed">
                    Comprehensive system for managing students, coordinators, and administrators with role-based access
                  </p>
                </div>
                <div className="lg:w-2/3 grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
                  {[
                    { icon: Upload, text: 'Bulk CSV student onboarding' },
                    { icon: Users, text: 'Coordinator directory & assignment' },
                    { icon: Shield, text: 'Multi-role authentication system' },
                    { icon: CheckCircle, text: 'Automated credential generation' },
                    { icon: Target, text: 'Teacher-student linking system' },
                    { icon: Award, text: 'Special student support' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 sm:gap-3 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-700 dark:to-gray-600 p-3 sm:p-4 rounded-xl hover:scale-105 transition-transform duration-300">
                      <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-gray-200 leading-snug">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Event & Scheduling */}
          <div className={`mb-16 transition-all duration-1000 delay-300 ${isInView('platform') ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0'}`}>
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-slate-200 dark:border-gray-700 p-8 lg:p-12 hover:shadow-2xl transition-all duration-500">
              <div className="flex flex-col lg:flex-row-reverse gap-8 items-center">
                <div className="lg:w-1/3">
                  <div className="w-20 h-20 bg-gradient-to-br from-sky-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl mb-6">
                    <Calendar className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-gray-100 mb-4">Event & Scheduling</h3>
                  <p className="text-slate-600 dark:text-gray-300 leading-relaxed">
                    Complete event lifecycle management with intelligent scheduling and automated coordination
                  </p>
                </div>
                <div className="lg:w-2/3 grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
                  {[
                    { icon: FileText, text: 'Event templates with PDF upload' },
                    { icon: Clock, text: 'Time slot proposal system' },
                    { icon: CheckCircle, text: 'Automated slot matching' },
                    { icon: Video, text: 'Meeting link auto-generation' },
                    { icon: Mail, text: 'ICS calendar file generation' },
                    { icon: BarChart3, text: 'Event analytics & export' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 sm:gap-3 bg-gradient-to-br from-sky-50 to-blue-50 dark:from-gray-700 dark:to-gray-600 p-3 sm:p-4 rounded-xl hover:scale-105 transition-transform duration-300">
                      <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-gray-200 leading-snug">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Learning System */}
          <div className={`transition-all duration-1000 delay-400 ${isInView('platform') ? 'translate-x-0 opacity-100' : '-translate-x-12 opacity-0'}`}>
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-slate-200 dark:border-gray-700 p-8 lg:p-12 hover:shadow-2xl transition-all duration-500">
              <div className="flex flex-col lg:flex-row gap-8 items-center">
                <div className="lg:w-1/3">
                  <div className="w-20 h-20 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl flex items-center justify-center shadow-xl mb-6">
                    <BookOpen className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-gray-100 mb-4">Learning System</h3>
                  <p className="text-slate-600 dark:text-gray-300 leading-relaxed">
                    Structured learning paths with comprehensive content management and progress tracking
                  </p>
                </div>
                <div className="lg:w-2/3 grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
                  {[
                    { icon: Layers, text: '4-level content hierarchy' },
                    { icon: PlayCircle, text: 'Video watch time tracking' },
                    { icon: FileText, text: 'PDF question banks per topic' },
                    { icon: TrendingUp, text: 'Progress tracking per topic' },
                    { icon: Star, text: 'Importance & difficulty levels' },
                    { icon: RefreshCw, text: 'Drag-and-drop reordering' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 sm:gap-3 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-700 dark:to-gray-600 p-3 sm:p-4 rounded-xl hover:scale-105 transition-transform duration-300">
                      <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-gray-200 leading-snug">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* System Features */}
      <section id="system" className="relative z-10 py-16 sm:py-24 bg-gradient-to-br from-indigo-50/40 via-white to-sky-50/30 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900" data-animate>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className={`text-center mb-16 transition-all duration-1000 ${isInView('system') ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-gray-800 dark:to-gray-700 rounded-full px-5 py-2 mb-6">
              <GitBranch className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-semibold text-purple-700 dark:text-gray-200">System Features</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-gray-100 mb-6">
              Enterprise-Grade
              <span className="block bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Infrastructure
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {[
              {
                icon: MessageCircle,
                title: 'Feedback Engine',
                features: ['5-criteria rating system', '100-point scale conversion', 'CSV export capability', 'Detailed review interface'],
                gradient: 'from-blue-600 to-cyan-600',
                bgGradient: 'from-blue-50 to-cyan-50'
              },
              {
                icon: RefreshCw,
                title: 'Pairing Algorithm',
                features: ['Rotation-based matching', 'No reciprocal pairs', 'Random shuffle fairness', 'Odd student handling'],
                gradient: 'from-violet-600 to-purple-600',
                bgGradient: 'from-violet-50 to-purple-50'
              },
              {
                icon: Bell,
                title: 'Notification System',
                features: ['Cron job automation', 'Email notifications', 'Feature toggles', 'Real-time updates'],
                gradient: 'from-orange-600 to-red-600',
                bgGradient: 'from-orange-50 to-red-50'
              },
              {
                icon: Shield,
                title: 'Security & Auth',
                features: ['JWT authentication', 'Password requirements', 'Role-based access', 'Protected routes'],
                gradient: 'from-emerald-600 to-green-600',
                bgGradient: 'from-emerald-50 to-green-50'
              }
            ].map((system, index) => (
              <div
                key={index}
                data-animate
                className={`group bg-gradient-to-br ${system.bgGradient} dark:from-gray-800 dark:to-gray-700 rounded-xl sm:rounded-2xl border-2 border-slate-200 dark:border-gray-600 p-4 sm:p-6 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 ${isInView('system') ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}
                style={{ transitionDelay: isInView('system') ? `${index * 0.1}s` : '0s' }}
              >
                <div className={`w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br ${system.gradient} rounded-xl flex items-center justify-center mb-3 sm:mb-5 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg`}>
                  <system.icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <h3 className="text-base sm:text-xl font-bold text-slate-900 dark:text-gray-100 mb-2 sm:mb-4 leading-tight">{system.title}</h3>
                <ul className="space-y-1.5 sm:space-y-2">
                  {system.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-slate-600 dark:text-gray-300">
                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Additional Features Grid */}
          <div className={`mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 transition-all duration-1000 delay-500 ${isInView('system') ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
            {[
              { icon: Upload, label: 'CSV Processing', color: 'from-indigo-600 to-indigo-700' },
              { icon: FileText, label: 'File Management', color: 'from-sky-600 to-sky-700' },
              { icon: BarChart3, label: 'Analytics Dashboard', color: 'from-purple-600 to-purple-700' },
              { icon: Lightbulb, label: 'Smart Insights', color: 'from-amber-600 to-amber-700' }
            ].map((item, idx) => (
              <div key={idx} className="group bg-white dark:bg-gray-800 rounded-xl border-2 border-slate-200 dark:border-gray-600 p-6 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className={`w-12 h-12 bg-gradient-to-br ${item.color} rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300`}>
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA - Enhanced */}
      <section className="relative z-10 py-16 sm:py-24 bg-gradient-to-br from-slate-900 via-indigo-900 to-sky-900 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-sky-500/20 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-5xl mx-auto text-center px-4 sm:px-6">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-5 py-2 mb-6 border border-white/20">
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span className="text-sm font-semibold text-white">Access The Platform</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              Ready to Continue Your
              <span className="block bg-gradient-to-r from-sky-300 to-blue-300 bg-clip-text text-transparent">
                Interview Journey?
              </span>
            </h2>
            <p className="text-xl text-indigo-200 mb-10 max-w-2xl mx-auto leading-relaxed">
              Access the platform to continue interview preparation, learning modules, events, and compiler practice in one place.
            </p>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12 max-w-4xl mx-auto">
            {[
              { icon: Video, label: 'Live Sessions' },
              { icon: Users, label: 'Smart Matching' },
              { icon: TrendingUp, label: 'Track Progress' },
              { icon: Award, label: 'Get Certified' }
            ].map((item, idx) => (
              <div key={idx} className="bg-white/10 dark:bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/20 dark:border-white/10 hover:bg-white/20 dark:hover:bg-white/10 transition-all duration-300 hover:scale-105">
                <item.icon className="w-8 h-8 text-sky-300 dark:text-sky-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-white">{item.label}</p>
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button 
              onClick={handleLoginClick}
              className="group px-8 py-4 sm:px-12 sm:py-5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-2xl font-bold text-base sm:text-lg shadow-2xl hover:shadow-sky-500/50 transform hover:scale-110 transition-all duration-300 flex items-center gap-3"
            >
              Login Now
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform duration-300" />
            </button>
            <button 
              onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 sm:px-12 sm:py-5 bg-white/10 dark:bg-white/5 backdrop-blur-sm text-white rounded-2xl font-semibold text-base sm:text-lg border-2 border-white/30 dark:border-white/20 hover:bg-white/20 dark:hover:bg-white/10 transition-all duration-300 flex items-center gap-3"
            >
              Learn More
              <Lightbulb className="w-5 h-5" />
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="mt-12 flex flex-wrap justify-center items-center gap-8 text-indigo-300 dark:text-indigo-400">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <span className="text-sm font-medium">Secure Platform</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Verified Users</span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5" />
              <span className="text-sm font-medium">Premium Features</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* Global Styles for Animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInRight {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}