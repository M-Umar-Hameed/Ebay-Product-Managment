// models/ebayListing.js
import mongoose from 'mongoose';

const ebayListingSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  title: { type: String, required: true },
  price: { type: Number, required: true },
  availability: { type: String, required: true },  // "In stock", "Out of stock", etc.
  imageUrl: { type: String, required: true },
  ebayUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const EbayListing = mongoose.model('EbayListing', ebayListingSchema);

export default EbayListing;
