const axios = require('axios');
const crypto = require('crypto');
const config = require('../.config');

class KrakenPayment {
    constructor() {
        this.apiKey = config.kraken.api_key;
        this.apiSecret = config.kraken.api_secret;
        this.apiUrl = config.kraken.api_url;
    }

    // Helper function to create Kraken API signature
    _getKrakenSignature(path, request, nonce) {
        const message = nonce + JSON.stringify(request);
        const secret = Buffer.from(this.apiSecret, 'base64');
        const hash = crypto.createHash('sha256').update(nonce + message).digest();
        const hmac = crypto.createHmac('sha512', secret)
            .update(path + hash)
            .digest('base64');
        return hmac;
    }

    // Send request to Kraken API
    async _krakenRequest(method, endpoint, params = {}) {
        const path = `/0/private/${endpoint}`;
        const url = `${this.apiUrl}${path}`;
        const nonce = Date.now() * 1000; // Kraken nonce must increase with each request

        const body = {
            nonce,
            ...params
        };

        const signature = this._getKrakenSignature(path, body, nonce);

        const headers = {
            'API-Key': this.apiKey,
            'API-Sign': signature,
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        try {
            const response = await axios.post(url, new URLSearchParams(body), { headers });
            return response.data;
        } catch (error) {
            console.error('Kraken API Error:', error.response.data);
            throw new Error('API request failed');
        }
    }

    // Start transaction by generating a wallet address
    async startTransaction(currency) {
        try {
            // Get deposit method
            const depositMethods = await this._krakenRequest('POST', 'DepositMethods', {
                asset: currency
            });

            if (depositMethods.error.length) {
                throw new Error(depositMethods.error.join(', '));
            }

            const method = depositMethods.result[0].method;

            // Get deposit address for the asset
            const depositAddress = await this._krakenRequest('POST', 'DepositAddresses', {
                asset: currency,
                method: method
            });

            if (depositAddress.error.length) {
                throw new Error(depositAddress.error.join(', '));
            }

            return depositAddress.result[0].address; // Wallet address to display to user
        } catch (error) {
            console.error('Error starting transaction:', error.message);
            return null;
        }
    }

    // Check if payment has been received
    async checkPaymentStatus(currency) {
        try {
            const ledgerEntries = await this._krakenRequest('POST', 'Ledgers', {
                asset: currency,
                type: 'deposit'
            });

            if (ledgerEntries.error.length) {
                throw new Error(ledgerEntries.error.join(', '));
            }

            // Iterate over ledger entries to check if payment has been received
            for (let ledger of Object.values(ledgerEntries.result.ledger)) {
                if (ledger.asset === currency && ledger.type === 'deposit') {
                    return ledger.amount; // Payment received
                }
            }

            return false; // Payment not yet received
        } catch (error) {
            console.error('Error checking payment status:', error.message);
            return false;
        }
    }
}
