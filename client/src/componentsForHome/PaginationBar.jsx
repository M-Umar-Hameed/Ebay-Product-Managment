import React from 'react';
import { Box, Button } from '@mui/material';

export default function PaginationBar({
  currentPage = 1,
  totalPages = 4,
  onPageChange,
}) {
  const handleChange = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page);
    }
  };

  // Don't render pagination if there's only one page or no pages
  if (totalPages <= 1) {
    return null;
  }

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      gap={2}
      sx={{ py: 3, pb: 10 }}
    >
      <Button
        variant="outlined"
        onClick={() => handleChange(currentPage - 1)}
        disabled={currentPage === 1}
        sx={{
          minWidth: 80,
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 20,
          color: currentPage === 1 ? '#bdbdbd' : '#1976d2',
          '&:hover': {
            backgroundColor: currentPage === 1 ? 'transparent' : '#e3f2fd',
          },
        }}
      >
        Previous
      </Button>

      {[...Array(totalPages)].map((_, idx) => {
        const page = idx + 1;
        return (
          <Button
            key={page}
            variant={page === currentPage ? 'contained' : 'outlined'}
            color={page === currentPage ? 'primary' : 'inherit'} // Blue for active page
            onClick={() => handleChange(page)}
            sx={{
              minWidth: 40,
              fontWeight: page === currentPage ? 600 : 400,
              textTransform: 'none',
              borderRadius: 20,
              fontSize: '16px', // Increase font size for better readability
              '&:hover': {
                backgroundColor: page === currentPage ? '#1976d2' : '#E3F2FD', // Lighter blue for hover effect
              },
              borderColor: page === currentPage ? '#1976d2' : '#ddd', // Active page has blue border
              color: page === currentPage ? '#fff' : '#1976d2', // Active page text color
            }}
          >
            {page}
          </Button>
        );
      })}

      <Button
        variant="outlined"
        onClick={() => handleChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        sx={{
          minWidth: 80,
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 20,
          color: currentPage === totalPages ? '#bdbdbd' : '#1976d2',
          '&:hover': {
            backgroundColor:
              currentPage === totalPages ? 'transparent' : '#e3f2fd',
          },
        }}
      >
        Next
      </Button>
    </Box>
  );
}
