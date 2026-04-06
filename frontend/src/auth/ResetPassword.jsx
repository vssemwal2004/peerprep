import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../utils/api';
import { motion } from 'framer-motion';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [passwordMatch, setPasswordMatch] = useState(null);
  const [passwordStrength, setPasswordStrength] = useState({
    hasMinLength: false,
    hasSpecialChar: false
  });

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setError('Invalid reset link. Please request a new password reset.');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams]);

  // Real-time password validation
  useEffect(() => {
    if (newPassword) {
      setPasswordStrength({
        hasMinLength: newPassword.length >= 8,
        hasSpecialChar: /[#*]/.test(newPassword)
      });
    } else {
      setPasswordStrength({
        hasMinLength: false,
        hasSpecialChar: false
      });
    }
  }, [newPassword]);

  // Real-time password matching
  useEffect(() => {
    if (confirmPassword) {
      setPasswordMatch(newPassword === confirmPassword);
    } else {
      setPasswordMatch(null);
    }
  }, [newPassword, confirmPassword]);

  const validatePassword = () => {
    if (!newPassword) {
      setError('Password is required');
      return false;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    if (!/[#*]/.test(newPassword)) {
      setError('Password must contain at least one * or #');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validatePassword()) return;

    setLoading(true);
    try {
      const response = await api.resetPassword(token, newPassword);
      setSuccess(true);
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 3000);
    } catch (err) {
      console.error('Password reset error:', err);
      const errorMessage = err.message || 'Failed to reset password. Please try again.';
      
      // More specific error messages
      if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        setError('Unable to connect to server. Please ensure the backend is running and try again.');
      } else if (errorMessage.includes('token') || errorMessage.includes('expired')) {
        setError('This reset link has expired or is invalid. Please request a new password reset.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-500 to-sky-600 p-8 text-white text-center">
            <Lock size={48} className="mx-auto mb-4" />
            <h1 className="text-3xl font-bold">Reset Password</h1>
            <p className="mt-2 text-sky-100">Enter your new password below</p>
          </div>

          {/* Body */}
          <div className="p-8">
            {success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  Password Reset Successful!
                </h2>
                <p className="text-gray-600 mb-4">
                  Your password has been updated successfully.
                </p>
                <p className="text-sm text-gray-500">
                  Redirecting to login page...
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock size={18} className="text-gray-400" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                      placeholder="Enter new password"
                      disabled={loading || !token}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        {passwordStrength.hasMinLength ? (
                          <CheckCircle size={14} className="text-green-500" />
                        ) : (
                          <XCircle size={14} className="text-red-500" />
                        )}
                        <span className={passwordStrength.hasMinLength ? 'text-green-600' : 'text-red-600'}>
                          At least 8 characters
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {passwordStrength.hasSpecialChar ? (
                          <CheckCircle size={14} className="text-green-500" />
                        ) : (
                          <XCircle size={14} className="text-red-500" />
                        )}
                        <span className={passwordStrength.hasSpecialChar ? 'text-green-600' : 'text-red-600'}>
                          Contains * or #
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock size={18} className="text-gray-400" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full pl-10 pr-10 py-3 border rounded-lg focus:ring-2 transition-all ${
                        passwordMatch === null
                          ? 'border-gray-300 focus:ring-sky-500 focus:border-sky-500'
                          : passwordMatch
                          ? 'border-green-500 focus:ring-green-500 focus:border-green-500'
                          : 'border-red-500 focus:ring-red-500 focus:border-red-500'
                      }`}
                      placeholder="Confirm new password"
                      disabled={loading || !token}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passwordMatch !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mt-2 flex items-center gap-2 text-xs ${
                        passwordMatch ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {passwordMatch ? (
                        <>
                          <CheckCircle size={14} className="text-green-500" />
                          <span>Passwords match!</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={14} className="text-red-500" />
                          <span>Passwords do not match</span>
                        </>
                      )}
                    </motion.div>
                  )}
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
                  >
                    <XCircle size={20} />
                    <span className="text-sm font-medium">{error}</span>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full py-3 px-6 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg font-bold text-lg hover:from-sky-600 hover:to-sky-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="text-sky-600 hover:text-sky-700 font-medium text-sm hover:underline"
                  >
                    Back to Login
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
