import React from 'react';
import { Button, Box } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

export default function HelpButton() {
  const handleClick = () => {
    alert('Help clicked!'); // Replace with modal or link if needed
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 32,
        left: 32,
        zIndex: 999,
      }}
    >
      <Button
        onClick={handleClick}
        variant="contained"
        startIcon={<HelpOutlineIcon />}
        sx={{
          backgroundColor: '#2E3B4E',
          color: '#fff',
          borderRadius: '999px',
          textTransform: 'none',
          fontWeight: 'bold',
          px: 2.5,
          py: 1,
          boxShadow: 2,
          '&:hover': {
            backgroundColor: '#1f2c3a',
          },
        }}
      >
        Help
      </Button>
    </Box>
  );
}
