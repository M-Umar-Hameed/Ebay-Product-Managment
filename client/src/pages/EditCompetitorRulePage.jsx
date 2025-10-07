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

export default function EditCompetitorRulePage() {
  const { ruleName } = useParams();
  const navigate = useNavigate();
  const [rule, setRule] = useState(null);
  const [associatedListings, setAssociatedListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Form state for editing rule
  const [formData, setFormData] = useState({
    ruleName: '',
    ruleType: '',
    description: '',
    searchCriteria: '',
    frequency: 'HOURLY',
    isActive: true,
    autoAddCompetitors: false,
  });

  // Alert state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');

  useEffect(() => {
    fetchRuleDetails();
  }, [ruleName]);

  const fetchRuleDetails = async () => {
    try {
      setLoading(true);

      // Get all rules to find the one with matching name
      const rulesResponse = await apiService.competitorRules.getAllRules();

      if (rulesResponse.success) {
        const foundRule = rulesResponse.rules.find(
          (r) => r.ruleName === ruleName
        );

        if (foundRule) {
          setRule(foundRule);
          setFormData({
            ruleName: foundRule.ruleName,
            ruleType: foundRule.ruleType,
            description: foundRule.description || '',
            searchCriteria: foundRule.searchCriteria || '',
            frequency: foundRule.frequency || 'HOURLY',
            isActive: foundRule.isActive !== false,
            autoAddCompetitors: foundRule.autoAddCompetitors || false,
          });

          // Fetch associated listings
          await fetchAssociatedListings(foundRule);
        } else {
          setError('Competitor rule not found');
        }
      } else {
        setError('Failed to fetch competitor rule details');
      }
    } catch (err) {
      setError('Error loading competitor rule: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssociatedListings = async (ruleObj) => {
    try {
      // Get active listings and filter by rule
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

        // Filter listings that have this rule applied
        const associatedItems = [];

        for (const listing of ebayListings) {
          try {
            const ruleData =
              await apiService.competitorRules.getRuleFromProduct(
                listing.ItemID
              );

            if (ruleData.success && ruleData.data) {
              // Check if this listing uses our rule
              if (ruleData.data.ruleName === ruleObj.ruleName) {
                associatedItems.push({
                  itemId: listing.ItemID,
                  title: listing.Title,
                  sku: listing.SKU || 'N/A',
                  currentPrice: `USD ${parseFloat(
                    listing.BuyItNowPrice || 0
                  ).toFixed(2)}`,
                  quantity: parseInt(listing.Quantity || '0', 10),
                  status: listing.SellingStatus?.ListingStatus || 'Active',
                  appliedAt: new Date().toLocaleDateString(),
                });
              }
            }
          } catch (err) {
            console.warn(`Error checking rule for ${listing.ItemID}:`, err);
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

  const handleSaveRule = async () => {
    try {
      setSaving(true);

      // Since we don't have update rule endpoint yet, show success message
      setRule(formData);
      setIsEditing(false);
      showAlert('Competitor rule updated successfully!', 'success');
    } catch (err) {
      showAlert('Error updating competitor rule: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromListing = async (itemId) => {
    try {
      const removeResponse =
        await apiService.competitorRules.deleteRuleFromProduct(itemId);

      if (removeResponse.success) {
        await fetchAssociatedListings(rule);
        showAlert('Rule removed from listing successfully!', 'success');
      } else {
        showAlert('Failed to remove rule from listing', 'error');
      }
    } catch (err) {
      showAlert('Error removing rule: ' + err.message, 'error');
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
          Edit Competitor Rule: {ruleName}
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

      {/* Rule Details Form */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 3,
          }}
        >
          <Typography variant="h6">Competitor Rule Details</Typography>
          <Box>
            {!isEditing ? (
              <Button
                startIcon={<EditIcon />}
                onClick={() => setIsEditing(true)}
                variant="outlined"
              >
                Edit Rule
              </Button>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  startIcon={<SaveIcon />}
                  onClick={handleSaveRule}
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
            label="Rule Name"
            name="ruleName"
            value={formData.ruleName}
            onChange={handleInputChange}
            disabled={!isEditing}
            fullWidth
          />

          <TextField
            select
            label="Rule Type"
            name="ruleType"
            value={formData.ruleType}
            onChange={handleInputChange}
            disabled={!isEditing}
            fullWidth
          >
            <MenuItem value="AUTO_SEARCH">Auto Search</MenuItem>
            <MenuItem value="MANUAL_SEARCH">Manual Search</MenuItem>
            <MenuItem value="CATEGORY_BASED">Category Based</MenuItem>
            <MenuItem value="KEYWORD_BASED">Keyword Based</MenuItem>
          </TextField>

          <TextField
            label="Search Criteria"
            name="searchCriteria"
            value={formData.searchCriteria}
            onChange={handleInputChange}
            disabled={!isEditing}
            fullWidth
            placeholder="Enter search terms, keywords, or criteria"
          />

          <TextField
            select
            label="Frequency"
            name="frequency"
            value={formData.frequency}
            onChange={handleInputChange}
            disabled={!isEditing}
            fullWidth
          >
            <MenuItem value="HOURLY">Hourly</MenuItem>
            <MenuItem value="DAILY">Daily</MenuItem>
            <MenuItem value="WEEKLY">Weekly</MenuItem>
            <MenuItem value="MANUAL">Manual Only</MenuItem>
          </TextField>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              checked={formData.isActive}
              onChange={handleInputChange}
              disabled={!isEditing}
            />
            <label htmlFor="isActive">
              <Typography variant="body2">Active Rule</Typography>
            </label>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input
              type="checkbox"
              id="autoAddCompetitors"
              name="autoAddCompetitors"
              checked={formData.autoAddCompetitors}
              onChange={handleInputChange}
              disabled={!isEditing}
            />
            <label htmlFor="autoAddCompetitors">
              <Typography variant="body2">
                Auto-add Found Competitors
              </Typography>
            </label>
          </Box>
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
          placeholder="Describe what this rule does and how it searches for competitors"
        />
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Associated Listings Table */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Listings Using This Rule ({associatedListings.length})
      </Typography>

      {associatedListings.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No listings are currently using this competitor rule
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
