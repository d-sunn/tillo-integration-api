const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const TILLO_API_URL = 'https://sandbox.tillo.dev/api/v2/digital/issue';

// Utility function to generate signature string and hash it
const generateSignature = (clientRequestId, brand, amount, currency, timestamp) => {
  // Format EXACTLY as per Tillo docs:
  // [api_key]-POST-digital-issue-[client_request_id]-[brand]-[amount]-[currency]-[timestamp]
  const signatureString = `${process.env.APIKEY}-POST-digital-issue-${clientRequestId}-${brand}-${amount}-${currency}-${timestamp}`;
  
  console.log('Signature components:', {
    apiKey: process.env.APIKEY?.substring(0, 8) + '...',  // Show first 8 chars only
    clientRequestId,
    brand,
    amount,
    currency,
    timestamp
  });
  
  console.log('Full signature string:', signatureString);
  
  return crypto
    .createHmac('sha256', process.env.SECRET)
    .update(signatureString)
    .digest('hex');
};

// Main endpoint for gift card issuance
app.post('/api/issue-gift-card', async (req, res) => {
  try {
    const timestamp = Date.now().toString(); // Current time in milliseconds
    
    const {
      amount = 20,  // Default amount if not provided
      brand = 'amazon',  // Default brand if not provided
      currency = 'USD',  // Default to USD
      client_request_id,  // Using the UUID from your request
      fulfilmentParameters
    } = req.body;

    // Validate client_request_id is provided
    if (!client_request_id) {
      return res.status(400).json({
        error: 'Missing required field',
        details: 'client_request_id is required'
      });
    }

    const signature = generateSignature(
      client_request_id,
      brand,
      amount,
      currency,
      timestamp
    );

    const tilloRequest = {
      "client_request_id": client_request_id,
      "brand": brand,
      "face_value": {
        "amount": amount,
        "currency": currency
      },
      "delivery_method": "url",
      "fulfilment_by": "partner",
      "sector": "marketplace"  // Set specifically for US/marketplace
    };

    if (fulfilmentParameters) {
      tilloRequest.fulfilment_parameters = fulfilmentParameters;
    }

    console.log('Full Tillo request:', {
      url: TILLO_API_URL,
      headers: {
        'API-Key': process.env.APIKEY?.substring(0, 8) + '...',
        'Signature': signature,
        'Timestamp': timestamp
      },
      body: tilloRequest
    });

    const tilloResponse = await axios({
      method: 'post',
      url: TILLO_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': process.env.APIKEY,
        'Signature': signature,
        'Timestamp': timestamp
      },
      data: tilloRequest
    });

    res.json(tilloResponse.data);

  } catch (error) {
    console.error('Error details:', {
      response: error.response?.data,
      status: error.response?.status
    });
    
    res.status(error.response?.status || 500).json({
      error: 'Failed to process gift card request',
      details: error.response?.data || error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
