import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Divider,
  Chip,
} from '@mui/material';
import { PlayArrow, Analytics, TrendingUp } from '@mui/icons-material';
import apiService from '../api/apiService';

const CompetitorRuleExecutor = ({ itemId, onExecutionComplete }) => {
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const executeRule = async () => {
    if (!itemId) {
      setError('Item ID is required');
      return;
    }

    setExecuting(true);
    setError('');
    setResult(null);

    try {
      const userId = localStorage.getItem('user_id');

      const response = await fetch(
        '/api/competitor-rules/execute-rule/' + itemId,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('app_jwt')}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setResult(data.execution);
        if (onExecutionComplete) {
          onExecutionComplete(data.execution);
        }
      } else {
        setError(data.message || 'Failed to execute competitor rule');
      }
    } catch (err) {
      console.error('Error executing competitor rule:', err);
      setError('Failed to execute competitor rule: ' + err.message);
    } finally {
      setExecuting(false);
    }
  };

  const renderPriceAnalysis = (analysis) => {
    if (!analysis) return null;

    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <Analytics sx={{ mr: 1, verticalAlign: 'middle' }} />
            Price Analysis
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Chip
              label={`${analysis.competitorCount} Competitors Found`}
              color="primary"
              variant="outlined"
            />
            <Chip
              label={`Avg: $${analysis.averagePrice}`}
              color="info"
              variant="outlined"
            />
            <Chip
              label={`Low: $${analysis.lowestPrice}`}
              color="success"
              variant="outlined"
            />
            <Chip
              label={`High: $${analysis.highestPrice}`}
              color="warning"
              variant="outlined"
            />
          </Box>

          <Typography variant="body2" color="text.secondary">
            {analysis.recommendation}
          </Typography>
        </CardContent>
      </Card>
    );
  };

  const renderPriceSuggestion = (suggestion, currentPrice) => {
    if (!suggestion) return null;

    const isIncrease = suggestion.change > 0;
    const isDecrease = suggestion.change < 0;

    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <TrendingUp sx={{ mr: 1, verticalAlign: 'middle' }} />
            Price Suggestion
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="body1">
              Current: <strong>${currentPrice}</strong>
            </Typography>
            <Typography
              variant="h6"
              color={
                isIncrease ? 'error' : isDecrease ? 'success' : 'text.primary'
              }
            >
              Suggested: <strong>${suggestion.suggested}</strong>
            </Typography>
            {suggestion.change !== 0 && (
              <Chip
                label={`${isIncrease ? '+' : ''}${suggestion.changePercent}%`}
                color={isIncrease ? 'error' : 'success'}
                size="small"
              />
            )}
          </Box>

          <Typography variant="body2" color="text.secondary">
            {suggestion.reason}
          </Typography>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      <Button
        variant="contained"
        startIcon={executing ? <CircularProgress size={20} /> : <PlayArrow />}
        onClick={executeRule}
        disabled={executing}
        sx={{ mb: 2 }}
      >
        {executing ? 'Executing Rule...' : 'Execute Competitor Rule'}
      </Button>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {result && (
        <Box>
          <Alert severity={result.success ? 'success' : 'error'} sx={{ mb: 2 }}>
            {result.success
              ? `Found ${result.competitorsAfterFiltering} competitors after filtering`
              : `Execution failed: ${result.error}`}
          </Alert>

          {result.success && (
            <>
              {renderPriceAnalysis(result.priceAnalysis)}
              {renderPriceSuggestion(
                result.priceSuggestion,
                result.currentPrice
              )}

              {result.competitors && result.competitors.length > 0 && (
                <Card sx={{ mt: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Found Competitors
                    </Typography>
                    {result.competitors.slice(0, 5).map((competitor, index) => (
                      <Box
                        key={index}
                        sx={{
                          mb: 1,
                          p: 1,
                          bgcolor: 'grey.50',
                          borderRadius: 1,
                        }}
                      >
                        <Typography variant="body2" noWrap>
                          <strong>${competitor.price}</strong> -{' '}
                          {competitor.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {competitor.condition} • {competitor.source}
                        </Typography>
                      </Box>
                    ))}
                    {result.competitors.length > 5 && (
                      <Typography variant="caption" color="text.secondary">
                        ... and {result.competitors.length - 5} more competitors
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

export default CompetitorRuleExecutor;
