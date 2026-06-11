-- Additive dashboard role levels for platform/client access separation.
-- Safe for existing rows: no existing enum values are removed or renamed.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT_OWNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT_MANAGER';
