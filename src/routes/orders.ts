import { Router, Response } from 'express';
import { param, body, query } from 'express-validator';
import { supabase } from '../db/supabase';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthenticatedRequest, OrderNote } from '../types';

const router = Router({ mergeParams: true });

// All order routes require authentication
router.use(authenticateToken);

/**
 * Verify that a site belongs to the authenticated user.
 * Returns the site or sends a 404 response.
 */
async function verifySiteOwnership(siteId: string, userId: string) {
  const { data: site } = await supabase
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single();
  return site;
}

/**
 * GET /api/sites/:id/orders
 * List orders for a site with pagination, status filter, and search.
 * Query params: ?status=&search=&page=&limit=
 */
router.get(
  '/',
  validate([
    param('id').isUUID().withMessage('Valid site ID is required'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('status').optional().isString().trim(),
    query('search').optional().isString().trim(),
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const siteId = req.params.id as string;
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      // Verify ownership
      const site = await verifySiteOwnership(siteId, req.userId!);
      if (!site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      // Build query
      let dbQuery = supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('site_id', siteId);

      // Apply status filter
      if (status) {
        dbQuery = dbQuery.eq('status', status);
      }

      // Apply search (order_number or customer name/email)
      if (search) {
        const searchTerm = `%${search}%`;
        // For JSONB customer search, we use ilike on order_number
        // Customer name/email search requires more complex queries
        dbQuery = dbQuery.or(`order_number.ilike.${searchTerm},customer->>name.ilike.${searchTerm},customer->>email.ilike.${searchTerm}`);
      }

      // Pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: orders, error, count } = await dbQuery
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('List orders error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch orders' });
        return;
      }

      const total = count || 0;

      res.status(200).json({
        success: true,
        orders: orders || [],
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error('List orders error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/sites/:id/orders/:orderId
 * Get a single order with full details.
 */
router.get(
  '/:orderId',
  validate([
    param('id').isUUID().withMessage('Valid site ID is required'),
    param('orderId').isUUID().withMessage('Valid order ID is required'),
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const siteId = req.params.id as string;
      const orderId = req.params.orderId as string;

      // Verify ownership
      const site = await verifySiteOwnership(siteId, req.userId!);
      if (!site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      const { data: order, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('site_id', siteId)
        .single();

      if (error || !order) {
        res.status(404).json({ success: false, error: 'Order not found' });
        return;
      }

      res.status(200).json({ success: true, order });
    } catch (err) {
      console.error('Get order error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/sites/:id/orders/:orderId/status
 * Update order status and queue a command for WordPress.
 */
router.patch(
  '/:orderId/status',
  validate([
    param('id').isUUID().withMessage('Valid site ID is required'),
    param('orderId').isUUID().withMessage('Valid order ID is required'),
    body('status').notEmpty().withMessage('Status is required').isIn([
      'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'
    ]).withMessage('Invalid order status'),
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const siteId = req.params.id as string;
      const orderId = req.params.orderId as string;
      const { status: newStatus } = req.body;

      // Verify ownership
      const site = await verifySiteOwnership(siteId, req.userId!);
      if (!site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      // Get the order to find wp_order_id
      const { data: order } = await supabase
        .from('orders')
        .select('wp_order_id')
        .eq('id', orderId)
        .eq('site_id', siteId)
        .single();

      if (!order) {
        res.status(404).json({ success: false, error: 'Order not found' });
        return;
      }

      // Update order status
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .eq('site_id', siteId)
        .select()
        .single();

      if (updateError || !updatedOrder) {
        console.error('Update order status error:', updateError);
        res.status(500).json({ success: false, error: 'Failed to update order status' });
        return;
      }

      // Create command for WordPress plugin
      const { error: cmdError } = await supabase
        .from('commands')
        .insert({
          site_id: siteId,
          action: 'update_order_status',
          payload: {
            order_id: order.wp_order_id,
            status: newStatus,
          },
          status: 'pending',
        });

      if (cmdError) {
        console.error('Create command error:', cmdError);
        // Don't fail the request, just log it
      }

      res.status(200).json({ success: true, order: updatedOrder });
    } catch (err) {
      console.error('Update order status error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/sites/:id/orders/:orderId/notes
 * Add a note to an order and queue a command for WordPress.
 */
router.post(
  '/:orderId/notes',
  validate([
    param('id').isUUID().withMessage('Valid site ID is required'),
    param('orderId').isUUID().withMessage('Valid order ID is required'),
    body('note').trim().notEmpty().withMessage('Note content is required').isLength({ max: 5000 }).withMessage('Note too long'),
    body('is_customer_note').optional().isBoolean().withMessage('is_customer_note must be boolean'),
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const siteId = req.params.id as string;
      const orderId = req.params.orderId as string;
      const { note, is_customer_note = false } = req.body;

      // Verify ownership
      const site = await verifySiteOwnership(siteId, req.userId!);
      if (!site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      // Get the order
      const { data: order } = await supabase
        .from('orders')
        .select('wp_order_id, notes')
        .eq('id', orderId)
        .eq('site_id', siteId)
        .single();

      if (!order) {
        res.status(404).json({ success: false, error: 'Order not found' });
        return;
      }

      // Create new note
      const newNote: OrderNote = {
        note: note.trim(),
        date: new Date().toISOString(),
        is_customer_note: Boolean(is_customer_note),
      };

      // Append to existing notes
      const existingNotes = (order.notes as OrderNote[]) || [];
      const updatedNotes = [...existingNotes, newNote];

      // Update order
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({ notes: updatedNotes })
        .eq('id', orderId)
        .eq('site_id', siteId)
        .select()
        .single();

      if (updateError || !updatedOrder) {
        console.error('Add order note error:', updateError);
        res.status(500).json({ success: false, error: 'Failed to add note' });
        return;
      }

      // Create command for WordPress plugin
      const { error: cmdError } = await supabase
        .from('commands')
        .insert({
          site_id: siteId,
          action: 'add_order_note',
          payload: {
            order_id: order.wp_order_id,
            note: note.trim(),
            is_customer_note: Boolean(is_customer_note),
          },
          status: 'pending',
        });

      if (cmdError) {
        console.error('Create command error:', cmdError);
        // Don't fail the request, just log it
      }

      res.status(201).json({ success: true, note: newNote, order: updatedOrder });
    } catch (err) {
      console.error('Add order note error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
