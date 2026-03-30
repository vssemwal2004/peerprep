import React from 'react';
import { Footer } from '../components/Footer';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsAndConditions() {
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
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Terms and Conditions</h1>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          {/* Content */}
          <div className="bg-white rounded-xl shadow-lg p-8 space-y-6">
            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                By accessing and using the PeerPrep Mock Interview System ("Platform"), you accept and agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use this Platform. These terms apply to all users, including students, interviewers, and administrators.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">2. Platform Purpose and Scope</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                This Platform is designed as a comprehensive learning and interview preparation system for students. The Platform provides:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
                <li>Structured learning modules with video lectures and study materials</li>
                <li>Progress tracking and contribution calendar</li>
                <li>Automated pairing between interviewers and interviewees</li>
                <li>Interview scheduling and time slot management</li>
                <li>Feedback collection and review system</li>
                <li>Event management and notifications</li>
                <li>Performance tracking and learning analytics</li>
                <li>Coordinator-managed curriculum and semester structure</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">3. User Eligibility and Registration</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">3.1 Eligibility</h3>
                  <p className="text-gray-700 leading-relaxed">
                    This Platform is intended for students enrolled in participating educational institutions. By registering, you confirm that you are authorized to use this Platform and that all information provided is accurate and current.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">3.2 Account Security</h3>
                  <p className="text-gray-700 leading-relaxed">
                    You are responsible for maintaining the confidentiality of your login credentials. You must change your temporary password upon first login and use a strong, unique password. Any activities conducted under your account are your responsibility.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">3.3 Account Termination</h3>
                  <p className="text-gray-700 leading-relaxed">
                    We reserve the right to suspend or terminate accounts that violate these terms or engage in inappropriate behavior.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">4. User Responsibilities and Conduct</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                As a user of this Platform, you agree to:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4 space-y-2">
                <li><strong>Professional Conduct:</strong> Maintain professional and respectful behavior during all interview sessions</li>
                <li><strong>Punctuality:</strong> Arrive on time for scheduled interviews and notify your partner if unable to attend</li>
                <li><strong>Honest Feedback:</strong> Provide constructive, honest, and respectful feedback to help peers improve</li>
                <li><strong>Preparation:</strong> Come prepared for interview sessions with necessary materials and a proper environment</li>
                <li><strong>Communication:</strong> Respond promptly to slot proposals and scheduling requests</li>
                <li><strong>Confidentiality:</strong> Respect the privacy of other users and not share their personal information</li>
                <li><strong>No Harassment:</strong> Refrain from any form of harassment, discrimination, or offensive behavior</li>
                <li><strong>Technical Requirements:</strong> Ensure you have a stable internet connection, working camera, and microphone</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">5. Interview Scheduling and Management</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">5.1 Pairing System</h3>
                  <p className="text-gray-700 leading-relaxed">
                    The Platform automatically pairs students based on their roles (interviewer/interviewee). Pairings are made randomly or according to administrator-defined criteria. Users cannot request specific partners.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-8 mb-2">5.2 Time Slot Proposals</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Interviewers propose time slots, and interviewees can accept or counter-propose. Both parties must agree on a final time. Users can propose up to 3 alternative time slots if none of the proposed times work.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">5.3 Cancellations and Rescheduling</h3>
                  <p className="text-gray-700 leading-relaxed">
                    If you need to cancel or reschedule an interview, contact your partner immediately and use the Platform's rescheduling features. Repeated no-shows may result in account restrictions.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">5.4 Meeting Links</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Video meeting links will be available on your dashboard 30 minutes before the scheduled interview time. Ensure you test your connection before the interview begins.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">6. Feedback System</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">6.1 Feedback Requirements</h3>
                  <p className="text-gray-700 leading-relaxed">
                    After each interview session, interviewers are required to provide feedback using the Platform's feedback form. Feedback should be constructive, specific, and helpful for the interviewee's improvement.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">6.2 Feedback Ratings</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Feedback includes emoji-based ratings (1-5 scale) across multiple criteria. Use ratings honestly and fairly to help your peers understand their performance.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">6.3 Feedback Visibility</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Feedback is shared with the interviewee and may be visible to administrators for quality monitoring. Feedback should never contain personal attacks or inappropriate content.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. Learning Content and Usage</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">7.1 Course Access</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Students have access to learning modules organized by semesters and subjects. Video lectures, notes, and problem sets are provided for educational purposes only.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">7.2 Progress Tracking</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Your learning activity, including videos watched, topics completed, and problems solved, is tracked to provide progress analytics and maintain your contribution calendar.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-800 mb-2">7.3 Content Rights</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Learning materials are provided for your personal educational use only. You may not redistribute, sell, or share course content outside the Platform without authorization.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. Prohibited Activities</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                The following activities are strictly prohibited on this Platform:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
                <li>Using the Platform for commercial purposes or solicitation</li>
                <li>Sharing account credentials with others</li>
                <li>Attempting to hack, disrupt, or compromise the Platform's security</li>
                <li>Recording interview sessions without explicit consent from all participants</li>
                <li>Submitting false, misleading, or malicious feedback</li>
                <li>Impersonating other users or providing false information</li>
                <li>Using automated bots or scripts to interact with the Platform</li>
                <li>Distributing spam, malware, or harmful content</li>
                <li>Downloading or distributing course materials outside the Platform</li>
                <li>Circumventing progress tracking or falsifying completion status</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">9. Intellectual Property</h2>
              <p className="text-gray-700 leading-relaxed">
                All content, features, and functionality of the Platform, including but not limited to text, graphics, logos, and software, are owned by PeerPrep and protected by intellectual property laws. You may not copy, modify, distribute, or reverse engineer any part of the Platform without express written permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">10. Disclaimer of Warranties</h2>
              <p className="text-gray-700 leading-relaxed">
                The Platform is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not guarantee that the Platform will be uninterrupted, error-free, or completely secure. Mock interviews are for educational purposes only and do not guarantee job placement or career success.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">11. Limitation of Liability</h2>
              <p className="text-gray-700 leading-relaxed">
                To the fullest extent permitted by law, PeerPrep and its administrators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform. This includes but is not limited to technical issues, data loss, missed interviews, or disputes between users.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">12. Privacy and Data Protection</h2>
              <p className="text-gray-700 leading-relaxed">
                Your use of the Platform is also governed by our Privacy Policy. By using the Platform, you consent to the collection, use, and disclosure of your information as described in the Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">13. Modifications to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify these Terms and Conditions at any time. Changes will be effective immediately upon posting to the Platform. Your continued use of the Platform after changes are posted constitutes your acceptance of the modified terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">14. Dispute Resolution</h2>
              <p className="text-gray-700 leading-relaxed">
                Any disputes arising from the use of this Platform should first be reported to the administrators. We encourage users to resolve conflicts amicably through communication and mediation.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">15. Contact Information</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about these Terms and Conditions, please contact us at:
              </p>
              <div className="mt-3 p-4 bg-sky-50 rounded-lg border border-sky-200">
                <p className="text-gray-800 font-medium">Primary Contact: <a href="mailto:peerprep26@gmail.com" className="text-sky-600 hover:text-sky-700">peerprep26@gmail.com</a></p>
                <p className="text-gray-800 font-medium mt-1">Support Contact: <a href="mailto:gehuashishharg@gmail.com" className="text-sky-600 hover:text-sky-700">gehuashishharg@gmail.com</a></p>
              </div>
            </section>

            <section>
              <p className="text-gray-600 italic text-sm mt-8">
                By using the PeerPrep Mock Interview System, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
              </p>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
