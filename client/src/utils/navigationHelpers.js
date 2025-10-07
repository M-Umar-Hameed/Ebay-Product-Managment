/**
 * Navigation helpers for product actions
 */

export const navigateToStrategyForm = (itemId, options = {}) => {
  const {
    newTab = false,
    tab = 'strategy',
    returnUrl = window.location.pathname,
  } = options;

  const url = `/edit-listing/${itemId}?tab=${tab}&return=${encodeURIComponent(
    returnUrl
  )}`;

  if (newTab) {
    window.open(url, '_blank');
  } else {
    window.location.href = url;
  }
};

export const navigateToCompetitorDetails = (itemId, options = {}) => {
  const {
    newTab = false,
    tab = 'competitors',
    returnUrl = window.location.pathname,
  } = options;

  const url = `/edit-listing/${itemId}?tab=${tab}&return=${encodeURIComponent(
    returnUrl
  )}`;

  if (newTab) {
    window.open(url, '_blank');
  } else {
    window.location.href = url;
  }
};

export const navigateToPricingStrategies = (itemId = null, options = {}) => {
  const { newTab = false } = options;

  const url = itemId ? `/pricing-strategies/${itemId}` : '/pricing-strategies';

  if (newTab) {
    window.open(url, '_blank');
  } else {
    window.location.href = url;
  }
};

export const navigateToCompetitorsPage = (itemId = null, options = {}) => {
  const { newTab = false } = options;

  const url = itemId ? `/competitors/${itemId}` : '/competitors';

  if (newTab) {
    window.open(url, '_blank');
  } else {
    window.location.href = url;
  }
};

// Route detection helpers
export const getCurrentPage = () => {
  const path = window.location.pathname;

  if (path.includes('/home')) return 'home';
  if (path.includes('/edit-listing')) return 'edit-listing';
  if (path.includes('/pricing-strategies')) return 'pricing-strategies';
  if (path.includes('/competitors')) return 'competitors';

  return 'unknown';
};

export const getItemIdFromUrl = () => {
  const path = window.location.pathname;
  const segments = path.split('/');

  // For routes like /edit-listing/:itemId or /competitors/:itemId
  if (segments.length >= 3) {
    return segments[2];
  }

  return null;
};

// Context-aware navigation
export const navigateBasedOnContext = (itemId, action, options = {}) => {
  const currentPage = getCurrentPage();

  switch (action) {
    case 'strategy':
      if (currentPage === 'home') {
        navigateToStrategyForm(itemId, { tab: 'strategy', ...options });
      } else {
        navigateToPricingStrategies(itemId, options);
      }
      break;

    case 'competitor':
      if (currentPage === 'home') {
        navigateToCompetitorDetails(itemId, { tab: 'competitors', ...options });
      } else {
        navigateToCompetitorsPage(itemId, options);
      }
      break;

    default:
      console.warn(`Unknown action: ${action}`);
  }
};
