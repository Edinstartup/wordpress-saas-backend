import { Request } from 'express';

// Database entity types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface Site {
  id: string;
  user_id: string;
  name: string;
  url: string;
  api_key: string;
  status: 'pending' | 'connected' | 'offline';
  wp_version: string | null;
  php_version: string | null;
  theme: string | null;
  plugins_count: number;
  woocommerce_installed: boolean;
  site_info: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  site_id: string;
  wp_order_id: number;
  order_number: string | null;
  status: string;
  total: number;
  currency: string;
  customer: OrderCustomer;
  items: OrderItem[];
  shipping: OrderShipping;
  notes: OrderNote[];
  created_at: string | null;
  updated_at: string | null;
}

export interface OrderCustomer {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface OrderItem {
  product_name: string;
  quantity: number;
  price: number;
  total: number;
  sku?: string;
}

export interface OrderShipping {
  method?: string;
  cost?: number;
  address?: string;
}

export interface OrderNote {
  note: string;
  date: string;
  is_customer_note: boolean;
}

export interface Product {
  id: string;
  site_id: string;
  wp_product_id: number;
  name: string | null;
  sku: string | null;
  price: number;
  stock: number | null;
  status: string;
  type: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface Customer {
  id: string;
  site_id: string;
  wp_customer_id: number;
  email: string | null;
  name: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface Command {
  id: string;
  site_id: string;
  action: 'update_order_status' | 'add_order_note' | 'refresh_data' | 'sync_products';
  payload: Record<string, unknown>;
  status: 'pending' | 'completed' | 'failed';
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface LogEntry {
  id: string;
  site_id: string | null;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  context: Record<string, unknown> | null;
  created_at: string;
}

// API types
export interface AuthenticatedRequest extends Request {
  userId?: string;
  site?: Site;
}

export interface JWTPayload {
  userId: string;
  iat: number;
  exp: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Webhook payload types
export interface WebhookSiteInfoPayload {
  api_key: string;
  wp_version: string;
  php_version: string;
  theme: string;
  plugins_count: number;
  woocommerce_installed: boolean;
  site_url: string;
  site_name: string;
  active_plugins: string[];
}

export interface WebhookOrderPayload {
  api_key: string;
  orders: Array<{
    wp_order_id: number;
    order_number: string;
    status: string;
    total: string;
    currency: string;
    customer: OrderCustomer;
    items: OrderItem[];
    shipping: OrderShipping;
    notes?: OrderNote[];
    date_created: string;
    date_modified?: string;
  }>;
}

export interface WebhookProductPayload {
  api_key: string;
  products: Array<{
    wp_product_id: number;
    name: string;
    sku: string;
    price: string;
    stock: number | null;
    status: string;
    type: string;
    date_created: string;
    date_modified?: string;
  }>;
}

export interface WebhookCustomerPayload {
  api_key: string;
  customers: Array<{
    wp_customer_id: number;
    email: string;
    name: string;
    total_orders: number;
    total_spent: string;
    date_created: string;
    date_modified?: string;
  }>;
}

export interface WebhookNewOrderPayload {
  api_key: string;
  order: {
    wp_order_id: number;
    order_number: string;
    status: string;
    total: string;
    currency: string;
    customer: OrderCustomer;
    items: OrderItem[];
    shipping: OrderShipping;
    notes?: OrderNote[];
    date_created: string;
  };
}

export interface CommandPayload {
  action: Command['action'];
  payload: Record<string, unknown>;
}
