import { Router, Response } from 'express';
import { param, body } from 'express-validator';
import { supabase } from '../db/supabase';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthenticatedRequest } from '../types';

const router = Router({ mergeParams: true });

/**
 * Verify that a site belongs to the authenticated user.
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
 * POST /api/sites/:id/command
 * Create a new command for a site (frontend initiates action).
 */
router.post(
  '/',
  authenticateToken,
  validate([
    param('id').isUUID().withMessage('Valid site ID is required'),
    body('action').notEmpty().withMessage('Action is required').isIn([
      'update_order_status', 'add_order_note', 'refresh_data', 'sync_products'
    ]).withMessage('Invalid action'),
    body('payload').optional().isObject().withMessage('Payload must be an object'),
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const siteId = req.params.id as string;
      const { action, payload = {} } = req.body;

      // Verify site ownership
      const site = await verifySiteOwnership(siteId, req.userId!);
      if (!site) {
        res.status(404).json({ success: false, error: 'Site not found' });
        return;
      }

      const { data: command, error } = await supabase
        .from('commands')
        .insert({
          site_id: siteId,
          action,
          payload,
          status: 'pending',
        })
        .select('id, site_id, action, payload, status, created_at')
        .single();

      if (error || !command) {
        console.error('Create command error:', error);
        res.status(500).json({ success: false, error: 'Failed to queue command' });
        return;
      }

      res.status(200).json({
        success: true,
        command_id: command.id,
        status: 'queued',
      });
    } catch (err) {
      console.error('Create command error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/sites/:id/commands
 * Plugin polls this endpoint to get pending commands for a site.
 * Uses API key authentication (not JWT).
 */
router.get(
  '/commands',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Support both API key (from plugin) and JWT (from frontend)
      const apiKey = req.headers['x-api-key'] as string;
      const authHeader = req.headers.authorization;

      let siteId: string;

      if (apiKey) {
        // Plugin authentication via API key
        const { data: site } = await supabase
          .from('sites')
          .select('id')
          .eq('api_key', apiKey)
          .single();

        if (!site) {
          res.status(404).json({ success: false, error: 'Invalid API key' });
          return;
        }
        siteId = site.id;
      } else if (authHeader?.startsWith('Bearer ')) {
        // JWT authentication (for frontend debugging)
        const { verifyToken } = await import('../utils/jwt');
        const payload = verifyToken(authHeader.slice(7));
        const paramSiteId = req.params.id as string;
        
        const site = await verifySiteOwnership(paramSiteId, payload.userId);
        if (!site) {
          res.status(404).json({ success: false, error: 'Site not found' });
          return;
        }
        siteId = paramSiteId;
      } else {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      // Fetch pending commands
      const { data: commands, error } = await supabase
        .from('commands')
        .select('id, action, payload, created_at')
        .eq('site_id', siteId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Get commands error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch commands' });
        return;
      }

      res.status(200).json({
        success: true,
        commands: commands || [],
      });
    } catch (err) {
      console.error('Get commands error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;

/**
 * Standalone router for command acknowledgment (not under /sites/:id)
 * POST /api/commands/:id/ack
 */
export const commandAckRouter = Router();

commandAckRouter.post(
  '/:id/ack',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: commandId } = req.params;
      const apiKey = req.headers['x-api-key'] as string;

      if (!apiKey) {
        res.status(401).json({ success: false, error: 'X-API-Key header missing' });
        return;
      }

      // Verify the command belongs to a site with this API key
      const { data: command } = await supabase
        .from('commands')
        .select('id, site_id, sites!inner(api_key)')
        .eq('id', commandId)
        .single();

      if (!command) {
        res.status(404).json({ success: false, error: 'Command not found' });
        return;
      }

      // Verify API key matches the site
      const { data: site } = await supabase
        .from('sites')
        .select('id')
        .eq('id', command.site_id)
        .eq('api_key', apiKey)
        .single();

      if (!site) {
        res.status(403).json({ success: false, error: 'Invalid API key for this command' });
        return;
      }

      // Mark command as completed
      const { error } = await supabase
        .from('commands')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', commandId);

      if (error) {
        console.error('Ack command error:', error);
        res.status(500).json({ success: false, error: 'Failed to acknowledge command' });
        return;
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.error('Ack command error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);
