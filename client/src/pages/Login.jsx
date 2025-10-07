// src/pages/Login.jsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Avatar,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

import apiService from '../api/apiService';
import getValidAuthToken from '../utils/getValidAuthToken';
import { userStore } from '../store/authStore';

export default function Login({ handleLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const navigate = useNavigate();

  const saveUser = userStore((store) => store.saveUser);
  const user = userStore((store) => store.user);

  useEffect(() => {
    // If already logged in, redirect to /home
    if (user) {
      navigate('/home');
    }
  }, [user, navigate]);

  const handleLoginClick = async () => {
    try {
      setError('');

      // 1) Call backend: POST /auth/login
      const response = await apiService.auth.login({ email, password });

      if (response.success) {
        const { user: loggedUser, token: appJwt } = response.data;

        // 2) Save our own JWT + userId to localStorage and Zustand
        localStorage.setItem('app_jwt', appJwt);
        localStorage.setItem('user_id', loggedUser.id);

        saveUser({
          id: loggedUser.id,
          email: loggedUser.email,
          token: appJwt,
        });

        // 3) Fetch a valid eBay user token immediately
        try {
          const ebayToken = await getValidAuthToken(loggedUser.id);
        } catch (ebayErr) {
          console.warn('Could not fetch eBay token immediately:', ebayErr);
          // You may still proceed or force eBay link depending on UX
        }

        // 4) Notify parent and navigate
        handleLogin();
        navigate('/home');
      } else {
        // Handle authentication errors specifically
        if (response.status === 401 || response.status === 403) {
          setError('Invalid email or password');
        } else {
          setError(response.error || 'Invalid email or password');
        }
      }
    } catch (err) {
      console.error('Login error:', err);

      // Check if it's a network/HTTP error
      if (err.response) {
        // Server responded with error status
        if (err.response.status === 401 || err.response.status === 403) {
          setError('Invalid email or password');
        } else if (err.response.status >= 500) {
          setError('Server error. Please try again later.');
        } else {
          setError('Invalid email or password');
        }
      } else if (err.request) {
        // Network error
        setError('Network error. Please check your connection.');
      } else {
        // Other errors
        setError('Invalid email or password');
      }
    }
  };
  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(to right, #2E3B4E, #607D8B)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
      }}
    >
      <Paper
        elevation={5}
        sx={{ p: 5, maxWidth: 400, width: '100%', borderRadius: 3 }}
      >
        <Box display="flex" flexDirection="column" alignItems="center" mb={3}>
          <Avatar sx={{ bgcolor: '#2E3B4E', mb: 1 }}>
            <LockOutlinedIcon />
          </Avatar>
          <Typography variant="h5" fontWeight={600}>
            Welcome Back
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Please login to your account
          </Typography>
        </Box>
        <TextField
          fullWidth
          label="Email Address"
          type="email"
          variant="outlined"
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Box sx={{ position: 'relative' }}>
          <TextField
            fullWidth
            label="Password"
            type={showPassword ? 'text' : 'password'}
            variant="outlined"
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <Box
                  sx={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    cursor: 'pointer',
                  }}
                  onClick={togglePasswordVisibility}
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </Box>
              ),
            }}
          />
        </Box>
        {error && (
          <Typography color="error" fontSize={14} mt={1}>
            {error}
          </Typography>
        )}{' '}
        <Button
          fullWidth
          variant="contained"
          onClick={handleLoginClick}
          sx={{
            mt: 3,
            backgroundColor: '#2E3B4E',
            '&:hover': { backgroundColor: '#1f2c3a' },
            textTransform: 'none',
            fontWeight: 'bold',
            py: 1.3,
          }}
        >
          Login
        </Button>
      </Paper>
    </Box>
  );
}
