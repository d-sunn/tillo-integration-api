const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

// Utility function to generate HMAC signature
const generateSignature = (apiKey, clientRequestId, brandIdentifier, amount, currency, timestamp) => {
    const signatureString = `${apiKey}-POST-digital-issue-${clientRequestId}-${brandIdentifier}-${amount}-${currency}-${timestamp}`;
    return crypto
        .createHmac('sha256', process.env.TILLO_SECRET_KEY)
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

        // Generate signature
        const signature = generateSignature(
            process.env.TILLO_API_KEY,
            clientRequestId,
            brandIdentifier,
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

        // Add fulfilment parameters if provided
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
