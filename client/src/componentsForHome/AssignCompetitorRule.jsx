import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Button,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import apiService from '../api/apiService';

const AssignCompetitorRule = () => {
  const [rules, setRules] = useState([]);
  const [selectedRule, setSelectedRule] = useState('');
  const [assignAll, setAssignAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchRules = async () => {
      setFetching(true);
      setError('');
      try {
        const res = await apiService.competitorRules.getAllRules();
        setRules(res.rules || []);
      } catch (err) {
        setError('Failed to fetch rules');
      } finally {
        setFetching(false);
      }
    };
    fetchRules();
  }, []);

  const handleAssign = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      if (!selectedRule) {
        // Unassign rule from all active listings
        if (assignAll) {
          await apiService.competitorRules.deleteRulesFromAllActive();
          setSuccess('Rules unassigned from all active listings.');
        } else {
          setError(
            'Please select "Assign this rule to all my active listings" to unassign rules.'
          );
        }
      } else {
        // Assign rule to all active listings
        if (assignAll) {
          await apiService.competitorRules.createRuleForAllActive({
            ruleId: selectedRule,
          });
          setSuccess('Rule assigned to all active listings.');
        } else {
          setError(
            'Please select "Assign this rule to all my active listings" to assign the rule.'
          );
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign rule.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper
      sx={{
        p: { xs: 2, sm: 3 },
        mb: 2,
        width: '100%',
        maxWidth: 1200,
        mx: { sm: 2, lg: 'auto' },
        mt: { xs: 4, sm: 4 },
      }}
    >
      <Typography variant="h5" gutterBottom>
        Apply Competitor Rule to Listings
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Choose the rule from the drop down menu below. Then choose listings to
        apply it to by selecting the left side check box in the table. Then
        click 'Assign Competitor Rule'.
      </Typography>
      {fetching ? (
        <CircularProgress size={24} />
      ) : (
        <>
          <FormControl sx={{ minWidth: 320, mb: 2 }}>
            <InputLabel id="rule-select-label">Rule</InputLabel>
            <Select
              labelId="rule-select-label"
              value={selectedRule}
              label="Rule"
              onChange={(e) => setSelectedRule(e.target.value)}
            >
              <MenuItem value="">No Rule (Unassign)</MenuItem>
              {rules.map((rule) => (
                <MenuItem key={rule._id} value={rule._id}>
                  {rule.name ||
                    rule.ruleName ||
                    rule.title ||
                    `Rule ${rule._id}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={assignAll}
                  onChange={(e) => setAssignAll(e.target.checked)}
                />
              }
              label="Assign this rule to all my active listings."
            />
          </Box>
          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleAssign}
              disabled={loading || !assignAll}
            >
              {loading ? (
                <CircularProgress size={20} />
              ) : (
                'Assign Competitor Rule'
              )}
            </Button>
          </Box>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {success}
            </Alert>
          )}
        </>
      )}
    </Paper>
  );
};

export default AssignCompetitorRule;
