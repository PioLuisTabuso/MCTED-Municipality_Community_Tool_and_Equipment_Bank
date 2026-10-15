-- =====================================================================
-- MCTEB - Municipal Community Tool & Equipment Bank
-- PROVISIONAL schema (based on the Lucid-revised ERD)
-- Target: MySQL 8.0.16+ or MariaDB 10.2+ (needed so CHECK constraints are enforced)
--
-- NOTE: the DROP TABLE block below is for DEVELOPMENT ONLY. Re-running
-- this file wipes all data. Remove it before any real deployment.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS mcteb_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mcteb_db;

-- ---------------------------------------------------------------------
-- Development reset (children first, then parents)
-- ---------------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS info_update_requests;
DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS feedback_sys;
DROP TABLE IF EXISTS inve_rec;
DROP TABLE IF EXISTS receipt;
DROP TABLE IF EXISTS tools;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- users
-- age was removed from the ERD: compute it from birthday in the app.
-- Minimum-age (18+) check is enforced in the application, not here.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id         INT           NOT NULL AUTO_INCREMENT,
  birthday        DATE          NOT NULL,
  user_f          VARCHAR(100)  NOT NULL,            -- first name
  user_l          VARCHAR(100)  NOT NULL,            -- last name
  user_m          VARCHAR(100)  NULL,                -- middle name
  contact_no      VARCHAR(15)   NOT NULL,            -- varchar so leading 0 / + are kept
  status          VARCHAR(15)   NOT NULL DEFAULT 'active',
  house_no        INT           NULL,
  street          VARCHAR(50)   NULL,
  brgy            VARCHAR(50)   NOT NULL,
  email           VARCHAR(100)  NOT NULL,
  password_hash   VARCHAR(255)  NOT NULL,            -- bcrypt hash, never plain text
  role            VARCHAR(20)   NOT NULL DEFAULT 'resident',
  id_type         VARCHAR(30)   NULL,
  id_image_path   VARCHAR(255)  NULL,
  verified_status VARCHAR(15)   NOT NULL DEFAULT 'pending',
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT chk_users_status   CHECK (status IN ('active', 'suspended')),
  CONSTRAINT chk_users_role     CHECK (role IN ('resident', 'staff', 'admin')),
  CONSTRAINT chk_users_verified CHECK (verified_status IN ('pending', 'verified', 'rejected'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- tools
-- `condition` from the ERD is a RESERVED WORD in MySQL, so it is named
-- tool_condition here. Update the ERD to match.
-- fee = rental fee PER DAY in PHP (assumption - confirm with the group).
-- ---------------------------------------------------------------------
CREATE TABLE tools (
  tool_id             INT           NOT NULL AUTO_INCREMENT,
  tool_name           VARCHAR(100)  NOT NULL,
  category            VARCHAR(50)   NOT NULL,
  description         VARCHAR(255)  NULL,
  specifications      VARCHAR(255)  NULL,
  quantity            INT           NOT NULL DEFAULT 1,
  fee                 DECIMAL(10,2) NOT NULL,
  availability_status VARCHAR(30)   NOT NULL DEFAULT 'available',
  tool_condition      VARCHAR(50)   NOT NULL DEFAULT 'good',
  image_path          VARCHAR(255)  NULL,
  owner_id            INT           NOT NULL,
  PRIMARY KEY (tool_id),
  KEY idx_tools_category (category),
  KEY idx_tools_availability (availability_status),
  CONSTRAINT fk_tools_owner FOREIGN KEY (owner_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_tools_quantity CHECK (quantity >= 0),
  CONSTRAINT chk_tools_fee      CHECK (fee >= 0),
  CONSTRAINT chk_tools_avail    CHECK (availability_status IN ('available', 'rented', 'unavailable'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- receipt  (payment record; created when the renter pays)
-- user_id = the renter who paid.
-- ---------------------------------------------------------------------
CREATE TABLE receipt (
  receipt_id  INT           NOT NULL AUTO_INCREMENT,
  user_id     INT           NOT NULL,
  tool_id     INT           NOT NULL,
  fee         DECIMAL(10,2) NOT NULL,               -- amount at the time of rental
  refe_no     VARCHAR(50)   NULL,                   -- payment gateway reference number
  pay_stat    VARCHAR(20)   NOT NULL DEFAULT 'pending',
  pay_method  VARCHAR(30)   NULL,
  paid_at     DATETIME      NULL,
  PRIMARY KEY (receipt_id),
  UNIQUE KEY uq_receipt_refe_no (refe_no),
  CONSTRAINT fk_receipt_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_receipt_tool FOREIGN KEY (tool_id)
    REFERENCES tools (tool_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_receipt_fee  CHECK (fee >= 0),
  CONSTRAINT chk_receipt_stat CHECK (pay_stat IN ('pending', 'paid', 'failed', 'refunded'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- inve_rec  (inventory / rental record)
-- Created when the renter SENDS a request (rental_status = 'requested').
-- receipt_id stays NULL until the owner approves and the renter pays,
-- which is why the ERD shows receipt 1 -> 0..1 inve_rec.
-- rental_status flow: requested -> approved -> active -> returned
--                     (or requested -> declined / cancelled)
-- ---------------------------------------------------------------------
CREATE TABLE inve_rec (
  inverec_id         INT           NOT NULL AUTO_INCREMENT,
  user_id            INT           NOT NULL,        -- renter
  receipt_id         INT           NULL,
  tool_id            INT           NOT NULL,
  rental_start       DATETIME      NOT NULL,
  due_date           DATETIME      NOT NULL,
  actual_return_date DATETIME      NULL,
  return_condition   VARCHAR(50)   NULL,
  rental_status      VARCHAR(20)   NOT NULL DEFAULT 'requested',
  penalty_amount     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  penalty_status     VARCHAR(20)   NOT NULL DEFAULT 'none',
  PRIMARY KEY (inverec_id),
  UNIQUE KEY uq_inve_rec_receipt (receipt_id),
  KEY idx_inve_rec_status (rental_status),
  CONSTRAINT fk_inve_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_inve_receipt FOREIGN KEY (receipt_id)
    REFERENCES receipt (receipt_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_inve_tool FOREIGN KEY (tool_id)
    REFERENCES tools (tool_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_inve_period  CHECK (due_date > rental_start),
  CONSTRAINT chk_inve_status  CHECK (rental_status IN
    ('requested', 'approved', 'declined', 'cancelled', 'active', 'returned')),
  CONSTRAINT chk_inve_penalty CHECK (penalty_amount >= 0),
  CONSTRAINT chk_inve_pen_stat CHECK (penalty_status IN ('none', 'unpaid', 'paid', 'waived'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- feedback_sys  (ratings/reviews tied to a completed rental)
-- ---------------------------------------------------------------------
CREATE TABLE feedback_sys (
  feedback_id  INT          NOT NULL AUTO_INCREMENT,
  user_id      INT          NOT NULL,
  receipt_id   INT          NOT NULL,
  review       VARCHAR(255) NULL,
  rating       INT          NOT NULL,
  submitted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status       VARCHAR(20)  NOT NULL DEFAULT 'submitted',
  PRIMARY KEY (feedback_id),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_feedback_receipt FOREIGN KEY (receipt_id)
    REFERENCES receipt (receipt_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_feedback_status CHECK (status IN ('submitted', 'reviewed', 'hidden'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- complaints  (defective tool reports, with photo/video path)
-- ---------------------------------------------------------------------
CREATE TABLE complaints (
  complaint_id INT          NOT NULL AUTO_INCREMENT,
  user_id      INT          NOT NULL,               -- reporter
  receipt_id   INT          NOT NULL,
  description  VARCHAR(255) NOT NULL,
  media_path   VARCHAR(255) NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'open',
  submitted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (complaint_id),
  CONSTRAINT fk_complaints_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_complaints_receipt FOREIGN KEY (receipt_id)
    REFERENCES receipt (receipt_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_complaints_status CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- info_update_requests  (resident requests correction of profile data)
-- ---------------------------------------------------------------------
CREATE TABLE info_update_requests (
  request_id       INT          NOT NULL AUTO_INCREMENT,
  user_id          INT          NOT NULL,
  field_name       VARCHAR(50)  NOT NULL,
  requested_value  VARCHAR(255) NOT NULL,
  reason           VARCHAR(255) NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(255) NULL,
  reviewed_by      INT          NULL,
  reviewed_at      DATETIME     NULL,
  submitted_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id),
  KEY idx_info_status (status),
  CONSTRAINT fk_info_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_info_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_info_status CHECK (status IN ('pending', 'approved', 'rejected'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- notifications  (in-app notification alerts for rentals & activities)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  notification_id  INT          NOT NULL AUTO_INCREMENT,
  user_id          INT          NOT NULL,
  type             VARCHAR(50)  NOT NULL,
  message          VARCHAR(255) NOT NULL,
  ref_id           INT          NULL,
  is_read          TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  KEY idx_notif_user_read (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

