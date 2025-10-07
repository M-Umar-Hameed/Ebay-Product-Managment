#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function emergencyStop() {
  try {
    console.log('🚨 EXECUTING EMERGENCY STOP...');

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000';
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
      console.error('❌ API_KEY not found in environment variables');
      process.exit(1);
    }

    // Call emergency stop endpoint
    const response = await axios.post(
      `${baseUrl}/api/competitor-rules/emergency-stop`,
      {},
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('✅ Emergency stop response:', response.data);
    console.log('🛑 All services stopped successfully');
  } catch (error) {
    console.error(
      '❌ Emergency stop failed:',
      error.response?.data || error.message
    );

    // Fallback: try to kill the process
    console.log('🔄 Attempting process termination...');
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  emergencyStop();
}
