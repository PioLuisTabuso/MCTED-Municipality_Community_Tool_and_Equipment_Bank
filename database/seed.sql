-- =====================================================================
-- MCTEB sample data (development/testing only)
-- Run AFTER schema.sql. All people and emails are fictional.
--
-- password_hash is a PLACEHOLDER, so seeded users cannot log in yet.
-- Run:  node database/set-seed-passwords.js
-- to set every seeded account's password to:  Password123!
-- =====================================================================

USE mcteb_db;

-- ---------------------------------------------------------------------
-- users: 1 admin, 1 staff (MDRRMO), 3 residents (one still pending ID check)
-- ---------------------------------------------------------------------
INSERT INTO users
  (user_id, birthday, user_f, user_l, user_m, contact_no, status, house_no, street, brgy,
   email, password_hash, role, id_type, id_image_path, verified_status)
VALUES
  (1, '1990-03-14', 'Ana',   'Reyes',  'Cruz',   '09171234501', 'active', 12, 'Mabini St',   'Poblacion',
   'admin@mcteb.test',  'PLACEHOLDER_RUN_SET_SEED_PASSWORDS', 'admin',    'Voter ID',   'uploads/ids/sample-admin.jpg', 'verified'),
  (2, '1988-07-02', 'Luis',  'Mendoza','Ramos',  '09171234502', 'active', 5,  'Rizal Ave',   'Poblacion',
   'staff@mcteb.test',  'PLACEHOLDER_RUN_SET_SEED_PASSWORDS', 'staff',    'UMID',       'uploads/ids/sample-staff.jpg', 'verified'),
  (3, '1985-11-23', 'Juan',  'Dela Cruz', 'Santos', '09171234503', 'active', 21, 'Sampaguita St', 'San Roque',
   'juan@mcteb.test',   'PLACEHOLDER_RUN_SET_SEED_PASSWORDS', 'resident', 'Driver''s License', 'uploads/ids/sample-juan.jpg', 'verified'),
  (4, '1993-05-30', 'Maria', 'Santos', 'Lopez',  '09171234504', 'active', 8,  'Narra St',    'San Roque',
   'maria@mcteb.test',  'PLACEHOLDER_RUN_SET_SEED_PASSWORDS', 'resident', 'PhilID',     'uploads/ids/sample-maria.jpg', 'verified'),
  (5, '1999-01-17', 'Pedro', 'Garcia', NULL,     '09171234505', 'active', 3,  'Acacia St',   'Bagong Silang',
   'pedro@mcteb.test',  'PLACEHOLDER_RUN_SET_SEED_PASSWORDS', 'resident', 'Voter ID',   'uploads/ids/sample-pedro.jpg', 'pending');

-- ---------------------------------------------------------------------
-- tools (fee = PHP per day)
-- ---------------------------------------------------------------------
INSERT INTO tools
  (tool_id, tool_name, category, description, specifications, quantity, fee,
   availability_status, tool_condition, image_path, owner_id)
VALUES
  (1, 'Cordless Drill',        'Power Tools',  'Cordless drill with two batteries and a drill bit set.', '18V, 13mm chuck, 2 batteries',      1, 75.00,  'available',   'good',         'uploads/tools/drill.jpg',        3),
  (2, 'Aluminum Ladder',       'Hand Tools',   'Foldable ladder for painting and roof repairs.',          '6 ft, supports up to 120 kg',       1, 50.00,  'available',   'good',         'uploads/tools/ladder.jpg',       3),
  (3, 'Pressure Washer',       'Cleaning',     'Electric pressure washer with hose and spray nozzles.',   '1800W, 120 bar',                    1, 200.00, 'rented',      'good',         'uploads/tools/washer.jpg',       4),
  (4, 'Angle Grinder',         'Power Tools',  'Angle grinder with cutting and grinding discs.',          '850W, 115mm disc',                  1, 100.00, 'available',   'good',         'uploads/tools/grinder.jpg',      4),
  (5, 'Wheelbarrow',           'Garden',       'Steel wheelbarrow for hauling soil and materials.',       '65 L tray, pneumatic tire',         2, 40.00,  'available',   'fair',         'uploads/tools/wheelbarrow.jpg',  4),
  (6, 'Grass Trimmer',         'Garden',       'Electric grass trimmer.',                                 '500W, 30cm cutting width',          1, 100.00, 'unavailable', 'needs repair', 'uploads/tools/trimmer.jpg',      3);

-- ---------------------------------------------------------------------
-- receipt: three paid rentals
-- ---------------------------------------------------------------------
INSERT INTO receipt
  (receipt_id, user_id, tool_id, fee, refe_no, pay_stat, pay_method, paid_at)
VALUES
  (1, 4, 1, 150.00, 'PM-20260920-0001', 'paid', 'GCash', '2026-09-20 08:45:00'),
  (2, 4, 6, 200.00, 'PM-20260925-0002', 'paid', 'Maya',  '2026-09-25 09:10:00'),
  (3, 3, 3, 600.00, 'PM-20261006-0003', 'paid', 'GCash', '2026-10-06 08:50:00');

-- ---------------------------------------------------------------------
-- inve_rec: one row per rental status worth testing
--   1 returned in good condition      2 returned damaged + unpaid penalty
--   3 currently active                4 pending request (no receipt yet)
-- ---------------------------------------------------------------------
INSERT INTO inve_rec
  (inverec_id, user_id, receipt_id, tool_id, rental_start, due_date, actual_return_date,
   return_condition, rental_status, penalty_amount, penalty_status)
VALUES
  (1, 4, 1,    1, '2026-09-20 09:00:00', '2026-09-22 17:00:00', '2026-09-22 15:30:00', 'good',    'returned', 0.00,   'none'),
  (2, 4, 2,    6, '2026-09-25 09:30:00', '2026-09-27 17:00:00', '2026-09-27 16:10:00', 'damaged', 'returned', 300.00, 'unpaid'),
  (3, 3, 3,    3, '2026-10-06 09:00:00', '2026-10-09 17:00:00', NULL,                  NULL,      'active',   0.00,   'none'),
  (4, 3, NULL, 4, '2026-10-12 09:00:00', '2026-10-13 17:00:00', NULL,                  NULL,      'requested',0.00,   'none');

-- ---------------------------------------------------------------------
-- feedback_sys
-- ---------------------------------------------------------------------
INSERT INTO feedback_sys
  (feedback_id, user_id, receipt_id, review, rating, submitted_at, status)
VALUES
  (1, 4, 1, 'Drill worked great and the owner was easy to deal with.',     5, '2026-09-22 18:00:00', 'submitted'),
  (2, 4, 2, 'Trimmer string kept jamming, but pickup was smooth.',          3, '2026-09-27 18:30:00', 'submitted');

-- ---------------------------------------------------------------------
-- complaints
-- ---------------------------------------------------------------------
INSERT INTO complaints
  (complaint_id, user_id, receipt_id, description, media_path, status, submitted_at)
VALUES
  (1, 3, 3, 'Pressure washer hose leaks at the connector.', 'uploads/complaints/sample-leak.jpg', 'open', '2026-10-06 10:15:00');
