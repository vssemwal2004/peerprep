import React from 'react';
import { Footer } from '../components/Footer';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <div className="flex-grow">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-sky-600 hover:text-sky-700 mb-6 transition-colors duration-200"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Privacy Policy</h1>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          {/* Content */}
          <div className="bg-white rounded-xl shadow-lg p-8 space-y-6">
            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                Welcome to PeerPrep Mock Interview System. We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mock interview platform.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">2. Information We Collect</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">2.1 Personal Information</h3>
                  <p className="text-gray-700 leading-relaxed">
                    We collect the following personal information when you register and use our platform:
                  </p>
                  <ul className="list-disc list-inside text-gray-700 mt-2 ml-4 space-y-1">
                    <li>Full name, student ID, and email address</li>
                    <li>Login credentials (encrypted passwords)</li>
                    <li>Profile information (course, branch, college, semester)</li>
                    <li>Role information (interviewer/interviewee assignments)</li>
                    <li>Profile photo (optional, stored via Cloudinary CDN)</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">2.2 Learning Activity Data</h3>
                  <p className="text-gray-700 leading-relaxed">
                    We track your learning progress and activity to provide personalized analytics:
                  </p>
                  <ul className="list-disc list-inside text-gray-700 mt-2 ml-4 space-y-1">
                    <li>Videos watched and watch duration</li>
                    <li>Topics completed and course enrollment</li>
                    <li>Problems solved and difficulty levels attempted</li>
                    <li>Daily activity for contribution calendar</li>
                    <li>Learning streaks and active days</li>
                    <li>Progress percentage within each subject</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">2.3 Interview and Interaction Data</h3>
                  <p className="text-gray-700 leading-relaxed">
                    We automatically collect information related to interview sessions:
                  </p>
                  <ul className="list-disc list-inside text-gray-700 mt-2 ml-4 space-y-1">
                    <li>Interview session details, schedules, and pairing information</li>
                    <li>Feedback submissions, ratings, and comments</li>
                    <li>Time slot proposals, acceptances, and counter-proposals</li>
                    <li>Meeting links and session attendance records</li>
                    <li>System interaction logs and activity timestamps</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                We use the collected information for the following purposes:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4 space-y-2">
                <li><strong>Learning Management:</strong> To provide access to courses, track your progress, generate analytics, and display your contribution calendar</li>
                <li><strong>Platform Operations:</strong> To facilitate mock interview sessions, schedule management, and pairing between interviewers and interviewees</li>
                <li><strong>Communication:</strong> To send notifications about scheduled interviews, slot proposals, confirmations, feedback requests, and learning milestones</li>
                <li><strong>User Authentication:</strong> To verify your identity and maintain secure access to your account</li>
                <li><strong>Performance Improvement:</strong> To analyze usage patterns and improve our platform features and user experience</li>
                <li><strong>Feedback Management:</strong> To collect, store, and display feedback from interview sessions for educational purposes</li>
                <li><strong>Progress Analytics:</strong> To generate personalized statistics including active days, current streak, best streak, and course completion rates</li>
                <li><strong>Administrative Tasks:</strong> To manage events, users, curriculum, semesters, and system configurations by authorized coordinators and administrators</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">4. Data Sharing and Disclosure</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                We do not sell or rent your personal information to third parties. We may share your information only in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4 space-y-2">
                <li><strong>Within the Platform:</strong> Your name and basic information may be visible to your interview partners during scheduled sessions</li>
                <li><strong>Feedback Sharing:</strong> Feedback you provide may be shared with the interviewee for educational purposes</li>
                <li><strong>Administrative Access:</strong> Platform administrators have access to user data for system management and support purposes</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect the rights, property, or safety of our users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">5. Coordinator and Administrator Access</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                Authorized coordinators and administrators have specific access levels:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
                <li>Coordinators can manage curriculum, subjects, chapters, and topics within their assigned semesters</li>
                <li>Coordinators can view student progress, activity, and learning analytics for students in their semesters</li>
                <li>Administrators have full access to user management, event creation, and system configuration</li>
                <li>All coordinator and administrator actions are logged for audit purposes</li>
                <li>Access is granted based on role-based authentication and is restricted to educational purposes only</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">6. Data Security</h2>
              <p className="text-gray-700 leading-relaxed">
                We implement industry-standard security measures to protect your personal information:
              </p>
              <ul className="list-disc list-inside text-gray-700 mt-2 ml-4 space-y-1">
                <li>Encrypted password storage using bcrypt hashing</li>
                <li>Secure JWT-based authentication tokens</li>
                <li>HTTPS encryption for data transmission</li>
                <li>Regular security updates and monitoring</li>
                <li>Access controls and role-based permissions</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-3">
                However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed">
                We retain your personal information for as long as your account is active or as needed to provide services. Specifically:
              </p>
              <ul className="list-disc list-inside text-gray-700 mt-2 ml-4 space-y-1">
                <li>Learning progress and activity data are retained to maintain your history and analytics</li>
                <li>Interview records, feedback, and session history are retained for educational and administrative purposes</li>
                <li>Contribution calendar data is maintained to track your ongoing engagement</li>
                <li>Profile information and authentication data are retained until account deletion</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-3">
                You may request deletion of your data by contacting us at peerprep62@gmail.com. Some data may be retained for legal compliance or legitimate business purposes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. Cookies and Tracking</h2>
              <p className="text-gray-700 leading-relaxed">
                We use browser local storage to maintain your login session and remember your preferences. We do not use third-party tracking cookies for advertising purposes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">9. Your Rights</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                You have the following rights regarding your personal information:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
                <li>Access and review your personal data, learning progress, and activity history</li>
                <li>Request corrections to inaccurate information</li>
                <li>Change your password at any time through your profile settings</li>
                <li>Update your profile information including photo, email, and personal details</li>
                <li>Request account deletion and data removal (subject to legal retention requirements)</li>
                <li>Opt-out of non-essential communications</li>
                <li>View and download your feedback history and session records</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">10. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Our platform is intended for educational institutions and their students. We do not knowingly collect information from children under 13 without parental consent. If you believe we have collected such information, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">11. Changes to This Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">12. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <div className="mt-3 p-4 bg-sky-50 rounded-lg border border-sky-200">
                <p className="text-gray-800 font-medium">Email: <a href="mailto:peerprep62@gmail.com" className="text-sky-600 hover:text-sky-700">peerprep62@gmail.com</a></p>
                <p className="text-gray-800 font-medium mt-1">Support Contact: <a href="mailto:gehuashishharg@gmail.com" className="text-sky-600 hover:text-sky-700">gehuashishharg@gmail.com</a></p>
              </div>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
