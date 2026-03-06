import { Router } from 'express';
import { getDb } from '../db';

const router = Router();

// UC6: Top-selling SKUs by territory
router.get('/top-skus', async (req, res) => {
  try {
    const db = await getDb();
    const territory = req.query.territory as string || 'Chicago/Midwest';
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 10;

    const topSkus = await db.all(`
      SELECT
        p.id as product_id,
        p.name,
        p.sku,
        p.category,
        p.unit_price,
        SUM(sh.quantity_sold) as total_qty,
        SUM(sh.revenue) as total_revenue,
        i.quantity_on_hand,
        i.reorder_point
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      JOIN customers c ON sh.customer_id = c.id
      JOIN inventory i ON p.id = i.product_id
      WHERE c.territory = ?
        AND sh.sale_date >= date('now', '-' || ? || ' days')
        AND sh.was_out_of_stock = 0
      GROUP BY p.id
      ORDER BY total_revenue DESC
      LIMIT ?
    `, [territory, days, limit]);

    // Add priority scores and ranks
    const ranked = topSkus.map((sku: any, idx: number) => ({
      rank: idx + 1,
      ...sku,
      total_revenue: Math.round(sku.total_revenue * 100) / 100,
      priority_score: (idx < 3 && sku.quantity_on_hand <= sku.reorder_point)
        ? 'restock_needed'
        : (idx < 3 ? 'high' : 'normal'),
    }));

    res.json({
      territory,
      days,
      top_skus: ranked,
      priority_picks: ranked.slice(0, 3),
    });
  } catch (error) {
    console.error('Error fetching top SKUs:', error);
    res.status(500).json({ error: 'Failed to fetch top SKUs' });
  }
});

// UC7: Category trend comparison vs peers
router.get('/category-trends', async (req, res) => {
  try {
    const db = await getDb();
    const customerId = parseInt(req.query.customer_id as string) || 1;
    const days = parseInt(req.query.days as string) || 30;

    // Get customer info
    const customer = await db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Customer's category sales
    const customerCategories = await db.all(`
      SELECT p.category,
        SUM(sh.quantity_sold) as qty,
        SUM(sh.revenue) as revenue
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      WHERE sh.customer_id = ?
        AND sh.sale_date >= date('now', '-' || ? || ' days')
        AND sh.was_out_of_stock = 0
      GROUP BY p.category
      ORDER BY revenue DESC
    `, [customerId, days]);

    // Peer average (same store_type)
    const peerCategories = await db.all(`
      SELECT sub.category,
        AVG(sub.customer_revenue) as avg_revenue
      FROM (
        SELECT sh.customer_id, p.category, SUM(sh.revenue) as customer_revenue
        FROM sales_history sh
        JOIN products p ON sh.product_id = p.id
        JOIN customers c ON sh.customer_id = c.id
        WHERE c.store_type = ?
          AND c.id != ?
          AND sh.sale_date >= date('now', '-' || ? || ' days')
          AND sh.was_out_of_stock = 0
        GROUP BY sh.customer_id, p.category
      ) sub
      GROUP BY sub.category
    `, [(customer as any).store_type, customerId, days]);

    // Build peer lookup
    const peerMap: Record<string, number> = {};
    for (const pc of peerCategories) {
      peerMap[(pc as any).category] = (pc as any).avg_revenue;
    }

    // Calculate trends
    const trends = customerCategories.map((cc: any) => {
      const peerAvg = peerMap[cc.category] || cc.revenue;
      const trendPct = peerAvg > 0 ? ((cc.revenue - peerAvg) / peerAvg) * 100 : 0;
      return {
        category: cc.category,
        customer_revenue: Math.round(cc.revenue * 100) / 100,
        peer_avg_revenue: Math.round(peerAvg * 100) / 100,
        trend_pct: Math.round(trendPct * 10) / 10,
        direction: trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'flat',
      };
    });

    const trendingUp = trends.filter((t: any) => t.direction === 'up').sort((a: any, b: any) => b.trend_pct - a.trend_pct);
    const trendingDown = trends.filter((t: any) => t.direction === 'down').sort((a: any, b: any) => a.trend_pct - b.trend_pct);

    // Get recommendations from trending-up categories
    const topCategories = trendingUp.slice(0, 2).map((t: any) => t.category);
    let recommendations: any[] = [];
    if (topCategories.length > 0) {
      const placeholders = topCategories.map(() => '?').join(',');
      recommendations = await db.all(`
        SELECT p.id, p.name, p.sku, p.category, p.unit_price, i.quantity_on_hand
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        WHERE p.category IN (${placeholders})
        ORDER BY i.quantity_on_hand DESC
        LIMIT 3
      `, topCategories);
    }

    res.json({
      customer: { id: customer.id, name: customer.name, store_type: customer.store_type, territory: customer.territory },
      trends,
      trending_up: trendingUp,
      trending_down: trendingDown,
      recommendations,
    });
  } catch (error) {
    console.error('Error fetching category trends:', error);
    res.status(500).json({ error: 'Failed to fetch category trends' });
  }
});

