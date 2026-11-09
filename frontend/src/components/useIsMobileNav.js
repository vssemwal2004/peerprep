import { useEffect, useState } from 'react';

// Below this width (phones and tablets) the sidebar becomes the top bar + menu (MobileNavigation.jsx).
// Keep in step with the `max-width: 1023.98px` shell rule in index.css.
const QUERY = '(max-width: 1023.98px)';

export default function useIsMobileNav() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return mobile;
}
