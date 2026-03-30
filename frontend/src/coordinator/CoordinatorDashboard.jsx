import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../utils/api';
import { Users, Calendar, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CoordinatorDashboard() {
  const [students, setStudents] = useState([]);
  const [events, setEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentsData, eventsData] = await Promise.all([
        api.listAllStudents(),
        api.listEvents()
      ]);
      setStudents(studentsData.students || []);
      // backend returns an array of events directly; fallback if wrapped
      setEvents(Array.isArray(eventsData) ? eventsData : (eventsData.events || []));
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(s =>
    searchQuery === '' ||
    (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (s.studentId && s.studentId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 py-6 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-7xl mx-auto"
      >
        {/* Header */}
        <div className="mb-8 mt-16">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-100">Coordinator Dashboard</h1>
          <p className="text-slate-600 dark:text-gray-400 mt-2">Manage your assigned students and create interview events</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-slate-600 dark:text-gray-400 text-sm">Assigned Students</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-gray-100">{students.length}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-slate-600 dark:text-gray-400 text-sm">Active Events</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-gray-100">{events.length}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            onClick={() => navigate('/coordinator/event/create')}
            className="bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl shadow-sm p-6 cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-white/90 text-sm">Create New</p>
                <p className="text-xl font-bold text-white">Interview Event</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Events Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100">My Events</h2>
            
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-gray-400">Loading...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-gray-400">No events created yet</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((event) => (
                <motion.div
                  key={event._id}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => navigate(`/coordinator/event/${event._id}`)}
                  className="border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <h3 className="font-semibold text-slate-900 dark:text-gray-100 mb-2">{event.name}</h3>
                  <p className="text-sm text-slate-600 dark:text-gray-400 mb-3 line-clamp-2">{event.description}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
                    <span>{event.participants?.length || 0} participants</span>
                    <span>{new Date(event.createdAt).toLocaleDateString()}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
