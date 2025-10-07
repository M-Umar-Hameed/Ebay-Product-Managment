import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Button,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Link,
  CircularProgress,
} from '@mui/material';
import apiService from '../api/apiService';
import { useProductStore } from '../store/productStore';

export default function CompetitorPricesPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [competitorData, setCompetitorData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decliningCompetitor, setDecliningCompetitor] = useState(null);
  const [myItemTitle, setMyItemTitle] = useState('');
  const competitors = useProductStore((state) => state.competitors);
  const productObj = useProductStore((state) => state.productObj);
  //
  useEffect(() => {
    async function fetchData() {
      try {
        // Call manually added competitors API only
        const manualCompetitorsResponse =
          await apiService.inventory.getManuallyAddedCompetitors(itemId);

        if (productObj.title) setMyItemTitle(productObj.title);

        let allCompetitors = [];

        // Process manually added competitors
        if (
          manualCompetitorsResponse.success &&
          manualCompetitorsResponse.competitors
        ) {
          console.log(
            '📊 Raw competitor data:',
            manualCompetitorsResponse.competitors
          );

          const manualCompetitors = manualCompetitorsResponse.competitors.map(
            (comp) => {
              console.log('📊 Processing competitor:', comp);

              return {
                id: comp.itemId, // Use itemId from the API response
                title: comp.title,
                imageurl: comp.imageUrl,
                country: comp.locale || 'US',
                image: comp.imageUrl,
                url: comp.productUrl,
                price: comp.price,
                currency: comp.currency || 'USD',
                mpn: 'None',
                upc: 'None',
                ean: 'None',
                isbn: 'None',
                source: 'Manual',
                addedAt: comp.addedAt,
                itemId: comp.itemId, // Keep itemId for reference
              };
            }
          );

          console.log(
            '📊 Processed competitors:',
            manualCompetitors.map((c) => ({
              id: c.id,
              itemId: c.itemId,
              title: c.title?.substring(0, 50),
            }))
          );

          allCompetitors = [...manualCompetitors];
        }

        // Fallback to store data if no API data
        if (allCompetitors.length === 0 && competitors.length > 0) {
          const detailed = competitors.map((p, i) => ({
            id: p.id,
            title: p.title,
            imageurl: p.imageurl,
            country: p.locale,
            image: p.imageurl,
            url: p.productUrl,
            price: p.price,
            currency: p.currency,
            mpn: 'None',
            upc: 'None',
            ean: 'None',
            isbn: 'None',
            source: 'Store',
          }));
          allCompetitors = detailed;
        }
        if (allCompetitors.length === 0) {
          setError('No competitor listings found.');
        } else {
          setCompetitorData(allCompetitors);
        }
      } catch (err) {
        console.error('Error fetching competitor data:', err);
        setError('Failed to fetch competitor data.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [itemId]);

  // Calculate total competitors count
  const totalCompetitors = competitorData.length;

  const handleAccept = async (comp) => {
    try {
      const numericPrice = parseFloat(comp.price);
      const response = await apiService.inventory.editPrice({
        itemId,
        newPrice: numericPrice,
        reason: 'Accepted competitor price',
      });

      if (response.success) {
        setAcceptedId(comp.id);
        alert(`Updated price to USD ${numericPrice}`);
      } else {
        alert('Failed to update price.');
      }
    } catch (err) {
      alert('An error occurred while updating price.');
    }
  };

  const handleDecline = async (competitorId) => {
    // Add safety check for undefined competitorId
    if (!competitorId) {
      console.error('Competitor ID is undefined');
      setError('Invalid competitor ID');
      return;
    }

    setDecliningCompetitor(competitorId);

    try {
      // Since we're now using itemId directly as the ID, we can use it directly
      const response = await apiService.inventory.removeManualCompetitor(
        itemId,
        competitorId
      );

      if (response.success) {
        // Remove from local state
        setCompetitorData((prev) =>
          prev.filter((comp) => comp.id !== competitorId)
        );

        console.log(`Successfully removed competitor ${competitorId}`);

        // Check if strategy was executed and show feedback
        if (response.priceChange?.strategyExecuted) {
          console.log(
            '🎯 Strategy executed after competitor removal:',
            response.priceChange
          );

          // Show user feedback about price changes
          if (response.priceChange.strategyResult?.priceChanges > 0) {
            alert(
              `Competitor removed and price updated automatically! New price reflects the updated competition.`
            );
          } else {
            console.log('Strategy executed but no price change was needed');
          }

          // Trigger a refresh of the parent listings table to show updated prices
          localStorage.setItem('priceUpdated', Date.now().toString());

          // Dispatch custom event to notify other components
          window.dispatchEvent(
            new CustomEvent('competitorRemoved', {
              detail: {
                itemId,
                competitorId,
                priceChange: response.priceChange,
              },
            })
          );
        }
      } else {
        setError(
          'Failed to remove competitor: ' + (response.error || 'Unknown error')
        );
      }
    } catch (err) {
      console.error('Error removing competitor:', err);
      setError('An error occurred while removing the competitor');
    } finally {
      setDecliningCompetitor(null);
    }
  };

  return (
    <Container sx={{ mt: 4, mb: 10 }}>
      <Typography variant="h4" gutterBottom>
        Competitor Listing For: {itemId}
      </Typography>

      <Typography variant="body2" sx={{ mb: 3, color: 'primary.main' }}>
        Total Competitors: {totalCompetitors}
      </Typography>

      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => navigate(`/home/add-competitor-manually/${itemId}`)}
        >
          Add Competitor Manually
        </Button>
      </Box>
      {loading ? (
        <CircularProgress />
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <>
          {/* Detailed Table */}
          <Paper>
            <Typography variant="h6" sx={{ px: 2, pt: 2 }}>
              Detailed Competitor Listings
            </Typography>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Image</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {competitorData.map((comp) => (
                  <TableRow key={comp.id || comp.itemId || Math.random()}>
                    <TableCell>
                      <Link href={comp.url} target="_blank" underline="hover">
                        {comp.title}
                      </Link>
                      <Typography variant="caption" color="textSecondary">
                        MPN: {comp.mpn} | UPC: {comp.upc} | EAN: {comp.ean} |
                        ISBN: {comp.isbn}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {comp.currency} {parseFloat(comp.price).toFixed(2)}
                    </TableCell>
                    <TableCell>{comp.country}</TableCell>
                    <TableCell>
                      <Typography
                        variant="caption"
                        sx={{
                          backgroundColor:
                            comp.source === 'Manual' ? '#e3f2fd' : '#f5f5f5',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                        }}
                      >
                        {comp.source || 'API'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {comp.image ? (
                        <img src={comp.image} alt="thumb" width={80} />
                      ) : (
                        <Typography variant="caption" color="textSecondary">
                          No image
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          onClick={() => {
                            const competitorToRemove = comp.id || comp.itemId;
                            console.log(
                              'Removing competitor:',
                              competitorToRemove,
                              'from comp:',
                              comp
                            );
                            if (competitorToRemove) {
                              handleDecline(competitorToRemove);
                            } else {
                              console.error(
                                'No valid competitor ID found:',
                                comp
                              );
                              setError('Cannot remove competitor: Invalid ID');
                            }
                          }}
                          disabled={
                            decliningCompetitor === (comp.id || comp.itemId)
                          }
                          startIcon={
                            decliningCompetitor === (comp.id || comp.itemId) ? (
                              <CircularProgress size={16} />
                            ) : null
                          }
                        >
                          {decliningCompetitor === (comp.id || comp.itemId)
                            ? 'Removing...'
                            : 'Decline'}
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Container>
  );
}
