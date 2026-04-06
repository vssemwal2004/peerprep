import { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../utils/api';
import { useActivityLogger } from '../hooks/useActivityLogger';
import { Plus, Users } from 'lucide-react';

export default function CoordinatorOnboarding() {
  const { logCreate } = useActivityLogger();
  const [showForm, setShowForm] = useState(true);
  const [form, setForm] = useState({ coordinatorName: '', coordinatorEmail: '', coordinatorPassword: '', coordinatorID: '' });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setMsg('');
    setLoading(true);
    const { coordinatorName, coordinatorEmail, coordinatorID } = form;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!coordinatorName || !coordinatorEmail || !coordinatorID) {
      setMsg('Please fill all required fields: Name, Email, Coordinator ID');
      setLoading(false);
      return;
    }
    if (!emailRegex.test(coordinatorEmail)) {
      setMsg('Please enter a valid email address');
      setLoading(false);
      return;
    }
    try {
      const data = await api.createCoordinator(form);
      setMsg('Coordinator created successfully');
      setForm({ coordinatorName: '', coordinatorEmail: '', coordinatorPassword: '', coordinatorID: '' });
      
      // Log activity
      logCreate('COORDINATOR', data._id, `Created coordinator: ${coordinatorName} (${coordinatorEmail})`, {
        coordinatorID
      });
    } catch (err) {
      const em = err.message || 'Failed to create coordinator';
      if (em.includes('exists')) setMsg('A coordinator with this email or ID already exists');
      else setMsg(em);
    } finally {
      setLoading(false);
    }
  };

  const isValid = () => {
    const { coordinatorName, coordinatorEmail, coordinatorID } = form;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return coordinatorName && coordinatorEmail && coordinatorID && emailRegex.test(coordinatorEmail);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col items-center py-4 sm:py-6 px-3 sm:px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-3xl bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-3 sm:p-4 lg:p-6">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 mt-8 sm:mt-10">
          <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-indigo-800 dark:bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <Users className="text-white w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-gray-100">Add Coordinator</h1>
            <p className="text-slate-600 dark:text-gray-400 text-xs sm:text-sm mt-0.5 sm:mt-1 hidden sm:block">Create a coordinator account with required details.</p>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-3 mb-3 sm:mb-4">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowForm(!showForm)} className="flex items-center px-3 sm:px-4 py-2 bg-sky-500 dark:bg-sky-600 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm hover:bg-sky-600 dark:hover:bg-sky-700">
            <Plus className="w-4 h-4 mr-1 sm:mr-2" />
            {showForm ? 'Hide Form' : 'Add Coordinator'}
          </motion.button>
        </div>

        {showForm && (
          <div className="bg-slate-50 dark:bg-gray-700 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 border border-slate-200 dark:border-gray-600">
            <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-gray-100 mb-3 sm:mb-4">Coordinator Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'coordinatorName', label: 'Full Name *', placeholder: 'Jane Doe' },
                { key: 'coordinatorEmail', label: 'Email Address *', placeholder: 'jane@university.edu' },
                { key: 'coordinatorID', label: 'Coordinator ID *', placeholder: 'COO2024-001' },
                { key: 'coordinatorPassword', label: 'Password (defaults to Coordinator ID)', placeholder: '••••••••', type: 'password' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key} className="flex flex-col">
                  <label className="text-xs font-medium text-slate-700 dark:text-gray-300 mb-1">{label}</label>
                  <input type={type || 'text'} value={form[key]} onChange={(e) => handleChange(key, e.target.value)} placeholder={placeholder} className="p-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-600 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setShowForm(false); setMsg(''); }} className="px-4 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-gray-600">Cancel</motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={submit} disabled={!isValid() || loading} className={`px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm ${isValid() && !loading ? 'bg-sky-600 dark:bg-sky-600 hover:bg-sky-700 dark:hover:bg-sky-700' : 'bg-slate-400 dark:bg-gray-600 cursor-not-allowed'}`}>{loading ? 'Saving...' : 'Save Coordinator'}</motion.button>
            </div>
            {msg && (
              <p className={`mt-3 text-sm font-medium ${
                msg.toLowerCase().includes('exists') || msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error')
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}>
                {msg}
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
