const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const TILLO_API_URL = 'https://sandbox.tillo.dev/api/v2/digital/issue';

// Utility function to generate signature string and hash it
const generateSignature = (clientRequestId, brand, amount, currency, timestamp) => {
  // For debugging
  console.log('Environment variables:', {
    apiKey: process.env.APIKEY, // Changed from API-Key to APIKEY
    hasSecret: !!process.env.SECRET
  });

  // Format: [api_key]-POST-digital-issue-[client_request_id]-[brand]-[amount]-[currency]-[timestamp]
  const signatureString = `${process.env.APIKEY}-POST-digital-issue-${clientRequestId}-${brand}-${amount}-${currency}-${timestamp}`;
  console.log('Generated signature string:', signatureString);
  
  return crypto
    .createHmac('sha256', process.env.SECRET)
    .update(signatureString)
    .digest('hex');
};

// Validate required fields middleware
const validateRequest = (req, res, next) => {
  const { amount, brandIdentifier, clientRequestId } = req.body;

  if (!amount || !brandIdentifier || !clientRequestId) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['amount', 'brandIdentifier', 'clientRequestId']
    });
  }
  next();
};

// Main endpoint for gift card issuance
app.post('/api/issue-gift-card', validateRequest, async (req, res) => {
  try {
    const timestamp = Date.now().toString();
    const {
      amount,
      brandIdentifier,
      clientRequestId,
      deliveryMethod = 'url',
      fulfilmentBy = 'partner',
      sector = 'marketplace',
      currency = 'USD',
      fulfilmentParameters
    } = req.body;

    // Generate signature according to Tillo's format
    const signature = generateSignature(
      clientRequestId,
      Array.isArray(brandIdentifier) ? brandIdentifier[0] : brandIdentifier,
      amount,
      currency,
      timestamp
    );

    // Construct request to Tillo
    const tilloRequest = {
      client_request_id: clientRequestId,
      choices: Array.isArray(brandIdentifier) ? brandIdentifier : [brandIdentifier],
      face_value: {
        amount: parseFloat(amount),
        currency: currency
      },
      delivery_method: deliveryMethod,
      fulfilment_by: fulfilmentBy,
      sector: sector
    };

    if (fulfilmentParameters) {
      tilloRequest.fulfilment_parameters = fulfilmentParameters;
    }

    // Make request to Tillo with exact headers they specify
    const tilloResponse = await axios({
      method: 'post',
      url: TILLO_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': process.env.APIKEY,  // Changed from API-Key to APIKEY
        'Signature': signature,
        'Timestamp': timestamp
      },
      data: tilloRequest
    });

    res.json(tilloResponse.data);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to process gift card request',
      details: error.response?.data || error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
