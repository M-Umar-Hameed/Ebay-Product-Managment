// src/pages/Home.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import apiService from '../api/apiService';
import getValidAuthToken from '../utils/getValidAuthToken';
import { userStore } from '../store/authStore';

import Header from '../componentsForHome/Header';
import NavTabs from '../componentsForHome/NavTabs';
import ListingsHeading from '../componentsForHome/ListingsHeading';
import EntriesAndSearchBar from '../componentsForHome/EntriesAndSearchBar';
import ListingsTable from '../componentsForHome/ListingsTable';
import PaginationBar from '../componentsForHome/PaginationBar';
import Footer from '../componentsForHome/Footer';
import ScrollToTopButton from '../componentsForHome/ScrollToTopButton';
import AssignCompetitorRule from '../componentsForHome/AssignCompetitorRule';

export default function Home({ handleLogout }) {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(10); // You can make this configurable later
  const [ebayToken, setEbayToken] = useState(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);
  const [listingsError, setListingsError] = useState(null);

  const user = userStore((store) => store.user);
  const location = useLocation();
  const popupRef = useRef(null); // will hold reference to the OAuth popup window

  // Handle OAuth popup messages
  useEffect(() => {
    const handleMessage = async (event) => {
      // For production, allow messages from the same origin
      if (
        event.origin !== window.location.origin &&
        event.origin !== 'https://17autoparts.com'
      ) {
        console.warn('⚠️ Message from unexpected origin, ignoring');
        return;
      }

      const { code, state, error } = event.data;

      if (error) {
        console.error('❌ OAuth error from popup:', error);
        alert('eBay authorization failed: ' + error);
        return;
      }

      if (code && user?.id) {
        try {
          const resp = await apiService.auth.exchangeCode({
            code,
            userId: user.id,
          });

          if (!resp.success) {
            console.error('❌ Exchange failed:', resp.error);
            alert('Failed to exchange authorization code: ' + resp.error);
            throw new Error(resp.error || 'Exchange failed');
          }

          const expiresIn = resp.data.expires_in || 7200; // fallback to 2h
          const expiresAt = Date.now() + expiresIn * 1000;

          // Store token with expiry info
          const tokenData = {
            value: resp.data.access_token,
            expiry: expiresAt,
          };

          localStorage.setItem('ebay_user_token', JSON.stringify(tokenData));
          localStorage.setItem('userId', user.id);

          if (resp.data.refresh_token) {
            localStorage.setItem('ebay_refresh_token', resp.data.refresh_token);
          }

          setEbayToken(resp.data.access_token);
          setNeedsConnection(false);

          // Close the popup window if it exists
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close();
          }

          alert('✅ Successfully connected to eBay!');
        } catch (err) {
          console.error('❌ Error exchanging code:', err);
          alert('Error connecting to eBay: ' + err.message);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user]);

  // 1) On mount (and whenever the "user" changes), try to fetch/refresh the eBay token.
  //    If none is available, show "Connect to eBay" button.
  useEffect(() => {
    async function checkToken() {
      if (!user || !user.id) return;

      // 1. Try localStorage first
      const localTokenStr = localStorage.getItem('ebay_user_token');
      if (localTokenStr) {
        try {
          const localTokenData = JSON.parse(localTokenStr);
          if (localTokenData.expiry > Date.now()) {
            setEbayToken(localTokenData.value);
            setNeedsConnection(false);
            return;
          } else {
            localStorage.removeItem('ebay_user_token');
          }
        } catch (err) {
          console.warn('⚠️ Invalid token data in localStorage, removing...');
          localStorage.removeItem('ebay_user_token');
        }
      }

      // 2. Try to get/refresh token from backend
      try {
        const token = await getValidAuthToken(user.id);
        if (token) {
          const tokenData = {
            value: token,
            expiry: Date.now() + 7200 * 1000, // 2 hours default
          };
          localStorage.setItem('ebay_user_token', JSON.stringify(tokenData));
          setEbayToken(token);
          setNeedsConnection(false);
        } else {
          setNeedsConnection(true);
        }
      } catch (err) {
        console.warn('⚠️ Unable to fetch/refresh eBay token:', err);
        setNeedsConnection(true);
      }
    }

    checkToken();
  }, [user]);

  // 2) Once we have a valid ebayToken, fetch the user's active listings.
  useEffect(() => {
    if (!ebayToken) {
      return;
    }

    async function fetchListings() {
      setLoadingListings(true);
      setListingsError(null);
      try {
        // Our interceptor attaches "Authorization: Bearer <ebayToken>"
        const data = await apiService.inventory.getActiveListings();
        if (!data.success) {
          // Check if token expired
          if (data.errors?.[0]?.errorId === 932) {
            console.warn('eBay token expired. Refreshing…');
            const refreshed = await apiService.auth.refreshEbayUserToken(
              user.id
            );
            if (refreshed?.success && refreshed.data?.access_token) {
              const expires = refreshed.data.expires_in || 7200;
              localStorage.setItem(
                'ebay_user_token',
                JSON.stringify({
                  value: refreshed.data.access_token,
                  expiry: Date.now() + expires * 1000,
                })
              );
              setEbayToken(refreshed.data.access_token);
              return; // re-trigger fetchListings on next effect run
            } else {
              // Refresh failed, clear tokens and show connect page
              localStorage.removeItem('ebay_user_token');
              localStorage.removeItem('ebay_refresh_token');
              setEbayToken(null);
              setNeedsConnection(true);
              return;
            }
          }
          setListingsError(data.error || 'Failed to load listings.');
        }
        // TODO: store "data" (listings) into local state or a global store.
      } catch (err) {
        console.error('Error fetching listings:', err);
        // Check if it's a 401 error (token expired)
        if (err.response?.status === 401 || err.status === 401) {
          console.warn(
            '⚠️ eBay token expired (401 error). Clearing tokens and showing connect page.'
          );
          localStorage.removeItem('ebay_user_token');
          localStorage.removeItem('ebay_refresh_token');
          setEbayToken(null);
          setNeedsConnection(true);
          setListingsError(null); // Clear error since we're handling it
        } else {
          setListingsError(err.message || 'Error loading listings.');
        }
      } finally {
        setLoadingListings(false);
      }
    }

    fetchListings();
  }, [ebayToken, user]);

  // Handle global eBay token expiry events
  useEffect(() => {
    const handleTokenExpiry = () => {
      console.warn('eBay token expired event received');
      setEbayToken(null);
      setNeedsConnection(true);
      setListingsError(null);
    };

    const handleAuthFailure = () => {
      console.warn(
        '⚠️ Authentication failure detected. Clearing storage and reloading...'
      );

      // Clear all authentication-related data
      localStorage.removeItem('user-store');
      localStorage.removeItem('ebay_user_token');
      localStorage.removeItem('ebay_refresh_token');
      localStorage.removeItem('userId');
      localStorage.removeItem('user_id');

      // Reload the page to redirect to login
      window.location.reload();
    };

    window.addEventListener('ebayTokenExpired', handleTokenExpiry);
    window.addEventListener('authenticationFailed', handleAuthFailure);

    return () => {
      window.removeEventListener('ebayTokenExpired', handleTokenExpiry);
      window.removeEventListener('authenticationFailed', handleAuthFailure);
    };
  }, []);

  // 3) If the user never connected to eBay, show "Connect to eBay" UI.
  if (needsConnection) {
    const openEbayOAuthPopup = () => {
      if (!user || !user.id) {
        console.error('No user ID available – cannot start eBay OAuth.');
        alert('No user ID available. Please log in again.');
        return;
      }

      // Get the backend URL from environment or use current domain
      const backendBase =
        import.meta.env.VITE_BACKEND_URL || window.location.origin;

      // 3a) Open a small popup centered on the screen:
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;

      const authUrl = `${backendBase}/auth/ebay-login?userId=${user.id}`;

      const popup = window.open(
        authUrl,
        'ebayAuth',
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
      );

      if (!popup) {
        console.error('❌ Failed to open popup - might be blocked');
        alert(
          'Popup was blocked. Please allow popups for this site and try again.'
        );
        return;
      }

      // Store reference to popup
      popupRef.current = popup;

      // Optional: Monitor popup closure
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
        }
      }, 1000);
    };

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h2>eBay Token Expired</h2>
        <p style={{ marginBottom: '2rem', color: '#666' }}>
          Your eBay authorization has expired. Please reconnect your eBay
          account to continue.
        </p>
        <button
          onClick={openEbayOAuthPopup}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#2E3B4E',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer',
            marginBottom: '1rem',
          }}
        >
          Reconnect to eBay
        </button>
        <button
          onClick={() => {
            setNeedsConnection(false);
            setEbayToken('dummy'); // This will trigger a refresh attempt
          }}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            color: '#666',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // Handle eBay account logout
  const handleEbayLogout = async () => {
    if (!user?.id) return;

    try {
      const response = await apiService.auth.ebayLogout(user.id);

      if (response.success) {
        // Clear eBay tokens from localStorage
        localStorage.removeItem('ebay_user_token');
        localStorage.removeItem('ebay_refresh_token');

        // Update component state
        setEbayToken(null);
        setNeedsConnection(true);
        setListingsError(null);
      } else {
        console.error('Failed to logout from eBay:', response.error);
        setListingsError('Failed to disconnect eBay account');
      }
    } catch (error) {
      console.error('Error during eBay logout:', error);
      setListingsError('Error disconnecting eBay account');
    }
  };

  // 4) Normal dashboard rendering once we have "ebayToken"
  const isDashboard = location.pathname === '/home';
  const isCompetitors = location.pathname === '/home/competitors';
  const isPricingStrategies = location.pathname === '/home/pricing-strategies';

  // Reset to page 1 when switching views or reloading data
  const handleTotalPagesChange = (newTotalPages) => {
    setTotalPages(newTotalPages);
    // If current page is beyond new total pages, reset to page 1
    if (page > newTotalPages) {
      setPage(1);
    }
  };

  return (
    <>
      <Header handleLogout={handleLogout} handleEbayLogout={handleEbayLogout} />
      <NavTabs />

      {/* If you have nested routes under /home, render them here: */}
      <Outlet />

      {isDashboard && (
        <>
          <ListingsHeading />
          {loadingListings ? (
            <p style={{ textAlign: 'center', marginTop: '2rem' }}>
              Loading your eBay listings…⏳
            </p>
          ) : listingsError ? (
            <p style={{ textAlign: 'center', marginTop: '2rem', color: 'red' }}>
              Error loading listings: {listingsError}
            </p>
          ) : (
            <>
              <EntriesAndSearchBar />
              <ListingsTable
                currentPage={page}
                itemsPerPage={itemsPerPage}
                onTotalPagesChange={handleTotalPagesChange}
                mode="listings"
              />
              <PaginationBar
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}

      <Footer />
      <ScrollToTopButton />
    </>
  );
}
