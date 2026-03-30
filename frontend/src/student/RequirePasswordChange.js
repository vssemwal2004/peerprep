import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function RequirePasswordChange({ user, children }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (user?.mustChangePassword) {
      // Redirect non-admin users to common change password page
      navigate('/student/change-password', { replace: true });
    }
  }, [user, navigate]);
  return children;
}
