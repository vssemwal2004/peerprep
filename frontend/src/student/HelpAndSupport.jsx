import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, BookOpen, Video, CheckCircle, Calendar, MessageSquare, 
  User, Lock, Settings, BarChart, HelpCircle, Shield, LogIn, Home,
  FileText, Clock, Star, Award, Target, TrendingUp
} from 'lucide-react';

export default function HelpAndSupport() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 mb-6 transition-colors duration-200"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Dashboard</span>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 dark:bg-sky-900 rounded-full mb-4">
            <HelpCircle size={32} className="text-sky-600 dark:text-sky-400" />
          </div>
          <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">Help & Support</h1>
          <p className="text-gray-600 dark:text-gray-400">Your complete guide to using the PeerPrep platform</p>
        </div>

        {/* Content Sections */}
        <div className="space-y-6">
          
          {/* Platform Overview */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-sky-100 dark:bg-sky-900 rounded-lg">
                <Home size={24} className="text-sky-600 dark:text-sky-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Platform Overview</h2>
            </div>
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <strong>Welcome to PeerPrep!</strong> This platform is your all-in-one solution for technical interview preparation and learning. Here's what you can do:
              </p>
              <ul className="text-gray-700 dark:text-gray-300 space-y-2 mt-3">
                <li><strong>Learn at Your Pace:</strong> Access structured courses with video lectures, study materials, and practice problems</li>
                <li><strong>Track Your Progress:</strong> View your learning journey through a visual contribution calendar and detailed analytics</li>
                <li><strong>Practice Interviews:</strong> Get paired with peers for mock interview sessions to build confidence</li>
                <li><strong>Receive Feedback:</strong> Get constructive feedback from interviewers to improve your performance</li>
                <li><strong>Stay Organized:</strong> Manage your schedule, sessions, and learning goals all in one place</li>
              </ul>
            </div>
          </section>

          {/* Getting Started */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900 rounded-lg">
                <LogIn size={24} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Getting Started</h2>
            </div>
            
            <div className="space-y-4">
              <div className="border-l-4 border-emerald-500 pl-4 py-2">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <span className="bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                  Account Creation & First Login
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mt-2">
                  Your account is created by your coordinator/admin. You'll receive an email with your temporary password.
                </p>
                <ul className="text-gray-600 dark:text-gray-400 mt-2 ml-8 space-y-1 text-sm">
                  <li>• Go to the login page and enter your Student ID and temporary password</li>
                  <li>• You'll be prompted to change your password on first login (required for security)</li>
                  <li>• Choose a strong password with at least 6 characters</li>
                  <li>• After changing your password, you'll be redirected to your dashboard</li>
                </ul>
              </div>

              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                  Profile Setup
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mt-2">
                  Complete your profile to personalize your experience.
                </p>
                <ul className="text-gray-600 dark:text-gray-400 mt-2 ml-8 space-y-1 text-sm">
                  <li>• Click on your profile icon in the top-right corner</li>
                  <li>• Upload a profile photo (optional but recommended)</li>
                  <li>• Verify your email, course, branch, and college information</li>
                  <li>• View your contribution calendar showing your learning activity</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Learning Workflow */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <BookOpen size={24} className="text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Learning Workflow</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
                  <Video className="text-purple-600 dark:text-purple-400" size={20} />
                  Accessing Courses
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Navigate to the <strong>Learning</strong> section from your dashboard.
                </p>
                <ul className="text-gray-600 dark:text-gray-400 space-y-1 text-sm">
                  <li>• Browse available semesters and subjects</li>
                  <li>• Click on any subject to view its chapters</li>
                  <li>• Each chapter contains multiple topics with videos and resources</li>
                  <li>• Topics are organized by difficulty level (Easy, Medium, Hard)</li>
                </ul>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
                  <Video className="text-blue-600 dark:text-blue-400" size={20} />
                  Watching Videos
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Click on a topic to open the learning detail page.
                </p>
                <ul className="text-gray-600 dark:text-gray-400 space-y-1 text-sm">
                  <li>• Click the <strong>Watch Video</strong> button to open the embedded video player</li>
                  <li>• Watch the video at your own pace (you can pause, rewind, or fast-forward)</li>
                  <li>• Your watch time is automatically tracked</li>
                  <li><strong>Important:</strong> After finishing a video, click the circle/status icon to mark it complete</li>
                  <li>• Marking videos complete updates your progress and contribution calendar</li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
                  <FileText className="text-amber-600 dark:text-amber-400" size={20} />
                  Study Materials & Problems
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Each topic may include additional resources:
                </p>
                <ul className="text-gray-600 dark:text-gray-400 space-y-1 text-sm">
                  <li>• <strong>Notes:</strong> Click the notes icon/link to view or download study notes</li>
                  <li>• <strong>Practice Problems:</strong> Access problem PDFs to test your understanding</li>
                  <li>• <strong>External Links:</strong> Some topics include additional learning resources</li>
                  <li>• Solving problems helps reinforce concepts from videos</li>
                </ul>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
                  <BarChart className="text-emerald-600 dark:text-emerald-400" size={20} />
                  Tracking Your Progress
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Your progress is tracked automatically:
                </p>
                <ul className="text-gray-600 dark:text-gray-400 space-y-1 text-sm">
                  <li>• <strong>Contribution Calendar:</strong> Shows your daily learning activity with color-coded intensity</li>
                  <li>• <strong>Active Days:</strong> Total number of days you've engaged with the platform</li>
                  <li>• <strong>Current Streak:</strong> Consecutive days of activity</li>
                  <li>• <strong>Best Streak:</strong> Your longest streak ever</li>
                  <li>• <strong>Videos Watched:</strong> Total videos completed out of total available</li>
                  <li>• <strong>Problems Solved:</strong> Count of practice problems you've attempted</li>
                  <li>• View all statistics in your <strong>Profile</strong> page</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Interview Workflow */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                <Calendar size={24} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Mock Interview Workflow</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
                  <User className="text-indigo-600 dark:text-indigo-400" size={20} />
                  Getting Paired
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  The system automatically pairs you with a peer for mock interviews.
                </p>
                <ul className="text-gray-600 dark:text-gray-400 space-y-1 text-sm">
                  <li>• Pairings are created by coordinators/admins based on events</li>
                  <li>• You'll receive a notification when you're paired with someone</li>
                  <li>• One person will be the interviewer, the other the interviewee</li>
                  <li>• Check your dashboard for active pairings</li>
                </ul>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
                  <Clock className="text-blue-600 dark:text-blue-400" size={20} />
                  Scheduling an Interview
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Navigate to <strong>Pairing & Scheduling</strong> from your dashboard.
                </p>
                <ul className="text-gray-600 dark:text-gray-400 space-y-1 text-sm">
                  <li>• <strong>Interviewers:</strong> Propose 1-3 time slots that work for you</li>
                  <li>• <strong>Interviewees:</strong> Review proposed slots and accept one or counter-propose</li>
                  <li>• You can negotiate up to 3 counter-proposals if needed</li>
                  <li>• Once both agree, the interview is confirmed and added to your schedule</li>
                  <li>• Meeting links appear 30 minutes before the scheduled time</li>
                </ul>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
                  <Video className="text-emerald-600 dark:text-emerald-400" size={20} />
                  Conducting the Interview
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Join your scheduled interview session:
                </p>
                <ul className="text-gray-600 dark:text-gray-400 space-y-1 text-sm">
                  <li>• Go to your dashboard and find the upcoming session</li>
                  <li>• Click <strong>Join Meeting</strong> when the link becomes available</li>
                  <li>• Test your camera and microphone before joining</li>
                  <li>• Be professional and punctual</li>
                  <li>• The interviewer leads the session and asks questions</li>
                  <li>• The interviewee responds and demonstrates problem-solving skills</li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
                  <MessageSquare className="text-amber-600 dark:text-amber-400" size={20} />
                  Submitting Feedback
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  After the interview, the interviewer must provide feedback:
                </p>
                <ul className="text-gray-600 dark:text-gray-400 space-y-1 text-sm">
                  <li>• Go to <strong>Sessions & Feedback</strong> section</li>
                  <li>• Find the completed session and click <strong>Provide Feedback</strong></li>
                  <li>• Rate the interviewee on multiple criteria using emoji ratings (1-5 scale)</li>
                  <li>• Categories include: Communication, Problem Solving, Technical Skills, etc.</li>
                  <li>• Write constructive comments to help them improve</li>
                  <li>• Submit the feedback form</li>
                  <li>• Interviewees can view received feedback in their dashboard</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Button & Feature Guide */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-pink-100 dark:bg-pink-900 rounded-lg">
                <Target size={24} className="text-pink-600 dark:text-pink-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Important Buttons & Features</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <BookOpen size={18} className="text-blue-600 dark:text-blue-400" />
                  Learning Button
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Takes you to the courses page where you can browse subjects, watch videos, and access study materials.
                </p>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <Calendar size={18} className="text-emerald-600 dark:text-emerald-400" />
                  Pairing & Scheduling
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manage your interview pairings, propose time slots, and confirm scheduled sessions.
                </p>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <MessageSquare size={18} className="text-purple-600 dark:text-purple-400" />
                  Sessions & Feedback
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  View completed sessions, submit feedback as an interviewer, or review feedback you've received.
                </p>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <User size={18} className="text-indigo-600 dark:text-indigo-400" />
                  Profile
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  View your contribution calendar, learning statistics, update your photo, and change your password.
                </p>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-600 dark:text-green-400" />
                  Mark Complete
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Click the status circle after watching a video to mark it complete. This updates your progress and calendar.
                </p>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <Lock size={18} className="text-red-600 dark:text-red-400" />
                  Change Password
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Update your password anytime from your profile page. Required on first login for security.
                </p>
              </div>
            </div>
          </section>

          {/* Data & Privacy */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                <Shield size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Your Data & Privacy</h2>
            </div>

            <div className="prose dark:prose-invert max-w-none">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">What Data is Stored?</h3>
              <ul className="text-gray-700 dark:text-gray-300 space-y-1">
                <li><strong>Profile Information:</strong> Name, email, student ID, course, branch, college</li>
                <li><strong>Learning Activity:</strong> Videos watched, topics completed, problems solved, daily activity</li>
                <li><strong>Interview Records:</strong> Session schedules, feedback given/received, attendance</li>
                <li><strong>Progress Metrics:</strong> Streaks, active days, completion percentages</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-4">How is Data Used?</h3>
              <ul className="text-gray-700 dark:text-gray-300 space-y-1">
                <li>To track and display your learning progress</li>
                <li>To match you with interview partners</li>
                <li>To provide personalized analytics and insights</li>
                <li>To help coordinators monitor overall student engagement</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-4">Privacy & Security</h3>
              <ul className="text-gray-700 dark:text-gray-300 space-y-1">
                <li>✓ All passwords are encrypted and never stored in plain text</li>
                <li>✓ Your personal information is never shared with third parties</li>
                <li>✓ Feedback is only visible to you and administrators</li>
                <li>✓ Profile photos are stored securely on Cloudinary CDN</li>
                <li>✓ You can request data deletion by contacting support</li>
              </ul>

              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  For detailed information, please read our <button onClick={() => navigate('/privacy-policy')} className="text-sky-600 dark:text-sky-400 hover:underline font-medium">Privacy Policy</button> and <button onClick={() => navigate('/terms-and-conditions')} className="text-sky-600 dark:text-sky-400 hover:underline font-medium">Terms & Conditions</button>.
                </p>
              </div>
            </div>
          </section>

          {/* Support & Contact */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <HelpCircle size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Need More Help?</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">When to Contact Support</h3>
                <ul className="text-gray-700 dark:text-gray-300 space-y-1 text-sm">
                  <li>• You can't log in or forgot your password</li>
                  <li>• Technical issues with videos, links, or features</li>
                  <li>• Problems with interview scheduling or pairing</li>
                  <li>• Questions about your account or data</li>
                  <li>• Reporting inappropriate behavior or feedback</li>
                </ul>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border-l-4 border-blue-500">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Contact Information</h3>
                <div className="space-y-2">
                  <p className="text-gray-700 dark:text-gray-300">
                    <strong>Primary Support:</strong> <a href="mailto:peerprep62@gmail.com" className="text-sky-600 dark:text-sky-400 hover:underline">peerprep62@gmail.com</a>
                  </p>
                  <p className="text-gray-700 dark:text-gray-300">
                    <strong>Secondary Support:</strong> <a href="mailto:gehuashishharg@gmail.com" className="text-sky-600 dark:text-sky-400 hover:underline">gehuashishharg@gmail.com</a>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    We typically respond within 24-48 hours. For urgent issues, please mark your email as "URGENT" in the subject line.
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Quick Tips</h3>
                <ul className="text-gray-700 dark:text-gray-300 space-y-1 text-sm">
                  <li>✓ Check your internet connection if videos won't load</li>
                  <li>✓ Clear your browser cache if buttons aren't working</li>
                  <li>✓ Make sure you're marking videos complete after watching</li>
                  <li>✓ Refresh the page if your progress doesn't update immediately</li>
                  <li>✓ Use a desktop/laptop for the best experience during interviews</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Success Tips */}
          <section className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 rounded-xl shadow-lg p-6 border-2 border-sky-200 dark:border-sky-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-sky-100 dark:bg-sky-900 rounded-lg">
                <Award size={24} className="text-sky-600 dark:text-sky-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Tips for Success</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Star size={20} className="text-amber-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-100">Stay Consistent</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Learn a little every day to build and maintain your streak</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <TrendingUp size={20} className="text-emerald-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-100">Track Progress</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Regularly check your contribution calendar and stats</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MessageSquare size={20} className="text-purple-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-100">Give Good Feedback</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Provide constructive, specific feedback to help peers improve</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock size={20} className="text-red-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-100">Be Punctual</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Always join interviews on time and come prepared</p>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>This guide is regularly updated. Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p className="mt-2">Have suggestions for this guide? Contact us at <a href="mailto:peerprep62@gmail.com" className="text-sky-600 dark:text-sky-400 hover:underline">peerprep62@gmail.com</a></p>
        </div>
      </div>
    </div>
  );
}
