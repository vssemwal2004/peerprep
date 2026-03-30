/* eslint-disable no-unused-vars */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../utils/api";
import { useActivityLogger } from "../hooks/useActivityLogger";
import { useToast } from "../components/CustomToast";
import { Upload, CheckCircle, AlertCircle, Plus, Loader2, FileText, Download, Users, BookOpen, Shield, ArrowRight, X } from "lucide-react";

export default function StudentOnboarding() {
  const { logBulkCreate, logCreate, logUpload } = useActivityLogger();
  const toast = useToast();
  const [csvFile, setCsvFile] = useState(null);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const [clientErrors, setClientErrors] = useState([]);
  const [showSingleForm, setShowSingleForm] = useState(false);
  const [singleForm, setSingleForm] = useState({ course: '', name: '', email: '', studentid: '', branch: '', college: '', teacherid: '', semester: '', group: '' });
  const [singleMsg, setSingleMsg] = useState('');
  const [singleLoading, setSingleLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [openTabs, setOpenTabs] = useState([]); // [{ key, label, data }]
  const [activeTab, setActiveTab] = useState(null); // key

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const errorsByRow = clientErrors.reduce((acc, cur) => {
    const msg = cur.details ? (Array.isArray(cur.details) ? cur.details.join(', ') : cur.details) : cur.error;
    if (!acc[cur.row]) acc[cur.row] = [];
    acc[cur.row].push(msg || cur.error);
    return acc;
  }, {});

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange({ target: { files: e.dataTransfer.files } });
    }
  };

  function downloadErrorsCsv() {
    if (!students || students.length === 0) return;
    const headerKeys = Object.keys(students[0]).filter((k) => k !== '__row');
    const header = [...headerKeys, 'error'];
    const rows = [];
    for (const s of students) {
      const rowNum = s.__row;
      const errs = errorsByRow[rowNum];
      if (!errs) continue;
      const values = headerKeys.map((k) => `"${(s[k] ?? '').toString().replace(/"/g, '""')}"`);
      values.push(`"${errs.join('; ').replace(/"/g, '""')}"`);
      rows.push(values.join(','));
    }
    const csv = header.map((h) => `"${h}"`).join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `students-errors.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const handleFileChange = (e) => {
    setError("");
    setSuccess("");
    setUploadSuccess(false);
    setUploadResult(null); // Clear previous upload results
    const file = e.target.files[0];
    setCsvFile(file);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      try {
        // Proper CSV parsing that handles quoted fields
        const parseCSVLine = (line) => {
          const result = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };
        
        const rows = text.trim().split(/\r?\n/);
        const header = rows.shift();
        const cols = parseCSVLine(header).map((s) => s.toLowerCase());
        const parsed = rows.map((row, i) => {
          const vals = parseCSVLine(row);
          const obj = { __row: i + 2 };
          cols.forEach((c, idx) => (obj[c] = vals[idx] || ''));
          return obj;
        });

        // Validate CSV header columns match template
        const requiredColumns = ['name', 'email', 'studentid', 'branch', 'teacherid', 'semester', 'course', 'college'];
        const missingColumns = requiredColumns.filter(col => !cols.includes(col));
        
        if (missingColumns.length > 0) {
          setError(`CSV template does not match. Missing required columns: ${missingColumns.join(', ')}. Please download and use the correct sample CSV template.`);
          setStudents([]);
          setClientErrors([]);
          setUploadSuccess(false);
          return;
        }

        const errs = [];
        const seenEmails = new Set();
        const seenIds = new Set();
        parsed.forEach((r) => {
          const rowNum = r.__row;
          const missing = [];
          if (!r.name || r.name.trim() === '') missing.push('name');
          if (!r.email || r.email.trim() === '') missing.push('email');
          if (!r.studentid && !r.student_id && !r.sid) missing.push('studentid');
          if (!r.branch || r.branch.trim() === '') missing.push('branch');
          if (!r.course || r.course.trim() === '') missing.push('course');
          if (!r.college || r.college.trim() === '') missing.push('college');
          if (!r.teacherid || r.teacherid.trim() === '') missing.push('teacherid');
          if (!r.semester || r.semester.trim() === '') missing.push('semester');
          
          // Validate Group if provided - must be G1 to G5
          if (r.group && r.group.trim() !== '') {
            const groupValue = r.group.trim().toUpperCase();
            if (!['G1', 'G2', 'G3', 'G4', 'G5'].includes(groupValue)) {
              errs.push({ row: rowNum, error: 'Invalid group value. Must be G1, G2, G3, G4, or G5', details: ['group'] });
            }
          }
          
          if (missing.length > 0) errs.push({ row: rowNum, error: 'Missing required fields', details: missing });
          else {
            const email = r.email.toLowerCase().trim();
            if (!emailRegex.test(email)) errs.push({ row: rowNum, error: 'Invalid email address format' });
            if (seenEmails.has(email)) errs.push({ row: rowNum, error: 'Duplicate email found in this file', details: 'email' });
            if (seenIds.has(r.studentid || r.student_id || r.sid)) errs.push({ row: rowNum, error: 'Duplicate student ID found in this file', details: 'studentid' });
            seenEmails.add(email);
            seenIds.add(r.studentid || r.student_id || r.sid);
          }
        });

        setStudents(parsed);
        setClientErrors(errs);
        
        if (errs.length === 0) {
          // Check against database for existing students
          try {
            const checkResult = await api.checkStudentsCsv(file);
            setUploadResult(checkResult); // Set the check result
            
            const existingCount = checkResult.results?.filter(r => r.status === 'exists' || r.status === 'exists_no_change').length || 0;
            const updateCount = checkResult.results?.filter(r => r.status === 'will_update').length || 0;
            const readyCount = checkResult.results?.filter(r => r.status === 'ready').length || 0;
            
            if (existingCount > 0 && readyCount === 0 && updateCount === 0) {
              const msg = `All ${existingCount} student(s) already exist in the system with identical data. Upload is not needed.`;
              setError(msg);
              toast.info(msg);
            } else if (updateCount > 0 || readyCount > 0) {
              let msg = '';
              const parts = [];
              if (readyCount > 0) parts.push(`${readyCount} new student(s) will be created`);
              if (updateCount > 0) parts.push(`${updateCount} student(s) will be updated`);
              if (existingCount > 0) parts.push(`${existingCount} student(s) already exist with identical data`);
              msg = parts.join('. ') + '.';
              setSuccess(msg);
              toast.success(msg);
            } else {
              const msg = `CSV file is valid. ${readyCount} student(s) ready to upload.`;
              setSuccess(msg);
              toast.success(msg);
            }
          } catch (checkErr) {
            const errorMsg = checkErr.message || '';
            if (errorMsg.includes('Missing token') || errorMsg.includes('User not found') || errorMsg.includes('token')) {
              setError('Your session has expired. Please log in again.');
              setTimeout(() => {
                localStorage.removeItem('token');
                window.location.href = '/';
              }, 2000);
            } else {
              setError(errorMsg || 'Unable to verify students against the database. Please try again.');
              toast.error(errorMsg || 'Unable to verify students against the database. Please try again.');
            }
          }
        } else {
          const msg = `Invalid CSV data! Found ${errs.length} error(s). Your CSV file does not match the template. Please fix all errors before uploading. Download the errors CSV to see what needs to be corrected.`;
          setError(msg);
          toast.error(msg);
          setUploadSuccess(false);
        }
      } catch (err) {
        const msg = err.message || 'Unable to read the CSV file. Please ensure it is a valid CSV format.';
        setError(msg);
        toast.error(msg);
        setStudents([]);
        setClientErrors([]);
        setUploadSuccess(false);
      }
    };
    reader.readAsText(file);
  };

  const tabKeyFor = (student, idx) => `${student.email || student.studentid || idx}-${student.__row || idx}`;

  const handleRowClick = (student, idx) => {
    const key = tabKeyFor(student, idx);
    if (!openTabs.find(t => t.key === key)) {
      setOpenTabs(prev => [...prev, { key, label: student.name || student.email || `Row ${student.__row || idx+1}` , data: student }]);
    }
    setActiveTab(key);
  };

  const closeTab = (key) => {
    setOpenTabs(prev => {
      const remaining = prev.filter(t => t.key !== key);
      if (activeTab === key) {
        setActiveTab(remaining.length ? remaining[remaining.length - 1].key : null);
      }
      return remaining;
    });
  };

  const handleUpload = async () => {
    if (!csvFile) {
      setError("Please select a CSV file first");
      return;
    }
    setError("");
    setSuccess("");
    setUploadSuccess(false);
    if (clientErrors.length > 0) {
      const msg = 'Invalid CSV data! Your file contains errors and cannot be uploaded. Please fix all errors in your CSV file before uploading. Download the errors CSV to see exactly what needs to be corrected.';
      setError(msg);
      toast.error(msg);
      return;
    }
    setIsUploading(true);
    try {
      const data = await api.uploadStudentsCsv(csvFile);
      setUploadResult(data);
      
      // Check for existing/updated/duplicate users
      const updatedCount = data.results?.filter(r => r.status === 'updated').length || 0;
      const createdCount = data.results?.filter(r => r.status === 'created').length || 0;
      const existingCount = updatedCount; // existing students are the ones we updated
      
      if (updatedCount > 0 && createdCount === 0) {
        const msg = `Updated ${updatedCount} existing student(s) with new CSV data. No new students were added.`;
        setSuccess(msg);
        toast.success(msg);
        setUploadSuccess(true);
      } else if (updatedCount > 0 && createdCount > 0) {
        const msg = `Successfully added ${createdCount} new student(s) and updated ${updatedCount} existing student(s). Sending emails to newly added users. Wait till we complete.`;
        setSuccess(msg);
        toast.success(msg);
        setUploadSuccess(true);
        // Change message after emails are sent
        setTimeout(() => {
          const followup = `Mails sent successfully - You can create events now`;
          setSuccess(followup);
          toast.success(followup);
        }, 3000);
      } else {
        const msg = `Successfully added ${createdCount} student(s) to the system! Sending emails to newly added users. Wait till we complete.`;
        setSuccess(msg);
        toast.success(msg);
        setUploadSuccess(true);
        // Change message after emails are sent
        setTimeout(() => {
          const followup = `Mails sent successfully - You can create events now`;
          setSuccess(followup);
          toast.success(followup);
        }, 3000);
      }
      
      // Log activity
      if (createdCount > 0) {
        logBulkCreate('STUDENT', `Bulk uploaded ${createdCount} students via CSV`, {
          fileName: csvFile.name,
          createdCount,
          existingCount
        });
      }
    } catch (err) {
      const errorMessage = err.message || 'Upload failed';
      // Make error messages user-friendly
      if (errorMessage.includes('duplicate') || errorMessage.includes('exists')) {
        const msg = 'Some students already exist in the system. Please check the results below.';
        setError(msg);
        toast.error(msg);
      } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
        const msg = 'The CSV file contains invalid data. Please check the format and try again.';
        setError(msg);
        toast.error(msg);
      } else if (errorMessage.toLowerCase().includes('coordinator') || errorMessage.toLowerCase().includes('teacher id')) {
        // Surface coordinator / Teacher ID-related validation errors directly
        setError(errorMessage);
        toast.error(errorMessage);
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        const msg = 'Unable to connect to the server. Please check your internet connection and try again.';
        setError(msg);
        toast.error(msg);
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }
      setUploadSuccess(false);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSingleChange = (k, v) => setSingleForm((s) => ({ ...s, [k]: v }));

  const submitSingle = async () => {
    setSingleMsg('');
    setSingleLoading(true);
    const { name, email, studentid, branch, teacherid, semester, course, college } = singleForm;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name || !email || !studentid || !branch || !teacherid || !semester || !course || !college) {
      setSingleMsg('Please fill in all required fields: Name, Email, Student ID, Branch, Course, College, Teacher ID, and Semester');
      setSingleLoading(false);
      return;
    }
    if (!emailRegex.test(email)) {
      setSingleMsg('Please enter a valid email address');
      setSingleLoading(false);
      return;
    }
    try {
      // Password is auto-generated on backend
      const data = await api.createStudent(singleForm);
      setSingleMsg(`Student ${data.name || data.email} has been successfully added to the server!`);
      toast.success(`Student ${data.name || data.email} added successfully!`);
      setTimeout(() => setSingleMsg(''), 4000);
      
      // Don't add to local students array since it's already uploaded to server
      // This prevents the "Upload to Server" button from staying enabled
      setSingleForm({ name: '', email: '', studentid: '', branch: '', course: '', college: '', teacherid: '', semester: '', group: '' });
      
      // Log activity
      logCreate('STUDENT', data._id, `Created student: ${data.name} (${data.email})`, {
        studentId: data.studentid,
        branch: data.branch,
        semester: data.semester
      });
    } catch (err) {
      const errorMessage = err.message || 'Failed to create student';
      // Make error messages user-friendly
      if (errorMessage.includes('duplicate') || errorMessage.includes('exists') || errorMessage.includes('already')) {
        setSingleMsg('A student with this email or student ID already exists in the system');
      } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
        setSingleMsg('Please check that all fields are filled correctly');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setSingleMsg('Unable to connect to the server. Please check your internet connection');
      } else {
        setSingleMsg(errorMessage);
      }
    } finally {
      setSingleLoading(false);
    }
  };

  const isSingleValid = () => {
    const { course, name, email, studentid, branch, college, teacherid, semester } = singleForm;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return course && name && email && studentid && branch && college && teacherid && semester && emailRegex.test(email);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col items-center py-4 sm:py-6 px-3 sm:px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-7xl bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-3 sm:p-4 lg:p-6 flex flex-col"
      >
        {/* Header Section - Logo Left, Text Right */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 mt-8 sm:mt-10">
          <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-indigo-800 dark:bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <Users className="text-white w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-gray-100">Add Students</h1>
            <p className="text-slate-600 dark:text-gray-400 text-xs sm:text-sm mt-0.5 sm:mt-1 hidden sm:block">
              Efficiently onboard students via bulk CSV upload or individual entry with real-time validation.
            </p>
          </div>
        </div>

        {/* Guidelines Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6"
        >
          <div className="flex items-start gap-2 sm:gap-3">
            <BookOpen className="w-4 h-4 text-slate-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-gray-200 mb-1 sm:mb-2">CSV Upload Guidelines</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-xs text-slate-700 dark:text-gray-300">
                <div className="space-y-1">
                  <p><strong>Required columns:</strong> Course, Name, Email, Student ID, Branch, College, Teacher ID, Semester</p>
                  <p className="hidden sm:block"><strong>Optional columns:</strong> Group (G1-G5)</p>
                  <p className="hidden sm:block"><strong>Header format:</strong> Keep the same order as the sample CSV so every column is picked up correctly.</p>
                </div>
                <div className="space-y-1 hidden lg:block">
                  <p><strong>Passwords:</strong> Automatically generated (7-8 characters) and sent via email to each student.</p>
                  <p><strong>Teacher ID & Semester:</strong> Teacher ID must match coordinator code(s); use commas for multiple (e.g., COO1,COO2). Semester must be 1-8.</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4 sm:mb-6">
          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            href="/sample-students.csv"
            download
            className="flex items-center justify-center sm:justify-start px-3 sm:px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-all duration-200"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Sample CSV
          </motion.a>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowSingleForm(!showSingleForm)}
            className="flex items-center justify-center sm:justify-start px-3 sm:px-4 py-2 bg-sky-500 dark:bg-sky-600 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm hover:bg-sky-600 dark:hover:bg-sky-700 transition-all duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            {showSingleForm ? 'Hide Single Entry' : 'Add Single Student'}
          </motion.button>
        </div>

        {/* Single Student Form */}
        {showSingleForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-slate-50 dark:bg-gray-700 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 border border-slate-200 dark:border-gray-600"
          >
            <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-gray-100 mb-3 sm:mb-4">Add Individual Student</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { key: 'name', label: 'Full Name *', placeholder: 'John Doe' },
                { key: 'email', label: 'Email Address *', placeholder: 'john@university.edu' },
                { key: 'studentid', label: 'Student ID *', placeholder: 'STU2024001' },
                { key: 'branch', label: 'Branch *', placeholder: 'Computer Science' },
                { key: 'teacherid', label: 'Teacher ID(s) *', placeholder: 'COO1 or COO1,COO2', hint: 'Comma-separated for multiple' },
                { key: 'semester', label: 'Semester *', placeholder: '1-8', type: 'number' },
                { key: 'course', label: 'Course', placeholder: 'B.Tech' },
                { key: 'college', label: 'College', placeholder: 'University Name' },
              ].map(({ key, label, placeholder, type, hint }) => (
                <div key={key} className="flex flex-col">
                  <label className="text-xs font-medium text-slate-700 dark:text-gray-300 mb-1">{label}</label>
                  <input
                    type={type || 'text'}
                    value={singleForm[key]}
                    onChange={(e) => handleSingleChange(key, e.target.value)}
                    placeholder={placeholder}
                    className="p-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-600 focus:border-transparent transition-all duration-200 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                  {hint && <span className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{hint}</span>}
                </div>
              ))}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-700 dark:text-gray-300 mb-1">Group (Optional)</label>
                <select
                  value={singleForm.group}
                  onChange={(e) => handleSingleChange('group', e.target.value)}
                  className="p-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-600 focus:border-transparent transition-all duration-200 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100"
                >
                  <option value="">Select Group</option>
                  <option value="G1">G1</option>
                  <option value="G2">G2</option>
                  <option value="G3">G3</option>
                  <option value="G4">G4</option>
                  <option value="G5">G5</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setShowSingleForm(false); setSingleMsg(''); }}
                className="px-4 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-gray-600 transition-all duration-200"
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={submitSingle}
                disabled={!isSingleValid() || singleLoading}
                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  !isSingleValid() || singleLoading
                    ? 'bg-slate-300 dark:bg-gray-600 text-slate-600 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-sky-500 dark:bg-sky-600 text-white hover:bg-sky-600 dark:hover:bg-sky-700'
                }`}
              >
                {singleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Student'
                )}
              </motion.button>
            </div>
            {singleMsg && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`mt-3 p-2 rounded text-xs font-medium ${
                  /success|added|created/i.test(singleMsg)
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}
              >
                {singleMsg}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* File Upload Section */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 ${
              dragActive 
                ? 'border-sky-400 dark:border-sky-500 bg-sky-50 dark:bg-sky-900/20' 
                : 'border-slate-300 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 hover:border-sky-300 dark:hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="space-y-3">
              <div className="w-12 h-12 bg-sky-500 dark:bg-sky-600 rounded-lg flex items-center justify-center mx-auto shadow-sm">
                <Upload className="text-white w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-gray-100 mb-1">
                  {dragActive ? 'Drop your CSV file here' : 'Upload student CSV file'}
                </p>
                <p className="text-slate-600 dark:text-gray-400 text-xs">
                  Drag and drop the CSV file here, or click to browse.
                </p>
              </div>
            </div>
          </div>
    {csvFile && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 mt-3 p-2 bg-sky-50 dark:bg-sky-900/30 rounded border border-sky-200 dark:border-sky-700"
            >
              <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-sky-800 dark:text-sky-300 text-sm font-medium">{csvFile.name}</span>
                <span className="text-sky-600 dark:text-sky-400 text-xs">({(csvFile.size / 1024).toFixed(1)} KB)</span>
            </motion.div>
          )}
        </motion.div>

        {/* Stats Cards */}
        {students.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"
          >
            <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 dark:text-gray-400 text-sm">Total Students</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-gray-100">{students.length}</p>
                </div>
                <Users className="text-indigo-600 w-6 h-6" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 dark:text-gray-400 text-sm">Valid records</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-gray-100">{students.length - clientErrors.length}</p>
                </div>
                <CheckCircle className="text-emerald-500 w-6 h-6" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 dark:text-gray-400 text-sm">Errors found</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-gray-100">{clientErrors.length}</p>
                </div>
                <AlertCircle className="text-red-400 w-6 h-6" />
              </div>
            </div>
          </motion.div>
        )}

        {/* Status Messages */}
        <AnimatePresence>
              {error && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-4 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800"
            >
              <AlertCircle className="w-4 h-4" />
                    {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-4 text-sm bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800"
            >
              <CheckCircle className="w-4 h-4" />
                    {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Data Table and Actions */}
        {students.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex-1 flex flex-col"
          >
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 p-4 bg-slate-50 dark:bg-gray-700 rounded-lg border border-slate-200 dark:border-gray-600">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Student Records</h3>
                <p className="text-slate-600 dark:text-gray-400 text-sm">{students.length} records loaded • {clientErrors.length} errors to fix</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleUpload}
                  disabled={
                    clientErrors.length > 0 || 
                    isUploading || 
                    uploadSuccess || 
                    (uploadResult?.results && uploadResult.results.every(r => r.status === 'exists' || r.status === 'exists_no_change'))
                  }
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    clientErrors.length > 0 || 
                    isUploading || 
                    uploadSuccess || 
                    (uploadResult?.results && uploadResult.results.every(r => r.status === 'exists' || r.status === 'exists_no_change'))
                      ? 'bg-slate-300 dark:bg-gray-600 text-slate-600 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-500 dark:bg-emerald-600 text-white hover:bg-emerald-600 dark:hover:bg-emerald-700'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : uploadSuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Uploaded
                    </>
                  ) : (
                    'Upload to Server'
                  )}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={downloadErrorsCsv}
                  disabled={clientErrors.length === 0}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    clientErrors.length === 0 
                      ? 'bg-slate-200 dark:bg-gray-600 text-slate-500 dark:text-gray-400 cursor-not-allowed' 
                      : 'bg-red-400 dark:bg-red-500 text-white hover:bg-red-500 dark:hover:bg-red-600'
                  }`}
                >
                  Download Errors CSV
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setStudents([]); setCsvFile(null); setClientErrors([]); setUploadResult(null); setError(''); setSuccess(''); setUploadSuccess(false); }}
                  className="px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-gray-600 transition-all duration-200"
                >
                  Clear All
                </motion.button>
              </div>
            </div>

            {/* Upload Results */}
            <AnimatePresence>
              {uploadResult && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg border border-slate-200 dark:border-gray-700 shadow-sm"
                >
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-3">
                    Existing Records - {uploadResult.count} records processed
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-slate-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-gray-700 text-left text-slate-700 dark:text-gray-300">
                          <th className="py-2 px-3 whitespace-nowrap text-xs font-semibold w-16">Row</th>
                          <th className="py-2 px-3 whitespace-nowrap text-xs font-semibold min-w-[180px]">Email</th>
                          <th className="py-2 px-3 whitespace-nowrap text-xs font-semibold w-24">Student ID</th>
                          <th className="py-2 px-3 whitespace-nowrap text-xs font-semibold w-20">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResult.results.map((r, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700">
                            <td className="py-2 px-3 whitespace-nowrap text-xs text-slate-600 dark:text-gray-400">{r.row || '-'}</td>
                            <td className="py-2 px-3 whitespace-nowrap text-xs text-slate-800 dark:text-gray-200">{r.email || '-'}</td>
                            <td className="py-2 px-3 whitespace-nowrap text-xs text-slate-800 dark:text-gray-200">{r.studentid || '-'}</td>
                            <td className={`py-2 px-3 whitespace-nowrap text-xs font-medium ${
                              r.status === 'created' ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'
                            }`}>
                              {r.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Summary */}
            {clientErrors.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg shadow-sm"
              >
                <h3 className="font-semibold text-red-800 dark:text-red-300 mb-3 text-sm">
                  CSV Validation Errors ({clientErrors.length} errors found)
                </h3>
                <div className="max-h-48 overflow-y-auto">
                  <ul className="text-xs text-red-700 dark:text-red-400 space-y-2">
                    {clientErrors.map((ce, i) => (
                      <li key={i} className="p-2 bg-red-100 dark:bg-red-900/30 rounded border border-red-200 dark:border-red-800 max-w-full break-words">
                        <span className="font-medium">Row {ce.row}:</span> {ce.error}
                        {ce.details ? ` (${Array.isArray(ce.details) ? ce.details.join(', ') : ce.details})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}

            {/* Selected Student Tabs */}
            {openTabs.length > 0 && (
              <div className="mb-4 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-sm">
                {/* Tab bar */}
                <div className="flex items-center gap-2 overflow-x-auto px-3 pt-3">
                  {openTabs.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      className={`group inline-flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-2 text-sm whitespace-nowrap ${
                        activeTab === t.key ? 'border-sky-500 dark:border-sky-400 text-slate-900 dark:text-gray-100 bg-sky-50 dark:bg-sky-900/30' : 'border-transparent text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 hover:bg-slate-50 dark:hover:bg-gray-700'
                      }`}
                      title={t.label}
                    >
                      <span className="font-medium truncate max-w-[180px]">{t.label}</span>
                      <X
                        onClick={(e) => { e.stopPropagation(); closeTab(t.key); }}
                        className="w-4 h-4 text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200"
                      />
                    </button>
                  ))}
                </div>
                {/* Active tab content */}
                {activeTab && (
                  <div className="px-4 pb-4 pt-3 border-t border-slate-200 dark:border-gray-700">
                    {(() => {
                      const t = openTabs.find(tt => tt.key === activeTab);
                      const data = t?.data || {};
                      const keys = Object.keys(data).filter(k => k !== '__row');
                      return (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100 mb-3">Student Details</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {keys.map((k) => (
                              <div key={k} className="p-3 rounded-lg border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-700">
                                <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-1">{k}</div>
                                <div className="text-sm text-slate-800 dark:text-gray-200 break-words font-mono">
                                  {String(data[k] ?? '') || <span className="italic text-slate-400 dark:text-gray-500">empty</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Data Table */}
            <div className="overflow-auto rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <table className="min-w-full">
                <thead className="bg-slate-50 dark:bg-gray-700">
                  <tr>
                    {Object.keys(students[0]).filter(k => k !== '__row').map((k) => (
                      <th
                        key={k}
                        className="py-3 px-4 border-b border-slate-200 dark:border-gray-600 text-left text-xs font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap"
                      >
                        {k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </th>
                    ))}
                    <th className="py-3 px-4 border-b border-slate-200 dark:border-gray-600 text-left text-xs font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                  {students.map((student, idx) => (
                    <motion.tr
                      key={idx}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + idx * 0.03 }}
                      className="hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors duration-150 cursor-pointer"
                      onClick={() => handleRowClick(student, idx)}
                    >
                      {Object.keys(students[0]).filter(k => k !== '__row').map((k) => (
                        <td
                          key={k}
                          className="py-3 px-4 text-sm text-slate-600 dark:text-gray-300 whitespace-nowrap"
                        >
                          {student[k] || (
                            <span className="text-slate-400 dark:text-gray-500 italic">empty</span>
                          )}
                        </td>
                      ))}
                      <td className="py-3 px-4 text-sm whitespace-nowrap">
                        {(errorsByRow[student.__row] || []).length > 0 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {errorsByRow[student.__row].length} error(s)
                          </span>
                        ) : uploadResult?.results?.[idx]?.status === 'updated' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Updated
                          </span>
                        ) : uploadResult?.results?.[idx]?.status === 'will_update' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300" title={uploadResult.results[idx].message}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Will Update: {uploadResult.results[idx].changes?.join(', ')}
                          </span>
                        ) : uploadResult?.results?.[idx]?.status === 'exists' || uploadResult?.results?.[idx]?.status === 'exists_no_change' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Already exists
                          </span>
                        ) : uploadResult?.results?.[idx]?.status === 'studentid_conflict' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300" title={uploadResult.results[idx].message}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Student ID Conflict
                          </span>
                        ) : uploadResult?.results?.[idx]?.status === 'ready' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Ready to add
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Valid
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}