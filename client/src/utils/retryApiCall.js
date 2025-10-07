// Network retry utility for handling intermittent connection issues
export const retryApiCall = async (apiCall, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    backoffMultiplier = 2,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 Retry attempt ${attempt}/${maxRetries}`);

        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(backoffMultiplier, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));

        if (onRetry) {
          onRetry(attempt, lastError);
        }
      }

      const result = await apiCall();

      if (attempt > 0) {
        console.log(`✅ API call succeeded on attempt ${attempt + 1}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      console.warn(`❌ API call failed on attempt ${attempt + 1}:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
      });

      // Don't retry for certain types of errors
      const shouldNotRetry =
        error.response?.status === 401 || // Unauthorized
        error.response?.status === 403 || // Forbidden
        error.response?.status === 404 || // Not Found
        error.response?.status === 422 || // Validation Error
        error.message?.includes('abort'); // User aborted

      if (shouldNotRetry) {
        console.log('🚫 Not retrying due to error type');
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        console.error(`🚨 All ${maxRetries + 1} attempts failed`);
        throw error;
      }
    }
  }

  throw lastError;
};

// Wrapper for login API call with retry logic
export const retryLogin = async (credentials) => {
  return retryApiCall(() => apiService.auth.login(credentials), {
    maxRetries: 2,
    retryDelay: 2000,
    onRetry: (attempt, error) => {
      console.log(`🔄 Login retry ${attempt}: ${error.message}`);
    },
  });
};

export default retryApiCall;
