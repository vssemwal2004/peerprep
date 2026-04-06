/* eslint-disable no-unused-vars */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useActivityLogger } from "../hooks/useActivityLogger";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertCircle, ToggleRight, ToggleLeft, Calendar, FileText, Upload, X, Download } from "lucide-react";
import { useToast } from '../components/CustomToast';
import DateTimePicker from "../components/DateTimePicker";

export default function EventManagement() {
  const { logCreate, logUpload } = useActivityLogger();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [template, setTemplate] = useState(null);
  const [msg, setMsg] = useState("");
  const [specialMode, setSpecialMode] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvValidationResults, setCsvValidationResults] = useState(null);
  const [showValidationPopup, setShowValidationPopup] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [userRole, setUserRole] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCsvValidating, setIsCsvValidating] = useState(false);
  const csvInputRef = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    // Determine user role from current path
    const path = window.location.pathname;
    if (path.startsWith('/coordinator')) {
      setUserRole('coordinator');
    } else if (path.startsWith('/admin')) {
      setUserRole('admin');
    }
  }, []);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setTemplate(null);
    setCsvFile(null);
    setCsvValidationResults(null);
    setShowValidationPopup(false);
    setCsvError("");
    setIsSubmitting(false);
    setIsCsvValidating(false);
    setMsg("");
    // Reset the file input
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  };

  // Handle CSV file selection and validate
  const handleCsvChange = async (e) => {
    const file = e.target.files?.[0] || null;
    setCsvFile(file);
    setCsvError("");
    setCsvValidationResults(null);
    setShowValidationPopup(false);
    setMsg("");
    if (!file) {
      setIsCsvValidating(false);
      setShowValidationPopup(false);
      return;
    }
    setIsCsvValidating(true);
    
    // Validate CSV
    try {
      const result = await api.checkSpecialEventCsv(file);
      setCsvValidationResults(result);
      
      // Treat any non-ready status as an error
      const hasErrors = result.results?.some(r => r.status !== 'ready');
      
      if (hasErrors) {
        setCsvError("CSV file has validation errors. Please review and fix them.");
        setShowValidationPopup(true);
        toast.error('CSV file has validation errors. Please download and fix the error rows.');
      } else {
        const readyCount = result.results?.filter(r => r.status === 'ready').length || 0;
        if (readyCount > 0) {
          toast.success(`CSV validated: ${readyCount} student(s) ready`);
        } else {
          setCsvError("No valid students found in CSV");
          setShowValidationPopup(true);
          toast.error('No valid students found in CSV.');
        }
      }
    } catch (err) {
      const message = err.message || 'Failed to validate CSV';
      setCsvError(message);
      toast.error('Failed to validate CSV: ' + message);
    } finally {
      setIsCsvValidating(false);
    }
  };

  const downloadCsvErrors = () => {
    if (!csvValidationResults?.results) return;
    
    const errorRows = csvValidationResults.results.filter(r => 
      r.status !== 'ready'
    );
    
    if (errorRows.length === 0) return;
    
    const headers = ['Row', 'Name', 'Email', 'Student ID', 'Status', 'Details'];
    const rows = errorRows.map(r => [
      r.row || '',
      r.name || '',
      r.email || '',
      r.studentid || '',
      r.status || '',
      r.missing ? r.missing.join(', ') : (r.message || '')
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'special-event-csv-errors.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  function localDateTimeNow() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  const [nowLocal, setNowLocal] = useState(localDateTimeNow());
  useEffect(() => {
    // Update minimum time more frequently (every 30 seconds) to keep restrictions current
    const t = setInterval(() => setNowLocal(localDateTimeNow()), 30000);
    return () => clearInterval(t);
  }, []);

  // Auto-dismiss toast after 3 seconds
  // react-toastify will auto-dismiss; no local timer needed

  function parseLocalDateTime(value) {
    // value expected in 'YYYY-MM-DDTHH:MM' format (datetime-local)
    if (!value) return NaN;
    const [datePart, timePart] = String(value).split('T');
    if (!datePart || !timePart) return NaN;
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    if ([y, m, d, hh, mm].some(v => Number.isNaN(v))) return NaN;
    return new Date(y, m - 1, d, hh, mm).getTime();
  }

  function toLocalInputValue(val) {
    if (!val) return '';
    // If already in YYYY-MM-DDTHH:MM return as-is
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) return val;
    // Try parsing ISO or other formats into a Date, then format as local YYYY-MM-DDTHH:MM
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setMsg(""); // Clear previous messages
    
    // Check CSV validation for special events
    if (specialMode && csvFile) {
      if (!csvValidationResults) {
        setMsg('Please wait for CSV validation to complete');
        toast.error('Please wait for CSV validation to complete before creating the event.');
        return;
      }
      
      const hasErrors = csvValidationResults.results?.some(r => r.status !== 'ready');
      
      if (hasErrors) {
        setMsg('Please fix CSV validation errors before creating the event');
        setShowValidationPopup(true);
        toast.error('Please fix CSV validation errors before creating the event.');
        return;
      }
    }
    
    // client-side validation: ensure start >= now and end >= start
    if (startDate) {
      const s = parseLocalDateTime(startDate);
      if (isNaN(s)) { 
        setMsg('Please select a valid start date and time'); 
        return; 
      }
      if (s < Date.now()) { 
        setMsg('Start date and time cannot be in the past. Please select a future date and time.'); 
        return; 
      }
    }
    if (startDate && endDate) {
      const s = parseLocalDateTime(startDate);
      const en = parseLocalDateTime(endDate);
      if (isNaN(s) || isNaN(en)) { 
        setMsg('Please select valid start and end dates'); 
        return; 
      }
      if (en < s) { 
        setMsg('End date must be after or equal to the start date'); 
        return; 
      }
    }
    
    setIsSubmitting(true);
    try {
      let ev;
      const payloadStart = startDate ? new Date(parseLocalDateTime(startDate)).toISOString() : undefined;
      const payloadEnd = endDate ? new Date(parseLocalDateTime(endDate)).toISOString() : undefined;

      if (specialMode) {
        const res = await api.createSpecialEvent({ name: title, description, startDate: payloadStart, endDate: payloadEnd, template, csv: csvFile });
        const eventName = res.name || title;
        const newId = res._id || res.eventId;
        
        // Show success toast
        toast.success(`Interview "${eventName}" created successfully!`);
        setMsg(''); // Clear any error messages
        resetForm();
        
        // Log activity
        logCreate('EVENT', newId, `Created special event: ${eventName}`, {
          eventType: 'special',
          participantCount: csvValidationResults?.validStudents?.length || 0,
          hasTemplate: !!template,
          startDate: payloadStart,
          endDate: payloadEnd
        });
        
        // Navigate based on user role
        const redirectPath = userRole === 'coordinator' ? `/coordinator/event/${newId}` : `/admin/event/${newId}`;
        if (newId) navigate(redirectPath, { state: { eventCreated: true } });
        
        // Show email notification
        toast.info('Invitation emails are being sent to participants...');
        
      } else {
        ev = await api.createEvent({ name: title, description, startDate: payloadStart, endDate: payloadEnd, template });
        const eventName = ev.name || title;
        
        // Show success toast
        toast.success(`Interview "${eventName}" created successfully!`);
        setMsg(''); // Clear any error messages
        resetForm();
        
        // Log activity
        logCreate('EVENT', ev._id, `Created event: ${eventName}`, {
          eventType: 'general',
          hasTemplate: !!template,
          startDate: payloadStart,
          endDate: payloadEnd
        });
        
        // Navigate based on user role
        const redirectPath = userRole === 'coordinator' ? `/coordinator/event/${ev._id}` : `/admin/event/${ev._id}`;
        if (ev && ev._id) navigate(redirectPath, { state: { eventCreated: true } });
        
        // Show email notification
        toast.info('Notification emails are being sent to all students...');
      }
    } catch (err) {
      const errorMessage = err?.message || 'Failed to create interview';
      let userFriendlyError = errorMessage;
      
      // Make error messages user-friendly
      if (errorMessage.includes('past')) {
        userFriendlyError = 'The selected date and time cannot be in the past. Please choose a future date.';
      } else if (errorMessage.includes('end') && errorMessage.includes('start')) {
        userFriendlyError = 'The end date must be after the start date. Please adjust your dates.';
      } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
        userFriendlyError = 'Please check that all fields are filled correctly';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        userFriendlyError = 'Unable to connect to the server. Please check your internet connection and try again.';
      } else if (errorMessage.includes('CSV') || errorMessage.includes('csv')) {
        userFriendlyError = 'There was an issue with the participant CSV file. Please check the format and try again.';
      }
      
      toast.error(userFriendlyError);
      setMsg(userFriendlyError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col pt-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex-1 w-full max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-4"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-3 sm:p-4">
          {/* Header Section */}
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-800 dark:bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Calendar className="text-white w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-slate-800 dark:text-gray-100">Create Interview</h2>
              <p className="text-slate-600 dark:text-gray-400 text-xs sm:text-sm hidden sm:block">Set up a new interview practice session</p>
            </div>
          </div>

          {/* Modern Sliding Switch for Interview Type */}
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="relative inline-flex items-center bg-slate-200 dark:bg-gray-700 rounded-full p-1 sm:p-1.5 w-full max-w-[14rem] sm:max-w-[18rem]">
              <div
                className={`absolute top-1 sm:top-1.5 bottom-1 sm:bottom-1.5 w-[calc(50%-0.25rem)] sm:w-[calc(50%-0.375rem)] bg-gradient-to-r transition-all duration-300 ease-in-out rounded-full shadow-lg ${
                  specialMode
                    ? 'left-[calc(50%+0.25rem)] sm:left-[calc(50%+0.375rem)] from-purple-500 to-purple-600'
                    : 'left-1 sm:left-1.5 from-sky-500 to-sky-600'
                }`}
              />
              <button
                type="button"
                onClick={() => { setSpecialMode(false); setMsg(""); }}
                className={`relative z-10 flex-1 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-full transition-colors duration-300 ${
                  !specialMode
                    ? 'text-white'
                    : 'text-slate-600 dark:text-gray-300 hover:text-slate-800 dark:hover:text-gray-100'
                }`}
              >
                Regular
              </button>
              <button
                type="button"
                onClick={() => { setSpecialMode(true); setMsg(""); }}
                className={`relative z-10 flex-1 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-full transition-colors duration-300 ${
                  specialMode
                    ? 'text-white'
                    : 'text-slate-600 dark:text-gray-300 hover:text-slate-800 dark:hover:text-gray-100'
                }`}
              >
                Special
              </button>
            </div>
          </div>

          <form onSubmit={handleCreateEvent}>
            <div className="space-y-3">
              {/* Event Title */}
              <div>
                <label className="block text-sm font-medium text-slate-800 dark:text-white mb-1">Interview Title</label>
                <input
                  type="text"
                  placeholder="Enter interview title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 p-2.5 rounded-lg focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-600 focus:border-sky-500 dark:focus:border-sky-600 text-slate-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-400 text-sm"
                  required
                />
              </div>

              {/* Event Description */}
              <div>
                <label className="block text-sm font-medium text-slate-800 dark:text-white mb-1">Interview Description</label>
                <textarea
                  placeholder="Describe the interview purpose and format..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 p-2.5 rounded-lg focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-600 focus:border-sky-500 dark:focus:border-sky-600 text-slate-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-400 text-sm"
                  rows="3"
                  required
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-800 dark:text-white mb-1">Start Date & Time</label>
                  <DateTimePicker
                    value={startDate}
                    onChange={(isoDateTime) => {
                      if (!isoDateTime) {
                        setStartDate('');
                        setMsg("");
                        return;
                      }
                      
                      const selectedTime = new Date(isoDateTime).getTime();
                      const currentTime = Date.now();
                      
                      if (!isNaN(selectedTime) && selectedTime < currentTime) {
                        setMsg('Start date and time cannot be in the past. Please select a future time.');
                        setStartDate('');
                        return;
                      }
                      
                      setStartDate(isoDateTime);
                      setMsg("");
                      
                      // If end date exists and is now before new start date, clear it
                      if (endDate && parseLocalDateTime(isoDateTime) > parseLocalDateTime(endDate)) {
                        setEndDate('');
                      }
                    }}
                    min={localDateTimeNow()}
                    placeholder="Select start date and time"
                    className="text-sm"
                  />
                  <p className="text-xs text-slate-500 dark:text-white mt-1">Past dates are disabled. Select current or future time only.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800 dark:text-white mb-1">End Date & Time</label>
                  <DateTimePicker
                    value={endDate}
                    onChange={(isoDateTime) => {
                      if (!isoDateTime) {
                        setEndDate('');
                        setMsg("");
                        return;
                      }
                      
                      const selectedEnd = new Date(isoDateTime).getTime();
                      const selectedStart = startDate ? new Date(startDate).getTime() : null;
                      
                      if (selectedStart && !isNaN(selectedStart) && !isNaN(selectedEnd) && selectedEnd < selectedStart) {
                        setMsg('End date and time must be after or equal to start date and time');
                        setEndDate('');
                        return;
                      }
                      
                      setEndDate(isoDateTime);
                      setMsg("");
                    }}
                    min={startDate || localDateTimeNow()}
                    disabled={!startDate}
                    placeholder="Select end date and time"
                    className="text-sm"
                  />
                  <p className="text-xs text-slate-500 dark:text-white mt-1">
                    {!startDate ? 'Select start date first' : 'Must be after or equal to start time'}
                  </p>
                </div>
              </div>

              {/* Template Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-800 dark:text-white mb-1">Interview Template (Optional)</label>
                <label className="flex items-center justify-center w-full p-3 bg-white dark:bg-gray-700 rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                  <Upload className="w-4 h-4 text-sky-500 dark:text-sky-400 mr-2" />
                  <span className="text-slate-700 dark:text-white text-sm font-medium">Upload Template File</span>
                  <input
                    type="file"
                    onChange={(e) => setTemplate(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                {template && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 mt-2 p-2 bg-sky-50 dark:bg-sky-900/30 rounded border border-sky-200 dark:border-sky-700"
                  >
                    <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span className="text-sky-800 dark:text-sky-300 text-sm font-medium">{template.name}</span>
                  </motion.div>
                )}
                <p className="text-xs text-slate-500 dark:text-white mt-1">
                  Upload a template file for interview questions or guidelines (optional)
                </p>
              </div>

              {/* Special Mode CSV Upload */}
              {specialMode && (
                <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-lg p-3">
                  <label className="block text-sm font-medium text-slate-800 dark:text-white mb-2">
                    <FileText className="w-4 h-4 inline mr-1 text-sky-600 dark:text-sky-400" />
                    Allowed Participants CSV
                  </label>
                  <label className="flex items-center justify-center w-full p-3 bg-white dark:bg-gray-700 rounded border border-sky-300 dark:border-sky-600 hover:bg-sky-50 dark:hover:bg-gray-600 cursor-pointer border-dashed">
                    <div className="text-center">
                      <FileText className="w-6 h-6 text-sky-500 dark:text-sky-400 mx-auto mb-1" />
                      <span className="text-slate-700 dark:text-white text-sm font-medium">Upload CSV File</span>
                    </div>
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleCsvChange}
                      className="hidden"
                      required={specialMode}
                    />
                  </label>
                  {csvFile && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-gray-700 rounded border border-sky-200 dark:border-sky-700">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-sky-600" />
                          <span className="text-sky-800 text-sm">{csvFile.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCsvFile(null);
                            setCsvValidationResults(null);
                            setCsvError("");
                            setShowValidationPopup(false);
                            if (csvInputRef.current) {
                              csvInputRef.current.value = '';
                            }
                          }}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                          title="Remove file"
                        >
                          <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                      {csvValidationResults && (
                        <button
                          type="button"
                          onClick={() => setShowValidationPopup(true)}
                          className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 underline"
                        >
                          View validation results ({csvValidationResults.count} rows)
                        </button>
                      )}
                    </div>
                  )}
                  {csvError && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                      {csvError}
                    </div>
                  )}
                  {!csvError && isCsvValidating && (
                    <div className="mt-2 text-xs text-slate-600 dark:text-gray-300">
                      Validating CSV, please wait...
                    </div>
                  )}
                  <div className="mt-2">
                    <a
                      href="/sample-students.csv"
                      download
                      className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 underline"
                    >
                      <Download className="w-3 h-3" />
                      Download Sample CSV
                    </a>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full p-3 rounded-lg font-medium text-white text-sm transition-colors ${
                  isSubmitting
                    ? 'bg-slate-300 dark:bg-gray-600 cursor-not-allowed'
                    : specialMode
                      ? 'bg-indigo-800 dark:bg-indigo-700 hover:bg-indigo-900 dark:hover:bg-indigo-800'
                      : 'bg-sky-500 dark:bg-sky-600 hover:bg-sky-600 dark:hover:bg-sky-700'
                }`}
              >
                {isSubmitting ? 'Creating...' : specialMode ? 'Create Special Interview' : 'Create Interview'}
              </button>

              {/* Help Text */}
              <p className="text-xs text-slate-500 dark:text-gray-400 text-center">
                {specialMode
                  ? 'Pairs are auto-generated among invited participants'
                  : 'Pairs are auto-generated among all students'}
              </p>
            </div>
          </form>

          {/* Status Message */}
          <AnimatePresence>
            {msg && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className={`flex items-center justify-center text-sm p-3 rounded-lg mt-3 ${
                  msg.toLowerCase().includes('success') || msg.toLowerCase().includes('created')
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}
              >
                {msg.toLowerCase().includes('success') || msg.toLowerCase().includes('created') ? (
                  <CheckCircle className="w-4 h-4 mr-2" />
                ) : (
                  <AlertCircle className="w-4 h-4 mr-2" />
                )}
                {msg}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* CSV Validation Popup Modal */}
      <AnimatePresence>
        {showValidationPopup && csvValidationResults && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowValidationPopup(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden"
            >
              {/* Header */}
              <div className="bg-sky-500 dark:bg-sky-600 text-white px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">CSV Validation Results</h2>
                <button
                  onClick={() => setShowValidationPopup(false)}
                  className="text-white hover:text-sky-100 dark:hover:text-sky-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                {/* Summary */}
                <div className="mb-4 flex gap-4">
                  <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {csvValidationResults.results?.filter(r => r.status === 'ready').length || 0}
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-500">Ready to create</div>
                  </div>
                  <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                      {csvValidationResults.results?.filter(r => r.status !== 'ready').length || 0}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-500">Errors</div>
                  </div>
                </div>

                {/* Download Errors Button */}
                {csvValidationResults.results?.some(r => r.status !== 'ready') && (
                  <button
                    onClick={downloadCsvErrors}
                    className="mb-4 flex items-center gap-2 px-4 py-2 bg-red-500 dark:bg-red-600 text-white rounded hover:bg-red-600 dark:hover:bg-red-700 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download Errors CSV
                  </button>
                )}

                {/* Results Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200 dark:border-gray-700 rounded-lg">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-gray-700 text-left text-slate-700 dark:text-gray-300">
                        <th className="py-2 px-3 text-xs font-semibold w-16">Row</th>
                        <th className="py-2 px-3 text-xs font-semibold min-w-[120px]">Name</th>
                        <th className="py-2 px-3 text-xs font-semibold min-w-[180px]">Email</th>
                        <th className="py-2 px-3 text-xs font-semibold w-24">Student ID</th>
                        <th className="py-2 px-3 text-xs font-semibold w-32">Status</th>
                        <th className="py-2 px-3 text-xs font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvValidationResults.results.map((r, i) => (
                        <tr
                          key={i}
                          className={`border-t border-slate-100 dark:border-gray-700 ${
                            r.status !== 'ready' ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-slate-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <td className="py-2 px-3 text-xs text-slate-600 dark:text-gray-400">{r.row || '-'}</td>
                          <td className="py-2 px-3 text-xs text-slate-800 dark:text-gray-200">{r.name || '-'}</td>
                          <td className="py-2 px-3 text-xs text-slate-800 dark:text-gray-200">{r.email || '-'}</td>
                          <td className="py-2 px-3 text-xs text-slate-800 dark:text-gray-200">{r.studentid || '-'}</td>
                          <td className={`py-2 px-3 text-xs font-medium ${
                            r.status === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {r.status}
                          </td>
                          <td className="py-2 px-3 text-xs text-slate-600 dark:text-gray-400">
                            {r.missing ? `Missing: ${r.missing.join(', ')}` : r.message || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 dark:bg-gray-700 px-6 py-4 flex justify-end gap-3 border-t border-slate-200 dark:border-gray-600">
                <button
                  onClick={() => setShowValidationPopup(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-gray-600 text-slate-700 dark:text-gray-200 rounded hover:bg-slate-300 dark:hover:bg-gray-500 text-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* react-toastify handles toasts globally */}
    </div>
  );
}