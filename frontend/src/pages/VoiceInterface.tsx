import { FC, useEffect, useState, useCallback, ReactNode } from 'react';
import { DollarSign, AlertTriangle, Flame, PhoneCall, Mic, ShoppingBag } from 'lucide-react';
import { API_URL } from '../config';
import './VoiceInterface.css';

interface KeyInsights {
  revenue30d: number;
  revenueChangePct: number;
  lowStockCount: number;
  hotItemsMatched: number;
  backInStockAlerts: number;
}

const VoiceInterface: FC = () => {
  const [insights, setInsights] = useState<KeyInsights>({
    revenue30d: 0,
    revenueChangePct: 0,
    lowStockCount: 0,
    hotItemsMatched: 0,
    backInStockAlerts: 0,
  });
  const [keyItems, setKeyItems] = useState<ReactNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      let aiInsightsLoaded = false;

      // Load AI key insights first before other voice dashboard stats.
      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), 15000);
      try {
        const aiRes = await fetch(`${API_URL}/api/dashboard/ai-insights`, { headers, signal: aiController.signal });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const aiInsights = aiData.insights || [];
          if (aiInsights.length > 0) {
            const items: ReactNode[] = aiInsights.map((insight: { label: string; detail: string }, i: number) => (
              <span key={i}><strong>{insight.label}:</strong> {insight.detail}</span>
            ));
            setKeyItems(items);
            aiInsightsLoaded = true;
          }
        }
      } catch {
        // Fallback below after core stats load.
      } finally {
        clearTimeout(aiTimeout);
      }

      const [statsRes, salesRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`, { headers }),
        fetch(`${API_URL}/api/dashboard/sales-summary`, { headers }),
      ]);

      const statsData = statsRes.ok ? await statsRes.json() : {};
      const salesData = salesRes.ok ? await salesRes.json() : {};

      setInsights({
        revenue30d: salesData.total_revenue_30d || 0,
        revenueChangePct: salesData.revenue_change_pct || 0,
        lowStockCount: statsData.lowStockCount || 0,
        hotItemsMatched: salesData.hot_items_matched || 0,
        backInStockAlerts: salesData.back_in_stock_alerts || 0,
      });

      if (!aiInsightsLoaded) {
        const revenue = salesData.total_revenue_30d || 0;
        const revenueChange = salesData.revenue_change_pct || 0;
        const lowStock = statsData.lowStockCount || 0;
        const hotMatches = salesData.hot_items_matched || 0;
        const backInStock = salesData.back_in_stock_alerts || 0;
        const currency = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0
        }).format(revenue);

        setKeyItems([
          <span key="fb-1"><strong>Revenue:</strong> {currency} in the last 30 days ({revenueChange > 0 ? '+' : ''}{revenueChange}%).</span>,
          <span key="fb-2"><strong>Inventory Risk:</strong> {lowStock} low-stock products need attention.</span>,
          <span key="fb-3"><strong>Hot Trends:</strong> {hotMatches} hot Weee items matched to our catalog today.</span>,
          <span key="fb-4"><strong>Call Queue:</strong> {backInStock} back-in-stock customer follow-ups ready now.</span>,
        ]);
      }
    } catch {
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ElevenLabs client tools
  const [elevenlabsStatus, setElevenlabsStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    let cancelled = false;
    const boundTargets = new Set<EventTarget>();

    const getWidget = () => document.querySelector('elevenlabs-convai');
    const markConnected = () => {
      if (!cancelled) setElevenlabsStatus('connected');
    };
    const markError = () => {
      if (!cancelled) setElevenlabsStatus('error');
    };

    const handleWidgetReady = () => { markConnected(); };
    const handleWidgetError = () => { markError(); };

    const handleCall = (event: Event) => {
      markConnected();
      const customEvent = event as CustomEvent;
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const asObject = (value: unknown): Record<string, unknown> => (
        typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
      );

      const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

      const readText = (...values: unknown[]): string => {
        for (const value of values) {
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return '';
      };

      const readInt = (value: unknown, fallback: number, min: number, max: number): number => {
        const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, Math.round(parsed)));
      };

      const readOptionalPositiveInt = (value: unknown): number | null => {
        const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return Math.round(parsed);
      };

      const readBool = (value: unknown, fallback = false): boolean => {
        if (typeof value === 'boolean') return value;
        if (typeof value !== 'string') return fallback;
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
        return fallback;
      };

      const parseParams = (params?: unknown): Record<string, unknown> => asObject(params);

      const formatMoney = (value: unknown): string => {
        const amount = Number(value);
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0
        }).format(Number.isFinite(amount) ? amount : 0);
      };

      const formatDate = (value: unknown): string => {
        const raw = readText(value);
        if (!raw) return 'unknown date';
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return raw;
        return parsed.toISOString().split('T')[0];
      };

      const fetchJson = async (url: string): Promise<{ ok: boolean; data: unknown }> => {
        try {
          const res = await fetch(url, { headers });
          const data = await res.json().catch(() => null);
          return { ok: res.ok, data };
        } catch {
          return { ok: false, data: null };
        }
      };

      const fetchHotItemsData = async (): Promise<{ hotItems: Record<string, unknown>[]; summaryPitch: string }> => {
        const result = await fetchJson(`${API_URL}/api/hot-items/today`);
        if (!result.ok) return { hotItems: [], summaryPitch: '' };
        const payload = asObject(result.data);
        return {
          hotItems: asArray<Record<string, unknown>>(payload.hot_items),
          summaryPitch: readText(payload.summary_pitch),
        };
      };

      const fetchTopSkus = async (rawParams?: unknown) => {
        try {
          const params = parseParams(rawParams);
          const territory = readText(params.territory, params.region, params.area, params.market) || 'Chicago/Midwest';
          const days = readInt(params.days, 30, 1, 180);
          const limit = readInt(params.limit, 10, 1, 20);
          const result = await fetchJson(
            `${API_URL}/api/sales/top-skus?territory=${encodeURIComponent(territory)}&days=${days}&limit=${limit}`
          );
          if (!result.ok) return 'Sorry, could not fetch top SKUs.';
          const data = asObject(result.data);
          const picks = asArray<Record<string, unknown>>(data.priority_picks);
          if (!picks.length) return `No SKU sales data found for ${territory} in the last ${days} days.`;
          const topThree = picks.slice(0, 3).map((p, i) =>
            `Number ${i + 1}: ${readText(p.name, 'Unknown SKU')}, ${Number(p.total_qty) || 0} units sold, ${readText(p.priority_score) === 'restock_needed' ? 'RESTOCK NEEDED' : 'well stocked'}`
          ).join('. ');
          return `Top SKUs in ${territory} over the last ${days} days: ${topThree}.`;
        } catch { return 'Sorry, could not fetch top SKUs.'; }
      };

      const fetchWeeeVsChannels = async (): Promise<Record<string, unknown> | null> => {
        const result = await fetchJson(`${API_URL}/api/dashboard/weee-vs-channels`);
        if (!result.ok) return null;
        return asObject(result.data);
      };

      const fetchInvoiceOverview = async (rawParams?: unknown): Promise<{ data: Record<string, unknown> | null; dueSoonDays: number }> => {
        const params = parseParams(rawParams);
        const dueSoonDays = readInt(params.due_soon_days ?? params.days ?? params.window_days, 7, 1, 30);
        const limit = readInt(params.limit, 6, 1, 20);
        const result = await fetchJson(`${API_URL}/api/sales/invoices/overview?due_soon_days=${dueSoonDays}&limit=${limit}`);
        if (!result.ok) return { data: null, dueSoonDays };
        return { data: asObject(result.data), dueSoonDays };
      };

      const fetchInvoiceDetail = async (rawParams?: unknown): Promise<Record<string, unknown> | null> => {
        const params = parseParams(rawParams);
        const invoiceId = readOptionalPositiveInt(params.invoice_id ?? params.invoiceId ?? params.id);
        const invoiceNumber = readText(
          params.invoice_number,
          params.invoiceNumber,
          params.invoice,
          params.number
        );
        const query = new URLSearchParams();
        if (invoiceId) query.set('invoice_id', String(invoiceId));
        if (invoiceNumber) query.set('invoice_number', invoiceNumber);

        const result = await fetchJson(`${API_URL}/api/sales/invoices/detail${query.toString() ? `?${query.toString()}` : ''}`);
        if (!result.ok) return null;
        const payload = asObject(result.data);
        const invoice = asObject(payload.invoice);
        return Object.keys(invoice).length ? invoice : null;
      };

      const fetchCustomerById = async (customerId: number): Promise<Record<string, unknown> | null> => {
        const result = await fetchJson(`${API_URL}/api/customers/${customerId}`);
        if (!result.ok) return null;
        return asObject(result.data);
      };

      const resolveCustomer = async (rawParams?: unknown): Promise<Record<string, unknown> | null> => {
        const params = parseParams(rawParams);
        const customerId = readOptionalPositiveInt(params.customer_id ?? params.customerId ?? params.id);
        const customerName = readText(
          params.customer_name,
          params.customerName,
          params.customer,
          params.account,
          params.name
        );
        const territory = readText(params.territory, params.region, params.area);
        const accountManager = readText(params.account_manager, params.accountManager, params.manager, params.owner);

        if (customerId) {
          const byId = await fetchCustomerById(customerId);
          if (byId) return byId;
        }

        const query = new URLSearchParams();
        if (territory) query.set('territory', territory);
        if (accountManager) query.set('account_manager', accountManager);
        const listResult = await fetchJson(`${API_URL}/api/customers${query.toString() ? `?${query.toString()}` : ''}`);
        if (!listResult.ok) return null;
        const customers = asArray<Record<string, unknown>>(listResult.data);
        if (!customers.length) return null;

        let selected = customers[0];
        if (customerName) {
          const normalizedTarget = customerName.toLowerCase();
          selected = customers.find((c) => readText(c.name).toLowerCase() === normalizedTarget)
            || customers.find((c) => readText(c.name).toLowerCase().includes(normalizedTarget))
            || selected;
        }

        const selectedId = readOptionalPositiveInt(selected.id);
        if (selectedId) {
          const detailed = await fetchCustomerById(selectedId);
          if (detailed) return detailed;
        }

        return asObject(selected);
      };

      const resolveWarehouse = async (rawParams?: unknown): Promise<{ selected: Record<string, unknown> | null; warehouses: Record<string, unknown>[] }> => {
        const params = parseParams(rawParams);
        const warehouseId = readOptionalPositiveInt(params.warehouse_id ?? params.warehouseId ?? params.id);
        const warehouseName = readText(params.warehouse_name, params.warehouseName, params.warehouse, params.name);
        const location = readText(params.location, params.city, params.region);

        const listResult = await fetchJson(`${API_URL}/api/warehouses`);
        if (!listResult.ok) return { selected: null, warehouses: [] };
        const warehouses = asArray<Record<string, unknown>>(listResult.data);
        if (!warehouses.length) return { selected: null, warehouses: [] };

        let selected: Record<string, unknown> | null = null;
        if (warehouseId) {
          selected = warehouses.find((w) => Number(w.id) === warehouseId) || null;
        }
        if (!selected && warehouseName) {
          const normalizedName = warehouseName.toLowerCase();
          selected = warehouses.find((w) => readText(w.name).toLowerCase() === normalizedName)
            || warehouses.find((w) => readText(w.name).toLowerCase().includes(normalizedName))
            || null;
        }
        if (!selected && location) {
          const normalizedLocation = location.toLowerCase();
          selected = warehouses.find((w) => readText(w.location).toLowerCase().includes(normalizedLocation)) || null;
        }

        return { selected, warehouses };
      };

      const buildInvoiceSummaryText = (invoiceData: Record<string, unknown>, dueSoonDays: number): string => {
        const summary = asObject(invoiceData.summary);
        const totalInvoices = Number(summary.total_invoices) || 0;
        const openBalance = Number(summary.open_balance) || 0;
        const overdueCount = Number(summary.overdue_count) || 0;
        const overdueBalance = Number(summary.overdue_balance) || 0;
        const dueSoonCount = Number(summary.due_soon_count) || 0;
        const dueSoonBalance = Number(summary.due_soon_balance) || 0;

        return `Invoice overview: ${totalInvoices} total invoices, ${formatMoney(openBalance)} open balance, ${overdueCount} overdue totaling ${formatMoney(overdueBalance)}, and ${dueSoonCount} due within ${dueSoonDays} days totaling ${formatMoney(dueSoonBalance)}.`;
      };

      const getWeeeTrendsFallback = async (): Promise<string> => {
        const result = await fetchJson(`${API_URL}/api/weee/trends`);
        if (!result.ok) return 'Sorry, could not fetch Weee review or trend data.';
        const data = asObject(result.data);
        const topRated = asArray<Record<string, unknown>>(data.top_rated)
          .slice(0, 2)
          .map((p) => readText(p.name, 'unknown'))
          .join(', ');
        const topSelling = asArray<Record<string, unknown>>(data.top_selling)
          .slice(0, 2)
          .map((p) => readText(p.name, 'unknown'))
          .join(', ');
        return `Weee (Sayweee) trends — top rated: ${topRated || 'none'}. Top selling: ${topSelling || 'none'}.`;
      };

      const actions: Record<string, (params?: unknown) => Promise<string>> = {
        get_inventory_summary: async () => {
          try {
            const result = await fetchJson(`${API_URL}/api/dashboard/stats`);
            if (!result.ok) return 'Sorry, I could not fetch the inventory summary.';
            const data = asObject(result.data);
            const categories = asArray<Record<string, unknown>>(data.inventoryByCategory)
              .slice(0, 2)
              .map((c) => `${readText(c.category, 'Other')} (${Number(c.total_quantity) || 0})`)
              .join(', ');
            const categoryText = categories ? ` Top categories: ${categories}.` : '';
            return `You have ${Number(data.totalProducts) || 0} products with a total inventory value of ${formatMoney(data.totalInventoryValue)}. There are ${Number(data.lowStockCount) || 0} items low on stock.${categoryText}`;
          } catch { return 'Sorry, I could not fetch the inventory summary.'; }
        },

        get_low_stock: async () => {
          try {
            const result = await fetchJson(`${API_URL}/api/dashboard/alerts`);
            if (!result.ok) return 'Sorry, I could not fetch low stock items.';
            const items = asArray<Record<string, unknown>>(result.data);
            if (!items.length) return 'All items are well stocked!';
            const itemList = items.slice(0, 3)
              .map((i) => `${readText(i.name, 'Unknown item')} (${Number(i.quantity_on_hand) || 0} units)`)
              .join(', ');
            return `Low stock: ${itemList}${items.length > 3 ? ` and ${items.length - 3} more` : ''}.`;
          } catch { return 'Sorry, I could not fetch low stock items.'; }
        },

        get_recent_sales_activity: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const limit = readInt(params.limit ?? params.count ?? params.top, 6, 1, 20);
            const territory = readText(params.territory, params.region, params.area);
            const customer = readText(params.customer, params.customer_name, params.customerName, params.account);
            const product = readText(params.product, params.product_name, params.productName, params.item);
            const category = readText(params.category, params.product_category);
            let categoryProductNames: Set<string> | null = null;
            if (category) {
              const categoryResult = await fetchJson(`${API_URL}/api/products?category=${encodeURIComponent(category)}`);
              if (categoryResult.ok) {
                const categoryProducts = asArray<Record<string, unknown>>(categoryResult.data);
                const names = categoryProducts
                  .map((row) => readText(row.name).toLowerCase())
                  .filter(Boolean);
                if (names.length > 0) categoryProductNames = new Set(names);
              }
            }

            const result = await fetchJson(`${API_URL}/api/dashboard/activity?limit=${Math.max(limit * 3, 10)}`);
            if (!result.ok) return 'Sorry, could not fetch recent sales activity.';
            let rows = asArray<Record<string, unknown>>(result.data);

            if (territory) {
              const normalized = territory.toLowerCase();
              rows = rows.filter((r) => readText(r.territory).toLowerCase().includes(normalized));
            }
            if (customer) {
              const normalized = customer.toLowerCase();
              rows = rows.filter((r) => readText(r.customer_name).toLowerCase().includes(normalized));
            }
            if (product) {
              const normalized = product.toLowerCase();
              rows = rows.filter((r) => readText(r.product_name).toLowerCase().includes(normalized));
            }
            if (category) {
              if (categoryProductNames && categoryProductNames.size > 0) {
                rows = rows.filter((r) => categoryProductNames?.has(readText(r.product_name).toLowerCase()));
              } else {
                const normalized = category.toLowerCase();
                rows = rows.filter((r) => readText(r.product_name).toLowerCase().includes(normalized));
              }
            }

            if (!rows.length) return 'No recent sales activity matches those filters.';
            const lines = rows.slice(0, limit).map((row) =>
              `${formatDate(row.timestamp)}: ${readText(row.customer_name, 'Unknown customer')} bought ${Number(row.quantity_sold) || 0} of ${readText(row.product_name, 'Unknown product')} for ${formatMoney(row.revenue)}`
            );
            return `Recent sales activity: ${lines.join(' | ')}`;
          } catch { return 'Sorry, could not fetch recent sales activity.'; }
        },

        check_product_stock: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const searchTerm = readText(
              params.product_name,
              params.productName,
              params.product,
              params.item,
              params.name,
              params.sku,
              params.query
            );

            if (!searchTerm) {
              const result = await fetchJson(`${API_URL}/api/dashboard/alerts`);
              const lowStock = asArray<Record<string, unknown>>(result.data)
                .slice(0, 2)
                .map((i) => `${readText(i.name, 'Unknown item')} (${Number(i.quantity_on_hand) || 0} units)`)
                .join(', ');
              return lowStock
                ? `Please share a product name or SKU. Current low-stock priorities: ${lowStock}.`
                : 'Please share a product name or SKU and I can check stock.';
            }

            const result = await fetchJson(`${API_URL}/api/products?search=${encodeURIComponent(searchTerm)}`);
            if (!result.ok) return 'Sorry, could not check that product.';
            const products = asArray<Record<string, unknown>>(result.data);
            if (!products.length) return `No product found matching "${searchTerm}".`;
            const product = asObject(products[0]);
            const name = readText(product.name, searchTerm);
            const quantityOnHand = Number(product.quantity_on_hand) || 0;
            const reorderPoint = Number(product.reorder_point) || 0;
            const status = reorderPoint > 0 && quantityOnHand <= reorderPoint ? 'low stock' : 'in stock';
            const warehouse = readText(product.warehouse_name);
            return `${name} has ${quantityOnHand} units (${status})${warehouse ? ` at ${warehouse}` : ''}.`;
          } catch { return 'Sorry, could not check that product.'; }
        },

        get_hot_items_brief: async () => {
          try {
            const { hotItems } = await fetchHotItemsData();
            if (!hotItems.length) return 'No hot items data for today.';
            const items = hotItems.slice(0, 5).map((h, idx) =>
              `Number ${Number(h.rank) || idx + 1}: ${readText(h.weee_product_name, 'Unknown hot item')} (${readText(h.match_type, 'unknown match')})`
            ).join(', ');
            return `Today's top ${hotItems.length} hot items on Weee (Sayweee) are: ${items}.`;
          } catch { return 'Sorry, could not fetch hot items.'; }
        },

        get_hot_items_preview: async () => {
          try {
            const result = await fetchJson(`${API_URL}/api/dashboard/hot-items-preview`);
            if (!result.ok) return 'Sorry, could not fetch hot items preview.';
            const preview = asArray<Record<string, unknown>>(result.data);
            if (!preview.length) return 'No hot items are available in the preview feed right now.';
            const lines = preview.slice(0, 3).map((item, idx) => {
              const rank = Number(item.weee_rank) || idx + 1;
              const weeeName = readText(item.weee_product_name, 'Unknown hot item');
              const matchType = readText(item.match_type, 'none');
              const ourProduct = readText(item.our_product_name);
              return `#${rank} ${weeeName} (${matchType}${ourProduct ? `, our match: ${ourProduct}` : ''})`;
            });
            return `Hot items preview: ${lines.join(' | ')}`;
          } catch { return 'Sorry, could not fetch hot items preview.'; }
        },

        get_hot_items_history: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const days = readInt(params.days ?? params.window_days, 7, 1, 60);
            const limit = readInt(params.limit, 8, 1, 25);
            const category = readText(params.category, params.weee_category);
            const product = readText(params.product, params.product_name, params.productName, params.item);

            const result = await fetchJson(`${API_URL}/api/hot-items/history`);
            if (!result.ok) return 'Sorry, could not fetch hot items history.';
            let rows = asArray<Record<string, unknown>>(result.data);

            if (category) {
              const normalized = category.toLowerCase();
              rows = rows.filter((row) => readText(row.weee_category).toLowerCase().includes(normalized));
            }
            if (product) {
              const normalized = product.toLowerCase();
              rows = rows.filter((row) => readText(row.weee_product_name, row.our_product_name).toLowerCase().includes(normalized));
            }

            const cutoff = new Date();
            cutoff.setUTCHours(0, 0, 0, 0);
            cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
            rows = rows.filter((row) => {
              const parsed = new Date(readText(row.weee_date));
              return !Number.isNaN(parsed.getTime()) && parsed >= cutoff;
            });

            if (!rows.length) return `No hot-item history found for the last ${days} days${category ? ` in category ${category}` : ''}.`;
            const lines = rows.slice(0, limit).map((row, idx) => {
              const rank = Number(row.weee_rank) || idx + 1;
              const weeeName = readText(row.weee_product_name, 'Unknown item');
              const matchType = readText(row.match_type, 'none');
              const ourProduct = readText(row.our_product_name);
              return `${formatDate(row.weee_date)} #${rank} ${weeeName} (${matchType}${ourProduct ? `, our product: ${ourProduct}` : ''})`;
            });
            return `Hot-item history (${days}d): ${lines.join(' | ')}`;
          } catch { return 'Sorry, could not fetch hot items history.'; }
        },

        match_hot_items_to_catalog: async () => {
          try {
            const { hotItems } = await fetchHotItemsData();
            if (!hotItems.length) return 'No hot-item catalog matching data available right now.';
            const matches = hotItems.map((h) => {
              const productName = readText(h.weee_product_name, 'Unknown item');
              const matchType = readText(h.match_type, 'none').toLowerCase();
              if (matchType === 'none') return `${productName}: no match`;
              if (matchType === 'exact') return `${productName}: exact match`;
              const notes = readText(h.match_notes);
              return `${productName}: ${matchType} match${notes ? ` (${notes})` : ''}`;
            }).join('. ');
            return matches;
          } catch { return 'Sorry, could not match hot items.'; }
        },

        get_talking_points: async () => {
          try {
            const { hotItems, summaryPitch } = await fetchHotItemsData();
            const points: string[] = [];
            for (const h of hotItems) {
              const talkingPoint = readText(h.talking_point);
              if (!talkingPoint) continue;
              points.push(`For ${readText(h.weee_product_name, 'this item')}: ${talkingPoint}`);
            }
            if (points.length > 0) return points.join(' | ');
            return summaryPitch || 'No talking points available for today.';
          } catch { return 'Sorry, could not fetch talking points.'; }
        },

        get_cross_sell_recommendations: async () => {
          try {
            const { hotItems } = await fetchHotItemsData();
            const recs: string[] = [];
            for (const h of hotItems) {
              const crossSell = asObject(h.cross_sell);
              const pairedName = readText(crossSell.product_name);
              if (!pairedName) continue;
              const ourProduct = asObject(h.our_product);
              const ourName = readText(ourProduct.name, h.weee_product_name, 'this item');
              const reason = readText(crossSell.reason, 'good basket-size add-on');
              recs.push(`Pair ${ourName} with ${pairedName}: ${reason}`);
            }
            return recs.length ? recs.join('. ') : 'No cross-sell recommendations found for today.';
          } catch { return 'Sorry, could not fetch cross-sell recommendations.'; }
        },

        get_universal_pitch: async () => {
          try {
            const { hotItems, summaryPitch } = await fetchHotItemsData();
            if (summaryPitch) return summaryPitch;
            const pitches = hotItems
              .map((h) => readText(h.universal_pitch))
              .filter((p) => p.length > 0);
            return pitches[0] || 'Focus on trending Asian staples — coconut-based and snack items are surging on Weee and Sayweee right now.';
          } catch { return 'Sorry, could not fetch the pitch.'; }
        },

        get_top_skus: fetchTopSkus,

        get_category_trends: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const customerId = readInt(params.customer_id ?? params.customerId ?? params.id, 1, 1, 100000);
            const days = readInt(params.days, 30, 1, 180);
            const result = await fetchJson(
              `${API_URL}/api/sales/category-trends?customer_id=${customerId}&days=${days}`
            );
            if (!result.ok) return 'Sorry, could not fetch category trends.';
            const data = asObject(result.data);
            const customer = asObject(data.customer);
            const customerName = readText(customer.name, `customer ${customerId}`);
            const up = asArray<Record<string, unknown>>(data.trending_up)
              .slice(0, 2)
              .map((c) => `${readText(c.category, 'Unknown')} up ${Math.round(Number(c.trend_pct) || 0)}%`)
              .join(', ');
            const down = asArray<Record<string, unknown>>(data.trending_down)
              .slice(0, 1)
              .map((c) => `${readText(c.category, 'Unknown')} down ${Math.round(Math.abs(Number(c.trend_pct) || 0))}%`)
              .join(', ');
            const recs = asArray<Record<string, unknown>>(data.recommendations)
              .slice(0, 3)
              .map((r) => readText(r.name))
              .filter(Boolean)
              .join(', ');
            return `For ${customerName} (last ${days} days): trending up - ${up || 'none'}. Trending down - ${down || 'none'}. Recommended items: ${recs || 'none'}.`;
          } catch { return 'Sorry, could not fetch category trends.'; }
        },

        get_back_in_stock_alerts: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const daysLookback = readInt(params.days_lookback ?? params.daysLookback ?? params.days, 14, 1, 60);
            const result = await fetchJson(`${API_URL}/api/sales/back-in-stock-alerts?days_lookback=${daysLookback}`);
            if (!result.ok) return 'Sorry, could not fetch back-in-stock alerts.';
            const data = asObject(result.data);
            const alerts = asArray<Record<string, unknown>>(data.alerts);
            if (!alerts.length) return 'No back-in-stock situations detected.';
            const lines = alerts.slice(0, 4).map((alert) => {
              const product = asObject(alert.product);
              const affectedCustomers = asArray<Record<string, unknown>>(alert.affected_customers);
              const topCustomers = affectedCustomers
                .slice(0, 2)
                .map((c) => `${readText(c.customer_name, 'Unknown customer')} (${readText(c.phone, 'no phone')})`)
                .join(' and ');
              return `${readText(product.name, 'Product')} is back in stock with ${Number(product.quantity_on_hand) || 0} units. Call ${topCustomers || 'priority accounts'} first.`;
            });
            return lines.join(' | ');
          } catch { return 'Sorry, could not fetch back-in-stock alerts.'; }
        },

        get_weee_reviews: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const productIdRaw = readText(params.product_id, params.productId, params.id);
            const parsedProductId = parseInt(productIdRaw, 10);
            const productId = Number.isFinite(parsedProductId) && parsedProductId > 0 ? parsedProductId : null;
            const productName = readText(params.product_name, params.productName, params.product, params.name, params.item);
            const limit = readInt(params.limit, 5, 1, 20);

            const query = new URLSearchParams();
            if (productId) query.set('product_id', String(productId));
            if (productName) query.set('product_name', productName);
            query.set('limit', String(limit));

            const result = await fetchJson(`${API_URL}/api/weee/reviews?${query.toString()}`);
            if (result.ok) {
              const data = asObject(result.data);
              const product = asObject(data.product);
              const reviews = asArray<Record<string, unknown>>(data.reviews);

              if (reviews.length > 0) {
                const label = readText(product.name);
                const recent = reviews
                  .slice(0, 3)
                  .map((r) => {
                    const itemName = readText(label, r.name, 'Product');
                    const reviewer = readText(r.reviewer_name, 'anonymous reviewer');
                    const rating = Number(r.rating) || 0;
                    const comment = readText(r.comment, 'No written comment.');
                    return `${itemName} — ${reviewer} (${rating}/5): ${comment}`;
                  })
                  .join('. ');
                return `Recent Weee (Sayweee) reviews: ${recent}.`;
              }

              if (productName || productId) {
                const target = readText(product.name, productName, productId ? `product ${productId}` : '');
                return `No reviews found for ${target}.`;
              }
            }

            return await getWeeeTrendsFallback();
          } catch { return 'Sorry, could not fetch Weee reviews.'; }
        },

        get_weee_performance: async () => {
          try {
            const insight = await fetchWeeeVsChannels();
            if (insight && Object.keys(insight).length > 0) {
              const trendTracking = asObject(insight.trend_tracking);
              const hotItemCoverage = asObject(insight.hot_item_coverage);
              const ourPerformance = asObject(insight.our_weee_performance);
              const sentiment = asObject(ourPerformance.sentiment);

              const rising = asArray<Record<string, unknown>>(trendTracking.rising_signals)
                .slice(0, 2)
                .map((s) => {
                  const rankChange4w = Number(s.rank_change_4w) || 0;
                  const sign = rankChange4w >= 0 ? '+' : '';
                  return `${readText(s.weee_product_name, 'Unknown')} (${sign}${rankChange4w} rank in 4 weeks)`;
                })
                .join(', ');
              const watchlist = asArray<Record<string, unknown>>(ourPerformance.quality_watchlist)
                .slice(0, 2)
                .map((q) => `${readText(q.name, 'Unknown')} (${Number(q.negative_review_share_pct) || 0}% negative)`)
                .join(', ');
              const opportunities = asArray<Record<string, unknown>>(insight.opportunities)
                .slice(0, 2)
                .map((o) => `${readText(o.our_product_name, 'Unknown')}: ${readText(o.suggested_action, 'review action')}`)
                .join(', ');

              return `Weee (Sayweee) benchmark uses observed top-seller trends for ${Number(trendTracking.weeks_tracked) || 0} weeks, not competitor sales volume. This week we mapped ${Number(hotItemCoverage.coverage_pct) || 0}% of observed trends to our catalog. Our own Weee listings sold ${Number(ourPerformance.units_sold_week) || 0} units (${Number(ourPerformance.units_wow_pct) || 0}% WoW) with ${Number(sentiment.negative_pct) || 0}% negative review share. Rising signals: ${rising || 'none'}. Priority actions: ${opportunities || 'none yet'}.${watchlist ? ` Quality watchlist: ${watchlist}.` : ''}`;
            }

            const result = await fetchJson(`${API_URL}/api/weee/our-listings`);
            if (!result.ok) return 'Sorry, could not fetch Weee performance.';
            const data = asObject(result.data);
            const listings = asArray<Record<string, unknown>>(data.listings);
            const stats = asObject(data.stats);
            const top = listings.slice(0, 5).map((p) =>
              `${readText(p.name, 'Unknown')}: ${Number(p.weee_weekly_sold) || 0} sold, ${Number(p.weee_rating) || 0} stars`
            ).join(', ');
            return `We have ${Number(stats.total_listings) || 0} products on Weee (Sayweee). Average rating: ${Number(stats.avg_rating) || 0}. Total weekly sales: ${Number(stats.total_weekly_sold) || 0}. Top sellers: ${top || 'none'}.`;
          } catch { return 'Sorry, could not fetch Weee performance.'; }
        },

        get_weee_channel_opportunities: async () => {
          try {
            const insight = await fetchWeeeVsChannels();
            if (!insight) return 'Sorry, could not fetch Weee channel opportunities.';
            const hotItemCoverage = asObject(insight.hot_item_coverage);
            const trendTracking = asObject(insight.trend_tracking);
            const uncovered = asArray<Record<string, unknown>>(insight.uncovered_hot_items)
              .slice(0, 2)
              .map((i) => readText(i.weee_product_name))
              .filter(Boolean)
              .join(', ');
            const opportunities = asArray<Record<string, unknown>>(insight.opportunities)
              .slice(0, 3)
              .map((o) =>
                `${readText(o.our_product_name, 'Unknown')}: ${readText(o.suggested_action, 'review action')} (${Number(o.trend_presence_weeks) || 0}/${Number(trendTracking.weeks_tracked) || 0} weeks observed)`
              )
              .join(' | ');
            return `Weee vs channels opportunity view: ${Number(hotItemCoverage.coverage_pct) || 0}% trend coverage, ${Number(hotItemCoverage.stock_ready_pct) || 0}% stock-ready mapped trends, and ${Number(hotItemCoverage.unmatched_hot_items) || 0} uncovered observed trends this week. Uncovered trends: ${uncovered || 'none'}. Priority actions: ${opportunities || 'none'}.`;
          } catch { return 'Sorry, could not fetch Weee channel opportunities.'; }
        },

        get_invoice_details: async (rawParams?: unknown) => {
          try {
            const invoice = await fetchInvoiceDetail(rawParams);
            if (!invoice) {
              const { data, dueSoonDays } = await fetchInvoiceOverview(rawParams);
              if (data) return `I could not find that specific invoice. ${buildInvoiceSummaryText(data, dueSoonDays)}`;
              return 'Sorry, could not fetch invoice details.';
            }

            const idLabel = readText(invoice.invoice_number, Number(invoice.id) > 0 ? `invoice ${Number(invoice.id)}` : 'invoice');
            const customer = readText(invoice.customer_name, 'Unknown customer');
            const amount = Number(invoice.amount) || 0;
            const balance = Number(invoice.balance_due) || 0;
            const status = readText(invoice.status, balance > 0 ? 'open' : 'paid');
            const daysOverdue = Number(invoice.days_overdue);
            const daysUntilDue = Number(invoice.days_until_due);
            const timing = (Number.isFinite(daysOverdue) && daysOverdue > 0)
              ? `${daysOverdue} days overdue`
              : (Number.isFinite(daysUntilDue) && daysUntilDue > 0)
                ? `due in ${daysUntilDue} days`
                : (Number.isFinite(daysUntilDue) && daysUntilDue === 0)
                  ? 'due today'
                  : 'timing unavailable';
            const owner = readText(invoice.assigned_to, invoice.account_manager);
            const followUp = readText(invoice.follow_up_note, 'Follow up with AP contact.');

            return `${idLabel} for ${customer} is ${status}. Amount ${formatMoney(amount)}, balance ${formatMoney(balance)}, ${timing}. ${owner ? `Owner: ${owner}. ` : ''}Next step: ${followUp}`;
          } catch { return 'Sorry, could not fetch invoice details.'; }
        },

        get_invoice_overview: async (rawParams?: unknown) => {
          try {
            const { data, dueSoonDays } = await fetchInvoiceOverview(rawParams);
            if (!data) return 'Sorry, could not fetch invoice overview.';
            return buildInvoiceSummaryText(data, dueSoonDays);
          } catch { return 'Sorry, could not fetch invoice overview.'; }
        },

        get_finance_summary: async (rawParams?: unknown) => {
          try {
            const { data, dueSoonDays } = await fetchInvoiceOverview(rawParams);
            if (!data) return 'Sorry, could not fetch finance summary.';
            return buildInvoiceSummaryText(data, dueSoonDays);
          } catch { return 'Sorry, could not fetch finance summary.'; }
        },

        get_invoice_follow_up_queue: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const { data } = await fetchInvoiceOverview({
              due_soon_days: params.due_soon_days ?? params.days,
              limit: params.limit ?? 6,
            });
            if (!data) return 'Sorry, could not fetch invoice follow-up data.';
            const queue = asArray<Record<string, unknown>>(data.follow_up_queue);
            if (!queue.length) return 'No invoice follow-ups are currently queued.';
            const lines = queue.slice(0, 4).map((row) => {
              const customer = readText(row.customer_name, 'Unknown customer');
              const invoiceNumber = readText(row.invoice_number, 'invoice');
              const balance = formatMoney(row.balance_due);
              const overdueDays = Number(row.days_overdue);
              const dueDays = Number(row.days_until_due);
              const timing = Number.isFinite(overdueDays)
                ? `${overdueDays}d overdue`
                : (Number.isFinite(dueDays) ? `due in ${dueDays}d` : 'timing n/a');
              const action = readText(row.recommended_action, row.follow_up_note, 'Follow up with AP contact.');
              return `${customer} (${invoiceNumber}, ${balance}, ${timing}) — ${action}`;
            });
            return `Invoice follow-up queue: ${lines.join(' | ')}`;
          } catch { return 'Sorry, could not fetch invoice follow-up data.'; }
        },

        get_order_status: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const orderId = readOptionalPositiveInt(params.order_id ?? params.orderId ?? params.id);
            const customerFilter = readText(params.customer_id, params.customerId, params.customer, params.customer_name, params.customerName);
            const statusFilter = readText(params.status).toLowerCase();
            const limit = readInt(params.limit, 5, 1, 20);

            if (orderId) {
              const orderResult = await fetchJson(`${API_URL}/api/orders/${orderId}`);
              if (orderResult.ok) {
                const order = asObject(orderResult.data);
                const itemCount = asArray<Record<string, unknown>>(order.items).length;
                return `Order ${Number(order.id) || orderId} is ${readText(order.status, 'unknown status')}. Total: ${formatMoney(order.total_amount)}. ${itemCount} line items. Created: ${readText(order.created_at, 'unknown')}.`;
              }
            }

            const ordersResult = await fetchJson(`${API_URL}/api/orders`);
            if (!ordersResult.ok) {
              const { data, dueSoonDays } = await fetchInvoiceOverview(rawParams);
              if (data) {
                return `Order status data is unavailable right now. ${buildInvoiceSummaryText(data, dueSoonDays)}`;
              }
              return 'Sorry, could not fetch order status right now.';
            }

            let orders = asArray<Record<string, unknown>>(ordersResult.data);
            if (statusFilter) {
              orders = orders.filter((o) => readText(o.status).toLowerCase() === statusFilter);
            }
            if (customerFilter) {
              const normalizedCustomer = customerFilter.toLowerCase();
              orders = orders.filter((o) => readText(o.customer_id).toLowerCase().includes(normalizedCustomer));
            }

            if (!orders.length) {
              const { data, dueSoonDays } = await fetchInvoiceOverview(rawParams);
              if (data) {
                return `No matching orders found in the current dataset. ${buildInvoiceSummaryText(data, dueSoonDays)}`;
              }
              return 'No matching orders found in the current dataset.';
            }

            const orderLines = orders.slice(0, limit).map((o) => {
              const id = Number(o.id) || readText(o.id, 'unknown');
              const status = readText(o.status, 'unknown');
              const total = formatMoney(o.total_amount);
              const customer = readText(o.customer_id, 'unknown customer');
              return `Order ${id}: ${status}, ${total}, customer ${customer}`;
            });
            return `Order status summary: ${orderLines.join(' | ')}`;
          } catch { return 'Sorry, could not fetch order status right now.'; }
        },

        get_customer_summary: async (rawParams?: unknown) => {
          try {
            const customer = await resolveCustomer(rawParams);
            if (!customer) return 'No customer data found for that request.';

            const name = readText(customer.name, 'Unknown customer');
            const territory = readText(customer.territory, 'unknown territory');
            const manager = readText(customer.account_manager, 'unassigned manager');
            const tier = readText(customer.tier, 'standard');

            const salesSummary = asObject(customer.sales_summary);
            const byCategory = asArray<Record<string, unknown>>(salesSummary.by_category);
            const topProducts = asArray<Record<string, unknown>>(salesSummary.top_products);

            const topCategoryText = byCategory
              .slice(0, 2)
              .map((c) => `${readText(c.category, 'Unknown')} (${formatMoney(c.total_revenue)})`)
              .join(', ');
            const topProductText = topProducts
              .slice(0, 3)
              .map((p) => `${readText(p.name, 'Unknown')} (${formatMoney(p.total_revenue)})`)
              .join(', ');

            return `${name} in ${territory}, managed by ${manager}, tier ${tier}. Top categories (30d): ${topCategoryText || 'none'}. Top products (30d): ${topProductText || 'none'}.`;
          } catch { return 'Sorry, could not fetch customer summary.'; }
        },

        get_warehouse_stock: async (rawParams?: unknown) => {
          try {
            const params = parseParams(rawParams);
            const categoryFilter = readText(params.category, params.product_category);
            const lowOnly = readBool(params.low_only ?? params.lowOnly, false);
            const limit = readInt(params.limit, 5, 1, 20);
            const { selected, warehouses } = await resolveWarehouse(rawParams);

            if (!warehouses.length) return 'No warehouse data is available right now.';

            if (!selected) {
              const summary = [...warehouses]
                .sort((a, b) => (Number(b.total_stock) || 0) - (Number(a.total_stock) || 0))
                .slice(0, 3)
                .map((w) => `${readText(w.name, 'Unknown')} (${Number(w.product_count) || 0} SKUs, ${Number(w.total_stock) || 0} units)`)
                .join(', ');
              return `Please specify a warehouse name or ID. Current warehouse stock summary: ${summary}.`;
            }

            const warehouseId = readOptionalPositiveInt(selected.id);
            if (!warehouseId) {
              return `${readText(selected.name, 'Warehouse')} does not have a valid warehouse ID in the current dataset.`;
            }

            const inventoryResult = await fetchJson(`${API_URL}/api/inventory/warehouse/${warehouseId}`);
            if (!inventoryResult.ok) {
              return `${readText(selected.name, 'Warehouse')} has ${Number(selected.product_count) || 0} SKUs and ${Number(selected.total_stock) || 0} units total.`;
            }

            let inventory = asArray<Record<string, unknown>>(inventoryResult.data);
            if (categoryFilter) {
              const normalizedCategory = categoryFilter.toLowerCase();
              inventory = inventory.filter((row) => readText(row.category).toLowerCase().includes(normalizedCategory));
            }
            if (lowOnly) {
              inventory = inventory.filter((row) => (Number(row.quantity_on_hand) || 0) <= (Number(row.reorder_point) || 0));
            }

            const skuCount = inventory.length;
            const totalUnits = inventory.reduce((sum, row) => sum + (Number(row.quantity_on_hand) || 0), 0);
            const lowStockCount = inventory.filter((row) => (Number(row.quantity_on_hand) || 0) <= (Number(row.reorder_point) || 0)).length;
            const highlights = [...inventory]
              .sort((a, b) => (Number(b.quantity_on_hand) || 0) - (Number(a.quantity_on_hand) || 0))
              .slice(0, limit)
              .map((row) => `${readText(row.product_name, 'Unknown')} (${Number(row.quantity_on_hand) || 0})`)
              .join(', ');

            const filterText = `${categoryFilter ? ` category ${categoryFilter};` : ''}${lowOnly ? ' low-stock only;' : ''}`.trim();
            return `${readText(selected.name, 'Warehouse')} stock summary${filterText ? ` (${filterText})` : ''}: ${skuCount} SKUs, ${totalUnits} units total, ${lowStockCount} low-stock SKUs. Top items: ${highlights || 'none'}.`;
          } catch { return 'Sorry, could not fetch warehouse stock.'; }
        },
      };

      if (customEvent.detail) {
        customEvent.detail.config = customEvent.detail.config || {};
        customEvent.detail.config.clientTools = actions;
      }
    };

    const attachEvents = (target: EventTarget) => {
      if (boundTargets.has(target)) return;
      target.addEventListener('elevenlabs-convai:ready', handleWidgetReady);
      target.addEventListener('elevenlabs-convai:error', handleWidgetError);
      target.addEventListener('elevenlabs-convai:call', handleCall);
      boundTargets.add(target);
    };

    const detachEvents = (target: EventTarget) => {
      if (!boundTargets.has(target)) return;
      target.removeEventListener('elevenlabs-convai:call', handleCall);
      target.removeEventListener('elevenlabs-convai:ready', handleWidgetReady);
      target.removeEventListener('elevenlabs-convai:error', handleWidgetError);
      boundTargets.delete(target);
    };

    const checkWidgetConnection = () => {
      const widget = getWidget();
      if (widget) {
        attachEvents(widget);
      }

      // Some widget builds use closed shadow DOM and may never expose shadowRoot.
      // Treat custom-element registration + DOM presence as "connected enough" for UI state.
      if (widget && customElements.get('elevenlabs-convai')) {
        markConnected();
      }
    };

    attachEvents(document);
    checkWidgetConnection();

    if (customElements.get('elevenlabs-convai')) {
      checkWidgetConnection();
    } else if (customElements.whenDefined) {
      customElements.whenDefined('elevenlabs-convai')
        .then(() => {
          if (!cancelled) checkWidgetConnection();
        })
        .catch(() => {
          markError();
        });
    }

    const pollTimer = window.setInterval(checkWidgetConnection, 1000);
    const failSafeTimer = window.setTimeout(() => {
      if (!cancelled) {
        setElevenlabsStatus((current) => (current === 'connecting' ? 'error' : current));
      }
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(failSafeTimer);
      for (const target of Array.from(boundTargets)) {
        detachEvents(target);
      }
    };
  }, []);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  if (loading) {
    return (
      <div className="voice-loading">
        <div className="spinner-large"></div>
        <p>Loading AI Key Items...</p>
      </div>
    );
  }

  return (
    <div className="voice-app">
      <section className="voice-section">
        <elevenlabs-convai agent-id="agent_7901khz299zdfvcbhtk3c08vcps8"></elevenlabs-convai>

        {elevenlabsStatus === 'connecting' && (
          <div className="widget-status connecting" role="status" aria-live="polite">
            <div className="spinner"></div>
            <div className="connecting-copy">
              <strong className="connecting-title">Connecting to Voice AI...</strong>
              <span className="connecting-subtitle">Please wait a few seconds while the assistant initializes.</span>
            </div>
          </div>
        )}
        {elevenlabsStatus === 'error' && (
          <div className="widget-status error">
            <p>Voice AI connection failed</p>
            <small>
              The ElevenLabs widget requires the agent to be published.
              <br />
              <a href="https://elevenlabs.io/app/conversational-ai" target="_blank" rel="noopener">
                Check Agent Status
              </a>
            </small>
          </div>
        )}
      </section>

      <main className="voice-content">
        <section className="stats-section">
          <div className="voice-stat-card">
            <div className="voice-stat-icon green"><DollarSign size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : formatCurrency(insights.revenue30d)}</span>
            <span className="voice-stat-label">
              Revenue 30d
              {!loading && insights.revenueChangePct !== 0 && (
                <span className={`voice-trend ${insights.revenueChangePct > 0 ? 'up' : 'down'}`}>
                  {insights.revenueChangePct > 0 ? '+' : ''}{insights.revenueChangePct}%
                </span>
              )}
            </span>
          </div>
          <div className="voice-stat-card">
            <div className="voice-stat-icon orange"><AlertTriangle size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : insights.lowStockCount}</span>
            <span className="voice-stat-label">Low Stock</span>
          </div>
          <div className="voice-stat-card">
            <div className="voice-stat-icon purple"><Flame size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : insights.hotItemsMatched}</span>
            <span className="voice-stat-label">Hot Matches</span>
          </div>
          <div className="voice-stat-card">
            <div className="voice-stat-icon blue"><PhoneCall size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : insights.backInStockAlerts}</span>
            <span className="voice-stat-label">Call Alerts</span>
          </div>
        </section>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={fetchStats} className="retry-btn">Retry</button>
          </div>
        )}

        {!loading && keyItems.length > 0 && (
          <section className="key-items">
            <h3>Key Items</h3>
            <ul>
              {keyItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="quick-questions">
          <h3>Try Asking</h3>
          <div className="question-list">
            <div className="question-hint">
              &quot;What are today&apos;s hot items on Weee?&quot;
            </div>
            <div className="question-hint">
              &quot;Which hot items do we carry?&quot;
            </div>
            <div className="question-hint">
              &quot;Give me talking points for today&quot;
            </div>
            <div className="question-hint">
              &quot;What should I cross-sell with Pocky?&quot;
            </div>
            <div className="question-hint">
              &quot;What&apos;s my universal pitch today?&quot;
            </div>
            <div className="question-hint">
              &quot;Top sellers in Chicago/Midwest last 30 days&quot;
            </div>
            <div className="question-hint">
              &quot;Any back-in-stock items to call about?&quot;
            </div>
            <div className="question-hint">
              &quot;How are we doing on Weee?&quot;
            </div>
            <div className="question-hint">
              &quot;How are we doing on Sayweee vs our channels?&quot;
            </div>
            <div className="question-hint">
              &quot;What does the customer say about Soy Sauce Premium?&quot;
            </div>
            <div className="question-hint">
              &quot;What is our overdue invoice balance and who should I call?&quot;
            </div>
            <div className="question-hint">
              &quot;Show invoice details for INV-1004&quot;
            </div>
            <div className="question-hint">
              &quot;Give me a customer summary for H Mart Chicago&quot;
            </div>
            <div className="question-hint">
              &quot;Show warehouse stock for Los Angeles&quot;
            </div>
            <div className="question-hint">
              &quot;What&apos;s the status of order 101?&quot;
            </div>
            <div className="question-hint">
              &quot;Give me recent sales activity in Chicago/Midwest&quot;
            </div>
            <div className="question-hint">
              &quot;Show hot item history for the last 7 days&quot;
            </div>
          </div>
        </section>

        <section className="instructions">
          <div className="instruction-item">
            <span className="icon"><Mic size={18} /></span>
            <p>Voice chat opens automatically after AI Key Items load</p>
          </div>
          <div className="instruction-item">
            <span className="icon"><ShoppingBag size={18} /></span>
            <p>Ask about Weee hot items, sales data, or inventory</p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default VoiceInterface;
