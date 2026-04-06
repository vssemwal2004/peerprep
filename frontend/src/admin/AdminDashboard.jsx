import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Calendar, UserCheck, MessageSquare, BarChart } from 'lucide-react';
import { useEffect } from 'react';

export default function AdminDashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to event management as the main admin page
    navigate('/admin/event', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto mt-20">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold text-slate-900 dark:text-gray-100 mb-8"
        >
          Admin Dashboard
        </motion.h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => navigate('/admin/onboarding')}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border border-slate-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-gray-100">Student Onboarding</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">Add new students</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => navigate('/admin/coordinators')}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border border-slate-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-gray-100">Add Coordinators</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">Manage coordinators</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            onClick={() => navigate('/admin/event')}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border border-slate-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-gray-100">Event Management</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">Create interviews</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            onClick={() => navigate('/admin/students')}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border border-slate-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                <BarChart className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-gray-100">Student Directory</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">View all students</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onClick={() => navigate('/admin/feedback')}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border border-slate-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-pink-600 dark:text-pink-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-gray-100">Feedback Review</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">View feedback</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
