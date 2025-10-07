import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
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
import { useProductStore } from '../store/productStore';
import { useNavigate } from 'react-router-dom';
import apiService from '../api/apiService';

export default function CompetitorRuleForm() {
  const { ItemId, AllProducts, modifyProductsObj, sku } = useProductStore();
  const [product, setProduct] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    ruleName: '',
    minPercentOfCurrentPrice: '',
    maxPercentOfCurrentPrice: '',
    excludeCountries: '',
    excludeConditions: '',
    excludeProductTitleWords: '',
    excludeSellers: '',
    findCompetitorsBasedOnMPN: false,
    assignToActiveListings: false,
  });

  // Alert state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');

  // Effect to fetch product data
  useEffect(() => {
    const fetchProductData = async () => {
      try {
        setLoading(true);
        const productObj = AllProducts.filter((item) =>
          item.sku ? item.sku === sku : item.productId === ItemId
        );

        if (productObj.length === 0) {
          setError('Product not found');
          return;
        }

        setProduct(productObj);
        modifyProductsObj(productObj);
      } catch (err) {
        setError('Error loading product data: ' + err.message);
        console.error('Error loading product:', err);
      } finally {
        setLoading(false);
      }
    };

    if (ItemId) {
      fetchProductData();
    }
  }, [ItemId, AllProducts, modifyProductsObj]);

  // Handle input changes
  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
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

  // Create competitor rule payload
  const getCompetitorRulePayload = () => {
    const payload = {
      ruleName: formData.ruleName,
      findCompetitorsBasedOnMPN: formData.findCompetitorsBasedOnMPN,
    };

    if (formData.minPercentOfCurrentPrice) {
      payload.minPercentOfCurrentPrice = parseFloat(
        formData.minPercentOfCurrentPrice
      );
    }
    if (formData.maxPercentOfCurrentPrice) {
      payload.maxPercentOfCurrentPrice = parseFloat(
        formData.maxPercentOfCurrentPrice
      );
    }
    if (formData.excludeCountries) {
      payload.excludeCountries = formData.excludeCountries
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    }
    if (formData.excludeConditions) {
      payload.excludeConditions = formData.excludeConditions
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    }
    if (formData.excludeProductTitleWords) {
      payload.excludeProductTitleWords = formData.excludeProductTitleWords
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    }
    if (formData.excludeSellers) {
      payload.excludeSellers = formData.excludeSellers
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    }

    return payload;
  };

  // Handle Add Rule button
  const handleAddRule = async () => {
    try {
      setSubmitting(true);

      // Validate required fields
      if (!formData.ruleName) {
        showAlert('Rule name is required', 'error');
        return;
      }

      // Validate percentages
      if (
        formData.minPercentOfCurrentPrice &&
        formData.maxPercentOfCurrentPrice
      ) {
        const minPercent = parseFloat(formData.minPercentOfCurrentPrice);
        const maxPercent = parseFloat(formData.maxPercentOfCurrentPrice);

        if (minPercent >= maxPercent) {
          showAlert(
            'Minimum percent must be less than maximum percent',
            'error'
          );
          return;
        }
      }

      const rulePayload = getCompetitorRulePayload();

      let response;
      if (formData.assignToActiveListings) {
        response = await apiService.competitorRules.createRuleForAllActive(
          rulePayload
        );
        showAlert(
          `Competitor rule created and assigned to ${response.summary.successfulAssignments} active listings!`,
          'success'
        );
      } else {
        response = await apiService.competitorRules.createRuleOnProduct(
          ItemId,
          rulePayload
        );
        showAlert('Competitor rule created successfully!', 'success');
      }

      // Navigate back after success
      setTimeout(() => {
        navigate(-1); // Go back to previous page
      }, 2000);
    } catch (error) {
      console.error('Error creating competitor rule:', error);
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '50vh',
          }}
        >
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error && !product.length) {
    return (
      <Container>
        <Box sx={{ p: 4 }}>
          <Alert severity="error">
            {error}
            <Button
              variant="outlined"
              size="small"
              sx={{ ml: 2 }}
              onClick={() => navigate(-1)}
            >
              Go Back
            </Button>
          </Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container>
      <Box sx={{ px: 4, py: 5, mb: 3, width: '100%', maxWidth: 700 }}>
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
          Add Competitor Rule
        </Typography>

        {/* Product Info */}
        <Box mb={3}>
          <Typography
            variant="body1"
            color="primary"
            fontWeight={600}
            sx={{ textAlign: 'left', fontSize: '15px' }}
          >
            {product[0]?.productTitle || 'Product'}
            <br />
            <Typography variant="caption" color="text.secondary">
              {product[0]?.productId || ItemId} |{' '}
              <span style={{ color: '#2E865F' }}>Active</span>
            </Typography>
          </Typography>
        </Box>

        <Box component="form" display="flex" flexDirection="column" gap={3}>
          {/* Rule Name */}
          <TextField
            label="Rule Name"
            name="ruleName"
            value={formData.ruleName}
            onChange={handleInputChange}
            required
            placeholder="e.g. Electronics Filter"
            sx={{
              '& .MuiInputLabel-root': { fontSize: '16px' },
              '& .MuiInputBase-root': { fontSize: '16px' },
            }}
          />

          {/* Percentage Filters */}
          <Typography>
            Find competitors based on the minimum percent of your current
            selling price
          </Typography>
          <TextField
            label=""
            name="minPercentOfCurrentPrice"
            value={formData.minPercentOfCurrentPrice}
            onChange={handleInputChange}
            placeholder="e.g. 80"
            type="number"
            inputProps={{ min: '0', max: '200' }}
            sx={{ '& .MuiInputBase-root': { fontSize: '16px' } }}
          />

          <Typography>
            Find competitors based on the maximum percent of your current
            selling price
          </Typography>
          <TextField
            label=""
            name="maxPercentOfCurrentPrice"
            value={formData.maxPercentOfCurrentPrice}
            onChange={handleInputChange}
            placeholder="e.g. 120"
            type="number"
            inputProps={{ min: '0', max: '500' }}
            sx={{ '& .MuiInputBase-root': { fontSize: '16px' } }}
          />

          {/* Exclude Filters */}
          <Typography>Exclude competitors from</Typography>
          <TextField
            label=""
            name="excludeCountries"
            value={formData.excludeCountries}
            onChange={handleInputChange}
            placeholder="e.g. Germany, Italy, China"
            helperText="Separate multiple countries with commas"
            sx={{ '& .MuiInputBase-root': { fontSize: '16px' } }}
          />

          <Typography>Exclude conditions</Typography>
          <TextField
            label=""
            name="excludeConditions"
            value={formData.excludeConditions}
            onChange={handleInputChange}
            placeholder="e.g. Used, For parts or not working, Refurbished"
            helperText="Separate multiple conditions with commas"
            sx={{ '& .MuiInputBase-root': { fontSize: '16px' } }}
          />

          <Typography>
            Exclude competitors by product titles with certain words
          </Typography>
          <TextField
            label=""
            name="excludeProductTitleWords"
            value={formData.excludeProductTitleWords}
            onChange={handleInputChange}
            placeholder="e.g. refurbished, broken, parts, damaged"
            helperText="Separate multiple words with commas"
            sx={{ '& .MuiInputBase-root': { fontSize: '16px' } }}
          />

          <Grid container alignItems="center" spacing={2}>
            <Grid item xs={4}>
              <Typography>Exclude sellers</Typography>
            </Grid>
            <Grid item xs={8}>
              <TextField
                name="excludeSellers"
                value={formData.excludeSellers}
                onChange={handleInputChange}
                placeholder="Sellers with comma(,)"
                helperText="Enter seller usernames separated by commas"
                fullWidth
                sx={{ '& .MuiInputBase-root': { fontSize: '14px' } }}
              />
            </Grid>
          </Grid>

          {/* Checkboxes */}
          <Box mt={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.findCompetitorsBasedOnMPN}
                  onChange={handleInputChange}
                  name="findCompetitorsBasedOnMPN"
                />
              }
              label={
                <Typography sx={{ fontWeight: 500 }}>
                  Find competitors based on one of MPN/UPC/EAN/ISBN fields.
                </Typography>
              }
            />
            <Typography variant="body2" sx={{ ml: 4, color: 'gray' }}>
              * Competitors will be assigned only if at least one of the fields
              matches
            </Typography>
            <Typography variant="body2" sx={{ ml: 4, color: 'red' }}>
              * Dependent on eBay service limits
            </Typography>
          </Box>

          <Box mt={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.assignToActiveListings}
                  onChange={handleInputChange}
                  name="assignToActiveListings"
                />
              }
              label={
                <Typography sx={{ fontWeight: 500 }}>
                  Assign to all active listings
                </Typography>
              }
            />
            <Typography variant="body2" sx={{ ml: 4, color: 'gray' }}>
              * Will apply to all already imported and active listings,
              regardless of whether min price, max price or strategy set.
            </Typography>
          </Box>

          {/* Footer Note */}
          <Box mt={3}>
            <Typography variant="body2" sx={{ color: 'red', mb: 2 }}>
              * Clicking add rule will automatically refresh competitors &
              override/remove any manually selected competitors.
              <br />
              Can be updated/refreshed once per 24 hours.
            </Typography>

            {/* Add Rule Button */}
            <Button
              variant="contained"
              color="primary"
              onClick={handleAddRule}
              disabled={submitting}
              sx={{
                padding: '12px 20px',
                width: '120px',
                fontWeight: 600,
                fontSize: '16px',
                borderRadius: '25px',
                '&:hover': {
                  backgroundColor: '#1976d2',
                  boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
                },
                transition: 'all 0.3s ease-in-out',
              }}
            >
              {submitting ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Add Rule'
              )}
            </Button>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}
