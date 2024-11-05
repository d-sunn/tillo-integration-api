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
  
  // Ensure amount is a number with no decimal places if it's a whole number
  const formattedAmount = Number.isInteger(amount) ? amount.toString() : amount.toString();
  
  const signatureString = `${process.env.APIKEY}-POST-digital-issue-${clientRequestId}-${brand}-${formattedAmount}-${currency}-${timestamp}`;
  
  // Log for debugging
  console.log({
    signatureString,
    timestamp,
    apiKeyPresent: !!process.env.APIKEY,
    secretPresent: !!process.env.SECRET
  });
  
  return crypto
    .createHmac('sha256', process.env.SECRET)
    .update(signatureString)
    .digest('hex');
};

// Main endpoint for gift card issuance
app.post('/api/issue-gift-card', async (req, res) => {
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

    // Log request details for debugging
    console.log('Request details:', {
      amount,
      brandIdentifier,
      clientRequestId,
      currency,
      timestamp
    });

    const signature = generateSignature(
      clientRequestId,
      Array.isArray(brandIdentifier) ? brandIdentifier[0] : brandIdentifier,
      amount,
      currency,
      timestamp
    );

    // Log generated signature
    console.log('Generated signature:', signature);

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

    // Log the full request to Tillo
    console.log('Tillo request:', {
      url: TILLO_API_URL,
      headers: {
        'API-Key': process.env.APIKEY,
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
      status: error.response?.status,
      headers: error.response?.headers
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
