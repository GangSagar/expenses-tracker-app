const WHITELISTED_PACKAGES = new Set([
  'com.google.android.apps.nbu.paisa', // Google Pay
  'net.one97.paytm', // Paytm
  'com.phonepe.app', // PhonePe
  'in.amazon.mShop.android.shopping', // Amazon Pay
  'com.whatsapp', // WhatsApp Pay
]);

export function isWhitelistedApp(packageName: string): boolean {
  return WHITELISTED_PACKAGES.has(packageName);
}

export function addWhitelistedApp(packageName: string): void {
  WHITELISTED_PACKAGES.add(packageName);
}

export function removeWhitelistedApp(packageName: string): void {
  WHITELISTED_PACKAGES.delete(packageName);
}

export function getWhitelistedApps(): string[] {
  return Array.from(WHITELISTED_PACKAGES);
}
