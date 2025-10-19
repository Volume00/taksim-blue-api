-- Run this ONCE in your Cloudflare D1 database

-- ROOMS: treat each as a room TYPE (with capacity in total_units)
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  max_guests INTEGER NOT NULL DEFAULT 2,
  price_per_night_try INTEGER NOT NULL, -- store in kuruş (e.g., ₺299.00 => 29900)
  total_units INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- BOOKINGS: one row per PAID/confirmed (or pending) booking
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  start_date TEXT NOT NULL, -- YYYY-MM-DD (inclusive)
  end_date TEXT NOT NULL,   -- YYYY-MM-DD (exclusive)
  guest_name TEXT,
  guest_email TEXT,
  guests_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|paid|cancelled|expired
  stripe_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);

-- HOLDS: temporary inventory holds during Stripe checkout
CREATE TABLE IF NOT EXISTS booking_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  expires_at TEXT NOT NULL, -- datetime
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);

-- Seed your three room TYPES (TRY in kuruş)
INSERT OR IGNORE INTO rooms (name, slug, max_guests, price_per_night_try, total_units, is_active) VALUES
 ('Economy Room','economy',2,150000,2,1),   -- ₺1500.00 per night, 2 units
 ('Deluxe Room','deluxe',3,220000,8,1),     -- ₺2200.00 per night, 8 units
 ('Family Room','family',4,300000,5,1);     -- ₺3000.00 per night, 5 units
