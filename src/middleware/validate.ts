import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';

/**
 * Middleware to check validation results from express-validator.
 * Returns 400 with error details if validation fails.
 */
export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map((e) => ({
        field: e.type === 'field' ? e.path : e.type,
        message: e.msg,
      })),
    });
    return;
  }
  next();
}

/**
 * Helper to apply validation rules with the validateRequest middleware.
 */
export function validate(validations: ValidationChain[]) {
  return [...validations, validateRequest];
}
