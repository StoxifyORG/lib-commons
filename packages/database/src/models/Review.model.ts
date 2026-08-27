import mongoose, { Schema } from 'mongoose';

const ReviewSchema = new Schema(
  {
    review_id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true },
    user_name: { type: String }, // To avoid joining the Users table just for display name
    analyst_id: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// One user can only review an analyst once
ReviewSchema.index({ user_id: 1, analyst_id: 1 }, { unique: true });
// For fetching analyst's reviews efficiently, newest first
ReviewSchema.index({ analyst_id: 1, created_at: -1 });

export const Review = mongoose.model('Review', ReviewSchema);
