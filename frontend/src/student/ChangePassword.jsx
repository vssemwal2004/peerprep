import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [passwordMatch, setPasswordMatch] = useState(null);
  const [passwordStrength, setPasswordStrength] = useState({
    hasMinLength: false,
    hasSpecialChar: false,
  });
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAssessmentOnly = user?.accessScope === 'assessment_only';
  const homePath = isAssessmentOnly ? '/student/assessments' : '/student/dashboard';

  useEffect(() => {
    setPasswordStrength({
      hasMinLength: newPassword.length >= 8,
      hasSpecialChar: /[@#]/.test(newPassword),
    });
  }, [newPassword]);

  useEffect(() => {
    setPasswordMatch(confirmPassword ? newPassword === confirmPassword : null);
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Enter all three password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (!/[@#]/.test(newPassword)) {
      setError('Your new password must contain @ or #.');
      return;
    }

    setIsLoading(true);
    try {
      await api.changeStudentPassword(currentPassword, newPassword, confirmPassword);
      setShowSuccessDialog(true);
    } catch (requestError) {
      setError(requestError.message || 'We could not update your password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueToLogin = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    await logout();
    navigate('/student', { replace: true });
  };

  const visibilityButton = (visible, toggle, label) => (
    <button
      type="button"
      onClick={toggle}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:text-slate-400 dark:hover:text-sky-400"
      aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}
      aria-pressed={visible}
    >
      {visible ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
    </button>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 font-sans dark:bg-slate-950 sm:py-10">
      <div className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-25" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-sky-200/60 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-blue-200/50 blur-3xl" />
      </div>

      <main className="relative mx-auto w-full max-w-lg">
        <button
          type="button"
          onClick={() => navigate(homePath)}
          className="mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-sky-300"
        >
          <ArrowLeft className="h-4 w-4" />
          {isAssessmentOnly ? 'Back to assessments' : 'Back to dashboard'}
        </button>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900">
          <header className="border-b border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50 px-5 py-5 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900 sm:px-6">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 shadow-sm shadow-sky-200 dark:shadow-none">
                <LockKeyhole className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Change password</h1>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">Create a secure password for your PeerPrep account.</p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
            <div className="flex gap-3 rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-sm text-slate-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-slate-300">
              <ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-sky-600 dark:text-sky-400" />
              <p>After your password is updated, you will be signed out. Sign in again with your new password.</p>
            </div>

            <div>
              <label htmlFor="current-password" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Current password</label>
              <div className="relative">
                <input id="current-password" type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-sky-500 dark:focus:ring-sky-950" placeholder="Enter your current password" autoComplete="current-password" required />
                {visibilityButton(showCurrentPassword, () => setShowCurrentPassword((value) => !value), 'current password')}
              </div>
            </div>

            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">New password</label>
              <div className="relative">
                <input id="new-password" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-sky-500 dark:focus:ring-sky-950" placeholder="Enter a new password" autoComplete="new-password" required />
                {visibilityButton(showNewPassword, () => setShowNewPassword((value) => !value), 'new password')}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
                <div className={`flex items-center gap-1.5 ${passwordStrength.hasMinLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}><Check className="h-3.5 w-3.5" />At least 8 characters</div>
                <div className={`flex items-center gap-1.5 ${passwordStrength.hasSpecialChar ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}><Check className="h-3.5 w-3.5" />Includes @ or #</div>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Confirm new password</label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={`h-11 w-full rounded-xl border bg-white px-3.5 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 dark:bg-slate-950 dark:text-white ${passwordMatch === false ? 'border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-600 dark:focus:ring-red-950' : passwordMatch === true ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-100 dark:border-emerald-600 dark:focus:ring-emerald-950' : 'border-slate-300 focus:border-sky-500 focus:ring-sky-100 dark:border-slate-700 dark:focus:border-sky-500 dark:focus:ring-sky-950'}`}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  aria-describedby={passwordMatch !== null ? 'password-match-status' : undefined}
                  required
                />
                {visibilityButton(showConfirmPassword, () => setShowConfirmPassword((value) => !value), 'confirmed password')}
              </div>
              {passwordMatch !== null && (
                <p id="password-match-status" className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${passwordMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {passwordMatch ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {passwordMatch ? 'Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row">
              <button type="button" onClick={() => navigate(homePath)} className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={isLoading} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                {isLoading ? 'Updating password…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      </main>

      {showSuccessDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="password-updated-title" aria-describedby="password-updated-description" className="w-full max-w-sm rounded-2xl border border-white/20 bg-white p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60"><CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /></div>
            <h2 id="password-updated-title" className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-white">Password updated</h2>
            <p id="password-updated-description" className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Your current session has expired for security. Continue to sign in with your new password.</p>
            <button type="button" onClick={handleContinueToLogin} disabled={isSigningOut} autoFocus className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:ring-offset-slate-900">
              {isSigningOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {isSigningOut ? 'Signing out…' : 'Continue to sign in'}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
