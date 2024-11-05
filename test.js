const axios = require('axios');
require('dotenv').config();

const TEST_CASES = [
    {
        name: 'Basic Gift Card Request',
        data: {
            amount: 10.00,
            brandIdentifier: ['auto-zone-usa'],
            clientRequestId: `test-${Date.now()}`,
            fulfilmentParameters: {
                to_first_name: "Test",
                to_last_name: "User",
                address_1: "123 Test St",
                city: "Test City",
                postal_code: "12345",
                country: "USA",
                language: "en",
                customer_id: `test-customer-${Date.now()}`
            }
        }
    }
];

async function runTests() {
    console.log('🚀 Starting API tests...\n');

    for (const test of TEST_CASES) {
        console.log(`Testing: ${test.name}`);
        try {
            const response = await axios.post(
                'http://localhost:3000/api/issue-gift-card',
                test.data,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log('✅ Test passed!');
            console.log('Response:', JSON.stringify(response.data, null, 2));
        } catch (error) {
            console.log('❌ Test failed!');
            console.log('Error:', error.response?.data || error.message);
        }
        console.log('\n-------------------\n');
    }
}

runTests().catch(console.error);
