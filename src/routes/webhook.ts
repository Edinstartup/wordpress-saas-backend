import { Router, Response } from 'express';
import { body } from 'express-validator';
import { supabase } from '../db/supabase';
import { validate } from '../middleware/validate';
import { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * Helper: Resolve site by API key from X-API-Key header.
 * Returns the site or null if not found.
 */
async function resolveSiteByApiKey(apiKey: string) {
  const { data: site } = await supabase
    .from('sites')
    .select('id, name, url')
    .eq('api_key', apiKey)
    .single();
  return site;
}

/**
 * POST /api/webhook/site-info
 * WordPress plugin sends site information.
 * Updates site status to 'connected' and stores site info.
 */
router.post(
  '/site-info',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        res.status(401).json({ success: false, error: 'X-API-Key header missing' });
        return;
      }

      const {
        wp_version,
        php_version,
        theme,
        plugins_count,
        woocommerce_installed,
        site_url,
        site_name,
        active_plugins,
      } = req.body;

      const site = await resolveSiteByApiKey(apiKey);
      if (!site) {
        res.status(404).json({ success: false, error: 'Invalid API key' });
        return;
      }

      const { error } = await supabase
        .from('sites')
        .update({
          status: 'connected',
          wp_version: wp_version || null,
          php_version: php_version || null,
          theme: theme || null,
          plugins_count: plugins_count || 0,
          woocommerce_installed: Boolean(woocommerce_installed),
          site_info: {
            site_url,
            site_name,
            active_plugins: active_plugins || [],
            wp_version,
            php_version,
            theme,
            plugins_count,
            woocommerce_installed,
          },
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', site.id);

      if (error) {
        console.error('Webhook site-info error:', error);
        res.status(500).json({ success: false, error: 'Failed to update site info' });
        return;
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.error('Webhook site-info error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/webhook/orders
 * Bulk sync orders from WordPress plugin.
 */
router.post(
  '/orders',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        res.status(401).json({ success: false, error: 'X-API-Key header missing' });
        return;
      }

      const site = await resolveSiteByApiKey(apiKey);
      if (!site) {
        res.status(404).json({ success: false, error: 'Invalid API key' });
        return;
      }

      const { orders: ordersData } = req.body;
      if (!Array.isArray(ordersData) || ordersData.length === 0) {
        res.status(200).json({ success: true, synced: 0 });
        return;
      }

      // Prepare upsert data
      const upsertData = ordersData.map((order) => ({
        site_id: site.id,
        wp_order_id: order.wp_order_id,
        order_number: order.order_number || String(order.wp_order_id),
        status: order.status || 'pending',
        total: parseFloat(order.total) || 0,
        currency: order.currency || 'EUR',
        customer: order.customer || {},
        items: order.items || [],
        shipping: order.shipping || {},
        notes: order.notes || [],
        created_at: order.date_created || new Date().toISOString(),
        updated_at: order.date_modified || new Date().toISOString(),
      }));

      // Upsert orders - on conflict (site_id, wp_order_id) update all fields
      const { error } = await supabase
        .from('orders')
        .upsert(upsertData, {
          onConflict: 'site_id,wp_order_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Webhook orders sync error:', error);
        res.status(500).json({ success: false, error: 'Failed to sync orders' });
        return;
      }

      // Update last_synced_at
      await supabase
        .from('sites')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', site.id);

      res.status(200).json({ success: true, synced: ordersData.length });
    } catch (err) {
      console.error('Webhook orders sync error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/webhook/products
 * Bulk sync products from WordPress plugin.
 */
router.post(
  '/products',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        res.status(401).json({ success: false, error: 'X-API-Key header missing' });
        return;
      }

      const site = await resolveSiteByApiKey(apiKey);
      if (!site) {
        res.status(404).json({ success: false, error: 'Invalid API key' });
        return;
      }

      const { products: productsData } = req.body;
      if (!Array.isArray(productsData) || productsData.length === 0) {
        res.status(200).json({ success: true, synced: 0 });
        return;
      }

      const upsertData = productsData.map((product) => ({
        site_id: site.id,
        wp_product_id: product.wp_product_id,
        name: product.name || null,
        sku: product.sku || null,
        price: parseFloat(product.price) || 0,
        stock: product.stock ?? null,
        status: product.status || 'publish',
        type: product.type || 'simple',
        created_at: product.date_created || new Date().toISOString(),
        updated_at: product.date_modified || new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('products')
        .upsert(upsertData, {
          onConflict: 'site_id,wp_product_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Webhook products sync error:', error);
        res.status(500).json({ success: false, error: 'Failed to sync products' });
        return;
      }

      await supabase
        .from('sites')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', site.id);

      res.status(200).json({ success: true, synced: productsData.length });
    } catch (err) {
      console.error('Webhook products sync error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/webhook/customers
 * Bulk sync customers from WordPress plugin.
 */
router.post(
  '/customers',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        res.status(401).json({ success: false, error: 'X-API-Key header missing' });
        return;
      }

      const site = await resolveSiteByApiKey(apiKey);
      if (!site) {
        res.status(404).json({ success: false, error: 'Invalid API key' });
        return;
      }

      const { customers: customersData } = req.body;
      if (!Array.isArray(customersData) || customersData.length === 0) {
        res.status(200).json({ success: true, synced: 0 });
        return;
      }

      const upsertData = customersData.map((customer) => ({
        site_id: site.id,
        wp_customer_id: customer.wp_customer_id,
        email: customer.email || null,
        name: customer.name || null,
        total_orders: customer.total_orders || 0,
        total_spent: parseFloat(customer.total_spent) || 0,
        created_at: customer.date_created || new Date().toISOString(),
        updated_at: customer.date_modified || new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('customers')
        .upsert(upsertData, {
          onConflict: 'site_id,wp_customer_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Webhook customers sync error:', error);
        res.status(500).json({ success: false, error: 'Failed to sync customers' });
        return;
      }

      await supabase
        .from('sites')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', site.id);

      res.status(200).json({ success: true, synced: customersData.length });
    } catch (err) {
      console.error('Webhook customers sync error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/webhook/new-order
 * Real-time single new order notification from WordPress plugin.
 */
router.post(
  '/new-order',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        res.status(401).json({ success: false, error: 'X-API-Key header missing' });
        return;
      }

      const site = await resolveSiteByApiKey(apiKey);
      if (!site) {
        res.status(404).json({ success: false, error: 'Invalid API key' });
        return;
      }

      const { order } = req.body;
      if (!order || !order.wp_order_id) {
        res.status(400).json({ success: false, error: 'Invalid order data' });
        return;
      }

      const upsertData = {
        site_id: site.id,
        wp_order_id: order.wp_order_id,
        order_number: order.order_number || String(order.wp_order_id),
        status: order.status || 'pending',
        total: parseFloat(order.total) || 0,
        currency: order.currency || 'EUR',
        customer: order.customer || {},
        items: order.items || [],
        shipping: order.shipping || {},
        notes: order.notes || [],
        created_at: order.date_created || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('orders')
        .upsert(upsertData, {
          onConflict: 'site_id,wp_order_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Webhook new-order error:', error);
        res.status(500).json({ success: false, error: 'Failed to process new order' });
        return;
      }

      // Create a log entry for the new order
      await supabase
        .from('logs')
        .insert({
          site_id: site.id,
          level: 'info',
          message: `New order received: #${upsertData.order_number}`,
          context: { wp_order_id: order.wp_order_id, total: upsertData.total },
        });

      res.status(200).json({ success: true, received: true });
    } catch (err) {
      console.error('Webhook new-order error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
