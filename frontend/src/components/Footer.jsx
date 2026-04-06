import React from 'react';

export function Footer() {
  return (
    <footer className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-gray-200 py-4 w-full shadow-sm border-t border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-2 md:space-y-0">
          {/* Logo */}
          <div className="flex items-center">
            <img 
              src="/images/logo.png" 
              alt="PeerPrep Logo" 
              className="h-24 w-auto object-contain"
            />
          </div>
          
          {/* Links and Copyright */}
          <div className="flex flex-col md:flex-row items-center space-y-1 md:space-y-0 md:space-x-8">
            <div className="flex flex-wrap justify-center space-x-6 text-sm">
              <a href="/privacy" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200 font-medium">Privacy Policy</a>
              <a href="/terms" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200 font-medium">Terms & Conditions</a>
              <a href="/contact" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200 font-medium">Contact Us</a>
              <a href="/student/help" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200 font-medium">Help & Support</a>
            </div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
              &copy; {new Date().getFullYear()} PeerPrep. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}