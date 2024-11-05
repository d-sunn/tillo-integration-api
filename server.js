const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
require('dotenv').config();

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);

// Tillo API error codes and messages
const TILLO_ERROR_CODES = {
  'INVALID_SIGNATURE': 'The provided signature is invalid',
  'INVALID_TIMESTAMP': 'The timestamp is invalid or expired',
  'INSUFFICIENT_FUNDS': 'Insufficient funds for this transaction',
  'BRAND_NOT_AVAILABLE': 'The requested brand is not available',
  'INVALID_FACE_VALUE': 'The face value is invalid for this brand'
};

// Utility function to generate HMAC signature
const generateSignature = (apiKey, clientRequestId, brandIdentifier, amount, currency, timestamp) => {
  const signatureString = `${apiKey}-POST-digital-issue-${clientRequestId}-${brandIdentifier}-${amount}-${currency}-${timestamp}`;
  return crypto
    .createHmac('sha256', process.env.TILLO_SECRET_KEY)
    .update(signatureString)
    .digest('hex');
};

// Enhanced request validation middleware
const validateRequest = (req, res, next) => {
  const { amount, brandIdentifier, clientRequestId, fulfilmentParameters } = req.body;

  const errors = [];

  if (!amount) errors.push('amount is required');
  else if (typeof amount !== 'number' || amount <= 0) errors.push('amount must be a positive number');

  if (!brandIdentifier) errors.push('brandIdentifier is required');
  else if (!Array.isArray(brandIdentifier) && typeof brandIdentifier !== 'string') {
    errors.push('brandIdentifier must be a string or array of strings');
  }

  if (!clientRequestId) errors.push('clientRequestId is required');
  else if (typeof clientRequestId !== 'string') errors.push('clientRequestId must be a string');

  if (fulfilmentParameters) {
    const requiredParams = ['to_first_name', 'to_last_name', 'address_1', 'city', 'postal_code', 'country'];
    for (const param of requiredParams) {
      if (!fulfilmentParameters[param]) {
        errors.push(`fulfilmentParameters.${param} is required`);
      }
    }
  }

  if (errors.length > 0) {
    logger.warn('Validation failed', { errors, body: req.body });
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Main endpoint for gift card issuance
app.post('/api/issue-gift-card', validateRequest, async (req, res) => {
  const requestId = crypto.randomBytes(16).toString('hex');
  
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

    logger.info('Processing gift card request', {
      requestId,
      clientRequestId,
      brandIdentifier
    });

    // Generate signature
    const signature = generateSignature(
      process.env.TILLO_API_KEY,
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

    // Make request to Tillo
    const tilloResponse = await axios({
      method: 'post',
      url: process.env.TILLO_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': process.env.TILLO_API_KEY,
        'Signature': signature,
        'Timestamp': timestamp
      },
      data: tilloRequest
    });

    logger.info('Gift card request successful', {
      requestId,
      clientRequestId
    });

    res.json(tilloResponse.data);

  } catch (error) {
    logger.error('Gift card request failed', {
      requestId,
      error: error.message,
      response: error.response?.data,
      stack: error.stack
    });

    // Handle Tillo specific errors
    if (error.response?.data?.error_code && TILLO_ERROR_CODES[error.response.data.error_code]) {
      return res.status(error.response.status).json({
        error: TILLO_ERROR_CODES[error.response.data.error_code],
        error_code: error.response.data.error_code,
        requestId
      });
    }

    // Handle network or other errors
    res.status(error.response?.status || 500).json({
      error: 'Failed to process gift card request',
      details: error.response?.data || error.message,
      requestId
    });
  }
});

// Health check endpoint with enhanced monitoring
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
  
  logger.info('Health check performed', health);
  res.json(health);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Performing graceful shutdown...');
  server.close(() => {
    logger.info('Server shut down complete');
    process.exit(0);
  });
});
