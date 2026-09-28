import { Quote } from "lucide-react";
import { StarRating } from "@/components/StarRating";
import type { CustomerReview } from "@shared/schema";

interface ReviewsSectionProps {
  reviews: CustomerReview[];
  title?: string;
  subtitle?: string;
  showAggregateRating?: boolean;
  maxReviews?: number;
  className?: string;
}

export function ReviewsSection({
  reviews,
  title = "What Our Customers Say",
  subtitle = "Testimonials",
  showAggregateRating = true,
  maxReviews = 6,
  className = "",
}: ReviewsSectionProps) {
  if (reviews.length === 0) {
    return null;
  }

  const avgRating = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length;
  const displayReviews = reviews.slice(0, maxReviews);

  return (
    <div className={`bg-[#e8f4fa] border-y border-[#b8ddef]/30 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-32">
        <div className="text-center mb-16">
          <div className="inline-block mb-4">
            <span className="text-sm uppercase tracking-wider text-[#00B8D4]">{subtitle}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a2a3a] mb-6">{title}</h2>
          
          {showAggregateRating && (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <StarRating rating={Math.round(avgRating)} />
              <span className="text-[#1a3a4a]/80 ml-2">
                {avgRating.toFixed(1)} out of 5 ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayReviews.map((review) => (
            <div
              key={review.id}
              className="bg-white rounded-xl p-6 sm:p-8 hover-elevate relative border border-[#b8ddef]/30 shadow-sm"
              data-testid={`review-card-${review.id}`}
            >
              <Quote className="absolute top-6 right-6 h-8 w-8 text-[#00B8D4]/15" />
              <div className="mb-6">
                <StarRating rating={Number(review.rating) || 5} />
              </div>
              <p className="text-[#1a3a4a] text-base leading-relaxed mb-6 italic">
                "{review.testimonial}"
              </p>
              <div className="pt-4 border-t border-[#b8ddef]/20">
                <p className="text-[#0a2a3a] font-semibold" data-testid={`review-name-${review.id}`}>
                  {review.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
