import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

// Determine Socket URL: use environment variable, or detect production, or fallback to localhost
const getSocketURL = () => {
  // If VITE_API_URL is set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace('/api', '');
  }
  
  // If running on production domain, use production URL
  if (typeof window !== 'undefined' && window.location.hostname === 'peerprep.co.in') {
    return 'https://peerprep.co.in';
  }
  
  // Default to localhost for development
  return 'http://localhost:4000';
};

/**
 * SECURITY: Socket.IO Provider with HttpOnly Cookie Authentication
 * 
 * Uses withCredentials: true to send HttpOnly cookies for authentication
 * This prevents XSS attacks from stealing tokens stored in JavaScript
 */
export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // SECURITY: Create socket connection with credentials
    // The server will authenticate using HttpOnly cookies
    const SOCKET_URL = getSocketURL();
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      withCredentials: true // SECURITY: Send HttpOnly cookies for authentication
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
        // Socket connected
      });

      socketInstance.on('disconnect', () => {
        // Socket disconnected

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export default SocketContext;
