import React from 'react';
import { Box } from '@mui/material';
import AddStrategyForm from '../componentsForEditListing/AddStrategyForm';

export default function AddStrategy() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, py: 4 }}>
        <AddStrategyForm />
      </Box>
    </Box>
  );
}
