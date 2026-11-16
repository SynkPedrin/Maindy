-- Allow the native macOS app (apps/desktop) to register as a device.
alter table maindy.devices drop constraint if exists devices_platform_check;
alter table maindy.devices add constraint devices_platform_check check (platform in ('ios', 'android', 'web', 'macos'));
