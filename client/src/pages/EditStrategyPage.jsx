import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Link,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import apiService from '../api/apiService';
import { useProductStore } from '../store/productStore';

export default function EditStrategyPage() {
  const { strategyName } = useParams();
  const navigate = useNavigate();
  const [strategy, setStrategy] = useState(null);
  const [associatedListings, setAssociatedListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const { modifyProductsArray } = useProductStore();

  // Form state for editing strategy
  const [formData, setFormData] = useState({
    strategyName: '',
    repricingRule: '',
    description: '',
    beatBy: '',
    stayAboveBy: '',
    value: '',
    noCompetitionAction: '',
    isActive: true,
  });

  // Alert state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');

  useEffect(() => {
    fetchStrategyDetails();
  }, [strategyName]);

  const fetchStrategyDetails = async () => {
    try {
      setLoading(true);

      // Get all strategies to find the one with matching name
      const strategiesResponse =
        await apiService.pricingStrategies.getAllUniqueStrategies();

      if (strategiesResponse.success) {
        const foundStrategy = strategiesResponse.strategies.find(
          (s) => s.strategyName === strategyName
        );

        if (foundStrategy) {
          setStrategy(foundStrategy);

          // Only set beatBy/stayAboveBy if they exist and are not empty
          const cleanBeatBy =
            foundStrategy.beatBy && foundStrategy.beatBy.trim() !== ''
              ? foundStrategy.beatBy
              : null;

          const cleanStayAboveBy =
            foundStrategy.stayAboveBy && foundStrategy.stayAboveBy.trim() !== ''
              ? foundStrategy.stayAboveBy
              : null;

          setFormData({
            strategyName: foundStrategy.strategyName,
            repricingRule: foundStrategy.repricingRule,
            description: foundStrategy.description || '',
            beatBy: cleanBeatBy,
            stayAboveBy: cleanStayAboveBy,
            value: foundStrategy.value || '',
            noCompetitionAction:
              foundStrategy.noCompetitionAction || 'USE_MAX_PRICE',
            isActive: foundStrategy.isActive !== false,
          });

          // Fetch associated listings
          await fetchAssociatedListings(foundStrategy);
        } else {
          setError('Strategy not found');
        }
      } else {
        setError('Failed to fetch strategy details');
      }
    } catch (err) {
      setError('Error loading strategy: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssociatedListings = async (strategyObj) => {
    try {
      // Get active listings and filter by strategy
      const listingsResponse = await apiService.inventory.getActiveListings();

      if (listingsResponse.success) {
        let ebayListings = [];
        if (
          listingsResponse.data.GetMyeBaySellingResponse &&
          listingsResponse.data.GetMyeBaySellingResponse.ActiveList.ItemArray
        ) {
          const itemArray =
            listingsResponse.data.GetMyeBaySellingResponse.ActiveList.ItemArray;
          if (Array.isArray(itemArray.Item)) {
            ebayListings = itemArray.Item;
          } else if (itemArray.Item) {
            ebayListings = [itemArray.Item];
          }
        }

        // Filter listings that have this strategy applied
        const associatedItems = [];

        for (const listing of ebayListings) {
          try {
            const strategyDisplay =
              await apiService.pricingStrategies.getStrategyDisplayForProduct(
                listing.ItemID
              );

            if (strategyDisplay.success && strategyDisplay.data.hasStrategy) {
              // Check if this listing uses our strategy
              if (
                strategyDisplay.data.strategy.includes(strategyObj.strategyName)
              ) {
                associatedItems.push({
                  itemId: listing.ItemID,
                  title: listing.Title,
                  sku: listing.SKU || 'N/A',
                  currentPrice: `USD ${parseFloat(
                    listing.BuyItNowPrice || 0
                  ).toFixed(2)}`,
                  quantity: parseInt(listing.Quantity || '0', 10),
                  status: listing.SellingStatus?.ListingStatus || 'Active',
                  appliedAt: new Date().toLocaleDateString(), // This could be fetched from strategy data
                });
              }
            }
          } catch (err) {
            // Skip this listing if there's an error
            console.warn(`Error checking strategy for ${listing.ItemID}:`, err);
          }
        }

        setAssociatedListings(associatedItems);
      }
    } catch (err) {
      console.error('Error fetching associated listings:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSaveStrategy = async () => {
    try {
      setSaving(true);

      // Clean the form data before sending
      const cleanFormData = {
        strategyName: formData.strategyName,
        repricingRule: formData.repricingRule,
        description: formData.description,
        noCompetitionAction: formData.noCompetitionAction,
        isActive: formData.isActive,
      };

      // Only include beatBy/stayAboveBy if they have valid values
      if (formData.repricingRule === 'BEAT_LOWEST') {
        if (formData.beatBy && formData.beatBy.trim() !== '') {
          cleanFormData.beatBy = formData.beatBy;
        }
        if (
          formData.value !== '' &&
          formData.value !== null &&
          formData.value !== undefined
        ) {
          cleanFormData.value = formData.value;
        }
      } else if (formData.repricingRule === 'STAY_ABOVE') {
        if (formData.stayAboveBy && formData.stayAboveBy.trim() !== '') {
          cleanFormData.stayAboveBy = formData.stayAboveBy;
        }
        if (
          formData.value !== '' &&
          formData.value !== null &&
          formData.value !== undefined
        ) {
          cleanFormData.value = formData.value;
        }
      }

      const updateResponse = await apiService.pricingStrategies.updateStrategy(
        strategy._id,
        cleanFormData
      );

      if (updateResponse.success) {
        // Update local strategy details
        setStrategy(updateResponse.data);
        setIsEditing(false);
        showAlert('Strategy updated successfully!', 'success');

        // Refresh the associated listings to show updated strategy
        await fetchAssociatedListings(updateResponse.data);
      } else {
        showAlert(
          'Failed to update strategy: ' +
            (updateResponse.error || 'Unknown error'),
          'error'
        );
      }
    } catch (err) {
      showAlert('Error updating strategy: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromListing = async (itemId) => {
    try {
      // Remove strategy from specific listing
      const removeResponse =
        await apiService.pricingStrategies.deleteStrategyFromProduct(itemId);

      if (removeResponse.success) {
        // Refresh associated listings
        await fetchAssociatedListings(strategy);
        showAlert('Strategy removed from listing successfully!', 'success');
      } else {
        showAlert('Failed to remove strategy from listing', 'error');
      }
    } catch (err) {
      showAlert('Error removing strategy: ' + err.message, 'error');
    }
  };

  const showAlert = (msg, type) => {
    setAlertMessage(msg);
    setAlertSeverity(type);
    setAlertOpen(true);
    if (type === 'success') {
      setTimeout(() => setAlertOpen(false), 4000);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">
          {error}
          <Button onClick={() => navigate('/home')} sx={{ ml: 2 }}>
            Go Back
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/home')} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1">
          Edit Strategy: {strategyName}
        </Typography>
      </Box>

      {/* Alert */}
      <Collapse in={alertOpen}>
        <Alert
          severity={alertSeverity}
          onClose={() => setAlertOpen(false)}
          sx={{ mb: 2 }}
        >
          {alertMessage}
        </Alert>
      </Collapse>

      {/* Strategy Details Form */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 3,
          }}
        >
          <Typography variant="h6">Strategy Details</Typography>
          <Box>
            {!isEditing ? (
              <Button
                startIcon={<EditIcon />}
                onClick={() => setIsEditing(true)}
                variant="outlined"
              >
                Edit Strategy
              </Button>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  startIcon={<SaveIcon />}
                  onClick={handleSaveStrategy}
                  variant="contained"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  startIcon={<CancelIcon />}
                  onClick={() => setIsEditing(false)}
                  variant="outlined"
                >
                  Cancel
                </Button>
              </Box>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 3,
          }}
        >
          <TextField
            label="Strategy Name"
            name="strategyName"
            value={formData.strategyName}
            onChange={handleInputChange}
            disabled={!isEditing}
            fullWidth
          />

          <TextField
            select
            label="Repricing Rule"
            name="repricingRule"
            value={formData.repricingRule}
            onChange={handleInputChange}
            disabled={!isEditing}
            fullWidth
          >
            <MenuItem value="MATCH_LOWEST">Match Lowest</MenuItem>
            <MenuItem value="BEAT_LOWEST">Beat Lowest</MenuItem>
            <MenuItem value="STAY_ABOVE">Stay Above</MenuItem>
          </TextField>

          {(formData.repricingRule === 'BEAT_LOWEST' ||
            formData.repricingRule === 'STAY_ABOVE') && (
            <>
              <TextField
                select
                label={
                  formData.repricingRule === 'BEAT_LOWEST'
                    ? 'Beat By'
                    : 'Stay Above By'
                }
                name={
                  formData.repricingRule === 'BEAT_LOWEST'
                    ? 'beatBy'
                    : 'stayAboveBy'
                }
                value={
                  formData.repricingRule === 'BEAT_LOWEST'
                    ? formData.beatBy || ''
                    : formData.stayAboveBy || ''
                }
                onChange={handleInputChange}
                disabled={!isEditing}
                fullWidth
              >
                <MenuItem value="">Select type</MenuItem>
                <MenuItem value="AMOUNT">Amount</MenuItem>
                <MenuItem value="PERCENTAGE">Percentage</MenuItem>
              </TextField>

              <TextField
                label="Value"
                name="value"
                type="number"
                value={formData.value || ''}
                onChange={handleInputChange}
                disabled={!isEditing}
                fullWidth
                inputProps={{ step: '0.01', min: '0' }}
              />
            </>
          )}

          <TextField
            select
            label="No Competition Action"
            name="noCompetitionAction"
            value={formData.noCompetitionAction}
            onChange={handleInputChange}
            disabled={!isEditing}
            fullWidth
          >
            <MenuItem value="USE_MAX_PRICE">Use Max Price</MenuItem>
            <MenuItem value="KEEP_CURRENT">Keep Current</MenuItem>
            <MenuItem value="USE_MIN_PRICE">Use Min Price</MenuItem>
          </TextField>
        </Box>

        <TextField
          label="Description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          disabled={!isEditing}
          fullWidth
          multiline
          rows={2}
          sx={{ mt: 3 }}
        />
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Associated Listings Table */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Listings Using This Strategy ({associatedListings.length})
      </Typography>

      {associatedListings.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No listings are currently using this strategy
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>SKU</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Current Price</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Quantity</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Applied At</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {associatedListings.map((listing) => (
                <TableRow key={listing.itemId} hover>
                  <TableCell>
                    <Link
                      href={`https://www.ebay.com/itm/${listing.itemId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="hover"
                      color="primary"
                      sx={{ fontWeight: 500 }}
                    >
                      {listing.title}
                    </Link>
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                    >
                      ID: {listing.itemId}
                    </Typography>
                  </TableCell>
                  <TableCell>{listing.sku}</TableCell>
                  <TableCell>{listing.currentPrice}</TableCell>
                  <TableCell>{listing.quantity}</TableCell>
                  <TableCell>
                    <Chip
                      label={listing.status}
                      color={
                        listing.status === 'Active' ? 'success' : 'default'
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{listing.appliedAt}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        onClick={() =>
                          navigate(`/home/update-strategy/${listing.itemId}`)
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => handleRemoveFromListing(listing.itemId)}
                        startIcon={<DeleteIcon />}
                      >
                        Remove
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
}
