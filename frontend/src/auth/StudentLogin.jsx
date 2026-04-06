import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';
import ForgotPasswordModal from './ForgotPasswordModal';

const DotLineBackground = () => (
  <div
    className="absolute inset-0"
    style={{
      backgroundColor: '#f8fafc',
      backgroundImage: [
        'radial-gradient(circle at 1px 1px, rgba(14,165,233,0.15) 1px, transparent 0)',
        'linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
        'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px)'
      ].join(', '),
      backgroundSize: '24px 24px, 120px 120px, 120px 120px',
      backgroundPosition: '0 0, 12px 12px, 12px 12px',
    }}
  />
);

const LoadingScreen = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-5 text-center">
    <img
      src="/images/logo.png"
      alt="Platform Logo"
      className="h-20 w-auto object-contain"
    />
    <div className="flex items-center gap-3 text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
      <span className="text-sm font-semibold">Signing you in...</span>
    </div>
  </div>
);

export default function StudentLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async () => {
    if (loading) return;
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('Email and password are required.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await api.login(trimmedEmail, trimmedPassword);
      const role = res.user?.role;

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', trimmedEmail);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      const userName = res.user?.name || 'User';
      const userEmail = res.user?.email || trimmedEmail;

      if (role === 'coordinator') {
        localStorage.setItem('coordinatorName', userName);
        localStorage.setItem('coordinatorEmail', userEmail);
      } else {
        localStorage.setItem('studentName', userName);
        localStorage.setItem('studentEmail', userEmail);
      }

      if (res.user?._id) {
        localStorage.setItem('userId', res.user._id);
      } else if (res.user?.id) {
        localStorage.setItem('userId', res.user.id);
      }

      await refreshUser();

      if (role === 'admin') {
        import('../admin/EventManagement');
        import('../admin/StudentDirectory');
      } else if (role === 'coordinator') {
        import('../coordinator/CoordinatorDashboard');
        import('../coordinator/CoordinatorStudents');
      } else {
        import('../student/StudentDashboard');
        import('../student/StudentInterview');
        import('../student/SessionAndFeedback');
      }

      if (role === 'admin') {
        localStorage.setItem('isAdmin', 'true');
        if (res.user?.mustChangePassword) {
          navigate('/admin/change-password', { replace: true });
        } else {
          navigate('/admin', { replace: true });
        }
      } else if (role === 'coordinator') {
        if (res.user?.mustChangePassword) {
          navigate('/coordinator/change-password', { replace: true });
        } else {
          navigate('/coordinator', { replace: true });
        }
      } else {
        localStorage.removeItem('isAdmin');
        if (res.user?.mustChangePassword) {
          navigate('/student/change-password', { replace: true });
        } else {
          navigate('/student/dashboard', { replace: true });
        }
      }
    } catch (e) {
      setError(e.message || 'Login failed');
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="relative min-h-screen w-screen overflow-hidden">
      <DotLineBackground />

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-10">
        <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white/70 shadow-2xl backdrop-blur">
          <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-2">
            <div className="hidden items-center justify-center bg-white/40 p-10 lg:flex">
              <div className="relative w-full max-w-md">
                <div className="aspect-square w-full overflow-hidden rounded-2xl bg-slate-100">
                  <img
                    src="/images/loginimg.webp"
                    alt="Student Login"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center p-8 sm:p-12">
              <div className="w-full max-w-md">
                {loading ? (
                  <LoadingScreen />
                ) : (
                  <>
                    <div className="text-center">
                      <img
                        src="/images/logo.png"
                        alt="Logo"
                        className="mx-auto h-20 w-auto object-contain"
                      />
                      <h1 className="mt-4 text-2xl font-bold text-slate-800">Student Portal</h1>
                      <p className="mt-2 text-sm text-slate-500">Access your learning platform</p>
                    </div>

                    <div className="mt-8 space-y-5">
                      <div className="group">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Email / Student ID / Coordinator ID
                        </label>
                        <div className="relative mt-2">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Mail size={16} className="text-slate-400" />
                          </div>
                          <input
                            type="text"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyPress={handleKeyPress}
                            className="w-full rounded-lg border border-slate-200 bg-white px-10 py-3 text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            placeholder="Enter email or ID"
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Password
                        </label>
                        <div className="relative mt-2">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Lock size={16} className="text-slate-400" />
                          </div>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyPress={handleKeyPress}
                            className="w-full rounded-lg border border-slate-200 bg-white px-10 py-3 text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            placeholder="Enter password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-slate-600"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 text-slate-500">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-300"
                          />
                          Remember me
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="font-semibold text-sky-600 hover:text-sky-700"
                        >
                          Forgot password?
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleLogin}
                        disabled={loading}
                        className="w-full rounded-lg bg-sky-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Sign In
                      </button>

                      {error && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm font-medium text-rose-600">
                          {error}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ForgotPasswordModal isOpen={showForgotPassword} onClose={() => setShowForgotPassword(false)} />
    </div>
  );
}


