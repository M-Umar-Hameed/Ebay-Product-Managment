import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Menu,
  MenuItem,
  IconButton,
  Divider,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useNavigate, useLocation } from 'react-router-dom';
import apiService from '../api/apiService';

const tabs = [
  { label: 'Listings', hasDropdown: false, route: '/home' },
  { label: 'Competitors', hasDropdown: true, route: '/home/competitors' },
  {
    label: 'Pricing Strategies',
    hasDropdown: true,
    route: '/home/pricing-strategies',
  },
];

export default function NavTabs() {
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuTab, setMenuTab] = useState('');
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [availableRules, setAvailableRules] = useState([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [loadingRules, setLoadingRules] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch available strategies and rules when component mounts
  useEffect(() => {
    fetchAvailableStrategies();
    fetchAvailableRules();
  }, []);

  const fetchAvailableStrategies = async () => {
    try {
      setLoadingStrategies(true);
      const response =
        await apiService.pricingStrategies.getAllUniqueStrategies();
      if (response.success) {
        setAvailableStrategies(response.strategies || []);
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
    } finally {
      setLoadingStrategies(false);
    }
  };

  const fetchAvailableRules = async () => {
    try {
      setLoadingRules(true);
      // Remove the API call since we don't need to fetch rules for dropdown
      setAvailableRules([]);
    } catch (error) {
      console.error('Error fetching competitor rules:', error);
    } finally {
      setLoadingRules(false);
    }
  };

  // Determine active tab based on current route
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/home') return 'Listings';
    if (path.startsWith('/home/competitors')) return 'Competitors';
    if (
      path.startsWith('/home/pricing-strategies') ||
      path.startsWith('/home/edit-strategy')
    )
      return 'Pricing Strategies';
    return 'Listings';
  };

  const activeTab = getActiveTab();

  const handleMenuOpen = (event, tab) => {
    setAnchorEl(event.currentTarget);
    setMenuTab(tab);

    // Refresh data when opening the dropdown
    if (tab === 'Pricing Strategies') {
      fetchAvailableStrategies();
    } else if (tab === 'Competitors') {
      fetchAvailableRules();
    }
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuTab('');
  };

  const handleTabClick = (route, hasDropdown) => {
    if (hasDropdown) {
      // Don't navigate immediately if it has dropdown
      return;
    }
    navigate(route);
    handleMenuClose();
  };

  const handleStrategySelect = (strategyName) => {
    navigate(`/home/edit-strategy/${encodeURIComponent(strategyName)}`);
    handleMenuClose();
  };

  const handleAddStrategy = () => {
    navigate('/home/add-strategy');
    handleMenuClose();
  };

  const handleAssignToMultiple = () => {
    navigate('/home/pricing-strategies');
    handleMenuClose();
  };

  // Competitor rule handlers
  const handleAddCompetitorRule = () => {
    navigate('/home/add-competitor-rule');
    handleMenuClose();
  };

  const handleApplyCompetitorRule = () => {
    navigate('/home/competitors');
    handleMenuClose();
  };

  const handleCompetitorRuleSelect = (ruleName) => {
    navigate(`/home/edit-competitor-rule/${encodeURIComponent(ruleName)}`);
    handleMenuClose();
  };

  // Format strategy display value like in the image
  const formatStrategyDisplay = (strategy) => {
    if (strategy.value) {
      if (
        strategy.beatBy === 'PERCENTAGE' ||
        strategy.stayAboveBy === 'PERCENTAGE'
      ) {
        return `${(strategy.value * 100).toFixed(0)}%`;
      } else {
        return `${strategy.value}`;
      }
    }
    return strategy.strategyName;
  };

  // Format competitor rule display
  const formatRuleDisplay = (rule) => {
    if (rule.ruleName) {
      return rule.ruleName;
    }
    return rule.ruleType || 'Rule';
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      sx={{
        backgroundColor: '#fff',
        borderBottom: '2px solid #e0e0e0',
        py: 2,
        width: '100%',
        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
        gap: 4,
      }}
    >
      {tabs.map(({ label, hasDropdown, route }) => {
        const isActive = label === activeTab;
        return (
          <Box
            key={label}
            display="flex"
            alignItems="center"
            sx={{
              cursor: 'pointer',
              padding: '12px 24px',
              borderRadius: 2,
              transition: 'all 0.3s ease-in-out',
              '&:hover': {
                backgroundColor: '#f5f5f5',
              },
            }}
            onClick={(e) => {
              if (hasDropdown) {
                handleMenuOpen(e, label);
              } else {
                handleTabClick(route, hasDropdown);
              }
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: isActive ? 'bold' : 'medium',
                color: isActive ? '#1976d2' : '#666',
                borderBottom: isActive ? '3px solid #1976d2' : 'none',
                pb: 0.5,
                transition: 'all 0.3s ease-in-out',
                fontSize: '16px',
              }}
            >
              {label}
            </Typography>
            {hasDropdown && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuOpen(e, label);
                }}
                sx={{
                  color: isActive ? '#1976d2' : '#999',
                  padding: 0,
                  ml: 1,
                  transition: 'color 0.3s ease-in-out',
                  '&:hover': { color: '#1976d2' },
                }}
              >
                <ArrowDropDownIcon />
              </IconButton>
            )}
          </Box>
        );
      })}

      {/* Dropdown Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            maxHeight: 400,
            minWidth: 200,
            '& .MuiMenuItem-root': {
              fontSize: '14px',
              py: 1,
            },
          },
        }}
      >
        {/* Competitors Menu */}
        {menuTab === 'Competitors' && (
          <>
            {/* Action Items only */}
            <MenuItem onClick={handleAddCompetitorRule}>
              <Typography variant="body2" fontWeight={500} color="primary">
                Add Competitor Rule
              </Typography>
            </MenuItem>

            <MenuItem onClick={handleApplyCompetitorRule}>
              <Typography variant="body2" fontWeight={500} color="primary">
                Apply Competitor Rule to Listings
              </Typography>
            </MenuItem>
          </>
        )}

        {/* Pricing Strategies Menu */}
        {menuTab === 'Pricing Strategies' && (
          <>
            {/* Individual Strategy Values */}
            {loadingStrategies ? (
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  Loading...
                </Typography>
              </MenuItem>
            ) : availableStrategies.length > 0 ? (
              availableStrategies.map((strategy) => (
                <MenuItem
                  key={strategy._id || strategy.strategyName}
                  onClick={() => handleStrategySelect(strategy.strategyName)}
                  sx={{
                    '&:hover': {
                      backgroundColor: '#f5f5f5',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: '#4caf50',
                      }}
                    />
                    <Typography variant="body2" fontWeight={500}>
                      {formatStrategyDisplay(strategy)}
                    </Typography>
                  </Box>
                </MenuItem>
              ))
            ) : (
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  No strategies available
                </Typography>
              </MenuItem>
            )}

            {/* Divider */}
            <Divider sx={{ my: 1 }} />

            {/* Action Items */}
            <MenuItem onClick={handleAddStrategy}>
              <Typography variant="body2" fontWeight={500} color="primary">
                Add Strategy
              </Typography>
            </MenuItem>

            <MenuItem onClick={handleAssignToMultiple}>
              <Typography variant="body2" fontWeight={500} color="primary">
                Assign a Strategy to Multiple Listings
              </Typography>
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
}
