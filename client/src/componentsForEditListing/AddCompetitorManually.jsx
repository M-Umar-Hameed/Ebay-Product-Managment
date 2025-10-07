import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  Alert,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Pagination,
} from '@mui/material';
import { useProductStore } from '../store/productStore';
import apiService from '../api/apiService';

export default function AddCompetitorManually() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [ebayItemNumber, setEbayItemNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [listingTitle, setListingTitle] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [acceptingCompetitor, setAcceptingCompetitor] = useState(null);

  const productObj = useProductStore((state) => state.productObj);

  useEffect(() => {
    if (productObj.title) {
      setListingTitle(productObj.title);
    }
  }, [productObj]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!ebayItemNumber.trim()) {
      setError('Please enter eBay item numbers');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setShowResults(false);

    try {
      // Parse the eBay item numbers
      const itemNumbers = ebayItemNumber
        .split(/[;,]/)
        .map((num) => num.trim())
        .filter((num) => num.length > 0 && /^\d+$/.test(num));

      if (itemNumbers.length === 0) {
        setError('Please enter valid eBay item numbers (numeric only)');
        return;
      }

      // Search for competitors without adding them
      const response = await apiService.inventory.searchCompetitorsManually(
        itemId,
        itemNumbers
      );

      if (response.success) {
        setSearchResults(response.foundCompetitors || []);
        setShowResults(true);
        setCurrentPage(1);

        if (response.foundCompetitors.length === 0) {
          setError('No valid competitors found');
        } else {
          setSuccess(
            `Found ${response.foundCompetitors.length} competitor(s). Review and accept the ones you want to add.`
          );
        }
      } else {
        setError(response.error || 'Failed to search for competitors');
      }
    } catch (err) {
      console.error('Error searching for competitors:', err);
      setError(
        'An error occurred while searching for competitors. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptCompetitor = async (competitor) => {
    setAcceptingCompetitor(competitor.itemId);
    setError('');

    try {
      // Add single competitor
      const response = await apiService.inventory.addCompetitorsManually(
        itemId,
        [competitor.itemId]
      );

      if (response.success) {
        // Remove accepted competitor from search results
        setSearchResults((prev) =>
          prev.filter((comp) => comp.itemId !== competitor.itemId)
        );
        setSuccess(`Successfully added competitor: ${competitor.title}`);

        // Trigger refresh of competitor count and listings
        window.dispatchEvent(
          new CustomEvent('competitorAdded', {
            detail: { itemId, competitorId: competitor.itemId },
          })
        );

        // Also set a localStorage flag for other components to detect
        localStorage.setItem('competitorUpdated', Date.now().toString());
      } else {
        setError(response.error || 'Failed to add competitor');
      }
    } catch (err) {
      console.error('Error adding competitor:', err);
      setError('An error occurred while adding the competitor');
    } finally {
      setAcceptingCompetitor(null);
    }
  };

  const handleBack = () => {
    navigate(`/home/competitors/${itemId}`);
  };

  // Pagination
  const entriesPerPage = 25;
  const totalPages = Math.ceil(searchResults.length / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const currentResults = searchResults.slice(startIndex, endIndex);

  return (
    <Container sx={{ mt: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>
          Add Competitor Manually
        </Typography>

        <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
          Your Listing: {listingTitle || `Item ID: ${itemId}`}
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: 'primary.main' }}>
          Input competitors IDs, (delimiter is ;) max 20 products allowed at
          once, all above will be ignored
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            value={ebayItemNumber}
            onChange={(e) => setEbayItemNumber(e.target.value)}
            sx={{ mb: 3 }}
            multiline
            rows={3}
            placeholder="283142786906; 283142786908; 283142786901; 283142786900; ..."
            helperText="Enter eBay item numbers separated by semicolons"
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <Box
            sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mb: 3 }}
          >
            <Button variant="outlined" onClick={handleBack} disabled={loading}>
              Back to competitors selection
            </Button>

            <Button
              type="submit"
              variant="contained"
              color="success"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </Box>
        </Box>

        {showResults && (
          <Box sx={{ mt: 4 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <Typography variant="body2">
                Show {entriesPerPage} entries
              </Typography>
              <Box>
                <TextField
                  size="small"
                  placeholder="Search:"
                  sx={{ width: '200px' }}
                />
              </Box>
            </Box>

            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Listed Price</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Image</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {currentResults.map((competitor) => (
                  <TableRow key={competitor.itemId}>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 500, color: 'primary.main' }}
                      >
                        {competitor.title}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        MPN: None | UPC: None | EAN: None | ISBN: None
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {competitor.price
                          ? `${competitor.currency || 'USD'} ${parseFloat(
                              competitor.price
                            ).toFixed(2)}`
                          : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {competitor.locale || 'US'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {competitor.imageUrl ? (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <img
                            src={competitor.imageUrl}
                            alt="Product"
                            style={{
                              width: 40,
                              height: 40,
                              objectFit: 'cover',
                              borderRadius: 4,
                            }}
                          />
                        </Box>
                      ) : (
                        <Typography variant="caption" color="textSecondary">
                          No image
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {competitor.isAlreadyAdded ? (
                        <Button
                          variant="outlined"
                          color="info"
                          size="small"
                          disabled
                        >
                          Already Added
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          onClick={() => handleAcceptCompetitor(competitor)}
                          disabled={acceptingCompetitor === competitor.itemId}
                          startIcon={
                            acceptingCompetitor === competitor.itemId ? (
                              <CircularProgress size={16} />
                            ) : null
                          }
                        >
                          {acceptingCompetitor === competitor.itemId
                            ? 'Adding...'
                            : 'Accept'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 3,
                }}
              >
                <Typography variant="body2">
                  Showing {startIndex + 1} to{' '}
                  {Math.min(endIndex, searchResults.length)} of{' '}
                  {searchResults.length} entries
                </Typography>
                <Pagination
                  count={totalPages}
                  page={currentPage}
                  onChange={(e, page) => setCurrentPage(page)}
                  color="primary"
                />
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Container>
  );
}
