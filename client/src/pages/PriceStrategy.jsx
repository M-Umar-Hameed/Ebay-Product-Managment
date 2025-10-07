import React from 'react';
import { useParams } from 'react-router-dom';
import { useProductStore } from '../store/productStore';
import Form from '../componentsForEditListing/StrategyForm';
import ListingsTable from '../componentsForEditListing/ListingsTable';

export default function PriceStrategy() {
  const { productId } = useParams();
  const { AllProducts, modifyProductsId } = useProductStore();

  const products = Array.isArray(AllProducts) ? AllProducts : [];
  const safeList = Array.isArray(AllProducts) ? AllProducts : [];
  const currentProduct = safeList.find(p => p.productId === productId);
  // Optional: sync store state
  React.useEffect(() => {
    if (currentProduct) {
      modifyProductsId(currentProduct.productId);
    }
  }, [currentProduct]);

  return (
    <>
      {currentProduct ? (
        <>
          <Form product={currentProduct} />
          <ListingsTable />
        </>
      ) : (
        <p>Loading strategy for selected product...</p>
      )}
    </>
  );
}
