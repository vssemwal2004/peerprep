import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Menu, X, Users, CalendarDays, User, Lock, ChevronDown, LayoutDashboard, BookOpen, MessageSquare, Activity, Database } from "lucide-react";
import { useState, useEffect } from "react";
import DarkModeToggle from "../components/DarkModeToggle";
import { useAuth } from "../context/AuthContext";

export function CoordinatorNavbar() {
  const location = useLocation();
  const { user } = useAuth();
  const [active, setActive] = useState(location.pathname);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Use AuthContext user data directly - no extra API call needed
  const coordinatorName = user?.name || localStorage.getItem("coordinatorName") || "Coordinator";
  const coordinatorEmail = user?.email || localStorage.getItem("coordinatorEmail") || "";
  const coordinatorAvatarUrl = user?.avatarUrl || localStorage.getItem("coordinatorAvatarUrl") || "";

  // Sync to localStorage for offline fallback
  useEffect(() => {
    if (user?.name) localStorage.setItem("coordinatorName", user.name);
    if (user?.email) localStorage.setItem("coordinatorEmail", user.email);
    if (user && Object.prototype.hasOwnProperty.call(user, "avatarUrl")) {
      localStorage.setItem("coordinatorAvatarUrl", user.avatarUrl || "");
    }
  }, [user]);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isProfileOpen && !event.target.closest(".profile-container")) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileOpen]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("coordinatorName");
    localStorage.removeItem("coordinatorEmail");
    localStorage.removeItem("coordinatorAvatarUrl");
    window.location.href = "/";
  };

  const navItems = [
    { path: "/coordinator/students", label: "My Students", Icon: Users },
    { path: "/coordinator/subjects", label: "Learning Modules", Icon: BookOpen },
    { path: "/coordinator/database", label: "Registered Courses", Icon: Database },
    { path: "/coordinator/feedback", label: "Feedback", Icon: MessageSquare },
  ];

  return (
    <motion.nav
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
    >
      <div className="w-full flex items-center h-16 px-4 sm:px-6">
        {/* Logo */}
        <motion.div className="hidden sm:flex items-center min-w-[200px]" whileHover={{ scale: 1.02 }}>
          <img src="/images/logo.png" alt="PeerPrep Logo" className="w-auto object-contain" style={{ height: '120px' }} />
        </motion.div>

        <div className="flex-1 flex justify-center sm:hidden">
          <img src="/images/logo.png" alt="PeerPrep Logo" className="w-auto object-contain" style={{ height: '99px' }} />
        </div>

        {/* Desktop Navigation - Left aligned after logo */}
        <div className="hidden md:flex items-center flex-1 gap-2 ml-4">
          {/* Scheduled Interview */}
          <Link to="/coordinator" onClick={() => setActive("/coordinator")}>
            <motion.div
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                location.pathname === "/coordinator" ? "bg-sky-50 dark:bg-gray-800 text-sky-600 dark:text-sky-400" : "text-gray-600 dark:text-gray-300 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-gray-800"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span className="font-medium text-sm">Scheduled Interview</span>
              {location.pathname === "/coordinator" && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute inset-0 border-2 border-white/40 dark:border-gray-600/40 rounded-xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.div>
          </Link>

          {/* Create Interview */}
          <Link to="/coordinator/event/create" onClick={() => setActive("/coordinator/event/create")}>
            <motion.div
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                location.pathname === "/coordinator/event/create" ? "bg-sky-50 dark:bg-gray-800 text-sky-600 dark:text-sky-400" : "text-gray-600 dark:text-gray-300 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-gray-800"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span className="font-medium text-sm">Create Interview</span>
              {location.pathname === "/coordinator/event/create" && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute inset-0 border-2 border-white/40 dark:border-gray-600/40 rounded-xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.div>
          </Link>

            {/* Other Nav Items */}
            {navItems.map(({ path, label, Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link key={path} to={path} onClick={() => setActive(path)}>
                  <motion.div
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      isActive ? "bg-sky-50 dark:bg-gray-800 text-sky-600 dark:text-sky-400" : "text-gray-600 dark:text-gray-300 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium text-sm">{label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="absolute inset-0 border-2 border-white/40 dark:border-gray-600/40 rounded-xl"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </motion.div>
                </Link>
              );
            })}
        </div>

        {/* Desktop Profile & Dark Mode - Right side with spacing */}
        <div className="hidden md:flex items-center gap-3 ml-auto pl-8">
          <DarkModeToggle />

          <div className="relative profile-container">
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-sky-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-all duration-200 border border-gray-200 dark:border-gray-700"
              >
                {coordinatorAvatarUrl ? (
                  <img
                    src={coordinatorAvatarUrl}
                    alt={coordinatorName}
                    className="w-8 h-8 rounded-full object-cover border border-white/20"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold text-sm">
                    {coordinatorName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden lg:block">
                  <div className="font-semibold text-sm text-slate-800 dark:text-gray-200">{coordinatorName}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-400">Coordinator</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-gray-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
              </motion.button>

              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 overflow-hidden z-50"
                  >
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-gray-700 dark:to-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        {coordinatorAvatarUrl ? (
                          <img
                            src={coordinatorAvatarUrl}
                            alt={coordinatorName}
                            className="w-10 h-10 rounded-full object-cover border border-white/30"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold">
                            {coordinatorName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-gray-100 truncate">{coordinatorName}</div>
                          <div className="text-xs text-slate-600 dark:text-gray-400 truncate">{coordinatorEmail}</div>
                        </div>
                      </div>
                    </div>

                    <div className="py-2">
                      <Link
                        to="/coordinator/profile"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-gray-700 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-emerald-100 dark:group-hover:bg-gray-600">
                          <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">Profile</div>
                          <div className="text-xs text-slate-500 dark:text-gray-400">View your profile</div>
                        </div>
                      </Link>

                      <Link
                        to="/coordinator/activity"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-gray-700 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-purple-100 dark:group-hover:bg-gray-600">
                          <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">Activity Log</div>
                          <div className="text-xs text-slate-500 dark:text-gray-400">View your activity history</div>
                        </div>
                      </Link>

                      <Link
                        to="/coordinator/change-password"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-gray-700 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-sky-100 dark:group-hover:bg-gray-600">
                          <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">Change Password</div>
                          <div className="text-xs text-slate-500 dark:text-gray-400">Update your password</div>
                        </div>
                      </Link>

                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-red-100 dark:group-hover:bg-red-900/50">
                          <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium text-red-600 dark:text-red-400">Logout</div>
                          <div className="text-xs text-slate-500 dark:text-gray-400">Sign out of your account</div>
                        </div>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
        </div>

        {/* Mobile Profile & Menu */}
        <div className="md:hidden flex items-center gap-3">
          <div className="relative profile-container">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 text-white font-semibold text-sm shadow-md overflow-hidden"
            >
              {coordinatorAvatarUrl ? (
                <img
                  src={coordinatorAvatarUrl}
                  alt={coordinatorName}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                coordinatorName.charAt(0).toUpperCase()
              )}
            </motion.button>

            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 overflow-hidden z-50"
                >
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-gray-700 dark:to-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      {coordinatorAvatarUrl ? (
                        <img
                          src={coordinatorAvatarUrl}
                          alt={coordinatorName}
                          className="w-10 h-10 rounded-full object-cover border border-white/30"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold">
                          {coordinatorName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-gray-100 truncate">{coordinatorName}</div>
                        <div className="text-xs text-slate-600 dark:text-gray-400 truncate">{coordinatorEmail}</div>
                      </div>
                    </div>
                  </div>

                  <div className="py-2">
                    <Link
                      to="/coordinator/profile"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-gray-700 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-emerald-100 dark:group-hover:bg-gray-600">
                        <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Profile</div>
                        <div className="text-xs text-slate-500 dark:text-gray-400">View your profile</div>
                      </div>
                    </Link>

                    <Link
                      to="/coordinator/activity"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-gray-700 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-purple-100 dark:group-hover:bg-gray-600">
                        <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Activity Log</div>
                        <div className="text-xs text-slate-500 dark:text-gray-400">View your activity history</div>
                      </div>
                    </Link>

                    <Link
                      to="/coordinator/change-password"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-gray-700 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-sky-100 dark:group-hover:bg-gray-600">
                        <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Change Password</div>
                        <div className="text-xs text-slate-500 dark:text-gray-400">Update your password</div>
                      </div>
                    </Link>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-red-100 dark:group-hover:bg-red-900/50">
                        <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-medium text-red-600 dark:text-red-400">Logout</div>
                        <div className="text-xs text-slate-500 dark:text-gray-400">Sign out of your account</div>
                      </div>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
          >
            {isMenuOpen ? <X className="text-gray-700 dark:text-gray-300 w-5 h-5" /> : <Menu className="text-gray-700 dark:text-gray-300 w-5 h-5" />}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              className="md:hidden fixed top-16 right-0 bottom-0 z-50 w-80 max-w-full bg-white dark:bg-gray-900 rounded-l-2xl shadow-2xl p-6"
            >
              <div className="flex-1 space-y-2">
                {/* Scheduled Interview */}
                <Link
                  to="/coordinator"
                  onClick={() => setActive("/coordinator")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    location.pathname === "/coordinator" ? "bg-sky-50 dark:bg-gray-800 text-sky-600 dark:text-sky-400" : "text-gray-600 dark:text-gray-300 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span className="font-medium text-sm">Scheduled Interview</span>
                  {location.pathname === "/coordinator" && <div className="ml-auto w-2 h-2 bg-sky-500 dark:bg-sky-400 rounded-full" />}
                </Link>

                {/* Create Interview */}
                <Link
                  to="/coordinator/event/create"
                  onClick={() => setActive("/coordinator/event/create")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    location.pathname === "/coordinator/event/create" ? "bg-sky-50 dark:bg-gray-800 text-sky-600 dark:text-sky-400" : "text-gray-600 dark:text-gray-300 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span className="font-medium text-sm">Create Interview</span>
                  {location.pathname === "/coordinator/event/create" && <div className="ml-auto w-2 h-2 bg-sky-500 dark:bg-sky-400 rounded-full" />}
                </Link>

                {/* Other Nav Items */}
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  {navItems.map(({ path, label, Icon }) => {
                    const isActive = location.pathname === path;
                    return (
                      <Link
                        key={path}
                        to={path}
                        onClick={() => setActive(path)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                          isActive ? "bg-sky-50 dark:bg-gray-800 text-sky-600 dark:text-sky-400" : "text-gray-600 dark:text-gray-300 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium text-sm">{label}</span>
                        {isActive && <div className="ml-auto w-2 h-2 bg-sky-500 dark:bg-sky-400 rounded-full" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
