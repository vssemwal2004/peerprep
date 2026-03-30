import { io } from 'socket.io-client';

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

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    // SECURITY: Use withCredentials to send HttpOnly cookies for authentication
    // This allows the server to read the JWT from the cookie instead of auth object
    // Prevents XSS attacks from stealing tokens stored in JavaScript
    const SOCKET_URL = getSocketURL();
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      withCredentials: true // SECURITY: Send cookies with WebSocket connection
    });

    this.socket.on('connect', () => {
      // Connected
    });

    this.socket.on('disconnect', () => {
      // Disconnected
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  on(event, callback) {
    if (!this.socket) {
      this.connect();
    }
    
    // Store callback reference for cleanup
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    this.socket.on(event, callback);
  }

  off(event, callback) {
    if (!this.socket) return;
    
    this.socket.off(event, callback);
    
    // Remove from listeners map
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
      if (this.listeners.get(event).size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit(event, data) {
    if (!this.socket) {
      this.connect();
    }
    this.socket.emit(event, data);
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;
