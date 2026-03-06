import { Router } from 'express';
import { getDb } from '../db';

const router = Router();

function readQueryString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
  }
  return '';
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = parseInt(readQueryString(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseOptionalId(value: unknown): number | null {
  const parsed = parseInt(readQueryString(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

// Get our Weee-listed products with ratings and sales
router.get('/our-listings', async (req, res) => {
  try {
    const db = await getDb();
    const { category, sort } = req.query;

    let query = `
      SELECT
        p.id, p.name, p.sku, p.category, p.unit_price,
        p.weee_url, p.weee_rating, p.weee_review_count, p.weee_weekly_sold, p.weee_price,
        i.quantity_on_hand, i.reorder_point
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE p.weee_listed = 1
    `;
    const params: any[] = [];

    if (category) {
      query += ' AND p.category = ?';
      params.push(category);
    }

    const sortField = sort === 'rating' ? 'p.weee_rating' :
                      sort === 'reviews' ? 'p.weee_review_count' :
                      sort === 'sold' ? 'p.weee_weekly_sold' :
                      'p.weee_weekly_sold';
    query += ` ORDER BY ${sortField} DESC`;

    const listings = await db.all(query, params);

    // Get aggregate stats
    const stats = await db.get(`
      SELECT
        COUNT(*) as total_listings,
        AVG(weee_rating) as avg_rating,
        SUM(weee_review_count) as total_reviews,
        SUM(weee_weekly_sold) as total_weekly_sold
      FROM products
      WHERE weee_listed = 1
    `);

    res.json({
      listings,
      stats: {
        total_listings: (stats as any)?.total_listings || 0,
        avg_rating: Math.round(((stats as any)?.avg_rating || 0) * 10) / 10,
        total_reviews: (stats as any)?.total_reviews || 0,
        total_weekly_sold: (stats as any)?.total_weekly_sold || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching Weee listings:', error);
    res.status(500).json({ error: 'Failed to fetch Weee listings' });
  }
});

// Get reviews with flexible filters
router.get('/reviews', async (req, res) => {
  try {
    const db = await getDb();
    const productId = parseOptionalId(req.query.product_id);
    const productName = readQueryString(req.query.product_name);
    const limit = parsePositiveInt(req.query.limit, 5, 1, 20);

    let product: any = null;

    if (productId) {
      product = await db.get(`
        SELECT id, name, sku, weee_rating, weee_review_count
        FROM products
        WHERE id = ? AND weee_listed = 1
      `, [productId]);
    }

    if (!product && productName) {
      product = await db.get(`
        SELECT id, name, sku, weee_rating, weee_review_count
        FROM products
        WHERE weee_listed = 1
          AND LOWER(name) LIKE LOWER(?)
        ORDER BY
          CASE WHEN LOWER(name) = LOWER(?) THEN 0 ELSE 1 END,
          weee_review_count DESC
        LIMIT 1
      `, [`%${productName}%`, productName]);
    }

    if (product) {
      const reviews = await db.all(`
        SELECT
          wr.id, wr.product_id, p.name, p.sku, p.weee_rating, p.weee_review_count,
          wr.reviewer_name, wr.rating, wr.comment, wr.review_date, wr.verified_buyer
        FROM weee_reviews wr
        JOIN products p ON wr.product_id = p.id
        WHERE wr.product_id = ?
        ORDER BY wr.review_date DESC, wr.id DESC
        LIMIT ?
      `, [(product as any).id, limit]);

      return res.json({
        product,
        reviews,
        filters: {
          product_id: (product as any).id,
          product_name: (product as any).name,
          limit,
        },
      });
    }

    const reviews = await db.all(`
      SELECT
        wr.id, wr.product_id, p.name, p.sku, p.weee_rating, p.weee_review_count,
        wr.reviewer_name, wr.rating, wr.comment, wr.review_date, wr.verified_buyer
      FROM weee_reviews wr
      JOIN products p ON wr.product_id = p.id
      ORDER BY wr.review_date DESC, wr.id DESC
      LIMIT ?
    `, [limit]);

    res.json({
      product: null,
      reviews,
      filters: {
        product_id: productId,
        product_name: productName || null,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get reviews for a specific product
router.get('/reviews/:productId', async (req, res) => {
  try {
    const db = await getDb();
    const { productId } = req.params;

    const product = await db.get(`
      SELECT id, name, sku, weee_rating, weee_review_count
      FROM products WHERE id = ? AND weee_listed = 1
    `, [productId]);

    if (!product) {
      return res.status(404).json({ error: 'Product not found on Weee' });
    }

    const reviews = await db.all(`
      SELECT * FROM weee_reviews
      WHERE product_id = ?
      ORDER BY review_date DESC
    `, [productId]);

    res.json({
      product,
      reviews,
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get Weee sales trends (top movers)
router.get('/trends', async (req, res) => {
  try {
    const db = await getDb();

    const topByRating = await db.all(`
      SELECT id, name, sku, category, weee_rating, weee_review_count, weee_weekly_sold
      FROM products WHERE weee_listed = 1
      ORDER BY weee_rating DESC LIMIT 5
    `);

    const topBySales = await db.all(`
      SELECT id, name, sku, category, weee_rating, weee_review_count, weee_weekly_sold
      FROM products WHERE weee_listed = 1
      ORDER BY weee_weekly_sold DESC LIMIT 5
    `);

    const topByReviews = await db.all(`
      SELECT id, name, sku, category, weee_rating, weee_review_count, weee_weekly_sold
      FROM products WHERE weee_listed = 1
      ORDER BY weee_review_count DESC LIMIT 5
    `);

    res.json({
      top_rated: topByRating,
      top_selling: topBySales,
      most_reviewed: topByReviews,
    });
  } catch (error) {
    console.error('Error fetching Weee trends:', error);
    res.status(500).json({ error: 'Failed to fetch Weee trends' });
  }
});

export default router;
