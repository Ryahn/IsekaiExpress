const axios = require('axios');

const NEKOS_BEST_BASE_URL = 'https://nekos.best/api/v2';

const fetchRandom = async (endpoint) => {
  const safeEndpoint = encodeURIComponent(endpoint);
  const { data } = await axios.get(`${NEKOS_BEST_BASE_URL}/${safeEndpoint}`);

  if (!data || !Array.isArray(data.results) || !data.results[0]?.url) {
    throw new Error(`Unexpected response from nekos.best for ${endpoint}`);
  }

  return data;
};

module.exports = { fetchRandom };
