import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Alert,
  Collapse,
  IconButton,
  CircularProgress,
  Grid,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import apiService from '../api/apiService';

export default function AddStrategyForm() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    strategyName: '',
    repricingRule: '',
    byType: '', // "AMOUNT" or "PERCENTAGE" - unified for both beat and stay above
    value: '',
    noCompetitionAction: 'USE_MAX_PRICE',
    assignToActiveListings: false,
  });

  // Alert state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');

  // Handle input changes
  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Handle repricing rule change
  const handleRepricingRuleChange = (event) => {
    const value = event.target.value;
    setFormData((prev) => ({
      ...prev,
      repricingRule: value,
      // Reset dependent fields when rule changes
      byType: '',
      value: '',
    }));
  };

  // Show alert
  const showAlert = (message, severity) => {
    setAlertMessage(message);
    setAlertSeverity(severity);
    setAlertOpen(true);

    if (severity === 'success') {
      setTimeout(() => {
        setAlertOpen(false);
      }, 5000);
    }
  };

  // Create pricing strategy payload
  const getPricingStrategyPayload = () => {
    const payload = {
      strategyName: formData.strategyName,
      repricingRule: formData.repricingRule,
      noCompetitionAction: formData.noCompetitionAction,
    };

    // Add strategy-specific parameters based on rule type
    if (formData.repricingRule === 'BEAT_LOWEST') {
      payload.beatBy = formData.byType;
      payload.value =
        formData.byType === 'PERCENTAGE'
          ? parseFloat(formData.value) / 100 // Convert to decimal
          : parseFloat(formData.value);
    } else if (formData.repricingRule === 'STAY_ABOVE') {
      payload.stayAboveBy = formData.byType;
      payload.value =
        formData.byType === 'PERCENTAGE'
          ? parseFloat(formData.value) / 100 // Convert to decimal
          : parseFloat(formData.value);
    }

    return payload;
  };

  // Handle Add Strategy button
  const handleAddStrategy = async () => {
    try {
      setSubmitting(true);

      // Validate required fields
      if (!formData.strategyName) {
        showAlert('Strategy name is required', 'error');
        return;
      }
      if (!formData.repricingRule) {
        showAlert('Repricing rule is required', 'error');
        return;
      }

      // Validate strategy-specific fields for BEAT_LOWEST and STAY_ABOVE
      if (
        formData.repricingRule === 'BEAT_LOWEST' ||
        formData.repricingRule === 'STAY_ABOVE'
      ) {
        if (!formData.byType || !formData.value) {
          showAlert(
            `${
              formData.repricingRule === 'BEAT_LOWEST'
                ? 'Beat by'
                : 'Stay above by'
            } type and value are required`,
            'error'
          );
          return;
        }
      }

      const strategyPayload = getPricingStrategyPayload();

      // Create the strategy
      const response = await apiService.pricingStrategies.createStrategy(
        strategyPayload
      );

      if (response.success) {
        showAlert('Pricing strategy created successfully!', 'success');

        // Navigate back after success
        setTimeout(() => {
          navigate('/home'); // Go back to home page
        }, 2000);
      } else {
        throw new Error(response.message || 'Failed to create strategy');
      }
    } catch (error) {
      console.error('Error creating pricing strategy:', error);
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container>
      <Box sx={{ px: 4, py: 5, width: '100%', maxWidth: 700 }}>
        {/* Alert */}
        <Collapse in={alertOpen}>
          <Alert
            severity={alertSeverity}
            action={
              <IconButton
                aria-label="close"
                color="inherit"
                size="small"
                onClick={() => setAlertOpen(false)}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            }
            sx={{ mb: 2 }}
          >
            {alertMessage}
          </Alert>
        </Collapse>

        {/* Title */}
        <Typography
          variant="h5"
          fontWeight="bold"
          mb={3}
          sx={{ textAlign: 'left', color: '#333' }}
        >
          Add Strategy
        </Typography>

        <Box component="form" display="flex" flexDirection="column" gap={3}>
          {/* Strategy Name */}
          <TextField
            label="Strategy Name"
            name="strategyName"
            value={formData.strategyName}
            onChange={handleInputChange}
            required
            placeholder="Enter strategy name"
            sx={{
              '& .MuiInputLabel-root': { fontSize: '16px' },
              '& .MuiInputBase-root': { fontSize: '16px' },
            }}
          />

          {/* Repricing Rule */}
          <TextField
            select
            label="Repricing Rule"
            name="repricingRule"
            value={formData.repricingRule}
            onChange={handleRepricingRuleChange}
            required
            sx={{
              '& .MuiInputLabel-root': { fontSize: '16px' },
              '& .MuiInputBase-root': { fontSize: '16px' },
            }}
          >
            <MenuItem value="">Select a rule</MenuItem>
            <MenuItem value="MATCH_LOWEST">Match the Lowest Price</MenuItem>
            <MenuItem value="BEAT_LOWEST">BELOW the Lowest Price</MenuItem>
            <MenuItem value="STAY_ABOVE">ABOVE the Lowest Price</MenuItem>
          </TextField>

          {/* Show By dropdown and Value input for BEAT_LOWEST and STAY_ABOVE */}
          {(formData.repricingRule === 'BEAT_LOWEST' ||
            formData.repricingRule === 'STAY_ABOVE') && (
            <>
              <TextField
                select
                label="By"
                name="byType"
                value={formData.byType}
                onChange={handleInputChange}
                required
                sx={{
                  '& .MuiInputLabel-root': { fontSize: '16px' },
                  '& .MuiInputBase-root': { fontSize: '16px' },
                }}
              >
                <MenuItem value="">Select type</MenuItem>
                <MenuItem value="AMOUNT">Amount</MenuItem>
                <MenuItem value="PERCENTAGE">Percentage</MenuItem>
              </TextField>

              <TextField
                label="Value"
                name="value"
                value={formData.value}
                onChange={handleInputChange}
                placeholder="0"
                type="number"
                inputProps={{
                  step: formData.byType === 'PERCENTAGE' ? '1' : '0.01',
                  min: '0',
                }}
                required
                sx={{
                  '& .MuiInputLabel-root': { fontSize: '16px' },
                  '& .MuiInputBase-root': { fontSize: '16px' },
                }}
              />
            </>
          )}

          {/* Advanced Options */}
          <Typography
            variant="h6"
            fontWeight="bold"
            sx={{ color: '#333', mt: 2 }}
          >
            Advanced Options
          </Typography>

          <Grid container alignItems="center" spacing={2}>
            <Grid item xs={4}>
              <Typography>If there is no competition</Typography>
            </Grid>
            <Grid item xs={8}>
              <TextField
                select
                name="noCompetitionAction"
                value={formData.noCompetitionAction}
                onChange={handleInputChange}
                fullWidth
                sx={{ '& .MuiInputBase-root': { fontSize: '14px' } }}
              >
                <MenuItem value="USE_MAX_PRICE">Use Max Price</MenuItem>
                <MenuItem value="USE_MIN_PRICE">Use Min Price</MenuItem>
                <MenuItem value="KEEP_CURRENT">Keep Current Price</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          {/* Assign to Active Listings Checkbox */}
          <Box mt={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.assignToActiveListings}
                  onChange={handleInputChange}
                  name="assignToActiveListings"
                />
              }
              label="Assign this strategy now to all my active listings."
            />
          </Box>

          {/* Add Strategy Button */}
          <Button
            variant="contained"
            color="primary"
            onClick={handleAddStrategy}
            disabled={submitting}
            sx={{
              padding: '12px 20px',
              width: '140px',
              fontWeight: 600,
              fontSize: '16px',
              borderRadius: '8px',
              backgroundColor: '#6c92bf',
              '&:hover': {
                backgroundColor: '#5a7ba8',
                boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
              },
              transition: 'all 0.3s ease-in-out',
            }}
          >
            {submitting ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Add Strategy'
            )}
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
