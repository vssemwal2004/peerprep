import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

function normalizeTheme(value) {
  if (value === 'dark' || value === 'light') return value;
  if (value === 'true' || value === '1') return 'dark';
  if (value === 'false' || value === '0') return 'light';
  return null;
}

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = normalizeTheme(localStorage.getItem('theme'));
    const initial = stored || getSystemTheme();
    // Apply immediately to avoid any inconsistent dark styling on first paint
    const root = window.document.documentElement;
    if (initial === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    return initial;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
