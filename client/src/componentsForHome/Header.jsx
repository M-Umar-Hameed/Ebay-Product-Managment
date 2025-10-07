import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Button,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import apiService from '../api/apiService';
import { userStore } from '../store/authStore';

export default function Header({ handleLogout }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const navigate = useNavigate();
  const user = userStore((store) => store.user);

  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleLogoutClick = () => {
    handleLogout(); // Calls the handleLogout function from App.js
    navigate('/login'); // Redirect to login
  };

  const handleEbayLogout = async () => {
    if (!user?.id) return;

    try {
      const response = await apiService.auth.ebayLogout(user.id);

      if (response.success) {
        // Clear eBay tokens from localStorage
        localStorage.removeItem('ebay_user_token');
        localStorage.removeItem('ebay_refresh_token');

        // Refresh the page to show the "Connect to eBay" screen
        window.location.reload();
      } else {
        console.error('Failed to logout from eBay:', response.error);
        alert('Failed to disconnect eBay account. Please try again.');
      }
    } catch (error) {
      console.error('Error during eBay logout:', error);
      alert('Failed to disconnect eBay account. Please try again.');
    }
  };

  return (
    <AppBar
      position="sticky"
      sx={{
        backgroundColor: '#333', // Darker background for contrast
        boxShadow: 'none', // Removing shadow for a clean look
        padding: '10px 0', // Add some padding to the AppBar
      }}
    >
      <Toolbar
        sx={{ justifyContent: 'space-around', gap: 42, minHeight: 70, px: 4 }}
      >
        <Box display="flex" alignItems="center">
          <img
            src={logo}
            alt="Logo"
            width="140px"
            height="63px"
            onClick={() => navigate('/home')}
          />
        </Box>

        <Box display="flex" alignItems="center" gap={4}>
          {/* Help Icon with hover effect */}
          <Box
            display="flex"
            alignItems="center"
            sx={{
              color: '#B0BEC5', // Lighter text for secondary elements
              fontSize: '16px', // Increased font size for better readability
              cursor: 'pointer',
              '&:hover': {
                color: '#ffffff',
                transition: 'color 0.3s ease-in-out',
              },
            }}
          >
            <HelpOutlineIcon fontSize="small" sx={{ mr: 1 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Help
            </Typography>
          </Box>

          {/* Logout button */}
          <IconButton
            onClick={handleMenuOpen}
            sx={{
              backgroundColor: '#1976d2', // Blue color for logout button
              color: '#ffffff',
              p: 2,
              borderRadius: '50%',
              '&:hover': {
                backgroundColor: '#1565c0', // Darker shade on hover
                transition: 'background-color 0.3s ease',
              },
            }}
          >
            <PowerSettingsNewIcon fontSize="small" />
          </IconButton>

          {/* Dropdown Menu for Logout */}
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            sx={{ mt: 2 }}
          >
            <MenuItem onClick={handleLogoutClick}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Logout
              </Typography>
            </MenuItem>
            <MenuItem onClick={handleEbayLogout}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Disconnect eBay
              </Typography>
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
