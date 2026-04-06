import React, { useState } from 'react';
import { api } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

export default function AdminChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordMatch, setPasswordMatch] = useState(null);
  const [passwordStrength, setPasswordStrength] = useState({
    hasMinLength: false,
    hasSpecialChar: false
  });
  const navigate = useNavigate();

  // Real-time password validation
  React.useEffect(() => {
    if (newPassword) {
      setPasswordStrength({
        hasMinLength: newPassword.length >= 8,
        hasSpecialChar: /[@#]/.test(newPassword)
      });
    } else {
      setPasswordStrength({
        hasMinLength: false,
        hasSpecialChar: false
      });
    }
  }, [newPassword]);

  // Real-time password matching
  React.useEffect(() => {
    if (confirmPassword) {
      setPasswordMatch(newPassword === confirmPassword);
    } else {
      setPasswordMatch(null);
    }
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      setIsLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      setIsLoading(false);
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      setIsLoading(false);
      return;
    }
    if (!/[@#]/.test(newPassword)) {
      setError('New password must contain @ or #');
      setIsLoading(false);
      return;
    }

    try {
      await api.changeAdminPassword(currentPassword, newPassword, confirmPassword);
      setSuccess('Password changed successfully!');
      setTimeout(() => {
        navigate('/admin/event', { replace: true });
      }, 1500);
    } catch (err) {
      setSuccess('');
      setError(err.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-3 sm:px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        {/* Back Button */}
        <button
          onClick={() => navigate('/admin/event')}
          className="mb-4 sm:mb-6 flex items-center gap-2 text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs sm:text-sm font-medium">Back to Dashboard</span>
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 border-blue-100 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-700 dark:to-gray-700 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 border-b-2 border-blue-200 dark:border-gray-600">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-blue-500 dark:bg-blue-600 rounded-lg sm:rounded-xl shadow-md flex-shrink-0">
                <Lock className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 dark:text-gray-100">Change Password</h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-gray-400 mt-0.5 sm:mt-1 hidden sm:block">Update your admin account credentials</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-blue-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-600 focus:border-blue-400 dark:focus:border-blue-600 transition-all pr-12 bg-blue-50/30 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-blue-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-600 focus:border-blue-400 dark:focus:border-blue-600 transition-all pr-12 bg-blue-50/30 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  placeholder="Enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    {passwordStrength.hasMinLength ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : (
                      <AlertCircle size={14} className="text-red-500" />
                    )}
                    <span className={passwordStrength.hasMinLength ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      At least 8 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {passwordStrength.hasSpecialChar ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : (
                      <AlertCircle size={14} className="text-red-500" />
                    )}
                    <span className={passwordStrength.hasSpecialChar ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      Contains @ or #
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 transition-all pr-12 bg-blue-50/30 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 ${
                    passwordMatch === null
                      ? 'border-blue-200 dark:border-gray-600 focus:ring-blue-400 dark:focus:ring-blue-600 focus:border-blue-400 dark:focus:border-blue-600'
                      : passwordMatch
                      ? 'border-green-500 focus:ring-green-500 focus:border-green-500'
                      : 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  }`}
                  placeholder="Confirm new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {passwordMatch !== null && (
                <div className={`mt-2 flex items-center gap-2 text-xs ${
                  passwordMatch ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {passwordMatch ? (
                    <>
                      <CheckCircle size={14} className="text-green-500" />
                      <span>Passwords match!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} className="text-red-500" />
                      <span>Passwords do not match</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-red-800 dark:text-red-300 text-sm">Error</div>
                  <div className="text-red-700 dark:text-red-400 text-sm mt-0.5">{error}</div>
                </div>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-green-800 dark:text-green-300 text-sm">Success</div>
                  <div className="text-green-700 dark:text-green-400 text-sm mt-0.5">{success}</div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              {/* Cancel Button */}
              <button
                type="button"
                onClick={() => navigate('/admin/event')}
                className="flex-1 py-3 px-4 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200 rounded-lg font-semibold hover:bg-slate-200 dark:hover:bg-gray-600 transition-all border-2 border-slate-200 dark:border-gray-600"
              >
                Cancel
              </button>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:to-blue-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Updating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4" />
                    Update Password
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
