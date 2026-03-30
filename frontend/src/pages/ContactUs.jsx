import React from 'react';
import { Footer } from '../components/Footer';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Clock, Send } from 'lucide-react';

export default function ContactUs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <div className="flex-grow">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-sky-600 hover:text-sky-700 mb-6 transition-colors duration-200"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </button>

          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">Contact Us</h1>
            <p className="text-gray-600 text-lg">We're here to help! Reach out to us with any questions or concerns.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Contact Information Cards */}
            <div className="space-y-6">
              {/* Primary Contact Card */}
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-sky-500">
                <div className="flex items-start space-x-4">
                  <div className="bg-sky-100 p-3 rounded-lg">
                    <Mail className="text-sky-600" size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Primary Support Email</h3>
                    <p className="text-gray-600 mb-2">For general inquiries and support</p>
                    <a 
                      href="mailto:peerprep26@gmail.com" 
                      className="text-sky-600 hover:text-sky-700 font-medium text-lg flex items-center space-x-2 transition-colors duration-200"
                    >
                      <span>peerprep26@gmail.com</span>
                      <Send size={16} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Academic Contact Card */}
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
                <div className="flex items-start space-x-4">
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <Mail className="text-blue-600" size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Academic Support</h3>
                    <p className="text-gray-600 mb-1">Dr. Ashish Garg</p>
                    <a 
                      href="mailto:gehuashishharg@gmail.com" 
                      className="text-blue-600 hover:text-blue-700 font-medium text-lg flex items-center space-x-2 mb-3 transition-colors duration-200"
                    >
                      <span>geuashishgarg@gmail.com</span>
                      <Send size={16} />
                    </a>
                    {/* <div className="flex items-center space-x-2 text-gray-700">
                      <Phone size={18} className="text-blue-600" />
                      <a href="tel:+919045942411" className="hover:text-blue-600 transition-colors duration-200">
                        +91 90459 42411
                      </a>
                    </div> */}
                  </div>
                </div>
              </div>

              {/* Response Time Card */}
              <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-xl shadow-lg p-6 border border-sky-200">
                <div className="flex items-start space-x-4">
                  <div className="bg-white p-3 rounded-lg">
                    <Clock className="text-sky-600" size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Response Time</h3>
                    <p className="text-gray-700 leading-relaxed">
                      We typically respond to inquiries within 24-48 hours during business days. For urgent matters, please mark your email as "Urgent" in the subject line.
                    </p>
                  </div>
                </div>
              </div>

              {/* Office Location Card */}
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
                <div className="flex items-start space-x-4">
                  <div className="bg-green-100 p-3 rounded-lg">
                    <MapPin className="text-green-600" size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Location</h3>
                    <p className="text-gray-700 leading-relaxed">
                      PeerPrep Mock Interview System<br />
                      Educational Institution Campus<br />
                      Available for online consultations
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Support Categories */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-lg p-8">
                <h2 className="text-2xl font-semibold text-gray-800 mb-6">How Can We Help?</h2>
                
                <div className="space-y-6">
                  <div className="border-l-4 border-sky-400 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Technical Support</h3>
                    <p className="text-gray-600">
                      Issues with login, platform functionality, interview scheduling, or technical errors.
                    </p>
                  </div>

                  <div className="border-l-4 border-blue-400 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Account Management</h3>
                    <p className="text-gray-600">
                      Password resets, account activation, profile updates, or account-related queries.
                    </p>
                  </div>

                  <div className="border-l-4 border-purple-400 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Interview Scheduling</h3>
                    <p className="text-gray-600">
                      Questions about pairing, time slot management, rescheduling, or interview coordination.
                    </p>
                  </div>

                  <div className="border-l-4 border-green-400 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Feedback & Suggestions</h3>
                    <p className="text-gray-600">
                      Share your feedback, report issues, or suggest improvements for the platform.
                    </p>
                  </div>

                  <div className="border-l-4 border-orange-400 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Academic Inquiries</h3>
                    <p className="text-gray-600">
                      Questions about program requirements, event details, or educational objectives.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tips for Contacting */}
              <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                <h3 className="text-xl font-semibold mb-4">📧 Email Tips</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Include your Student ID in the email for faster assistance</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Provide detailed description of your issue or question</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Attach screenshots if reporting a technical problem</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Check your spam folder for our response</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-12 bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">Frequently Asked Questions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">What are the platform's operating hours?</h4>
                <p className="text-gray-600 text-sm">The platform is available 24/7. Support responses are provided during business hours (9 AM - 6 PM).</p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">How do I reset my password?</h4>
                <p className="text-gray-600 text-sm">Use the "Forgot Password" link on the login page or contact support for assistance.</p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">Can I change my interview schedule?</h4>
                <p className="text-gray-600 text-sm">Yes, you can propose new time slots through the dashboard or contact your interview partner directly.</p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">How do I report inappropriate behavior?</h4>
                <p className="text-gray-600 text-sm">Email us immediately at peerprep26@gmail.com with details of the incident.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
