// src/pages/AuthCallback.jsx
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const AuthCallback = ({ handleAuthCallback }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Get the authorization code from URL query parameters
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    
    if (code) {
      
      
      // Pass the code to the handleAuthCallback function
      handleAuthCallback(code);
      
      // Navigate to home
      navigate('/home');
    } else {
      console.error("No authorization code received");
      navigate('/login');
    }
  }, [location, navigate, handleAuthCallback]);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      flexDirection: 'column'
    }}>
      <h2>Processing eBay Authorization...</h2>
      <p>Please wait while we connect your account.</p>
    </div>
  );
};

export default AuthCallback;