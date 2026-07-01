import { Router, Response } from 'express';
import { param, query } from 'express-validator';
import { supabase } from '../db/supabase';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthenticatedRequest } from '../types';

const router = Router({ mergeParams: true });

router.use(authenticateToken);

/**
 * GET /api/sites/:id/customers
 * List customers for a site with pagination and search.
 * Query params: ?search=&page=&limit=
 */
router.get(
  '/',
  validate([
    param('id').isUUID().withMessage('Valid site ID is required'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('search').optional().isString().trim(),
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: siteId } = req.params;
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const search = req.query.search as string | undefined;

      // Verify site ownership
      const { data: site } = await supabase
        .from('sites')
        .select('id')
        .eq('id', siteId)
        .eq('user_id', req.userId!)
        .single();

      if (!site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      // Build query
      let dbQuery = supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .eq('site_id', siteId);

      // Apply search filter (name or email)
      if (search) {
        const searchTerm = `%${search}%`;
        dbQuery = dbQuery.or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`);
      }

      // Pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: customers, error, count } = await dbQuery
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('List customers error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch customers' });
        return;
      }

      const total = count || 0;

      res.status(200).json({
        success: true,
        customers: customers || [],
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error('List customers error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