// UC8: Back-in-stock alerts
router.get('/back-in-stock-alerts', async (req, res) => {
  try {
    const db = await getDb();
    const daysLookback = parseInt(req.query.days_lookback as string) || 14;

    // Find products that had OOS events and are now back in stock
    const alerts = await db.all(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        i.quantity_on_hand,
        i.reorder_point,
        c.id as customer_id,
        c.name as customer_name,
        c.territory,
        c.account_manager,
        c.phone,
        SUM(CASE WHEN sh.was_out_of_stock = 1 THEN 1 ELSE 0 END) as oos_days,
        SUM(CASE WHEN sh.was_out_of_stock = 0 THEN sh.revenue ELSE 0 END) as normal_revenue,
        COUNT(CASE WHEN sh.was_out_of_stock = 0 THEN 1 END) as normal_days
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      JOIN customers c ON sh.customer_id = c.id
      JOIN inventory i ON p.id = i.product_id
      WHERE sh.sale_date >= date('now', '-' || ? || ' days')
      GROUP BY p.id, c.id
      HAVING oos_days > 0 AND i.quantity_on_hand > 0
      ORDER BY oos_days DESC, normal_revenue DESC
    `, [daysLookback]);

    // Group by product
    const productMap: Record<number, any> = {};
    for (const alert of alerts) {
      const a = alert as any;
      if (!productMap[a.product_id]) {
        productMap[a.product_id] = {
          product: {
            id: a.product_id,
            name: a.product_name,
            sku: a.sku,
            quantity_on_hand: a.quantity_on_hand,
            reorder_point: a.reorder_point,
          },
          affected_customers: [],
        };
      }

      const avgDailyRevenue = a.normal_days > 0 ? a.normal_revenue / a.normal_days : 0;
      const estimatedLostRevenue = Math.round(avgDailyRevenue * a.oos_days * 100) / 100;

      productMap[a.product_id].affected_customers.push({
        customer_id: a.customer_id,
        customer_name: a.customer_name,
        territory: a.territory,
        account_manager: a.account_manager,
        phone: a.phone,
        oos_days: a.oos_days,
        estimated_lost_revenue: estimatedLostRevenue,
        call_priority: a.oos_days >= 3 ? 'high' : 'medium',
      });
    }

    res.json({
      alerts: Object.values(productMap),
    });
  } catch (error) {
    console.error('Error fetching back-in-stock alerts:', error);
    res.status(500).json({ error: 'Failed to fetch back-in-stock alerts' });
  }
});

// Invoice detail lookup (by invoice number or ID; falls back to highest-priority open invoice)
router.get('/invoices/detail', async (req, res) => {
  try {
    const db = await getDb();
    const invoiceNumber = (req.query.invoice_number as string || '').trim();
    const invoiceId = parseInt(req.query.invoice_id as string, 10);

    const baseSelect = `
      SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.amount,
        i.balance_due,
        i.status,
        i.paid_date,
        i.assigned_to,
        i.follow_up_note,
        c.id as customer_id,
        c.name as customer_name,
        c.territory,
        c.account_manager,
        c.phone,
        CAST(julianday('now') - julianday(i.due_date) AS INTEGER) as days_overdue,
        CAST(julianday(i.due_date) - julianday('now') AS INTEGER) as days_until_due
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
    `;

    let invoice: any = null;

    if (Number.isFinite(invoiceId) && invoiceId > 0) {
      invoice = await db.get(
        `${baseSelect}
         WHERE i.id = ?
         LIMIT 1`,
        [invoiceId]
      );
    } else if (invoiceNumber) {
      invoice = await db.get(
        `${baseSelect}
         WHERE LOWER(i.invoice_number) LIKE LOWER(?)
         ORDER BY CASE WHEN LOWER(i.invoice_number) = LOWER(?) THEN 0 ELSE 1 END, i.due_date ASC
         LIMIT 1`,
        [`%${invoiceNumber}%`, invoiceNumber]
      );
    } else {
      invoice = await db.get(
        `${baseSelect}
         WHERE i.balance_due > 0
         ORDER BY i.due_date ASC, i.balance_due DESC
         LIMIT 1`
      );
    }

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice });
  } catch (error) {
    console.error('Error fetching invoice detail:', error);
    res.status(500).json({ error: 'Failed to fetch invoice detail' });
  }
});

// Invoice summary and follow-up queue
router.get('/invoices/overview', async (req, res) => {
  try {
    const db = await getDb();
    const dueSoonDays = parseInt(req.query.due_soon_days as string) || 7;
    const limit = parseInt(req.query.limit as string) || 5;

    const summary = await db.get(`
      SELECT
        COUNT(*) as total_invoices,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(balance_due), 0) as open_balance,
        COALESCE(SUM(CASE WHEN balance_due > 0 AND due_date < date('now') THEN balance_due ELSE 0 END), 0) as overdue_balance,
        COALESCE(SUM(CASE
          WHEN balance_due > 0
           AND due_date >= date('now')
           AND due_date <= date('now', '+' || ? || ' days')
          THEN balance_due ELSE 0 END), 0) as due_soon_balance,
        COUNT(CASE WHEN balance_due > 0 AND due_date < date('now') THEN 1 END) as overdue_count,
        COUNT(CASE
          WHEN balance_due > 0
           AND due_date >= date('now')
           AND due_date <= date('now', '+' || ? || ' days')
          THEN 1 END) as due_soon_count,
        COUNT(CASE WHEN balance_due <= 0 THEN 1 END) as paid_count
      FROM invoices
    `, [dueSoonDays, dueSoonDays]) as any;

    const latePayments = await db.all(`
      SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.amount,
        i.balance_due,
        i.status,
        i.assigned_to,
        i.follow_up_note,
        c.id as customer_id,
        c.name as customer_name,
        c.territory,
        c.account_manager,
        c.phone,
        CAST(julianday('now') - julianday(i.due_date) AS INTEGER) as days_overdue
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.balance_due > 0 AND i.due_date < date('now')
      ORDER BY days_overdue DESC, i.balance_due DESC
      LIMIT ?
    `, [limit]);

    const dueSoon = await db.all(`
      SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.amount,
        i.balance_due,
        i.status,
        i.assigned_to,
        i.follow_up_note,
        c.id as customer_id,
        c.name as customer_name,
        c.territory,
        c.account_manager,
        c.phone,
        CAST(julianday(i.due_date) - julianday('now') AS INTEGER) as days_until_due
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.balance_due > 0
        AND i.due_date >= date('now')
        AND i.due_date <= date('now', '+' || ? || ' days')
      ORDER BY days_until_due ASC, i.balance_due DESC
      LIMIT ?
    `, [dueSoonDays, limit]);

    const followUps = [
      ...(latePayments as any[]).map((i) => ({
        ...i,
        follow_up_priority: i.days_overdue >= 14 ? 'high' : 'medium',
        recommended_action: i.days_overdue >= 14
          ? 'Escalate with AP manager today before new orders.'
          : 'Call today and confirm exact payment date.',
      })),
      ...(dueSoon as any[]).map((i) => ({
        ...i,
        follow_up_priority: i.days_until_due <= 2 ? 'medium' : 'normal',
        recommended_action: i.days_until_due <= 2
          ? 'Send reminder and confirm ACH/check timing.'
          : 'Send a courtesy reminder email.',
      })),
    ]
      .sort((a, b) => {
        const priorityRank: Record<string, number> = { high: 3, medium: 2, normal: 1 };
        return (priorityRank[b.follow_up_priority] || 0) - (priorityRank[a.follow_up_priority] || 0)
          || (b.balance_due || 0) - (a.balance_due || 0);
      })
      .slice(0, limit + 2);

    res.json({
      due_soon_window_days: dueSoonDays,
      summary: {
        total_invoices: summary?.total_invoices || 0,
        total_amount: Math.round((summary?.total_amount || 0) * 100) / 100,
        open_balance: Math.round((summary?.open_balance || 0) * 100) / 100,
        overdue_balance: Math.round((summary?.overdue_balance || 0) * 100) / 100,
        due_soon_balance: Math.round((summary?.due_soon_balance || 0) * 100) / 100,
        overdue_count: summary?.overdue_count || 0,
        due_soon_count: summary?.due_soon_count || 0,
        paid_count: summary?.paid_count || 0,
      },
      late_payments: latePayments || [],
      due_soon: dueSoon || [],
      follow_up_queue: followUps,
    });
  } catch (error) {
    console.error('Error fetching invoice overview:', error);
    res.status(500).json({ error: 'Failed to fetch invoice overview' });
  }
});

export default router;
