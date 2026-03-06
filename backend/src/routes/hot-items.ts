import { Router } from 'express';
import { getDb } from '../db';
import { resolveHotDate } from '../utils/hot-date';

const router = Router();

// Get today's hot items with catalog matches, talking points, cross-sells (UC1-5)
router.get('/today', async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];
    const hotDate = await resolveHotDate(db, today);

    if (!hotDate) {
      res.json({
        date: today,
        hot_items: [],
        summary_pitch: 'Focus on trending Asian staples today.',
      });
      return;
    }

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
        i.reorder_point,
        pp.pairing_reason,
        p2.name as paired_product_name,
        p2.sku as paired_sku,
        p2.unit_price as paired_price
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN product_pairings pp ON pp.id = (
        SELECT pp2.id
        FROM product_pairings pp2
        WHERE pp2.product_id = p.id
        ORDER BY pp2.id ASC
        LIMIT 1
      )
      LEFT JOIN products p2 ON pp.paired_product_id = p2.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC
    `, [hotDate]);

    // Build response with pairing info preloaded in the query (avoids N+1 queries).
    const result = [];
    for (const item of hotItems) {
      const crossSell = item.paired_product_name ? {
        product_name: item.paired_product_name,
        sku: item.paired_sku,
        price: item.paired_price,
        reason: item.pairing_reason
      } : null;

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
      date: hotDate,
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
