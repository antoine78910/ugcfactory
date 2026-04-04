interface LinkJolt {
  referral: string | null;
  getTrackingInfo(): { trackingCode: string; affiliateId: string; clickId: string } | null;
  isAffiliateVisit(): boolean;
}

interface Window {
  linkjolt?: LinkJolt;
  datafast?: (goal: string, params?: Record<string, string>) => void;
}
