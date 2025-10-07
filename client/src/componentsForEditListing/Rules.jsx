import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Box, 
  Typography, 
  TextField, 
  MenuItem, 
  Button,
  FormControlLabel,
  Switch,
  Divider,
  Alert,
  Collapse,
  IconButton,
  CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useProductStore } from '../store/productStore';
import { useNavigate } from 'react-router-dom';
import apiService from '../api/apiService';

export default function EditListing() {
  const { ItemId, AllProducts, modifyProductsObj, sku } = useProductStore();
  const [product, setProduct] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [oldPrice, setOldPrice] = useState(0);
  const navigate = useNavigate();

  // State for selected strategy
  const [strategy, setStrategy] = useState('');
  
  // Effect to fetch product data
  useEffect(() => {
    const fetchProductData = async () => {
      try {
        setLoading(true);
        const productObj = AllProducts.filter((item) =>
          item.sku ? item.sku === sku : item.productId === ItemId
        );
        
        if (productObj.length === 0) {
          setError("Product not found");
          return;
        }
        
        setProduct(productObj);
        modifyProductsObj(productObj);
        
        // Set oldPrice from product data
        if (productObj[0]?.myPrice) {
          const priceString = productObj[0].myPrice;
          // Handle different price formats (with or without currency symbol)
          const priceValue = priceString.includes(" ") 
            ? priceString.split(" ")[1] 
            : priceString.replace(/[^0-9.]/g, '');
          
          setOldPrice(priceValue);
          
          // Initialize form values with product price
          setFormValues(prev => ({
            ...prev,
            landedPrice: priceValue,
            minPrice: (parseFloat(priceValue) * 0.9).toFixed(2), // 10% below landed price
            maxPrice: (parseFloat(priceValue) * 1.5).toFixed(2), // 50% above landed price
            targetPrice: priceValue
          }));
        }
      } catch (err) {
        setError("Error loading product data: " + err.message);
        console.error("Error loading product:", err);
      } finally {
        setLoading(false);
      }
    };

    if (ItemId) {
      fetchProductData();
    }
  }, [ItemId, AllProducts, modifyProductsObj]);

  // State for form values
  const [formValues, setFormValues] = useState({
    itemId: ItemId,
    competitorRule: '',
    landedPrice: '',
    lowestPrice: '',
    minPrice: '',
    maxPrice: '',
    targetPrice: '',
    basePrice: '',
    weekendBoost: '1.1',
    holidayBoost: '1.25',
    clearanceThreshold: '30',
    repriceFrequency: 'daily',
    competitorAdjustment: '0',
    enableBestOffer: false,
    bestOfferAutoAccept: '',
    bestOfferAutoDecline: '',
    demandMultiplier: '1.2',
    inventoryThreshold: '10',
    notes: ''
  });
  
  // State for alert
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');

  // Handle strategy change
  const handleStrategyChange = (event) => {
    const selectedStrategy = event.target.value;
    setStrategy(selectedStrategy);
    
    // Set default values based on strategy
    if (selectedStrategy === 'Fixed') {
      setFormValues(prev => ({
        ...prev,
        targetPrice: oldPrice || prev.landedPrice,
      }));
    } else if (selectedStrategy === 'Time Based') {
      setFormValues(prev => ({
        ...prev,
        basePrice: oldPrice || prev.landedPrice,
      }));
    } else if (selectedStrategy === 'Dynamic') {
      // Set default values for Dynamic strategy
      setFormValues(prev => ({
        ...prev,
        minPrice: prev.minPrice || (parseFloat(oldPrice) * 0.9).toFixed(2),
        maxPrice: prev.maxPrice || (parseFloat(oldPrice) * 1.5).toFixed(2),
        demandMultiplier: '1.2',
        inventoryThreshold: '10'
      }));
    }
  };

  // Handle form value changes
  const handleFormChange = (event) => {
    const { name, value, checked, type } = event.target;
    let processedValue = value;
    
    // For number inputs, ensure we handle empty strings properly
    if (type === 'number' && value === '') {
      processedValue = '';
    } else if (type === 'number') {
      // For other number values, store them as strings but validate as numbers
      processedValue = value;
    }
    
    setFormValues(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : processedValue
    }));
  };

  // Handle form submission
  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Validate form based on selected strategy
    if (!strategy) {
      showAlert('Please select a pricing strategy', 'error');
      return;
    }
    
    if (strategy === 'Fixed' && !formValues.targetPrice) {
      showAlert('Target price is required for Fixed strategy', 'error');
      return;
    }
    
    if ((strategy === 'Competitive' || strategy === 'Dynamic') && 
        (!formValues.minPrice || !formValues.maxPrice)) {
      showAlert('Min and max prices are required', 'error');
      return;
    }
    
    if (strategy === 'Time Based' && !formValues.basePrice) {
      showAlert('Base price is required for Time Based strategy', 'error');
      return;
    }
    
    // Check min price is less than max price
    if ((strategy === 'Competitive' || strategy === 'Dynamic') && 
        parseFloat(formValues.minPrice) >= parseFloat(formValues.maxPrice)) {
      showAlert('Min price must be less than max price', 'error');
      return;
    }
    
    // Prepare payload based on strategy
    let payload = {
      itemId: formValues.itemId,
      strategy: strategy.toLowerCase().replace(' ', '-')
    };
    
    switch (strategy) {
      case 'Fixed':
        payload = {
          ...payload,
          targetPrice: formValues.targetPrice,
          enableBestOffer: formValues.enableBestOffer,
          ...(formValues.enableBestOffer && formValues.bestOfferAutoAccept && {
            bestOfferAutoAccept: formValues.bestOfferAutoAccept
          }),
          ...(formValues.enableBestOffer && formValues.bestOfferAutoDecline && {
            bestOfferAutoDecline: formValues.bestOfferAutoDecline
          })
        };
        break;
        
      case 'Competitive':
        payload = {
          ...payload,
          minPrice: formValues.minPrice,
          maxPrice: formValues.maxPrice,
          targetPrice: formValues.targetPrice || formValues.landedPrice,
          repriceFrequency: formValues.repriceFrequency,
          competitorAdjustment: formValues.competitorAdjustment
        };
        break;
        
      case 'Dynamic':
        payload = {
          ...payload,
          minPrice: formValues.minPrice,
          maxPrice: formValues.maxPrice,
          competitorAdjustment: formValues.competitorAdjustment,
          demandMultiplier: formValues.demandMultiplier,
          inventoryThreshold: formValues.inventoryThreshold
        };
        break;
        
      case 'Time Based':
        payload = {
          ...payload,
          basePrice: formValues.basePrice,
          weekendBoost: formValues.weekendBoost,
          holidayBoost: formValues.holidayBoost,
          clearanceThreshold: formValues.clearanceThreshold
        };
        break;
    }
    
    // Add notes if provided
    if (formValues.notes) {
      payload.notes = formValues.notes;
    }
    
    // Submit the payload
    
    
    try {
      setSubmitting(true);
      const response = await apiService.inventory.assignPricingStrategy(payload);
      
      showAlert('Pricing strategy updated successfully!', 'success');
      
      // Optional: Navigate after success with slight delay
      
      // setTimeout(() => {
      //   navigate("/inventory");
      // }, 2000);
    } catch (error) {
      console.error("Error setting pricing strategy:", error);
      setError(error.message);
      showAlert(`Error: ${error.message || 'Something went wrong'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Show alert
  const showAlert = (message, severity) => {
    setAlertMessage(message);
    setAlertSeverity(severity);
    setAlertOpen(true);
    
    // Auto-close successful alerts after 5 seconds
    if (severity === 'success') {
      setTimeout(() => {
        setAlertOpen(false);
      }, 5000);
    }
  };

  if (loading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
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
              onClick={() => navigate("/inventory")}
            >
              Back to Inventory
            </Button>
          </Alert>
        </Box>
      </Container>
    );
  }

  return (
    <>
      <Container>
        <Box sx={{ px: 4, py: 5, width: "100%", maxWidth: 700 }}>
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
            sx={{ textAlign: "left", color: "#333" }}
          >
            Assign Pricing Strategy
          </Typography>

          {/* Product Info */}
          <Box mb={3} sx={{ textAlign: "center" }}>
            <Typography
              variant="body1"
              color="primary"
              fontWeight={600}
              sx={{ textAlign: "left", fontSize: "15px" }}
            >
              {product[0]?.productTitle || 'Product'}<br />
              <Typography
                variant="caption"
                color="text.secondary"
              >
                {product[0]?.productId || ItemId} |{" "}
                <span style={{ color: "#2E865F" }}>Active</span>
              </Typography>
            </Typography>
          </Box>

          {/* Current Price Display */}
          <Box mb={3} sx={{ textAlign: "left" }}>
            <Typography
              variant="body2"
              color="text.secondary"
            >
              Current Price: <strong>${oldPrice}</strong>
            </Typography>
          </Box>

          {/* Form */}
          <Box 
            component="form" 
            display="flex" 
            flexDirection="column" 
            gap={3}
            onSubmit={handleSubmit}
          >
            {/* Pricing Strategy */}
            <TextField
              select
              label="Pricing Strategy"
              value={strategy}
              name="strategy"
              onChange={handleStrategyChange}
              required
              sx={{
                "& .MuiInputLabel-root": { fontSize: "16px" },
                "& .MuiInputBase-root": { fontSize: "16px" },
              }}
            >
              <MenuItem value="">Select a strategy</MenuItem>
              <MenuItem value="Fixed">Fixed</MenuItem>
              <MenuItem value="Competitive">Competitive</MenuItem>
              <MenuItem value="Dynamic">Dynamic</MenuItem>
              <MenuItem value="Time Based">Time Based</MenuItem>
            </TextField>

            {/* Render strategy-specific fields */}
            {strategy && (
              <>
                <Divider sx={{ my: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {strategy} Strategy Settings
                  </Typography>
                </Divider>
                
                {/* Fixed Strategy Fields */}
                {strategy === 'Fixed' && (
                  <>
                    <TextField
                      label="Target Price"
                      name="targetPrice"
                      value={formValues.targetPrice}
                      onChange={handleFormChange}
                      required
                      type="number"
                      inputProps={{ step: "0.01", min: "0" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    />
                    
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formValues.enableBestOffer}
                          onChange={handleFormChange}
                          name="enableBestOffer"
                        />
                      }
                      label="Enable Best Offer"
                    />
                    
                    {formValues.enableBestOffer && (
                      <>
                        <TextField
                          label="Best Offer Auto Accept Price"
                          name="bestOfferAutoAccept"
                          value={formValues.bestOfferAutoAccept}
                          onChange={handleFormChange}
                          type="number"
                          inputProps={{ 
                            step: "0.01", 
                            min: "0",
                            max: formValues.targetPrice // Can't accept more than target price
                          }}
                          sx={{
                            "& .MuiInputLabel-root": { fontSize: "16px" },
                            "& .MuiInputBase-root": { fontSize: "16px" },
                          }}
                        />
                        
                        <TextField
                          label="Best Offer Auto Decline Price"
                          name="bestOfferAutoDecline"
                          value={formValues.bestOfferAutoDecline}
                          onChange={handleFormChange}
                          type="number"
                          inputProps={{ 
                            step: "0.01", 
                            min: "0",
                            max: formValues.bestOfferAutoAccept || formValues.targetPrice // Can't decline higher than auto-accept
                          }}
                          sx={{
                            "& .MuiInputLabel-root": { fontSize: "16px" },
                            "& .MuiInputBase-root": { fontSize: "16px" },
                          }}
                        />
                      </>
                    )}
                  </>
                )}
                
                {/* Competitive Strategy Fields */}
                {strategy === 'Competitive' && (
                  <>
                    <TextField
                      select
                      label="Competitor Rule"
                      name="competitorRule"
                      value={formValues.competitorRule}
                      onChange={handleFormChange}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    >
                      <MenuItem value="">None</MenuItem>
                      <MenuItem value="match">Match Lowest Price</MenuItem>
                      <MenuItem value="beat">Beat Lowest Price</MenuItem>
                      <MenuItem value="custom">Custom Adjustment</MenuItem>
                    </TextField>
                    
                    <TextField
                      label="My Landed Price"
                      name="landedPrice"
                      value={oldPrice}
                      disabled
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    />
                    
                    <TextField
                      label="Min Price"
                      name="minPrice"
                      value={formValues.minPrice}
                      onChange={handleFormChange}
                      required
                      type="number"
                      inputProps={{ step: "0.01", min: "0" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    />
                    
                    <TextField
                      label="Max Price"
                      name="maxPrice"
                      value={formValues.maxPrice}
                      onChange={handleFormChange}
                      required
                      type="number"
                      inputProps={{ step: "0.01", min: formValues.minPrice || "0" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    />
                    
                    <TextField
                      label="Target Price (Initial)"
                      name="targetPrice"
                      value={formValues.targetPrice}
                      onChange={handleFormChange}
                      type="number"
                      inputProps={{ 
                        step: "0.01", 
                        min: formValues.minPrice || "0",
                        max: formValues.maxPrice || "999999"
                      }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                      helperText="Starting price within min/max range"
                    />
                    
                    <TextField
                      select
                      label="Repricing Frequency"
                      name="repriceFrequency"
                      value={formValues.repriceFrequency}
                      onChange={handleFormChange}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    >
                      <MenuItem value="hourly">Hourly</MenuItem>
                      <MenuItem value="daily">Daily</MenuItem>
                      <MenuItem value="weekly">Weekly</MenuItem>
                    </TextField>
                    
                    <TextField
                      label="Competitor Adjustment (%)"
                      name="competitorAdjustment"
                      value={formValues.competitorAdjustment}
                      onChange={handleFormChange}
                      type="number"
                      inputProps={{ step: "1", min: "-20", max: "20" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                      helperText="Negative values price below competitors, positive values price above"
                    />
                  </>
                )}
                
                {/* Dynamic Strategy Fields */}
                {strategy === 'Dynamic' && (
                  <>
                    <TextField
                      label="My Landed Price"
                      name="landedPrice"
                      value={oldPrice}
                      disabled
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    />
                    
                    <TextField
                      label="Min Price"
                      name="minPrice"
                      value={formValues.minPrice}
                      onChange={handleFormChange}
                      required
                      type="number"
                      inputProps={{ step: "0.01", min: "0" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    />
                    
                    <TextField
                      label="Max Price"
                      name="maxPrice"
                      value={formValues.maxPrice}
                      onChange={handleFormChange}
                      required
                      type="number"
                      inputProps={{ step: "0.01", min: formValues.minPrice || "0" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    />
                    
                    <TextField
                      label="Competitor Adjustment (%)"
                      name="competitorAdjustment"
                      value={formValues.competitorAdjustment}
                      onChange={handleFormChange}
                      type="number"
                      inputProps={{ step: "1", min: "-20", max: "20" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                      helperText="Negative values price below competitors, positive values price above"
                    />

                    <TextField
                      label="Demand Multiplier"
                      name="demandMultiplier"
                      value={formValues.demandMultiplier}
                      onChange={handleFormChange}
                      type="number"
                      inputProps={{ step: "0.05", min: "0.5", max: "2" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                      helperText="Increase price when high demand (e.g., 1.2 = 20% increase)"
                    />

                    <TextField
                      label="Inventory Threshold"
                      name="inventoryThreshold"
                      value={formValues.inventoryThreshold}
                      onChange={handleFormChange}
                      type="number"
                      inputProps={{ step: "1", min: "0", max: "100" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                      helperText="Raise price when inventory falls below this quantity"
                    />
                  </>
                )}
                
                {/* Time Based Strategy Fields */}
                {strategy === 'Time Based' && (
                  <>
                    <TextField
                      label="Base Price"
                      name="basePrice"
                      value={formValues.basePrice}
                      onChange={handleFormChange}
                      required
                      type="number"
                      inputProps={{ step: "0.01", min: "0" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                    />
                    
                    <TextField
                      label="Weekend Price Boost Multiplier"
                      name="weekendBoost"
                      value={formValues.weekendBoost}
                      onChange={handleFormChange}
                      type="number"
                      inputProps={{ step: "0.05", min: "0.5", max: "2" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                      helperText="1.1 means 10% higher price on weekends"
                    />
                    
                    <TextField
                      label="Holiday Price Boost Multiplier"
                      name="holidayBoost"
                      value={formValues.holidayBoost}
                      onChange={handleFormChange}
                      type="number"
                      inputProps={{ step: "0.05", min: "0.5", max: "2" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                      helperText="1.25 means 25% higher price on holidays"
                    />
                    
                    <TextField
                      label="Clearance Threshold (days)"
                      name="clearanceThreshold"
                      value={formValues.clearanceThreshold}
                      onChange={handleFormChange}
                      type="number"
                      inputProps={{ step: "1", min: "0", max: "365" }}
                      sx={{
                        "& .MuiInputLabel-root": { fontSize: "16px" },
                        "& .MuiInputBase-root": { fontSize: "16px" },
                      }}
                      helperText="Days before applying clearance pricing (0 = never)"
                    />
                  </>
                )}
                
                {/* Notes field for all strategies */}
                <TextField
                  label="Notes"
                  name="notes"
                  value={formValues.notes}
                  onChange={handleFormChange}
                  multiline
                  rows={3}
                  placeholder="e.g. Entire inventory expiring in January."
                  sx={{
                    "& .MuiInputLabel-root": { fontSize: "16px" },
                    "& .MuiInputBase-root": { fontSize: "16px" },
                  }}
                />
              </>
            )}

            {/* Buttons */}
            <Box display="flex" justifyContent="space-between" mt={2}>
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => navigate("/inventory")}
                sx={{
                  padding: "10px 20px",
                  fontSize: "16px",
                  borderRadius: "25px",
                }}
              >
                Cancel
              </Button>
              
              <Button
                variant="contained"
                color="primary"
                type="submit"
                disabled={submitting}
                sx={{
                  padding: "12px 20px",
                  fontWeight: 600,
                  fontSize: "16px",
                  borderRadius: "25px",
                  "&:hover": {
                    backgroundColor: "#1976d2",
                    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)",
                  },
                  transition: "all 0.3s ease-in-out",
                }}
              >
                {submitting ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Update Strategy"
                )}
              </Button>
            </Box>
          </Box>
        </Box>
      </Container>
    </>
  );
}