import { Router } from 'express';
import { getDb } from '../db';

const router = Router();

// Get today's hot items with catalog matches, talking points, cross-sells (UC1-5)
router.get('/today', async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];

    const hotItems = await db.all(`
      SELECT
        h.id,
        h.weee_rank,
        h.weee_product_name,
        h.weee_category,
        h.weee_image_url,
        h.match_type,
        h.match_notes,
        h.talking_point,
        h.universal_pitch,
        p.id as product_id,
        p.name as our_product_name,
        p.sku as our_sku,
        p.unit_price as our_price,
        p.weee_rating,
        p.weee_review_count,
        p.weee_weekly_sold,
        i.quantity_on_hand,
        i.reorder_point
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC
    `, [today]);

    // For each hot item with a match, get cross-sell pairings
    const result = [];
    for (const item of hotItems) {
      let crossSell = null;
      if (item.product_id) {
        const pairing = await db.get(`
          SELECT pp.pairing_reason, p2.name as paired_product_name, p2.sku as paired_sku, p2.unit_price as paired_price
          FROM product_pairings pp
          JOIN products p2 ON pp.paired_product_id = p2.id
          WHERE pp.product_id = ?
          LIMIT 1
        `, [item.product_id]);
        if (pairing) {
          crossSell = {
            product_name: pairing.paired_product_name,
            sku: pairing.paired_sku,
            price: pairing.paired_price,
            reason: pairing.pairing_reason
          };
        }
      }

      result.push({
        rank: item.weee_rank,
        weee_product_name: item.weee_product_name,
        weee_category: item.weee_category,
        match_type: item.match_type,
        match_notes: item.match_notes,
        talking_point: item.talking_point,
        universal_pitch: item.universal_pitch,
        our_product: item.product_id ? {
          id: item.product_id,
          name: item.our_product_name,
          sku: item.our_sku,
          price: item.our_price,
          quantity_on_hand: item.quantity_on_hand,
          reorder_point: item.reorder_point,
          weee_rating: item.weee_rating,
          weee_review_count: item.weee_review_count,
          weee_weekly_sold: item.weee_weekly_sold,
        } : null,
        cross_sell: crossSell,
      });
    }

    // Build a summary pitch from the first universal_pitch
    const pitches = hotItems.map((h: any) => h.universal_pitch).filter(Boolean);
    const summaryPitch = pitches[0] || 'Focus on trending Asian staples today.';

    res.json({
      date: today,
      hot_items: result,
      summary_pitch: summaryPitch,
    });
  } catch (error) {
    console.error('Error fetching hot items:', error);
    res.status(500).json({ error: 'Failed to fetch hot items' });
  }
});

// Get hot items history (last 7 days)
router.get('/history', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.all(`
      SELECT
        h.weee_date,
        h.weee_rank,
        h.weee_product_name,
        h.weee_category,
        h.match_type,
        p.name as our_product_name
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      ORDER BY h.weee_date DESC, h.weee_rank ASC
      LIMIT 35
    `);
    res.json(result);
  } catch (error) {
    console.error('Error fetching hot items history:', error);
    res.status(500).json({ error: 'Failed to fetch hot items history' });
  }
});

export default router;
