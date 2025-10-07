// src/componentForHome/ListingsTable.jsx
import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Link,
  Box,
  Container,
  CircularProgress,
  AlertTitle,
  Alert,
  Button,
  IconButton,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  History as HistoryIcon,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProductStore } from '../store/productStore';

// Import your API service
import apiService from '../api/apiService';
import CompetitorCount from './CompetitorCount';
const { pricingStrategies } = apiService;
export default function ListingsTable({
  currentPage = 1,
  itemsPerPage = 10,
  onTotalPagesChange,
  mode = 'listings',
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paginatedRows, setPaginatedRows] = useState([]);
  const [sortBy, setSortBy] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [autoSyncInProgress, setAutoSyncInProgress] = useState(false);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const {
    modifyProductsArray,
    modifyProductsId,
    AllProducts,
    modifySku,
    searchProduct,
    modifyCompetitors,
    modifyProductsObj,
  } = useProductStore();

  // Fetch data from eBay when component mounts
  useEffect(() => {
    fetchEbayListings();
  }, []); // Only run once on mount

  useEffect(() => {
    if (AllProducts && AllProducts.length > 0) {
      setRows(AllProducts);
    }
  }, [AllProducts]);

  useEffect(() => {
    if (!Array.isArray(AllProducts)) {
      setRows([]);
      return;
    }
    const searchP = searchProduct.toLowerCase();
    const filtered = AllProducts.filter(
      (row) =>
        row.productTitle?.toLowerCase().includes(searchP) ||
        row.sku?.toLowerCase().includes(searchP) ||
        row.status?.some((s) => s.toLowerCase().includes(searchP)) ||
        row.productId?.toLowerCase().includes(searchP)
    );
    setRows(filtered);
  }, [searchProduct, AllProducts]);

  // Calculate pagination
  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = rows.slice(startIndex, endIndex);
    setPaginatedRows(paginated);

    // Calculate total pages and notify parent
    const totalPages = Math.ceil(rows.length / itemsPerPage);
    if (onTotalPagesChange) {
      onTotalPagesChange(totalPages);
    }
  }, [rows, currentPage, itemsPerPage, onTotalPagesChange]);

  // Sorting logic
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  // Sort rows before pagination
  useEffect(() => {
    let sortedRows = [...rows];
    if (sortBy) {
      sortedRows.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];

        // Handle numbers and strings
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }
        if (sortBy === 'qty') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        }
        if (
          sortBy === 'myPrice' ||
          sortBy === 'price' ||
          sortBy === 'competition' ||
          sortBy === 'minPrice' ||
          sortBy === 'maxPrice'
        ) {
          // Extract number from string like "USD 12.34"
          aValue = parseFloat((aValue || '').replace(/[^\d.]/g, '')) || 0;
          bValue = parseFloat((bValue || '').replace(/[^\d.]/g, '')) || 0;
        }
        if (sortBy === 'competitors') {
          aValue = Number(aValue) || 0;
          bValue = Number(bValue) || 0;
        }
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginatedRows(sortedRows.slice(startIndex, endIndex));

    // Calculate total pages and notify parent
    const totalPages = Math.ceil(sortedRows.length / itemsPerPage);
    if (onTotalPagesChange) {
      onTotalPagesChange(totalPages);
    }
  }, [
    rows,
    currentPage,
    itemsPerPage,
    onTotalPagesChange,
    sortBy,
    sortDirection,
  ]);

  const fetchEbayListings = async () => {
    try {
      setListingsLoading(true);
      const response = await apiService.inventory.getActiveListings();

      if (response.success) {
        // Check for eBay API errors in the response data
        if (response.data?.GetMyeBaySellingResponse?.Ack === 'Failure') {
          const ebayError = response.data.GetMyeBaySellingResponse.Errors;

          // Check for hard expired token (error code 932)
          if (ebayError?.ErrorCode === '932') {
            console.warn('eBay token is hard expired');
            // Clear expired tokens
            localStorage.removeItem('ebay_user_token');
            localStorage.removeItem('ebay_refresh_token');

            // Dispatch event to notify Home component to show connect page
            window.dispatchEvent(new CustomEvent('ebayTokenExpired'));

            setError('eBay token expired. Please reconnect your eBay account.');
            return;
          }

          // Handle other eBay API errors
          setError(
            `eBay API Error: ${ebayError?.ShortMessage || 'Unknown error'}`
          );
          return;
        }

        let ebayListings = [];

        // Add better null checking for the response structure
        if (
          response.data &&
          response.data.GetMyeBaySellingResponse &&
          response.data.GetMyeBaySellingResponse.ActiveList &&
          response.data.GetMyeBaySellingResponse.ActiveList.ItemArray
        ) {
          const itemArray =
            response.data.GetMyeBaySellingResponse.ActiveList.ItemArray;
          if (Array.isArray(itemArray.Item)) {
            ebayListings = itemArray.Item;
          } else if (itemArray.Item) {
            ebayListings = [itemArray.Item];
          }
        } else {
          // Handle case where there's no ActiveList or no items
          console.warn('No active listings found in eBay response');
          setError('No active listings found');
          return;
        }

        console.log(`📦 Processing ${ebayListings.length} eBay listings...`);

        const formattedListings = await Promise.all(
          ebayListings.map(async (item, index) => {
            const itemID = item.ItemID;
            if (!itemID) return null;

            try {
              console.log(
                `📊 [${index + 1}/${
                  ebayListings.length
                }] Processing ${itemID}...`
              );

              const [manualCompetitorsRes, strategyDisplayRes] =
                await Promise.all([
                  apiService.inventory
                    .getManuallyAddedCompetitors(itemID)
                    .catch((err) => {
                      console.warn(
                        `⚠️ Failed to get competitors for ${itemID}:`,
                        err.message
                      );
                      return { success: false, competitors: [], count: 0 };
                    }),
                  // Use apiService instead of direct fetch
                  apiService.pricingStrategies
                    .getStrategyDisplayForProduct(itemID)
                    .catch((err) => {
                      console.warn(
                        `⚠️ Failed to get strategy for ${itemID}:`,
                        err.message
                      );
                      return {
                        success: false,
                        data: {
                          strategy: 'Assign Strategy',
                          minPrice: 'Set',
                          maxPrice: 'Set',
                          hasStrategy: false,
                        },
                      };
                    }),
                ]);

              // Fix manual competitor count calculation
              const manualCount = manualCompetitorsRes.success
                ? manualCompetitorsRes.competitors?.length ||
                  manualCompetitorsRes.count ||
                  0
                : 0;

              console.log(`📊 Manual competitors for ${itemID}:`, {
                success: manualCompetitorsRes.success,
                count: manualCount,
                competitors: manualCompetitorsRes.competitors?.length || 0,
              });

              // Get lowest price from manual competitors
              let lowestCompetitorPrice = 'None';
              if (
                manualCompetitorsRes.success &&
                manualCompetitorsRes.competitors &&
                manualCompetitorsRes.competitors.length > 0
              ) {
                const prices = manualCompetitorsRes.competitors
                  .map((comp) => parseFloat(comp.price))
                  .filter((price) => !isNaN(price));

                if (prices.length > 0) {
                  const minPrice = Math.min(...prices);
                  lowestCompetitorPrice = `USD ${minPrice.toFixed(2)}`;
                }
              }

              // Process strategy display with better error handling and debugging
              let strategyDisplay = {
                strategy: 'Assign Strategy',
                minPrice: 'Set',
                maxPrice: 'Set',
                hasStrategy: false,
              };

              if (strategyDisplayRes.success && strategyDisplayRes.data) {
                strategyDisplay = strategyDisplayRes.data;

                // Debug logging for strategy display
                console.log(`✅ Strategy loaded for ${itemID}:`, {
                  strategy: strategyDisplay.strategy,
                  hasStrategy: strategyDisplay.hasStrategy,
                  minPrice: strategyDisplay.minPrice,
                  maxPrice: strategyDisplay.maxPrice,
                  rawStrategy: strategyDisplay.rawStrategy?.strategy,
                });
              } else {
                console.warn(
                  `⚠️ No strategy data for ${itemID}:`,
                  strategyDisplayRes
                );
              }

              const formattedItem = {
                productTitle: item.Title,
                productId: item.ItemID,
                sku: item.SKU || ' ',
                status: [
                  item.SellingStatus?.ListingStatus || 'Active',
                  item.ConditionDisplayName || 'New',
                ],
                price: `USD ${parseFloat(item.BuyItNowPrice || 0).toFixed(2)}`,
                qty: parseInt(item.Quantity || '0', 10),
                myPrice: `USD ${parseFloat(item.BuyItNowPrice || 0).toFixed(
                  2
                )}`,
                competition: lowestCompetitorPrice,
                strategy: strategyDisplay.strategy,
                minPrice: strategyDisplay.minPrice,
                maxPrice: strategyDisplay.maxPrice,
                hasStrategy: strategyDisplay.hasStrategy,
                competitors: manualCount, // Use the fixed count
              };

              console.log(
                `✅ [${index + 1}/${ebayListings.length}] Processed ${itemID}:`,
                {
                  strategy: formattedItem.strategy,
                  minPrice: formattedItem.minPrice,
                  maxPrice: formattedItem.maxPrice,
                  hasStrategy: formattedItem.hasStrategy,
                  competitors: formattedItem.competitors,
                }
              );

              return formattedItem;
            } catch (error) {
              console.error(
                `❌ [${index + 1}/${
                  ebayListings.length
                }] Error processing ${itemID}:`,
                error
              );
              return {
                productTitle: item.Title,
                productId: item.ItemID,
                sku: item.SKU || ' ',
                status: [
                  item.SellingStatus?.ListingStatus || 'Active',
                  item.ConditionDisplayName || 'New',
                ],
                price: `USD ${parseFloat(item.BuyItNowPrice || 0).toFixed(2)}`,
                qty: parseInt(item.Quantity || '0', 10),
                myPrice: `USD ${parseFloat(item.BuyItNowPrice || 0).toFixed(
                  2
                )}`,
                competition: 'Error',
                strategy: 'Assign Strategy',
                minPrice: 'Set',
                maxPrice: 'Set',
                hasStrategy: false,
                competitors: 0,
              };
            }
          })
        );

        const validListings = formattedListings.filter(Boolean);
        if (validListings.length > 0) {
          console.log(
            `✅ Successfully processed ${validListings.length} listings`
          );
          setRows(validListings);
          modifyProductsArray(validListings);

          // FIXED: Reduced background monitoring frequency
          setTimeout(() => {
            startBackgroundMonitoring();
          }, 10000); // Increased delay to 10 seconds
        } else {
          setError('There are no products');
        }
      } else {
        setError('Failed to fetch eBay listings');
        console.error('API error:', response.error);
      }
    } catch (error) {
      setError(error.message);
      console.error('Error fetching eBay data:', error);
    } finally {
      setListingsLoading(false);
    }
  };

  // NEW: Background monitoring function - FIXED: Reduced frequency
  const startBackgroundMonitoring = async () => {
    if (autoSyncInProgress) return;

    try {
      setAutoSyncInProgress(true);
      console.log('🔄 Starting background competitor monitoring...');

      // REMOVED: Immediate strategy execution on page load (causing too many records)
      // Only trigger the background monitoring service, not immediate execution

      // Trigger the background monitoring service
      const response = await fetch(
        `${
          import.meta.env.VITE_BACKEND_URL
        }/api/competitor-rules/trigger-monitoring`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('app_jwt')}`,
          },
          body: JSON.stringify({
            userId: localStorage.getItem('user_id'),
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Background monitoring triggered:', result);

        if (result.strategies?.priceChanges > 0) {
          console.log(
            `💰 ${result.strategies.priceChanges} prices were updated by monitoring!`
          );

          // Only refresh if there were actual price changes
          setTimeout(() => {
            fetchEbayListings();
          }, 5000); // Increased delay to 5 seconds
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to start background monitoring:', error);
    } finally {
      setAutoSyncInProgress(false);
    }
  };

  // Refresh strategy data for a specific item
  const refreshStrategyForItem = async (itemId) => {
    try {
      const strategyDisplayRes =
        await apiService.pricingStrategies.getStrategyDisplayForProduct(itemId);
      const strategyDisplay = strategyDisplayRes?.data || {
        strategy: 'Assign Strategy',
        minPrice: 'Set',
        maxPrice: 'Set',
        hasStrategy: false,
      };
      modifyProductsArray((products) =>
        products.map((product) =>
          product.productId === itemId
            ? {
                ...product,
                strategy: strategyDisplay.strategy,
                minPrice: strategyDisplay.minPrice,
                maxPrice: strategyDisplay.maxPrice,
                hasStrategy: strategyDisplay.hasStrategy,
              }
            : product
        )
      );
    } catch (error) {
      console.error(`❌ Error refreshing strategy for item ${itemId}:`, error);
    }
  };

  // Refresh all strategy data
  const refreshAllStrategies = async () => {
    try {
      setStrategiesLoading(true);

      // ← make sure it’s an array
      const products = Array.isArray(AllProducts) ? AllProducts : [];

      const updatedProducts = await Promise.all(
        products.map(async (product) => {
          try {
            const { data } =
              await apiService.pricingStrategies.getStrategyDisplayForProduct(
                product.productId
              );
            return {
              ...product,
              strategy: data.strategy,
              minPrice: data.minPrice,
              maxPrice: data.maxPrice,
              hasStrategy: data.hasStrategy,
            };
          } catch (err) {
            console.error(
              `Error refreshing strategy for ${product.productId}:`,
              err
            );
            return product;
          }
        })
      );

      modifyProductsArray(updatedProducts);
    } catch (err) {
      console.error('Error refreshing all strategies:', err);
    } finally {
      setStrategiesLoading(false);
    }
  };

  // Listen for navigation back to refresh strategy data
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh strategy data when user comes back to the page
        refreshAllStrategies();
      }
    };

    const handleFocus = () => {
      // Also refresh when window gets focus (more reliable for navigation)
      refreshAllStrategies();
    };

    // Add both visibility and focus listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [AllProducts]);

  // Also add a useEffect that runs when the component mounts or when we navigate back
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Small delay to ensure any pending strategy updates are completed
      if (AllProducts && AllProducts.length > 0) {
        refreshAllStrategies();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [location?.pathname]); // Add location dependency if using react-router

  // Check for strategy updates from localStorage with more aggressive checking
  useEffect(() => {
    const checkForUpdates = () => {
      const lastUpdate = localStorage.getItem('strategyUpdated');
      const lastPriceUpdate = localStorage.getItem('priceUpdated');

      if (lastUpdate || lastPriceUpdate) {
        const updateTime = parseInt(lastUpdate || lastPriceUpdate);
        const now = Date.now();

        // If update was within last 30 seconds, refresh
        if (now - updateTime < 30000) {
          // Clear all storage flags first
          localStorage.removeItem('strategyUpdated');
          localStorage.removeItem('priceUpdated');
          localStorage.removeItem('forceRefresh');

          // Force a complete refresh by clearing cache and refetching
          console.log('🔄 Detected strategy update, refreshing data...');
          setListingsLoading(true);

          // Clear the current products array to force a complete reload
          modifyProductsArray([]);

          // Fetch fresh data
          setTimeout(() => {
            fetchEbayListings();
          }, 500);
        }
      }
    };

    // Check immediately on mount
    checkForUpdates();

    // Check very frequently for immediate updates
    const interval = setInterval(checkForUpdates, 200); // Check every 200ms
    return () => clearInterval(interval);
  }, [location.pathname]);

  // Update competitor count display in listings table
  const getCompetitorCount = async (itemId) => {
    try {
      const userId = localStorage.getItem('user_id');

      const manualResponse = await apiService.inventory
        .getManuallyAddedCompetitors(itemId)
        .catch(() => ({ success: false, competitors: [] }));

      const manualCount = manualResponse.success
        ? manualResponse.competitors?.length || 0
        : 0;

      return manualCount;
    } catch (error) {
      console.warn(`Failed to get competitor count for ${itemId}:`, error);
      return 0;
    }
  };

  // Add this function to update min/max and refresh listings
  const updateMinMaxForItem = async (itemId, minPrice, maxPrice) => {
    try {
      await apiService.inventory.updateListingPricing(itemId, {
        minPrice,
        maxPrice,
      });
      // Refresh listings after update
      await fetchEbayListings();
    } catch (error) {
      console.error('Failed to update min/max:', error);
    }
  };

  if (listingsLoading) {
    return (
      <Container
        sx={{ mt: 4, mb: 2, display: 'flex', justifyContent: 'center', py: 5 }}
      >
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 4, mb: 2 }}>
        <Typography color="error" variant="h6" textAlign="center">
          Error loading listings: {error}
        </Typography>
        <Typography textAlign="center" mt={2}>
          Showing sample data as fallback
        </Typography>
        {/* Render table with sample data */}
      </Container>
    );
  }

  // Define headers based on mode
  const getHeaders = () => {
    const baseHeaders = [
      { label: 'Product', key: 'productTitle' },
      { label: 'Qty', key: 'qty' },
      { label: 'My Price', key: 'myPrice' },
    ];

    switch (mode) {
      case 'competitors':
        return [
          ...baseHeaders,
          { label: 'Competitors Rule', key: null },
          { label: 'Competition', key: 'competition' },
          { label: 'Competitors', key: 'competitors' },
        ];
      case 'strategies':
        return [
          ...baseHeaders,
          { label: 'Strategy', key: 'strategy' },
          { label: 'Min Price', key: 'minPrice' },
          { label: 'Max Price', key: 'maxPrice' },
        ];
      default: // 'listings'
        return [
          ...baseHeaders,
          { label: 'Competitors Rule', key: null },
          { label: 'Competition', key: 'competition' },
          { label: 'Strategy', key: 'strategy' },
          { label: 'Min Price', key: 'minPrice' },
          { label: 'Max Price', key: 'maxPrice' },
          { label: 'Competitors', key: 'competitors' },
        ];
    }
  };

  const headers = getHeaders();

  // Function to render table cells based on mode
  const renderTableCells = (row) => {
    const baseCells = [
      // Product Cell
      <TableCell
        key="product"
        sx={{
          border: '1px solid #ddd',
          padding: '10px',
          backgroundColor: '#fff',
        }}
      >
        <Box>
          <Link
            href={`https://www.ebay.com/itm/${row.productId}`}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            color="primary"
            fontSize={16}
            sx={{ fontWeight: 600 }}
          >
            {row.productTitle}
          </Link>
          <Typography
            variant="caption"
            color="textSecondary"
            display="block"
            sx={{ fontSize: '14px' }}
          >
            {row.productId} |{' '}
            {row.status.map((s, i) => (
              <Typography
                key={i}
                component="span"
                sx={{
                  fontSize: '14px',
                  color: s === 'Active' ? '#1e852b' : 'gray',
                  mx: 0.5,
                }}
              >
                {s}
              </Typography>
            ))}
          </Typography>
        </Box>
      </TableCell>,

      // Qty Cell
      <TableCell
        key="qty"
        sx={{
          border: '1px solid #ddd',
          padding: '16px',
          backgroundColor: '#fff',
        }}
      >
        {row.qty}
      </TableCell>,

      // My Price Cell
      <TableCell
        key="price"
        sx={{
          border: '1px solid #ddd',
          padding: '16px',
          backgroundColor: '#fff',
        }}
      >
        {row.myPrice}
      </TableCell>,
    ];

    switch (mode) {
      case 'competitors':
        return [
          ...baseCells,
          // Competitors Rule Cell
          <TableCell
            key="compRule"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '16px',
              }}
              onClick={() => {
                modifyProductsId(row.productId);
                modifySku(row.sku ? row.sku : '');
                navigate(`/home/update-strategy/${row.productId}`);
              }}
            >
              Assign Rule
            </Typography>
          </TableCell>,
          // Competition Cell
          <TableCell
            key="competition"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            {row.competition}
          </TableCell>,
          // Competitors Cell
          <TableCell
            key="competitors"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '16px',
              }}
              onClick={() => {
                modifyProductsObj(row);
                navigate(`/home/competitors/${row.productId}`);
              }}
            >
              <CompetitorCount itemId={row.productId} />
            </Typography>
          </TableCell>,
        ];

      case 'strategies':
        return [
          ...baseCells,
          // Strategy Cell
          <TableCell
            key="strategy"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                fontSize: '16px',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
              onClick={() => {
                modifyProductsId(row.productId);
                modifySku(row.sku ? row.sku : '');
                navigate(`/home/update-strategy/${row.productId}`);
              }}
            >
              {row.strategy}
            </Typography>
          </TableCell>,
          // Min Price Cell
          <TableCell
            key="minPrice"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                fontSize: '16px',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
              onClick={() => navigate(`/home/update-strategy/${row.productId}`)}
            >
              {row.minPrice}
            </Typography>
          </TableCell>,
          // Max Price Cell
          <TableCell
            key="maxPrice"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                fontSize: '16px',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
              onClick={() => navigate(`/home/update-strategy/${row.productId}`)}
            >
              {row.maxPrice}
            </Typography>
          </TableCell>,
        ];

      default: // 'listings' - show all columns
        return [
          ...baseCells,
          // Competitors Rule Cell
          <TableCell
            key="compRule"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '16px',
              }}
              onClick={() => {
                modifyProductsId(row.productId);
                modifySku(row.sku ? row.sku : '');
                navigate(`/home/update-strategy/${row.productId}`);
              }}
            >
              Assign Rule
            </Typography>
          </TableCell>,
          // Competition Cell
          <TableCell
            key="competition"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            {row.competition}
          </TableCell>,
          // Strategy Cell
          <TableCell
            key="strategy"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                fontSize: '16px',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
              onClick={() => {
                modifyProductsId(row.productId);
                modifySku(row.sku ? row.sku : '');
                navigate(`/home/update-strategy/${row.productId}`);
              }}
            >
              {row.strategy}
            </Typography>
          </TableCell>,
          // Min Price Cell
          <TableCell
            key="minPrice"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                fontSize: '16px',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
              onClick={() => navigate(`/home/update-strategy/${row.productId}`)}
            >
              {row.minPrice}
            </Typography>
          </TableCell>,
          // Max Price Cell
          <TableCell
            key="maxPrice"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                fontSize: '16px',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
              onClick={() => navigate(`/home/update-strategy/${row.productId}`)}
            >
              {row.maxPrice}
            </Typography>
          </TableCell>,
          // Competitors Cell
          <TableCell
            key="competitors"
            sx={{
              border: '1px solid #ddd',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              color="primary"
              sx={{
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '16px',
              }}
              onClick={() => {
                modifyProductsObj(row);
                navigate(`/home/competitors/${row.productId}`);
              }}
            >
              <CompetitorCount itemId={row.productId} />
            </Typography>
          </TableCell>,
        ];
    }
  };

  return (
    <Container sx={{ mt: 4, mb: 2, pb: 10 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h5" component="h1">
          {mode === 'competitors'
            ? 'Competitor Management'
            : mode === 'strategies'
            ? 'Pricing Strategy Management'
            : 'Active Listings - Strategy Managed'}
        </Typography>
      </Box>
      <TableContainer
        component={Paper}
        sx={{ borderRadius: 2, border: '1px solid #ddd' }}
      >
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow
              sx={{
                backgroundColor: '#ffffff',
                borderBottom: '2px solid #e0e0e0',
                boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
                '&:hover': {
                  backgroundColor: '#f9f9f9',
                },
                transition: 'background-color 0.3s ease',
              }}
            >
              {headers.map((header) => (
                <TableCell
                  key={header.label}
                  sx={{
                    fontWeight: '600',
                    fontSize: '15px',
                    padding: '8px',
                    borderRight: '1px solid #ddd',
                    color: '#333',
                    backgroundColor: '#fafafa',
                    textAlign: 'left',
                    '&:last-child': {
                      borderRight: 'none',
                    },
                    '&:hover': {
                      backgroundColor: '#f5f5f5',
                      color: '#1976d2',
                    },
                    transition: 'all 0.3s ease',
                    cursor: header.key ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  onClick={
                    header.key ? () => handleSort(header.key) : undefined
                  }
                >
                  {header.label}
                  {header.key && sortBy === header.key && (
                    <span style={{ marginLeft: 4 }}>
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedRows.map((row, idx) => (
              <TableRow
                key={idx}
                sx={{
                  '&:hover': {
                    backgroundColor: '#f5f5f5',
                    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)',
                    cursor: 'pointer',
                  },
                  transition: 'all 0.3s ease',
                }}
              >
                {renderTableCells(row)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
