// @shopscale/backend/engagement - Coupons, reviews, wishlists
export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number; // percent (0-100) or cents
  minOrderCents: number | null;
  maxUses: number | null;
  perUserLimit: number;
  usedCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  status: 'active' | 'expired' | 'disabled';
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  userId: string;
  orderId: string;
  discountCents: number;
  createdAt: Date;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  orderId: string;
  rating: number; // 1-5
  body: string;
  status: 'published' | 'hidden';
  createdAt: Date;
}

export interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  variantId: string | null;
  createdAt: Date;
}

export interface EngagementPorts {
  validateCoupon(code: string, userId: string, orderTotalCents: number): Promise<{ valid: boolean; discountCents: number; coupon?: Coupon }>;
  redeemCoupon(couponId: string, userId: string, orderId: string, discountCents: number): Promise<void>;
  createReview(data: { productId: string; userId: string; orderId: string; rating: number; body: string }): Promise<Review>;
  findReviewsByProduct(productId: string, options: { cursor?: string; limit: number }): Promise<{ items: Review[]; nextCursor: string | null }>;
  addToWishlist(data: { userId: string; productId: string; variantId?: string }): Promise<WishlistItem>;
  removeFromWishlist(userId: string, productId: string): Promise<void>;
  findWishlist(userId: string): Promise<WishlistItem[]>;
}

export const engagementPorts: EngagementPorts = {
  async validateCoupon() { return { valid: false, discountCents: 0 }; },
  async redeemCoupon() { throw new Error('Not implemented'); },
  async createReview() { throw new Error('Not implemented'); },
  async findReviewsByProduct() { return { items: [], nextCursor: null }; },
  async addToWishlist() { throw new Error('Not implemented'); },
  async removeFromWishlist() { throw new Error('Not implemented'); },
  async findWishlist() { return []; },
};