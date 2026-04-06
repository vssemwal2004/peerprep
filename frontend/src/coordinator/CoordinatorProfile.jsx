import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { motion } from 'framer-motion';

export default function CoordinatorProfile() {
  const [user, setUser] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      setError('');
      try {
        const me = await api.me();
        setUser(me);
      } catch (e) {
        setError(e.message || 'Failed to load profile');
      }
    })();
  }, []);

  const onAvatarChange = (e) => {
    const file = e.target.files?.[0] || null;
    setAvatarFile(file);
  };

  const onUploadAvatar = async () => {
    if (!avatarFile) return;
    setAvatarUploading(true); setError(''); setSuccess('');
    try {
      const res = await api.updateMyAvatar(avatarFile);
      setSuccess('Profile picture updated');
      // Refresh
      const me = await api.me();
      setUser(me);
      if (me && me.avatarUrl !== undefined) {
        localStorage.setItem("coordinatorAvatarUrl", me.avatarUrl || "");
      }
      setAvatarFile(null);
    } catch (e) {
      setError(e.message || 'Failed to upload');
    } finally {
      setAvatarUploading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col pt-16">
        <div className="w-full max-w-3xl mx-auto px-4 py-12">
          <p className="text-slate-600 dark:text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col pt-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full px-6 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-6">
          {/* Avatar Section */}
          <div className="flex items-center gap-4 mb-6">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-gray-700" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center text-white font-bold text-2xl border border-slate-200 dark:border-gray-700">
                {user.name ? user.name.charAt(0).toUpperCase() : 'T'}
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400">Profile Picture</label>
              <div className="flex items-center gap-3 mt-1">
                <input type="file" accept="image/*" onChange={onAvatarChange} className="text-sm text-slate-700 dark:text-gray-300" />
                <button onClick={onUploadAvatar} disabled={avatarUploading || !avatarFile} className="px-3 py-2 text-sm rounded-md bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-800 disabled:opacity-60">
                  {avatarUploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100">My Profile</h2>
              <p className="text-slate-600 dark:text-gray-400 text-sm">Information uploaded by admin is visible by default. You can only update your profile picture.</p>
            </div>
          </div>

          {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
          {success && <div className="mb-3 text-sm text-emerald-600">{success}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400">Name</label>
              <div className="mt-1 text-slate-800 dark:text-gray-100">{user.name || '-'}</div>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400">Teacher ID</label>
              <div className="mt-1 text-slate-800 dark:text-gray-100">{user.teacherId || '-'}</div>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400">Email</label>
              <div className="mt-1 text-slate-800 dark:text-gray-100">{user.email || '-'}</div>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400">Department</label>
              <div className="mt-1 text-slate-800 dark:text-gray-100">{user.department || '-'}</div>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400">College</label>
              <div className="mt-1 text-slate-800 dark:text-gray-100">{user.college || '-'}</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
