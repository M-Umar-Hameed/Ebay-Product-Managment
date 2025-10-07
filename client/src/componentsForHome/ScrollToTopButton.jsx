import React, { useEffect, useState } from 'react';
import { Box, Fab, Zoom } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  const handleScroll = () => {
    setVisible(window.scrollY > 300);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <Zoom in={visible}>
      <Box
        onClick={scrollToTop}
        role="button"
        sx={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          zIndex: 999,
          cursor: 'pointer',
        }}
      >
        <Fab
          sx={{
            backgroundColor: '#3c4b5c',
            width: 48,
            height: 48,
            minHeight: 'unset',
            '&:hover': {
              backgroundColor: '#2E3B4E',
            },
          }}
          size="small"
        >
          <KeyboardArrowUpIcon sx={{ color: '#fff' }} />
        </Fab>
      </Box>
    </Zoom>
  );
}
