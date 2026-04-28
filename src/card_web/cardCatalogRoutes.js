const express = require('express');
const logger = require('../../libs/logger');
const {
  parseListQuery,
  listCards,
  getCardByUuid,
  getFacetMeta,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./tcgCatalogService');

const router = express.Router();

router.get('/tcg/cards', async (req, res, next) => {
  try {
    const facetMeta = await getFacetMeta();
    res.render('tcgCardCatalog', {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
      docYear: new Date().getFullYear(),
      facetMeta,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/tcg/cards/meta', async (req, res) => {
  try {
    const meta = await getFacetMeta();
    res.json(meta);
  } catch (err) {
    logger.error('tcg catalog meta failed', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/tcg/cards', async (req, res) => {
  try {
    const filters = parseListQuery(req);
    const payload = await listCards(filters);
    res.json(payload);
  } catch (err) {
    logger.error('tcg catalog list failed', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/tcg/cards/:uuid', async (req, res) => {
  try {
    const card = await getCardByUuid(req.params.uuid);
    if (!card) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(card);
  } catch (err) {
    logger.error('tcg catalog get card failed', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
