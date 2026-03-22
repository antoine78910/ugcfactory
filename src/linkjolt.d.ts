interface LinkJolt {
  referral: string | null;
  getTrackingInfo(): { trackingCode: string; affiliateId: string; clickId: string } | null;
  isAffiliateVisit(): boolean;
}

interface Window {
  linkjolt?: LinkJolt;
}
