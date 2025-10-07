// src/pages/PopupCallback.jsx
import React, { useEffect, useState } from 'react';

export default function PopupCallback() {
  const [error, setError] = useState(null);

  useEffect(() => {
    let code, state, expiresIn;

    const params = new URLSearchParams(window.location.search);
    code = params.get('code');
    state = params.get('state');
    expiresIn = params.get('expires_in');

    if (!code && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      code = hashParams.get('code');
      state = hashParams.get('state');
      expiresIn = hashParams.get('expires_in');
    }

  

    if (!code) {
      setError(
        'OAuth code not found in URL. Authorization failed or was cancelled.'
      );
      return;
    }

    try {
      if (window.opener && typeof window.opener.postMessage === 'function') {
        window.opener.postMessage(
          { code, state, expires_in: expiresIn },
          window.location.origin
        );
        window.close();
      } else {
        console.error('[PopupCallback] window.opener is null or invalid');
        setError('Unable to communicate with parent window. Please try again.');
      }
    } catch (err) {
      console.error('[PopupCallback] Error posting message to opener:', err);
    }
  }, []);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      {error ? (
        <>
          <h2 style={{ color: 'red' }}>OAuth Error</h2>
          <p>{error}</p>
          <p>You may now close this window.</p>
        </>
      ) : (
        <>
          <h2>Authorization Complete</h2>
          <p>If this window does not close on its own, please close it.</p>
        </>
      )}
    </div>
  );
}
