import React from 'react';
import { Box, Typography } from '@mui/material';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        backgroundColor: '#2E3B4E',
        py: 2,
        px: 4,
        color: '#fff',
        fontSize: 14,
        textAlign: 'left',
        zIndex: 1000
      }}
    >
      <Typography variant="body2">
        Copyright © 2025 Seller Bay Republic
      </Typography>
    </Box>
  );
}
