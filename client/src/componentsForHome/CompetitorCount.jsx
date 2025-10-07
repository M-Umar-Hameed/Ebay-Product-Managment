import React, { useState, useEffect } from 'react';
import apiService from '../api/apiService';

const CompetitorCount = ({ itemId }) => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCompetitorCount = async () => {
    if (!itemId) {
      setLoading(false);
      setCount(0);
      return;
    }

    try {
      console.log(`🔍 Fetching competitor count for itemId: ${itemId}`);

      const manualResponse =
        await apiService.inventory.getManuallyAddedCompetitors(itemId);

      console.log(
        `📊 Manual competitors response for ${itemId}:`,
        manualResponse
      );

      let manualCount = 0;

      if (manualResponse.success) {
        // Handle both possible response structures
        const competitors =
          manualResponse.competitors || manualResponse.data?.competitors || [];
        manualCount = Array.isArray(competitors) ? competitors.length : 0;
      } else {
        console.warn(
          `⚠️ Failed to get manual competitors for ${itemId}:`,
          manualResponse.error
        );
      }

      setCount(manualCount);
    } catch (error) {
      console.error(`❌ Error fetching competitor count for ${itemId}:`, error);
      setCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompetitorCount();
  }, [itemId]);

  // Listen for competitor updates
  useEffect(() => {
    const handleCompetitorUpdate = (event) => {
      if (event.detail?.itemId === itemId) {
        fetchCompetitorCount();
      }
    };

    const handleStorageUpdate = () => {
      fetchCompetitorCount();
    };

    window.addEventListener('competitorAdded', handleCompetitorUpdate);
    window.addEventListener('competitorRemoved', handleCompetitorUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    // Also check localStorage periodically
    const interval = setInterval(() => {
      const lastUpdate = localStorage.getItem('competitorUpdated');
      if (lastUpdate && Date.now() - parseInt(lastUpdate) < 5000) {
        fetchCompetitorCount();
        localStorage.removeItem('competitorUpdated');
      }
    }, 1000);

    return () => {
      window.removeEventListener('competitorAdded', handleCompetitorUpdate);
      window.removeEventListener('competitorRemoved', handleCompetitorUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
      clearInterval(interval);
    };
  }, [itemId]);

  if (loading) {
    return <span style={{ color: '#999' }}>...</span>;
  }

  return <span>{count}</span>;
};

export default CompetitorCount;
