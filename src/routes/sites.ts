import { Router, Response } from 'express';
import { body, param } from 'express-validator';
import { supabase } from '../db/supabase';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { generateApiKey } from '../utils/apiKey';
import { AuthenticatedRequest } from '../types';

const router = Router({ mergeParams: true });

// All site routes require authentication
router.use(authenticateToken);

/**
 * GET /api/sites
 * List all sites belonging to the authenticated user.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: sites, error } = await supabase
      .from('sites')
      .select('id, name, url, api_key, status, wp_version, php_version, theme, plugins_count, woocommerce_installed, last_synced_at, created_at, updated_at')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('List sites error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch sites' });
      return;
    }

    res.status(200).json({ success: true, sites: sites || [] });
  } catch (err) {
    console.error('List sites error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/sites
 * Create a new site and generate an API key.
 */
router.post(
  '/',
  validate([
    body('name').trim().notEmpty().withMessage('Site name is required').isLength({ max: 255 }).withMessage('Name too long'),
    body('url').trim().notEmpty().withMessage('Site URL is required').isURL().withMessage('Valid URL is required'),
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, url } = req.body;

      // Generate unique API key
      let apiKey = generateApiKey();
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (!isUnique && attempts < maxAttempts) {
        const { data: existing } = await supabase
          .from('sites')
          .select('id')
          .eq('api_key', apiKey)
          .single();

        if (!existing) {
          isUnique = true;
        } else {
          apiKey = generateApiKey();
          attempts++;
        }
      }

      if (!isUnique) {
        res.status(500).json({ success: false, error: 'Failed to generate unique API key. Please try again.' });
        return;
      }

      const { data: site, error } = await supabase
        .from('sites')
        .insert({
          user_id: req.userId!,
          name: name.trim(),
          url: url.trim(),
          api_key: apiKey,
          status: 'pending',
        })
        .select('id, name, url, api_key, status, created_at')
        .single();

      if (error || !site) {
        console.error('Create site error:', error);
        res.status(500).json({ success: false, error: 'Failed to create site' });
        return;
      }

      res.status(201).json({ success: true, site });
    } catch (err) {
      console.error('Create site error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/sites/:id
 * Get a single site by ID (must belong to current user).
 */
router.get(
  '/:id',
  validate([param('id').isUUID().withMessage('Valid site ID is required')]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const { data: site, error } = await supabase
        .from('sites')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.userId!)
        .single();

      if (error || !site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      res.status(200).json({ success: true, site });
    } catch (err) {
      console.error('Get site error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/sites/:id
 * Delete a site and all related data.
 */
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Valid site ID is required')]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Verify site belongs to user
      const { data: site } = await supabase
        .from('sites')
        .select('id')
        .eq('id', id)
        .eq('user_id', req.userId!)
        .single();

      if (!site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      const { error } = await supabase
        .from('sites')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete site error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete site' });
        return;
      }

      res.status(204).send();
    } catch (err) {
      console.error('Delete site error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/sites/:id/overview
 * Get site overview with stats (order count, product count, customer count, recent orders).
 */
router.get(
  '/:id/overview',
  validate([param('id').isUUID().withMessage('Valid site ID is required')]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Verify site belongs to user
      const { data: site, error: siteError } = await supabase
        .from('sites')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.userId!)
        .single();

      if (siteError || !site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      // Get counts in parallel
      const [
        { count: totalOrders, error: ordersError },
        { count: totalProducts, error: productsError },
        { count: totalCustomers, error: customersError },
        { data: recentOrders, error: recentOrdersError },
      ] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('site_id', id),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('site_id', id),
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('site_id', id),
        supabase
          .from('orders')
          .select('id, wp_order_id, order_number, status, total, currency, customer, created_at')
          .eq('site_id', id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (ordersError || productsError || customersError || recentOrdersError) {
        console.error('Stats query error:', { ordersError, productsError, customersError, recentOrdersError });
      }

      res.status(200).json({
        success: true,
        site,
        stats: {
          total_orders: totalOrders || 0,
          total_products: totalProducts || 0,
          total_customers: totalCustomers || 0,
          recent_orders: recentOrders || [],
        },
      });
    } catch (err) {
      console.error('Get site overview error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
