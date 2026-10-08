-- ==============================================================================
-- PrintBooth Cloud Gateway — PostgreSQL Relational Schema
-- ==============================================================================

-- 1. Kiosk Device Registry & Cryptographic Identity
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    kiosk_id VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL DEFAULT 'PrintBooth Kiosk',
    public_key VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'PROVISIONING')),
    agent_version VARCHAR(20) DEFAULT '1.0.0',
    printer_name VARCHAR(64) DEFAULT 'auto',
    printer_status VARCHAR(32) DEFAULT 'UNKNOWN',
    printer_online BOOLEAN DEFAULT false,
    paper_level INTEGER DEFAULT 100 CHECK (paper_level >= 0 AND paper_level <= 100),
    toner_level INTEGER DEFAULT 100 CHECK (toner_level >= 0 AND toner_level <= 100),
    cpu_temp_c NUMERIC(4, 1),
    mem_used_pct NUMERIC(4, 1),
    disk_free_gb NUMERIC(6, 1),
    platform VARCHAR(32) DEFAULT 'linux',
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_kiosk_id ON devices(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- 2. One-Time Expiring Device Provisioning Codes
CREATE TABLE IF NOT EXISTS device_provisioning_tokens (
    id SERIAL PRIMARY KEY,
    code VARCHAR(16) UNIQUE NOT NULL,
    kiosk_id VARCHAR(32) NOT NULL,
    is_claimed BOOLEAN DEFAULT false,
    claimed_by_ip VARCHAR(45),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prov_code ON device_provisioning_tokens(code);

-- 3. Device Print Jobs & State Machine Records
CREATE TABLE IF NOT EXISTS device_jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(64) UNIQUE NOT NULL,
    kiosk_id VARCHAR(32) NOT NULL REFERENCES devices(kiosk_id) ON DELETE CASCADE,
    file_id VARCHAR(128) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'QUEUED' CHECK (
        status IN ('QUEUED', 'AUTHORIZED', 'DOWNLOADING', 'DOWNLOADED', 'SUBMITTED', 'PRINTING', 'COMPLETED', 'FAILED', 'CANCELLED')
    ),
    copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 50),
    colour BOOLEAN NOT NULL DEFAULT false,
    duplex BOOLEAN NOT NULL DEFAULT false,
    paper_size VARCHAR(16) NOT NULL DEFAULT 'A4',
    total_pages INTEGER DEFAULT 1,
    printed_pages INTEGER DEFAULT 0,
    download_url TEXT,
    auth_token VARCHAR(256),
    error TEXT,
    spooler_job_id INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_jobs_job_id ON device_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_device_jobs_kiosk_id ON device_jobs(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_device_jobs_status ON device_jobs(status);

-- 4. Device Security & Command Audit Log
CREATE TABLE IF NOT EXISTS device_audit_logs (
    id SERIAL PRIMARY KEY,
    kiosk_id VARCHAR(32) NOT NULL,
    event_type VARCHAR(48) NOT NULL,
    severity VARCHAR(16) DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARN', 'ERROR', 'SECURITY')),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_audit_kiosk ON device_audit_logs(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_device_audit_event ON device_audit_logs(event_type);
