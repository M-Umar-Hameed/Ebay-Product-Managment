import React, { useState } from 'react';
import ListingsHeading from '../componentsForHome/ListingsHeading';
import EntriesAndSearchBar from '../componentsForHome/EntriesAndSearchBar';
import ListingsTable from '../componentsForHome/ListingsTable';
import PaginationBar from '../componentsForHome/PaginationBar';
import AssignStrategyRule from '../componentsForHome/AssignStrategyRule';

export default function PricingStrategiesPage() {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(10);

  const handleTotalPagesChange = (newTotalPages) => {
    setTotalPages(newTotalPages);
    if (page > newTotalPages) {
      setPage(1);
    }
  };

  return (
    <>
      <ListingsHeading
        title="Pricing Strategy Management"
        subtitle="Manage automated pricing strategies and repricing rules"
      />
      <AssignStrategyRule />
      <EntriesAndSearchBar />
      <ListingsTable
        currentPage={page}
        itemsPerPage={itemsPerPage}
        onTotalPagesChange={handleTotalPagesChange}
      />
      <PaginationBar
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </>
  );
}

