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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useParams, useNavigate } from 'react-router-dom';
import { useProductStore } from '../store/productStore';
import apiService from '../api/apiService';


export default function EditStrategy() {
  const { productId } = useParams(); // Get dynamic ID from route
  const { AllProducts } = useProductStore();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [oldPrice, setOldPrice] = useState(0);
  const [fetchingCompetitorPrice, setFetchingCompetitorPrice] = useState(false);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    selectedStrategy: '',
    selectedCompetitorRule: '',
    myLandedPrice: '',
    lowestPrice: '',
    minPrice: '',
    maxPrice: '',
    notes: '',
  });

  const { modifyProductsArray } = useProductStore();

  // Available strategies and rules (fetched from APIs)
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [availableRules, setAvailableRules] = useState([]);

  // Alert state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');

  // Fetch product data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Find product from AllProducts
        const foundProduct = AllProducts.find((p) => p.productId === productId);
        if (!foundProduct) {
          setError('Product not found');
          return;
        }

        setProduct(foundProduct);

        const priceString = foundProduct.myPrice;
        const priceValue = priceString.includes(' ')
          ? priceString.split(' ')[1]
          : priceString.replace(/[^0-9.]/g, '');
        setOldPrice(priceValue);

        // Set initial form data with default min/max (will be overridden if strategy exists)
        setFormData((prev) => ({
          ...prev,
          myLandedPrice: priceValue,
          minPrice: (parseFloat(priceValue) * 0.1).toFixed(2), // Default fallback
          maxPrice: (parseFloat(priceValue) * 1.5).toFixed(2), // Default fallback
        }));

        // Strategy/Rule fetching - this will override min/max if strategy exists
        await fetchExistingData(productId);

        // Fetch competitor prices to populate lowest price
        await fetchCompetitorPrice(productId);
      } catch (err) {
        setError('Failed to load product: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productId, AllProducts]);

  // Fetch existing strategies and competitor rules
  const fetchExistingData = async (id) => {
    try {
      // Always fetch all dropdown options first
      const allOptions = await apiService.combined.getAllOptionsForDropdowns();

      if (allOptions.strategies?.length > 0)
        setAvailableStrategies(allOptions.strategies);
      if (allOptions.rules?.length > 0) setAvailableRules(allOptions.rules);

      // Fetch current strategy display to get the proper strategy name
      const strategyDisplayResponse =
        await apiService.pricingStrategies.getStrategyDisplayForProduct(id);

      if (
        strategyDisplayResponse.success &&
        strategyDisplayResponse.data &&
        strategyDisplayResponse.data.hasStrategy
      ) {
        const appliedStrategy = strategyDisplayResponse.data;

        // Use the strategyName (original name) to find the strategy in dropdown
        const matchingStrategy = allOptions.strategies?.find(
          (s) =>
            s.strategyName === appliedStrategy.strategyName ||
            s._id === appliedStrategy.rawStrategy?._id
        );

        setFormData((prev) => ({
          ...prev,
          selectedStrategy: matchingStrategy
            ? matchingStrategy.strategyName
            : '',
          // Use the actual min/max prices from the applied strategy
          minPrice: appliedStrategy.rawStrategy?.minPrice
            ? appliedStrategy.rawStrategy.minPrice.toFixed(2)
            : prev.minPrice,
          maxPrice: appliedStrategy.rawStrategy?.maxPrice
            ? appliedStrategy.rawStrategy.maxPrice.toFixed(2)
            : prev.maxPrice,
        }));

        console.log('📊 Strategy form populated:', {
          selectedStrategy: matchingStrategy?.strategyName,
          minPrice: appliedStrategy.rawStrategy?.minPrice,
          maxPrice: appliedStrategy.rawStrategy?.maxPrice,
        });
      }

      // Fetch competitor rule (keep existing logic)
      const { rule } = await apiService.combined.getProductRulesAndStrategies(
        id
      );

      let existingRule = null;
      if (
        rule?.success &&
        rule?.data?.hasCompetitorRule &&
        rule.data.competitorRule
      ) {
        existingRule = rule.data.competitorRule;
      } else if (rule?.hasCompetitorRule && rule.competitorRule) {
        existingRule = rule.competitorRule;
      } else if (rule?.data && rule.data.ruleName) {
        existingRule = rule.data;
      } else if (rule?.ruleName) {
        existingRule = rule;
      }

      // Set existing competitor rule if available
      if (existingRule) {
        setFormData((prev) => ({
          ...prev,
          selectedCompetitorRule: existingRule.ruleName,
        }));
      }
    } catch (err) {
      console.error('Error fetching strategy/rule options:', err);
    }
  };

  // Fetch competitor price for the product
  const fetchCompetitorPrice = async (itemId) => {
    try {
      setFetchingCompetitorPrice(true);

      // Get only manual competitors
      const competitorData =
        await apiService.inventory.getManuallyAddedCompetitors(itemId);

      if (
        competitorData.success &&
        competitorData.competitors &&
        competitorData.competitors.length > 0
      ) {
        // Extract prices and find the lowest
        const prices = competitorData.competitors
          .map((comp) => parseFloat(comp.price))
          .filter((price) => !isNaN(price));

        if (prices.length > 0) {
          const lowestCompetitorPrice = Math.min(...prices);

          setFormData((prev) => ({
            ...prev,
            lowestPrice: lowestCompetitorPrice.toFixed(2),
          }));

          showAlert(
            `Found ${
              competitorData.competitors.length
            } manual competitors. Lowest: $${lowestCompetitorPrice.toFixed(2)}`,
            'info'
          );
        } else {
          setFormData((prev) => ({
            ...prev,
            lowestPrice: '0.00',
          }));
          showAlert('Manual competitors found but no valid prices', 'warning');
        }
      } else {
        setFormData((prev) => ({
          ...prev,
          lowestPrice: '0.00',
        }));
        showAlert('No manual competitors found for this product', 'warning');
      }
    } catch (err) {
      console.error('Error fetching competitor price:', err);
      showAlert('Failed to fetch competitor prices: ' + err.message, 'error');
      setFormData((prev) => ({
        ...prev,
        lowestPrice: '0.00',
      }));
    } finally {
      setFetchingCompetitorPrice(false);
    }
  };

  // Fetch price history from MongoDB
  const fetchPriceHistory = async () => {
    try {
      setLoadingHistory(true);

      // Use the corrected API call
      const historyData = await apiService.priceHistory.getProductHistory(
        productId,
        100
      );

      if (historyData.success && historyData.priceHistory) {
        setPriceHistory(historyData.priceHistory);
      } else {
        setPriceHistory([]);
      }
    } catch (error) {
      console.error('📊 ❌ Error fetching price history from MongoDB:', error);
      setPriceHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Show alert
  const showAlert = (msg, type) => {
    setAlertMessage(msg);
    setAlertSeverity(type);
    setAlertOpen(true);
    if (type === 'success') {
      setTimeout(() => setAlertOpen(false), 4000);
    }
  };

  // Handle Update button click
  const handleUpdate = async () => {
    try {
      setSubmitting(true);

      if (!formData.selectedStrategy) {
        showAlert('Please select a pricing strategy', 'error');
        return;
      }

      const selectedStrategyObj = availableStrategies.find(
        (s) => s.strategyName === formData.selectedStrategy
      );
      if (!selectedStrategyObj) {
        showAlert('Invalid strategy selected', 'error');
        return;
      }

      // Call the new “assign strategy” endpoint:
      const updateResponse =
        await apiService.pricingStrategies.updateStrategyOnProduct(productId, {
          strategyId: selectedStrategyObj._id,
          minPrice: parseFloat(formData.minPrice),
          maxPrice: parseFloat(formData.maxPrice),
        });

      if (updateResponse.success) {
        const newMin = parseFloat(formData.minPrice).toFixed(2);
        const newMax = parseFloat(formData.maxPrice).toFixed(2);
        if (typeof modifyProductsArray === 'function') {
          modifyProductsArray(products =>
            products.map(p =>
              p.productId === productId
                ? {
                    ...p,
                    strategy: selectedStrategyObj.strategyName,
                    minPrice: `$${newMin}`,
                    maxPrice: `$${newMax}`,
                    hasStrategy: true
                  }
                : p
            )
          );
        }
        showAlert('Strategy applied successfully!', 'success');
        navigate('/home', { replace: true });
        return;
      }

      // If you want to know whether it triggered an eBay repricing:
      const priceUpdated = updateResponse.data?.priceUpdated;

      if (priceUpdated) {
        showAlert(
          'Strategy applied to product and price updated automatically!',
          'success'
        );
      } else {
        showAlert('Strategy applied successfully!', 'success');
      }

      // Force immediate refresh with multiple signals
      const timestamp = Date.now().toString();
      localStorage.setItem('strategyUpdated', timestamp);
      localStorage.setItem('priceUpdated', timestamp);
      localStorage.setItem('forceRefresh', timestamp);
      localStorage.setItem('lastStrategyUpdate', timestamp);

      // Set a global flag for immediate detection
      if (typeof window !== 'undefined') {
        window.lastPriceUpdate = {
          timestamp: Date.now(),
          itemId: productId,
          newPrice: parseFloat(formData.lowestPrice) || 5.27,
        };
      }

      // Navigate back immediately
      setTimeout(() => {
        navigate('/home', { replace: true });
        // Force a page reload to ensure updates show
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }, 1500);
    } catch (err) {
      console.error('Strategy update error:', err);
      showAlert('Failed to update: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Add useEffect to fetch price history for this product
  useEffect(() => {
    if (productId) {
      fetchPriceHistory();
    }
  }, [productId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 3 }}>
        {error} <Button onClick={() => navigate('/home')}>Go Back</Button>
      </Alert>
    );
  }

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
          Pricing Configuration
        </Typography>

        {/* Product Info */}
        <Box mb={3}>
          <Typography
            variant="body1"
            color="primary"
            fontWeight={600}
            sx={{ textAlign: 'left', fontSize: '15px' }}
          >
            {product?.productTitle || 'Product'}
            <br />
            <Typography variant="caption" color="text.secondary">
              {product?.productId || productId} |{' '}
              <span style={{ color: '#2E865F' }}>Active</span>
            </Typography>
          </Typography>
        </Box>

        {/* Current Price Display */}
        <Box mb={3} sx={{ textAlign: 'left' }}>
          <Typography variant="body2" color="text.secondary">
            Current Price: <strong>${oldPrice}</strong>
          </Typography>
        </Box>

        {/* Form */}
        <Box display="flex" flexDirection="column" gap={3}>
          <TextField
            select
            label="Pricing Strategy"
            name="selectedStrategy"
            value={
              availableStrategies.some(
                (s) => s.strategyName === formData.selectedStrategy
              )
                ? formData.selectedStrategy
                : ''
            }
            onChange={handleInputChange}
          >
            <MenuItem value="">Select a strategy</MenuItem>
            {availableStrategies.map((strategy, index) => (
              <MenuItem key={index} value={strategy.strategyName}>
                {strategy.displayName || strategy.strategyName}
              </MenuItem>
            ))}
          </TextField>

          <Typography
            variant="body2"
            sx={{
              color: '#1976d2',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '16px',
            }}
            onClick={() => navigate('/home/add-strategy')}
          >
            <Box
              component="span"
              sx={{ fontWeight: 'bold', mr: 0.5, fontSize: '20px' }}
            >
              +
            </Box>{' '}
            Add Strategy
          </Typography>

          {/* Competitor Rule Section */}
          <TextField
            select
            label="Competitor Rule"
            name="selectedCompetitorRule"
            value={
              availableRules.some(
                (r) => r.ruleName === formData.selectedCompetitorRule
              )
                ? formData.selectedCompetitorRule
                : ''
            }
            onChange={handleInputChange}
          >
            <MenuItem value="">Select a rule</MenuItem>
            {availableRules.map((rule, index) => (
              <MenuItem key={index} value={rule.ruleName}>
                {rule.displayName || rule.ruleName}
              </MenuItem>
            ))}
          </TextField>

          <Typography
            variant="body2"
            sx={{
              color: '#1976d2',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '16px',
            }}
            onClick={() => navigate('/home/add-competitor-rule')}
          >
            <Box
              component="span"
              sx={{ fontWeight: 'bold', mr: 0.5, fontSize: '20px' }}
            >
              +
            </Box>{' '}
            Add Competitor Rule
          </Typography>

          {/* Price Fields */}
          <TextField
            label="My Landed Price"
            name="myLandedPrice"
            value={formData.myLandedPrice}
            type="number"
            inputProps={{ step: '0.01', min: '0', readOnly: true }}
            sx={{
              '& .MuiInputLabel-root': { fontSize: '16px' },
              '& .MuiInputBase-root': { fontSize: '16px' },
              backgroundColor: '#f5f5f5',
            }}
          />

          <TextField
            label="Lowest Price"
            name="lowestPrice"
            value={formData.lowestPrice}
            type="number"
            inputProps={{ step: '0.01', min: '0', readOnly: true }}
            InputProps={{
              endAdornment: fetchingCompetitorPrice ? (
                <CircularProgress size={20} />
              ) : (
                <Button
                  size="small"
                  onClick={() => fetchCompetitorPrice(productId)}
                  sx={{ minWidth: 'auto', p: 0.5 }}
                >
                  Refresh
                </Button>
              ),
            }}
            sx={{
              '& .MuiInputLabel-root': { fontSize: '16px' },
              '& .MuiInputBase-root': { fontSize: '16px' },
              backgroundColor: '#f5f5f5',
            }}
          />

          <TextField
            label="Min Price (Landed)"
            name="minPrice"
            value={formData.minPrice}
            onChange={handleInputChange}
            required
            type="number"
            inputProps={{ step: '0.01', min: '0' }}
            sx={{
              '& .MuiInputLabel-root': { fontSize: '16px' },
              '& .MuiInputBase-root': { fontSize: '16px' },
            }}
          />

          <TextField
            label="Max Price (Landed)"
            name="maxPrice"
            value={formData.maxPrice}
            onChange={handleInputChange}
            required
            type="number"
            inputProps={{ step: '0.01', min: '0' }}
            sx={{
              '& .MuiInputLabel-root': { fontSize: '16px' },
              '& .MuiInputBase-root': { fontSize: '16px' },
            }}
          />

          <TextField
            label="Notes"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            placeholder="e.g. Entire inventory expiring in January."
            multiline
            rows={3}
            sx={{
              '& .MuiInputLabel-root': { fontSize: '16px' },
              '& .MuiInputBase-root': { fontSize: '16px' },
            }}
          />

          {/* Update Button */}
          <Button
            variant="contained"
            color="primary"
            onClick={handleUpdate}
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
              'Update'
            )}
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
