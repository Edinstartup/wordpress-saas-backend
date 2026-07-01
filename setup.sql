-- WordPress SaaS Manager - Database Setup
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Sites table
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  api_key text UNIQUE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'offline')),
  wp_version text,
  php_version text,
  theme text,
  plugins_count int DEFAULT 0,
  woocommerce_installed boolean DEFAULT false,
  site_info jsonb DEFAULT '{}',
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  wp_order_id int NOT NULL,
  order_number text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed')),
  total decimal(10,2) DEFAULT 0,
  currency text DEFAULT 'EUR',
  customer jsonb DEFAULT '{}',
  items jsonb DEFAULT '[]',
  shipping jsonb DEFAULT '{}',
  notes jsonb DEFAULT '[]',
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE(site_id, wp_order_id)
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  wp_product_id int NOT NULL,
  name text,
  sku text,
  price decimal(10,2) DEFAULT 0,
  stock int,
  status text DEFAULT 'publish' CHECK (status IN ('publish', 'draft', 'private', 'pending')),
  type text DEFAULT 'simple' CHECK (type IN ('simple', 'variable', 'grouped', 'external')),
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE(site_id, wp_product_id)
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  wp_customer_id int NOT NULL,
  email text,
  name text,
  total_orders int DEFAULT 0,
  total_spent decimal(10,2) DEFAULT 0,
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE(site_id, wp_customer_id)
);

-- Commands table
CREATE TABLE IF NOT EXISTS commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('update_order_status', 'add_order_note', 'refresh_data', 'sync_products')),
  payload jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  result jsonb,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Logs table
CREATE TABLE IF NOT EXISTS logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error', 'success')),
  message text NOT NULL,
  context jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_api_key ON sites(api_key);
CREATE INDEX IF NOT EXISTS idx_orders_site_id ON orders(site_id);
CREATE INDEX IF NOT EXISTS idx_orders_site_wp_id ON orders(site_id, wp_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_products_site_id ON products(site_id);
CREATE INDEX IF NOT EXISTS idx_products_site_wp_id ON products(site_id, wp_product_id);
CREATE INDEX IF NOT EXISTS idx_customers_site_id ON customers(site_id);
CREATE INDEX IF NOT EXISTS idx_commands_site_id ON commands(site_id);
CREATE INDEX IF NOT EXISTS idx_commands_site_status ON commands(site_id, status);
CREATE INDEX IF NOT EXISTS idx_logs_site_id ON logs(site_id);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY sites_user_isolation ON sites
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY orders_user_isolation ON orders
  FOR ALL USING (
    site_id IN (SELECT id FROM sites WHERE user_id = auth.uid())
  );

CREATE POLICY products_user_isolation ON products
  FOR ALL USING (
    site_id IN (SELECT id FROM sites WHERE user_id = auth.uid())
  );

CREATE POLICY customers_user_isolation ON customers
  FOR ALL USING (
    site_id IN (SELECT id FROM sites WHERE user_id = auth.uid())
  );

CREATE POLICY commands_user_isolation ON commands
  FOR ALL USING (
    site_id IN (SELECT id FROM sites WHERE user_id = auth.uid())
  );

CREATE POLICY logs_user_isolation ON logs
  FOR ALL USING (
    site_id IN (SELECT id FROM sites WHERE user_id = auth.uid())
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
