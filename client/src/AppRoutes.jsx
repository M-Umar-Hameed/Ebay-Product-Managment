// src/AppRoutes.jsx
import React, { useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';

import Login from './pages/Login';
import PopupCallback from './pages/PopupCallback';
import Home from './pages/Home';
import EditListing from './pages/EditListing';
import CompetitorDetails from './componentsForEditListing/CompetitorDetails';
import AddCompetitorManually from './componentsForEditListing/AddCompetitorManually';
import PriceStrategy from './pages/PriceStrategy';
import AddStrategy from './pages/AddStrategy';
import CompetitorRule from './pages/CompetitorRule';
import { userStore } from './store/authStore';
import getValidAuthToken from './utils/getValidAuthToken';
import CompetitorsPage from './pages/CompetitorsPage';
import PricingStrategiesPage from './pages/PricingStrategiesPage';
import EditStrategyPage from './pages/EditStrategyPage';
import EditCompetitorRulePage from './pages/EditCompetitorRulePage';

export default function AppRoutes() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const user = userStore((store) => store.user);
  const location = useLocation();

  useEffect(() => {
    // Only attempt to refresh eBay token if user is already logged in
    if (!user) return;
    if (
      location.pathname === '/login' ||
      location.pathname === '/auth/popup-callback'
    ) {
      return; // skip auto‐refresh on login or popup callback
    }
    (async () => {
      try {
        await getValidAuthToken(user.id);
      } catch (err) {
        console.warn(
          'Could not refresh eBay token. User may need to reconnect.'
        );
      }
    })();
  }, [location.pathname, user]);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    userStore.getState().clearUser();
    localStorage.removeItem('ebay_user_token');
    setIsLoggedIn(false);
  };

  return (
    <Routes>
      {/* If root, redirect based on login status */}
      <Route
        path="/"
        element={
          <Navigate to={isLoggedIn || user ? '/home' : '/login'} replace />
        }
      />

      {/* 1) Login (your existing username/password page) */}
      <Route path="/login" element={<Login handleLogin={handleLogin} />} />

      {/* 2) Popup callback—the very page eBay will redirect to after consent */}
      <Route path="/auth/popup-callback" element={<PopupCallback />} />

      {/* 3) Protected "Home" + nested children */}
      <Route
        path="/home"
        element={
          isLoggedIn || user ? (
            <Home handleLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route path="edit-listing" element={<EditListing />} />
        <Route path="update-strategy/:productId" element={<PriceStrategy />} />
        <Route path="competitors/:itemId" element={<CompetitorDetails />} />
        <Route
          path="add-competitor-manually/:itemId"
          element={<AddCompetitorManually />}
        />
        <Route path="add-strategy" element={<AddStrategy />} />
        <Route path="add-competitor-rule" element={<CompetitorRule />} />
        <Route path="competitors" element={<CompetitorsPage />} />
        <Route path="pricing-strategies" element={<PricingStrategiesPage />} />
        <Route
          path="edit-strategy/:strategyName"
          element={<EditStrategyPage />}
        />
        <Route
          path="edit-competitor-rule/:ruleName"
          element={<EditCompetitorRulePage />}
        />
      </Route>
    </Routes>
  );
}
