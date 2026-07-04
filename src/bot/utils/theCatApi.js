const axios = require('axios');

const THE_CAT_API_BASE_URL = 'https://api.thecatapi.com/v1';

const MIME_PRESETS = {
  gif: 'gif',
  static: 'jpg,png',
};

const fetchRandomImage = async ({ mimeTypes = 'gif', size = 'small', apiKey } = {}) => {
  const headers = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const { data } = await axios.get(`${THE_CAT_API_BASE_URL}/images/search`, {
    headers,
    params: {
      limit: 1,
      mime_types: mimeTypes,
      size,
    },
    timeout: 10000,
  });

  if (!Array.isArray(data) || !data[0]?.url) {
    throw new Error('Unexpected response from The Cat API');
  }

  return data[0];
};

module.exports = { fetchRandomImage, MIME_PRESETS };
