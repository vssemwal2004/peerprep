/* eslint-disable no-unused-vars */
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpenCheck,
  Users2,
  CalendarDays,
  LogOut,
  Menu,
  X,
  GraduationCap,
  User,
  Lock,
  ChevronDown,
  Code2
} from "lucide-react";
import { useState, useEffect } from "react";
import DarkModeToggle from "./DarkModeToggle";
import { useAuth } from "../context/AuthContext";

export function StudentNavbar() {
  const location = useLocation();
  const { user } = useAuth();
  const [active, setActive] = useState(location.pathname);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Use AuthContext user data directly - no extra API call needed
  const studentName = user?.name || localStorage.getItem("studentName") || "Student";
  const studentEmail = user?.email || localStorage.getItem("studentEmail") || "email@example.com";
  const studentAvatarUrl = user?.avatarUrl || localStorage.getItem("studentAvatarUrl") || "";

  // Sync to localStorage for offline fallback
  useEffect(() => {
    if (user?.name) localStorage.setItem("studentName", user.name);
    if (user?.email) localStorage.setItem("studentEmail", user.email);
    if (user && Object.prototype.hasOwnProperty.call(user, "avatarUrl")) {
      localStorage.setItem("studentAvatarUrl", user.avatarUrl || "");
    }
  }, [user]);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
    setIsProfileOpen(false);
  }, [location.pathname]);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isProfileOpen && !event.target.closest(".desktop-profile-container")) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileOpen]);

  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("isStudent");
    localStorage.removeItem("studentName");
    localStorage.removeItem("studentEmail");
    localStorage.removeItem("studentAvatarUrl");
    navigate("/");
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const navItems = [
    { path: "/student/dashboard", label: "Dashboard", Icon: BookOpenCheck },
    { path: "/student/learning", label: "Learning Modules", Icon: GraduationCap },
    { path: "/student/session", label: "Feedback", Icon: CalendarDays },
    { path: "/problems", label: "Problems", Icon: Code2 },
  ];

  const isItemActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  // Animation variants
  const menuVariants = {
    closed: {
      x: "100%",
      opacity: 0,
      transition: { duration: 0.3, ease: "easeInOut" }
    },
    open: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.3, ease: "easeInOut" }
    }
  };

  const dropdownVariants = {
    closed: {
      opacity: 0,
      y: -10,
      transition: { duration: 0.2, ease: "easeInOut" }
    },
    open: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, ease: "easeInOut" }
    }
  };

  return (
    <motion.nav
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
    >
      <div className="w-full flex items-center justify-between h-14 px-4">
        {/* Brand Logo */}
        <div className="hidden sm:flex items-center">
          <img 
            src="/images/logo.png" 
            alt="PeerPrep Logo" 
            className="w-auto object-contain"
            style={{ height: '109px' }}
          />
        </div>

        {/* Center: Mobile Logo */}
        <div className="flex-1 flex justify-center sm:hidden">
          <img 
            src="/images/logo.png" 
            alt="PeerPrep Logo" 
            className="w-auto object-contain"
            style={{ height: '87px' }}
          />
        </div>

        {/* Right Side: Desktop Navigation + Mobile Buttons */}
        <div className="flex items-center gap-1">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-0">
            {navItems.map(({ path, label, Icon }) => {
              const isActive = isItemActive(path);
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setActive(path)}
                  className="relative"
                >
                  <div
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors mx-0.5 ${
                      isActive 
                        ? "bg-sky-50 dark:bg-sky-900 text-sky-600 dark:text-sky-400" 
                        : "text-gray-600 dark:text-gray-300 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="font-medium text-sm">{label}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Dark Mode Toggle */}
          <DarkModeToggle className="hidden md:flex ml-1" />

          {/* Desktop Profile */}
          <div className="hidden md:block relative desktop-profile-container ml-1">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800 text-gray-700 dark:text-white transition-all duration-200 border border-gray-200 dark:border-slate-700"
              >
                {studentAvatarUrl ? (
                  <img
                    src={studentAvatarUrl}
                    alt={studentName}
                    className="w-8 h-8 rounded-full object-cover border border-white/20"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-white font-semibold text-sm">
                    {studentName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden lg:block">
                  <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{studentName}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Student</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-300 transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isProfileOpen && (
                    <motion.div
                      variants={dropdownVariants}
                      initial="closed"
                      animate="open"
                      exit="closed"
                      className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50"
                    >
                    {/* Profile Header */}
                    <div className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/40 dark:to-blue-900/40 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        {studentAvatarUrl ? (
                          <img
                            src={studentAvatarUrl}
                            alt={studentName}
                            className="w-10 h-10 rounded-full object-cover border border-white/30"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold">
                            {studentName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">{studentName}</div>
                          <div className="text-xs text-slate-600 dark:text-gray-300 truncate">{studentEmail}</div>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                      <Link
                        to="/student/profile"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-white hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-sky-100 dark:group-hover:bg-slate-700 transition-colors">
                          <User className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium dark:text-white">Profile</div>
                          <div className="text-xs text-slate-500 dark:text-gray-300">View and edit your details</div>
                        </div>
                      </Link>
                      <Link
                        to="/student/change-password"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-white hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-sky-100 dark:group-hover:bg-slate-700 transition-colors">
                          <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium dark:text-white">Change Password</div>
                          <div className="text-xs text-slate-500 dark:text-gray-300">Update your account password</div>
                        </div>
                      </Link>

                      <button
                        onClick={() => {
                          setIsProfileOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-white hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                          <LogOut className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium text-red-600">Logout</div>
                          <div className="text-xs text-slate-500 dark:text-gray-300">Sign out of your account</div>
                        </div>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>



          {/* Mobile Menu Toggle */}
          <button
            onClick={toggleMenu}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {isMenuOpen ? (
              <X className="text-gray-700 dark:text-gray-300 w-4 h-4" />
            ) : (
              <Menu className="text-gray-700 dark:text-gray-300 w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleMenu}
              className="md:hidden fixed inset-0 z-40 bg-black/20"
            />
            
            {/* Menu Content */}
            <motion.div
              variants={menuVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className="md:hidden fixed top-14 right-0 bottom-0 z-50 w-64 max-w-full"
            >
              <div className="bg-white dark:bg-slate-900 h-full rounded-l-lg border-l border-slate-200 dark:border-slate-700 p-4 flex flex-col">
                {/* Mobile Menu Header - Profile Info */}
                <div className="pb-4 mb-3 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-3">
                    {studentAvatarUrl ? (
                      <img
                        src={studentAvatarUrl}
                        alt={studentName}
                        className="w-12 h-12 rounded-full object-cover border-2 border-sky-500"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold text-lg">
                        {studentName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">{studentName}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{studentEmail}</div>
                    </div>
                  </div>
                </div>

                {/* Mobile Menu Items */}
                <div className="flex-1 space-y-1">
                  {navItems.map(({ path, label, Icon }) => {
                    const isActive = isItemActive(path);
                    return (
                      <Link
                        key={path}
                        to={path}
                        onClick={() => setActive(path)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-sky-50 text-sky-600"
                            : "text-gray-600 hover:text-sky-500 hover:bg-sky-50"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium text-sm">{label}</span>
                        {isActive && (
                          <div className="ml-auto w-1.5 h-1.5 bg-sky-500 rounded-full" />
                        )}
                      </Link>
                    );
                  })}
                </div>

                {/* Mobile Menu Footer Actions */}
                <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <Link
                    to="/student/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-700 dark:text-white hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <User className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span className="font-medium text-sm">Profile</span>
                  </Link>
                  
                  <Link
                    to="/student/change-password"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-700 dark:text-white hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span className="font-medium text-sm">Change Password</span>
                  </Link>
                  
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="font-medium text-sm">Logout</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}


