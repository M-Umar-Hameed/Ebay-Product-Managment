import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  MenuItem,
  TextField,
  Button,
  Alert,
  Collapse,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import apiService from '../api/apiService';

export default function AssignStrategyRule() {
  const navigate = useNavigate();
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [assignToAll, setAssignToAll] = useState(false);
  const [loading, setLoading] = useState(false);

  // Alert state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItemId, setDialogItemId] = useState('');
  const [dialogItemTitle, setDialogItemTitle] = useState('');

  useEffect(() => {
    fetchAvailableStrategies();
  }, []);

  const fetchAvailableStrategies = async () => {
    try {
      const response =
        await apiService.pricingStrategies.getAllUniqueStrategies();
      if (response.success) {
        setAvailableStrategies(response.strategies || []);
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  };

  const showAlert = (message, severity) => {
    setAlertMessage(message);
    setAlertSeverity(severity);
    setAlertOpen(true);
    if (severity === 'success') {
      setTimeout(() => setAlertOpen(false), 4000);
    }
  };

  const handleAssignStrategy = async () => {
    if (!selectedStrategy) {
      showAlert('Please select a pricing strategy', 'error');
      return;
    }

    setLoading(true);
    try {
      // This would need to be implemented in the backend
      // For now, just show success message
      showAlert(
        'Pricing strategy assignment functionality coming soon!',
        'info'
      );
    } catch (error) {
      showAlert('Failed to assign strategy: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (itemId, itemTitle) => {
    setDialogItemId(itemId);
    setDialogItemTitle(itemTitle);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedStrategy('');
  };

  const handleAssignStrategyToItem = async () => {
    if (!selectedStrategy) {
      return;
    }

    setLoading(true);
    try {
      const response =
        await apiService.pricingStrategies.applyStrategyToProduct(
          dialogItemId,
          [selectedStrategy]
        );

      if (response.success) {
        showAlert('Strategy assigned successfully!', 'success');
        handleCloseDialog();
      } else {
        showAlert('Failed to assign strategy: ' + response.message, 'error');
      }
    } catch (error) {
      showAlert('Error: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container sx={{ mt: 2, mb: 3 }}>
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

      <Box
        sx={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: 2,
          p: 3,
        }}
      >
        <Typography variant="h6" gutterBottom>
          Apply Pricing Strategy to Listings
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Choose a strategy from the drop down menu below. Then choose listings
          to apply it to by selecting the left side check box in the table. Then
          click 'Assign Strategy'.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
          <TextField
            select
            label="Strategy"
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            sx={{ minWidth: 200 }}
            size="small"
          >
            {availableStrategies.map((strategy) => (
              <MenuItem key={strategy._id} value={strategy.strategyName}>
                {strategy.displayName || strategy.strategyName}
              </MenuItem>
            ))}
          </TextField>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
              id="assignToAllStrategies"
              checked={assignToAll}
              onChange={(e) => setAssignToAll(e.target.checked)}
            />
            <label
              htmlFor="assignToAllStrategies"
              style={{ marginLeft: '8px' }}
            >
              <Typography variant="body2">
                Assign this strategy to all my active listings.
              </Typography>
            </label>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={handleAssignStrategy}
            disabled={loading}
            sx={{
              backgroundColor: '#28a745',
              '&:hover': { backgroundColor: '#218838' },
              fontWeight: 600,
              color: 'white',
            }}
          >
            {loading ? 'ASSIGNING...' : 'ASSIGN PRICING STRATEGY'}
          </Button>

          <Button
            variant="outlined"
            onClick={() => navigate('/home/add-strategy')}
            sx={{
              fontWeight: 600,
              borderColor: '#6c757d',
              color: '#6c757d',
              '&:hover': {
                borderColor: '#5a6268',
                backgroundColor: '#f8f9fa',
              },
            }}
          >
            + ADD STRATEGY
          </Button>
        </Box>
      </Box>

      {/* Assign Strategy to Specific Listing Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Assign Strategy to Listing</DialogTitle>

        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Assign a pricing strategy to: <strong>{dialogItemTitle}</strong>
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select Strategy</InputLabel>
            <Select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              label="Select Strategy"
              disabled={loading}
            >
              {availableStrategies.map((strategy) => (
                <MenuItem key={strategy._id} value={strategy._id}>
                  <Box>
                    <Typography variant="body1">
                      {strategy.strategyName}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {strategy.repricingRule} - Min: $
                      {strategy.minPrice || 'N/A'} - Max: $
                      {strategy.maxPrice || 'N/A'}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {availableStrategies.length === 0 && (
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ fontStyle: 'italic' }}
            >
              No strategies available. Create a strategy first.
            </Typography>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleAssignStrategyToItem}
            variant="contained"
            disabled={
              loading || !selectedStrategy || availableStrategies.length === 0
            }
          >
            {loading ? 'Assigning...' : 'Assign Strategy'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
