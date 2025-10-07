import ebayApi from "../helper/authEbay";

// Example: Get all inventory items from your eBay store
async function getInventory() {
  const url = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
  const data = await ebayApi({ method: "GET", url });
}

getInventory();
