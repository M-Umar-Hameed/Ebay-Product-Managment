import React from 'react';
import { Typography, Box, Container } from '@mui/material';

export default function ListingsHeading({
  title = 'Active Listings - Strategy Managed',
  subtitle = 'Manage your eBay listings, pricing strategies, and competitor monitoring',
}) {
  return (
    <Container sx={{ mt: 3, mb: 2 }}>
      <Typography
        variant="h4" // Larger font size for improved readability
        sx={{
          padding: '50px 0', // More padding for better spacing
          fontWeight: 700, // Bold font for stronger visual presence
          fontFamily: `'Roboto', sans-serif`, // Clean, modern font
          fontSize: '29px', // Slightly larger font size
          color: '#333', // Darker text for contrast
          lineHeight: 1.5, // Better line spacing for easier reading
          textAlign: 'center', // Center align the heading
          transition: 'color 0.3s ease-in-out', // Smooth color transition on hover
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ textAlign: 'center' }}
      >
        {subtitle}
      </Typography>
    </Container>
  );
}
