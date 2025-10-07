import React, { useState, useEffect } from 'react';
import { Box, Chip, Alert } from '@mui/material';
import { Wifi, WifiOff, Warning } from '@mui/icons-material';

const ConnectionStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [apiStatus, setApiStatus] = useState('unknown');
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowAlert(false);
      checkApiStatus();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setApiStatus('offline');
      setShowAlert(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial API status check
    checkApiStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkApiStatus = async () => {
    try {
      const baseURL =
        import.meta.env.VITE_BACKEND_URL || 'https://17autoparts.com/api';
      const response = await fetch(`${baseURL}/health`, {
        method: 'GET',
        timeout: 5000,
      });

      if (response.ok) {
        setApiStatus('online');
      } else {
        setApiStatus('error');
      }
    } catch (error) {
      setApiStatus('error');
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return 'error';
    if (apiStatus === 'online') return 'success';
    if (apiStatus === 'error') return 'warning';
    return 'default';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (apiStatus === 'online') return 'Connected';
    if (apiStatus === 'error') return 'API Error';
    return 'Checking...';
  };

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff />;
    if (apiStatus === 'online') return <Wifi />;
    return <Warning />;
  };

  return (
    <Box>
      <Chip
        icon={getStatusIcon()}
        label={getStatusText()}
        color={getStatusColor()}
        size="small"
        variant="outlined"
        sx={{ mb: 1 }}
      />

      {showAlert && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Network connection lost. Please check your internet connection.
        </Alert>
      )}

      {apiStatus === 'error' && isOnline && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Cannot connect to server. Please try again later.
        </Alert>
      )}
    </Box>
  );
};

export default ConnectionStatus;
